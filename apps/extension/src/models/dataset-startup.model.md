# Dataset Startup Model

Source de vérité exécutable du démarrage DatasetEpoch. Ce modèle complète
`db-migration.model.md` sans activer le runtime. Les fichiers associés sont :

- `dataset-startup.contract.ts` : contrats stricts, preuves et normalisation ;
- `dataset-startup.logic.ts` : guards, actions et commandes pures ;
- `dataset-startup.machine.ts` : machine XState v5 et façade sûre.

Les écritures pré-admission de ces commandes se composent avec
`dataset-write-capability.model.md`. Cette composition est normative même tant
que son contrat exécutable et son adapter Shell restent non implémentés.

Le modèle orchestre. Il n'ouvre pas IndexedDB, ne lit pas Chrome Storage, ne
crée pas d'alarme et n'ouvre pas lui-même l'autorité DatasetEpoch. Une future
Shell exécutera la commande pure exposée par le contexte puis renverra une
preuve strictement corrélée.

## Objectif et frontière

Une tentative de démarrage ne peut publier un bootstrap qu'après avoir prouvé,
dans cet ordre :

1. l'absence de journal Reset et de demande Reset prioritaire ;
2. des versions compatibles, migrées sans destruction vers DB6/data3 ;
3. la validité critique et l'epoch canonique de `tracking_meta` ;
4. le wrap/read-back exact du seul `SettingsEnvelopeV2` partagé ;
5. le règlement des prepared ledgers d'anciens workers ;
6. la récupération Settings et l'alignement exact de l'alarme auto-scan ;
7. l'ouverture de l'autorité DatasetEpoch ;
8. la publication d'un batch borné de bootstraps corrélés pour les callers
   joints.

Toute frontière durable des étapes 2 à 6 qui écrit réellement passe par une
capability one-shot de la commande active, sous la FIFO unique de
`DatasetEpochAuthority`. Cette capability n'ouvre pas l'admission et ne peut
jamais être remplacée par une lease métier.

Après cette première publication, `ready` continue à servir les callers tardifs
par une nouvelle commande de publication strictement corrélée à leur
`requestId`. Cette branche ne relit ni le gate Reset, ni les versions, ni les
preuves Settings et ne rouvre pas l'admission.

Le modèle ne modifie pas les constantes runtime DB5/data2. DB6/data3 sont les
cibles du contrat Task 5b et ne deviennent actives qu'au cutover commun.

## Autorité des modèles partagés

Ce modèle réutilise, sans copie réduite :

- `LocalDataResetJournalV1`, les preuves de preflight et la preuve d'autorité
  DB6/data3 de `local-data-reset.contract.ts` ;
- `SettingsEnvelopeV2`, `SettingsSnapshotV1`, le parseur de snapshot settled et
  le format `settings/recover/<requestId>` de
  `settings-persistence.contract.ts`.

Le wrapper `StartupSettingsRecoveredV1` ajoute seulement les identités de la
tentative (`attemptId`, `workerEpoch`) au snapshot Settings partagé. Il ne
redéfinit ni l'enveloppe ni la preuve d'alarme.

## Machine d'états

```text
boot
  -> idle
  -> active.checkingResetJournal
       -> resetOwned                         journal présent
       -> active.preflightingReset           demande Reset prioritaire
            -> resetOwned                    fresh ou completion reconnue
       -> active.readingVersions             gate Reset clair
            -> downgradeBlocked              version future
            -> failed                        versions incohérentes
            -> active.upgradingStructure?    DB < 6
            -> active.migratingData?         data < 3
       -> active.verifyingCriticalAndEpoch
       -> active.wrappingSettingsEnvelope
       -> active.recoveringPreparedLedgers
       -> active.recoveringSettings
            -> resetOwned                    Settings détecte Reset
       -> active.openingAdmission
       -> active.publishingBootstrap
       -> ready

ready -- START doublon --> ready
ready -- START neuf --> active.publishingBootstrap --> ready
active -- START neuf avec batch plein --> rejet typé sans transition

active -- STEP_FAILED exact avant admission --> failed
active -- STEP_FAILED exact après admission --> active.fencingFailure
active.fencingFailure -- FAILURE_FENCED exact --> failed
active.fencingFailure -- STEP_FAILED fence --> failureFenceBlocked
failed -- RETRY explicite et retryable --> active.checkingResetJournal
active/ready/failed/failureFenceBlocked -- RESET_PREEMPTED --> resetOwned
```

`ready` reste actif pour traiter explicitement un `START` tardif. `resetOwned`,
`downgradeBlocked` et `modelError` sont terminaux pour l'acteur courant.
`failed` reste stable jusqu'à un `RETRY` explicite autorisé ;
`failureFenceBlocked` n'autorise aucun retry et attend seulement une prise de
propriété Reset strictement corrélée. Aucun `after`, timer ou
always-transition ne relance une tentative.

## Entrée et identités

L'entrée de la machine contient :

- `workerEpoch`, UUID v4 injecté par la future Shell ;
- les Settings par défaut strictes ;
- la liste triée et sans doublon des connecteurs inclus.

Le premier `START` fournit :

- `attemptId`, UUID v4 unique de la tentative ;
- `requestId`, UUID v4 du caller ;
- `settingsRecoveryRequestId`, UUID v4 distinct ;
- l'écho du `workerEpoch` courant.

Ces identités sont injectées ; le modèle n'appelle ni horloge, ni random, ni
crypto. Tout résultat asynchrone répète `attemptId`, `workerEpoch` et le
`commandId` courant. Une preuve Settings répète en plus `dataEpoch`,
`requestId` et son command ID Settings.

## Single-flight et capacité bornée

Une publication contient au maximum
`DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION = 64` waiters/bootstraps. Cette
capacité est une décision du modèle, commune au batch initial et aux joins reçus
pendant une publication. Un 65e caller neuf reçoit
`BOOTSTRAP_BATCH_CAPACITY_EXCEEDED` avec la capacité et ses identités exactes ;
la façade n'envoie aucun événement à l'acteur et le contexte, la commande et le
batch restent byte-for-byte inchangés. Un doublon déjà pending ne consomme pas
de slot et reste idempotent.

Pendant `active`, un nouveau `START` n'est admis comme join que si :

- il porte exactement l'`attemptId` et le `workerEpoch` actifs ;
- il porte le même `settingsRecoveryRequestId` ;
- son `requestId` est un UUID distinct des identités de tentative.

Le modèle mémorise seulement `pendingRequestIds`, dans leur ordre d'arrivée et
pour la publication courante. Une tentative concurrente différente est rejetée
par la façade et ne remplace jamais l'acteur actif.

Si un caller rejoint pendant `publishingBootstrap`, dans la limite disponible,
la commande est réémise avec le batch pending complet. Une ancienne preuve ne
peut plus correspondre à ce batch et est rejetée. Une preuve valide remplace
`lastPublicationProof`, vide immédiatement `pendingRequestIds`, puis rejoint
`ready`. Le snapshot ne conserve donc que le dernier batch publié, toujours
borné à 64, et jamais l'historique du worker.

Dans `ready`, un `START` présent dans le dernier batch publié est un no-op
idempotent. Un ID plus ancien n'exige aucun registre illimité : comme un ID neuf,
il initialise un batch singleton et republie le même bootstrap déterministe
`requestId/workerEpoch/dataEpoch`. Aucun état antérieur à la publication n'est
revisité. Un échec de cette publication tardive suit le même fence
post-admission que la publication initiale.

Le coût mémoire est `O(capacité)` et chaque cycle tardif est `O(taille du
batch)`. Des milliers de cycles singleton conservent zéro pending ID en `ready`
et un seul bootstrap dans `lastPublicationProof`.

La future barrière Promise reste responsable de faire partager le même résultat
aux waiters ; la machine rend ce résultat déterministe et corrélé.

## Commandes pures

Le contexte contient au plus une commande attendue :

| État                      | Commande                     | Ouvre IDB ?           |
| ------------------------- | ---------------------------- | --------------------- |
| checkingResetJournal      | `READ_RESET_GATE`            | non                   |
| preflightingReset         | `PREFLIGHT_RESET_REQUEST`    | non                   |
| readingVersions           | `READ_VERSIONS`              | oui, après gate Reset |
| upgradingStructure        | `UPGRADE_STRUCTURE`          | oui                   |
| migratingData             | `MIGRATE_DATA`               | oui                   |
| verifyingCriticalAndEpoch | `VERIFY_CRITICAL_AND_EPOCH`  | oui                   |
| wrappingSettingsEnvelope  | `WRAP_SETTINGS_ENVELOPE`     | non                   |
| recoveringPreparedLedgers | `RECOVER_PREPARED_LEDGERS`   | oui                   |
| recoveringSettings        | `RECOVER_SETTINGS_AND_ALARM` | non                   |
| openingAdmission          | `OPEN_EPOCH_ADMISSION`       | non                   |
| publishingBootstrap       | `PUBLISH_BOOTSTRAPS`         | non                   |
| fencingFailure            | `FENCE_STARTUP_FAILURE`      | non                   |

Chaque commande de workflow porte `destructiveRepairAllowed:false`. La somme
des commandes ne contient ni `DELETE_DATABASE`, ni `CLEAR_STORAGE`, ni backup
destructif. Les états terminaux exposent seulement `REPORT_FAILURE`,
`REPORT_DOWNGRADE` ou `TRANSFER_RESET_OWNERSHIP`.

Les command IDs sont déterministes :

```text
dataset-startup/<stage>/<attemptId>
```

La commande de fence cite l'epoch, le proof ID d'ouverture et l'erreur originale.
Elle appelle le futur port `DatasetEpochAuthority.fenceFailure` sous le gate
central. Une preuve de clôture doit répéter ces identités, montrer une révision
d'autorité strictement supérieure à `previousAuthorityRevision`,
`admission:'closed'`, `activeLeaseCount:0` et `allLeasesRevoked:true`.

La récupération Settings emploie le command ID partagé :

```text
settings/recover/<settingsRecoveryRequestId>
```

## Composition pré-admission avec l'autorité

Le contrôleur Shell forme un `DatasetPreAdmissionCommandClaimV1` uniquement
pour une commande qui contient au moins une écriture Dataset. Le claim répète
exactement :

- `workflowId === attemptId` et le `workerEpoch` actifs ;
- `stage: startup:<stage>` et le command ID déterministe courant ;
- le `dataEpoch` observé par l'autorité, littéralement `null` lorsque
  `closed_startup` n'en retient pas encore ;
- `authorityRevision` et `fenceRevision` relues ;
- un plan ordonné de write IDs UUID frais.

Le mapping est fermé :

| Commande Startup             | Plan capability exact                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UPGRADE_STRUCTURE`          | une capability `startup.structure.db6_upgrade_transaction` couvrant uniquement la transaction version-change DB6                                  |
| `MIGRATE_DATA`               | trois capabilities distinctes et ordonnées : transaction IDB tracking data-v3, wrap/strict read-back Settings V2, write/strict read-back marker 3 |
| `RECOVER_PREPARED_LEDGERS`   | une capability pour l'unique transaction atomique seulement si des ledgers doivent être écrits ; le chemin zéro ledger reste read-only            |
| `RECOVER_SETTINGS_AND_ALARM` | une capability fraîche par write d'enveloppe/journal/outcome du plan Settings partagé ; aucun token global pour le port                           |

`READ_RESET_GATE`, `PREFLIGHT_RESET_REQUEST`, `READ_VERSIONS`,
`VERIFY_CRITICAL_AND_EPOCH`, `WRAP_SETTINGS_ENVELOPE`,
`OPEN_EPOCH_ADMISSION`, `PUBLISH_BOOTSTRAPS` et
`FENCE_STARTUP_FAILURE` ne créent aucun claim d'écriture. Après la saga
`MIGRATE_DATA`, `WRAP_SETTINGS_ENVELOPE` est le read-back strict supplémentaire
avec la policy déterminée par le marker ; refaire le write du wrap dans cette
commande est interdit.

Pour chaque plan :

1. `beginPreAdmissionCommand` enregistre le claim sous la FIFO existante ;
2. chaque write acquiert sa capability exacte puis appelle
   `commitPreAdmission` ;
3. la capability est consommée avant invocation/await de l'effet durable ;
4. `completePreAdmissionCommand` révoque les tokens restants et précède
   obligatoirement l'event de succès ou d'échec qui change le stage.

Un Reset en file, un failure fence, un changement de command/stage/attempt,
une révision ou un epoch différent révoque le scope. La FIFO seule décide : un
commit déjà linéarisé termine avant le fence ; un commit placé après le fence
exécute zéro callback. Un callback tardif ne peut ni réémettre une capability
consommée, ni obtenir l'epoch courant à la place de celui de son claim.

`OPEN_EPOCH_ADMISSION` est refusé tant qu'un scope Startup est actif ou qu'une
capability de sa commande n'est pas terminale. Après son succès, le chemin
pré-admission est fermé et les writers métier utilisent exclusivement
`issueLease/commit`. Une absence d'API capability est une configuration
invalide, jamais un signal pour appeler directement IndexedDB/Chrome Storage
ou une gate no-op.

## Gate Reset avant tout opener

`READ_RESET_GATE` déclare `allowsDatabaseOpen:false`. Aucun autre état n'est
atteignable avant l'un des résultats suivants :

- `RESET_JOURNAL_FOUND` : un journal strict de n'importe quelle phase, y
  compris `committed`, transfère immédiatement la propriété au Reset ;
- `RESET_REQUEST_PENDING` : la tentative effectue le preflight read-only avant
  toute version/migration ;
- `RESET_GATE_CLEARED` : seul résultat autorisant `READ_VERSIONS`.

Un preflight `fresh` ou une completion post-clear reconnue ne redémarre pas le
démarrage ordinaire. Les deux transfèrent au workflow Reset, afin qu'aucune
migration/admission ne concurrence sa réponse ou son journal.

Un journal malformé n'est jamais interprété comme absent. La Shell doit renvoyer
un `STEP_FAILED` `RESET_JOURNAL_INVALID`, non retryable et non destructif.

## Versions et migration non destructive

`VERSIONS_READ` contient la cible exacte DB6/data3 et les valeurs stockées.

- version stockée supérieure : `downgradeBlocked`, octets intacts ;
- couple structure/data incohérent : `failed`, `VERSION_PROTOCOL_INVALID` ;
- structure antérieure : transaction structurelle vers DB6 ;
- data antérieure : transaction applicative vers data3 ;
- DB6/data3 : passage direct à la vérification.

Une preuve structurelle ou data n'est admise que si :

- elle reprend la version source observée ;
- la transaction est déclarée committed ;
- la version cible et le marker read-back sont exacts ;
- `destructiveRepairPerformed` vaut littéralement `false`.

Un échec physique produit `STEP_FAILED`; il ne déclenche ni recréation ni retry
automatique. Le prochain essai commence de nouveau au gate Reset et relit les
versions durables. Une transaction crashée est donc résolue par les faits
stockés, pas par un snapshot mémoire présumé.

Pour data-v3, `MIGRATE_DATA` est une saga, pas une unique transaction
cross-storage. Son ordre durable est exactement :

1. transaction IDB `mission_tracking + tracking_meta + quarantine` complète,
   sous sa capability ; marker 2 reste durable ;
2. write puis read-back strict du `SettingsEnvelopeV2` complet avec le même
   epoch, sous une deuxième capability ; marker 2 reste durable ;
3. write puis read-back de `APP_DATA_VERSION = 3`, sous une troisième
   capability.

Le port ne peut produire `DATA_COMMITTED` qu'après ces trois preuves et après
completion du scope. Un crash à chacune des frontières laisse l'admission
fermée ; le prochain worker relit les faits, utilise un nouveau worker/attempt,
de nouveaux write/capability IDs et reprend idempotemment. Aucun token mémoire
de l'ancien worker n'est une preuve de commit.

## Epoch canonique et validation critique

`VERIFICATION_PASSED` encapsule la preuve d'autorité partagée DB6/data3 :

- `databaseName:'missionpulse'` ;
- DB6/data3 et schéma vérifié ;
- singleton `tracking_meta`, schema 1 ;
- UUID `dataEpoch` identique dans authority/meta ;
- `collectionRevision` entier sûr ;
- `criticalRecordsValid:true` et marker 3 relu.

Cette preuve est la seule action qui installe `context.dataEpoch`. Aucun event
suivant ne peut proposer un epoch différent.

## Wrap Settings

La politique du décodeur dépend du marker observé à l'entrée :

- data3 déjà présent : `v2_only` ;
- migration depuis une version antérieure : `allow_migration`.

`SETTINGS_ENVELOPE_WRAPPED` doit relire un `SettingsEnvelopeV2` strict avec le
même epoch et marker 3. Le modèle réutilise le parseur partagé, y compris le
journal, les outcomes, la génération et les connecteurs. Cette étape prouve la
forme durable ; elle ne prouve pas encore l'effet alarme ni la readiness. Le
write de wrap ayant déjà eu lieu dans `MIGRATE_DATA` quand une migration était
nécessaire, cette commande est strictement read-only et ne demande aucune
capability.

## Prepared ledgers

`PREPARED_RECOVERED` répète `attemptId`, `workerEpoch` et `dataEpoch`, affirme
`recoveryCompleted:true` et `olderWorkerPreparedRemaining:0`. Un événement d'un
ancien worker ou d'un autre epoch est rejeté.

Le modèle ne choisit pas le résultat d'un ledger. La future Shell applique les
règles déterministes du modèle tracking puis renvoie cette preuve agrégée.

## Récupération Settings et alarme obligatoire

`SETTINGS_RECOVERY_PASSED` est admis seulement si :

- les cinq identités externes correspondent à la tentative active ;
- le `SettingsSnapshotV1` partagé est strictement décodable pour l'epoch ;
- les identités internes du snapshot égalent les identités externes ;
- `resetJournalAbsent:true` ;
- l'enveloppe est settled (`journal:null`) ;
- la preuve d'alarme correspond à l'enveloppe, request ID et command ID.

Sans cette preuve, `openingAdmission` est inatteignable. Un no-op de récupération
ne peut donc pas produire readiness.

Si Settings détecte un Reset durable, `SETTINGS_RESET_IN_PROGRESS` doit porter
le journal strict et transfère vers `resetOwned`; ce n'est pas un échec de
migration ordinaire.

## Admission et bootstrap

`ADMISSION_OPENED` n'est accepté qu'après conservation simultanée des preuves :

- vérification critique/epoch ;
- enveloppe Settings relue ;
- prepared ledgers réglés ;
- Settings/alarme settled et corrélés.

La preuve d'admission répète l'epoch et inclut une révision sûre ainsi qu'un
`proofId` UUID. La publication doit citer ce proof ID et rendre exactement les
bootstraps demandés. `ready` n'existe qu'après `BOOTSTRAP_PUBLISHED` valide.

`ready` ne cache pas un résultat terminal hors modèle. Il conserve la preuve
d'admission et seulement le dernier batch publié. Un caller tardif absent de ce
batch doit déclencher dans la machine une nouvelle `PUBLISH_BOOTSTRAPS`
contenant sa corrélation ; la Shell ne fabrique jamais un bootstrap à partir
d'un snapshot.

## Échecs et retry explicite

`STEP_FAILED` doit :

- correspondre à la commande et au stage actuellement attendus ;
- suivre la matrice code/stage/retryable du contrat ;
- porter `destructiveEffectPerformed:false` ;
- utiliser un message non vide et borné.

Lorsqu'une commande possédait un scope pré-admission, la Shell le complète en
disposition révoquée avant d'envoyer `STEP_FAILED`. Un effet durable rejeté a
déjà consommé sa capability ; le retry ne peut jamais la rejouer.

Avant `ADMISSION_OPENED`, tous les waiters de la tentative observent le même
échec et la machine rejoint directement `failed`. Après `ADMISSION_OPENED`, le
même événement conserve d'abord l'erreur originale et rejoint
`fencingFailure`. Il émet `FENCE_STARTUP_FAILURE`; ni `failed`, ni `RETRY`, ni
une nouvelle publication ne sont alors atteignables.

Seul `FAILURE_FENCED` strict peut rejoindre `failed`. Sa preuve doit confirmer
la fermeture de l'admission, zéro lease active et la révocation de toutes les
leases pour l'epoch et le proof ID d'ouverture exacts. Un `STEP_FAILED` de stage
`failure_fence` est non-retryable et conduit à `failureFenceBlocked`. Cette issue ambiguë ne peut
pas être transformée en retry par le message ou le code d'une erreur ; seul un
Reset corrélé peut reprendre le fence.

Le port d'autorité reçoit la commande `FENCE_STARTUP_FAILURE` exacte, capture
son erreur structurée et bornée sans relire l'objet source, puis rend la preuve
`FAILURE_FENCED` exacte sous le gate. Si Reset est déjà `reset_pending` ou
`reset_owned`, ce port refuse sans modifier le token ni la corrélation Reset ;
la machine emprunte uniquement la préemption/transfert Reset corrélée.

Depuis `failed`, `RETRY` avec un nouvel `attemptId`, un nouveau request ID et un
nouveau request ID Settings peut recommencer uniquement si l'erreur originale
est retryable et si, lorsqu'une admission avait été ouverte, la preuve de fence
est retenue.

Le retry incrémente `retryCount`, efface toutes les preuves volatiles et revient
à `checkingResetJournal`. Une erreur protocolaire, une corruption critique ou
un downgrade ne devient jamais retryable par texte libre.

## Préemption Reset

`RESET_PREEMPTED` est global à tous les états `active`, ainsi qu'à `ready`,
`failed` et `failureFenceBlocked`. Il exige les identités de la tentative et un
reset ID strict. Lorsqu'un journal est fourni, il doit être strict et porter ce
reset ID.

La transition terminale :

- remplace la commande courante par `TRANSFER_RESET_OWNERSHIP` ;
- révoque sous la FIFO le scope/capabilities Startup encore actifs ;
- n'ouvre pas l'admission ;
- n'accepte plus de résultat tardif ;
- laisse au workflow Reset la prise du gate et la révocation des leases.

Le modèle ne simule pas une annulation d'une transaction IndexedDB déjà
committed : la transaction décide son résultat durable, puis le prochain boot
relit les versions et le journal avant toute autre action.

## Crash et redémarrage du service worker

L'acteur n'est pas sérialisé. Un crash détruit l'acteur et ses commandes
volatiles. Un nouveau worker crée :

1. un nouveau `workerEpoch` ;
2. un nouvel acteur en `idle` ;
3. une nouvelle tentative explicite ;
4. `READ_RESET_GATE` comme première commande.

Les événements de l'ancien acteur échouent la corrélation worker/attempt. Les
transactions ou journaux durablement committed sont retrouvés par les lectures
idempotentes du nouveau démarrage. Les prepared ledgers d'un ancien worker et
le journal Settings sont réglés avant toute admission.

Les registres capability sont worker-locaux, bornés et sans éviction. Un
redémarrage crée un nouveau `workerEpoch`; il reconstruit un plan avec des
claim/write/capability IDs frais. Une capability exacte de l'ancien worker
échoue donc même si une callback tardive conserve ses champs visibles.

Il n'existe pas de faux événement `SERVICE_WORKER_RESTARTED` envoyé à un acteur
qui aurait survécu : un worker mort ne reçoit pas d'événement.

## Façade sûre

La machine et l'acteur sont des constantes privées de
`dataset-startup.machine.ts`. Le runtime ne reçoit qu'un contrôleur :

- `dispatch(rawEvent: unknown)` ;
- `getSnapshot()` ;
- `subscribe()` ;
- `stop()`.

`getSnapshot` et `subscribe` ne retournent jamais le snapshot XState natif. Ils
projettent un DTO public allowlisté contenant seulement l'état plat, les
identités utiles, la commande pure, l'epoch, l'erreur originale et, séparément,
une éventuelle `fenceError`. Chaque DTO,
commande, tableau et preuve exposée est recopié puis gelé en profondeur. Il ne
contient ni `context`, ni `machine`, ni `_nodes`, ni `matches`, ni fonction
XState, ni alias vers le contexte privé. Une notification d'abonnement reçoit
une nouvelle projection sûre, jamais l'objet natif ni le même objet que
`getSnapshot`.

La façade :

1. refuse acteur inactif et dispatch réentrant ;
2. lit uniquement des propriétés data propres, exactes et énumérables ;
3. refuse prototypes exotiques, getters, clés manquantes ou supplémentaires ;
4. parse les preuves avec les contrats partagés ;
5. crée un nouvel event snapshot ;
6. l'admet dans un `WeakSet` seulement pendant le `send` synchrone.

Après normalisation mais avant `send`, la même façade applique la fonction pure
de capacité. Un dépassement retourne le résultat typé
`capacity_exceeded/BOOTSTRAP_BATCH_CAPACITY_EXCEEDED`, profondément gelé, sans
`actor.send`, notification d'abonné ni mutation de contexte.

Ainsi, même un event TypeScript importé ne peut contourner la normalisation :
l'acteur et sa méthode `send` ne sont jamais exposés.

Les tableaux `unknown` sont capturés par réflexion stricte : descriptor data
propre non-énumérable de `length`, rejet immédiat si `length > maxLength`, clés
propres exactes, puis descriptors data énumérables des indices denses. La limite
est vérifiée avant `Array.from`, `Reflect.ownKeys` et toute boucle. Aucun accès
`value.length`, indexé ou itératif n'est effectué sur la source. Un getter, un
trap `get`, un Proxy révoqué, un trou, une clé/indice supplémentaire ou un
accessor échoue fermé.

## Invariants

1. `READ_RESET_GATE` précède toute commande autorisant un opener.
2. Tout journal Reset valide, y compris `committed`, termine en `resetOwned`.
3. Une demande Reset prioritaire est preflightée avant versions/migration.
4. Aucune commande n'autorise suppression ou réparation destructive.
5. `{ok:false}` sera traduit par `STEP_FAILED`, jamais par un événement commit.
6. Un résultat asynchrone doit égaler attempt, worker, command et stage actifs.
7. L'epoch vient uniquement de la preuve canonique DB6/data3.
8. Le wrap Settings réutilise le seul `SettingsEnvelopeV2` partagé.
9. Aucun prepared ledger d'un ancien worker ne subsiste avant Settings.
10. L'admission exige le snapshot Settings/alarm settled et totalement corrélé.
11. Aucun bootstrap n'est publié avant la preuve d'admission.
12. Tous les callers single-flight obtiennent le même worker/epoch.
13. Un échec avant admission ne l'ouvre pas ; un échec après admission exige une
    preuve de fermeture/révocation avant `failed` ou tout retry.
14. Un retry explicite utilise un nouvel attempt ID et recommence au reset gate.
15. Un Reset préemptif invalide la progression normale et devient terminal.
16. Un crash ne restaure jamais un état mémoire comme preuve durable.
17. Aucun LLM, texte libre, horloge ou UUID généré ne décide une transition.
18. `ready` reste actif : un START tardif neuf ne rejoue que la publication et
    reçoit un bootstrap portant son request ID ; un doublon reste idempotent.
19. Une clôture d'autorité ambiguë reste bloquée et ne devient jamais retryable.
20. La normalisation de tableaux n'exécute aucun getter/trap `get`, y compris
    pour `length`, et refuse toute forme non dense ou non exacte.
21. Pending IDs, commande et preuve de publication ne dépassent jamais 64
    éléments ; un dépassement est typé et ne modifie aucun état.
22. `pendingRequestIds` est vidé après chaque preuve ; seul le dernier batch
    borné est conservé, jamais l'historique complet des callers.
23. Une longueur inconnue supérieure au maximum est rejetée avant allocation,
    `ownKeys` ou boucle.
24. Toute écriture avant admission possède un claim de la commande active et
    une capability distincte consommée avant l'effet ; une ordinary lease reste
    refusée.
25. Claim, issue, commit, completion, ordinary commit, Reset et failure fence
    partagent la FIFO unique de `DatasetEpochAuthority`.
26. `MIGRATE_DATA` possède exactement trois frontières capability ordonnées :
    transaction IDB, wrap/read-back Settings V2, marker-3 write/read-back.
27. `WRAP_SETTINGS_ENVELOPE` est read-only après cette saga et ne peut écrire
    une seconde fois l'enveloppe.
28. Aucun event ne change le stage tant que le scope de la commande précédente
    reste actif ; completion/révocation précède l'event.
29. Reset, failure fence, drift de stage/command/attempt/epoch ou de révision
    rend toute callback perdante incapable d'entrer dans son effet ; un worker
    différent ne possède pas le registre exact-object de l'ancien.
30. Les registres capability sont bornés, sans éviction ni fallback ; leur
    exhaustion est un échec typé et non une permission de write direct.

## Scénarios de Review

À couvrir par les futurs tests de transition et de Shell :

- nouvelle installation : DB0/marker absent -> DB6/data3 -> ready ;
- DB5/data2 -> structure puis data -> ready ;
- DB6/data2 après crash -> data seulement -> ready ;
- DB6/data3 -> vérification sans migration -> ready ;
- DB7 ou data4 -> downgrade terminal sans write ;
- échec/open blocked à chaque étape -> failed, zéro auto-retry ;
- retry explicite -> nouvel attempt, reset gate relu ;
- journal Reset dans chaque phase -> resetOwned avant opener ;
- demande Reset journal absent -> preflight puis transfert ;
- reset preempt entre chaque paire d'étapes -> aucun stage suivant ;
- preuve Settings stale sur chaque identité -> aucune admission ;
- Settings reset in progress -> resetOwned ;
- caller joint pendant publication -> ancienne publication rejetée ;
- caller tardif après ready -> publication seule, bootstrap nouvel ID, aucune
  migration/récupération/admission répétée ; doublon du dernier batch no-op,
  ancien doublon republié déterministement ;
- rafale de 64 waiters admise, 65e résultat typé sans mutation ; milliers de
  cycles tardifs gardent pending vide et un dernier batch borné ;
- échec de publication initiale ou tardive après admission -> commande fence,
  aucun retry avant preuve zéro lease ; fence ambigu -> bloqué ;
- crash à chaque étape -> nouveau worker, nouveau gate, convergence durable ;
- ordinary lease pré-admission refusée ; substitution de claim, stage,
  command, attempt, worker, epoch nullable, authority/fence revision, write ou
  capability refusée avant callback ;
- deux writes d'une commande utilisent deux capabilities distinctes ; double
  consume, callback après completion et token cross-command/cross-worker
  produisent zéro write ;
- matrice FIFO commit/Reset/failure-fence dans les deux ordres, allocator
  reentrant/throw/collision et exhaustion des registres sans éviction ;
- crash après transaction IDB data-v3, après read-back Settings V2 et après
  marker 3 : reprise avec IDs frais, jamais de lease/admission anticipée ;
- event avec getter, clé extra ou objet muté -> `invalid_event` ; tableau Proxy
  avec trap `get` -> zéro lecture, Proxy révoqué/trou/extra/accessor rejeté ;
  longueur 65 rejetée avant `ownKeys`.

## Hors portée de ce modèle

- implémentation de `startup-barrier.ts` et de ses Promises ;
- ouverture réelle d'IndexedDB ou de DatasetEpochAuthority ;
- implémentation des contrats/méthodes capability pré-admission ;
- migration DB6/data3 et cutover des writers ;
- implémentation Settings/alarm et prepared-ledger recovery ;
- quiescence, suppression et réinitialisation possédées par Reset ;
- toute logique de décision LLM.
