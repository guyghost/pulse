# Modèle d'expériences CV

Source de vérité pour le comportement de l'onglet CV : un feed canonique et
modifiable d'expériences professionnelles. L'ancien flux de synchronisation
manuelle multi-plateformes (copier le CV dans le presse-papiers, puis ouvrir
chaque plateforme) est abandonné.

Les utilisateurs gardent MissionPulse ouvert pendant qu'ils visitent eux-mêmes
une plateforme cible. Un futur assistant de formulaire in-page pourra proposer
des valeurs de champs à partir du CV canonique, dans le style de Grammarly, mais
cet assistant constitue un flux séparé et DOIT faire l'objet d'un modèle avant
toute implémentation. La page CV ne prétend pas que ce futur assistant est déjà
disponible.

Le LLM ne décide jamais d'une transition. Il peut proposer un contenu de champ au
sein d'un worker IA dédié ; le modèle décide si l'utilisateur peut l'accepter et
de quelle manière cela affecte l'état persisté. **Le LLM produit des signaux ; le
modèle décide.**

## Entité de domaine

### Experience (canonique, persistée sur `UserProfile.experiences`)

```ts
interface Experience {
  id: string;
  title: string;
  company: string | null;
  employmentType: string | null;
  location: string | null;
  startDate: string | null; // ISO month "YYYY-MM" or null
  endDate: string | null;
  isCurrent: boolean;
  description: string;
  skills: string[];
  source: 'linkedin' | 'manual' | 'connector-import';
  sourceExternalId: string | null;
  positionIndex: number; // gapless, stable ordering (0 = most recent)
  updatedAt: number; // epoch ms injected by the shell
}
```

`employmentType` est persisté indépendamment de `company`. Les valeurs historiques
sont normalisées à `null` ; aucune migration IndexedDB n'est requise car la
frontière de normalisation du profil fournit le champ.

## Machines

Le store à base de runes Svelte 5 compose deux machines partageant la liste
canonique des expériences.

### 1. Machine feed — `feedStatus`

```text
loading ──LOAD_RESULT(ok)──► ready
loading ──LOAD_ERROR───────► error
error   ──RETRY────────────► loading
ready   ──RELOAD───────────► loading
idle/ready/error ──PROFILE_UPDATED──► ready
```

`FeedStatus = 'loading' | 'ready' | 'error'`. `ready` avec zéro expérience affiche
l'état vide. Un échec de chargement est terminal jusqu'à ce que l'utilisateur
réessaie ou que la page soit remontée.

### 2. Machine d'édition — `editStatus`

```text
idle    ──NEW──────────────► adding
idle    ──EDIT(id)─────────► editing
adding ──CANCEL────────────► idle
editing──CANCEL────────────► idle
adding/editing/error ──SUBMIT(valid draft)──► saving
saving ──SAVE_RESULT(ok)───► idle
saving ──SAVE_ERROR────────► error  (draft retained)
idle/error ──DELETE(id)────► deleting
deleting ──DELETE_RESULT───► idle
deleting ──DELETE_ERROR────► error
```

`EditStatus = 'idle' | 'adding' | 'editing' | 'saving' | 'deleting' | 'error'`.
Une seule opération d'édition/suppression peut exister à la fois.

## Contexte

```ts
interface CvExperienceContext {
  experiences: Experience[];
  feedStatus: FeedStatus;
  editStatus: EditStatus;
  draft: Experience | null;
  editingId: string | null;
  feedError: string | null;
  editError: string | null;
}
```

Il n'y a pas de `syncStatus`, de map de statuts par plateforme, d'horodatage de
dernière synchronisation ou d'emplacement d'erreur de synchronisation dans le
store CV.

## Événements

```ts
type CvEvent =
  | { type: 'LOAD' }
  | { type: 'RELOAD' }
  | { type: 'RETRY' }
  | { type: 'PROFILE_UPDATED'; experiences: Experience[] }
  | { type: 'NEW' }
  | { type: 'EDIT'; id: string }
  | { type: 'CANCEL' }
  | { type: 'SUBMIT'; draft: Experience }
  | { type: 'DELETE'; id: string }
  | { type: 'SAVE_RESULT'; experience: Experience }
  | { type: 'SAVE_ERROR'; message: string }
  | { type: 'DELETE_RESULT'; id: string }
  | { type: 'DELETE_ERROR'; message: string };
```

`SYNC_START`, `SYNC_CANCEL`, `PREPARE_DONE`, `PLATFORM_*` et `ALL_SETTLED` ne
sont pas des événements CV valides.

## Revue des transitions

| Depuis     | NEW     | EDIT    | CANCEL  | SUBMIT  | DELETE   | PROFILE_UPDATED |
| ---------- | ------- | ------- | ------- | ------- | -------- | --------------- |
| `idle`     | adding  | editing | -       | -       | deleting | ready           |
| `adding`   | ignored | ignored | idle    | saving  | ignored  | dropped         |
| `editing`  | ignored | ignored | idle    | saving  | ignored  | dropped         |
| `saving`   | ignored | ignored | ignored | ignored | ignored  | dropped         |
| `deleting` | ignored | ignored | ignored | ignored | ignored  | dropped         |
| `error`    | adding  | editing | idle    | saving  | deleting | ready           |

- Nominal : chargement, ajout, édition, sauvegarde, suppression, ré-import LinkedIn.
- Erreurs : les échecs de chargement/sauvegarde/suppression renseignent uniquement
  le slot d'erreur de leur propre machine.
- Annulation : seule une session locale d'ajout/édition peut être annulée ; la
  persistance déjà en cours n'est pas annulée.
- Nouvelle tentative : le chargement utilise `reload` ; un brouillon conservé en
  échec peut être soumis à nouveau ; la suppression peut être redemandée depuis
  `error`.
- Permissions : les permissions d'import LinkedIn relèvent du modèle d'import
  LinkedIn, non du store CV. Le store CV ne demande aucune permission d'hôte ou
  de presse-papiers.
- États terminaux : `ready`/`idle` sont des états terminaux nominaux ; `error`
  est un état terminal stable et récupérable. Aucune opération d'ouverture de
  plateforme en arrière-plan ne survit à la page.

## Side effects

- `loadExperiences()` lit `UserProfile.experiences` via le bridge de profil.
- `saveExperiences(experiences)` persiste la liste normalisée complète via le
  bridge de profil.
- Le store n'appelle jamais `navigator.clipboard`, n'ouvre jamais d'URL externe et
  n'énumère jamais les connecteurs cibles.
- L'import LinkedIn reste géré par `linkedin-import.model.md` ; son message
  `PROFILE_UPDATED` n'est appliqué que lorsqu'aucune édition/sauvegarde/suppression
  n'est active.

## API publique

```ts
createCvExperienceStore(deps): {
  readonly experiences: Experience[];
  readonly feedStatus: FeedStatus;
  readonly editStatus: EditStatus;
  readonly draft: Experience | null;
  readonly editingId: string | null;
  readonly feedError: string | null;
  readonly editError: string | null;
  load(): void;
  reload(): void;
  applyProfileUpdate(experiences: Experience[]): void;
  newExperience(): void;
  editExperience(id: string): void;
  cancelEdit(): void;
  saveExperience(draft: Experience): void;
  deleteExperience(id: string): void;
}
```

```ts
interface CvExperienceDeps {
  loadExperiences(): Promise<Experience[]>;
  saveExperiences(experiences: Experience[]): Promise<void>;
  now(): number;
  generateId(): string;
}
```

## Projection UI

- `CvPage` affiche l'en-tête de page, l'action d'import LinkedIn, la navigation
  optionnelle vers le profil, la notification hors ligne et `ExperienceFeed`.
- La carte manuelle « Synchronisation du CV » et son bouton « Synchroniser » sont
  absents quel que soit l'état de feed/édition/réseau.
- L'ajout ou l'édition d'une expérience n'est désactivé que par la machine
  d'édition, jamais par un état de synchronisation supprimé.
- La copy doit décrire le CV comme la source locale canonique sans promettre de
  propagation automatique vers les plateformes connectées.

## Invariants

1. Il existe au plus une session d'édition à la fois.
2. `saving` et `deleting` rejettent les événements réentrants jusqu'à leur
   stabilisation.
3. `PROFILE_UPDATED` est ignoré pendant l'ajout/l'édition/la sauvegarde/la
   suppression et n'est accepté que depuis idle/error.
4. `positionIndex` est sans discontinuité et unique après chaque sauvegarde/suppression.
5. Une expérience avec `isCurrent: true` a `endDate === null`.
6. `employmentType` ne modifie jamais `company` et n'affecte pas la déduplication.
7. La page CV et son store n'ont aucune capacité de synchronisation manuelle vers
   le presse-papiers ou les plateformes, qu'elle soit cachée ou visible.
8. La façade CV expose uniquement le chargement/la sauvegarde du profil ; elle
   n'a pas de catalogue de connecteurs, d'écriture dans le presse-papiers ni
   d'ouverture d'onglets externes.
9. La future assistance in-page ne peut pas être implémentée comme un remplacement
   implicite : ses états, permissions, injection de page, acceptation par
   l'utilisateur, erreurs, retries et états terminaux nécessitent d'abord leur
   propre modèle.

## Helpers purs conservés

- `mergeExperiences(current, incoming)` — déduplication + complément contrôlé.
- `recomputePositionIndex(experiences)` — ordonnancement sans discontinuité.
- `normalizeExperience(draft)` — nettoie et applique `isCurrent ↔ endDate`.

Le helper retiré `buildPlatformPayloads` ne fait pas partie de l'API de domaine du CV.
