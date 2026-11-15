# Modèle de capacité d'écriture pré-admission du Dataset

Source de vérité pour les écritures durables du Dataset qui doivent avoir lieu tant que l'admission métier ordinaire est encore fermée, ou tant que le Reset détient le fence du dataset. Ce modèle compose, sans les remplacer :

- `DatasetEpochAuthority` de `db-migration.model.md` ;
- les commandes et étapes exactes de démarrage de `dataset-startup.model.md` ;
- les états et phases exacts de Reset de `local-data-reset.model.md`.

Ce fichier constitue uniquement une porte de modélisation (model gate). Il définit le contrat que l'autorité et les adaptateurs Shell doivent implémenter après revue. Il n'autorise pas de second mutex, d'adaptateur de test permissif ou d'implémentation de production no-op.

## Problème et décision

`DatasetEpochAuthority.issueLease()` est intentionnellement indisponible avant `OPEN_EPOCH_ADMISSION`. Le démarrage doit néanmoins commiter la migration DB6/data3, l'encapsulation Settings V2 et le marqueur 3 avant que cette preuve d'ouverture n'existe. Le Reset doit également journaliser, détruire et reconstruire le dataset pendant que les baux métier sont fermés ou révoqués.

Ces écritures empruntent un chemin d'autorité distinct présentant ces propriétés :

1. exactement une revendication (claim) de commande de démarrage/Reset est active à la fois ;
2. la revendication déclare un plan d'écriture exact, ordonné et borné ;
3. chaque écriture durable reçoit une capacité (capability) à usage unique (one-shot) distincte ;
4. la revendication, l'émission, la consommation, la complétion, le Reset et le fencing d'échec partagent la FIFO d'autorité existante (`runWithGate`), sans verrou secondaire ;
5. la capacité est consommée avant que son adaptateur feuille (leaf adapter) durable enregistré ne soit invoqué ou attendu (`await`) ; les appelants ne fournissent jamais de callback asynchrone ;
6. toute dérive de commande/étape/tentative/époque/révision révoque la revendication ; une non-concordance de worker rejette, et la fin du worker détruit l'ensemble de son registre ;
7. un bail ordinaire reste impossible avant l'ouverture de l'admission.

Pour un Reset initial (fresh Reset), le preflight et la réservation constituent une seule opération au niveau de la porte externe (outer gate). L'autorité passe à `reset_pending` pour ce reset exact avant de retourner la preuve d'initialisation. La création du journal utilise ensuite un put-if-absent sous cette réservation. Il n'existe aucun intervalle non détenu entre le preflight initial, le journal et le fence du Reset A au cours duquel le Reset B pourrait réserver ou écraser le dataset.

Pour un journal restauré, `rehydrateResetPreAdmission` est la seule opération autorisée à créer une réservation de remplacement. Sous une seule position FIFO, elle relit le journal strict avec un opener en lecture seule inscrit sur liste blanche (allowlist), prouve une autorité physique compatible avec la phase, installe `reset_pending` pour ce même reset durable et retourne une **nouvelle réservation sous forme d'objet exact liée au worker actuel**. Le token de l'ancien worker n'est jamais cloné ni accepté. `acquireResetFence` promeut ensuite cette réservation de remplacement en `reset_owned` avant tout effet repris.

La capacité prouve l'admission d'un effet durable. Elle ne prouve pas que l'effet a réussi. Seules la relecture stricte de l'effet et l'événement de workflow propriétaire peuvent le faire.

## Vocabulaire exact

```ts
type DatasetPreAdmissionOwner = 'startup' | 'reset';

type DatasetPreAdmissionStage =
  | `startup:${DatasetStartupStage}`
  | 'reset:journaling'
  | 'reset:resolvingInitialJournal'
  | 'reset:acquiringFence'
  | 'reset:checkpointingFence'
  | 'reset:checkpointingQuiescence'
  | 'reset:closingDatabase'
  | 'reset:deletingDatabase'
  | 'reset:clearingSession'
  | 'reset:clearingLocal'
  | 'reset:reinitializing'
  | 'reset:aligningSettings'
  | 'reset:writingReceipt'
  | 'reset:checkpointingCommit'
  | 'reset:adoptingBackgroundHandoff'
  | 'reset:clearingBackgroundHandoff'
  | 'reset:clearingJournal'
  | 'reset:checkpointingFailure'
  | 'reset:checkpointingRetry'
  | 'reset:openingEpochAdmission'
  | 'reset:postClearAdmissionFailed';

type DatasetPreAdmissionWriteKind =
  | 'startup.structure.db6_upgrade_transaction'
  | 'startup.data.tracking_v3_transaction'
  | 'startup.data.settings_v2_wrap'
  | 'startup.data.marker3_write'
  | 'startup.prepared_ledgers.recovery_transaction'
  | 'startup.settings_recovery.envelope_write'
  | 'reset.journal.initial_put'
  | 'reset.journal.initial_resolve'
  | 'reset.journal.checkpoint_fenced'
  | 'reset.journal.checkpoint_quiesced'
  | 'reset.journal.checkpoint_handles_closed'
  | 'reset.database.delete'
  | 'reset.journal.checkpoint_database_deleted'
  | 'reset.session.clear'
  | 'reset.journal.checkpoint_session_cleared'
  | 'reset.local.selective_remove'
  | 'reset.journal.checkpoint_local_cleared'
  | 'reset.reinitialize.db6_transaction'
  | 'reset.reinitialize.settings_v2_generation_zero'
  | 'reset.reinitialize.marker3_write'
  | 'reset.journal.checkpoint_database_reinitialized'
  | 'reset.settings_recovery.envelope_write'
  | 'reset.journal.checkpoint_settings_aligned'
  | 'reset.receipt.put'
  | 'reset.journal.checkpoint_committed'
  | 'reset.journal.checkpoint_handoff_adopted'
  | 'reset.journal.checkpoint_handoff_cleared'
  | 'reset.journal.remove'
  | 'reset.journal.checkpoint_failure'
  | 'reset.journal.checkpoint_retry';

interface DatasetPreAdmissionWriteClaimV1 {
  version: 1;
  writeId: string; // UUID v4 canonique injecté
  writeKind: DatasetPreAdmissionWriteKind;
}

interface DatasetPreAdmissionCommandKeyV1 {
  version: 1;
  owner: DatasetPreAdmissionOwner;
  workflowId: string; // attemptId de démarrage ou resetId durable
  stage: DatasetPreAdmissionStage;
  commandId: string;
  attemptId: string; // tentative d'exécution, jamais réutilisée à travers redémarrage/retry
  workerEpoch: string;
}

interface ResetPreAdmissionReservationV1 {
  version: 1;
  kind: 'RESET_PRE_ADMISSION_RESERVED';
  origin: 'fresh_preflight' | 'journal_rehydration';
  resetId: string;
  previousDataEpoch: string | null;
  nextDataEpoch: string;
  settingsRecoveryRequestId: string;
  settingsBootstrapRequestId: string;
  requestedAt: number;
  workerEpoch: string;
  authorityRevision: number;
  fenceRevision: number;
  status: 'reset_pending';
  journalStatus: 'absent_proven' | 'outcome_unknown' | 'durable_proven';
}

interface DatasetPreAdmissionCommandClaimV1 extends DatasetPreAdmissionCommandKeyV1 {
  claimId: string; // UUID v4 canonique injecté
  dataEpoch: string | null;
  authorityRevision: number;
  fenceRevision: number;
  resetReservation: ResetPreAdmissionReservationV1 | null;
  writes: DatasetPreAdmissionWriteClaimV1[];
}

interface DatasetPreAdmissionCommandScopeV1 extends DatasetPreAdmissionCommandClaimV1 {}

interface DatasetPreAdmissionWriteCapabilityV1 {
  version: 1;
  capabilityId: string; // UUID v4 canonique alloué par l'autorité
  claimId: string;
  owner: DatasetPreAdmissionOwner;
  workflowId: string;
  stage: DatasetPreAdmissionStage;
  commandId: string;
  attemptId: string;
  workerEpoch: string;
  dataEpoch: string | null;
  authorityRevision: number;
  fenceRevision: number;
  resetReservation: ResetPreAdmissionReservationV1 | null;
  writeId: string;
  writeKind: DatasetPreAdmissionWriteKind;
  ordinal: number;
}

type DatasetPreAdmissionLeafAdapterId =
  | `dataset-pre-admission/${DatasetPreAdmissionWriteKind}/v1`
  | 'dataset-reset/preflight-authority-read/v1'
  | 'dataset-reset/rehydration-authority-read/v1';

interface DatasetPreAdmissionDurableLeafTokenV1 {
  version: 1;
  leafOperationId: string; // UUID v4 canonique alloué par l'adaptateur
  adapterId: `dataset-pre-admission/${DatasetPreAdmissionWriteKind}/v1`;
  claimId: string;
  writeId: string;
  writeKind: DatasetPreAdmissionWriteKind;
  workerEpoch: string;
}

interface ResetAuthorityReadLeafTokenV1 {
  version: 1;
  leafOperationId: string; // UUID v4 canonique alloué par l'adaptateur
  adapterId:
    'dataset-reset/preflight-authority-read/v1' | 'dataset-reset/rehydration-authority-read/v1';
  resetId: string;
  workerEpoch: string;
}

interface DatasetPreAdmissionCommandTerminalV1 extends DatasetPreAdmissionCommandKeyV1 {
  disposition: 'completed' | 'revoked';
  terminalFenceRevision: number;
}

type BackgroundSchedulingHandoffCapabilityKind =
  | 'reset.background_handoff.sidecar_initialize'
  | 'reset.background_handoff.slot_materialize'
  | 'reset.background_handoff.sidecar_cleanup';

type BackgroundSchedulingHandoffLeafAdapterId =
  | 'dataset-reset/background-handoff/sidecar-initialize/v1'
  | 'dataset-reset/background-handoff/slot-materialize/v1'
  | 'dataset-reset/background-handoff/sidecar-cleanup/v1';

interface BackgroundSchedulingHandoffCapabilityV1 {
  version: 1;
  capabilityId: string;
  kind: BackgroundSchedulingHandoffCapabilityKind;
  adapterId: BackgroundSchedulingHandoffLeafAdapterId;
  storageKey: 'missionpulse.backgroundSchedulingHandoff.v1';
  resetId: string;
  handoffId: string;
  sidecarId: string;
  workerEpoch: string;
  laneId: string;
  controlAttemptIndex: 0 | 1 | 2 | 3 | null;
  transitionIndex: number; // init=0, slots=1..131, cleanup=132
  casAttempt: 0 | 1 | 2;
  expectedCheckpointRevision: number | null;
  expectedPayloadDigest: string | null;
}
```

La famille handoff est fermée et préallouée avec la ligne de contrôle (control lane) de Reset avant l'admission ordinaire des tâches d'arrière-plan : 1 584 capacités CAS (quatre tentatives de contrôle, chacune avec trois CAS pour l'initialisation et chacun des 131 slots) et trois capacités de nettoyage (cleanup). La lane préalloue également un `sidecarId` canonique frais, distinct de la lane, du handoff, du worker, de la tentative, de la liaison et de chaque ID de capacité/feuille. Chaque capacité de CAS et de nettoyage porte ce même ID de sidecar ; l'adaptateur d'initialisation ne peut pas l'inventer ni le substituer. Chaque tuple exact `(kind,controlAttemptIndex,transitionIndex,casAttempt)` possède un UUID distinct et un adaptateur feuille enregistré correspondant issu de l'union des trois littéraux ; les substitutions de kind/adaptateur sont rejetées avant invocation. La seule clé est la clé littérale de sidecar ci-dessus. Aucun enregistrement d'adaptateur à l'exécution, callback d'appelant, fallback Chrome brut ou transfert d'une capacité du registre de travail n'est autorisé.

La machine de matérialisation du sidecar stocke de manière durable la cible figée, le digest et le curseur avant son premier CAS. Une lecture constatant que le curseur est déjà avancé renvoie sa relecture canonique sans consommer ni émettre de capacité ; les doublons utilisent par conséquent zéro ID et n'effectuent aucune écriture. Un conflit de CAS avec le bit toujours absent ne peut consommer que la tentative fraîche préallouée suivante. La cible de 131 slots est figée par un marqueur de boîte aux lettres (mailbox) total avant que le point de contrôle/la référence ne soit exposé(e). Ce marqueur ferme la **boîte aux lettres externe et la surface d'allocation** : aucun callback ne peut modifier la cible figée, demander une autre capacité ou entrer dans un adaptateur de sidecar, et chaque callback tardif reçoit l'état terminal exact de reset en cours avec zéro ID/écriture. Il n'annule pas l'exécuteur de point de contrôle interne. Tant que la référence n'est pas encore exposée, cet exécuteur ne peut consommer que l'entrée de manifeste déjà réservée pour l'initialisation ou pour un slot présent dans la cible immuable et encore absent du sidecar. Il ne peut pas allouer, substituer une entrée de lane/manifeste ou écrire un slot hors cible. Une fois la cible figée exacte entièrement matérialisée et relue, aucune transition de slot ne demeure admissible. Un échec ou un épuisement avant `chrome.storage.session.clear()` laisse le Reset avant l'effacement et n'efface rien. Le nettoyage est d'une nature différente et est indisponible jusqu'à la preuve d'adoption exacte ; il supprime uniquement le sidecar, prouve l'absence stricte, et ne peut pas couvrir le point de contrôle de journal de reset suivant.

Tous les identifiants sont des champs de données énumérables propres exacts. Les champs UUID sont des UUID v4 canoniques en minuscules. `claimId`, `attemptId`, `workerEpoch` et chaque `writeId` sont deux à deux distincts au sein d'un même scope ; chaque `capabilityId` et `leafOperationId` alloué est également distinct de ceux-ci et de tous les ID retenus. Pour le Startup, `workflowId` est intentionnellement un alias de `attemptId`. Pour le Reset, `workflowId` est l'identifiant de reset durable distinct. `commandId`, `stage`, `owner`, les ordinaux et les types d'écritures ne sont pas du texte libre : ils dérivent des tables de modélisation propriétaires ci-dessous. Les tableaux sont denses, à clés exactes, sous forme de copies figées (frozen) et bornés avant énumération.

`resetReservation` est littéralement `null` pour le Startup. Chaque revendication et capacité de Reset porte l'unique réservation sous forme d'objet exact enregistrée pour son `workflowId` ; un clone ou une réservation pour un autre reset est invalide.

La clé de commande terminale est exactement `{owner, workflowId, stage, commandId, attemptId, workerEpoch}`. La complétion et la révocation conservent cette clé complète en tant que tombstone. Un nouvel `claimId`, plan d'écriture ou ID de capacité ne peut pas la rouvrir.

Le scope, la capacité, la réservation et les deux variantes de token feuille retournés sont des tokens enregistrés sous forme d'objets exacts. Un clone par spread, un clone structuré, un Proxy, un objet pourvu d'accesseurs, un prototype personnalisé, une clé masquée ou de type Symbol est invalide, même si ses valeurs visibles paraissent identiques. Un token feuille ne contient que des données : il n'expose aucun élément appelable ni aucune dépendance de persistance. Son exécuteur privé est retrouvé uniquement via le registre d'adaptateurs privé au module inscrit sur liste blanche. L'autorité ne relit jamais une entrée brute après sa capture stricte.

## Identité de tentative et de commande

Pour le Startup :

- `workflowId === attemptId === DatasetStartupContext.attemptId` ;
- `workerEpoch` est égal à l'époque de worker capturée par la fabrique de l'autorité ;
- `stage` vaut `startup:${command.stage}` ;
- `commandId` est l'identifiant exact de la commande active : pour `settings_recovery`, `settings/recover/<settingsRecoveryRequestId>` ; pour toute autre étape de Startup avec mutation, `dataset-startup/<command.stage>/<attemptId>`.

Pour le Reset :

- `workflowId === LocalDataResetJournalV1.resetId` ;
- `attemptId` est un UUID éphémère d'exécution de Reset injecté par le Shell de confiance pour un intervalle d'exécution d'acteur ;
- chaque nouvelle tentative (retry) explicite de Reset et chaque redémarrage de worker alloue un `attemptId` frais, tandis que `resetId`, les deux époques de données et les deux ID de Settings demeurent inchangés ;
- `workerEpoch` est la même valeur que celle capturée par l'autorité ;
- `stage` est l'état actif exact de Reset issu de l'union ci-dessus ;
- `commandId` est exactement `local-data-reset/<state>/<resetId>/<attemptId>`.

La tentative d'exécution du Reset est une corrélation de capacité, et non un champ de journal durable supplémentaire. Un nouveau worker reconstruit les faits durables, alloue une nouvelle paire worker/tentative et ne peut pas accepter de token provenant du worker arrêté (dead worker).

## Règle de l'époque nullable

`dataEpoch` est l'époque de dataset observée spécifique à l'étape par l'autorité lors de la linéarisation de la revendication, et non une époque silencieusement copiée depuis un payload :

| Position de l'autorité/propriétaire                                                  | `dataEpoch` exact de la revendication                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Startup `closed_startup`, l'autorité n'a pas retenu d'époque canonique               | `null`                                                |
| Startup `closed_startup` après qu'un Reset a installé une époque suivante en attente | cette époque suivante en attente exacte               |
| Reset `journaling` sous sa réservation exacte `reset_pending`                        | `previousDataEpoch` réservée exacte, y compris `null` |
| Nettoyage de Reset jusqu'à `clearingLocal` sous `reset_owned`                        | `previousDataEpoch` exacte, y compris `null` littéral |
| Reset `reinitializing` jusqu'à `clearingJournal`                                     | `nextDataEpoch` exacte                                |

Lorsque l'autorité ne possède aucune époque, seul le `null` littéral est valide. Fournir à la place l'époque cible de la commande produit une erreur `DATA_EPOCH_MISMATCH`. Réciproquement, dès lors que l'autorité a retenu une époque exacte en attente ou courante, `null` est invalide. L'effet durable valide toujours la propre époque de son payload par l'intermédiaire de la preuve DB, Settings ou Reset ; un champ d'autorité nullable ne constitue jamais une autorisation d'écrire une époque arbitraire.

## Révisions d'autorité et de fence

`authorityRevision` est la révision d'autorité sûre non négative existante. L'extension de capacité ajoute une `fenceRevision` sûre non négative locale au worker afin de détecter les invalidations qui ne modifient pas nécessairement l'époque du dataset. Le snapshot d'autorité expose cette révision afin qu'un workflow de confiance puisse former une revendication exacte ; l'autorité la relit toujours lors de la linéarisation.

`fenceRevision` avance sous la FIFO partagée lorsque l'un de ces événements se linéarise :

- la complétion d'une commande active ou sa révocation explicite ;
- un changement de confiance d'étape, de commande, de workflow ou de tentative ;
- la prise de possession du fence de Reset ;
- l'installation d'une époque de Reset ;
- le fencing d'échec de démarrage ;
- le changement de révision d'autorité ou d'époque observée.

Chaque scope capture les deux révisions. Chaque émission et commit relit les deux au sein de la FIFO. Le dépassement de capacité (overflow) de révision fait basculer définitivement l'autorité en échec fermé (fail-close) ; elle ne revient jamais à zéro par bouclage. Un preflight de Reset initial réussi installe la réservation exacte `reset_pending` à ce même point de linéarisation FIFO. Les nouvelles revendications/capacités pour un autre reset sont alors refusées. La révocation totale des baux/capacités se linéarise lorsque cette réservation passe à `reset_owned` ; un commit déjà en avance par rapport à ce fence peut se stabiliser (settle), tandis qu'un commit en retard sur celui-ci observe le fence avancé et n'invoque aucun adaptateur durable.

## Registres bornés, sans éviction

Le worker conserve ces registres :

```text
MAX_PRE_ADMISSION_WRITES_PER_COMMAND = 256
MAX_RETAINED_PRE_ADMISSION_CLAIMS_PER_WORKER = 4096
MAX_RETAINED_PRE_ADMISSION_TERMINAL_KEYS_PER_WORKER = 4096
MAX_RETAINED_PRE_ADMISSION_WRITE_IDS_PER_WORKER = 16384
MAX_RETAINED_PRE_ADMISSION_CAPABILITIES_PER_WORKER = 16384
MAX_RETAINED_PRE_ADMISSION_LEAF_OPERATIONS_PER_WORKER = 32768
MAX_RETAINED_RESET_RESERVATIONS_PER_WORKER = 256
```

- un scope actif, ou aucun ;
- chaque ID de revendication jamais accepté dans ce worker ;
- chaque clé de commande terminale et sa disposition de complétion ;
- chaque ID de capacité et son état terminal (`consumed`, `settled` ou `revoked`) ;
- chaque ID d'écriture déclaré, y compris les écritures révoquées avant émission, et sa liaison de revendication ;
- chaque ID d'opération feuille enregistré, token sous forme d'objet exact, liaison d'adaptateur et état terminal (`prepared`, `entered`, `settled` ou `revoked`) ;
- chaque réservation de Reset et son token sous forme d'objet exact.

Les entrées terminées/révoquées ne sont jamais évincées ni réutilisées. L'atteinte d'une limite retourne `PRE_ADMISSION_REGISTRY_EXHAUSTED` avant l'invocation de l'allocateur ou la préparation du token feuille, et n'effectue aucun changement d'état d'autorité ou d'état physique. La reprise nécessite une nouvelle époque de worker, et non la suppression des preuves de rejeu au sein du worker. Les anciens tokens demeurent invalides car ils lient l'ancienne époque de worker et le registre d'objets exacts.

Aucune clé de commande terminale n'est évincée. Dès lors que `{owner,workflowId,stage,commandId,attemptId,workerEpoch}` est terminale, un `BEGIN` avec la même clé produit toujours `PRE_ADMISSION_COMMAND_TERMINAL`, même avec des ID de revendication/écriture frais. Seule une nouvelle tentative autorisée par la machine à états propriétaire peut former une clé non terminale. Une étape suivante au sein de la même tentative de Startup ne devient courante qu'après acceptation synchrone de l'événement de résultat antérieur par ce contrôleur privé.

## Règle du plan d'écriture

Une revendication contient entre 1 et 256 écritures ordonnées. `writeId` est frais pour cette tentative d'exécution. `writeKind` provient des tables ci-dessous. Une commande en lecture seule ne doit pas créer de revendication vide.

Seul l'ordinal non stabilisé suivant peut être émis. La même écriture exacte non consommée demandée de manière réentrante renvoie l'unique capacité enregistrée canonique par identité. Une écriture consommée, stabilisée ou révoquée ne peut jamais recevoir une autre capacité. Une nouvelle tentative ou récupération doit utiliser une tentative, une revendication et un ID d'écriture frais et déterminer l'idempotence à partir d'une relecture durable stricte.

Une seule capacité ne peut pas couvrir un port entier, une saga transactionnelle ou une boucle. Lorsqu'un appel d'API Chrome est découpé en plusieurs écritures attendues (`await`), le plan contient une entrée par appel. Un port peut d'abord effectuer une découverte en lecture seule, construire le plan borné exact, puis initier sa revendication ; il ne peut pas écrire pendant la phase de découverte.

## Frontière fermée des adaptateurs feuilles

`commitPreAdmission` et les deux opérations de lecture d'autorité de Reset acceptent un token feuille enregistré opaque, jamais une fonction fournie par l'appelant. Des modules feuilles dédiés du Shell préparent ces tokens à partir de données strictement capturées et conservent l'exécuteur privé dans une `WeakMap` privée au module. Le token public ne possède que les champs de données exacts décrits ci-dessus. L'autorité exige l'identité exacte du token et sa liaison exacte à la revendication/écriture courante ou à la requête de Reset avant de rechercher l'exécuteur.

Le registre d'adaptateurs est une table fermée définie au build :

- chaque `DatasetPreAdmissionWriteKind` correspond exactement à un adaptateur `dataset-pre-admission/<writeKind>/v1` correspondant ;
- le preflight initial/de reconnaissance correspond uniquement à `dataset-reset/preflight-authority-read/v1` ;
- la restauration de journal correspond uniquement à `dataset-reset/rehydration-authority-read/v1` ;
- aucun conteneur d'injection de dépendances à l'exécution ne peut ajouter, remplacer ou décorer un adaptateur ;
- un module adaptateur peut importer des ports feuilles physiques Chrome/IndexedDB et des parseurs stricts du Core, mais ne doit pas importer `DatasetEpochAuthority`, un contrôleur de workflow, l'orchestration publique des Settings, la messagerie ou une autre porte (gate) ;
- son exécuteur reçoit un DTO détaché et profondément figé (deeply frozen), jamais l'autorité, le scope, la capacité, le contrôleur ou le registre d'adaptateurs ;
- un exécuteur démarre exactement l'effet physique déclaré par son ID d'adaptateur et retourne sa Promise. Il ne contient aucun callback utilisateur, envoi de message, minuteur ou continuation susceptible de solliciter du travail auprès de l'autorité.

Des tests de dépendance statiques appliquent ce graphe d'importation. La recherche d'objet exact à l'exécution rejette les tokens contrefaits/clonés/inter-écritures avec `INVALID_PRE_ADMISSION_LEAF` avant invocation. Dans la mesure où un exécuteur invoqué ne dispose d'aucun chemin vers l'autorité, il ne peut pas s'enfiler derrière la position FIFO dont il contrôle la stabilisation. Un Reset légitime externe, une complétion ou un fence d'échec arrivant pendant que la Promise de la feuille est en attente continue d'appeler l'autorité publique normalement : il obtient le ticket FIFO suivant, attend que la feuille courante se stabilise, puis prévaut dans cet ordre. Aucun booléen global « feuille en cours d'exécution » ne rejette le travail externe non lié.

Seul l'allocateur synchrone d'ID de capacité utilise la sentinelle de profondeur de dispatch. Cette sentinelle n'existe que pour la pile d'appels JavaScript de l'allocateur, car l'allocateur doit renvoyer une chaîne de caractères et ne peut ni renvoyer ni attendre une Promise. Les appels réentrants à l'autorité publique issus de cette pile sont rejetés avant mise en file d'attente et verrouillent (latch) l'échec d'allocation externe. La sentinelle est effacée avant que le contrôle ne retourne à la boucle d'événements, de sorte qu'elle ne peut pas rejeter un ticket externe sans rapport.

## Types d'écriture exacts de Startup

| Étape de Startup    | Écritures de capacité ordonnées                                                                                                                                              | Remarques                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `structure`         | `startup.structure.db6_upgrade_transaction`                                                                                                                                  | Une seule transaction de changement de version IndexedDB ; la complétion constitue la frontière durable.                                                                                     |
| `data`              | 1. `startup.data.tracking_v3_transaction` ; 2. `startup.data.settings_v2_wrap` ; 3. `startup.data.marker3_write`                                                             | Les trois frontières de cohérence après crash sont obligatoires et distinctes. Les Settings sont strictement relus avant le marqueur 3 ; le marqueur 3 est strictement relu avant le succès. |
| `prepared_ledgers`  | `startup.prepared_ledgers.recovery_transaction` uniquement lorsqu'une écriture de récupération est requise                                                                   | Le chemin en lecture seule sans ledger ne comporte aucune revendication. Toutes les lignes récupérées appartiennent à l'unique transaction atomique modélisée.                               |
| `settings_recovery` | une entrée `startup.settings_recovery.envelope_write` pour chaque écriture exacte de journal/résultat/effacement des Settings découverte par le plan de récupération partagé | Pas de token à l'échelle du port. L'appel d'alarme Chrome est un effet externe prouvé par les Settings, et non une écriture de stockage du Dataset.                                          |

`reset_gate`, `reset_preflight`, `versions`, `verification`, `settings_envelope`, `admission`, `bootstrap` et `failure_fence` n'effectuent aucune écriture dans le Dataset par le biais de cette capacité. En particulier, après la saga `data`, `WRAP_SETTINGS_ENVELOPE` constitue la relecture stricte supplémentaire spécifiée par le modèle de démarrage ; elle ne peut pas répéter l'écriture d'encapsulation. `OPEN_EPOCH_ADMISSION`, le fencing de Reset et le fencing d'échec appellent leurs méthodes d'autorité dédiées sur la même FIFO, jamais un adaptateur de capacité.

## Types d'écriture exacts de Reset

| État de Reset               | Écritures de capacité ordonnées                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journaling`                | `reset.journal.initial_put` en tant que put-if-absent exact avec relecture stricte sous la même réservation de Reset                                                                         |
| `resolvingInitialJournal`   | `reset.journal.initial_resolve` ; uniquement pour la même réservation dans `journalStatus:'outcome_unknown'`                                                                                 |
| `acquiringFence`            | aucune ; opération d'autorité dédiée `acquireResetFence`                                                                                                                                     |
| `checkpointingFence`        | `reset.journal.checkpoint_fenced`, uniquement après la preuve de fence actif du même worker                                                                                                  |
| `checkpointingQuiescence`   | `reset.journal.checkpoint_quiesced`, uniquement après relecture stricte du CAS sidecar/référence                                                                                             |
| `closingDatabase`           | `reset.journal.checkpoint_handles_closed` ; la fermeture des handles elle-même n'est pas une écriture durable du Dataset                                                                     |
| `deletingDatabase`          | 1. `reset.database.delete` ; 2. `reset.journal.checkpoint_database_deleted`                                                                                                                  |
| `clearingSession`           | 1. `reset.session.clear` ; 2. `reset.journal.checkpoint_session_cleared`                                                                                                                     |
| `clearingLocal`             | 1. `reset.local.selective_remove` ; 2. `reset.journal.checkpoint_local_cleared`                                                                                                              |
| `reinitializing`            | 1. `reset.reinitialize.db6_transaction` ; 2. `reset.reinitialize.settings_v2_generation_zero` ; 3. `reset.reinitialize.marker3_write` ; 4. `reset.journal.checkpoint_database_reinitialized` |
| `aligningSettings`          | une entrée `reset.settings_recovery.envelope_write` par écriture Settings partagée exacte, puis `reset.journal.checkpoint_settings_aligned`                                                  |
| `writingReceipt`            | `reset.receipt.put` ; la relecture stricte est en lecture seule                                                                                                                              |
| `checkpointingCommit`       | `reset.journal.checkpoint_committed`                                                                                                                                                         |
| `adoptingBackgroundHandoff` | `reset.journal.checkpoint_handoff_adopted` ; l'adoption/relecture est en lecture seule et conserve le sidecar                                                                                |
| `clearingBackgroundHandoff` | la capacité dédiée de nettoyage de handoff supprime/prouve l'absence du sidecar, puis `reset.journal.checkpoint_handoff_cleared` avec une capacité Dataset distincte                         |
| `clearingJournal`           | `reset.journal.remove`                                                                                                                                                                       |
| `checkpointingFailure`      | `reset.journal.checkpoint_failure` ; phase/nombre de tentatives exacts inchangés plus l'erreur `lastError` exacte en attente                                                                 |
| `checkpointingRetry`        | `reset.journal.checkpoint_retry` ; phase exacte inchangée, `retryCount + 1` et `lastError:null`                                                                                              |
| `openingEpochAdmission`     | aucune ; opération d'autorité dédiée `installResetEpochAndOpen`                                                                                                                              |
| `postClearAdmissionFailed`  | aucune ; le journal étant absent, l'échec est volatile et la nouvelle tentative réémet uniquement `installResetEpochAndOpen`                                                                 |

`preflightingCompletion`, `reacquiringFence`, `routingRestart`, `acquiringFence`, `quiescing`, `broadcastingReadiness`, `broadcastingCommitted`, `openingEpochAdmission` et `postClearAdmissionFailed` ne contiennent aucune écriture par capacité. La transaction DB6 de Reset, l'écriture de génération zéro de Settings et l'écriture du marqueur 3 constituent trois capacités distinctes dans cet ordre. Le point de contrôle du journal représente une quatrième frontière. Le marqueur 3 ne peut jamais précéder la relecture stricte de Settings V2.

`reset.local.selective_remove` est exactement un appel borné `chrome.storage.local.remove(keys)` qui exclut précisément le journal de reset actif et `missionpulse.backgroundSchedulingHandoff.v1`. Sa preuve de succès stricte relit la même référence de journal et le sidecar exact. Il ne s'agit jamais d'un `chrome.storage.local.clear()`. Si une future API imposait un découpage par morceaux (chunking), le modèle et le plan d'écriture devraient d'abord être révisés ; un token ne peut pas être réutilisé à travers plusieurs fragments.

### Points de contrôle fermés d'échec et de nouvelle tentative

Aucun état actif n'écrit directement `lastError` et ni `blocked` ni `failed` ne possède de rédacteur (writer). Un événement `STEP_FAILED` corrélé survenant pendant qu'un journal strict existe capture d'abord une structure `pendingFailure` figée dans la mémoire de l'acteur et entre dans `checkpointingFailure`. Cet état est le seul habilité à revendiquer `reset.journal.checkpoint_failure` :

- l'autorité est le même Reset A dans `reset_pending` lorsque l'acquisition du fence actif a échoué, ou `reset_owned` après l'acquisition du fence ;
- l'identité, la phase et le `retryCount` du journal restent inchangés ;
- `lastError` correspond exactement à `pendingFailure`, y compris l'origine, l'étape, la capacité de rejeu et le message borné ;
- l'événement de succès porte la relecture stricte du même enregistrement et c'est seulement alors qu'il route vers `blocked` ou `failed`.

L'échec de ce point de contrôle bascule vers `failureCheckpointBlocked`. Il n'effectue aucune écriture de journal récursive, préserve le journal durable plus ancien, n'expose qu'un diagnostic volatile et n'autorise qu'une nouvelle tentative explicite du même reset pour le même point de contrôle avec des ID de revendication/écriture/capacité/feuille frais. Un échec de preflight survenant avant tout journal est contextuel uniquement et n'utilise jamais cette capacité.

De même, `RETRY` dans `blocked` ou `failed` n'incrémente pas la mémoire au préalable. Il entre dans `checkpointingRetry`, dont la seule écriture est `reset.journal.checkpoint_retry` : même identité et phase, `retryCount + 1` exact, `lastError:null` exact. Seule la relecture stricte émet `RETRY_CHECKPOINTED` et autorise la récupération ou la réacquisition du fence. Un échec de point de contrôle entre dans `retryCheckpointBlocked`, n'effectue aucune écriture récursive et ne peut pas reprendre d'effet destructeur. Ainsi, chaque modification durable de `lastError`/`retryCount` apparaît dans cette table fermée et aucun état de présentation terminal ne s'arroge secrètement d'autorité de stockage.

### Frontière d'admission après effacement (post-clear)

`reset.journal.remove` prouve l'absence stricte mais ne termine pas en soi le Reset. Il produit une preuve exacte `ResetJournalRemovalProofV1` liée à A, à son reçu, à l'époque suivante, aux révisions d'autorité/fence et au worker actuel. L'acteur entre ensuite dans `openingEpochAdmission` et appelle l'opération FIFO dédiée `installResetEpochAndOpen(removalProof)`.

Pour le worker en cours d'exécution, cette opération exige la réservation/le token exact(e) `reset_owned`, l'absence stricte de journal, le dernier reçu correspondant et la preuve d'époque suivante DB6/data3 exacte. Pour la reconnaissance à froid après effacement, elle exige la même preuve durable reçu/DB alors que l'autorité est au démarrage fermé, ou accepte une autorité déjà ouverte uniquement lorsque l'époque et la révision concordent exactement. En une seule position FIFO, elle installe l'époque suivante si nécessaire et retourne une preuve immuable `ResetEpochAdmissionOpenedProofV1` ; un doublon exact renvoie la même preuve canonique. Aucune capacité n'est employée pour cette transition d'autorité.

Si l'installation/l'ouverture échoue ou que son résultat ne peut pas être prouvé, l'autorité demeure fermée, le reçu et la preuve de suppression restent intacts et l'acteur entre dans `postClearAdmissionFailed`. Comme le journal est absent, ce diagnostic est volatile ; une nouvelle tentative explicite sur le même reset réexécute uniquement `installResetEpochAndOpen`, sans jamais réitérer la suppression, l'effacement, la reconstruction, le reçu ou la suppression du journal. `completed` et `reset:true` requièrent la preuve d'ouverture exacte.

## Réservation atomique de Reset et propriété du journal

`reserveResetPreAdmission(request, authorityReadLeafToken)` est une opération dédiée sur la FIFO externe de DatasetEpoch. Le token doit être l'objet exact enregistré `dataset-reset/preflight-authority-read/v1` lié à cette requête et à ce worker. À une position de porte ininterrompue, l'autorité :

1. capture strictement la requête de Reset complète ;
2. lit le journal réservé, le reçu le plus récent et l'époque DB6/data3 canonique ;
3. renvoie la complétion reconnue sans réservation uniquement pour la preuve terminale exacte ;
4. pour une preuve initiale (fresh), vérifie l'absence de journal ainsi que l'époque précédente/suivante exacte ;
5. installe `reset_pending` pour ce Reset exact et renvoie une réservation figée `ResetPreAdmissionReservationV1` avec `origin:'fresh_preflight'` avant de relâcher la porte. Son `journalStatus` initial est exactement `absent_proven`.

Un autre Reset ne peut pas obtenir de preuve initiale après l'étape 5. Un doublon exact de la même requête complète se joint et reçoit l'objet de réservation canonique ; un Reset différent produit `RESET_PRE_ADMISSION_OWNED`. L'échec physique/protocolaire du preflight n'installe aucune réservation.

La revendication de `journaling` exige cette réservation exacte. Son opération feuille est un put-if-absent, et non un `set`/écrasement :

- journal absent -> écrit l'enregistrement exact de phase `journaled` et le relit strictement ;
- journal du même Reset équivalent en octets/contrat -> n'effectue aucun écrasement, le relit strictement et retourne la même preuve idempotente ;
- journal malformé ou étranger, y compris un autre identifiant de reset ou toute divergence d'époque/ID Settings/horodatage -> `RESET_JOURNAL_CONFLICT`, zéro écriture.

La capacité est consommée tant dans le chemin d'absence que dans le chemin idempotent exact. Une opération no-op d'apparence similaire sans relecture stricte est interdite. Avant que la position de la porte ne se stabilise, l'adaptateur fermé renvoie exactement un résultat appartenant à l'autorité :

| Résultat initial               | Preuve requise                                                     | Résultat de réservation           |
| ------------------------------ | ------------------------------------------------------------------ | --------------------------------- |
| `durable_proven`               | relecture stricte du journal exact du même reset                   | `journalStatus:'durable_proven'`  |
| `not_committed_absence_proven` | relecture de l'absence stricte de journal après l'écriture échouée | `journalStatus:'absent_proven'`   |
| `durable_outcome_unknown`      | ni le journal exact ni son absence ne peuvent être prouvés         | `journalStatus:'outcome_unknown'` |
| `conflict`                     | journal malformé/étranger/différent pour le même ID                | inchangé, conflit terminal typé   |

L'autorité applique elle-même ce résultat tout en maintenant la FIFO ; les appelants ne peuvent pas revendiquer d'état. `acquireResetFence` n'accepte que l'objet de réservation exact dans `journalStatus:'durable_proven'` ainsi que la preuve exacte de journal. Elle rejette `absent_proven` et `outcome_unknown` avant de modifier l'état de l'autorité.

`durable_outcome_unknown` fait entrer dans `resolvingInitialJournal`, et non dans `failed` ou `blocked` : il se peut qu'il n'y ait aucun journal durable dans lequel enregistrer `lastError`. `resolveInitialResetJournalOutcome(reservation, leafToken)` n'accepte que la même réservation exacte du worker courant et l'adaptateur enregistré `reset.journal.initial_resolve`. Sous une seule position FIFO, elle :

1. lit strictement la clé réservée ;
2. si le journal initial exact est déjà durable, n'effectue aucune écriture, le relit et fait passer la réservation à `durable_proven` ;
3. si l'absence stricte est prouvée, effectue le même put-if-absent suivi d'une relecture ;
4. si le résultat reste improuvable, conserve `outcome_unknown` et n'émet aucune transition de workflow ;
5. si une valeur malformée ou étrangère existe, retourne un conflit terminal et maintient l'admission fermée.

Seul A peut exécuter ce résolveur. Le Reset B reste en `RESET_PRE_ADMISSION_OWNED` dans les trois statuts. Un worker ultérieur ne fait jamais confiance au statut volatile du worker décédé : la présence stricte d'un journal réhydrate A en tant que `durable_proven` ; l'absence stricte prouve qu'aucun Reset durable n'existe et exige un preflight entièrement neuf. Il n'existe aucun passage de l'inconnu vers l'absence par timeout ou exception.

Une fois que le scope de journalisation devient terminal avec `durable_proven`, `acquireResetFence` fait passer ce même propriétaire de `reset_pending` à `reset_owned`. Elle ne relâche jamais la propriété entre ces deux états.

### Opener de preflight IndexedDB en lecture seule

L'adaptateur de lecture d'autorité est le seul chemin de preflight autorisé à inspecter IndexedDB avant que les openers de démarrage ordinaires ne soient admis. Il s'exécute pendant que la position FIFO externe est détenue et suit ce protocole fermé :

1. lire `indexedDB.databases()` ainsi que les clés réservées exactes de journal local Chrome, de reçu et de marqueur de données ;
2. si `missionpulse` est absente, retourner le fait d'autorité strict d'absence de base de données sans appeler `indexedDB.open` ;
3. si elle est présente, appeler `indexedDB.open('missionpulse')` **sans argument de version** ; `onupgradeneeded` annule sa transaction et échoue avec `RESET_PREFLIGHT_OPEN_WOULD_UPGRADE`, sans jamais créer de schéma ni continuer ;
4. enregistrer le handle temporaire en tant que `reset_preflight_read`, utiliser exclusivement des transactions `readonly` pour inspecter la version de la base, les stores/index exacts et `tracking_meta`, et n'effectuer aucun `add`, `put`, `delete`, `clear`, mutation de curseur, migration ou réparation ;
5. fermer et désenregistrer le handle dans un bloc `finally`, y compris dans les chemins d'échec blocked, abort, versionchange, d'analyse syntaxique (parse) et de stockage Chrome ; la Promise de l'adaptateur ne peut pas se stabiliser tant que la fermeture n'est pas prouvée ;
6. retourner une preuve stricte détachée. Aucun `IDBDatabase`, transaction, requête, fonction ou objet source mutable ne s'échappe de l'adaptateur.

L'intervalle d'inventaire/lecture/ouverture est protégé contre tout opener et writer MissionPulse autorisé par la même FIFO externe. Un `onupgradeneeded` inattendu, la disparition de la base de données ou un versionchange constitue un conflit physique typé et n'installe aucune réservation. La reconnaissance requiert le schéma DB6/data3 exact et l'époque suivante. Un reset initial (fresh reset) ne peut accepter l'époque précédente exacte ou le `null` littéral que selon la règle existante d'autorité manquante/illisible ; une troisième époque lisible ne devient jamais nulle.

### Réhydratation du journal dans un nouveau worker

`rehydrateResetPreAdmission(journalIdentity, authorityReadLeafToken)` est une opération FIFO distincte. Elle n'accepte que le token enregistré `dataset-reset/rehydration-authority-read/v1` pour le worker actuel. À une position FIFO ininterrompue, elle :

1. capture strictement l'identité complète attendue de `LocalDataResetJournalV1` ;
2. relit et analyse strictement le journal réservé avec l'opener en lecture seule ;
3. exige l'égalité en octets/contrat pour l'ID de reset, les deux époques, les deux ID de Settings, `requestedAt`, la phase, le nombre de tentatives et `lastError` ;
4. rejette toute réservation active étrangère, tout journal étranger ou toute troisième époque lisible ;
5. applique la matrice de compatibilité de phase ci-dessous ;
6. installe `reset_pending` et alloue une nouvelle réservation figée sous forme d'objet exact avec `origin:'journal_rehydration'`, le `workerEpoch` actuel et les révisions actuelles d'autorité/fence plus `journalStatus:'durable_proven'` avant de relâcher la porte.

Pour les phases durables `handoff_adopted` et `handoff_cleared`, ce `workerEpoch` actuel doit différer du `sourceWorkerEpoch` de la référence de handoff. L'égalité constitue un conflit de réhydratation. `handoff_adopted` requiert en outre le reçu de remplacement exact émis par l'autorité et son tuple de nettoyage lié au worker ; `handoff_cleared` ne requiert aucune suppression/token de remplacement car l'absence est déjà durable.

| Phase de journal durable              | Autorité physique acceptée lors de la réhydratation                                                                                                                                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journaled`, `fenced`, `quiesced`     | époque précédente exacte, y compris l'autorité illisible littérale-nulle modélisée                                                                                                                                                                 |
| `handles_closed`                      | autorité précédente/nulle exacte, ou base de données absente lorsque la suppression s'est achevée avant son point de contrôle                                                                                                                      |
| `database_deleted`, `session_cleared` | base de données absente                                                                                                                                                                                                                            |
| `local_cleared`                       | un préfixe de réinitialisation exact : base de données absente ; transaction DB6/époque suivante/stores vides uniquement ; puis Settings V2 de génération zéro exacts ; puis marqueur 3. Aucune combinaison ultérieure ou étrangère n'est acceptée |
| `database_reinitialized`              | époque suivante DB6/data3 vérifiée exacte, préfixe de récupération d'alignement des Settings partagé exact (y compris déjà stabilisé), et aucun reçu terminal                                                                                      |
| `settings_aligned`                    | époque suivante DB6/data3 vérifiée exacte, preuve Settings/alarme stabilisée exacte, et reçu terminal soit absent, soit issu du même reset exact                                                                                                   |
| `committed`                           | époque suivante DB6/data3 vérifiée exacte plus le reçu terminal exact exigé par le point de contrôle commité                                                                                                                                       |
| `handoff_adopted`                     | époque suivante DB6/data3 vérifiée exacte, reçu terminal exact, sidecar référencé exact toujours présent, et point de contrôle d'adoption exact                                                                                                    |
| `handoff_cleared`                     | époque suivante DB6/data3 vérifiée exacte, reçu terminal exact, relecture d'absence du sidecar référencé exact, et point de contrôle d'effacement exact                                                                                            |

La matrice représente un effet qui peut être durable juste avant son point de contrôle de journal, et jamais une phase ultérieure arbitraire. Une preuve malformée, un reçu étranger, une troisième époque ou un état physique hors de la ligne produit `RESET_PRE_ADMISSION_REHYDRATION_CONFLICT` et n'effectue aucun changement d'autorité. Pour `local_cleared`, le préfixe est vérifié par rapport au plan de réinitialisation en quatre écritures : aucune DB ; ou DB6/métadonnées suivantes/stores vides exacts sans enveloppe de génération zéro ni marqueur 3 pour le moment ; ou cette DB plus l'enveloppe de génération zéro exacte avec marqueur 3 absent ; ou ces faits plus le marqueur 3. Settings avant DB, marqueur avant Settings, stores non vides et toute valeur partielle ou étrangère constituent des conflits. La quatrième écriture est le point de contrôle de journal qui modifie la phase durable et ne fait donc pas partie de la ligne `local_cleared`.

Une réhydratation en doublon exact dans le worker actuel renvoie l'unique réservation de remplacement canonique par identité. Un Reset différent produit `RESET_PRE_ADMISSION_OWNED`. Le remplacement ne copie jamais l'objet ni les révisions du worker décédé. `acquireResetFence` accepte ce remplacement exact plus la même preuve stricte de journal, avance les révisions, révoque les anciens baux/capacités et le fait passer à `reset_owned`. Sa preuve exacte conserve l'attente de handoff de lane/tentative/worker source de confiance et, lorsqu'un nettoyage de remplacement est requis, le reçu de commande/résultat émis par l'autorité ainsi que ses tokens liés au worker. C'est seulement alors que `BOOT_FENCE_ACQUIRED` peut être émis ou qu'une phase durable quelconque peut reprendre. Ainsi, un crash survenant après chaque journal/point de contrôle dispose d'un chemin de récupération fermé, tandis que le Reset B ne peut ni hériter du Reset A ni l'écraser.

## Modèle d'états et de transitions

```text
resetUnreserved
  -- RESERVE_RESET_PREFLIGHT(fresh exact proof) --> resetPending(A, absent_proven)
resetPending(A, absent_proven)
  -- BEGIN journaling(A) --> active
  -- RESERVE exact duplicate A --> resetPending(A) (same reservation object)
  -- RESERVE different B --> rejected (A remains owner)
  -- exact journal read-back --> resetPending(A, durable_proven)
  -- unprovable put/read-back --> resetPending(A, outcome_unknown)
resetPending(A, outcome_unknown)
  -- RESOLVE exact journal --> resetPending(A, durable_proven)
  -- RESOLVE exact absence + put/read-back --> resetPending(A, durable_proven)
  -- RESOLVE still unknown --> resetPending(A, outcome_unknown)
  -- RESERVE different B --> rejected (A remains owner)
resetPending(A, durable_proven)
  -- journal proof + ACQUIRE_RESET_FENCE(A) --> resetOwned(A)

newWorker + strictJournal(A)
  -- REHYDRATE_RESET_PRE_ADMISSION(A, phase-compatible read proof)
       --> resetPending(A, new exact-object reservation/current worker)
  -- ACQUIRE_RESET_FENCE(A, replacement reservation) --> resetOwned(A)
  -- REHYDRATE/RESERVE different B -------------------> rejected

resetOwned(A) + exact journal-removal/receipt/DB proof
  -- INSTALL_RESET_EPOCH_AND_OPEN(A) --> open(nextDataEpoch)
  -- failure/unknown ----------------> resetOwned(A), admission closed

vacant
  -- BEGIN_PRE_ADMISSION_COMMAND(exact claim) --> active

active
  -- ISSUE_PRE_ADMISSION_CAPABILITY(next write) --> active
  -- COMMIT_PRE_ADMISSION(exact token/write) --> executing
  -- COMPLETE_PRE_ADMISSION_COMMAND ------------> vacant + terminal key
  -- REVOKE / stage drift / Reset / failure fence -> vacant + terminal key

executing
  -- durable Promise fulfilled --> active (capability settled; next ordinal)
  -- durable Promise rejected  --> active (capability consumed; command must fail/revoke)
  -- Reset/fence queued later  --> stays executing until Promise settles, then fence wins

any
  -- revision overflow --> failClosed
```

La FIFO partagée constitue l'ordre de linéarisation. `executing` la détient jusqu'à ce que la Promise de la feuille autorisée se stabilise. Il n'existe aucune fiction d'annulation pour une transaction déjà entamée. Un fence de Reset/échec mis en file d'attente en premier révoque avant un commit ultérieur et l'adaptateur n'est jamais invoqué ; un commit mis en file d'attente en premier se stabilise avant le fence. Un fence externe appelé pendant qu'un adaptateur est en attente reçoit systématiquement un ticket FIFO ultérieur ; il n'est jamais confondu avec une réentrance d'adaptateur.

## Opérations d'autorité

### `reserveResetPreAdmission(request, authorityReadLeafToken)`

Cette opération implémente le protocole atomique de Reset décrit ci-dessus. Elle détient la porte externe DatasetEpoch à travers l'adaptateur en lecture seule enregistré et l'enregistrement du propriétaire exact `reset_pending`. Elle ne renvoie ni `fresh` ni réservation si une réservation ou un journal étranger existe. Un clone de réservation n'est jamais accepté par les opérations ultérieures de journalisation ou de fence. L'adaptateur doit prouver que son handle IDB temporaire est fermé avant que cette opération ne soit résolue ou rejetée.

### `rehydrateResetPreAdmission(journalIdentity, authorityReadLeafToken)`

Cette opération n'est disponible que dans l'état Reset `reacquiringFence` après la détection d'un journal strict au démarrage du worker. Elle exécute le protocole de réhydratation et la matrice de compatibilité de phase décrits ci-dessus, puis retourne l'unique réservation de remplacement canonique pour ce worker. Elle ne retourne jamais de résultat de preflight initial ou de complétion, n'écrit jamais dans le journal, ne reprend jamais la phase et n'accepte jamais la réservation de l'ancien worker. Son résultat réussi doit être consommé par `acquireResetFence` avant que le contrôleur de Reset ne puisse accepter `BOOT_FENCE_ACQUIRED`.

### `resolveInitialResetJournalOutcome(reservation, authorityReadLeafToken)`

Cette opération n'existe que pour la réservation A exacte du worker courant dans l'état `journalStatus:'outcome_unknown'`. Elle utilise l'adaptateur résolveur fermé sous une seule position FIFO, retourne uniquement les résultats totaux spécifiés ci-dessus et met à jour la réservation canonique avant stabilisation. Elle n'accepte jamais B, ne devine jamais l'absence, n'ouvre jamais l'admission, n'expose jamais `failed`/`blocked` et n'acquiert jamais le fence.

### `installResetEpochAndOpen(proof)`

Cette opération d'autorité dédiée est la seule transition possible après la suppression stricte du journal. Elle accepte la preuve exacte de suppression/reçu/DB de l'exécutant A, ou l'équivalent exact de reconnaissance à froid pendant que le démarrage est fermé. Elle installe et ouvre de manière atomique `nextDataEpoch`, ou retourne la preuve canonique exacte déjà ouverte. Tout résultat d'échec ou inconnu maintient l'admission fermée et préserve l'autorité de nouvelle tentative ; elle ne répète jamais d'effet Dataset ni ne renvoie de succès.

### `beginPreAdmissionCommand(claim)`

Sous la porte existante, elle :

1. capture strictement la revendication exacte et le plan d'écriture ;
2. rejette tout propriétaire ordinaire/métier, étape non supportée ou plan vide ;
3. vérifie l'état du propriétaire, l'identité de la commande, le worker, l'époque nullable et les deux révisions ;
4. vérifie la preuve de commande courante exacte du contrôleur privé ; cette preuve n'est mise à jour qu'après acceptation de l'événement de workflow antérieur ;
5. rejette une clé de commande terminale retenue avant d'accepter un nouvel `claimId` ;
6. pour Reset, vérifie la réservation canonique sous forme d'objet exact ;
7. rejette les états d'admission/fence non autorisés par la matrice propriétaire-étape ;
8. réserve l'identifiant de revendication et l'identité de l'objet scope, puis retourne ce scope exact figé.

Une revendication active en doublon exact renvoie le même objet scope. Une revendication active différente produit `PRE_ADMISSION_COMMAND_ACTIVE` ; elle ne remplace ni ne complète l'ancienne revendication. Après complétion ou révocation, la même clé de commande devient terminale et tout nouveau `BEGIN` pour celle-ci est rejeté. Un `BEGIN` discordant non fiable ne constitue pas une preuve de changement d'étape du workflow. Une transition d'étape de confiance commence par terminer l'ancien scope, publie/accepte de manière synchrone l'événement de workflow via le contrôleur privé, et ce n'est qu'ensuite qu'elle expose la preuve de commande courante suivante. Par conséquent, ni l'ancienne ni la prochaine commande ne peuvent être rouvertes dans l'intervalle entre la complétion et l'événement.

### `issuePreAdmissionCapability(scope, writeId)`

Sous la même porte, elle vérifie le scope actif exact, l'ordinal suivant, toutes les corrélations et la capacité du registre avant d'appeler l'allocateur injecté. Elle capture revendication/époque/révisions avant allocation et les revalide après allocation. L'éligibilité d'admission est l'éligibilité à la position FIFO de cette opération ; une réservation `reset_pending` avec un ticket ultérieur ne peut pas la dépasser, tandis qu'une réservation existant avant l'entrée la rejette avant allocation.

Le comportement de l'allocateur est en échec fermé (fail-closed) :

- UUID invalide ou toute valeur JavaScript levée -> `INVALID_CAPABILITY_ID`, aucune exception brute ;
- collision avec tout ID de capacité/revendication/écriture retenu ou toute identité UUID dans le scope actif -> `CAPABILITY_ID_COLLISION` ;
- l'allocateur est une feuille synchrone et ne reçoit aucune référence d'autorité ;
- toute tentative de l'allocateur d'appeler issue/commit/complete, un bail/commit ordinaire, une réservation/fence de Reset, l'installation d'époque, l'admission ou le fencing d'échec est rejetée **avant la mise en file d'attente** avec `AUTHORITY_REENTRANCY_FORBIDDEN` ;
- l'autorité verrouille (latches) cette violation pour l'invocation de l'allocateur. Même si un code d'allocateur hostile capture l'erreur interne et renvoie un UUID valide, l'émission externe échoue et brûle cet UUID frais ;
- aucune Promise réentrante n'est jamais ajoutée derrière l'opération de porte qui l'attendrait.

Chaque résultat d'allocateur frais valide est retenu avant de retourner la capacité, de sorte qu'il n'est jamais recyclé. Un `reset_pending` établi avant que l'émission n'entre dans la FIFO rejette l'allocation sans appeler l'allocateur.

### `commitPreAdmission(capability, writeId, durableLeafToken)`

`durableLeafToken` est le token de données pures enregistré exact préparé par l'unique adaptateur autorisé pour ce `writeKind`. Il n'y a pas de paramètre de callback. L'autorité valide l'identité/la liaison du token et obtient l'exécuteur privé depuis le registre fermé avant la mise en file d'attente. À sa position FIFO, l'autorité :

1. vérifie l'identité exacte du token et chaque champ ;
2. vérifie le scope actif, l'ordinal suivant, l'époque nullable et les deux révisions ;
3. rejette les tokens de capacité ou feuilles consommés, révoqués, étrangers ou inter-commandes ;
4. marque la capacité `consumed` **avant d'invoquer l'adaptateur privé** ;
5. invoque cet adaptateur exactement une fois et maintient la FIFO jusqu'à ce que sa Promise se stabilise ;
6. n'enregistre `settled` que lors de la résolution (fulfillment) ; le rejet la laisse consommée (`consumed`).

Une levée synchrone d'adaptateur, une relecture stricte malformée ou une Promise rejetée constitue un échec d'effet durable, jamais une autorisation de rejouer l'un ou l'autre token. L'exécuteur privé ne peut pas enfiler une autre écriture car son module ne possède aucun chemin vers l'autorité ou le contrôleur. Les appels externes à l'autorité publique restent enfilables et suivent la FIFO après l'adaptateur en attente. Seule l'allocation de capacité utilise la sentinelle de réentrance synchrone décrite ci-dessus ; les adaptateurs durables et de lecture d'autorité s'appuient sur l'enregistrement fermé d'objets exacts associé à la porte d'architecture interdisant les imports, et non sur une sentinelle globale asynchrone.

### `completePreAdmissionCommand(scope)`

Sous la même porte, elle vérifie le scope actif exact, révoque chaque capacité émise mais non consommée, marque chaque écriture non émise comme indisponible, avance `fenceRevision`, écrit le tombstone terminal borné sans éviction pour la clé de commande complète et efface le scope actif. Si chaque écriture planifiée s'est stabilisée, la disposition de complétion est `completed` ; sinon, elle est `revoked`. Répéter la complétion avec l'ancien scope exact renvoie uniquement son reçu terminal conservé ; elle ne peut pas effacer ou rouvrir le tombstone. La complétion ne fabrique pas d'événement de succès de workflow.

L'adaptateur propriétaire doit compléter le scope avant de publier l'événement de succès ou d'échec susceptible de modifier l'étape du modèle. Si l'étape/la commande du modèle est observée en train de changer en premier, l'autorité révoque l'ancien scope et rejette la nouvelle opération ; elle ne la reciblera jamais silencieusement.

## Hiérarchie globale des portes et ports feuilles

L'ordre de verrouillage global est strict :

```text
DatasetEpoch gate (externe)
  -> Settings/system quota-write gate (interne, si requis)
    -> une Promise feuille Chrome Storage / IndexedDB / alarm
```

- DatasetEpoch ne peut entrer dans la porte interne Settings/système que via un port feuille inscrit sur liste blanche dont le type de dépendance n'a aucun accès à l'autorité ou au contrôleur.
- Le code détenant la porte Settings/système ne doit jamais demander, attendre (`await`) ou appeler la porte DatasetEpoch. Cette inversion constitue une `LOCK_ORDER_VIOLATION` avant mise en file d'attente.
- Une écriture Settings, qu'elle soit en pré- ou post-admission, acquiert d'abord DatasetEpoch et la porte Settings/système en second. Elle libère la porte interne avant que le commit externe ne se résolve.
- Un adaptateur durable DatasetEpoch ne peut pas appeler une API générale de récupération/sauvegarde Settings qui pourrait réacquérir DatasetEpoch. Le mapping d'adaptateurs fermé ne peut appeler que la feuille interne exécutant l'opération physique déjà autorisée.
- Les feuilles IDB exclusives n'utilisent aucune porte interne Settings. Elles ne peuvent toujours pas rappeler DatasetEpoch ou un contrôleur de workflow.
- Aucun adaptateur de porte n'attend de code utilisateur arbitraire, de livraison de message ou d'autre opération capable d'acquérir une porte de rang égal ou inférieur.

La vérification de rang de verrouillage est synchrone et partagée par les deux portes. Une violation est verrouillée sur l'opération externe. Des contrôles statiques d'architecture prouvent en outre que les modules feuilles n'importent pas l'autorité, le contrôleur ou l'orchestration publique des Settings. Le rejet de rang à l'exécution empêche l'inversion aux frontières publiques des portes ; le registre d'adaptateurs fermé empêche un adaptateur de créer l'auto-dépendance qui bloquerait autrement la FIFO (deadlock).

## États d'autorité autorisés

| Propriétaire/étape                                                            | État d'autorité requis                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Étape de mutation de Startup                                                  | `closed_startup` ; jamais `open`, `reset_pending`, `reset_owned` ou `fenced_failure`                                            |
| Reset `journaling` / `resolvingInitialJournal`                                | `reset_pending` avec la réservation canonique exacte du worker actuel et son statut exact de journal                            |
| Reset `reacquiringFence` après redémarrage du worker                          | `closed_startup` avant réhydratation, puis `reset_pending` avec la réservation de remplacement du worker actuel                 |
| Point de contrôle d'échec/retry de Reset avant le live fence                  | même Reset A `reset_pending`, journal durable strict, réservation de remplacement exacte                                        |
| Reset après `acquireResetFence` jusqu'à `clearingJournal`                     | `reset_owned` pour cette même réservation/ID de reset/époques du worker actuel                                                  |
| Point de contrôle d'échec/retry de Reset après le live fence                  | même Reset A `reset_owned` ; la phase exacte du journal détermine l'époque de la capacité                                       |
| Chemin d'exécution Reset `openingEpochAdmission` / `postClearAdmissionFailed` | même Reset A `reset_owned`, absence stricte de journal et preuve exacte de suppression/reçu/DB                                  |
| Chemin froid reconnu de Reset `openingEpochAdmission`                         | `closed_startup`, ou époque suivante exacte déjà ouverte pour preuve idempotente ; aucune réservation périmée n'est synthétisée |

Dès lors que `OPEN_EPOCH_ADMISSION` réussit, les revendications de pré-admission de démarrage sont interdites et les écritures métier utilisent exclusivement `issueLease/commit`. Un Reset initial commence par faire passer atomiquement cette autorité à `reset_pending` ; ce n'est qu'alors que sa revendication exacte de journalisation peut commencer. La réservation reste détenue pendant que le résultat du journal est résolu et pendant que `acquireResetFence` promeut une réservation `durable_proven` en `reset_owned`. Un nouveau worker n'utilise jamais l'objet du worker décédé : sa réhydratation stricte de journal installe un remplacement `reset_pending` du worker actuel avant de réacquérir le fence.

## Erreurs typées

L'API signale des erreurs d'autorité typées et n'invoque aucun adaptateur rejeté :

- `INVALID_PRE_ADMISSION_CLAIM` ;
- `INVALID_PRE_ADMISSION_SCOPE` ;
- `INVALID_PRE_ADMISSION_CAPABILITY` ;
- `INVALID_PRE_ADMISSION_WRITE_ID` ;
- `INVALID_CAPABILITY_ID` ;
- `CAPABILITY_ID_COLLISION` ;
- `PRE_ADMISSION_COMMAND_ACTIVE` ;
- `PRE_ADMISSION_COMMAND_NOT_CURRENT` ;
- `PRE_ADMISSION_COMMAND_TERMINAL` ;
- `PRE_ADMISSION_COMMAND_MISMATCH` ;
- `PRE_ADMISSION_STAGE_MISMATCH` ;
- `PRE_ADMISSION_ATTEMPT_MISMATCH` ;
- `PRE_ADMISSION_WORKER_MISMATCH` ;
- `DATA_EPOCH_MISMATCH` ;
- `AUTHORITY_REVISION_MISMATCH` ;
- `FENCE_REVISION_MISMATCH` ;
- `CAPABILITY_ALREADY_CONSUMED` ;
- `CAPABILITY_REVOKED` ;
- `WRITE_ORDER_MISMATCH` ;
- `INVALID_PRE_ADMISSION_LEAF` ;
- `PRE_ADMISSION_LEAF_MISMATCH` ;
- `RESET_PREFLIGHT_OPEN_WOULD_UPGRADE` ;
- `RESET_PREFLIGHT_HANDLE_CLOSE_FAILED` ;
- `INVALID_RESET_PRE_ADMISSION_REHYDRATION` ;
- `RESET_PRE_ADMISSION_REHYDRATION_CONFLICT` ;
- `AUTHORITY_REENTRANCY_FORBIDDEN` ;
- `LOCK_ORDER_VIOLATION` ;
- `INVALID_RESET_PRE_ADMISSION_RESERVATION` ;
- `RESET_PRE_ADMISSION_OWNED` ;
- `RESET_JOURNAL_CONFLICT` ;
- `PRE_ADMISSION_REGISTRY_EXHAUSTED` ;
- `ADMISSION_CLOSED`, `RESET_ALREADY_OWNED`, `FENCED_FAILURE` ou `REVISION_OVERFLOW` provenant de l'autorité centrale.

Des données exactes erronées ne sont pas normalisées en un effet vide, un succès réessayable ou un bail ordinaire. Les erreurs constituent des diagnostics bornés ; leur texte ne sélectionne jamais une transition.

## Règle de non-recours

La porte de production ne dispose exactement que de deux chemins :

```text
business write after OPEN_EPOCH_ADMISSION
  -> issueLease(scope)
  -> commit(lease, operationId, durableEffect)

startup/reset write declared above
  -> for fresh Reset only: reserveResetPreAdmission(exact request, exact read-leaf token)
     then journal; if its outcome is unknown, resolveInitialResetJournalOutcome(exact reservation, exact leaf)
  -> for restored Reset only: rehydrateResetPreAdmission(exact journal, exact read-leaf token)
     then acquireResetFence(exact current-worker reservation, exact journal proof)
  -> beginPreAdmissionCommand(claim)
  -> one issuePreAdmissionCapability + commitPreAdmission(exact durable leaf token) per write
  -> completePreAdmissionCommand(scope)
  -> for background handoff only: consume exact preallocated sidecar capability
     for init/slot 0->1 or post-adoption cleanup; present-slot duplicate is read-only
  -> after strict journal removal: installResetEpochAndOpen(exact removal/receipt/DB proof)
```

Des méthodes de capacité manquantes, un mutex différent, un callback optionnel permissif, une injection d'adaptateur à l'exécution, `try capability then raw write`, `try ordinary lease then capability`, un adaptateur no-op de production et une persistance brute directe constituent des configurations invalides. Une nouvelle tentative idempotente déjà durable consomme toujours une capacité fraîche et doit renvoyer une preuve de relecture stricte ; la porte elle-même ne renvoie jamais de succès synthétique.

## Invariants

1. L'émission d'un bail ordinaire échoue tant que l'admission de l'autorité n'est pas `open`.
2. Au maximum un scope de commande de pré-admission exact est actif.
3. La réservation de Reset, claim/issue/commit/complete, le commit ordinaire, le Reset et le fence d'échec partagent une FIFO externe et un objet d'autorité uniques.
4. Chaque écriture durable possède un ID d'écriture déclaré distinct et une capacité à usage unique (one-shot) distincte.
5. La consommation de capacité précède l'invocation de l'adaptateur enregistré et chaque `await`.
6. Une capacité consommée ou révoquée ne peut jamais être réémise ni rejouée.
7. Chaque émission et commit revalide la commande, l'étape, la tentative, le worker, l'époque nullable, la révision d'autorité et la révision de fence au sein de la FIFO.
8. La dérive de Reset/fence d'échec/étape/commande/tentative/époque révoque toutes les capacités en suspens de l'ancien scope ; une non-concordance de worker rejette et un nouveau worker ne peut pas posséder l'ancien registre d'objets exacts.
9. L'ordre FIFO décide à lui seul si un commit ou un fence l'emporte ; un adaptateur perdant n'est jamais invoqué, tandis qu'un fence externe survenant pendant un adaptateur actif est mis en file d'attente derrière lui plutôt que rejeté comme réentrant.
10. Une levée d'exception de l'allocateur, un ID invalide et une collision ne divulguent jamais d'erreurs brutes, n'écrasent jamais un token canonique ni ne recyclent un ID ; chaque appel à l'autorité effectué de façon synchrone depuis la pile de l'allocateur est rejeté avant la mise en file d'attente.
11. Les registres sont bornés et n'évincent jamais de preuve de rejeu au sein d'un worker.
12. La transaction data-v3 de Startup, l'encapsulation Settings et le marqueur 3 constituent trois capacités ordonnées ; le marqueur 3 fait suite à la relecture stricte des Settings.
13. La transaction DB6 de Reset, l'enveloppe Settings de génération zéro et le marqueur 3 constituent trois capacités ordonnées, suivies d'un point de contrôle de journal distinct.
14. Le succès d'une commande/étape n'est pas publié tant que son scope est actif.
15. Il n'existe aucun rédacteur brut/no-op/de repli derrière la frontière de capacité.
16. Le preflight de Reset initial et la réservation exacte `reset_pending` forment une seule linéarisation FIFO ; le Reset B ne peut pas devenir propriétaire après que le Reset A a reçu `fresh`.
17. La création initiale du journal de Reset est un put-if-absent : seule l'absence ou le journal exact du même Reset peut réussir, toujours avec relecture stricte.
18. La complétion/révocation conserve la clé de commande terminale complète sans éviction ; la même commande/tentative ne peut plus jamais exécuter `BEGIN`.
19. Les opérations durables et de lecture d'autorité sont des tokens enregistrés exacts de données pures adossés à une table d'adaptateurs fermée. Les modules adaptateurs ne peuvent pas importer ou recevoir l'autorité/le contrôleur, de sorte qu'aucune Promise d'adaptateur ne peut se mettre en file d'attente derrière elle-même.
20. L'ordre des portes est exclusivement DatasetEpoch externe -> Settings/système interne -> feuille physique. Détenir Settings/système tout en sollicitant DatasetEpoch est interdit.
21. Une revendication de commande suivante est impossible tant que le contrôleur de workflow privé n'a pas accepté l'événement antérieur et exposé cette preuve exacte de commande courante.
22. Chaque opener IDB de preflight s'exécute sous la FIFO externe, ouvre sans version cible, interrompt `onupgradeneeded`, utilise exclusivement des transactions readonly et prouve la fermeture du handle avant que son opération ne se stabilise.
23. Chaque worker restauré par journal installe une nouvelle réservation sous forme d'objet exact via une réhydratation FIFO stricte compatible avec la phase avant la réacquisition du fence ; les clones de réservation de l'ancien worker demeurent invalides.
24. La réhydratation préserve la propriété du Reset A et rejette le Reset B, un journal/reçu étranger, une troisième époque et tout fait physique hors de la matrice de phases, sans modifier l'état de l'autorité.
25. `reset_pending` enregistre systématiquement un statut total de journal. Un résultat d'écriture/relecture inconnu ne peut utiliser que le résolveur du même A ; il n'est jamais traité par défaut comme absent, durable, échoué ou accessible au Reset B.
26. `acquireResetFence` exige `durable_proven`. L'acquisition initiale et `checkpoint_fenced` sont des frontières distinctes ; une phase `journaled` restaurée ayant déjà acquis le boot fence passe directement à son point de contrôle et n'acquiert jamais de second fence.
27. Les modifications durables de `lastError` et `retryCount` se produisent uniquement par l'intermédiaire de `checkpointingFailure` et `checkpointingRetry` ; leur relecture stricte de journal précède les transitions vers les états de présentation ou de récupération.
28. La suppression du journal précède une preuve dédiée et idempotente `installResetEpochAndOpen`. Un échec après suppression reste récupérable avec l'admission fermée et ne peut pas produire `completed`/`reset:true`.
29. La table des capacités de handoff est fermée à une clé locale littérale et exactement 1 584 tokens CAS + 3 de nettoyage préalloués hors des registres de travail.
30. L'initialisation et la matérialisation durable du curseur consomment des capacités CAS ; le payload strict transporte le prochain `{controlAttemptIndex,transitionIndex,casAttempt}` exact. Un résultat définitif avance durablement et relit ce curseur avant qu'un autre bundle ne puisse s'exécuter ; un curseur déjà avancé consomme zéro ID et n'invoque aucun adaptateur. Trois échecs basculent vers la même transition dans la tentative suivante parmi les quatre tentatives de contrôle, et un redémarrage après `0:37:0` ne reprend que `0:37:1`.
31. Le nettoyage du sidecar est indisponible avant l'adoption exacte, utilise une capacité exacte non utilisée liée au worker actuel (originale ou réémise durablement), et ne peut pas partager le token distinct de journal `handoff_cleared`.
32. L'effacement sélectif local préserve exactement le journal de reset + le sidecar de handoff ; toute omission, clé supplémentaire dans la liste blanche ou référence croisée n'invoque aucun adaptateur.
33. Un `sidecarId` frais est alloué avec la lane de Reset avant l'admission du travail et est immuable à travers l'ensemble des 1 587 capacités de handoff, le payload canonique, le sidecar et la référence ; l'initialisation ne peut pas choisir d'ID.
34. Le marqueur de fermeture de boîte aux lettres fige la cible et ferme l'allocation externe avant que toute référence de point de contrôle ne soit exposée. Les callbacks ultérieurs utilisent le chemin terminal sans écriture. Le point de contrôle interne ne peut toujours consommer que les 1 584 entrées de manifeste exactes déjà réservées nécessaires à la matérialisation de cette cible figée ; il ne peut ni allouer ni modifier la cible.
35. La provenance du point de contrôle répète la lane, la tentative de Reset, le worker, le sidecar, le handoff, le digest de la cible figée et le manifeste canonique 1 584+3. Chaque entrée et les deux digests sont recalculés par rapport à l'attente de confiance conservée par le fence ; une lane étrangère auto-cohérente est invalide.
36. L'initialisation du sidecar stocke durablement la cible/le digest/le curseur à la révision 0. La matérialisation d'exactement un slot présent l'incrémente, de sorte que chaque payload accepté satisfait `checkpointRevision === popcount(slotBitmap) === slotCount`.
37. Un worker de remplacement reçoit un reçu de commande/résultat enregistré et exactement trois objets de token de nettoyage liés à sa lane/worker et aux bundles sources durables. Les anciens tokens, DTO copiés et reçus de workers étrangers demeurent invalides ; l'absence de nettoyage est idempotente.

## Scénarios de revue hostile requis

- bail ordinaire avant admission : `ADMISSION_CLOSED` avec zéro allocation ;
- revendication exacte réussie ; la substitution de chaque champ de claim/scope/capacité échoue indépendamment ;
- époque nulle acceptée uniquement tant que l'autorité n'a pas d'époque exacte, et rejetée dans chaque état d'époque connue ; substitution étrangère/non nulle rejetée ;
- une commande à deux écritures reçoit deux capacités distinctes et deux tokens feuilles durables correspondants exacts ; la réutilisation de l'un ou l'autre premier token pour le second échoue avant l'invocation de l'adaptateur ;
- double consommation, clone, worker périmé, tentative périmée, rejeu inter-commandes, inter-étapes, inter-époques et inter-révisions produisent zéro écriture ;
- compléter la commande avant qu'un commit tardif mis en file d'attente ne la révoque ; son adaptateur n'est jamais exécuté ;
- commit avant Reset se stabilise avant Reset ; Reset avant commit révoque et n'exécute aucun adaptateur ; un Reset externe arrivant alors qu'une Promise d'adaptateur est en attente attend derrière elle et ne produit pas `AUTHORITY_REENTRANCY_FORBIDDEN` ; répéter pour le fence d'échec ;
- l'allocateur réentre dans la même écriture, une écriture différente, complete, Reset et fence d'échec ; chaque appel interne rejette de manière synchrone avant la mise en file d'attente, l'allocation externe est verrouillée en échec, aucun ticket de liaison d'opération/fence/reset n'est créé et l'UUID renvoyé reste brûlé ;
- l'allocateur lève `Error`, `undefined` et des primitives ; renvoie un UUID invalide ou chaque collision d'ID retenu ; aucune valeur brute ne s'échappe ;
- les registres de capacités/revendications atteignent leurs limites exactes et refusent l'élément suivant sans éviction ni appel à l'allocateur ;
- crash de démarrage après la transaction IDB, la relecture des Settings et l'écriture du marqueur ; chaque redémarrage utilise des ID frais et n'ouvre jamais l'admission prématurément ;
- crash de Reset après chaque écriture de la table ; la récupération utilise des ID d'exécution frais, une relecture durable stricte, une réservation réhydratée du worker actuel et aucun ancien token ;
- l'écriture/relecture initiale du journal retourne tour à tour l'état durable exact, l'absence exacte et le résultat inconnu ; seul le premier peut acquérir un fence, le deuxième peut retenter A avec des ID frais, le troisième reste dans la résolution du même A, et B est rejeté en permanence ;
- faire échouer chaque étape de workflow sous `reset_pending` et `reset_owned` : le point de contrôle d'échec exact précède `blocked`/`failed` ; puis faire échouer ce point de contrôle et prouver l'absence d'écriture récursive. Une nouvelle tentative explicite enregistre `retryCount + 1` et `lastError:null` avant tout effet repris ;
- redémarrage en phase `journaled` : `BOOT_FENCE_ACQUIRED` route directement vers `checkpointingFence`, et une autorité instrumentée observe exactement une acquisition de fence actif pour ce worker ;
- échec/crash après suppression stricte du journal mais avant installation/ouverture d'époque : l'autorité demeure fermée, la preuve exacte reçu/suppression/DB subsiste, la nouvelle tentative ou la reconnaissance à froid ouvre de manière idempotente sans répéter d'effets destructeurs, et aucune réponse ne signale de succès avant la preuve ouverte ;
- Reset A crashe après l'écriture du journal et après chaque point de contrôle ultérieur ; le nouveau worker réhydrate A, rejette B, réacquiert le fence et ne reprend qu'après `BOOT_FENCE_ACQUIRED` ; les faits d'effet en avance compatibles avec la phase sont acceptés et une troisième époque/reçu étranger est rejeté(e) sans changement d'état ;
- le preflight avec DB absente n'effectue aucune ouverture ; le preflight avec DB existante utilise un handle temporaire readonly unique et prouve la fermeture en cas de succès, blocked, échec d'analyse, versionchange et abort ; `onupgradeneeded` interrompt avec zéro écriture de schéma/migration/marqueur ;
- contrefaire/cloner/croiser les écritures de chaque token feuille durable/de lecture et tenter l'injection d'adaptateur à l'exécution ; aucun exécuteur privé ne s'exécute. Les imports statiques prouvent que chaque adaptateur autorisé ne dispose d'aucune autorité/contrôleur/Settings publics/messagerie ;
- descripteurs hostiles, accesseurs, tableaux clairsemés/surdimensionnés, Symbols, champs hérités et Proxies révoqués échouent en mode fermé sans exécution de getter ;
- un second mutex injecté ou un writer brut est rejeté par les tests d'architecture ;
- une implémentation de capacité manquante ne peut pas être remplacée par un adaptateur no-op.
- remplir 0/1/131 slots de handoff, rejouer les doublons et épuiser chaque troisième tentative CAS ; prouver que la quatrième tentative de contrôle utilise des bundles frais issus de la capacité exacte de 1 584, que les doublons consomment zéro ID et que l'échec avant clear n'invoque ni session ni local clear ;
- fermer la boîte aux lettres dans les deux ordres de concurrence, prouver que l'entrée pré-marqueur appartient à la cible immuable et que l'entrée post-marqueur reçoit le terminal fermé ; tenter chaque opération de slot depuis un callback externe après fermeture et observer zéro allocation/invocation d'adaptateur, tandis que l'exécuteur interne ne consomme que les entrées déjà réservées pour les slots cibles figés ;
- substituer l'ID de sidecar préalloué indépendamment dans la lane, chaque CAS, chaque nettoyage, capacité, sidecar, payload et référence ; aucune feuille ne s'exécute et l'initialisation ne peut réparer ou allouer de remplacement ;
- effacer la session, redémarrer, effacer localement de façon sélective, adopter et crasher avant le nettoyage ; prouver que le sidecar survit à chaque point, que le nettoyage requiert l'un des trois tokens fermés frais, que la relecture d'absence précède un point de contrôle de journal distinct, et que la suppression du journal ne peut pas le dépasser ;
- redémarrer indépendamment avant les tentatives de nettoyage 0, 1 et 2 ; réémettre le tuple de nettoyage exact durable à trois entrées sur un worker/lane frais, rejeter chaque ancien token de worker et toute substitution de tuple/manifeste/sidecar, et accepter `removed` ou `already_absent` de manière idempotente ;
- substituer la clé/id/digest/révision/slot/tentative/capacité de sidecar et la liste blanche exacte à deux clés de clear local indépendamment ; chaque non-concordance n'invoque aucune feuille.

## Hors périmètre

- implémentation des méthodes d'autorité ou des contrats/machines exécutables ;
- modification de l'activation en production de DB5/data2 avant la bascule coordonnée ;
- politique de réservation de quota consommateur au-delà des limites dures d'autorité ordinaire définies par `db-migration.model.md` ;
- libellés de statut UI ou d'erreur ;
- toute admission, nouvelle tentative ou transition d'état pilotée par LLM.
