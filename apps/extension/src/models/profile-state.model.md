# Modèle d'état du profil

Source de vérité pour le cycle de vie d'état du profil. Remplace l'ancienne
machine XState `profile.machine.ts` par un module idiomatique à runes Svelte 5.
Le graphe d'états, les transitions, les effets de bord et les invariants sont
conservés à l'identique (1:1) depuis la machine.

## Pourquoi des runes plutôt que XState

XState ajoutait un chunk différé de 42,88 Ko (13,79 Ko gzip) sur les routes
`OnboardingPage` et `SettingsPage` pour une machine CRUD à 6 états. Le standard
du projet repose sur les runes Svelte 5 dans des modules `.svelte.ts` (voir
AGENTS.md). Le comportement de la machine est suffisamment simple pour être
modélisé directement avec `$state` + une fonction de transition explicite, la
dépendance est donc supprimée.

## États

```
loading ──load()──► ready   (profil trouvé)
loading ──load()──► missing (aucun profil)
loading ──load()──► error   (load a levé une exception)
missing ──SUBMIT──► saving ──save()──► ready | error
ready   ──EDIT───► editing
editing ──CANCEL──► ready
editing ──SUBMIT──► saving
error   ──RETRY (hasDraft)──► saving
error   ──EDIT───► editing
ready   ──PROFILE_UPDATED──► ready (sync externe)
editing ──PROFILE_UPDATED──► editing (sync externe, brouillon préservé)
saving  ──PROFILE_UPDATED──► saving (sync externe différée, appliquée au règlement)
*       ──LOAD──► loading (sauf depuis `saving`)
```

`ProfileStatus = 'loading' | 'missing' | 'editing' | 'saving' | 'ready' | 'error'`

## Contexte

- `current: UserProfile | null` — dernier profil chargé / enregistré.
- `draft: UserProfile | null` — édition en cours ou profil soumis.
- `error: string | null` — non nul uniquement dans l'état `error`.

## Événements et table de transitions

| De \ Événement | LOAD    | EDIT            | CANCEL        | SUBMIT_PROFILE | PROFILE_UPDATED          | RETRY                   |
| -------------- | ------- | --------------- | ------------- | -------------- | ------------------------ | ----------------------- |
| `loading`      | -       | -               | -             | saving\*       | ready (ext)              | -                       |
| `missing`      | loading | -               | -             | saving\*       | ready (ext)              | -                       |
| `editing`      | -       | -               | ready (draft) | saving\*       | editing (ext, draft)     | -                       |
| `ready`        | loading | editing (draft) | -             | saving\*       | ready (ext, sans bouger) | -                       |
| `error`        | loading | editing (clear) | -             | saving\*       | ready (ext)              | saving (garde hasDraft) |
| `saving`       | ignoré  | ignoré          | ignoré        | ignoré         | saving (ext def.)        | ignoré                  |

\* `SUBMIT_PROFILE` définit `draft = event.profile`, efface `error`, entre en
`saving` et invoque `deps.saveProfile(profile)`.

`(ext)` = `setExternalProfile` :
`current = draft = event.profile; error = null`.

`(ext, draft)` = synchronisation externe pendant l'édition :
`current = event.profile` uniquement. Le `draft` non enregistré de
l'utilisateur est **préservé** — un écrivain externe (import LinkedIn, sync de
disponibilité, enregistrement depuis un autre panneau) ne doit jamais écraser
silencieusement les champs que l'utilisateur est en train de saisir (p. ex.
`jobTitle`). Un `CANCEL` ultérieur revient à la vérité externe la plus fraîche.

`(ext def.)` = synchronisation externe pendant l'enregistrement : le payload est
mis en attente dans `pendingExternal` et l'état reste `saving` (aucune
ré-entrance). Lorsque le `runSave` en vol se termine — succès ou échec — le
payload différé est appliqué avec la sémantique `(ext)` de l'état atteint
(`current = draft = payload`, `error` effacé). L'écho `PROFILE_UPDATED` propre
au store arrive ici aussi et est idempotent (même payload que `runSave` vient de
persister). Cela maintient `current` — la base de fusion utilisée par les
consommateurs pour le prochain enregistrement — à jour pendant toute la fenêtre
d'enregistrement.

## Effets de bord

- **Entrée en `loading` :** invoque `deps.loadProfile()`.
  - Résout avec un profil → `ready`, `current = draft = profile`.
  - Résout `null` → `missing`, `current = draft = null`.
  - Rejette → `error`, `error = message`.
- **Entrée en `saving`** (via `SUBMIT_PROFILE` ou `RETRY`) : invoque
  `deps.saveProfile(draft)`.
  - Résout → `ready`, `current = draft = output`.
  - Rejette → `error`, `error = message`.

Le store se charge automatiquement à la création (reflète le `initial: 'loading'`
de la machine avec un acteur `loadProfile` invoqué).

## Ordonnancement `SAVE_PROFILE` du service worker

Le contrat d'enregistrement traverse le bridge. Le handler du service worker
DOIT ordonner ses effets de bord afin que l'acquittement n'attende jamais les
projections post-commit :

1. `saveProfile(payload)` — persiste dans IndexedDB (vide le cache sémantique).
2. `sendResponse(PROFILE_RESULT)` — **acquitte immédiatement**. Le bouton
   d'enregistrement du panneau latéral et la transition `saving → ready` de
   l'acteur en dépendent.
3. Diffuse `PROFILE_UPDATED` — dépend uniquement du succès de la persistance.
4. Projection post-commit : `rescoreStoredMissions` (recalcul complet des scores
   de missions, scoring sémantique Gemini Nano) → diffuse `MISSIONS_UPDATED`.
   Les échecs sont journalisés et non bloquants : les scores se rafraîchissent
   simplement au prochain scan.

Cela reflète le précédent du flux de scan (acquittement avant les projections
suspendables). L'ordre inverse bloque l'UI pendant tout le rescore et, combiné
aux diffusions d'autres écrivains, entre en course avec l'éditeur.

### Orchestration du rescore post-enregistrement

Comme l'acquittement ne maintient plus le canal de message ouvert, le rescore ne
doit pas compter sur lui pour maintenir le service worker actif, et des
enregistrements rapides ne doivent pas exécuter de cycles concurrents de
lecture-modification-écriture sur le store des missions :

- **Keepalive :** le rescore s'exécute enveloppé dans un ping keepalive (appel
  `chrome.runtime` peu coûteux toutes les < 30 s) afin qu'une passe Gemini Nano
  longue ne puisse pas être tuée en cours de projection par le timeout d'inactivité
  MV3.
- **Sérialisation + fusion (_coalescing_) :** au plus un rescore est en vol.
  Les enregistrements arrivant pendant qu'un rescore tourne mettent leur profil
  en attente ; lorsque le rescore courant se termine, le dernier profil en
  attente s'exécute ensuite (les profils intermédiaires sont fusionnés). Les
  scores finaux persistés correspondent donc toujours au dernier profil
  enregistré, dans l'ordre d'enregistrement.

## Invariants

1. `error` est non nul ssi `status === 'error'`.
2. `saving` possède toujours un `draft` non nul (`RETRY` est gardé par
   `hasDraft`).
3. `saving` ignore tous les événements jusqu'à ce que l'enregistrement se termine
   (aucune ré-entrance) — sauf `PROFILE_UPDATED`, qui est différé (voir
   `(ext def.)`) et appliqué à la fin de l'enregistrement.
4. Un `PROFILE_UPDATED` différé ou en direct n'écrase jamais la persistance d'un
   enregistrement en vol : il rafraîchit uniquement `current` (+ `draft` une fois
   hors édition).
5. Un `PROFILE_UPDATED` externe n'écarte jamais des modifications non
   enregistrées : depuis `editing`, il rafraîchit `current` uniquement, et les
   consommateurs (`SettingsPage`) ne doivent pas refléter un payload externe
   dans les champs de formulaire tant que `editingProfile` ou un enregistrement
   est en vol. Sur `CANCEL`, les consommateurs DOIVENT réinitialiser les champs
   de formulaire depuis `current` (initialisation seule, sans réémettre
   `PROFILE_UPDATED` à l'acteur) afin que la vue en lecture seule reflète la
   vérité persistée la plus fraîche, et non le brouillon abandonné.
6. L'acquittement d'enregistrement (`PROFILE_RESULT`) est envoyé dès que la
   persistance réussit — jamais après le rescore post-commit.
7. Fraîcheur de la base de fusion : `SettingsPage.saveProfile` fusionne les
   champs éditables sur le `current` de l'acteur (sans aller-retour de
   relecture). `current` fait donc autorité — chaque écriture persistée doit y
   être reflétée, y compris les écritures externes arrivant pendant la fenêtre
   `saving` (report de l'invariant 4).

## API publique (consommée par OnboardingPage + SettingsPage)

```ts
createProfileStore(deps): {
  snapshot: {
    value: ProfileStatus;
    context: { current, draft, error };
    matches(state: ProfileStatus): boolean;
  };
  send(event: ProfileEvent): void;
  subscribe(listener: (snapshot) => void): () => void;
}
```

- `snapshot` est réactif : les lectures de `value` / `context.*` / `matches()`
  dans un `$derived` ou un template suivent le `$state` sous-jacent.
- `subscribe` déclenche l'écouteur à chaque transition ou changement de
  contexte. Utilisé par le motif de promesse `submitProfile` (subscribe → send
  SUBMIT → await ready/error).
- La même surface que celle exposée par l'acteur XState, afin que les
  consommateurs remplacent le constructeur par un changement d'import d'une
  ligne.
