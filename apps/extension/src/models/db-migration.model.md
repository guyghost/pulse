# Modèle de migration de la base de données

Source de vérité pour le cycle de vie d'IndexedDB et la migration applicative des données de MissionPulse. Ce modèle constitue le contrat de la tâche 5b. Il remplace l'ancienne description DB4/data1 et doit faire l'objet d'une revue avant implémentation.

Statut : **Cible de la tâche 5b, dormante à la frontière de release.** L'ouvreur tracé (tracked opener) et la détention indépendante de poignée (handle ownership) sont implémentés aujourd'hui. La barrière de démarrage (Startup Barrier) n'est pas active : `runMigrations()` ne déduplique que ses propres appelants de migration, les appelants métier de `openDB()` ne l'attendent pas (await), et le lancement en arrière-plan demeure en mode « fire-and-forget ». Les sections décrivant l'admission, les baux (leases), la publication ou l'état prêt au démarrage (startup readiness) représentent donc un comportement cible, et non une affirmation sur le runtime actuel. Chaque propriétaire métier actuel doit toujours libérer sa poignée délivrée indépendamment en cas de succès, d'erreur, d'interruption (abort) ou d'échec synchrone d'initialisation. Le propriétaire actuel du démarrage de migration installe un guard de libération unique (release-once guard) immédiatement après le succès de `openStartupDB()`. Ce propriétaire couvre les lectures de la version des données stockées, la migration des données, la vérification, la décision de mise en quarantaine et chaque sortie terminale/d'erreur. Il peut libérer avant d'ouvrir la poignée de quarantaine indépendante, mais le `finally` externe reste autoritaire et une seconde libération est interdite.

Le sous-système de migration appartient au code Shell. Il peut appeler des parseurs purs et des constructeurs canoniques issus du Core ; le Core n'importe jamais IndexedDB, les APIs Chrome, les horloges ou la génération d'UUID. Aucune sortie de LLM ne peut choisir une transition de migration ou une réparation.

## Périmètre et frontière de release

| Axe                | Persisté par                    | Ligne de base implémentée | Cible tâche 5b |
| ------------------ | ------------------------------- | ------------------------- | -------------- |
| `DB_VERSION`       | Schéma natif IndexedDB          | 5                         | 6              |
| `APP_DATA_VERSION` | Marqueur `chrome.storage.local` | 2                         | 3              |

`DB_VERSION` change uniquement pour les object stores ou les index. `APP_DATA_VERSION` change uniquement pour la forme des enregistrements persistés. Les deux sont strictement croissants de façon monotone. Le marqueur pour data 3 n'est écrit qu'après l'achèvement de la transaction data-v3.

La tâche 5b doit prendre en charge ces points d'entrée :

- un nouveau profil sans base de données et sans marqueur de données ;
- la ligne de base DB5/data2 implémentée ;
- une base DB6 structurellement mise à niveau dont le marqueur de données est toujours à 2 après un crash ;
- un démarrage sans opération (no-op) sur une base DB6/data3 totalement à jour ;
- une nouvelle tentative (retry) après un échec d'ouverture, de migration, de validation ou de récupération ;
- la préemption par réinitialisation via `local-data-reset.model.md`.

Le rétrogradage (downgrade) (`stored DB > 6` ou `stored data > 3`) s'effectue en repli sécurisé (fail-closed) et de manière non destructive. Il n'ouvre jamais avec une version demandée inférieure.

## Registre structurel

Le registre ordonné est en ajout seul (append-only). Chaque migration reçoit l'unique transaction active de changement de version créée par `indexedDB.open` :

```ts
type StructuralMigration = (db: IDBDatabase, tx: IDBTransaction) => void;

request.onupgradeneeded = (event) => {
  const tx = request.transaction;
  if (!tx) throw new Error('Missing IndexedDB upgrade transaction');

  for (const migration of structuralMigrationsFor(event.oldVersion)) {
    migration(request.result, tx);
  }
};
```

Une migration structurelle doit utiliser `tx.objectStore(name)` pour un store existant. Elle ne doit pas ouvrir de seconde transaction. Toute exception levée interrompt (abort) l'intégralité du changement de version, de sorte que la version 6 de la DB et ses stores/index sont validés (committed) ensemble ou pas du tout.

### Schéma exact après DB6

| Store                | Ajouté | keyPath       | Nom d'index -> keyPath                                 |
| -------------------- | ------ | ------------- | ------------------------------------------------------ |
| `missions`           | 1      | `id`          | `source` -> `source`; `scrapedAt` -> `scrapedAt`       |
| `profile`            | 1      | `id`          | —                                                      |
| `connector_status`   | 2      | `connectorId` | —                                                      |
| `generated_assets`   | 3      | `id`          | `missionId` -> `missionId`                             |
| `mission_tracking`   | 4      | `missionId`   | `currentStatus` -> `tracking.currentStatus`            |
| `quarantine`         | 5      | `id`          | `originalStore` -> `originalStore`                     |
| `tracking_meta`      | 6      | `key`         | —                                                      |
| `tracking_mutations` | 6      | `mutationId`  | `missionId` -> `missionId`; `phase` -> `phase`         |
| `tracking_outbox`    | 6      | `mutationId`  | `missionId` -> `missionId`; `dataEpoch` -> `dataEpoch` |

Tous les index sont non uniques. V6 supprime l'index `currentStatus` de v4 et le recrée avec le keyPath imbriqué `tracking.currentStatus`. Un tombstone possède `tracking` à null et est donc absent de cet index. V6 crée les trois nouveaux stores mais n'écrit aucune ligne dans l'outbox : la capacité de dashboard connecté en production est désactivée dans la tâche 5b.

L'enregistrement unique de métadonnées est :

```ts
interface TrackingMetaV1 {
  key: 'tracking_meta';
  schemaVersion: 1;
  dataEpoch: string; // UUID v4 injecté
  collectionRevision: number; // entier sécurisé, commence à 0
}
```

`tracking_meta` contient exactement cette unique ligne. Son epoch identifie l'ensemble du jeu de données local, et non la durée de vie d'un service worker. Les enveloppes, registres (ledgers), lignes d'outbox, requêtes et réponses la répètent. La durée de vie du worker utilise un `workerEpoch` distinct.

## Autorité centrale de génération du jeu de données

`dataEpoch` est la génération du jeu de données local complet, et non un simple token dédié au tracking. Le singleton strict `tracking_meta` en est l'autorité durable canonique. Les paramètres (settings), le profil, les missions, les points de contrôle (checkpoints) de scan, les assets générés, les caches sémantiques/TJM, l'état vu/favori et tout autre rédacteur (writer) local sont des consommateurs de cette autorité même lorsque leurs données résident en dehors d'IndexedDB.

Le démarrage publie un bootstrap corrélé uniquement après la migration et la récupération :

```ts
interface LocalDatasetBootstrapV1 {
  version: 1;
  requestId: string; // UUID v4 fourni par l'appelant
  workerEpoch: string; // UUID v4 du worker actuel
  dataEpoch: string; // epoch canonique de tracking_meta
}

interface DatasetMutationScopeV2 {
  version: 2;
  operationId: string; // identité immuable d'intention/opération
  dataEpoch: string;
}
```

Chaque réponse de bootstrap/chargement fait écho à son ID de requête et à son `dataEpoch`. Le panneau (panel) doit rejeter les chargements issus de requêtes mixtes ou d'epochs mixtes. Chaque commande mutative du bridge après la bascule (cutover) transporte `DatasetMutationScopeV2` ; cela inclut le tracking, les paramètres, la sauvegarde/import/synchronisation de profil, le démarrage/annulation/finalisation de scan et tout chemin de mutation dev. Une lecture peut conserver une projection de compatibilité, mais **chaque écriture v1 sans epoch échoue en repli sécurisé (fail-closed) après la bascule vers data-v3**. Le worker n'ajoute jamais son epoch courante à une ancienne commande appelante au nom de celle-ci.

Le travail interne utilise un bail révocable :

```ts
interface DatasetWriteLeaseV1 {
  version: 1;
  leaseId: string; // UUID v4 injecté
  operationId: string;
  dataEpoch: string;
  authorityRevision: number; // entier sécurisé local au worker
}
```

Le service worker possède un `DatasetEpochAuthority` et une barrière d'engagement (commit gate) sérialisée. L'admission requiert que l'epoch demandée soit égale aux métadonnées canoniques et lie un bail à l'opération immuable. Immédiatement avant chaque validation durable (durable commit), le rédacteur entre dans cette porte et revalide l'ID de bail, l'ID d'opération, l'epoch et la révision d'autorité. Il retient la barrière jusqu'à ce que la transaction IDB ou la promesse de stockage Chrome se stabilise (settles). Il n'y a aucun écart asynchrone entre la revalidation et l'admission de commit.

Avant l'admission ordinaire, le même objet et la même file FIFO exposent les six opérations modélisées par `dataset-write-capability.model.md` :

```ts
beginPreAdmissionCommand(claim);
issuePreAdmissionCapability(scopeToken, writeId);
commitPreAdmission(capability, writeId, exactDurableLeafToken);
completePreAdmissionCommand(scopeToken);
reserveResetPreAdmission(request, exactAuthorityReadLeafToken);
rehydrateResetPreAdmission(journalIdentity, exactAuthorityReadLeafToken);
```

Elles ne constituent pas une seconde autorité. `issueLease/commit`, ces six opérations, `acquireResetFence`, `installResetEpoch` et `fenceFailure` utilisent toutes l'unique file d'attente `runWithGate` existante. Un second mutex dans une porte locale Chrome, un adaptateur DB, un port Startup ou un adaptateur Reset constitue une défaillance d'architecture.

La revendication de commande stricte lie le propriétaire/workflow, l'étape (stage), la commande, la tentative d'exécution, l'epoch du worker, l'epoch de données nullable spécifique à l'étape, la révision d'autorité, la révision de barrière de protection (fence revision) et un plan d'écriture ordonné et borné. Chaque entrée du plan possède un write ID frais. Sa capacité répète chaque corrélation en plus de son propre ID frais et de son numéro d'ordre (ordinal). Le snapshot d'autorité expose `fenceRevision` ; il progresse dès qu'un achèvement, une révocation, une dérive d'étape/commande/tentative/epoch, une réinitialisation (Reset), l'installation d'une epoch de Reset ou l'isolation d'échec de démarrage invalide une portée (scope). Une discordance de worker rejette, tandis que la terminaison du worker détruit le registre d'objets exacts de ce worker.

`dataEpoch:null` n'est accepté que lorsque `closed_startup` n'a pas d'epoch retenue. C'est un fait d'autorité exact, pas un caractère générique (wildcard). Le nettoyage de Reset lie un `previousDataEpoch` nullable exact ; les écritures de reconstruction/terminales de Reset lient un `nextDataEpoch` exact. Dès qu'une epoch est retenue, null ou une epoch étrangère est rejeté à l'intérieur de la FIFO avant l'adaptateur durable.

Chaque capacité est un token d'objet exact à usage unique consommé avant l'invocation de son adaptateur durable enregistré et avant tout `await`. Les appelants fournissent un token feuille exact contenant uniquement des données (data-only leaf token), jamais une fonction asynchrone. Un mappage fermé défini au build-time résout ce token vers l'unique adaptateur pour le type d'écriture ; les modules adaptateurs ne peuvent pas importer ni recevoir l'autorité, les contrôleurs de workflow, les Settings publics ou la messagerie. La FIFO reste retenue jusqu'à ce que la promesse de cet adaptateur soit réglée. Une barrière de Reset/échec située avant un commit le révoque et n'invoque aucun adaptateur ; un commit déjà positionné avant la barrière est autorisé à se stabiliser. Une barrière externe arrivant pendant qu'un adaptateur est en attente obtient le ticket FIFO suivant et attend ; elle n'est pas rejetée en tant que réentrance d'adaptateur. L'achèvement révoque chaque token non consommé avant que le workflow ne change de commande/étape.

Les registres de revendications, de capacités et d'opérations feuilles sont locaux au worker, bornés et n'évictent ni ne réutilisent jamais de preuves de rejeu. L'allocateur de capacité est synchrone, ne reçoit aucune référence d'autorité et ne peut pas renvoyer de promesse. Une sentinelle de profondeur de distribution s'applique uniquement à la pile d'appels de cet allocateur : tout appel d'autorité tenté depuis celle-ci est rejeté **avant la mise en file d'attente (enqueue)** avec `AUTHORITY_REENTRANCY_FORBIDDEN`, verrouille l'échec de l'allocation externe et grille (burns) un UUID valide retourné. Un code d'allocateur hostile ne peut pas intercepter l'erreur interne pour transformer l'émission externe en succès. La sentinelle est effacée avant de revenir à la boucle d'événements, de sorte que les appels FIFO externes non liés restent admissibles en file d'attente. Les exceptions levées, les ID invalides et les collisions demeurent typés ; aucune valeur JavaScript brute ne s'échappe. L'épuisement de registre est typé et n'active pas de repli brut/no-op.

La barrière ne possède donc que deux et seulement deux voies :

```text
open business admission -> ordinary issueLease/commit
startup/reset declared write -> exact pre-admission claim/capability/commit
```

Un bail ordinaire avant admission demeure `ADMISSION_CLOSED`. Une API de capacité manquante, un adaptateur optionnel permissif, une écriture brute directe, un second verrou ou un repli de type « essayer une route puis l'autre » constitue une configuration invalide.

Tout sac de dépendances (dependency bag), portée, preuve d'ouverture, requête de Reset et commande de barrière d'échec inconnus sont capturés une seule fois à partir des descripteurs de données énumérables propres exacts dans un DTO détaché. Le sac de dépendances admet exactement les clés obligatoires `workerEpoch`/`allocateLeaseId` et la couture de test optionnelle `initialAuthorityRevision` ; les accesseurs, symboles et toute autre clé constituent une configuration invalide. Toute inspection susceptible d'invoquer une méthode interne de Proxy, y compris `Array.isArray`, la recherche de prototype, l'énumération de clés et la recherche de descripteur, reste à l'intérieur de cette frontière de capture en repli sécurisé (fail-closed). Un Proxy révoqué devient donc l'erreur de validation d'Autorité typée de la commande — `INVALID_CONFIGURATION` pour le sac de dépendances — et ne fait jamais fuiter de `TypeError` brut ni ne modifie l'état d'autorité. L'autorité ne relit jamais la source brute après la capture. Son `workerEpoch` validé et son allocateur sont de même capturés une fois à la création de la factory sans exécuter de getter de dépendance.

`allocateLeaseId` est une couture synchrone injectée gardée par la sentinelle de profondeur de distribution réservée à l'allocateur. L'émission de bail capture l'epoch et la révision exactes d'admission ouverte avant de l'appeler. Tout appel d'autorité public tenté depuis cette même pile d'allocateur échoue de manière synchrone avec `AUTHORITY_REENTRANCY_FORBIDDEN` **avant la mise en file d'attente** et verrouille l'émission externe en échec même si un code d'allocateur hostile intercepte l'exception interne. Par conséquent, aucun bail interne, ticket de Reset, liaison d'opération ou mutation d'autorité ne peut se produire. Après le retour de l'allocateur, un UUID frais valide est conservé de façon permanente pour garantir l'unicité à l'échelle de la durée de vie du worker, puis le verrou, le statut d'admission, l'epoch et la révision sont revalidés avant tout bail ou liaison. Une collision d'allocateur échoue également en repli sécurisé et aucun ID conservé n'est jamais recyclé, y compris après révocation. Si l'allocateur lève toute autre valeur JavaScript, y compris une valeur non-Error, l'émission externe échoue avec l'erreur typée `INVALID_LEASE_ID` ; aucune valeur brute ne s'échappe et aucun ID de bail externe ni liaison n'est conservé. La sentinelle prend fin avec l'appel synchrone ; le travail FIFO externe non lié demeure admissible en file d'attente.

Les registres ordinaires post-admission sont bornés selon les mêmes limites locales au worker réservées par Background Scheduling :

```text
MAX_RETAINED_ORDINARY_OPERATIONS_PER_WORKER = 4096
MAX_RETAINED_ORDINARY_LEASE_IDS_PER_WORKER = 32768
```

Le registre des opérations conserve chaque liaison d'opération canonique, y compris les liaisons révoquées. Le registre des ID de bail conserve chaque résultat valide et frais de l'allocateur, y compris un ID grillé par une tentative rejetée de réentrance de l'allocateur. Aucun des deux registres n'évince, ne tronque ni ne recycle les preuves. Une opération canonique exacte est recherchée avant l'admission en capacité et peut toujours renvoyer son unique bail existant ; une nouvelle opération à la limite de capacité d'opération n'invoque aucun allocateur et se termine par `OPERATION_CAPACITY_EXHAUSTED`. Une nouvelle allocation à la limite des ID de bail n'invoque aucun allocateur et se termine par `CORRELATION_CAPACITY_EXHAUSTED`. L'un ou l'autre épuisement révoque chaque bail ordinaire, efface les preuves d'ouverture/Reset vivantes et bascule définitivement cette instance d'autorité vers `fenced_failure` ; seule une autorité de worker fraîche peut rouvrir la capacité. L'erreur d'Autorité levée préserve le code de capacité exact tandis que le snapshot fermé transporte le diagnostic borné non réessayable de barrière d'autorité.

Reset acquiert cette même porte en premier, ferme l'admission, incrémente la révision d'autorité et révoque chaque bail avant la mise au repos (quiescence). Un ancien rappel en file d'attente ne peut donc ni valider avec son ancien bail, ni obtenir un nouveau bail pour son ancienne opération. Cela s'applique aux transactions de missions de scan, aux checkpoints de session, au nettoyage terminal, aux écritures de profil/paramètres, à la compensation d'effets d'exécution, aux écritures de cache et au travail en arrière-plan/alarmes.

Une requête de Reset valide lie exactement `resetId`/`previousDataEpoch`/`nextDataEpoch`. Dès qu'elle prend une position FIFO, l'autorité entre dans `reset_pending` : aucun nouveau bail ne peut être émis, tandis que les commits déjà mis en file avant cette position conservent leur éligibilité FIFO par rapport à la révision encore courante. Le token éventuel répète les trois identités exactes plus `workerEpoch` et la nouvelle révision d'autorité. L'installation consomme cet unique token exact à usage unique et ne comporte aucun argument d'epoch libre. Une collision avec `workerEpoch`, l'ID de reset ou une previous epoch non nulle est invalide avant la mise en file d'attente.

Avant qu'un nouveau reset ne journalise ou n'acquière cette porte, son modèle effectue un contrôle préalable (preflight) d'admission en lecture seule. L'autorité centrale fournit une vue atomique de l'absence de journal de reset réservé, de l'unique reçu de reset le plus récent et du `tracking_meta.dataEpoch` canonique. Un nouveau reset n'est admissible que lorsque cette epoch est égale à l'ancienne epoch de la requête et diffère de la nouvelle epoch fournie. Si l'epoch canonique est déjà égale à la nouvelle epoch de la même requête, le preflight ne peut reconnaître un effacement avant réponse (clear-before-response) que lorsque le reçu exact correspond à chaque ID/epoch d'origine, à `requestedAt` et à la phase validée, en plus de l'autorité DB6/data3 actuelle. Il n'effectue aucune seconde destruction ni acquisition vivante de barrière de reset, mais l'achèvement exige toujours la preuve idempotente exacte d'installation d'epoch/ouverture d'admission.

Le propriétaire de `reset_pending` enregistre le statut initial complet du journal : `absent_proven | outcome_unknown | durable_proven`. Seule une durabilité exacte peut acquérir `reset_owned` ; unknown n'autorise que le même résolveur FIFO A, tandis que B reste rejeté. Les métadonnées d'échec durable et de nouvelle tentative utilisent uniquement les capacités exactes de checkpoint d'échec/nouvelle tentative du modèle. Après la suppression stricte du journal, l'opération d'autorité dédiée `installResetEpochAndOpen` est la seule voie vers l'admission normale ; l'échec maintient l'admission fermée et ne réessaie aucun effet destructeur.

Cette vue provient uniquement de l'adaptateur exact enregistré `dataset-reset/preflight-authority-read/v1` tant que la position FIFO externe est détenue. Il inventorie d'abord IndexedDB ; une base de données `missionpulse` absente n'est pas ouverte. Une base de données présente est ouverte sans version cible, inspectée uniquement via des transactions `readonly`, et sa poignée temporaire du registre central est fermée/désenregistrée dans `finally` avant le règlement. `onupgradeneeded` s'interrompt et renvoie `RESET_PREFLIGHT_OPEN_WOULD_UPGRADE`. L'adaptateur n'effectue aucune écriture de structure, de données, de marqueur, de paramètres ou de réparation et n'expose aucun objet IDB. Il s'agit de l'unique ouvreur pré-version contrôlé ; les ouvreurs/migrations ordinaires restent refusés.

Si un nouveau worker trouve un journal strict de Reset, il ne peut pas cloner la réservation du worker mort. `rehydrateResetPreAdmission` relit l'intégralité du journal, du reçu et de l'autorité DB physique compatible avec la phase avec l'adaptateur distinct enregistré de lecture de réhydratation à une position FIFO. Il rejette Reset B, un reçu étranger, une troisième epoch lisible et un état physique dépassant la matrice exacte d'effets en avance. Pour `handoff_adopted` et `handoff_cleared`, il rejette également une epoch de worker courante égale à l'epoch du worker source durable. Il installe ensuite `reset_pending` et renvoie une nouvelle réservation d'objet exact liée au `workerEpoch` et aux révisions courants. Seul `acquireResetFence` avec ce remplacement peut révoquer les baux/installer `reset_owned` ; aucun effet de Reset repris ou `BOOT_FENCE_ACQUIRED` ne le précède. Une réhydratation en doublon exact renvoie ce même objet du worker courant.

Le reçu est la clé système locale à Chrome bornée `missionpulse.localDataResetReceipt.v1`. Reset l'écrit et la relit strictement sous la même porte après l'alignement des Settings/alarmes et l'état prêt mais avant le checkpoint validé du journal. L'effacement du journal prouve donc que le chemin terminal ordonné a passé ce reçu exact, même si des écritures légitimes de même epoch rendent plus tard les stores non vides ou modifient l'état des Settings/alarmes. L'effacement sélectif du reset suivant supprime l'ancien reçu avant d'écrire sa propre valeur la plus récente.

Cela ajoute une clé bornée de stockage Chrome, prise en compte par la réserve de quota système global des Settings. Cela n'ajoute aucun object store IndexedDB, champ `tracking_meta`, `DB_VERSION` ou `APP_DATA_VERSION` ; la DB/meta restent en DB6/data3/schemaVersion 1.

Reset utilise le même chemin d'autorité de pré-admission pour chaque écriture du mappage fermé de `local-data-reset.model.md` : journal/checkpoints, suppression de base de données, effacement de session, suppression locale sélective, réinitialisation de DB6, écriture complète de génération zéro des Settings, marqueur 3, écritures d'alignement des Settings, reçu et suppression finale du journal. Un effet physique de Reset et son checkpoint de journal utilisent toujours des capacités différentes. La réinitialisation utilise spécifiquement quatre capacités ordonnées : transaction DB6, écriture/relecture des Settings V2, écriture/relecture du marqueur 3, puis checkpoint `database_reinitialized`. Chaque capacité possède un token feuille exact de données pures correspondant résolu par la table d'adaptateurs fermée ; le port Reset ne peut pas transmettre une fonction asynchrone arbitraire.

Les paramètres locaux à Chrome répètent l'epoch pour clore les problèmes ABA de révision à travers le reset. L'unique autorité normative est `SettingsEnvelopeV2` exportée par `settings-persistence.contract.ts` ; le code DB/reset doit importer ce contrat et ne doit pas définir ou copier une variante de stockage plus restreinte :

```ts
import type { SettingsEnvelopeV2, SettingsSnapshotV1 } from './settings-persistence.contract';
```

L'enveloppe V2 importée comprend `version`, `dataEpoch`, `revision`, `generation`, `settings`, `journal` et `outcomes`. La révision et la génération sont toutes deux des entiers non négatifs sécurisés : la révision suit les validations de valeurs visibles par l'utilisateur ; la génération avance également pour les modifications portant uniquement sur le journal/registre.

Lors du démarrage sous data-v3, un enregistrement de paramètres V1 valide conserve sa révision tandis qu'un enregistrement legacy non encapsulé valide est enveloppé à la révision 0 ; tous deux reçoivent l'epoch canonique et initialisent `generation: 0, journal: null, outcomes: []`. Les paramètres manquants deviennent des valeurs par défaut validées sous cette même forme complète à la révision/génération 0. Une enveloppe stricte Settings V2 est un no-op de nouvelle tentative uniquement lorsque son epoch est égale aux métadonnées canoniques et que le validateur partagé accepte ses paramètres, son journal, son registre de résultats (outcomes) et ses relations causales ; un enregistrement V2 discordant ou malformé échoue en repli sécurisé (fail-closed). Un CAS de paramètres exige l'égalité de l'epoch, de la révision et de la génération, et la compensation/réconciliation conserve la même epoch. Lors d'un reset, l'effacement sélectif supprime les paramètres et la réinitialisation écrit les valeurs par défaut sous la forme d'un `SettingsEnvelopeV2` complet avec `nextDataEpoch`, révision/génération 0, `journal: null` et `outcomes: []`, puis la récupération détenue par le reset règle le journal partagé et prouve l'alarme avant l'état prêt. La révision seule ne constitue jamais une identité inter-reset.
Seul le chemin de démarrage isolé (fenced) de data-v3 invoque le décodeur partagé avec la migration legacy autorisée. Après le marqueur 3, chaque gestionnaire utilise sa politique V2 uniquement, de sorte qu'une écriture legacy tardive ou sans epoch ne peut pas être normalisée dans le jeu de données frais.

`application-tracking.model.md` transporte déjà l'epoch sur les mutations v2 et rejette les écritures v1 ; son implémentation doit consommer le bail de l'autorité centrale plutôt que d'inventer une génération ou une barrière locale au tracking.
La machine/contrat de paramètres de la tâche 6 consomme déjà `SettingsEnvelopeV2` ; `settings-persistence.model.md` doit nommer cette même autorité avant le début de l'implémentation. Cette révision DB/reset ne modifie pas le modèle distinct.

Le payload exact de diffusion de l'epoch de reset est de même défini uniquement par `local-data-reset-epoch.contract.ts`. Reset et Settings importent son parseur strict. La preuve d'isolation/bootstrap de confiance spécifique aux Settings peut encapsuler ce payload, mais ne doit pas ajouter de champs ni redéfinir le schéma neutre.

## Migration data-v3

Le registre applicatif utilise des versions cibles explicites plutôt qu'une arithmétique d'indices de tableau : ses entrées ciblent data 2 (mots-clés de profil) et data 3 (enveloppes de tracking). Les migrations en attente sont celles avec `targetVersion > storedVersion`, par ordre croissant. Un marqueur absent est traité comme valant 0, de sorte que les deux entrées idempotentes peuvent s'exécuter sur une nouvelle base de données vide. La cible maximale du registre doit être égale à `APP_DATA_VERSION`.

### Entrées injectées

Shell injecte un `now: number` et un `dataEpoch` UUID-v4 uniquement si une ligne de métadonnées valide n'existe pas déjà. Réexécuter data v3 réutilise l'epoch persistée. Core reçoit ces valeurs ; il n'appelle jamais `Date.now()`, `new Date()`, `crypto.randomUUID()` ou IndexedDB.

### Une transaction atomique de tracking

Data v3 exécute une transaction `readwrite` englobant :

```text
mission_tracking + tracking_meta + quarantine
```

Au sein de cette transaction, elle :

1. lit `tracking_meta['tracking_meta']` ;
2. crée le singleton valide avec `collectionRevision: 0` lorsqu'il est absent, ou exige que la ligne existante soit strictement valide ;
3. ouvre un curseur sur `mission_tracking` et classifie chaque ligne ;
4. écrit chaque enveloppe canonique ou ligne de quarantaine via cette même transaction ;
5. ne se termine que lorsque le curseur et toutes les écritures sont achevés.

L'ordre de classification est exact :

| Valeur du curseur                                                                         | Résultat                                                 |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `PersistedTrackingEnvelopeV2` valide, même epoch, la clé est égale à `missionId`          | no-op                                                    |
| valeur en forme d'enveloppe/schéma-v2 qui est invalide, de mauvaise clé ou mauvaise epoch | abandonner (abort) comme corruption critique             |
| `MissionTracking` legacy valide, la clé est égale au `missionId` canonique                | mise à jour vers l'enveloppe d'enregistrement révision 1 |
| tout autre élément qui n'a pas la forme d'une enveloppe                                   | ajouter une ligne de quarantaine, puis `cursor.delete()` |

La conversion legacy écrit :

```ts
{
  schemaVersion: 2,
  dataEpoch,
  missionId: legacy.missionId,
  kind: 'record',
  tracking: canonicalLegacyTracking,
  revision: 1,
  lastMutationId: null,
  lastMutationIntent: null,
  committedAt: lastHistoryTimestamp,
  undoBase: null,
}
```

Le parseur legacy exige un historique non vide, contigu, valide en transition, non décroissant dans le temps et se terminant à `currentStatus`, des champs de note et de relance bornés, et une égalité exacte entre `cursor.primaryKey` et `missionId`. `committedAt` est le dernier horodatage canonique de l'historique. Il n'existe aucune normalisation permissive d'un historique invalide.

### Quarantaine par clé primaire

Une ligne legacy invalide est identifiée à partir de la clé primaire du curseur, jamais à partir d'un `value.missionId` non fiable :

```ts
interface TrackingMigrationQuarantineV1 {
  id: ['data-v3', 'mission_tracking', IDBValidKey];
  originalStore: 'mission_tracking';
  originalPrimaryKey: IDBValidKey;
  sourceDataVersion: 2;
  targetDataVersion: 3;
  reasonCode: 'INVALID_LEGACY_TRACKING';
  raw: unknown;
  quarantinedAt: number;
}
```

L'ID sous forme de tuple préserve la clé primaire typée et évite les collisions dues à la coercition en chaîne. La migration utilise `quarantine.add(row)`, jamais `put`. Seul `add.onsuccess` peut mettre en file d'attente `cursor.delete()` et poursuivre le curseur. Une `ConstraintError` n'est jamais évitée ni normalisée : les collisions de tuples identiques ou différents interrompent toutes deux l'intégralité de la transaction data-v3. Les preuves de quarantaine existantes et chaque ligne source/meta/enveloppe restent donc strictement inchangées au niveau des octets. Les diagnostics de collision maintiennent l'admission fermée par barrière pour une récupération explicite ; la migration ne convertit jamais en chaîne, ne modifie pas la clé et n'écrase pas les preuves. Chaque ligne legacy invalide sans collision est mise en quarantaine, indépendamment de la politique générique de taux de rejet à 10 %.

### Saga exacte des capacités : transaction, Settings, marqueur 3

`MIGRATE_DATA` déclare exactement trois écritures ordonnées sous une portée de commande Startup active :

1. `startup.data.tracking_v3_transaction` : la transaction IndexedDB complète ci-dessus. Sa capacité reste consommée tant que la FIFO d'autorité attend `tx.oncomplete` ; le marqueur 2 demeure durable.
2. `startup.data.settings_v2_wrap` : seulement après l'achèvement de la transaction, écrire le `SettingsEnvelopeV2` partagé complet avec la même epoch de migration et le relire strictement. Le marqueur 2 demeure toujours durable.
3. `startup.data.marker3_write` : seulement après la relecture des Settings, écrire `APP_DATA_VERSION = 3` et relire strictement le marqueur 3.

Il s'agit de trois identifiants d'écriture distincts et de trois capacités distinctes à usage unique. Aucune capacité ne couvre l'intégralité du port `MIGRATE_DATA`, et aucune ne peut être réutilisée pour la frontière suivante. Le port termine sa portée de commande avant d'émettre sa preuve de succès. La commande Startup suivante `WRAP_SETTINGS_ENVELOPE` effectue la relecture stricte supplémentaire du modèle sous `allow_migration` ou `v2_only` ; elle est en lecture seule et ne peut pas répéter l'écriture 2.

Lorsque l'autorité n'a pas d'epoch canonique retenue au moment de la revendication, la revendication et les trois capacités portent le littéral `dataEpoch:null` ; il ne s'agit pas d'un caractère générique. Les validateurs de transaction et de Settings lient toujours leurs payloads durables à la même epoch de migration injectée/persistée. Après l'installation d'un Reset, une epoch en attente retenue exacte est utilisée au lieu de null.

### Preuve de crash et de nouvelle tentative

| Point de crash                              | Résultat durable                                    | Comportement lors d'un retry                                                                                              |
| ------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| avant/pendant la transaction data-v3        | jeu de tracking data-v2 et marqueur 2               | réexécution complète de la transaction                                                                                    |
| abandon de transaction (abort)              | aucun commit partiel metadata/enveloppe/quarantaine | réexécution complète de la transaction                                                                                    |
| après transaction, avant settings/marqueur  | lignes canoniques + métadonnées, marqueur tjrs à 2  | nouveau worker/tentative et capacités fraîches ; lignes relues en no-op, puis finaliser Settings/marqueur avec même epoch |
| après relecture Settings V2, avant marqueur | lignes canoniques + Settings V2 complet, marqueur 2 | nouveau worker/tentative et capacités fraîches ; des relectures strictes précèdent le marqueur 3                          |
| après écriture/relecture du marqueur        | DB6/data3                                           | vérification no-op/récupération au démarrage ; les anciens tokens ne sont jamais réutilisés                               |

Le marqueur `APP_DATA_VERSION = 3` n'est écrit qu'après `tx.oncomplete` et la validation/relecture réussies selon le contrat partagé du `SettingsEnvelopeV2` complet avec la même epoch, jamais depuis le rappel du curseur. La relecture prouve les clés exactes, des paramètres valides, la validité du journal/registre et leur cohérence causale. Un échec d'écriture de paramètres ou de marqueur laisse le marqueur à 2 et constitue un échec de migration réessayable ; sa capacité reste consommée. La nouvelle tentative utilise des identités fraîches de revendication/écriture/capacité et la conversion IDB achevée n'est acceptée que par relecture idempotente stricte.

## Politique de validation et de corruption

La validation est sensible au domaine ; un ratio global ne peut pas effacer une preuve d'idempotence.

| Domaine/enregistrement                         | Action en cas d'invalidité                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| tracking legacy pendant data v3                | mise en quarantaine atomique par clé primaire et suppression                                        |
| enveloppe v2                                   | interrompre/isoler par barrière le tracking ; préserver les octets exacts                           |
| `tracking_meta`                                | interrompre/isoler par barrière le tracking ; préserver les octets exacts                           |
| registre de mutations (mutation ledger)        | interrompre/isoler par barrière le tracking ; préserver les octets exacts                           |
| couture d'outbox désactivée                    | isoler la ligne en quarantaine ; ne pas altérer enveloppe/registre ni simuler de livraison distante |
| lignes legacy `missions` / `profile` non liées | politique existante de parsing borné à la lecture et de quarantaine générique par ratio de rejet    |

La corruption d'enveloppe/meta/registre s'effectue en repli sécurisé (fail-closed) car ces enregistrements constituent l'état actuel, la révision et des preuves d'exécution au plus une fois (at-most-once). Il est interdit de les supprimer, de les mettre en quarantaine, de les synthétiser, de les normaliser ou de les rejouer automatiquement. La barrière de démarrage reste fermée, les diagnostics affichent le store/la clé exacts sans contenu utilisateur brut, et l'interface utilisateur peut proposer la réinitialisation locale coordonnée et explicite. Cette réinitialisation utilise `previousDataEpoch: null` lorsque les métadonnées strictes sont absentes ou illisibles et installe tout de même une barrière globale d'ancien jeu de données avant la destruction.

Le chemin générique `rejects > 10%` s'applique uniquement aux stores non critiques. Il n'autorise jamais `deleteDatabase`. La corruption structurelle/d'ouverture et le rétrogradage (downgrade) échouent également en repli sécurisé ; la récupération destructive relève exclusivement d'un reset confirmé par l'utilisateur.

La vérification post-migration contrôle au minimum :

- tous les stores, keyPaths et keyPaths d'index exacts de DB6 ;
- exactement une ligne `tracking_meta` stricte ;
- chaque enveloppe et registre possède l'epoch des métadonnées et une clé primaire correspondante ;
- `SettingsEnvelopeV2` possède cette même epoch, une révision et une génération non négatives valides, et un journal/registre de résultats valides selon le contrat partagé ;
- aucun registre `prepared` détenu par un ancien worker ne subsiste après la récupération au démarrage ;
- l'outbox désactivée est vide pour les écritures de production de la tâche 5b ;
- le marqueur de version des données vaut exactement 3 et l'autorité d'epoch est initialisée avant l'ouverture de l'admission.

La réinitialisation au moment du reset vérifie strictement DB6/data3, la révision de collection de métadonnées à zéro et exactement zéro ligne dans `connector_status`, `generated_assets`, `mission_tracking`, `missions`, `profile`, `quarantine`, `tracking_mutations` et `tracking_outbox`, suivis des Settings par défaut réglés et de la preuve exacte d'alarme avant que le reçu ne puisse être écrit. La reconnaissance post-effacement ne répète pas ces assertions mutables de zéro/valeurs par défaut : elle valide le reçu terminal exact plus l'autorité actuelle des métadonnées DB6/data3 à la même epoch suivante, autorisant une révision de collection non négative ultérieure et des écritures légitimes E2. Un reçu manquant/discordant, une dérive de schéma/version ou une mauvaise epoch constitue un conflit de protocole, jamais une permission de journaliser un autre reset destructeur.

## Barrière de démarrage (Startup barrier)

Tous les gestionnaires mutatifs du bridge et tous les rédacteurs internes attendent une barrière unique. Cela inclut les acteurs/le stockage de tracking, l'orchestration/checkpoints de scan, les paramètres, le profil, les caches et le travail en arrière-plan/alarmes. Le code du side panel atteint la barrière via le bridge du service worker ; il n'ouvre jamais IndexedDB directement.

```text
checking reset journal
  -> if absent, service a pending reset request's read-only preflight
       -> use the sole FIFO-held readonly preflight opener; close before result
       -> recognize exact post-clear completion, or
       -> admit only exact fresh request to reset journaling, or
       -> continue normal startup when no reset request is pending
  -> probing versions
  -> structural upgrade DB6 (if needed)
  -> data migration v3 (if needed)
  -> critical verification + dataEpoch load
  -> complete SettingsEnvelopeV2 wrap/read-back
  -> settle older-worker prepared ledgers atomically
  -> recover Settings journal + align/prove auto-scan alarm
  -> atomically open epoch authority
  -> publish correlated bootstrap
  -> ready
  -> on a fresh late caller, publish only its newly correlated bootstrap
```

Chaque commande Startup porteuse d'écritures commence par la revendication bornée exacte décrite par `dataset-write-capability.model.md`, consomme une capacité par écriture, fournit un token feuille exact contenant uniquement des données (data-only leaf token) par écriture, puis achève/révoque la portée avant de publier son événement de résultat. Les étapes en lecture seule ne créent aucune revendication fictive. `OPEN_EPOCH_ADMISSION` exige en outre l'absence de portée de pré-admission active ou de capacité/opération feuille en cours. Après son ouverture, tous les rédacteurs métier basculent exclusivement vers les baux ordinaires ; il n'y a aucune fenêtre de chevauchement/repli entre les deux voies.

La détection d'un journal de Reset préempte toute autre étape et transfère la propriété au workflow de reset. Aucun ouvreur, acteur, scan, mutation de paramètres/profil ou rédacteur de cache ne peut s'intercaler entre le succès de migration et le règlement des registres préparés, la vérification/récupération des paramètres et la publication de l'autorité d'epoch.

Sur un nouveau worker, ce transfert réhydrate d'abord une réservation de Reset d'objet exact de remplacement à partir du journal strict sous la FIFO, puis réacquiert la barrière vivante. Le journal constitue l'identité durable, et non le token lui-même. Reset B et tout token cloné/d'ancien worker demeurent invalides, et aucune phase ne reprend avant la preuve de barrière du worker actuel.

L'absence de journal ne constitue pas un achèvement en soi. Lors du rejeu d'une requête de reset initiale après effacement, la barrière expose une preuve en lecture seule à l'acteur de reset et n'entame pas de migration/admission ordinaire concurrente. Une epoch suivante exacte, un reçu concordant le plus récent et l'autorité DB6/data3 renvoient une autorité post-effacement reconnue ; Reset doit toujours obtenir la preuve idempotente exacte de `installResetEpochAndOpen` avant l'achèvement/succès ; une preuve d'epoch précédente exacte renvoie une admission fraîche ; toute troisième epoch, reçu discordant ou preuve malformée échoue en repli sécurisé (fail-closed). Un échec physique de lecture est explicitement réessayable, sans boucle automatique et sans journal écrit.

`wrappingSettingsEnvelope` choisit la politique du décodeur legacy d'après le marqueur stocké : les versions pré-v3 utilisent `allow_migration` ; le marqueur 3 utilise `v2_only`. Pour une migration, l'enveloppe partagée complète est relue avant que le marqueur 3 ne soit écrit. Ainsi, un crash après l'écriture du marqueur redémarre à partir de la forme stricte V2 et exécute toujours la récupération des Settings. Le marqueur 3 prouve uniquement la conformité de forme ; il ne prouve jamais l'alignement d'effets d'exécution ou l'admission.

### Étape normative de récupération des Settings

`recoveringSettings` invoque la barrière partagée de récupération des Settings en mode démarrage. Elle requiert l'absence de journal de reset ; chaque phase de reset valide, y compris `committed`, transfère la propriété à `resetOwned` avant tout effet de migration/Load. Elle décode ensuite strictement selon la politique sélectionnée par le marqueur, récupère tout journal de Settings, installe un journal système `effects_pending` si `auto-scan` diffère, applique et lit l'effet, efface ce journal, et relit l'enveloppe réglée ainsi que l'alarme sous la même barrière `(attemptId, workerEpoch, dataEpoch)`.

L'unique événement de succès comporte des clés exactes et est entièrement corrélé :

```ts
interface StartupSettingsRecoveredV1 {
  type: 'SETTINGS_RECOVERY_PASSED';
  attemptId: string;
  workerEpoch: string;
  dataEpoch: string;
  requestId: string;
  commandId: string;
  snapshot: SettingsSnapshotV1;
}
```

Toutes les cinq identités doivent être égales à la tentative/commande active, et le validateur de snapshot partagé doit prouver `resetJournalAbsent:true`, une enveloppe réglée avec les mêmes epoch/génération et une preuve d'alarme exacte. Un événement auto-corrélé ou obsolète est ignoré. `openingAdmission` ouvre atomiquement l'autorité d'epoch uniquement après que la vérification DB, la récupération des registres préparés et cette preuve ont toutes été retenues dans le contexte de tentative. Aucun bail, bootstrap ou `ready` n'existe au préalable.

Les échecs de démarrage transportent un `attemptId` strict et une étape (stage). L'union d'étapes comprend `settings_recovery` et `failure_fence` ; les échecs physiques de Settings/alarme sont réessayables mais laissent l'admission fermée, tandis qu'une preuve malformée à ID correspondant échoue en repli sécurisé (fail-closed) et de façon non destructive. `SETTINGS_RESET_IN_PROGRESS` n'est pas un échec de migration ordinaire : il est acheminé vers `resetOwned`. Un appelant explicite ultérieur ou un `RETRY` crée la tentative sérialisée suivante ; aucune boucle de nouvelle tentative automatique n'est autorisée.

Dès lors que `ADMISSION_OPENED` a été retenu, tout échec de publication émet d'abord la commande pure corrélée `FENCE_STARTUP_FAILURE`. Son futur port Shell appelle `DatasetEpochAuthority.fenceFailure` sous la porte centrale. `failed` et `RETRY` demeurent inatteignables tant que `FAILURE_FENCED` ne prouve pas strictement les mêmes tentative/worker/epoch/preuve d'ouverture, une révision d'autorité supérieure, une admission fermée, tous les baux révoqués et zéro bail actif. Un échec physique ou ambigu de barrière de protection reste dans `failureFenceBlocked`, ne possède pas de transition de retry et ne peut transférer qu'un propriétaire de Reset strictement corrélé.

L'autorité consomme la commande exacte `FENCE_STARTUP_FAILURE`, y compris son `failure` typé et borné, et renvoie la preuve exactement et profondément gelée `DatasetStartupFailureFenceProofV1` ; une chaîne en texte libre ne constitue jamais une cause d'autorité. Elle conserve la corrélation d'ouverture de façon privée jusqu'à ce que Reset ou la barrière d'échec la ferme. `fenceFailure` est interdit dans `reset_pending` et `reset_owned` et ne peut pas effacer ou remplacer un token de Reset ; la préemption de Reset détient ce chemin de barrière.

La barrière est sérialisée par tentative et réessayable à travers les tentatives :

1. les appelants concurrents rejoignent exactement une tentative en cours ;
2. `MigrationResult { ok: false, ... }` est un échec, et non une valeur résolue et prête ;
3. tout échec règle tous les appelants en attente avec un échec typé de chargement/persistance et maintient l'admission fermée par barrière ; si l'admission était déjà ouverte, le règlement attend la preuve exacte de fermeture/révocation ;
4. la référence en cours est effacée dans `finally` ;
5. la commande explicite suivante de bootstrap, chargement ou mutation (y compris scan, paramètres et profil) démarre une tentative fraîche ;
6. seul `openingAdmission` après le `SETTINGS_RECOVERY_PASSED` exact ouvre l'admission des baux ; le bootstrap corrélé et `ready(dataEpoch, workerEpoch)` sont publiés par la suite ;
7. une requête de reset annule/préempte la planification de nouvelles tentatives et détient la barrière jusqu'à ce que son journal durable soit supprimé.
8. `ready` demeure un état de service modélisé actif : un ID de requête en doublon est idempotent, tandis qu'une nouvelle requête tardive ne renvoie qu'à travers une nouvelle publication exacte de bootstrap contenant cet ID de requête ; aucune étape de migration, de récupération ou d'admission n'est rejouée.
9. chaque lot en attente/publication est plafonné à 64. Le débordement est un résultat de contre-pression (backpressure) typé et non mutatif. Une publication réussie purge les ID en attente et conserve uniquement le dernier lot borné ; un doublon plus ancien est republié de manière déterministe au lieu d'exiger un historique non borné.

Une promesse en échec n'est jamais mise en cache comme état permanent de démarrage. Les boucles automatiques de retry sont interdites : une nouvelle tentative est déclenchée par un appelant explicite ou la reprise d'un reset et demeure sérialisée.

## Modèle d'états

```text
idle
  -> resetGate
  -> probing -> upgradingStructure? -> migratingData?
  -> verifyingCriticalAndEpoch
  -> wrappingSettingsEnvelope
  -> recoveringPreparedTracking
  -> recoveringSettings
  -> openingAdmission
  -> publishingBootstrap
  -> ready -- fresh START --> publishingBootstrap --> ready

probing -> downgradeBlocked
active before admission -> failed
active after admission -> fencingFailure -> failed (only after fence proof)
fencingFailure -> failureFenceBlocked (ambiguous close; no retry)
failed -- explicit RETRY --> resetGate
active/ready/failed/failureFenceBlocked -- RESET_PREEMPTED --> resetOwned
```

### Statechart exécutable de démarrage

La Model-gate exécutable pour ce workflow est répartie entre :

- `dataset-startup.model.md` pour le comportement revu, la sémantique de crash et les invariants ;
- `dataset-startup.contract.ts` pour les événements stricts, la réutilisation partagée de preuves et les commandes pures ;
- `dataset-startup.logic.ts` pour les guards/actions ;
- `dataset-startup.machine.ts` pour la machine/acteur privé XState v5 et la façade sécurisée `dispatch(unknown)`.

Ce statechart n'est pas une bascule (cutover) au runtime. Il importe les contrats canoniques de Reset et de Settings, n'effectue aucune I/O, n'expose aucun `send` d'acteur et n'a aucune nouvelle tentative automatique. `startup-barrier.ts` sera l'adaptateur Shell qui exécutera ses commandes une fois les barrières Model et Review franchies. Son API de lecture projette un DTO profondément copié/gelé ; le snapshot, le contexte, la machine et les nœuds natifs de XState ne traversent jamais la façade.

`ready` est non terminal et dessert les appelants tardifs par le seul état de publication. `downgradeBlocked` et `resetOwned` sont terminaux pour une tentative donnée. `failed` est non terminal au niveau du sous-système car un appelant explicite ultérieur peut créer une nouvelle tentative après toute preuve de barrière requise. `failureFenceBlocked` interdit le retry et demeure en repli sécurisé (fail-closed).

L'union exacte des événements est exportée par `dataset-startup.contract.ts`. Elle inclut les résultats d'effacement/attente/journal de Reset-gate, les preuves de migration, la récupération corrélée des Settings, l'admission, la publication de bootstrap, `STEP_FAILED`, `FAILURE_FENCED` explicite, `RETRY` et `RESET_PREEMPTED`. Chaque événement asynchrone transporte l'identité de tentative, de worker et de commande ; la récupération des Settings transporte également l'identité d'epoch/requête. Les événements obsolètes, étrangers ou invalides en forme sont rejetés par la façade privée de l'acteur. Les tableaux inconnus sont capturés uniquement via les descripteurs propres exacts, y compris `length` ; les getters sources et les pièges `get` ne sont jamais lus.

L'annulation est détenue uniquement par un reset coordonné. Une migration normale ne peut pas être annulée à mi-chemin et signalée comme prête ; l'interruption (abort) ou l'achèvement de la transaction IndexedDB décide de son résultat durable.

## Invariants

1. `DB_VERSION === STRUCTURAL_MIGRATIONS.length === 6`.
2. Les cibles de migration de données sont exactement `[2, 3]`, et leur cible la plus élevée est égale à `APP_DATA_VERSION === 3` ; la longueur du registre n'est pas utilisée comme numéro de version.
3. La fonction structurelle v6 reçoit `(db, tx)` et utilise cette transaction exacte de mise à niveau pour le remplacement d'index des stores existants.
4. Une exception structurelle levée ne laisse aucun schéma partiel de DB6.
5. La conversion du tracking de data-v3, la création des métadonnées et la quarantaine legacy constituent une transaction atomique unique.
6. L'identité de quarantaine provient de `cursor.primaryKey`, jamais d'un payload corrompu ; l'insertion utilise `add`, et toute collision de tuple interrompt la transaction plutôt que d'écraser les preuves.
7. Le tracking legacy invalide est mis en quarantaine ; une enveloppe/meta/registre v2 invalide est conservée et isole l'admission par barrière.
8. Le marqueur de données n'avance qu'après l'achèvement de sa transaction de migration.
9. Une nouvelle tentative DB6/data2 réutilise l'epoch des métadonnées et n'effectue aucune seconde conversion sémantique.
10. Un ouvreur central détient actuellement chaque poignée d'IndexedDB et la ferme lors d'un `versionchange` et d'un reset. Chaque poignée délivrée appartient à exactement un propriétaire réservé : les appelants de démarrage et métier ne reçoivent jamais le même objet `IDBDatabase`, et deux appelants métier indépendants ne partagent jamais une poignée délivrée. La libération d'un propriétaire ne peut donc pas fermer une connexion encore utilisée par un autre workflow. La future barrière de démarrage (Startup Barrier) de la tâche 5b dédupliquera les tentatives complètes de démarrage au-dessus de l'ouvreur ; elle est dormante. `runMigrations()` ne déduplique actuellement que les appelants de migration et n'est pas une barrière d'admission métier.
11. L'état prêt au démarrage de la tâche 5b signifie que la migration, la validation, le chargement de l'epoch, le règlement des anciens éléments préparés, la récupération du journal des Settings et la preuve exacte d'alarme ont tous réussi.
12. `{ ok: false }`, une ouverture bloquée et un rétrogradage ne peuvent jamais devenir un état prêt.
13. L'échec n'empoisonne pas une future nouvelle tentative explicite. Il ne peut pas ouvrir l'admission ; après l'ouverture de l'admission, un retry exige une preuve stricte de fermeture et de révocation des baux, tandis qu'un résultat de barrière ambigu demeure bloqué.
14. Aucun LLM ne participe aux choix de schéma, de validation, de quarantaine ou de récupération.
15. `dataEpoch` délimite l'ensemble du jeu de données local ; chaque message mutatif et rédacteur interne le prouve via un bail révocable.
16. La porte d'engagement revalide un bail immédiatement avant le commit et reste retenue jusqu'à ce que la frontière durable soit stabilisée.
17. La persistance des paramètres utilise l'unique `SettingsEnvelopeV2` partagée, y compris sa génération, son journal atomique et son registre de résultats ; la révision seule n'autorise jamais une écriture inter-reset.
18. Reset révoque tous les baux avant la mise au repos, de sorte qu'un ancien rappel de scan/checkpoint/cache/profil/paramètres n'effectue aucune écriture post-reset.
19. Le marqueur 3 prouve uniquement la forme persistée ; aucun bail/bootstrap/prêt n'est exposé avant `SETTINGS_RECOVERY_PASSED` et `openingAdmission`.
20. Chaque phase de journal de reset, y compris `committed`, s'achemine vers la propriété du reset ; le démarrage ne l'efface jamais ni ne la traite comme un échec de migration ordinaire.
21. Une requête de reset sans journal fait l'objet d'un contrôle préalable (preflight) avant la migration/admission et avant la journalisation du reset ; seule une preuve d'epoch précédente canonique autorise un nouveau reset.
22. La reconnaissance d'effacement avant réponse exige la prochaine epoch canonique plus le reçu exact le plus récent et l'autorité de métadonnées actuelle DB6/data3, et n'exécute aucun second effet destructeur même après des écritures légitimes E2.
23. L'absence de journal, les UUID de requête courants, les horodatages ou l'état courant mutable des stores/paramètres seuls ne prouvent jamais un achèvement antérieur ; le reçu strict de la requête d'origine est obligatoire.
24. Le reçu est écrit/relu après les Settings/alarmes/état prêt et avant le checkpoint validé du journal ; le checkpoint et la diffusion validée précèdent l'effacement du journal.
25. `ready` dessert chaque nouvel ID de requête tardive par la seule publication modélisée de bootstrap ; les ID en doublon sont idempotents et aucune étape antérieure de démarrage n'est rejouée.
26. L'analyse stricte de tableaux inconnus lit le descripteur de données propre `length` et rejette les valeurs supérieures au maximum explicite avant l'allocation, `ownKeys` ou une boucle, puis lit les descripteurs d'index denses sans invoquer de getter source ni de piège `get`.
27. La reconnaissance d'achèvement ajoute une clé système locale à Chrome bornée mais aucun schéma de DB/meta et ne peut pas modifier `DB_VERSION === 6` ou `APP_DATA_VERSION === 3`.
28. Les ID en attente au démarrage et les bootstraps conservés sont chacun bornés à 64 ; chaque publication réussie purge les ID en attente et remplace, plutôt que d'ajouter à, le dernier lot publié.
29. L'allocation de bail rejette toute réentrance d'autorité de manière synchrone avant la mise en file d'attente, verrouille l'émission externe et ne crée aucun ticket de Reset, bail interne ou liaison d'opération ; un UUID valide retourné demeure grillé (burned).
30. La réentrance d'allocation pour une même opération ne peut pas créer de bail canonique interne, et l'interception de son erreur interne ne peut pas transformer l'émission externe en succès.
31. Les frontières de factory et d'allocateur s'exécutent en repli sécurisé (fail-closed) : les sacs de dépendances révoqués/à accesseurs produisent `INVALID_CONFIGURATION`, et chaque valeur levée par `allocateLeaseId` produit `INVALID_LEASE_ID` ; aucune des deux frontières ne laisse fuiter d'exception JavaScript brute ni ne crée de liaison externe.
32. Les baux ordinaires demeurent impossibles avant `OPEN_EPOCH_ADMISSION` ; chaque écriture modélisée de Démarrage/Reset transporte à la place sa revendication exacte de commande et sa capacité à usage unique ainsi que son token feuille enregistré correspondant.
33. Les commits ordinaires, les revendications/émissions/commits/achèvements de pré-admission, Reset et la barrière d'échec sont linéarisés sur une file FIFO unique de `DatasetEpochAuthority`.
34. La consommation de capacité précède l'invocation de l'adaptateur durable et le await ; une capacité ou un token feuille consommé/révoqué n'est jamais rejouable.
35. La commande, l'étape, la tentative, le worker, l'epoch nullable, la révision d'autorité et la révision de barrière sont revalidés à l'intérieur de la FIFO avant chaque écriture de pré-admission.
36. La transaction IDB data-v3, l'encapsulation/relecture complète de Settings V2 et l'écriture/relecture du marqueur 3 utilisent trois capacités ordonnées et distinctes.
37. La transaction DB6 de Reset, l'écriture/relecture de génération zéro de Settings V2, l'écriture/relecture du marqueur 3 et le checkpoint de réinitialisation utilisent quatre capacités ordonnées et distinctes.
38. La barrière de Reset/échec l'emporte sur chaque capacité mise en file ultérieurement ; un adaptateur durable entré plus tôt se stabilise en premier et la FIFO n'invente jamais d'annulation. Une barrière externe arrivant pendant sa Promise attend au ticket suivant et n'est pas rejetée comme réentrante.
39. Les registres de revendications/capacités/feuilles sont bornés sans éviction. La réentrance de l'allocateur de capacité est rejetée avant la mise en file d'attente et verrouille l'échec externe ; une exception levée, une collision ou un épuisement n'active jamais de repli brut/no-op.
40. Le redémarrage du worker modifie le worker/la tentative et reconstruit des ID frais de revendication/écriture/feuille. Un Reset journalisé reçoit de plus une nouvelle réservation d'objet exact du worker courant par réhydratation stricte de la FIFO avant l'acquisition de la barrière vivante ; seule la relecture durable, jamais un ancien token en mémoire, prouve la progression.
41. L'ouvreur de preflight d'autorité de Reset est en lecture seule et retenu par la FIFO : il n'ouvre jamais une DB absente, ne fournit jamais de version cible, s'interrompt lors de `onupgradeneeded`, n'effectue aucune mise à niveau/migration/écriture et prouve la fermeture de poignée avant le règlement.
42. La table d'adaptateurs feuilles est fermée au moment du build. Les modules d'adaptateurs ne reçoivent aucun chemin d'autorité/contrôleur/Settings publics/messagerie, et les écritures de Settings préservent l'unique ordre de verrouillage : externe DatasetEpoch -> interne Settings/système.

## Liste de contrôle de revue avant implémentation

- nominal : une nouvelle DB et DB5/data2 atteignent toutes deux DB6/data3 avec une epoch fraîche ;
- no-op : DB6/data3 ne modifie aucune ligne persistée ;
- legacy malformé : chaque clé primaire est mise en quarantaine de façon atomique ;
- tuple de quarantaine absent réussit ; les collisions identiques/différentes et `ConstraintError` s'interrompent avec source/meta/enveloppes/quarantaine inchangées ;
- corruption critique : les octets exacts d'enveloppe/meta/registre demeurent et l'admission est fermée par barrière ;
- crash : chaque point du tableau de crash converge sans seconde révision ;
- bloqué/versionchange : les poignées se ferment, le timeout remonte l'échec, la nouvelle tentative est fraîche ;
- reset : chaque phase de journal, y compris `committed`, préempte la migration et aucune ancienne/nouvelle epoch n'est admise jusqu'à la finalisation du reset ;
- rejeu de reset après effacement du journal : même nouvelle epoch d'origine plus reçu terminal exact et autorité DB6/data3 renvoie une autorité post-effacement reconnue, puis une preuve idempotente exacte d'ouverture d'admission renvoie un succès sans journal, suppression, effacement, réinitialisation ou diffusion, y compris après des écritures de données/Settings/alarmes de même epoch ; l'échec d'ouverture reste fermé/récupérable, et une epoch étrangère ou un reçu discordant échoue en repli sécurisé ;
- ordonnancement des reçus : le quota système borné couvre l'écriture/relecture de la valeur la plus récente uniquement ; l'échec est réessayable, le conflit s'effectue en repli sécurisé, un crash avant le checkpoint répète le reçu de manière idempotente, et l'effacement du journal ne précède jamais le reçu exact ;
- admission fraîche de reset : l'epoch canonique doit être égale à la précédente et différer de la suivante ; l'échec physique de preflight est à nouvelle tentative explicite uniquement et n'écrit aucun journal ;
- preflight de Reset sur DB absente n'effectue aucune ouverture ; une DB présente s'ouvre sans version cible, utilise des transactions en lecture seule, s'interrompt lors de `onupgradeneeded`, prouve la fermeture/le désenregistrement de la poignée sur chaque résultat et n'effectue aucune écriture de schéma/données/marqueur ;
- crash avec Reset A journalisé à chaque phase : un nouveau worker réhydrate une réservation fraîche A d'objet exact, un doublon exact la rejoint, les faits B/clone/worker mort/troisième epoch/reçu étranger/incompatibles avec la phase échouent sans changement d'état, et aucune phase ne reprend avant l'acquisition de la barrière vivante ;
- échec de permission/quota/marqueur : aucun faux résultat `ready` ;
- appelants concurrents : une tentative, une passe de récupération préparée et une passe de récupération de Settings, même résultat d'epoch ;
- outbox : le schéma existe mais les écritures de production restent strictement nulles ;
- ancien tracking v1/v2, sauvegarde de paramètres révision 0, scan terminal/checkpoint, écriture de profil et rappel de cache effectuent tous zéro écriture après un changement d'epoch ;
- un rédacteur dont le bail est révoqué entre le calcul et le commit échoue à la revalidation finale dans la porte sans ouvrir sa transaction durable ;
- un allocateur qui appelle Reset de manière synchrone pendant `issueLease` reçoit `AUTHORITY_REENTRANCY_FORBIDDEN` avant la mise en file d'attente ; la violation est verrouillée sur l'émission externe, aucun ticket/réservation de reset ou liaison d'opération n'est créé, l'admission reste inchangée et un UUID valide retourné est grillé pour la durée de vie du worker ;
- un allocateur qui émet de manière synchrone la même opération ou une autre reçoit le même résultat de rejet avant mise en file ; aucun bail canonique interne ne peut exister et l'émission externe échoue même si l'allocateur intercepte l'exception interne ;
- un allocateur qui lève `Error`, `undefined` ou un autre primitif produit l'erreur typée `INVALID_LEASE_ID`, tandis qu'un sac de dépendances révoqué/à accesseurs produit `INVALID_CONFIGURATION` sans exécuter de getter ; aucune exception brute ne s'échappe ;
- le bail ordinaire de pré-admission échoue avant l'allocation ; une revendication exacte prise en charge de Démarrage/Reset et sa capacité suivante exacte/token feuille enregistré réussissent uniquement sur la FIFO partagée ;
- substituer indépendamment la revendication, la commande, l'étape, la tentative, le worker, l'epoch nullable, la révision d'autorité/barrière, l'écriture, la capacité, l'opération feuille ou l'ID d'adaptateur ; chaque cas rejette avant l'invocation de l'adaptateur ;
- les commandes multi-écritures allouent des tokens de capacité et de feuille distincts ; une double consommation, une réutilisation inter-écritures/inter-commandes, un achèvement avant commit et un rejeu d'ancien worker effectuent zéro écriture ;
- tester la réentrance de l'allocateur de capacité dans la même écriture, un autre numéro d'ordre, l'achèvement, Reset et la barrière d'échec : chaque appel d'autorité interne rejette avant la mise en file d'attente, verrouille l'échec externe et grille un UUID valide retourné ; couvrir également exception levée/UUID invalide/collision et épuisement exact du registre sans éviction ;
- tester commit/Reset et commit/barrière d'échec dans les deux ordres FIFO et vérifier que seule la position antérieure peut entrer dans son adaptateur durable ; mettre en file d'attente un Reset externe pendant une Promise d'adaptateur en attente et prouver qu'il attend au ticket suivant sans rejet de réentrance ni interblocage (deadlock) ;
- crash/redémarrage après la transaction data-v3, la relecture de Settings V2 et la relecture du marqueur 3 utilise des identifiants frais de revendication/écriture/capacité/feuille et n'ouvre jamais l'admission prématurément ;
- les contrôles d'architecture rejettent l'injection d'adaptateurs au runtime et prouvent que chaque module feuille sur liste autorisée ne possède aucun import d'autorité/contrôleur/Settings publics/messagerie ; les feuilles de Settings acquièrent DatasetEpoch avant la porte système interne ;
- les Proxies révoqués aux frontières de portée, preuve d'ouverture, bail, requête de Reset, commande d'échec et échec imbriqué produisent leurs erreurs de validation d'Autorité typées exactes, jamais d'exception brute ni de changement d'état ;
- l'entrée Settings V1/brute/manquante devient l'enveloppe partagée exacte avec `generation:0`, `journal:null` et `outcomes:[]` ; une génération/journal/outcomes malformés ou une mauvaise epoch échouent en repli sécurisé, et les écritures v1 sans epoch échouent en repli sécurisé après la bascule ;
- aucun `ADMISSION_OPENED`, bail, bootstrap ou `ready` n'est accepté avant un snapshot de Settings exact de même tentative/worker/epoch/requête/commande et la preuve d'alarme ;
- un échec physique de `settings_recovery` est typé/réessayable mais jamais automatique ; une preuve malformée à ID correspondant échoue en repli sécurisé, tandis que `SETTINGS_RESET_IN_PROGRESS` transfère à `resetOwned`.

### Trace inter-modèles R6 — migration de démarrage sans panneau

Pour une nouvelle installation, DB5/data2, crash DB6/data2 et DB6/data3, supprimer ou corrompre l'alarme d'auto-scan et démarrer deux appelants concurrents. Ils doivent rejoindre une tentative unique. Vérifier l'absence de bail/admission/bootstrap avant `SETTINGS_RECOVERY_PASSED` ; crasher et réessayer explicitement à chaque phase du journal système des Settings ; exiger une enveloppe partagée réglée ainsi qu'une preuve exacte d'alarme avant `openingAdmission` et `ready`. Un journal de reset à chaque phase, particulièrement `committed`, doit s'acheminer vers `resetOwned` sans démarrer de migration concurrente ni renvoyer d'échec ordinaire : sur un nouveau worker, réhydrater strictement la réservation de Reset A du worker courant, rejeter Reset B et acquérir sa barrière vivante en premier. Après un crash entre l'effacement du journal et la réponse, rejouer la requête de reset d'origine et prouver l'autorité post-effacement reconnue à partir de la prochaine epoch canonique plus le reçu exact le plus récent et la preuve DB6/data3, puis l'ouverture idempotente exacte d'admission, après avoir injecté des écritures légitimes E2 ; vérifier zéro seconde migration, suppression ou écriture de schéma et zéro succès avant la preuve d'admission.

## Hors périmètre

- livraison au dashboard distant, accusé de réception, baux et politique de conflits ;
- interface de récupération sélective pour la corruption critique du tracking ;
- sauvegarde/restauration entre appareils ;
- modifications de la machine à états de tracking des candidatures au-delà de la consommation de la barrière et du contrat d'epoch.
- méthodes/contrats exécutables de capacité de pré-admission et câblage Shell tant que `dataset-write-capability.model.md` n'a pas reçu d'approbation indépendante.
