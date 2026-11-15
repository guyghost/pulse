# Performances de lancement et chargement de page — Modèle (source de vérité)

Ce document constitue la **spécification de référence** pour les performances de
lancement du side panel et de navigation entre les pages. Il définit les phases
mesurables, les événements marquant les transitions entre elles, le budget par
phase, les invariants et le **protocole de mesure reproductible** utilisé pour
vérifier chaque modification.

Règle : _« Si le comportement ne peut pas être modélisé, il n'est pas prêt à être
implémenté. »_ Il n'y a **aucun LLM** dans ce flux. La performance est une
fonction pure de la taille des assets, du coût de parsing/compilation et de
l'ordre d'exécution — entièrement déterministe et mesurable.

## 1. Pourquoi un modèle

La cible <50 ms/page n'a de sens que par rapport à une **définition précise de
"chargé"**. Un side panel présente trois moments distincts visibles par
l'utilisateur, chacun ayant une structure de coût différente et un plafond de
faisabilité différent. Optimiser sans nommer le moment produit des chiffres qui
ne sont pas comparables d'une exécution à l'autre.

Le modèle associe chaque moment à un **repère de performance (performance mark)**
afin que les mesures soient reproductibles et comparables.

## 2. Périmètre

S'applique à la surface du **side panel** (`src/sidepanel/index.html`), qui est
le seul document visible par l'utilisateur. Le service worker
(`src/background/index.ts`) dispose de son propre budget de démarrage (Section 7)
mais n'est pas « chargé » par l'utilisateur — il est instancié de manière
préemptive par Chrome.

Pages concernées (selon `app-navigation.svelte.ts`) :
`feed · profile · cv · applications · tjm · settings · onboarding`

## 3. Phases de lancement (états)

Le chargement du side panel est une séquence stricte. Chaque ligne représente un
**état** avec un repère d'entrée et un repère de sortie. « Chargé » est défini
par phase.

| #   | Phase               | Repère d'entrée   | Repère de sortie                         | Ce que l'utilisateur voit             |
| --- | ------------------- | ----------------- | ---------------------------------------- | ------------------------------------- |
| 0   | `shell-painted`     | `navigationStart` | `mp:shell` (script inline dans `<head>`) | Carte squelette, sourcil de marque    |
| 1   | `css-ready`         | `mp:shell`        | first paint du body thématisé            | Fond thématisé                        |
| 2   | `app-mounted`       | `mp:shell`        | `mp:app-mounted`                         | Barre de nav + shell de page (vide)   |
| 3   | `page-chunk-loaded` | `mp:app-mounted`  | `mp:page:<id>`                           | Composant de page monté               |
| 4   | `page-data-ready`   | `mp:page:<id>`    | `mp:page:<id>:data`                      | Page hydratée avec les vraies données |

**Définition de « chargement de page <50 ms »** = phases 0→3 (shell → app-mounted →
chunk de page chargé et monté). La phase 4 (`:data`) est **hors périmètre** du
budget de 50 ms car elle dépend d'I/O asynchrones (lectures IndexedDB, scoring)
dont la latence est bornée par le stockage, non par le code que nous contrôlons.
La phase 4 a son propre budget (Section 6).

## 4. Événements (transitions)

Les événements sont émis par le runtime, pas par le LLM. Chaque événement fait
avancer la machine de phases. L'orchestrateur (`sidepanel/main.ts`) est l'unique
émetteur.

```
States:  shell-painted · css-ready · app-mounted · page-chunk-loaded · page-data-ready
Events:  CSS_READY · APP_MOUNTED · PAGE_CHUNK_LOADED(id) · PAGE_DATA_READY(id)
```

| Depuis            | Événement             | Vers              | Émis par                                |
| ----------------- | --------------------- | ----------------- | --------------------------------------- |
| shell-painted     | CSS_READY             | css-ready         | browser first paint                     |
| css-ready         | APP_MOUNTED           | app-mounted       | callback de `mount(App)`                |
| app-mounted       | PAGE_CHUNK_LOADED(id) | page-chunk-loaded | résolution du `import()` dynamique      |
| page-chunk-loaded | PAGE_DATA_READY(id)   | page-data-ready   | $effect de données de la page stabilisé |

Les transitions sont **monotones** : l'indice de phase ne fait qu'augmenter au
cours d'un même chargement. Un `NAVIGATE` depuis `app-mounted` démarre un nouveau
cycle `page-chunk-loaded` pour l'identifiant de page cible ; il ne fait PAS
régresser `app-mounted`.

## 5. Budgets de performance (extension Chrome, assets locaux)

Dans une extension Chrome, tous les assets sont servis depuis `chrome-extension://`
(aucun réseau). Le coût correspond à parsing + compilation + exécution. Les
budgets ci-dessous correspondent au **p95 sur la machine de référence**, mesuré
en mode headless selon le protocole de la Section 8.

| Phase                          | Budget | Coût actuel (proxy)      | Faisable <50 ms ?   |
| ------------------------------ | ------ | ------------------------ | ------------------- |
| 0 shell-painted                | ≤ 16   | ~5 (HTML/CSS inline)     | ✅ oui              |
| 1 css-ready                    | ≤ 20   | ~10 (11,72 ko gzip CSS)  | ✅ oui              |
| 2 app-mounted                  | ≤ 50   | 30–70 (39,64 ko gzip JS) | ⚠️ limite           |
| 3 page-chunk-loaded (navigate) | ≤ 50   | 10–40 par chunk de page  | ✅ oui (la plupart) |
| 4 page-data-ready              | ≤ 300  | borné par les I/O async  | n/a (séparé)        |

**Composite « ouvrir le panel → feed monté » = phases 0+1+2+3(feed).** La cible
≤ 50 ms n'est réalisable QUE SI le JS sur le chemin critique (phase 2) est réduit
et que le chunk du feed est préchargé pour que la phase 3(feed) chevauche la
phase 2.

Les chunks de page les plus lourds (octets bruts, avant optimisation) :

| Page         | B bruts | ko gzip | Note                           |
| ------------ | ------- | ------- | ------------------------------ |
| FeedPage     | 85 546  | 27,16   | Page initiale ; la plus lourde |
| SettingsPage | 59 014  | 15,28   | Lazy ; ok                      |
| CvPage       | 27 844  | 8,52    | Verrouillée premium            |
| Applications | 27 359  | 8,61    | Verrouillée premium            |
| TJMPage      | 22 832  | 7,40    | Verrouillée premium            |

## 6. Invariants

1. **Aucun LLM sur le chemin critique.** Le scoring Gemini Nano n'intervient
   qu'en phase 4 et ne bloque jamais le rendu (paint).
2. **Repères toujours émis** — `mp:shell`, `mp:app-mounted`, `mp:page:<id>`,
   `mp:page:<id>:data` doivent exister dans `performance.getEntriesByType('mark')`
   après chargement, en DEV comme en PROD.
3. **Le shell est du HTML statique.** Le squelette ne doit jamais dépendre de JS.
   Si JS échoue, le shell reste visible (dégradation gracieuse).
4. **Les phases sont monotones** lors d'un même chargement (Section 4).
5. **La navigation ne retélécharge jamais le chunk principal.** Seul le chunk
   de la page bouge.
6. **Une régression de budget fait échouer la CI.** Le harnais de mesure valide
   que la phase 3 ≤ 50 ms par page ; une régression constitue un échec de build,
   pas un avertissement.

## 7. Budget de démarrage du service worker (hors périmètre chargement de page)

Le service worker démarre indépendamment et doit atteindre l'état « message-ready »
en moins de **500 ms** (démarrage à froid). Ceci est vérifié séparément et ne
compte PAS dans le budget de 50 ms du side panel. Suivi ici pour exhaustivité.

## 8. Protocole de mesure reproductible

Pour rendre les exécutions comparables, chaque mesure utilise les **mêmes**
conditions :

- **Build** : `pnpm build` (production, minifié, tree-shaké). Jamais dev.
- **Serveur** : `vite preview` (sert `dist/`), ou chargement direct
  `chrome-extension://` via Playwright `--load-extension`.
- **Navigateur** : Chromium headless, `--disable-extensions-except`, CPU throttling
  DÉSACTIVÉ (base de référence de la machine de référence), à chaud après 1
  exécution préliminaire écartée.
- **Stub Chrome** : un stub minimal `chrome.*` injecté via `addInitScript` afin
  que le chemin de bootstrap ne se bloque pas sur des API manquantes. Même stub
  à chaque run.
- **Itérations** : 10 navigations à froid par page (contexte recréé à chaque
  fois), rapporter **médiane + p95**, écarter le premier run.
- **Repères lus** : `performance.getEntriesByName('mp:page:<id>')` moins
  `navigationStart`.

Le harnais réside dans `tests/e2e/performance/page-load.test.ts` et produit un
rapport JSON écrit dans `output/perf-report.json` pour la comparaison avant/après.

## 9. Ce qui n'est PAS mesuré ici

- Interactions runtime après chargement (défilement, recherche, filtrage) —
  couvertes par `tests/e2e/performance/virtual-list.test.ts`.
- Débit de scan du service worker — couvert par les tests unitaires du scanner.
- LCP/CLS des surfaces marketing — N/A (il s'agit d'une surface produit).

## 10. Décisions d'optimisation (source de vérité pour l'implémentation)

Le composite « ouvrir le panel → feed monté » (phases 0+1+2+3) doit être ≤ 50 ms.
Référence initiale (build v0.2.2, profil chaud, médiane de 8) : `appMounted ≈ 68 ms`,
`feed cold ≈ 73 ms`. Tous deux dépassent 50 ms. Cause racine isolée à travers
**trois expérimentations** et consignée ici comme un invariant — elle contraint
tous les travaux futurs.

### 10.1 Cause racine — plancher de compilation à froid V8 (prouvé)

Un repère diagnostique `mp:main-start` (déclenché après l'évaluation de tous les
imports statiques) est apparu à **63 ms** ; `mp:app-mounted` à **67 ms**.
L'exécution du montage ne prend que **~3 ms**. **95 % du temps de démarrage est
consacré au parse/compile/eval de V8**, non au montage Svelte. Cela a été
confirmé par trois expérimentations indépendantes de découpage en chunks :

| Expérimentation                                   | appMounted | Verdict                                                                                                  |
| ------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| Import statique de `App`, un seul chunk de 114 ko | 68,0 ms    | référence initiale                                                                                       |
| Dynamic `import(App)`                             | 73,9 ms    | **pire** (séquentiel : le point d'entrée doit finir de compiler avant que l'import dynamique ne démarre) |
| Découpage `manualChunks` + `modulepreload`        | 68,2 ms    | neutre (V8 compile en parallèle via streaming mais le temps CPU total de compilation reste inchangé)     |

Au taux de compilation mesuré de **~0,55 ms/ko brut**, 114 ko ≈ 63 ms. Pour
atteindre le budget de compilation de 47 ms (50 ms − 3 ms de montage), le JS du
chemin critique devrait être réduit à **~85 ko bruts** — soit une coupe de 25 %
du graphe effectif de l'application (runtime Svelte + template + organismes +
stores d'état + transitions). Cela implique de retirer des fonctionnalités du
premier rendu ou de changer d'architecture ; déplacer des octets ne change rien.

**Invariant :** pour cette SPA s'exécutant sous MV3, chaque ouverture du side panel
compile à froid l'intégralité du graphe de l'application. Le cache de code compilé
de V8 ne **chauffe pas** d'une ouverture à l'autre des documents
`chrome-extension://` (à chaud ≈ à froid), il n'y a donc aucun gain en régime de
croisière.

### 10.2 La navigation inter-pages est déjà gratuite (prouvé)

`App.svelte::loadPage` protège chaque page avec `if (page === X && !XPage)`. Avec
`premium_enabled`, l'effet de préchargement au démarrage importe **chaque** chunk
de page à 80 ms. Dès que `XPage` est défini, naviguer vers X appelle à nouveau
`import()` mais `!XPage` est faux → l'import est **entièrement ignoré** ; le
composant est déjà en mémoire. Le coût de navigation est donc de **~0 ms**
(simple permutation de référence de composant), largement sous le budget de
50 ms pour chaque page. L'objectif de 50 ms n'est en risque **que** lors du
démarrage à froid initial (feed).

### 10.3 Optimisations appliquées (livrées)

1. **Conformité CSP (bloquant pour le lancement)** — externalisation des blocs
   `<script>` inline dans `shell-boot.ts`. Le `script-src 'self'` de MV3 les
   ignorait silencieusement ; le repère de performance du shell ne fonctionnait
   pas en production. Corrigé.
2. **`build.target: 'esnext'`** — ciblage Chrome uniquement, sans rétrocompatibilité.
3. **Chevauchement de phase 3** — `markImportStart('feed')` + `void import(FeedPage)`
   dans `main.ts` avant `mount(App)` ; le chunk FeedPage se compile pendant la
   phase 2.
4. **Repères de lancement sûrs en production** — `launch-marks.ts` expose
   `window.__mpPerf.getSnapshot()` pour que le harnais mesure les performances
   sans mode DEV.

### 10.4 Différé / non poursuivi

- **Découpage lazy du registre d'icônes** — déjà un chunk lazy séparé ; NON situé
  sur le chemin critique. Aucune action.
- **Suppression de `app-lifecycle.machine.ts`** — FAIT. Dépendance XState
  entièrement retirée ; le fichier mort `app-lifecycle.machine.ts` et le fichier
  actif `profile.machine.ts` ont été migrés vers un store à base de runes dans
  `src/lib/state/profile.svelte.ts`. Le chunk lazy `xstate.svelte`
  (42,88 ko / 13,79 ko gzip) a disparu du build.
- **Réduction agressive du graphe App** — le seul levier capable de franchir le
  plancher ; nécessite des décisions produit sur les fonctionnalités de premier
  rendu à différer. Non entrepris sans décision explicite (voir §12).

### 10.5 Décision ouverte (nécessite arbitrage du responsable)

La cible de démarrage de 50 ms se situe **en dessous du plancher de compilation
V8 prouvé** pour la complexité actuelle de l'application. Options envisageables —
aucune ne peut être choisie par le modèle seul : (a) accepter un **budget de
démarrage de ~70 ms** (actuel, respecte le budget de navigation pour toutes les
pages), (b) supprimer des fonctionnalités de premier rendu pour réduire le chunk
critique à ≤ 85 ko, (c) revoir la définition de « chargé » (par exemple shell
peint + navigation visible, qui respecte déjà le budget). Suivi au §12.

## 11. Historique des modifications (change log)

| Date       | Modification                                                                                                                                                                                                                                    | Auteur |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-07-05 | Modèle initial. Référence capturée depuis le build v0.2.2.                                                                                                                                                                                      | model  |
| 2026-07-05 | §10 ajouté : plan de chevauchement de phase 3 + réduction de phase 2.                                                                                                                                                                           | model  |
| 2026-07-05 | Correctif CSP : externalisation des scripts inline → `shell-boot.ts`. Le lancement est maintenant PASS, 0 erreur console.                                                                                                                       | impl   |
| 2026-07-05 | Réécriture de §10.1–10.5 : plancher de compilation à froid V8 prouvé sur 3 expérimentations ; navigation inter-pages prouvée gratuite (preload-all + garde `!XPage`). esnext + chevauchement phase 3 livrés. manualChunks annulé (neutre).      | impl   |
| 2026-07-05 | §12 RÉSOLU : le responsable accepte le budget de démarrage de ~70 ms ; navigations déjà ≤50 ms. Livraison en l'état. Diagnostic `mp:main-start` retiré, instrumentation d'historique annulée. 1701 tests au vert, lancement vérifié à 0 erreur. | impl   |

## 12. Budget de démarrage — RÉSOLU

> Décision du responsable enregistrée le 2026-07-05.

**Décision : accepter un budget de démarrage de ~70 ms. Livraison en l'état.**

Justification (responsable) : la cible de 50 ms est atteinte sur **chaque
navigation inter-pages** (Profil, CV, Suivi, TJM, Réglages — toutes à ~0 ms via
la conception preload-all). Le **seul** moment supérieur à 50 ms est le démarrage
à froid initial (ouverture du panel → feed monté, 68–73 ms), dont le §10.1 prouve
qu'il est borné inférieurement par la compilation mono-thread à froid par V8 du
graphe d'application de ~114 ko (~63 ms). Aucune stratégie de déplacement d'octets
ne peut franchir ce plancher (confirmé par 3 expérimentations). Descendre sous
70 ms nécessiterait de supprimer des fonctionnalités du premier rendu — ce qui
ne vaut pas le coût en termes d'expérience utilisateur pour un unique moment
d'ouverture à froid.

**Budgets acceptés (finaux) :**

- Démarrage à froid initial (shell → feed monté) : **≤ 75 ms** (médiane mesurée 68–73).
- Navigation inter-pages (toute page, application à chaud) : **≤ 50 ms** (mesuré ~0 ms).
- Shell peint + navigation visible : déjà bien en dessous de 50 ms.

Si une fonctionnalité future fait grossir le chunk critique au-delà de ~130 ko
bruts (démarrage > 80 ms), réexaminer le §10.4(b) : différer des fonctionnalités
du premier rendu pour redescendre sous le plancher.
