# Modèle de workflow de suivi des candidatures

Source de vérité pour le pipeline local de candidatures, la persistance fidèle (truthful persistence), les mutations révisées, l'Undo avec compare-and-swap (CAS), la réconciliation lors du redémarrage du worker et le point de coupure (seam) désactivé de persistance vers le dashboard connecté.

Le statechart exécutable est `application-tracking.machine.ts` ; les types stricts et les validateurs purs de corrélation et de règlement (settlement) résident dans `application-tracking.machine.contract.ts`, tandis que les guards et actions XState typés se trouvent dans `application-tracking.machine.logic.ts`. Ces fichiers de modèle émettent des commandes d'effet mais n'effectuent aucun I/O. Le Core possède la validation de domaine et les décisions relatives aux candidats/CAS/digest. Le Shell possède IndexedDB, les horloges, les UUID, la messagerie runtime, l'enregistrement des acteurs et l'exécution des effets.

## Périmètre de livraison (Delivery boundary)

Deux niveaux de livraison ne doivent jamais être confondus :

- **Implémenté et vérifié au commit `d32d76b8` : Task 5 / wire v1.** Les échecs de stockage sont fidèles (truthful), les réponses sont strictes, l'état de l'UI reste confirmé, et le succès/Undo se situe en aval d'un accusé de réception de persistance.
- **Cible revue, non preuve d'implémentation : Task 5b / wire v2.** Les enveloppes, le ledger, les acteurs par mission, le CAS, les points de contrôle (checkpoints), la réconciliation, la migration v3 et le seam désactivé d'outbox décrits ci-dessous demeurent non implémentés tant que leurs tests RED et leur intégration Shell n'existent pas.

Créer le fichier de machine rend le comportement exécutable en tant que modèle ; cela ne prouve pas que le background, le stockage, le bridge, le scan ou l'UI le consomment.

## Pipeline de domaine

Les statuts canoniques et les transitions proviennent uniquement de `@pulse/domain` :

```ts
type ApplicationStatus =
  | 'detected'
  | 'selected'
  | 'application_prepared'
  | 'applied'
  | 'interview'
  | 'offer'
  | 'accepted'
  | 'rejected'
  | 'archived';
```

| Depuis                 | Cibles autorisées                             |
| ---------------------- | --------------------------------------------- |
| `detected`             | `selected`, `archived`                        |
| `selected`             | `application_prepared`, `applied`, `archived` |
| `application_prepared` | `applied`, `archived`                         |
| `applied`              | `interview`, `offer`, `rejected`, `archived`  |
| `interview`            | `offer`, `rejected`, `archived`               |
| `offer`                | `accepted`, `rejected`, `archived`            |
| `accepted`             | `archived`                                    |
| `rejected`             | `archived`                                    |
| `archived`             | `detected`                                    |

`accepted`, `rejected` et `archived` mettent fin à la planification des relances et forcent `nextActionAt = null` dans le même commit. Ce sont des résultats arrêtés (settled outcomes) mais pas tous des états absorbants : seule la table ci-dessus autorise une ré-entrée.

Un LLM peut générer du contenu ou des signaux. Il ne choisit jamais un statut, un ID de mutation, une révision, un résultat CAS ou une transition d'état.

## Wire v1 de la Task 5 — contrat actuel

Le wire v1 reste exact. La Task 5b ne doit pas élargir ses schémas.

```ts
type ApplicationTrackingIntentV1 = 'load' | 'transition' | 'details' | 'restore';

type Task5ApplicationTrackingErrorCode =
  | 'LOAD_FAILED'
  | 'PERSIST_FAILED'
  | 'INVALID_TRANSITION'
  | 'INVALID_DETAILS'
  | 'INVALID_RESTORE'
  | 'TRANSPORT_ERROR'
  | 'PROTOCOL_ERROR';

interface SerializedApplicationTrackingErrorV1 {
  version: 1;
  code: Task5ApplicationTrackingErrorCode;
  intent: ApplicationTrackingIntentV1;
  missionId: string | null;
  mutationId: null;
  message: string;
  recoverable: boolean;
}
```

La seule réponse d'échec en v1 est `TRACKING_FAILED`. Les quatre codes de la Task 5b `STALE_UNDO`, `APPLICATION_BUSY`, `CANCELLED` et `WORKER_RESTARTED` restent invalides en v1. Un ID de mutation non nul en v1 est invalide. Les discordances de code/intent/message/recoverable/identité deviennent une erreur locale à l'UI `PROTOCOL_ERROR`.

Le règlement (settlement) v1 reste :

```text
GET_TRACKINGS
  success -> TRACKINGS_RESULT(vrais enregistrements normalisés, y compris [] réel)
  failure -> TRACKING_FAILED(LOAD_FAILED)

UPDATE_TRACKING / UPDATE_TRACKING_DETAILS
  invalid -> TRACKING_FAILED(INVALID_*)
  committed -> TRACKING_UPDATED(enregistrement confirmé exact)
  storage failure -> TRACKING_FAILED(PERSIST_FAILED)

RESTORE_TRACKING
  invalid -> TRACKING_FAILED(INVALID_RESTORE)
  committed -> TRACKING_RESTORED({ missionId, enregistrement exact ou null })
  storage failure -> TRACKING_FAILED(PERSIST_FAILED)
```

Après la migration des enveloppes v3, les contextes v1 obsolètes sont des adaptateurs de compatibilité :

- le GET v1 projette uniquement les enveloppes v2 actives en `MissionTracking[]` ;
- **chaque écriture v1** (`UPDATE_TRACKING`, `UPDATE_TRACKING_DETAILS` et `RESTORE_TRACKING`) échoue de manière étanche (fails closed) en tant que `PROTOCOL_ERROR` v1, car la v1 ne transporte ni `dataEpoch` ni token de mutation émis par l'appelant. Un panneau v1 antérieur à une réinitialisation ne doit jamais pouvoir créer la révision 1 dans un jeu de données réinitialisé ;
- l'installation/mise à jour invalide et recharge les contextes d'extension obsolètes. Déduire un token d'Undo à partir du stockage actuel est interdit.

## Identifiants de la Task 5b et epoch du jeu de données

```ts
type MutationId = string; // UUID v4 canonique en minuscules
type TrackingDataEpoch = MutationId;
```

L'expression régulière exacte acceptée pour l'UUID est :

```text
^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

- Le Shell injecte les identifiants via `crypto.randomUUID()` ; le Core et la machine ne les génèrent jamais.
- Une intention explicite reçoit un seul ID de mutation.
- Une nouvelle tentative après un échec certain constitue une nouvelle intention avec un nouvel ID.
- L'incertitude de transport ou de worker conserve le même ID et réconcilie ; elle ne rejoue jamais la mutation.
- `dataEpoch` identifie la durée de vie de l'ensemble du jeu de données local. Elle est stockée dans `tracking_meta`, répétée par les enveloppes et le ledger, et transportée par chaque message v2 de mutation, réponse, réconciliation et annulation.
- Une réponse ou requête provenant d'une ancienne data epoch est invalide et ne peut modifier ni l'UI ni le stockage. La durée de vie d'un worker utilise un UUID `workerEpoch` distinct.

```ts
interface TrackingMetaV1 {
  key: 'tracking_meta';
  schemaVersion: 1;
  dataEpoch: TrackingDataEpoch;
  collectionRevision: number; // entier sûr, commence à 0
}
```

La ligne de métadonnées est créée dans la même transaction de migration data-v3 que les enveloppes héritées. Une base de données fraîchement créée après réinitialisation génère une nouvelle epoch avant toute admission.

## Wire v2 additif

La v2 utilise des discriminants distincts ; les discriminants et schémas v1 restent inchangés.

```ts
type PublicTrackingMutationIntentV2 = 'transition' | 'details' | 'restore';
type TrackingMutationIntentV2 = PublicTrackingMutationIntentV2;

type TrackingV2Request =
  | {
      type: 'GET_TRACKING_ENVELOPES_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch | null;
        requestId: MutationId;
        cursor: string | null;
        snapshotRevision: number | null;
      };
    }
  | {
      type: 'UPDATE_TRACKING_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        mutationId: MutationId;
        missionId: string;
        status: ApplicationStatus;
        note?: string;
      };
    }
  | {
      type: 'UPDATE_TRACKING_DETAILS_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        mutationId: MutationId;
        missionId: string;
        nextActionAt: string | null;
      };
    }
  | {
      type: 'RESTORE_TRACKING_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        mutationId: MutationId;
        missionId: string;
        previousTracking: MissionTracking | null;
        expectedCurrentRevision: number;
        expectedCurrentMutationId: MutationId;
      };
    }
  | {
      type: 'RECONCILE_TRACKING_MUTATION_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        mutationId: MutationId;
        missionId: string;
        intent: PublicTrackingMutationIntentV2;
        commandDigest: string;
      };
    }
  | {
      type: 'CANCEL_TRACKING_MUTATION_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        mutationId: MutationId;
        missionId: string;
        intent: PublicTrackingMutationIntentV2;
        commandDigest: string;
      };
    };
```

```ts
type TrackingV2Response =
  | {
      type: 'TRACKING_ENVELOPES_RESULT_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        requestId: MutationId;
        snapshotRevision: number;
        cursor: string | null;
        nextCursor: string | null;
        complete: boolean;
        envelopes: PersistedTrackingEnvelopeV2[];
      };
    }
  | {
      type: 'TRACKING_LOAD_RESTART_REQUIRED_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        requestId: MutationId;
        currentSnapshotRevision: number;
      };
    }
  | {
      type: 'TRACKING_EPOCH_CHANGED_V2';
      payload: {
        version: 2;
        requestId: MutationId;
        requestedDataEpoch: TrackingDataEpoch;
        currentDataEpoch: TrackingDataEpoch;
        action: 'restart_bootstrap';
      };
    }
  | {
      type: 'TRACKING_COMMITTED_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        intent: PublicTrackingMutationIntentV2;
        missionId: string;
        mutationId: MutationId;
        commandDigest: string;
        envelope: PersistedTrackingEnvelopeV2;
        undo: TrackingUndoTokenV2;
        deduplicated: boolean;
      };
    }
  | { type: 'TRACKING_RECONCILED_V2'; payload: TrackingReconciliationV2 }
  | { type: 'TRACKING_FAILED_V2'; payload: SerializedApplicationTrackingErrorV2 }
  | {
      type: 'TRACKING_ENVELOPE_BROADCAST_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        envelope: PersistedTrackingEnvelopeV2;
      };
    };
```

Les schémas sont stricts et bornés. `GET_TRACKING_ENVELOPES_V2.dataEpoch` est null uniquement pour le premier bootstrap ou immédiatement après un `TRACKING_EPOCH_CHANGED_V2` corrélé ; chaque continuation ou redémarrage envoie l'epoch renvoyée par la première page. Si un panneau présente une ancienne epoch non nulle, le worker renvoie uniquement `TRACKING_EPOCH_CHANGED_V2` : aucune enveloppe, aucun curseur ni donnée de l'ancienne epoch. Le panneau ne l'accepte que lorsque `requestId` et `requestedDataEpoch` correspondent exactement à son Load, élimine les effets intermédiaires (staging/pending), puis démarre une nouvelle requête avec epoch null et cursor null. Tout autre succès ou échec doit correspondre exactement en version, epoch, request ID, ID de mutation, mission, intention et digest.

### Limites normatives et Load paginé

Les mêmes constantes Core exportées doivent régir les schémas wire, la validation de stockage et la migration :

```ts
const TRACKING_MISSION_ID_MAX_CHARS = 256;
const TRACKING_NOTE_MAX_CHARS = 2_048;
const TRACKING_NOTES_MAX_CHARS = 10_000;
const TRACKING_HISTORY_MAX_ITEMS = 200;
const TRACKING_ASSET_IDS_MAX_ITEMS = 100;
const TRACKING_RECORD_MAX_BYTES = 40_000;
const TRACKING_ENVELOPE_MAX_BYTES = 85_000;
const TRACKING_LEDGER_MAX_BYTES = 2_048;
const TRACKING_OUTBOX_MAX_BYTES = 45_000;
const TRACKING_LOAD_PAGE_MAX_ITEMS = 50;
const TRACKING_LOAD_PAGE_MAX_BYTES = 512_000;
const TRACKING_CURSOR_MAX_CHARS = 512;
const TRACKING_EFFECT_IDS_MAX_ITEMS = 256;
const TRACKING_DIAGNOSTIC_WARNING_BYTES = 64 * 1024 * 1024;
const TRACKING_MIN_QUOTA_HEADROOM_BYTES = 1024 * 1024;
```

Il n'y a pas de GET v2 filtré. Un chargement complet inclut les enregistrements et les tombstones. Le curseur est un encodage opaque, validé par le worker, de `dataEpoch`, `snapshotRevision` et du dernier missionId, et s'utilise avec un intervalle de clés exclusif ; les clients ne le construisent jamais.

`tracking_meta.collectionRevision` est incrémenté lors de chaque Tx B d'enveloppe. La première page fige `snapshotRevision` ; chaque page suivante doit la présenter. Si la révision méta a changé, le worker renvoie `TRACKING_LOAD_RESTART_REQUIRED_V2` et le panneau élimine son instantané en attente (staging snapshot) et redémarre avec cursor null. Deux redémarrages automatiques de lecture sont autorisés ; une instabilité persistante fait remonter `LOAD_FAILED`.

Le panneau s'abonne aux broadcasts avant la page un, met en attente (stage) les pages sans remplacer la collection confirmée, et publie la map complète mise en attente uniquement après `complete:true`. Un chargement échoué ou redémarré préserve la map confirmée antérieure. Les broadcasts reçus durant la pagination sont fusionnés par révision dans les maps de staging et confirmées. Les tombstones signifient que l'absence d'une page n'est jamais interprétée comme une suppression.

### Digest canonique de commande

Le Core produit une représentation UTF-8 RFC 8785/JCS d'un tuple ordonné ; le Shell calcule le SHA-256 hexadécimal en minuscules une seule fois et la machine/stockage comparent ce digest :

```text
^[0-9a-f]{64}$
```

```text
transition = [2,dataEpoch,"transition",missionId,to,noteOrNull]
details    = [2,dataEpoch,"details",missionId,canonicalIsoOrNull]
restore    = [2,dataEpoch,"restore",missionId,expectedRevision,
              expectedMutationId,canonicalPreviousTrackingOrNull]
```

Toutes les chaînes de caractères sont en Unicode NFC ; `undefined` se normalise en `null` ; les dates valides utilisent `toISOString()` en UTC ; les clés d'objets de suivi et les tableaux imbriqués utilisent l'ordre canonique du wire. Les vecteurs de test doivent figer l'Unicode, l'ordre des clés, undefined/null, les décalages de dates et les instantanés de restauration. Une discordance de digest pour un ID de mutation existant n'est jamais récupérable en recalculant la commande.

Les premiers vecteurs immuables SHA-256/JCS sont :

| Cas                                         | JSON UTF-8 canonique                                                                          | SHA-256 en minuscules                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| transition/null                             | `[2,"11111111-1111-4111-8111-111111111111","transition","mission-1","selected",null]`         | `3859a05e023fd89e6eb8c42bf2069c950a45bb5f86f872948491abca2b61912c` |
| entrée Unicode décomposée normalisée en NFC | `[2,"11111111-1111-4111-8111-111111111111","transition","mission-é","selected","café"]`       | `0d2f3269f4b3d70a1d37d32eafb87c245625c50a39f281d146159604f38c4069` |
| details `2026-07-15T10:30:00+02:00`         | `[2,"11111111-1111-4111-8111-111111111111","details","mission-1","2026-07-15T08:30:00.000Z"]` | `0ef55b59988a854410a60082ff6d4bcda4e8746165742395f5b3660534e39e17` |
| details undefined ou null                   | `[2,"11111111-1111-4111-8111-111111111111","details","mission-1",null]`                       | `b2d12bf5d004e0fa98a0fb72ebc5b34c23198a26eb150fcdc57273120531484d` |

Une fixture de restauration avec des clés d'objet délibérément permutées doit avoir un hash identique à sa fixture avec l'ordre de clés canonique ; cette fixture est générée à partir du schéma borné partagé `MissionTracking` plutôt que maintenue comme un second sérialiseur écrit à la main.

## Enveloppe canonique, tombstone et Undo

```ts
interface TrackingRevisionTokenV2 {
  dataEpoch: TrackingDataEpoch;
  revision: number; // entier sûr >= 0 ; zéro signifie aucune enveloppe pour l'instant
  lastMutationId: MutationId | null;
}

interface PersistedTrackingEnvelopeV2 {
  schemaVersion: 2;
  dataEpoch: TrackingDataEpoch;
  missionId: string;
  kind: 'record' | 'tombstone';
  tracking: MissionTracking | null;
  revision: number; // entier sûr >= 1
  lastMutationId: MutationId | null;
  lastMutationIntent: TrackingMutationIntentV2 | null;
  committedAt: number;
  undoBase: {
    previousTracking: MissionTracking | null;
    expectedCurrentRevision: number;
    expectedCurrentMutationId: MutationId;
  } | null;
}

interface TrackingUndoTokenV2 {
  version: 2;
  dataEpoch: TrackingDataEpoch;
  missionId: string;
  previousTracking: MissionTracking | null;
  expectedCurrentRevision: number;
  expectedCurrentMutationId: MutationId;
}
```

Invariants des enveloppes :

1. `record` si et seulement si tracking est non-null ; `tombstone` si et seulement si tracking est null.
2. Un tracking non-null reprend l'identité de la mission et est entièrement canonique.
3. La révision est monotone par mission à travers l'écriture, le tombstone et la recréation.
4. Une suppression normale écrit un tombstone ; elle ne supprime jamais la clé.
5. La migration héritée crée la révision 1 avec une dernière mutation, une intention et un Undo nuls.
6. `undoBase`, lorsqu'il est présent, répète exactement la révision et la mutation de cette enveloppe.
7. Seule l'enveloppe la plus récente conserve un instantané d'Undo, ce qui limite le stockage à un seul instantané de suivi supplémentaire par mission.
8. Une première commande publique de transition/details peut matérialiser `detected` au sein de son candidat pur ; elle produit toujours une révision atomique et un Undo exact.
9. Tout dépassement de révision échoue avant l'écriture.
10. Une intention de details/restore nouvellement identifiée et valide valide une révision même lorsque son tracking candidat est identique en octets à la base. L'UI peut supprimer les commandes redondantes, mais la sémantique de stockage ne dépend jamais de cette projection.

L'UI stocke les enveloppes confirmées. Sa map active publique exclut les tombstones ; sa map interne d'enveloppes conserve les tombstones pour la sécurité des révisions. Un `undoBase` chargé ne crée jamais spontanément de toast/Undo après le rechargement du panneau.

Après chaque commit d'enveloppe complété, le worker diffuse `TRACKING_ENVELOPE_BROADCAST_V2`. Chaque panneau ouvert l'applique selon cette règle exacte :

1. `dataEpoch` différente -> ignorer et exiger un nouveau Load ;
2. aucune enveloppe locale ou révision plus élevée -> appliquer la projection de l'enveloppe ;
3. révision égale et enveloppe canonique équivalente en octets -> no-op ;
4. révision égale avec un contenu différent -> incident de protocole et nouveau Load ;
5. révision inférieure -> ignorer comme obsolète.

Un broadcast met à jour l'état confirmé uniquement. Il ne crée jamais de toast de succès ni d'Undo. La réponse à la requête ou la réconciliation avec le même ID reste la seule source de succès/Undo pour le panneau à l'origine de l'intention. Cela maintient les autres panneaux latéraux à jour sans leur attribuer la mutation.

## Ledger durable de mutations

```ts
type TrackingMutationPhaseV2 =
  'prepared' | 'committed' | 'rejected' | 'failed' | 'cancelled' | 'worker_restarted';

interface PersistedTrackingMutationV2 {
  schemaVersion: 2;
  dataEpoch: TrackingDataEpoch;
  mutationId: MutationId;
  missionId: string;
  intent: TrackingMutationIntentV2;
  commandDigest: string;
  phase: TrackingMutationPhaseV2;
  ownerWorkerEpoch: MutationId;
  baseRevision: number;
  baseLastMutationId: MutationId | null;
  committedRevision: number | null;
  failureCode: ApplicationTrackingErrorCodeV2 | null;
  createdAt: number;
  settledAt: number | null;
}
```

Le keyPath est le `mutationId` globalement unique. Le Core pur canonise la commande bornée et dérive `commandDigest` ; la machine ne fait que comparer le digest fourni. Un même ID avec une epoch/mission/digest différente constitue un `PROTOCOL_ERROR` et n'écrit aucun enregistrement métier.

Le ledger est conservé jusqu'à une réinitialisation locale coordonnée. Cela rend déterministe la remise d'anciens doublons, même après des écritures plus récentes.

Les diagnostics de stockage surveillent le nombre de lignes d'enveloppes, de tombstones, de ledger et d'outbox, ainsi qu'une estimation des octets sérialisés. L'avertissement logiciel (soft warning) exact est déclenché dès que l'estimation des octets de suivi atteint 64 Mio ou que `navigator.storage.estimate()` indique `usage / quota >= 0.80`. Avant Tx A et à nouveau avant Tx B, le Shell rejette une écriture dont la marge restante est prévue comme inférieure à 1 Mio. Ce rejet ainsi que chaque `QuotaExceededError` sont réglés comme `PERSIST_FAILED` ; aucun ne compacte les ledgers ni les tombstones. Un quota inconnu ne constitue pas une autorisation de compacter : la transaction observée tentée reste la source de vérité. Aucun nettoyage de rétention ne peut rendre à nouveau admissible un ancien ID de mutation.

La validation en régime permanent est étanche aux échecs (fail-closed) par domaine :

- une enveloppe v2, une ligne tracking-meta ou une ligne de ledger invalide verrouille (fences) toute admission de suivi et fait remonter `LOAD_FAILED`/`PERSIST_FAILED` avec des diagnostics ; elle n'est jamais mise en quarantaine, supprimée ni silencieusement normalisée, car elle peut constituer une preuve d'idempotence actuelle ;
- une ligne d'outbox désactivée invalide est isolée dans `quarantine` sans altérer l'enveloppe/ledger local déjà validé ni prétendre à une livraison distante ;
- les enregistrements invalides sans rapport de mission ou profil conservent la politique existante de quarantaine en migration/runtime et ne peuvent autoriser la réparation du suivi.

Le chemin inutilisé `trackStage`/pipeline par défaut ne fait pas partie du runtime de scan actif et ne doit pas être transformé en une nouvelle mutation métier. La Task 5b retire son writer brut ou rend l'étape morte pure, puis ajoute un test d'architecture prouvant qu'aucun chemin de scan n'écrit de suivi. Un suivi manquant demeure logiquement `detected` jusqu'à ce qu'une commande publique explicite de transition ou details le matérialise. Un tombstone n'est jamais rouvert par la découverte d'un scan.

## Protocole de transaction

L'ordre de validation est obligatoire :

1. Attendre la barrière globale de démarrage du suivi : migration, chargement de l'epoch et récupération des points de contrôle (checkpoints) orphelins.
2. Valider la forme wire et dériver le digest de commande exact sans I/O.
3. Exécuter un preflight pur contre le canonique hydraté de l'acteur. Une intention de domaine/entrée/restauration déjà invalide est rejetée sans aucune ligne de ledger.
4. **Tx A** couvre `mission_tracking` + `tracking_mutations` : relire l'enveloppe, vérifier le token de base de l'acteur, résoudre un ledger existant, puis insérer `prepared` avec la révision et le lastMutation effectivement lus. Tx A renvoie cet instantané immuable.
5. Le Core construit le candidat à partir de l'instantané de Tx A, hors d'IndexedDB et avec le temps injecté. La construction du candidat n'effectue aucun I/O.
6. **Tx B** exige de manière atomique le même propriétaire/digest/mission/epoch préparés, exige que l'enveloppe soit égale au token de base de Tx A, réexécute le guard pur de domaine/CAS, puis écrit la révision d'enveloppe + 1 et le ledger `committed`. La capacité de production de la Task 5b étant désactivée, le store outbox reste intact.
7. Répondre et diffuser uniquement après `tx.oncomplete`.

Si Tx A constate une dérive de la base, elle écrit un règlement terminal de ledger dans cette même transaction et renvoie la relecture canonique :

- restore est directement réglé en `rejected/STALE_UNDO` avec le canonique frais ;
- transition/details sont directement réglés en `rejected/APPLICATION_BUSY` avec le canonique frais ;
- aucune commande n'est recalculée ni rejouée contre la nouvelle base.

Tx B répète la même comparaison. Une dérive entre A et B règle le ledger existant comme rejeté dans Tx B, n'écrit aucune enveloppe et laisse le store outbox intact. Si Tx B avorte, l'atomicité enveloppe/ledger est préservée et le store outbox reste toujours intact ; une Tx C au mieux (best-effort) passe `prepared` à `failed`. Si Tx C échoue également, la récupération au démarrage à froid classifie l'orphelin en `worker_restarted`.

Les commandes invalides ne créent jamais `prepared`, et une dérive de base ne provoque jamais de rejeu implicite. Un candidat n'est jamais calculé à partir de la copie obsolète du preflight : seul l'instantané validé par Tx A peut alimenter la construction du candidat.

### Échecs techniques avant Tx A

Le rejet pur de forme ou de domaine est déterministe et ne crée aucun ledger. Un échec technique avant Tx A (preflight de quota, défaillance d'ouverture/barrière/stockage) suit un contrat différent :

1. Un échec ne peut être annoncé comme certain qu'après que `RECORD_TERMINAL_SETTLEMENT` a enregistré de manière durable l'epoch exacte, la mission, la mutation, l'intention, le digest et l'échec.
2. Son résultat transporte le `commandId` de l'effet, la génération courante et la phase `record_terminal`. Seul ce résultat peut publier `not_committed`.
3. Si la ligne terminale ne peut pas être observée comme validée, le Core produit un règlement `uncertain` ; l'acteur et la barrière de suivi restent verrouillés. L'UI peut réconcilier le même ID ou réinitialiser, mais ni le bridge ni l'acteur ne peuvent le rejouer.
4. Une tentative explicite ultérieure utilise un nouvel ID de mutation uniquement après un Load ou une réconciliation canonique. L'incertitude de livraison conserve l'ID d'origine pour les lectures de contrôle uniquement, jamais pour un second UPDATE.

Ainsi, un `PERSIST_FAILED` certain ne peut être suivi d'un commit tardif du même ID de mutation. Un échec non enregistrable ne feint jamais la certitude.

## Acteur par mission et responsabilité des effets

Un acteur XState représente une mission. Le Shell l'enregistre de manière synchrone avant le premier await. Le registre des acteurs, la création dynamique, la jonction aux promesses actives et l'arrêt des acteurs relèvent du Shell.

États de la machine :

```text
unhydrated -> hydrating -> ready
ready -> recordingTerminal|preparing|reconciling|settling
preparing -> committing|cancelling|reconciling|settling
committing -> cancelling|reconciling|settling
cancelling -> cancelled|reconciling|settling
recordingTerminal|reconciling -> settling
settling|cancelled -> ready|failed après une tentative de publication locale
tout état non final -> invalidating -> invalidated lors d'un RESET
```

La machine exécutable définit des événements discriminés en `SCREAMING_SNAKE_CASE`, des guards purs nommés et des mises à jour immuables `assign()`. Elle émet uniquement ces commandes d'effet pour le Shell :

- `READ_CANONICAL` ;
- `RECORD_TERMINAL_SETTLEMENT` ;
- `WRITE_PREPARED_CHECKPOINT` ;
- `COMMIT_TRANSACTION` ;
- `READ_SETTLEMENT` ;
- `RECORD_CANCELLATION` ;
- `ABORT_TRANSACTION` ;
- `JOIN_ACTIVE` ;
- `PUBLISH_SETTLEMENT` ;
- `BROADCAST_ENVELOPE` ;
- `INVALIDATE_ACTOR`.

Aucun appel à IndexedDB, messagerie runtime, horloge, UUID, crypto, toast ou réseau ne réside dans la machine.

Chaque commande d'effet transporte un `commandId` local à l'acteur strictement croissant et la `generation` de l'opération en cours. Le Shell doit envoyer `COMMAND_STARTED` avant tout I/O. Cet événement retire de manière atomique la commande de la file d'attente pending et consigne sa phase exacte (`hydrate`, `tx_a`, `tx_b`, `record_terminal`, `record_cancel`, `abort_tx_b`, `reconcile`, `publish`, `broadcast` ou `invalidate`). Chaque résultat asynchrone répète le command ID et la génération et n'est accepté que pour cette phase en cours d'exécution. Un résultat prématuré, tardif, de mauvaise phase, de mauvaise génération ou d'une commande déjà terminée est ignoré et ne peut affecter l'état canonique.

L'achèvement retire de manière atomique l'effet en cours d'exécution avant d'enfiler son successeur : résultat Tx-A -> candidat/Tx B, ou règlement terminal ; résultat Tx-B -> règlement terminal. Un résultat terminal retire également chaque commande en attente ou en cours d'écriture, d'interruption ou d'annulation pour l'opération avant publication. L'entrée en réconciliation incrémente la génération, efface toutes les commandes d'opération obsolètes et les effets en cours, puis émet l'unique `READ_SETTLEMENT` dans la nouvelle génération. Le Shell revérifie la génération immédiatement avant chaque effet ; une commande retirée ou ancienne ne doit jamais s'exécuter.

Concurrence sur une même mission :

- un même ID actif avec epoch/mission/intention/digest/base identiques rejoint la promesse ou l'effet actif ;
- un même ID avec une portée, une intention ou un digest différent renvoie `PROTOCOL_ERROR` ; il n'est jamais rétrogradé en Busy et n'écrit jamais ;
- un ID distinct pendant settling/preparing/committing/cancelling reçoit `APPLICATION_BUSY`, sans file d'attente cachée ;
- les acteurs de missions séparées progressent indépendamment ; le verrouillage court de stores IndexedDB ne constitue pas un état occupé global de l'application ;
- un Reconcile pour l'identité exacte active se joint ; une identité de contrôle valide distincte/inconnue effectue une lecture non perturbative du ledger et reçoit exactement un règlement ;
- les événements tardifs portant un ID de mutation, command ID, génération ou epoch obsolète sont ignorés.

### Résolution en cas d'annulation (Cancellation winner)

Cancel et Reconcile transportent et valident dataEpoch + missionId + mutationId + intent + digest de commande et se règlent via `TRACKING_RECONCILED_V2` ; il n'existe aucun accusé de réception d'annulation optimiste et le worker n'invente jamais une intention ou un digest manquant.

Une annulation ne peut l'emporter avant Tx A que lorsque le worker possède déjà le contexte de commande active correspondant (mêmes epoch, mission, ID de mutation, intention et digest). Une annulation inconnue ou préventive ne dispose d'aucune commande à authentifier, ne crée aucune ligne de ledger et lit en utilisant l'intention et le digest fournis par l'appelant. L'absence se règle en `not_committed/TRANSPORT_ERROR` ; elle ne peut réserver un ID de mutation pour une commande future. Un ID de contrôle inconnu distinct ne perturbe jamais la mutation active.

1. Avant le début de Tx A, Cancel l'emporte immédiatement : aucune ligne prepared n'existant, une ligne de ledger durable `cancelled` est écrite et l'appel original ainsi que l'appel Cancel se règlent en `not_committed/CANCELLED` seulement après l'achèvement de cette transaction.
2. Pendant Tx A, l'acteur consigne `cancelRequested`. Lorsque Tx A se termine, elle ne doit lancer ni la construction du candidat ni Tx B ; elle passe la ligne prepared à `cancelled` dans une transaction observée.
3. Entre Tx A et Tx B, le même règlement d'annulation durable s'applique.
4. Pendant Tx B, le Shell appelle `IDBTransaction.abort()` et attend l'événement terminal de transaction. `onabort` laisse Cancel l'emporter, après quoi une transaction observée distincte enregistre `cancelled`. `oncomplete` ou `InvalidStateError` signifie que le commit l'a emporté et force la réconciliation ; Cancel doit renvoyer `committed_current` ou `committed_superseded`.
5. Après commit/ack, Cancel ne fait que réconcilier le résultat validé.
6. Un Cancel en double rejoint ou lit le même règlement. Si la persistance de `cancelled` échoue, la mission reste verrouillée et réconcilie ; elle n'émet jamais un faux `CANCELLED`.

L'appelant de la mutation d'origine et l'appelant de Cancel peuvent recevoir des enveloppes distinctes, mais toutes deux dérivent d'un unique règlement durable. Aucun code ne peut annoncer une annulation avant que la phase du ledger ne soit validée.

## Undo par CAS

La restauration n'est valide que si toutes les conditions sont remplies dans le Core et à nouveau au sein de Tx B :

1. instantané null ou enregistrement canonique complet pour la même mission ;
2. l'enveloppe actuelle existe dans la même data epoch ;
3. la révision attendue est égale à la révision actuelle ;
4. l'ID de mutation attendu est égal au dernier ID de mutation actuel ;
5. l'instantané précédent demandé est égal à l'actuel `undoBase.previousTracking` ;
6. `undoBase` répète le token attendu.

Un défaut de structure est un `INVALID_RESTORE`. Une dérive de token ou d'instantané constitue un `STALE_UNDO`, n'écrit aucune enveloppe, laisse le store outbox intact, rafraîchit le canonique, supprime l'Undo obsolète et ne crée aucun effet de succès. Une restauration réussie constitue une nouvelle mutation/révision et peut elle-même produire un token de redo.

## Table de vérité de la réconciliation et du redémarrage

```ts
type TrackingReconciliationOutcomeV2 =
  'committed_current' | 'committed_superseded' | 'not_committed' | 'inconsistent' | 'uncertain';

interface TrackingSettlementIdentityV2 {
  version: 2;
  dataEpoch: TrackingDataEpoch;
  missionId: string;
  mutationId: MutationId;
  intent: PublicTrackingMutationIntentV2;
  commandDigest: string;
  deduplicated: boolean;
}

interface CommittedCurrentSettlementV2 extends TrackingSettlementIdentityV2 {
  outcome: 'committed_current';
  canonical: PersistedTrackingEnvelopeV2;
  committedRevision: number;
  undo: TrackingUndoTokenV2;
  failure: null;
  broadcastRequired: boolean;
}

interface CommittedSupersededSettlementV2 extends TrackingSettlementIdentityV2 {
  outcome: 'committed_superseded';
  canonical: PersistedTrackingEnvelopeV2;
  committedRevision: number;
  undo: null;
  failure: null;
  broadcastRequired: false;
}

interface FailedTrackingSettlementV2 extends TrackingSettlementIdentityV2 {
  outcome: 'not_committed' | 'inconsistent' | 'uncertain';
  canonical: PersistedTrackingEnvelopeV2 | null;
  committedRevision: null;
  undo: null;
  failure: SerializedApplicationTrackingErrorV2;
  broadcastRequired: false;
}

type TrackingReconciliationV2 =
  CommittedCurrentSettlementV2 | CommittedSupersededSettlementV2 | FailedTrackingSettlementV2;
```

Une cohérence stricte est obligatoire avant que le Core n'autorise la machine à assigner un règlement :

- l'identité inclut l'epoch exacte, la mission, la mutation, l'intention et le digest ;
- chaque enveloppe canonique a la même portée et ne peut pas régresser la révision de l'acteur ; une révision égale exige un contenu canonique équivalent en octets ;
- `committed_current` exige que la révision canonique, la dernière mutation, l'intention, l'Undo et la révision validée concordent exactement ;
- `committed_superseded` exige une révision canonique strictement supérieure à la révision validée et n'a ni Undo, ni échec, ni broadcast ;
- `not_committed` comporte un échec typé et aucune révision validée ni Undo ;
- `inconsistent` comporte un `PROTOCOL_ERROR`, verrouille l'acteur et ne diffuse jamais ;
- `uncertain` comporte un `PERSIST_FAILED`, `TRANSPORT_ERROR` ou `WORKER_RESTARTED`, verrouille l'acteur et n'autorise jamais de rejeu.

| Observation durable                                                                  | Résultat                                                                                | UI / effet                                                                           |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| ledger committed ; même révision canonique et dernière mutation                      | `committed_current`                                                                     | appliquer le canonique ; Undo exact ; succès une fois                                |
| ledger committed ; canonique plus récent                                             | `committed_superseded`                                                                  | appliquer le plus récent ; aucun ancien succès/Undo                                  |
| prepared d'une ancienne epoch ; aucun commit                                         | `not_committed` + `WORKER_RESTARTED`                                                    | régler l'orphelin ; appliquer le canonique ; rejeter                                 |
| prepared du worker actuel + acteur actif enregistré                                  | join                                                                                    | rejoindre la promesse active ; flag `deduplicated` spécifique à l'appelant           |
| prepared du worker actuel sans acteur enregistré                                     | `inconsistent` + `PROTOCOL_ERROR`                                                       | verrouiller la mission ; aucune attente/rejeu                                        |
| ledger failed/rejected/cancelled                                                     | `not_committed` + échec stocké                                                          | appliquer le canonique ; rejeter                                                     |
| aucun ledger ; le canonique ne référence pas l'ID                                    | `not_committed` + `TRANSPORT_ERROR`                                                     | appliquer le canonique ; rejeter ; ne jamais rejouer                                 |
| ledger/canonique illisible ou échec terminal non enregistrable de façon durable      | `uncertain` + échec technique typé                                                      | préserver le canonique ; verrouiller ; réconcilier/réinitialiser ; ne jamais rejouer |
| révision validée inférieure au canonique                                             | `committed_superseded` uniquement si le canonique est valide et strictement plus récent | dernier canonique ; aucun Undo/succès                                                |
| révision validée supérieure au canonique                                             | `inconsistent` + `PROTOCOL_ERROR`                                                       | verrouiller la mission                                                               |
| révision égale mais lastMutationId différent                                         | `inconsistent` + `PROTOCOL_ERROR`                                                       | verrouiller la mission                                                               |
| ledger committed mais enveloppe absente                                              | `inconsistent` + `PROTOCOL_ERROR`                                                       | verrouiller la mission                                                               |
| l'enveloppe référence l'ID mais le ledger est absent, epoch/kind/tracking impossible | `inconsistent` + `PROTOCOL_ERROR`                                                       | verrouiller la mission et diagnostics de domaine                                     |

`committed_current` exige en outre la mission, l'epoch, l'intention et le digest de commande exacts. Un doublon actuel peut recevoir `TRACKING_COMMITTED_V2` avec `deduplicated:true` ; le premier appelant admis reçoit `false`. Le Shell enveloppe chaque appelant joint séparément au lieu de partager une réponse déjà étiquetée. Tout doublon remplacé ou incohérent utilise `TRACKING_RECONCILED_V2`, jamais une ancienne enveloppe validée.

Preuve de crash :

| Point de crash                        | État durable                                       | Récupération déterministe             |
| ------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| avant Tx A                            | aucun ledger, aucun commit                         | non observé / non validé              |
| après Tx A, avant Tx B                | prepared uniquement                                | worker restarted / non validé         |
| pendant Tx B                          | choix atomique IDB                                 | prepared uniquement ou commit complet |
| après Tx B, avant ack                 | enveloppe + ledger committed ; store outbox intact | committed current                     |
| ack perdu, puis écriture plus récente | ledger committed + canonique plus récent           | committed superseded                  |

Chaque durée de vie de worker possède un `workerEpoch`. La barrière de démarrage attend les migrations, charge `dataEpoch`, puis règle de manière atomique les ledgers `prepared` détenus par d'anciens workers avant qu'un quelconque gestionnaire de suivi ne s'exécute. Un redémarrage ne rejoue jamais un candidat.

La barrière est observée et renouvelable, et non une promesse rejetée mise en cache :

- les appelants d'une même tentative partagent exactement une promesse de migration/récupération ;
- `{ok:false}` constitue un échec, jamais un état prêt ;
- un échec de migration rejette les Loads actuels avec `LOAD_FAILED` et les intentions actuelles de mutation avec leur `PERSIST_FAILED`, avant toute admission ou création de ledger ;
- un échec lors de la récupération des ledgers rejette les Loads avec `LOAD_FAILED` et les mutations avec `WORKER_RESTARTED`, le domaine de suivi restant verrouillé ;
- la commande explicite suivante démarre une nouvelle tentative sérialisée ; le succès ouvre l'admission, un nouvel échec maintient le verrouillage ;
- une réinitialisation préempte/annule les nouvelles tentatives de barrière et détient l'admission jusqu'à ce que son journal soit complété ;
- aucun appel d'acteur ou de stockage de suivi ne peut s'immiscer entre le succès de migration et le règlement de récupération.

En cas de rejet de transport, l'UI réconcilie le même ID une seule fois. Elle ne renvoie jamais UPDATE. Le panneau conserve uniquement les appels d'origine dans une map d'effets en attente, plafonnée à `TRACKING_EFFECT_IDS_MAX_ITEMS`. Il n'évince jamais un ID en attente : tant que 256 appels ne sont pas réglés, un 257e est rejeté localement avant tout envoi. Le règlement ne retire l'entrée en attente qu'après que son unique promesse appelante a consommé le succès/Undo local ; tout doublon tardif ne dispose d'aucun appelant en attente et peut fusionner l'état canonique sans pouvoir émettre d'effet. Un rechargement ne comporte aucun ID en attente et ne rejoue donc pas les effets à partir d'un `undoBase` persisté.

`PUBLISH_SETTLEMENT` n'attend qu'une seule tentative locale d'envoi runtime, et non l'accusé de réception d'un destinataire. Le Shell signale `PUBLICATION_ATTEMPTED` avec la commande, la génération, l'identité exactes et `delivered:true|false` ; l'une ou l'autre valeur est terminale pour l'acteur et le libère vers `ready` ou `failed`. Un panneau fermé ne peut donc pas bloquer une mission. Un redémarrage du worker invalide l'ancienne génération de publication et libère l'acteur récupéré ; l'appelant d'origine constate la perte de transport et réconcilie le même ID. L'échec de lecture lors de la réconciliation renvoie lui-même un règlement appelant `uncertain` et verrouille l'acteur au lieu de laisser la promesse silencieuse.

## Contrat d'erreur v2

```ts
type ApplicationTrackingErrorCodeV2 =
  | Task5ApplicationTrackingErrorCode
  | 'STALE_UNDO'
  | 'APPLICATION_BUSY'
  | 'CANCELLED'
  | 'WORKER_RESTARTED'
  | 'EPOCH_CHANGED';

interface SerializedApplicationTrackingErrorV2 {
  version: 2;
  dataEpoch: TrackingDataEpoch | null;
  requestId: MutationId | null;
  code: ApplicationTrackingErrorCodeV2;
  intent: 'load' | PublicTrackingMutationIntentV2;
  missionId: string | null;
  mutationId: MutationId | null;
  message: string;
  recoverable: boolean;
}
```

Load possède le `requestId` exact et des mission/mutation null. Son epoch est exacte lorsque le démarrage a atteint les métadonnées, et ne peut être null que lorsque le démarrage de migration/métadonnées a échoué avant qu'une epoch n'ait pu être établie. Les échecs de mutation publique ont `requestId:null` et transportent l'epoch, la mission et l'identité de mutation exactes.

| Code                 | Intention autorisée                        | Récupérable | Message stable                                                                                           |
| -------------------- | ------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------- |
| `LOAD_FAILED`        | load                                       | oui         | `Impossible de charger le suivi des candidatures.`                                                       |
| `PERSIST_FAILED`     | transition                                 | oui         | `Impossible d’enregistrer le nouveau statut.`                                                            |
| `PERSIST_FAILED`     | details                                    | oui         | `Impossible d’enregistrer les détails de suivi.`                                                         |
| `PERSIST_FAILED`     | restore                                    | oui         | `Impossible d’annuler la modification.`                                                                  |
| `INVALID_TRANSITION` | transition                                 | non         | `Ce changement de statut n’est pas autorisé.`                                                            |
| `INVALID_DETAILS`    | details                                    | non         | `Les détails de suivi sont invalides.`                                                                   |
| `INVALID_RESTORE`    | restore                                    | non         | `Cette annulation n’est pas valide.`                                                                     |
| `TRANSPORT_ERROR`    | `load`, `transition`, `details`, `restore` | oui         | `La confirmation du suivi n’a pas été reçue. Rechargez le suivi avant de réessayer.`                     |
| `PROTOCOL_ERROR`     | `load`, `transition`, `details`, `restore` | oui         | `La réponse du suivi est invalide. Rechargez le suivi avant de réessayer.`                               |
| `STALE_UNDO`         | restore                                    | non         | `Cette annulation n’est plus applicable car la candidature a changé.`                                    |
| `APPLICATION_BUSY`   | `transition`, `details`, `restore`         | oui         | `Une autre modification de cette candidature est en cours. Réessayez après son règlement.`               |
| `CANCELLED`          | `transition`, `details`, `restore`         | oui         | `La modification a été annulée avant son enregistrement.`                                                |
| `WORKER_RESTARTED`   | `transition`, `details`, `restore`         | oui         | `Le service de l’extension a redémarré avant de confirmer la modification. L’état local a été rechargé.` |
| `EPOCH_CHANGED`      | `transition`, `details`, `restore`         | oui         | `Les données locales ont été réinitialisées. Rechargez le suivi avant de continuer.`                     |

Récupérable signifie uniquement que la récupération explicite listée peut réussir. Cela n'autorise jamais de rejeu automatique. `STALE_UNDO` est définitivement non récupérable pour ce token.

## Point de coupure du dashboard connecté — désactivé dans la Task 5b

La capacité de production revue pour la Task 5b est exactement :

```ts
const PRODUCTION_CONNECTED_DASHBOARD_SYNC_CAPABILITY = { enabled: false } as const;
```

L'état Premium, le mode dev et la permission d'hôte Supabase ne constituent pas des preuves d'activation. Aucune entrée d'outbox de production, tentative d'enfilage, émetteur, ordonnanceur ou appel réseau n'est autorisé tant que cette capacité est false. La Task 5b crée uniquement un point de coupure (seam) local de schéma/store afin que la frontière désactivée soit explicite :

```ts
interface TrackingOutboxEntryV1 {
  schemaVersion: 1;
  dataEpoch: TrackingDataEpoch;
  mutationId: MutationId;
  missionId: string;
  localRevision: number;
  payload: MissionTracking | null;
  createdAt: number;
}
```

Aucun code de la Task 5b n'instancie cette interface : Tx B prouve zéro écriture dans l'outbox et l'extension prouve zéro fetch vers le dashboard. L'authentification, l'identité de compte de confiance, l'activation de l'enfilage, le payload distant, les accusés de réception, les baux (leases), le rejeu, la désactivation/reprise et la politique de conflit relèvent d'un futur modèle distinct et d'une suite RED dédiée. L'existence de ce store ne constitue pas un état prêt pour la livraison du dashboard.

## Migration et responsabilité du scan

La transition de base de données est définie dans `db-migration.model.md` :

- implémentation actuelle : DB 5 / data 2 ;
- cible de la Task 5b : DB 6 / data 3 ;
- la v6 ajoute les métadonnées de suivi, le mutation ledger, l'outbox et déplace l'index de statut vers `tracking.currentStatus` ;
- data v3 encapsule les suivis hérités valides en tant que révision 1 et met en quarantaine chaque suivi invalide de manière atomique, indépendamment de la politique globale de taux de rejet.

Tous les rédacteurs de suivi doivent consommer le use case de transaction de l'acteur. Les fonctions publiques brutes `saveTracking`/`deleteTracking` sont supprimées ou rendues privées. Le rédacteur brut mort `trackStage` est supprimé ou rendu pur ; les futurs imports de dashboard et les chemins de test/dev ne doivent pas introduire de rédacteur parallèle.

## Réinitialisation coordonnée

La réinitialisation est le workflow critique distinct décrit dans `local-data-reset.model.md` et `local-data-reset.machine.ts`. L'admission de suivi se ferme avant la mise au repos (quiescence) ; les acteurs reçoivent une invalidation d'epoch et aucun succès n'est possible tant que la suppression de la base, le nettoyage sélectif du stockage, la recréation de la base et la persistance d'une nouvelle data epoch ne sont pas tous terminés. Son journal durable est écrit avant la destruction et retiré en dernier. Une suppression bloquée ou une récupération post-suppression partielle reste verrouillée et réessayable ; elle ne signale jamais `reset:true`. Chaque requête, réponse, événement d'acteur et broadcast tardif d'une ancienne epoch est ignoré ou rejeté.

Pour chaque identité de commande unique active, jointe, en réconciliation ou en attente de publication, le Core fournit un règlement exact `not_committed/EPOCH_CHANGED` avec l'ancienne identité de commande. `RESET_INVALIDATED` n'est accepté que si cette liste couvre chaque identité en attente unique exactement une fois, que `resetId` et `nextDataEpoch` sont des valeurs UUID v4 canoniques en minuscules, et que `nextDataEpoch` diffère de l'epoch actuelle de l'acteur. Le registre du Shell doit distribuer (fan out) ce règlement d'identité unique à chaque appelant/promesse enregistré pour cette identité et épuiser chaque appelant exactement une fois avant de signaler l'invalidation tentée. L'acteur incrémente la génération, retire chaque commande et effet en cours, entre dans `invalidating`, et émet `INVALIDATE_ACTOR` transportant ces règlements ainsi que `resetId` et la nouvelle epoch. Le Shell tente chaque règlement d'appelant et retire l'entrée du registre ; `INVALIDATION_ATTEMPTED` déplace ensuite l'ancien acteur vers l'état terminal `invalidated`. Il ne peut jamais s'hydrater contre le nouveau jeu de données. Un acteur de la nouvelle epoch est une instance distincte.

## Transitions interdites

- Tout arc de statut absent de `APPLICATION_TRANSITIONS`.
- Succès candidat ou UI avant une Tx B terminée ou une réconciliation déterministe.
- Ledger `prepared` pour une commande déjà reconnue invalide.
- Recalcul ou rejeu après une dérive de base, une incertitude de transport ou un redémarrage du worker.
- File d'attente cachée pour la même mission avec des intentions distinctes.
- Restauration sans CAS exact de révision, mutation et instantané.
- Suppression physique de tombstone en dehors d'une réinitialisation coordonnée.
- Ancienne réponse en double projetant une enveloppe plus ancienne.
- Découverte de scan matérialisant ou rouvrant un suivi sans commande utilisateur.
- Enfilage outbox ou réseau alors que la capacité de production est désactivée.
- Rédacteur de suivi brut en dehors du use case transactionnel.
- Résultat sans command ID, génération et phase de démarrage exacts.
- Commande de mutation exécutable laissée en attente ou en cours après règlement ou entrée en réconciliation.
- Même ID de mutation avec un digest différent classifié comme Busy.
- Attente d'un accusé de réception de panneau ou destinataire pour libérer l'acteur.
- Succès de réinitialisation lorsque la suppression de la base de données est bloquée ou qu'une ancienne epoch tardive reste capable de modifier l'état.

## Invariants

1. Les transitions de domaine sont égales à `APPLICATION_TRANSITIONS`.
2. Chaque écriture d'enveloppe et règlement de ledger validé est atomique ; le store outbox désactivé reste intact.
3. La révision est strictement monotone à travers tombstone et recréation.
4. Un ID de mutation ne valide l'état métier qu'au plus une fois pour une data epoch donnée.
5. Un même ID avec une commande, identité ou epoch différente n'écrit jamais d'état métier.
6. Une commande invalide n'a aucun point de contrôle préparé (prepared checkpoint).
7. La dérive de base se règle sans rejeu de candidat.
8. L'UI confirmée ne devance jamais IndexedDB.
9. L'Undo suit un CAS exact et constitue lui-même une mutation versionnée.
10. Le redémarrage du worker réconcilie ; il ne rejoue jamais.
11. Un règlement supplanté (superseded) ne fait jamais régresser l'UI ni ne crée d'Undo obsolète.
12. Le statut terminal et la relance nulle sont validés de façon atomique.
13. L'historique est non vide, contigu, valide en transition, non décroissant dans le temps et se termine au statut actuel.
14. Le Core est pur ; la machine n'émet que des commandes d'effet ; le Shell possède tous les I/O.
15. La capacité de production du dashboard à false signifie zéro écriture outbox et zéro réseau.
16. La data epoch invalide chaque acteur, requête et réponse antérieurs à la réinitialisation.
17. La diffusion multi-panneaux n'est qu'une projection monotone ; elle n'émet jamais de succès ni d'Undo local.
18. La sortie d'un LLM ne décide jamais d'une transition.
19. Aucun résultat asynchrone ne peut régler ni faire avancer un effet qui n'a pas été démarré avec les mêmes command ID, génération et phase.
20. La réconciliation invalide tous les effets de mutation obsolètes avant de lire la vérité durable ; elle ne peut s'exécuter aux côtés d'une commande d'écriture rejouable.
21. Chaque appelant valide de Cancel ou Reconcile fournit intention + digest et reçoit une jonction, un échec de protocole ou un règlement de lecture durable/incertain.
22. L'achèvement de la publication signifie une tentative locale, jamais la disponibilité du destinataire.
23. La réinitialisation règle chaque appelant en attente et invalide définitivement l'ancien acteur avant que le registre ne l'arrête.

## Vérification RED requise avant implémentation

### Machine et Core

- les plans valides parcourent ready -> preparing -> committing -> ready ;
- un preflight invalide publie son échec typé sans aucune ligne de ledger ni point de contrôle `prepared` ;
- le même ID actif se joint ; un ID distinct sur la même mission est occupé (busy) ; une autre mission se poursuit ;
- un même ID avec une intention ou un digest différent renvoie Protocol, jamais Busy ;
- tout résultat antérieur à `COMMAND_STARTED`, avec une commande/phase/génération incorrecte, ou après achèvement est ignoré et laisse la commande ou l'état en attente inchangé ;
- un résultat valide de Tx-A/Tx-B retire son effet en cours d'exécution de façon atomique avant l'apparition de la commande ou du règlement suivant ;
- après achèvement complet de l'opération et publication, une nouvelle opération avec la même identité de mutation ne peut authentifier aucun ancien command ID ;
- l'entrée en réconciliation invalide les effets de mutation en file d'attente ou en cours avant que la lecture de nouvelle génération n'existe ;
- un Reconcile exact actif se joint ; un Cancel ou Reconcile distinct ou inconnu lit et reçoit un règlement sans perturber la mutation active ;
- un événement asynchrone portant un ID, une epoch, une commande ou une génération obsolète est ignoré ;
- une annulation avant commit avorte ; une annulation après commit réconcilie ;
- les tentatives de publication livrées et non livrées libèrent toutes deux l'acteur ; un redémarrage pendant la publication ne rejoue pas ni ne bloque ;
- la réinitialisation tente `EPOCH_CHANGED` pour chaque appelant avant l'invalidation terminale ;
- la réinitialisation rejette un ID de réinitialisation malformé ou en majuscules, une prochaine epoch malformée ou en majuscules, ou une prochaine epoch égale à l'epoch actuelle de l'acteur ;
- un règlement de réinitialisation par identité jointe unique est distribué exactement une fois à chaque appelant Shell enregistré pour cette identité ;
- committed-current rejette les instantanés d'Undo différents du undoBase canonique, tant dans le sens null-vers-enregistrement qu'enregistrement-vers-null ;
- un `PERSIST_FAILED` durable antérieur à Tx A rejette un règlement `CANCELLED` substitué ;
- chaque paire événement/état interdite préserve le contexte.

### Stockage transactionnel

- révisions 1 -> 2 ; tombstone -> la recréation reste monotone ;
- un doublon avec même ID et digest écrit l'historique une seule fois ;
- un ancien doublon renvoie superseded/latest, jamais une ancienne enveloppe ;
- un même ID avec un payload différent constitue un échec de protocole ;
- un Undo obsolète après écriture et après suppression/recréation n'effectue aucune écriture ;
- une défaillance de Tx B préserve l'atomicité enveloppe/ledger et laisse l'outbox intacte ;
- les dérives de Tx A et Tx B se règlent sans rejeu ;
- une commande invalide ne laisse jamais l'état prepared ;
- un échec technique certain avant Tx A possède un ledger terminal ; un échec non enregistrable est incertain/verrouillé et ne peut rejouer ;

### Redémarrage et messagerie

- les crashs avant Tx A, après Tx A, pendant Tx B, après Tx B et un ack perdu correspondent à la table de vérité ;
- les gestionnaires de démarrage et le scan attendent la barrière de migration/récupération ;
- la v1 reste stricte et chaque écriture v1 échoue de façon étanche après migration ;
- les schémas v2 appliquent l'UUID, l'epoch, l'identité, la matrice d'erreurs exacte et les tailles ;
- un Load d'une ancienne epoch reçoit uniquement `TRACKING_EPOCH_CHANGED_V2` corrélé, puis redémarre avec epoch et curseur nuls et sans anciennes données ;
- un échec de transport UI réconcilie une fois et ne renvoie jamais la mutation ;
- les règlements actuels, supplantés et non validés se projettent correctement ;
- deux panneaux convergent via un broadcast de révision supérieure tandis que seul l'émetteur reçoit succès/Undo ; les broadcasts obsolètes ou conflictuels à révision égale ne font pas régresser l'état ;
- le rechargement de panneau ne rejoue pas le succès/Undo persisté ;
- les guards de règlement rejettent une portée canonique étrangère, une révision inférieure, un conflit à révision égale et un résultat/erreur/Undo incohérent.

### Migration, scan, outbox et réinitialisation

- la migration d'enveloppe DB5/data2 legacy -> DB6/data3 est idempotente ;
- chaque suivi hérité invalide est mis en quarantaine dans la transaction de migration, quel que soit le taux de rejet ;
- les stores d'index de statut imbriqué, méta, ledger et outbox existent ;
- le `trackStage` mort n'effectue plus d'I/O et un guard statique interdit les rédacteurs de suivi bruts depuis tout chemin de scan ;
- la capacité désactivée de production ne produit aucune ligne d'outbox ni aucun fetch ;
- une suppression bloquée lors de la réinitialisation préserve son journal et son ancienne epoch, et signale un échec ;
- une réinitialisation réussie ordonne journal -> fermeture de l'admission -> mise au repos -> fermeture -> suppression DB -> effacement de session -> effacement local sélectif -> nouvelle DB/epoch -> diffusion -> suppression du journal ;
- un échec partiel post-suppression ne signale jamais un succès ; les événements tardifs d'une ancienne epoch sont rejetés.

## Critères de preuve de release (Release evidence gate)

La Task 5b ne peut être déclarée implémentée que lorsque :

1. ce modèle et cette machine reçoivent une approbation indépendante ;
2. les tests RED échouent pour le comportement manquant prévu ;
3. le stockage, le bridge, le background, le scan et l'UI consomment la machine et les effets ;
4. les tests de sécurité de migration et de réinitialisation réussissent ;
5. les suites de tests ciblées et complètes de l'extension, le typecheck, le lint, le formatage et le build réussissent ;
6. les preuves de l'extension au runtime démontrent la réconciliation d'ack perdu, l'Undo obsolète, la concurrence sur une même mission, le redémarrage du worker et tous les onglets visibles par l'utilisateur.

Jusque-là, seule la fidélité de la Task 5 wire-v1 constitue la preuve d'implémentation actuelle.
