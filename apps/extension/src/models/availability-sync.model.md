# Modèle de synchronisation de la disponibilité

Source de vérité pour le bloc « Disponibilité » affiché dans l'onglet **Suivi**
(`ApplicationsPage`) : le freelance déclare sa prochaine date de disponibilité,
la valeur est persistée sur `UserProfile`, et un **push** multi-plateformes copie
un message de disponibilité formaté dans le presse-papiers puis ouvre chaque
connecteur de mission afin que l'utilisateur puisse le coller manuellement.

Modélisé sous la forme de deux machines à états coopérantes dans un module de runes
Svelte 5 (`src/lib/state/availability.svelte.ts`), selon le standard du projet
(runes plutôt que XState — voir `profile-state.model.md`). La disponibilité possède
ce transport de collage guidé de manière autonome : le workflow de synchronisation
manuelle de CV a été retiré. Pas de backend, pas d'identifiants stockés — local-first.

Le LLM ne décide jamais d'une transition ici. **Le LLM produit des signaux ; le
modèle décide.** (Aucun LLM n'est impliqué dans cette fonctionnalité.)

## Pourquoi pas d'écriture automatique ?

L'extension ne peut pas muter directement l'état des plateformes : elle ne stocke
aucun identifiant et n'a pas de backend. Le « push » de disponibilité est un
**collage guidé** : copier le payload formaté, ouvrir la page de profil de la
plateforme, laisser l'utilisateur coller. C'est le seul transport compatible avec
l'architecture.

## Entités du domaine

### Availability (canonique, persisté sur `UserProfile.availability`)

```ts
type AvailabilityStatus = 'immediate' | 'from-date' | 'in-mission-until' | 'unavailable';

interface Availability {
  status: AvailabilityStatus;
  /**
   * Date ISO "YYYY-MM-DD". La sémantique dépend du statut :
   * - 'from-date'        → premier jour de disponibilité
   * - 'in-mission-until' → dernier jour de la mission en cours
   * - 'immediate'        → doit être null
   * - 'unavailable'      → doit être null
   */
  date: string | null;
  note: string; // texte libre, nettoyé (trimmed), ≤ 280 caractères
  updatedAt: number; // ms epoch (injecté par le shell)
}
```

`UserProfile` est étendu avec `availability: Availability | null` (`null` par
défaut = jamais défini). Le scoring l'ignore. Le schéma le déclare avec
`.default(null)` de sorte que tout enregistrement stocké créé avant l'existence
de ce champ est rétro-rempli (backfilled) à `null` lors de la lecture (idempotent —
aucune migration structurelle ou de données requise ; les lectures passent
toujours par le parse de `UserProfileSchema`). `withProfileDefaults` l'initialise
également.

### Labels de AvailabilityStatus (copy + a11y)

```ts
const AVAILABILITY_STATUS_LABELS: Record<AvailabilityStatus, string> = {
  immediate: 'Disponible immédiatement',
  'from-date': 'Disponible à partir du',
  'in-mission-until': 'En mission jusqu'au',
  unavailable: 'Non disponible',
};
```

### PushTarget (réutilise la structure de la cible de sync CV)

```ts
interface PlatformSyncTarget {
  id: string;
  name: string;
  profileUrl: string;
}
```

Cibles = les 6 connecteurs de missions (`getConnectorsMeta()`). LinkedIn n'est **pas**
inclus (choix de l'utilisateur). `profileUrl` prend par défaut `connector.url` ; des
URLs d'édition de disponibilité par plateforme pourront la remplacer ultérieurement
sans toucher à la machine.

## Machines

Le store compose deux machines. La machine de chargement/édition et la machine
de push sont indépendantes : éditer ne bloque pas un push en cours, et un push
en cours ne bloque pas l'édition (les modifications sont persistées lors de la
prochaine sauvegarde et participent au prochain push).

### 1. Machine de chargement/édition — `editStatus`

```
loading ──LOAD_RESULT(ok)──► ready
loading ──LOAD_ERROR──►      error
error   ──RETRY──►           loading
ready   ──RELOAD──►          loading
ready   ──EDIT────────► dirty (draft = copy of availability, or blank when null)
dirty   ──CANCEL──►    ready (draft discarded)
dirty   ──SUBMIT──►    saving
saving  ──SAVE_RESULT(ok)──► ready  (draft committed)
saving  ──SAVE_ERROR──►     dirty   (draft retained for RETRY)
dirty   ──SAVE_RESULT──► (n/a — saving gates this)
*       ──PROFILE_UPDATED──► ready (availability replaced when not in saving)
```

`EditStatus = 'loading' | 'ready' | 'dirty' | 'saving' | 'error'`.

`ready` avec `availability === null` affiche l'état vide
(« Renseignez votre disponibilité pour la pousser sur vos plateformes »).

`dirty` contient un `draft: Availability` (une copie profonde de la disponibilité
actuelle, ou un objet vierge `{ status: 'immediate', date: null, note: '', updatedAt: 0 }`
en partant de null). Le formulaire se lie directement à `draft` ; rien n'est persisté
avant `SUBMIT`.

### 2. Machine de push — `pushStatus`

```
idle      ──PUSH_START──►        preparing
preparing ──PREPARE_DONE──►      pushing  (per-platform: pending)
preparing ──PREPARE_ERROR──►     error    (no availability set)
pushing   ──PLATFORM_START(id)──► pushing  (platform → copying)
pushing   ──PLATFORM_DONE(id)──►  pushing  (platform → done)
pushing   ──PLATFORM_ERROR(id)──► pushing  (platform → error)
pushing   ──PUSH_CANCEL──►       cancelled (remaining platforms → skipped)
pushing   ──ALL_SETTLED──►       pushed | partial | error
cancelled ──PUSH_START──►        preparing
pushed|partial|error ──PUSH_START──► preparing
```

`PushStatus = 'idle' | 'preparing' | 'pushing' | 'cancelled' | 'pushed' | 'partial' | 'error'`.

Le statut par plateforme réside dans `Map<platformId, PlatformSyncStatus>` et n'a de sens
que lorsque `pushStatus` est à `pushing`/terminal. Il est réinitialisé lors de `PUSH_START`.

```ts
type PlatformSyncStatus =
  'pending' | 'copying' | 'done' | 'error' | 'auth-required' | 'blocked' | 'skipped';
```

(Réutilisé tel quel depuis la synchronisation du CV — même sémantique, mêmes pastilles UI.)

## Contexte

```ts
interface AvailabilityContext {
  availability: Availability | null; // canonique, persisté
  editStatus: EditStatus;
  draft: Availability | null; // non-null dans dirty/saving
  pushStatus: PushStatus;
  platformStatuses: Map<string, PlatformSyncStatus>;
  lastPushedAt: number | null; // ms epoch
  loadError: string | null;
  editError: string | null;
  pushError: string | null;
}
```

## Événements

```ts
type AvailabilityEvent =
  // Load
  | { type: 'LOAD' }
  | { type: 'RELOAD' }
  | { type: 'RETRY' }
  | { type: 'PROFILE_UPDATED'; availability: Availability | null }
  // Edit
  | { type: 'EDIT' }
  | { type: 'CANCEL' }
  | { type: 'SUBMIT'; draft: Availability }
  | { type: 'SAVE_RESULT'; availability: Availability }
  | { type: 'SAVE_ERROR'; message: string }
  // Push
  | { type: 'PUSH_START' }
  | { type: 'PREPARE_DONE'; payloads: Map<string, string> }
  | { type: 'PREPARE_ERROR'; message: string }
  | { type: 'PLATFORM_START'; id: string }
  | { type: 'PLATFORM_DONE'; id: string }
  | { type: 'PLATFORM_ERROR'; id: string; status: 'error' | 'auth-required' | 'blocked' }
  | { type: 'PUSH_CANCEL' }
  | { type: 'ALL_SETTLED' };
```

## Table de transition (édition + push ; le chargement est trivial ci-dessus)

| De \ Événement | EDIT   | CANCEL | SUBMIT | SAVE_RESULT | SAVE_ERROR | PUSH_START | PROFILE_UPDATED  |
| -------------- | ------ | ------ | ------ | ----------- | ---------- | ---------- | ---------------- |
| `loading`      | -      | -      | -      | -           | -          | (push)     | dropped          |
| `ready`        | dirty  | -      | -      | -           | -          | autorisé   | ready (remplace) |
| `dirty`        | -      | ready  | saving | -           | -          | autorisé\* | dropped          |
| `saving`       | ignoré | ignoré | ignoré | ready       | dirty      | ignoré     | dropped          |
| `error` (edit) | dirty  | ready  | saving | -           | -          | autorisé\* | ready (remplace) |

\* `PUSH_START` est autorisé lorsqu'un brouillon (draft) est ouvert (le brouillon est
conservé ; le push opère sur la disponibilité **validée** (committed), pas sur le brouillon).
Les deux machines sont indépendantes.

| De \ Événement (push) | PUSH_START | PREPARE_DONE | PLATFORM\_\*  | PUSH_CANCEL | ALL_SETTLED | PROFILE_UPDATED |
| --------------------- | ---------- | ------------ | ------------- | ----------- | ----------- | --------------- |
| `idle`                | preparing  | -            | -             | -           | -           | idle (remplace) |
| `preparing`           | ignoré     | pushing      | -             | idle        | -           | dropped         |
| `pushing`             | ignoré     | -            | met à jour pm | cancelled   | terminal    | dropped         |
| `cancelled`           | preparing  | -            | -             | -           | -           | idle (remplace) |
| `pushed/partial/er`   | preparing  | -            | -             | -           | -           | idle (remplace) |

## Effets de bord (shell — `deps`)

- **Entrée dans `loading`** (LOAD/RELOAD/RETRY) : `deps.loadAvailability()` lit
  `UserProfile.availability` via le bridge de profil. Résolution → `ready` ;
  rejet → `error`.
- **Entrée dans `saving`** (SUBMIT) : `normalizeAvailability(draft, now)` (pur, core)
  applique l'invariant statut↔date et nettoie/plafonne la note, puis
  `deps.saveAvailability(normalized)` la fusionne dans le profil persisté.
  Résolution → `SAVE_RESULT(availability)` ; rejet → `SAVE_ERROR`, `draft`
  conservé.
- **Entrée dans `preparing`** (PUSH_START) : si `availability === null` →
  `PREPARE_ERROR`. Sinon, fonction pure `buildAvailabilityPayloads(availability, targets)`
  dans core → `PREPARE_DONE(payloads)`.
- **Entrée dans `pushing`** (PREPARE_DONE) : `deps.pushAll(payloads)` itère sur les cibles.
  L'écriture dans le presse-papiers est tentée **une seule fois globalement** avant
  qu'aucune plateforme ne s'ouvre :
  - Presse-papiers refusé → chaque plateforme → `error`, `ALL_SETTLED` → `error`.
  - Sinon, par plateforme : `PLATFORM_START` → `deps.open(url)` → `PLATFORM_DONE`
    (ou `PLATFORM_ERROR` si open rejette). Les plateformes s'exécutent séquentiellement
    afin que l'utilisateur puisse coller dans chaque onglet ouvert avant le suivant.
    Le payload reste dans le presse-papiers issu du test global (une nouvelle copie
    échouerait dès que le premier onglet prend le focus — pas de permission `clipboardWrite` ;
    `navigator.clipboard` nécessite une activation transitoire).
- **`PROFILE_UPDATED`** (sauvegarde externe / réimport) : remplace `availability`
  lorsque la machine de chargement/édition est dans `ready`/`error` et que la machine
  de push n'est pas occupée. Appliqué également depuis les états de push terminaux
  (réinitialise la machine de push à `idle`). Ignoré (dropped) pendant
  `saving`/`preparing`/`pushing` (invariant 3).

## Invariants

1. `dirty`/`saving` sont conditionnés par `editStatus` : `EDIT` n'est accepté
   que depuis `ready` ou `error`. `loading`/`saving` l'ignorent.
2. `saving` ignore tous les événements d'édition jusqu'à stabilisation (pas de réentrance).
3. `PROFILE_UPDATED` pendant `saving`/`preparing`/`pushing` est **ignoré (dropped)**
   (n'écrase jamais une opération en cours). Appliqué uniquement depuis `ready`/`error`/push terminal.
4. Pendant `pushing`, l'échec d'une plateforme n'interrompt jamais les autres
   (sauf en cas de refus global du presse-papiers, qui fait échouer l'ensemble avant qu'aucun onglet ne s'ouvre).
5. **Invariant statut↔date** (appliqué par `normalizeAvailability`) :
   - `immediate` / `unavailable` ⇒ `date === null`
   - `from-date` / `in-mission-until` ⇒ `date` est un `YYYY-MM-DD` valide
6. `note` est nettoyée et plafonnée à 280 caractères par le normaliseur ; le formulaire
   applique également ce plafond, mais le normaliseur est la source de vérité.
7. L'état terminal de `pushStatus` (`pushed`/`partial`/`error`) est **dérivé** des
   statuts par plateforme lors de `ALL_SETTLED`, non stocké indépendamment.
8. Le push opère sur la `availability` **validée**, jamais sur un `draft` non sauvegardé.
   Un brouillon ouvert ne participe pas au push.
9. Les emplacements d'erreur sont propres à chaque machine (`loadError`/`editError`/`pushError`) :
   une défaillance dans l'une n'écrase jamais le message d'erreur terminal d'une autre machine.
10. `canPush === availability !== null && editStatus !== 'saving' && !isPushBusy`.

## API publique (consommée par ApplicationsPage via un organisme)

```ts
createAvailabilityStore(deps): {
  // reactive snapshot
  availability: Availability | null;
  editStatus: EditStatus;
  draft: Availability | null;
  pushStatus: PushStatus;
  platformStatuses: Map<string, PlatformSyncStatus>;
  lastPushedAt: number | null;
  loadError: string | null;
  editError: string | null;
  pushError: string | null;
  canPush: boolean;
  isPushing: boolean;
  // load
  load(): void;
  // edit
  startEdit(): void;
  cancelEdit(): void;
  saveAvailability(draft: Availability): void;
  // push
  startPush(): void;
  cancelPush(): void;
  // external merge
  applyProfileUpdate(availability: Availability | null): void;
}
```

`deps` (injecté par le shell, mockable dans les tests) :

```ts
interface AvailabilityDeps {
  loadAvailability(): Promise<Availability | null>;
  saveAvailability(availability: Availability): Promise<void>;
  copyToClipboard(text: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  platforms: PlatformSyncTarget[];
  now(): number;
}
```

## Helpers purs (core, testés unitairement sans mocks)

Emplacement : `src/lib/core/availability/availability-helpers.ts`.

- `normalizeAvailability(draft, now): Availability` — applique statut↔date,
  nettoie/plafonne la note (280), valide `YYYY-MM-DD`. Ne lève aucune exception ; borne les valeurs.
- `formatAvailabilityPayload(availability): string` — le bloc copiable-collable :
  - `immediate` → "Disponible immédiatement"
  - `from-date` → "Disponible à partir du DD/MM/YYYY"
  - `in-mission-until` → "En mission jusqu'au DD/MM/YYYY"
  - `unavailable` → "Non disponible"
  - - note sur une nouvelle ligne lorsqu'elle est non vide.
- `buildAvailabilityPayloads(availability, targets): Map<id, string>` — même
  chaîne de payload pour chaque cible (les plateformes formatent la disponibilité de manière identique).
- `AVAILABILITY_STATUS_LABELS` + `AVAILABILITY_STATUS_ORDER` (ordre de sélection).

## Intégration UI

Un nouvel organisme `AvailabilityPanel.svelte` (formulaire d'édition + liste de push dans une
carte de statut autonome) est inséré en **haut** de `ApplicationsPage.svelte`
(avant la section de pipeline existante), de sorte que la disponibilité soit la première action
dans l'onglet Suivi. Il reçoit le store + les cibles de plateforme depuis la façade.

## Persistance et migration

- `UserProfile.availability: Availability | null` (type, requis — toujours
  présent via `withProfileDefaults`).
- `UserProfileSchema` : champ `availability` avec `.default(null)` et un sous-schéma
  d'objet nullable. Les lectures des enregistrements préexistants se rétro-remplissent
  à `null` lors du parse.
- `withProfileDefaults` : `availability: profile.availability ?? null`.
- **Aucune migration de données nécessaire.** La valeur par défaut du schéma est
  idempotente et s'exécute à chaque lecture. (Documenté ici afin que le prochain
  contributeur n'ajoute pas de migration v2→v3 redondante.)

## Checklist de revue (Modèle → Revue)

- [x] Nominal : définir la disponibilité → enregistrer → push → toutes plateformes `done` → `pushed`.
- [x] Vide : `availability === null` → `PUSH_START` → `PREPARE_ERROR`, aucun onglet
      ne s'ouvre.
- [x] Annulation en cours de push : `PUSH_CANCEL` pendant `pushing` → plateformes
      restantes `skipped`, état terminal `cancelled` (pas `pushed`).
- [x] Presse-papiers refusé globalement : chaque plateforme → `error`, état terminal
      `error`, aucun onglet ne s'ouvre.
- [x] Rejet de `openUrl` par plateforme → cette plateforme passe à `error`, les autres
      continuent, état terminal `partial` si ≥1 terminée.
- [x] Édition pendant le push : autorisée ; brouillon préservé ; le push utilise la
      valeur validée.
- [x] Push pendant un brouillon modifié (dirty) : autorisé ; utilise la disponibilité
      validée, pas le brouillon.
- [x] `PROFILE_UPDATED` pendant `saving`/`pushing` : ignoré (invariant 3).
- [x] Invariant statut↔date appliqué par le normaliseur (formulaire + modèle + tests).
- [x] État de push terminal dérivé des statuts par plateforme (invariant 7).
- [x] Aucun LLM dans la boucle ; aucune transition ne dépend de texte libre.
      **Le LLM produit des signaux ; le modèle décide.** (Ici : aucun LLM du tout.)
