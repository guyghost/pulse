---
target: apps/dashboard/src/routes/+page.svelte
total_score: 21
p0_count: 2
p1_count: 1
timestamp: 2026-07-04T23-28-25Z
slug: apps-dashboard-src-routes-page-svelte
---

# MissionPulse Dashboard — Critique UI (registre product)

## Verdict AI slop (product register)

**Verdict : proche du registre, mais trop de frictions SaaS-template.**

Effort sincère vers un terminal de décision dense, mais pollué par des **marqueurs SaaS-dashboard génériques** qui cassent « calme, précis, fiable » :

- **171 cartes arrondies** (`rounded-xl`, `rounded-lg`) — grille de cartes infinie typique SaaS générique. Missions, métriques, conflits, alertes — tout est une carte. Sameness visuelle, perte de hiérarchie.
- **16+ eyebrows** (`class="eyebrow text-text-subtle"`, l.1022, 1068, 1135, 1228…) — pattern UPPERCASE · TRACKING hors de propos. Un terminal Bloomberg n'annonce pas chaque section avec un label décoratif.
- **Hero metrics vacuus** (l.1186–1223) : 4 cartes `text-3xl` affichant « Candidatures : 0 », « Taux moyen : 0% », « Entretiens : 0 », « Prochaine relance : Aucune ». Métriques **vides par défaut** = gabarit dashboard d'entreprise appliqué sans réflexion workflow. Un freelance arrive et voit **quatre N/A géants**.
- **Badge fever** : `<Badge>` appelé **53 fois** dans un seul fichier. Chaque statut/label/état devient un badge → l'utilisateur scanne une mer de badges sans distinguer le signal urgent.
- **Operational story** (l.1056–1126) = storytelling narratif artificiel (« La synchronisation demande une décision », « Le cockpit est prêt pour arbitrer les missions »). Ton corporate-conversational, pas direct.
- **État « setup »** occupe **400+ lignes** (l.615–710, 932–1054). Onboarding bruyant : checklist, preview surfaces, progression 0/3 → 1/3 → 2/3. Un freelance sur un dashboard vide veut un lien direct vers l'action, pas un tour guidé marketing.

**Slop test :** un user fluent in Linear/Figma/Notion **pauserait**. La densité data est là (scoring, TJM, stacks, relances) mais emballée dans un gabarit SaaS qui dit « généré depuis un template Tailwind UI ». La voix « Calme, précis, fiable » n'émerge pas.

## Nielsen heuristics (0–4)

| #         | Heuristic                   | Score     | Key Issue                                                                                                                                                                         |
| --------- | --------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Visibility of system status | 2         | Setup vs. ready clairs, mais états vides dominent (« Aucune mission reçue », « Aucune shortlist », « Aucun TJM synchronisé ») — signale l'absence de valeur                       |
| 2         | Match system / real world   | 2         | Vocab métier correct (TJM, stack, remote), mais modèle mental cassé : un freelance veut d'abord voir les missions, pas un « État opérationnel » narratif                          |
| 3         | User control & freedom      | 3         | Undo implicite absent (pas de toast « Annuler » après archive/sélection). Ancres claires, filtres réversibles                                                                     |
| 4         | Consistency & standards     | 3         | Tokens CSS suivis, mais 3 façons d'écrire un eyebrow (`eyebrow`, `text-[11px]...tracking-[0.12em]`, `text-[10px]...tracking-[0.15em]`). Badges sur-utilisés pour rôles différents |
| 5         | Error prevention            | 2         | Confirmation destructive existe (taper « SUPPRIMER »), mais pas de prévention en amont. Conflits sync apparaissent après coup                                                     |
| 6         | Recognition > recall        | 3         | Badges de statut et scores visuels, mais labels scoring codés (« Stack », « TJM ») sans legend. « Score 85% » et « Freshness : fresh » sans explication                           |
| 7         | Flexibility & efficiency    | 1         | Aucun raccourci clavier. Aucune vue liste dense. Aucune action batch. Trier 20 missions = 20 clics individuels                                                                    |
| 8         | Aesthetic & minimalist      | 2         | 171 cartes, 16 eyebrows, 53 badges, 4 hero metrics, operational story, checklist setup, preview setup, jalons. Densité d'enrobage domine la densité d'info utile                  |
| 9         | Error recovery              | 2         | Messages d'erreur présents mais pas de guidance inline. Guide résolution conflits générique                                                                                       |
| 10        | Help & documentation        | 1         | Aucune aide inline, pas de tooltips, pas de (?), pas de lien doc. Un user qui ne comprend pas « Score 85% » ou « Freshness : fresh » doit deviner                                 |
| **Total** |                             | **21/40** | **Needs work — bonne ossature data, intention claire, mais polluée par SaaS-template**                                                                                            |

## Cognitive load checklist

| Item                               | Pass/Fail | Evidence                                                                                                                                                                   |
| ---------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| < 4 options par décision majeure   | FAIL      | Section Candidatures : 9 filtres sources + search + grid N cartes + sidebar + timeline + assets générés = 8+ zones                                                         |
| États vides guident vers action    | PASS      | CTAs clairs (« Installer l'extension », « Connecter mon compte »)                                                                                                          |
| Info critique en haut de page      | FAIL      | Le feed missions apparaît après checklist setup + operational story + jalons + 4 hero metrics + eyebrow. 900px de scroll                                                   |
| Workflow primaire sans friction    | FAIL      | « Identifier 3 missions à postuler » = scroller past setup → past métriques → voir 6 missions max → cliquer Sélectionner → reload page → voir dans Candidatures. 5+ étapes |
| Actions critiques distinguées      | PASS      | Boutons primaires (solid) vs secondaires (outline) clairs                                                                                                                  |
| Pas de décision fatiguante répétée | FAIL      | Chaque mission = décision Archiver vs Sélectionner. Sur 50 missions = 50 clics. Pas de batch                                                                               |
| Navigation prévisible              | PASS      | Ancres (`#applications`, `#cv`, `#sync`) et sidebar claires                                                                                                                |
| Feedback immédiat sur actions      | FAIL      | Form actions rechargent la page (method=POST). Pas de toast instantané                                                                                                     |

**3/8 PASS — cognitive load élevé pour un dashboard de décision.**

## Emotional journey

- **Peak** : voir un premier score 85%+ avec stack matchée (sentiment « l'outil travaille pour moi ») ; TJM radar segments (données marché actionnables sans travail).
- **Valleys** :
  - Arrivée sur dashboard vide : 4 hero metrics à « 0 »/« Aucune » + checklist 0/3. « Pourquoi cette page existe ? »
  - Feed limité à 6 missions alors que 50 sont sync. Pourquoi cacher le signal ?
  - Sync conflicts (l.2915–3033) : arbitrer « Dashboard vs Extension » sans guidance sur la source fiable. Le guide dit « Comparez la date » mais ne montre pas la date.
- **Reassurance manquante** : pas de confirmation visuelle immédiate après sélection mission (reload → re-scroll) ; pas de compteur « X nouvelles missions depuis hier » ; pas de « 12/15 missions fraîches traitées cette semaine ».
- **End** : termine sur « Confidentialité · Données connectées » — note défensive (« qu'est-ce qui est stocké ? »).

## Strengths

1. **Les données sont là et correctes** — TJM min/max/moyen, scoring criteria breakdown, sync conflicts détaillés. Transparence opérationnelle réelle, pas cosmétique.
2. **Empty states ne sont pas vides** — CTAs clairs, pas de « Coming soon ». L'user sait quoi faire pour débloquer chaque section.
3. **Tokens CSS bien suivis** — `--color-blueprint-blue`, `--color-text-primary`, pas de hex hardcodé hors theme. Design system propre sous le capot.

## Priority issues

### [P0] Feed missions noyé sous le chrome setup

- **Pourquoi** : l'user arrive pour **scanner des missions**, pas lire une checklist ou un « État opérationnel ». Le feed apparaît après 900px de scroll et limité à 6 items. **Blocage usage** : l'outil ne fait pas son job si le feed n'est pas accessible en <3s.
- **Fix** : inverser la hiérarchie (feed en haut, setup/métriques en sidebar ou bottom) ; afficher toutes les missions (pas `slice(0,6)`) avec scroll infini ou pagination ; toggle « Setup complet » pour cacher le chrome quand prêt.
- **Commande** : `/impeccable distill`

### [P0] Hero metrics vides cassent la crédibilité

- **Pourquoi** : 4 métriques géantes `text-3xl` vides par défaut. Un freelance « calme/précis/fiable » qui voit **quatre N/A géants** perd confiance immédiatement. Tell SaaS-template.
- **Fix** : supprimer les cartes si vides (n'afficher que si `applications.length > 0`) ; ou remplacer par leading indicators (« X missions scannées cette semaine », « Y nouvelles depuis hier », « Z connecteurs actifs »).
- **Commande** : `/impeccable harden`

### [P1] Pas de workflow batch pour tri rapide

- **Pourquoi** : un power user veut trier 20 missions en 2 min, pas cliquer « Sélectionner » 20 fois avec 20 reloads. Workflow actuel lent et répétitif. Friction majeure pour la « décision en une passe ».
- **Fix** : vue liste dense avec checkboxes (sélectionner 5 → « Archiver les 5 ») ; raccourcis clavier (`j/k` nav, `s` select, `a` archive, `Enter` détails) ; feedback inline (toast) au lieu de full reload.
- **Commande** : `/impeccable optimize`

### [P2] 16 eyebrows créent du bruit décoratif

- **Pourquoi** : chaque section a un label uppercase tracked. Pattern marketing/landing appliqué à un dashboard produit. L'user scanne une grille « EYEBROW / Title / Content » 16 fois. Ça ne structure pas, ça ralentit.
- **Fix** : supprimer les eyebrows sauf grandes transitions (max 3–4 dans toute la page) ; titres directs `h2` sans eyebrow ; dividers visuels au lieu de labels décoratifs.
- **Commande** : `/impeccable quieter`

### [P3] Operational story = storytelling artificiel

- **Pourquoi** : encart coloré avec récit généré (« La synchronisation demande une décision »). Ton corporate-conversational. Un terminal affiche « 3 conflits · 2 erreurs · Action requise », pas une histoire. 70 lignes de template + space visuel précieux.
- **Fix** : remplacer par status banner minimaliste (icône + message court + bouton action) ; afficher seulement si state = incident/attention ; supprimer les « signals » décoratifs.
- **Commande** : `/impeccable clarify`

## Persona red flags

### Alex (Power User freelance, clavier-first, data-dense)

Feed limité à 6 missions (`slice(0,6)`). Aucun raccourci clavier. Métriques vides en top. **Blocage : abandonne, utilise Free-Work direct (plus rapide que le dashboard qui agrège Free-Work).**

### Jordan (First-Timer après login)

Dashboard vide avec checklist 0/3, aucune preview missions. Operational story corporate (« cockpit »). Aucune donnée demo (Linear/Figma/Notion montrent des données fictives). **Blocage : ne comprend pas la value prop, quitte sans installer l'extension.**

### Sam (Overwhelmed, 5 connecteurs, données incomplètes, conflits sync)

Conflits dans un encart orange géant en bas de page. Guide « Identifier la source fiable » sans timestamp affiché. Missions affichent « sourceHealthErrorMessage » sans lien direct vers fix. **Blocage : ferme, utilise LinkedIn direct (au moins les données sont fiables).**

## Minor observations

- l.815 `backdrop-blur` sur header sticky — seul glassmorphism, cohérent (header flottant).
- l.735 `text-[11px] font-medium uppercase text-text-muted` pour « Workspace » — label inutile (sidebar n'a qu'un seul workspace).
- l.1420–1428 scoring criteria en grille 3×2 avec labels codés — excellent pour transparence, mais manque legend « /100 » ou tooltips.
- l.2273–2278 CV preview = skeleton statique (barres grises). Pourquoi pas afficher les données réelles si `hasCvProfile` ?
- l.3154 `text-[10px] tracking-[0.15em]` — inconsistent avec eyebrow (tracking différent).
- Filtres mission dans un encart séparé, pas inline avec feed. Pourquoi séparer recherche et résultats ?

## Provocative questions

1. Si tu retirais 50% des cartes arrondies, lesquelles garderais-tu ? Missions, candidatures, CV ? Ou métriques, jalons, operational story ?
2. Un freelance ouvre le dashboard à 8h30 avant son café. Que voit-il en premier ? (Réponse : checklist setup ou operational story, pas les missions.)
3. Linear affiche 50 issues/écran. Notion 30 cartes. Ton dashboard 6 missions. Pourquoi ?
4. Les eyebrows uppercase apparaissent 16 fois. Si je les supprime tous, le dashboard perd-il en clarté ? (Hypothèse : non.)
5. Le dashboard fait 3223 lignes. Un component refactor pourrait réduire à combien ? Missions, Candidatures, CV, Sync sont des surfaces réutilisables.
