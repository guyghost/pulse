# Modèle de réinitialisation des données locales (Local Data Reset Model)

Source de vérité pour le flux destructif de réinitialisation des données locales. Le Reset coordonne le scan, la migration, le suivi des candidatures (application tracking), les handles IndexedDB, `chrome.storage.session` et `chrome.storage.local`. Il ne s'agit pas d'un simple helper de commodité `Promise.all(clear, deleteDatabase)`.

Le statechart pur exécutable est `local-data-reset.machine.ts`. Les types stricts du reset, les parseurs de preuves, la matrice d'erreurs, la classification des redémarrages et la corrélation de disponibilité (readiness) résident dans le fichier testable séparément `local-data-reset.contract.ts`. Le schéma réseau exact de diffusion d'époque et le parseur d'UUID-v4 ont une unique source de vérité neutre, `local-data-reset-epoch.contract.ts`, importée à la fois par Reset et Settings. Le Shell observe l'état de la machine et exécute les effets ; aucun de ces fichiers purs n'appelle Chrome, IndexedDB, des minuteurs, des horloges, la génération d'UUID ou un LLM.

Chaque écriture durable sur le Dataset détenue par le Reset se compose avec `dataset-write-capability.model.md`. Le Reset ne reçoit pas un bail (lease) métier ordinaire et ne détient pas de second verrou ; ses revendications (claims), écritures one-shot, acquisitions de barrière (fence) et installations d'époque sont toutes linéarisées sur l'unique FIFO de `DatasetEpochAuthority`.

## Objectif

Une réinitialisation réussie laisse exactement un jeu de données (dataset) local vierge et cohérent en interne :

- aucun état de scan/session antérieur au reset ;
- aucun paramètre, cache ou diagnostic de migration en stockage local antérieur au reset ;
- une base de données DB6/data3 nouvellement créée ;
- une seule ligne `tracking_meta` stricte avec un nouvel `dataEpoch` et `collectionRevision: 0` ;
- une unique enveloppe de contrat partagé `SettingsEnvelopeV2` stabilisée avec la même époque, révision 0, génération exacte, `journal: null` et `outcomes: []`, plus la preuve d'alarme d'auto-scan correspondante ;
- un unique reçu terminal (le plus récent uniquement) pour la requête de reset exacte, conservé après l'effacement du journal ;
- aucun résidu de `missionpulse.backgroundSchedulingHandoff.v1` après son adoption exacte, sa relecture de nettoyage (cleanup read-back) et le point de contrôle (checkpoint) du journal de reset ;
- aucune enveloppe de tracking, aucun registre de mutations ni ligne d'outbox ;
- chaque acteur, requête, réponse et diffusion antérieur au reset se trouve définitivement dans l'incapacité de muter le nouveau dataset.

Le succès du reset est un fait durable, pas un optimisme d'UI. Sur le chemin d'exécution, `reset:true` est interdit tant que le journal n'a pas été supprimé **et** que l'admission de l'époque suivante exacte n'a pas été installée/ouverte après le succès de chaque prérequis. Un rejeu après effacement ne peut renvoyer le succès qu'après une reconnaissance stricte post-effacement et la même preuve d'ouverture d'admission idempotente ci-dessous.

## Identités et entrées injectées

Le Shell injecte toutes les valeurs imprévisibles avant `RESET_REQUESTED` :

```ts
interface LocalDataResetRequestV1 {
  resetId: string; // UUID v4
  previousDataEpoch: string | null; // null when metadata is absent/corrupt
  nextDataEpoch: string; // fresh UUID v4, different from previous
  settingsRecoveryRequestId: string; // stable reset-owned recovery ID
  settingsBootstrapRequestId: string; // stable post-commit Load ID
  requestedAt: number; // non-negative safe-integer epoch milliseconds
}
```

La machine rejette les UUID non-null malformés, les époques égales, les identités réutilisées et les horodatages invalides. Les deux identifiants de Settings sont alloués une seule fois, persistés avant tout effet mutant et conservés inchangés à chaque réessai/redémarrage. L'identifiant de commande détenu par le reset est de façon déterministe `settings/reset-recover/<settingsRecoveryRequestId>` ; il n'est jamais régénéré à partir de l'état du panneau, de texte libre ou d'une horloge.
`previousDataEpoch: null` est requis lorsque le démarrage fail-closed ne parvient pas à lire une époque de métadonnées stricte ; cela autorise le reset, pas l'admission normale au tracking. Dans ce cas, la barrière (fence) invalide globalement chaque acteur/requête antérieur au reset plutôt que de correspondre à une époque lisible. Le réessai après un reset partiel conserve le même `resetId` et `nextDataEpoch` ; il ne crée jamais une deuxième identité de dataset. Une intention de reset entièrement nouvelle crée de nouveaux identifiants.

Le Shell de confiance injecte en outre un `attemptId` d'exécution réservé aux capabilités et utilise le `workerEpoch` capturé de l'autorité. Ce ne sont pas de nouveaux champs du journal. Chaque réessai explicite et chaque redémarrage de worker reçoit un identifiant de tentative vierge ; chaque identité durable de reset ci-dessus reste inchangée. L'identifiant exact de commande de capabilité est `local-data-reset/<active-state>/<resetId>/<attemptId>`.

La requête de barrière auprès de l'autorité de dataset répète le `resetId`, le `previousDataEpoch` et le `nextDataEpoch` exacts issus de cette intention. Prendre sa position FIFO ferme immédiatement la délivrance de nouveaux baux (`reset_pending`) sans dépasser les commits durables déjà en file d'attente avant elle. Le jeton (token) one-shot retourné lie ces trois mêmes valeurs ; l'installation de l'époque consomme le token sans nécessiter de second choix d'époque fourni par l'appelant.

`resetId`, `nextDataEpoch`, `settingsRecoveryRequestId` et `settingsBootstrapRequestId` sont des UUID v4 canoniques en minuscules deux à deux distincts. Un `previousDataEpoch` non nul est également distinct de ces quatre éléments. L'ID de récupération reste délibérément en dehors du payload neutre de diffusion d'époque ; il appartient uniquement à la requête/journal de reset et à la commande Settings détenue par le reset.

## Pré-vol en lecture seule et reconnaissance post-effacement

Chaque `RESET_REQUESTED` valide entre d'abord dans `preflightingCompletion`, avant le journal en douze phases et avant toute barrière, tout effacement, toute fermeture, toute suppression ou écriture. Le Shell effectue une preuve en lecture seule avec clés exactes sous l'autorité de dataset sérialisée via le token feuille enregistré `dataset-reset/preflight-authority-read/v1`. L'adaptateur fermé est le seul à ouvrir avant version : il commence par inventorier, n'ouvre jamais une DB absente, ouvre une DB présente sans version cible, utilise uniquement des transactions `readonly`, abandonne (abort) lors de `onupgradeneeded`, et ferme/désenregistre son handle temporaire dans `finally` avant de se stabiliser. Il n'effectue aucune création de schéma, montée de version, migration, réparation ou mutation durable.

L'acteur de reset accepte exactement l'une de ces deux issues :

- `fresh` : le journal de reset réservé et le sidecar de handoff sont tous deux absents, l'époque canonique actuelle est exactement `previousDataEpoch` (y compris `null`), et `nextDataEpoch` est différente de l'époque actuelle. Seul ce résultat peut entrer dans `journaling`.
- `already_completed` : le journal de reset réservé et le sidecar de handoff sont tous deux absents, l'époque canonique actuelle est exactement `nextDataEpoch`, et le reçu terminal (le plus récent uniquement) correspond exactement à l'ID de reset initial, aux époques précédente/suivante, aux deux ID de Settings, à `requestedAt` et à `phase:'committed'`. La preuve de l'autorité actuelle exige en outre DB6/data3, un schéma exact vérifié et un `tracking_meta(dataEpoch:nextDataEpoch)` strict avec toute révision de collection actuelle non négative et sûre.

La reconnaissance n'exige délibérément pas que les stores soient encore vides, que les Settings soient encore à leurs valeurs par défaut ou que l'alarme soit encore à sa valeur du moment du reset : des écritures légitimes sous l'époque E2 peuvent avoir eu lieu après l'effacement du journal. Ces faits temporels du reset sont capturés de façon causale par l'écriture ordonnée du reçu décrite ci-dessous. Un reçu malformé ou discordant, une mauvaise époque, une autorité DB/schéma divergente, une clé masquée/supplémentaire ou une identité non canonique ne bascule jamais vers le journaling.

Le reçu durable réside sous la clé `missionpulse.localDataResetReceipt.v1` dans `chrome.storage.local`. Il est limité au tout dernier reset uniquement, subsiste après la réponse, et est supprimé par l'effacement local sélectif du reset suivant avant que ce dernier n'écrive son propre reçu. La reconnaissance n'effectue aucune seconde destruction, aucune acquisition de barrière et aucune écriture de journal. Elle définit `completionDisposition:'recognized'` et entre dans `openingEpochAdmission` ; elle ne se termine pas tant que l'admission de l'époque suivante exacte n'a pas été prouvée ouverte. Le reçu ajoute une clé système bornée dans le stockage Chrome, mais aucune table DB, aucun champ `tracking_meta`, aucun changement de version de DB ni de version de données.

## Journal persistant

Le pré-vol à l'état vierge réserve d'abord A sous `reset_pending`, ce qui ferme **uniquement la délivrance de nouveaux baux** et préserve l'ordre FIFO pour les commits déjà situés avant lui. Sous cette réservation exacte, et avant toute possession effective de barrière ou tout effet destructif, le Shell écrit cet enregistrement strict sous la clé réservée `missionpulse.localDataReset.v1` dans `chrome.storage.local` :

```ts
interface BackgroundSchedulingHandoffCapabilityManifestEntryV1 {
  kind: 'sidecar_initialize' | 'slot_materialize' | 'sidecar_cleanup';
  controlAttemptIndex: 0 | 1 | 2 | 3 | null;
  transitionIndex: number;
  casAttempt: 0 | 1 | 2;
  commandId: string;
  resultId: string;
  capabilityId: string;
  bundleDigest: string;
}

type LocalDataResetPhase =
  | 'journaled'
  | 'fenced'
  | 'quiesced'
  | 'handles_closed'
  | 'database_deleted'
  | 'session_cleared'
  | 'local_cleared'
  | 'database_reinitialized'
  | 'settings_aligned'
  | 'committed'
  | 'handoff_adopted'
  | 'handoff_cleared';

interface LocalDataResetJournalV1 {
  schemaVersion: 1;
  resetId: string;
  previousDataEpoch: string | null;
  nextDataEpoch: string;
  settingsRecoveryRequestId: string;
  settingsBootstrapRequestId: string;
  phase: LocalDataResetPhase;
  backgroundSchedulingHandoff: {
    schemaVersion: 1;
    storageKey: 'missionpulse.backgroundSchedulingHandoff.v1';
    sidecarId: string;
    handoffId: string;
    resetId: string;
    checkpointRevision: number;
    slotCount: number;
    payloadDigest: string;
    sourceControlLaneId: string;
    sourceControlLaneAttemptIndex: 0 | 1 | 2 | 3;
    sourceWorkerEpoch: string;
    capabilityManifestDigest: string;
    cleanupRecovery: {
      version: 1;
      manifestDigest: string;
      bundles: readonly [
        BackgroundSchedulingHandoffCapabilityManifestEntryV1,
        BackgroundSchedulingHandoffCapabilityManifestEntryV1,
        BackgroundSchedulingHandoffCapabilityManifestEntryV1,
      ];
    };
    sidecarEncodedBytes: number;
  } | null;
  requestedAt: number;
  retryCount: number;
  lastError: {
    code: LocalDataResetErrorCode;
    step: LocalDataResetStep;
    origin: 'workflow_step' | 'boot_fence_reacquisition';
    message: string;
    retryable: boolean;
  } | null;
}
```

`backgroundSchedulingHandoff` est strictement null aux phases `journaled|fenced`, puis non-null de `quiesced` à `handoff_cleared`. Le payload ne vit jamais dans le journal : sa référence id/digest pointe vers le sidecar local exact, fermé avant checkpoint, borné à 131 slots et 1 048 576 octets UTF-8 pour sa forme canonique complète. Le contrat sidecar est défini sans import circulaire dans `local-data-reset.contract.ts` et le modèle scheduling produit exactement cette forme.
La référence conserve aussi la provenance lane/attempt/worker, le digest du manifest canonique 1 584+3 et les trois entrées cleanup exactes nécessaires à une reprise après suppression du sidecar. Ces bundles sont une preuve durable, pas des tokens objets transférables entre workers.

Chaque effet durable modifiant la phase est suivi d'un checkpoint dans le journal avant que la machine ne passe outre cette phase. La disponibilité (readiness) et la relecture du reçu terminal sont des prérequis ordonnés de l'unique checkpoint `committed` et se répètent ensemble si ce checkpoint n'est pas durable. Si un effet réussit mais que l'écriture de son checkpoint échoue, la phase précédente reste autoritaire ; le réessai répète l'effet de façon idempotente. Le journal n'est jamais placé dans `chrome.storage.session` car ce stockage est délibérément vidé au milieu du flux.

Les clés du journal et du sidecar de handoff sont les deux seules clés exclues de l'effacement local sélectif. Le sidecar est supprimé avec une relecture d'absence stricte uniquement après son adoption et le checkpoint `handoff_cleared` ; le journal est ensuite supprimé, avant la frontière d'autorité séparée d'ouverture de l'admission. Un journal corrompu entraîne un blocage de sécurité (fail-closed) : le reset et le démarrage normal restent sous barrière (fenced), les octets sont préservés, et les diagnostics nécessitent un support/récupération explicite. Le code ne doit pas deviner une phase ni générer une autre époque. Le journal et les objets d'erreur imbriqués rejettent les clés inconnues ou manquantes. Les messages d'erreur doivent contenir entre 1 et 500 unités de code UTF-16, ce qui borne les diagnostics persistés.

### Sidecar de passation de planification en arrière-plan (Background scheduling handoff sidecar)

L'unique clé durable du payload de handoff est `missionpulse.backgroundSchedulingHandoff.v1` dans `chrome.storage.local`. Son enregistrement externe est exact : littéraux de schéma/clé/schéma-de-payload, identités canoniques de sidecar/handoff/reset/worker, époque précédente, révision de checkpoint sûre, un bitmap de 131 bits et son popcount correspondant, trois digests SHA-256 en minuscules, le nombre exact d'octets canoniques du payload et un objet JSON de payload fermé.
Ce payload contient le `sidecarId` préalloué, les identifiants reset/handoff/worker/époque, la file de contrôle (control lane) et la tentative de Reset, le manifest de capabilités canonique à 1 587 entrées et son digest, la séquence et la politique irréversibles de fermeture de boîte aux lettres (mailbox), un ordre trié de connecteurs de 0 à 64, un tableau dense exact de 131 slots d'alarmes fermés et la preuve stricte de l'écrivain plus le journal à la quiescence. Chaque slot présent possède une séquence de mailbox unique strictement inférieure à la séquence de fermeture ; un terminal tardif est supérieur ou égal à celle-ci. Des clés inconnues, des valeurs non JSON, des tableaux creux, des accesseurs, des prototypes personnalisés, des octets surdimensionnés, une dérive de digest, une dérive de bitmap, du contenu imbriqué interchangé ou une référence ne correspondant pas à chaque identité/borne du sidecar provoque un échec fail-closed. Le parseur reconstruit l'ordre canonique des clés et recalcule le SHA-256 pour le payload, le transfert d'écrivain et la preuve du journal ; il dérive le bitmap/popcount à partir des slots au lieu de faire confiance aux champs externes.

La planification commence par fermer le handoff à un marqueur total de boîte aux lettres. Les rappels ordonnés avant lui sont regroupés dans la cible immuable de 131 slots ; les rappels ordonnés après lui reçoivent un terminal exact `RESET_HANDOFF_CLOSED` avec zéro ID/écriture et leur prochaine planification appartiendra à la réconciliation E2. La planification initialise le sidecar avec la cible complète, son digest, `materializationCursor:0` et le prochain `casCursor { controlAttemptIndex, transitionIndex, casAttempt }` one-shot exact, puis n'avance que ce préfixe de cible durable. Un échec définitif persiste et relit le curseur CAS suivant avant réessai ; un résultat inconnu est résolu par les identifiants actuels du bundle et ne cause jamais de réutilisation ou d'omission. Sa lane de contrôle dédiée au Reset préalloue un `sidecarId` vierge, propagé sans modification à la lane, à tous les bundles CAS/cleanup, capabilités, sidecar et référence, plus trois bundles de capabilités vierges pour l'initialisation et chacun des 131 slots sur l'ensemble des quatre tentatives de contrôle : 1 584 bundles CAS au total, plus trois bundles de nettoyage (cleanup).
La fermeture de la boîte aux lettres met fin aux allocations externes et à la mutation de la cible, mais l'exécuteur interne de checkpoint peut encore consommer uniquement les entrées déjà réservées nécessaires à la matérialisation de la cible immuable avant d'exposer la référence. Il ne peut pas allouer, substituer la lane/tentative/manifest ou écrire un slot hors cible. Dès qu'un bit est présent, un doublon est regroupé vers ce slot canonique avec zéro écriture de sidecar et zéro ID consommé. L'initialisation a la révision 0 ; chaque slot présent matérialisé depuis la cible gelée s'incrémente exactement d'une unité. Chaque checkpoint accepté satisfait donc `checkpointRevision === popcount(slotBitmap) === slotCount`, y compris les cas à 0 slot, 1 slot et 131 slots.
Si la capacité, le CAS ou la relecture échoue avant l'effacement de session, le Reset reste avant l'effacement et n'efface rien. Le handoff ne se rouvre jamais et aucune mutation de slot post-checkpoint n'est recevable, de sorte que la référence du Reset ne peut pas devenir obsolète. Après l'effacement de session, le sidecar est durable et reste préservé à travers les redémarrages, l'effacement local et l'adoption.

`payloadEncodedBytes` est la longueur exacte UTF-8 du JSON de payload canonique et est borné à 786 432. `sidecarEncodedBytes` réside dans la référence de Reset et est la longueur exacte UTF-8 de l'objet sidecar canonique complet ; il est recalculé et borné à 1 048 576 avant que toute preuve ne soit acceptée. Ces noms ne sont pas des alias et aucune des deux limites ne peut remplacer l'autre.

Le journal de reset référence le sidecar uniquement par le biais de la structure exacte `BackgroundSchedulingHandoffReferenceV1` ; il n'embarque ni ne possède jamais le payload. L'événement de checkpoint transporte en outre la lane/tentative/worker gelés, le sidecar/handoff, le manifest complet ordonné 1 584+3 et le digest de la cible gelée. Son parseur recalcule le digest de chaque bundle ainsi que les deux digests agrégés, puis rejette tout échange de lane/tentative/worker croisé par rapport à l'attente conservée depuis l'autorité exacte de barrière, même si la preuve étrangère est cohérente en interne.
`SESSION_CLEARED` prouve le même sidecar après `chrome.storage.session.clear()`.
`LOCAL_CLEARED` prouve le tuple fermé de clés préservées `[missionpulse.localDataReset.v1, missionpulse.backgroundSchedulingHandoff.v1]` et relit les deux autorités.
Après diffusion de l'état committed, le planificateur restaure/adopte le sidecar exact et enregistre le checkpoint `handoff_adopted` ; l'adoption ne le supprime pas. Une capabilité de nettoyage distincte supprime uniquement cette clé, prouve son absence stricte, enregistre le checkpoint `handoff_cleared`, et permet seulement alors la suppression du journal de reset.
Si le worker redémarre en phase `handoff_adopted` ou `handoff_cleared`, son époque de worker actuelle doit différer de l'époque du worker source durable, faute de quoi la réhydratation est rejetée avant l'acquisition de la barrière. Dans `handoff_adopted`, l'autorité renvoie un reçu de lane de remplacement corrélé commande/résultat exact. Il transporte trois tokens objets de nettoyage vierges liés à ce reçu, à la lane et au worker actuel, utilisant les mêmes identifiants et digests de sidecar/handoff/manifest ; chaque token objet d'ancien worker et chaque copie de DTO sont invalides. La tentative de nettoyage 0, 1 ou 2 peut renvoyer `removed` ou `already_absent`. Si la phase durable est déjà `handoff_cleared`, la récupération n'émet pas de tokens ni ne répète la suppression et procède directement à l'effacement du journal.

La réservation `reset_pending` comporte un statut total de journal : `absent_proven | outcome_unknown | durable_proven`. Le put/relecture initial ne peut acquérir la barrière active qu'après qu'une relecture exacte du même reset l'a basculé à `durable_proven`. Une absence exacte après un put échoué reste `absent_proven` et A peut réessayer avec de nouveaux identifiants d'exécution. Si ni la durabilité ni l'absence ne peuvent être relues, A entre dans `resolvingInitialJournal` ; seul le résolveur enregistré pour ce même A peut relire, exécuter un put-if-absent de manière idempotente et prouver une issue. Le Reset B reste rejeté. Un timeout, une exception levée ou la mort du worker ne signifie jamais absence : un nouveau worker soit trouve un journal strict et réhydrate A, soit prouve l'absence stricte et exige un pré-vol vierge.

`origin: 'workflow_step'` suit la matrice de phases stricte : `lastError.step` doit correspondre à l'étape suivante impliquée par `phase`, à l'exception du cas transverse `JOURNAL_FAILED` et des erreurs de reçu exactes attachées à `settings_aligned` ; cela s'applique également à l'erreur non réessayable `PROTOCOL_ERROR`. Il n'existe aucune exception `PROTOCOL_ERROR/journal`. L'unique correspondance indépendante de la phase est `origin: 'boot_fence_reacquisition'`, qui exige exactement `FENCE_FAILED/fence` réessayable. Ce discriminant prouve que l'échec est survenu lors de la recréation de la barrière active, plutôt que lors de l'exécution de l'effet suivant induit par la phase. Toute autre combinaison d'origine/code/étape rend le journal corrompu et produit `JOURNAL_CORRUPT/journal` sans réécrire les octets corrompus.

## Reçu terminal (Terminal receipt)

Le reçu terminal (le plus récent uniquement) est un enregistrement système distinct à clé exacte :

```ts
interface LocalDataResetReceiptV1 {
  schemaVersion: 1;
  resetId: string;
  previousDataEpoch: string | null;
  nextDataEpoch: string;
  settingsRecoveryRequestId: string;
  settingsBootstrapRequestId: string;
  requestedAt: number;
  phase: 'committed';
}
```

Il utilise la même matrice d'UUID canoniques et d'unicité structurelle que la requête/journal de reset, ainsi que l'horodatage exact `requestedAt`. Des clés inconnues/manquantes/masquées/Symbol/accesseurs ou un prototype personnalisé sont invalides. Le Shell ne peut l'écrire que dans `writingReceipt`, après l'alignement exact des Settings/alarme et la disponibilité acceptée, tant que le journal et la barrière active restent présents. L'écriture (put) et la relecture stricte constituent un seul effet modélisé. Ce n'est qu'après l'événement correspondant que le journal peut enregistrer le checkpoint de phase `committed`. Cet ordonnancement fait de `{ journal absent + reçu exact }` une preuve terminale sans nécessiter d'atomicité multi-clés.

Ce reçu borné est un écrivain système global sous la même porte de stockage que les Settings ; son empreinte maximale est incluse dans `SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES` et ne peut consommer la réservation transactionnelle de mutation d'un utilisateur.

## Barrière d'admission et propriété (Admission fence and ownership)

Le coordinateur de reset est le propriétaire exclusif de l'admission globale des données locales, depuis l'acquisition de la barrière active jusqu'à l'état `completed`. La barrière est la porte centrale de validation de l'époque du dataset définie par `db-migration.model.md`, et non un simple booléen local au tracking :

- le démarrage du scan, sa persistance et ses réessais sont rejetés ou annulés ;
- la barrière de démarrage du tracking ne peut ni démarrer ni réessayer la migration ou la récupération ;
- les acteurs de tracking par mission n'acceptent aucune nouvelle commande et ignorent les événements tardifs ;
- l'outbox désactivée reste arrêtée ;
- tous les ouvrants refusent de nouveaux handles de DB à l'exception du réinitialisateur vierge détenu par le reset ;
- les écrivains de settings et autres stockages locaux se mettent en pause derrière la même barrière.

L'acquisition de la barrière ferme atomiquement l'admission, incrémente la révision de l'autorité d'époque locale au worker et révoque chaque bail d'écriture sur le dataset en cours. Chaque écrivain interne — persistance des missions de scan, checkpoints de scan/session, sauvegardes et compensations de profil/paramètres, ressources générées, cache sémantique/TJM, état vu/favori et rappels en arrière-plan — doit revalider son bail d'époque à l'intérieur de la même porte immédiatement avant le commit. Le Reset conserve la porte jusqu'à ce que tous les anciens commits soient stabilisés, de sorte qu'aucun travail pré-reset en attente ne puisse écrire après la libération.

Le démarrage du service worker lit le journal avant d'ouvrir IndexedDB ou d'enregistrer des gestionnaires métier. La présence du journal installe une porte de refus (deny-gate) externe au boot, mais une phase durable ne prouve jamais que le nouveau worker possède une barrière active. La machine restaure chaque journal valide avec `fenceAcquired:false` et entre dans `reacquiringFence`. Le Shell appelle d'abord `rehydrateResetPreAdmission(strictJournalIdentity, exactRehydrationAuthorityReadLeafToken)` sous la FIFO de DatasetEpoch. Cette opération relit le journal et l'autorité physique compatible avec la phase, rejette une troisième époque/un reçu étranger/un Reset B, installe `reset_pending`, et renvoie une nouvelle réservation d'objet exact liée au `workerEpoch` actuel. Elle ne clone jamais la réservation du worker décédé. Le Shell appelle ensuite `acquireResetFence` avec ce remplaçant et la même preuve de journal ; cela fait progresser les révisions, révoque les anciens baux/capabilités et installe `reset_owned`. Le Shell ne peut émettre le `BOOT_FENCE_ACQUIRED { resetId, proof }` corrélé qu'avec la preuve exacte enregistrée renvoyée par les deux opérations, et après que les gestionnaires et ouvrants de ce worker soient placés sous barrière. Ce n'est qu'alors que la machine peut s'orienter selon la phase durable ou exposer `blocked`/`failed`. Aucun effet de reprise destructif ne peut donc démarrer entre la récupération après crash et la preuve de barrière active.

La matrice des phases de réhydratation n'accepte que l'effet physique exact qui peut avoir une frontière d'avance sur son checkpoint durable : ancienne autorité ou autorité nulle à travers les premières phases, absence possible après fermeture de handle, absence après suppression/effacement de session, un préfixe ordonné exact de DB6/suivant-vide -> Settings de génération zéro -> marqueur 3 à `local_cleared`, DB6/data3 suivant exact après réinitialisation, et le reçu exact à `committed`. La matrice est totale : `handoff_adopted` exige DB6/data3 à l'époque suivante, le reçu terminal exact, la référence/sidecar encore présents et le checkpoint d'adoption exact ; `handoff_cleared` exige les mêmes autorités DB/reçu, la référence exacte, l'absence du sidecar relue et le checkpoint de nettoyage. Tout autre fait physique échoue en fail-closed sans mutation d'autorité.

Si cette réacquisition active échoue, un `STEP_FAILED` corrélé entre d'abord dans `checkpointingFailure` tant que la même réservation A du worker actuel reste `reset_pending`. Seule la capabilité exacte `reset.journal.checkpoint_failure` peut persister la phase et le compteur de réessais inchangés avec `lastError = { code:'FENCE_FAILED', step:'fence', origin:'boot_fence_reacquisition', retryable:true, ... }`. Une relecture stricte émet alors `FAILURE_CHECKPOINTED` et entre dans `failed`. L'échec de ce checkpoint entre dans `failureCheckpointBlocked`, n'effectue aucune écriture d'erreur récursive et maintient la porte de boot fermée. Ce journal se re-parse pour l'ensemble des douze phases, de sorte qu'un nouveau réveil du worker réacquiert à nouveau la porte de refus externe active, s'oriente vers `failed` et attend un `RETRY` du même reset ; il ne devient jamais corrompu ni ne reprend automatiquement un effet de phase.

Une exécution vierge sépare la transition d'autorité de son checkpoint dans le journal : `acquiringFence` appelle `acquireResetFence`, puis `checkpointingFence` écrit la phase `fenced`. Une phase `journaled` restaurée a déjà acquis la barrière active du worker actuel avant `BOOT_FENCE_ACQUIRED` ; elle s'oriente directement vers `checkpointingFence` et n'appelle jamais `acquireResetFence` une seconde fois. Une acquisition en doublon exact peut renvoyer la preuve canonique du worker actuel, mais le statechart ne dépend pas d'un appel dupliqué.

Fermer un panneau latéral ou perdre le port de message initiateur n'annule pas un reset consigné dans le journal. Il n'y a aucune transition d'annulation après `RESET_JOURNALED`. Avant l'existence du journal, une perte de transport signifie simplement qu'aucun reset destructif n'a commencé.

## Autorité canonique des paramètres (Canonical settings authority)

Le Reset importe `SettingsEnvelopeV2` et son validateur strict depuis `settings-persistence.contract.ts`, l'unique autorité de stockage de la Tâche 6. Il n'écrit jamais un enregistrement de paramètres spécifique ou réduit pour le reset. Une enveloppe vierge est exactement `{ version:2, dataEpoch:nextDataEpoch, revision:0, generation:0, settings:defaults, journal:null, outcomes:[] }`. La machine de reset reçoit les valeurs par défaut validées et le catalogue de connecteurs du build trié en tant qu'entrée immuable ; `DATABASE_REINITIALIZED` transporte la relecture physique, et sa garde invoque le validateur partagé avant d'accepter une révision/génération zéro, les valeurs par défaut exactes, des outcomes vides et un journal Settings null. Des clés inattendues, une mauvaise époque, des settings/journal/outcomes malformés ou une génération initiale non nulle font échouer la réinitialisation en fail-closed et préservent le journal de reset.

Le même événement `DATABASE_REINITIALIZED` transporte également une preuve physique stricte de DB6/data3, le schéma exact, `tracking_meta(nextDataEpoch, collectionRevision:0)` et le vecteur ordonné à zéro ligne `connector_status`, `generated_assets`, `mission_tracking`, `missions`, `profile`, `quarantine`, `tracking_mutations`, `tracking_outbox`. La garde parse les deux preuves avant de marquer `database_reinitialized` ; c'est le fait temporel immuable du reset capturé plus tard par l'ordonnancement du reçu terminal.

## Récupération et preuve des Settings détenues par le Reset

La nouvelle base de données n'est pas prête à être diffusée du simple fait que son enveloppe initiale est valide. Dans `aligningSettings`, le reset seul peut appeler le moteur partagé de récupération des Settings tant que son propre journal est présent :

```ts
interface AlignSettingsForResetV1 {
  version: 1;
  resetId: string;
  dataEpoch: string;
  requestId: string; // settingsRecoveryRequestId
  commandId: string; // settings/reset-recover/<requestId>
  expectedResetPhase: 'database_reinitialized';
}
```

L'admission exige la même barrière de reset active, les ID de reset/phase/époque suivante exacts, et aucun écrivain de Settings concurrent. L'effet idempotent lit strictement l'enveloppe vierge, récupère tout journal de Settings et, lorsque `auto-scan` diffère, installe atomiquement un journal système `effects_pending` avant de modifier uniquement l'alarme `auto-scan` de MissionPulse. Il lit ensuite l'effet, efface le journal système, et relit l'enveloppe ainsi que l'alarme sous la même barrière/bail. Aucun panneau ni Load d'UI n'y participe.

Le succès renvoie une preuve détenue par le reset plutôt que d'affaiblir le contrat de snapshot de l'UI (`SettingsSnapshotV1` exige toujours l'absence de journal de reset) :

```ts
interface ResetOwnedSettingsAlignmentProofV1 {
  version: 1;
  resetId: string;
  dataEpoch: string;
  requestId: string;
  commandId: string;
  resetPhase: 'database_reinitialized';
  envelope: SettingsEnvelopeV2;
  alarmProof: AutoScanAlarmProofV1;
}
```

Le parseur exact importe les deux validateurs partagés. Il requiert la stabilité des identités de reset, d'époque, de requête et de commande déterministe ; une révision zéro ; les valeurs par défaut exactes ; des outcomes vides ; un journal Settings null ; et une preuve d'alarme dont le digest, la révision, la **génération stabilisée**, la requête et la commande sont identiques à l'enveloppe finale. L'initialisation prouve la génération zéro ; la récupération système peut faire avancer cette génération sans modifier la révision, de sorte que le reset n'invente aucun delta local de génération. Le parseur d'alignement final accepte donc la génération stabilisée sûre et non négative exacte portée par l'enveloppe et la preuve d'alarme ; cela n'affaiblit pas `DATABASE_REINITIALIZED`, dont la preuve physique distincte exige toujours la génération zéro. Le Shell consigne le checkpoint de phase `settings_aligned` avant d'émettre `SETTINGS_ALIGNED` ; une preuve sans checkpoint ne peut faire avancer l'acteur.

## Notifications d'époque et ralliement du Load (Epoch notifications and Load join)

Les deux diffusions utilisent l'unique payload à clés exactes exporté par `local-data-reset-epoch.contract.ts` ; Reset réexporte son type et son parseur mais ne redéfinit ni l'un ni l'autre. Le parseur neutre exige `version:1`, l'une des deux étapes exactes, des UUID v4 canoniques en minuscules, aucune clé superflue/manquante, et l'unicité structurelle : les identifiants de reset, d'époque suivante et de bootstrap sont distincts ; une époque précédente non nulle est distincte des trois. `settingsRecoveryRequestId` ne fait intentionnellement pas partie de ce payload réseau et reste strictement séparé dans la requête/journal de reset. L'admission stricte d'objets n'accepte que les prototypes `Object.prototype`/null, le résultat exact de `Reflect.ownKeys` et les descripteurs de données propres énumérables ; les accesseurs, symboles, prototypes hérités/personnalisés et ajouts masqués échouent en fail-closed avant que tout getter de propriété ne puisse s'exécuter. La livraison est un fait d'adaptateur distinct.

Settings peut envelopper le payload neutre sous la forme `{ type, payload, resetFenceProof? }`. Il ne doit analyser `payload` qu'à travers le parseur partagé ; toute autorité de bootstrap/barrière de confiance requise pour un chemin Settings avec `previousDataEpoch:null` reste dans `resetFenceProof`, en dehors du payload neutre et en dehors du schéma réseau de Reset.

Pour le chemin direct Settings `committed`/époque-précédente-nulle, la frontière d'époque/bootstrap de dataset de confiance peut attacher cette preuve éphémère spécifique à Settings :

```ts
interface ResetFenceProofV1 {
  version: 1;
  kind: 'DATASET_EPOCH_RESET_FENCE';
  issuedTo: 'settings-bootstrap';
  resetId: string;
  nextDataEpoch: string;
  settingsBootstrapRequestId: string;
  resetPhase: 'committed';
  authorityFenceHeld: true;
  gateLeaseId: string;
  proofId: string;
}
```

Les trois identités du payload doivent être égales au payload neutre parsé ; `gateLeaseId` et `proofId` sont des UUID v4 canoniques deux à deux distincts entre eux et distincts de reset/next/bootstrap. Seule la frontière de confiance peut construire la preuve pendant que le journal validé exact et la barrière d'autorité active sont tous deux détenus ; accepter un objet de même forme provenant d'un message non approuvé est interdit. Reset lui-même continue de diffuser uniquement le payload neutre. Cette preuve de barrière est éphémère et distincte du reçu terminal de reset durable requis ; elle n'ajoute aucun schéma en DB ou en stockage.

`ready_to_commit` invalide les anciennes projections des panneaux, fait passer Settings à `resetPending`, désactive les mutations, efface sa commande et n'émet **aucun Load**. Une fois cette expédition acceptée, reset enregistre le checkpoint de phase `committed` ; ce n'est qu'alors que le payload exact `committed` peut être envoyé. Le journal de reset reste présent afin que l'événement post-commit puisse être rejoué après un crash. Un consommateur Settings émet un unique `RECOVER_AND_LOAD_SETTINGS` en utilisant `settingsBootstrapRequestId` et `resetCorrelation={resetId,nextDataEpoch}` ; les événements committed en doublon n'émettent aucune autre commande.

L'exécuteur applique cette matrice de ralliement (join) avant la récupération normale de Settings :

| Journal de Reset          | Load non corrélé                                         | Load corrélé au même reset/époque     |
| ------------------------- | -------------------------------------------------------- | ------------------------------------- |
| absent                    | récupération normale                                     | récupération normale                  |
| phase avant `committed`   | `SETTINGS_RESET_IN_PROGRESS`                             | `SETTINGS_RESET_IN_PROGRESS`          |
| phase `committed`         | finaliseur de ralliement ou `SETTINGS_RESET_IN_PROGRESS` | ralliement obligatoire ; pas d'erreur |
| reset/époque différent(e) | erreur de reset/protocole                                | erreur de protocole                   |

Le ralliement obligatoire attend `JOURNAL_CLEARED` et l'ouverture de la nouvelle autorité d'époque, puis effectue une récupération ordinaire et ne retourne qu'un snapshot stabilisé avec `resetJournalAbsent:true`. L'envoi de la diffusion n'attend jamais ce Load, afin que le reset puisse effacer le journal et le débloquer sans interblocage (deadlock).

## Protocole d'effets ordonné (Ordered effect protocol)

Le seul ordonnancement couronné de succès est :

0. **Pré-vol (Preflight).** Lire et valider strictement l'absence du journal réservé, l'époque canonique et la preuve terminale soit d'admission vierge, soit post-effacement. Une complétion reconnue s'oriente uniquement vers l'étape 15 ; une preuve vierge installe atomiquement `reset_pending` pour le même A. Cette étape est en lecture seule et n'est pas une onzième phase durable.
1. **Journal.** Écrire/relire (put/read back) la phase `journaled` avec des ID et époques stables. Une issue d'écriture/relecture inconnue reste `reset_pending` dans `resolvingInitialJournal` jusqu'à ce que le résolveur du même A prouve la durabilité exacte ou l'absence exacte ; elle ne bascule jamais vers l'échec ou l'acquisition de barrière.
2. **Acquérir la barrière (Acquire fence).** À partir de `durable_proven`, acquérir la propriété du reset, invalider l'ancienne propriété d'époque et arrêter les réessais de la barrière de démarrage.
3. **Point de contrôle de barrière (Checkpoint fence).** Avec cette preuve active, consigner le checkpoint `fenced`. Une phase `journaled` restaurée dont la barrière de boot est déjà acquise démarre ici, pas à l'étape 2.
4. **Quiescence et checkpoint du handoff.** Annuler ou stabiliser le scan actif ; arrêter les acteurs de tracking ; attendre toute transaction de migration active ; arrêter le travail de l'outbox. La planification traite d'abord un marqueur total de fermeture de boîte aux lettres : les rappels antérieurs sont dans la cible gelée, les rappels postérieurs reçoivent le terminal de fermeture. Elle doit ensuite valider par CAS/relire le sidecar local immuable exact, recalculer tous les faits canoniques et renvoyer la référence portant le `sidecarId` préalloué par la lane. Enregistrer le checkpoint `quiesced` seulement lorsque les cinq preuves sont vraies.
5. **Fermer les handles (Close handles).** Fermer chaque connexion dans le registre central des handles DB, empêcher de nouveaux ouvrants non liés au reset, puis enregistrer le checkpoint `handles_closed`.
6. **Supprimer la base de données (Delete database).** Attendre le succès de `indexedDB.deleteDatabase('missionpulse')`, puis enregistrer le checkpoint `database_deleted`.
7. **Effacer la session (Clear session).** Exécuter `chrome.storage.session.clear()` après que tous les écrivains de session autorisés sont au repos (quiescents), relire le sidecar local exact, puis enregistrer le checkpoint `session_cleared`. Une preuve de sidecar manquante ou croisée n'est pas un succès.
8. **Effacer le stockage local sélectivement (Clear local selectively).** Prendre un snapshot de toutes les clés locales et supprimer chaque clé sauf exactement `missionpulse.localDataReset.v1` et `missionpulse.backgroundSchedulingHandoff.v1`. Aucun écrivain ne peut créer de clé concurrente sous la barrière. Relire la même référence de journal/sidecar et le sidecar ; cela supprime tout reçu terminal antérieur (le plus récent uniquement). Enregistrer le checkpoint `local_cleared` dans le journal préservé.
9. **Réinitialiser (Reinitialize).** Une ouverture détenue par le reset crée/vérifie le schéma DB6 exact, crée des métadonnées strictes avec le `nextDataEpoch` du journal, vérifie que les stores de tracking, de grand livre (ledger) et d'outbox sont vides, écrit l'enveloppe de contrat partagé `SettingsEnvelopeV2` avec les valeurs par défaut validées, la même époque, la révision 0, la génération 0, `journal: null` et `outcomes: []`, puis lit les deux autorités à travers leurs validateurs stricts et écrit `APP_DATA_VERSION = 3`. Une réexécution est un no-op uniquement pour la preuve d'époque/enveloppe/stores-vides exacte. L'admission normale aux baux reste fermée. Enregistrer le checkpoint `database_reinitialized`.
10. **Aligner les Settings (Align Settings).** Exécuter la récupération détenue par le reset ci-dessus, prouver l'alarme exacte et l'enveloppe stabilisée, puis consigner le checkpoint `settings_aligned`.
11. **Diffuser la disponibilité (Broadcast readiness).** Émettre l'événement à étape exacte `ready_to_commit` ; c'est une invalidation pré-commit, jamais un succès de reset et jamais un déclencheur de Load.
12. **Écrire et relire le reçu terminal (Write and read back terminal receipt).** Sous la même barrière globale et la même porte de stockage système, écrire (put) l'unique reçu le plus récent `missionpulse.localDataResetReceipt.v1`, puis relire et analyser strictement chaque ID, époque, `requestedAt` et `phase:'committed'`. Le stockage du reçu est inclus dans la réserve bornée de quota Settings/système. Un reçu existant correspondant est un succès idempotent ; un reçu différent est un conflit de protocole.
13. **Point de contrôle du commit (Checkpoint commit).** Persister la phase `committed` uniquement après l'acceptation exacte de la disponibilité et la relecture du reçu. Cette bascule durable implique la preuve des Settings ; le journal ne subsiste que pour rejouer la notification finale.
14. **Diffuser le commit (Broadcast committed).** Émettre le corps de même génération avec l'étape `committed`. Un panneau peut maintenant émettre son unique Load rallié et corrélé.
15. **Adopter le handoff (Adopt handoff).** Restaurer le sidecar après redémarrage si nécessaire, déplacer atomiquement ses 0..131 slots exacts dans la nouvelle entrée de planification, relire l'adoption et consigner le checkpoint `handoff_adopted`. Le sidecar reste présent.
16. **Effacer le sidecar de handoff (Clear handoff sidecar).** Sur le worker d'origine, consommer la capabilité de nettoyage exacte suivante. Après redémarrage, créer d'abord une nouvelle lane/worker de remplacement, invalider les tokens objets de l'ancien worker et réémettre l'ensemble des trois entrées de nettoyage exactes depuis la référence du journal. Consommer la tentative 0, 1 ou 2, supprimer uniquement `missionpulse.backgroundSchedulingHandoff.v1` ou accepter son absence préalable exacte, prouver strictement l'absence et enregistrer le checkpoint `handoff_cleared` dans le journal de reset.
17. **Effacer le journal (Clear journal).** Supprimer `missionpulse.localDataReset.v1`, prouver strictement l'absence et conserver la preuve exacte de suppression/reçu/DB. Cela ne termine pas le Reset.
18. **Installer et ouvrir l'admission d'époque (Install and open epoch admission).** Dans `openingEpochAdmission`, appeler l'opération FIFO dédiée `installResetEpochAndOpen`. Un succès exact ou un doublon exact déjà ouvert produit `RESET_EPOCH_ADMISSION_OPENED` et transitionne seulement alors vers `completed`. Un échec entre dans `postClearAdmissionFailed` avec l'admission fermée ; un réessai ne répète que cette opération d'autorité. Ce n'est qu'après la preuve d'ouverture que le Shell peut renvoyer `LOCAL_DATA_RESET_RESULT { reset: true, dataEpoch: nextDataEpoch }`.

Les deux événements de succès de diffusion renvoient en écho le payload complet tenté plus `delivery: 'delivered' | 'no_receiver'`. Des gardes strictes comparent l'étape, l'ID de reset, l'époque précédente nullable, l'époque suivante et l'ID de requête de bootstrap. Des champs erronés/superflus ne peuvent enregistrer le checkpoint de commit ni effacer le journal. Un crash après la disponibilité mais avant le reçu répète la disponibilité ; un crash après la relecture du reçu mais avant le checkpoint de commit a toujours la phase de journal `settings_aligned`, répète la disponibilité et réécrit/relit le reçu identique de manière idempotente ; un crash à la phase `committed` répète l'événement committed avant l'effacement. Il n'y a délibérément aucune phase de journal `readiness_broadcasted` et aucune phase supplémentaire `receipt_written` : le reçu est durable dans sa clé distincte bornée, tandis que le journal conserve exactement douze phases.

Le succès de diffusion signifie que Chrome a accepté cette tentative d'envoi exacte. L'adaptateur normalise séparément uniquement l'issue canonique de Chrome "receiving end does not exist" en `no_receiver` ; l'absence de panneau ouvert est nominale et ne requiert aucun accusé de réception ni décompte de destinataires. Tout autre rejet d'API est `BROADCAST_FAILED/readiness_broadcast` ou `BROADCAST_FAILED/postcommit_broadcast`. L'adaptateur ne peut classifier des erreurs arbitraires comme no-receiver par fallback sur sous-chaîne.

## Composition des capabilités de pré-admission (Pre-admission capability composition)

Reset ne revendique que l'état porteur d'écriture actif exact. Une revendication (claim) répète le `resetId` durable comme `workflowId`, l'`attemptId` d'exécution éphémère, le `workerEpoch` de l'autorité, l'identifiant de commande exact dérivé de l'état, l'époque nullable spécifique à l'étape, `authorityRevision`, `fenceRevision` et un plan d'écriture ordonné et borné. Chaque écriture reçoit également un token feuille de données pures exact issu de l'adaptateur fermé mappé à son `writeKind` ; `commitPreAdmission` accepte ce token et aucun callback d'appelant. La portée (scope) est complétée avant que la machine ne reçoive l'événement pouvant quitter cet état.

La correspondance état-vers-écriture est fermée :

| État exact du Reset         | Écritures ordonnées sur le Dataset, chacune avec une capabilité one-shot vierge                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `journaling`                | écriture initiale exacte du journal                                                                                                                                                                                            |
| `resolvingInitialJournal`   | écriture/relecture du résolveur d'issue exacte du même A ; uniquement depuis `journalStatus:'outcome_unknown'`                                                                                                                 |
| `acquiringFence`            | aucune ; opération d'autorité dédiée `acquireResetFence`                                                                                                                                                                       |
| `checkpointingFence`        | checkpoint de la phase de journal `fenced`, après la preuve de barrière active du worker actuel                                                                                                                                |
| `checkpointingQuiescence`   | checkpoint de la phase de journal `quiesced` avec référence exacte au sidecar après CAS/relecture fermé                                                                                                                        |
| `closingDatabase`           | checkpoint de la phase de journal `handles_closed` ; la fermeture des handles elle-même n'est pas une écriture durable sur le Dataset                                                                                          |
| `deletingDatabase`          | suppression de `missionpulse`, puis checkpoint `database_deleted` avec une deuxième capabilité                                                                                                                                 |
| `clearingSession`           | un `chrome.storage.session.clear()`, puis checkpoint `session_cleared` avec une deuxième capabilité                                                                                                                            |
| `clearingLocal`             | une suppression sélective bornée excluant exactement journal+sidecar, puis checkpoint `local_cleared` avec une deuxième capabilité                                                                                             |
| `reinitializing`            | transaction DB6/métadonnées/stores-vides, écriture/relecture de `SettingsEnvelopeV2` de génération zéro, écriture/relecture du marqueur 3, puis checkpoint du journal `database_reinitialized` : quatre capabilités distinctes |
| `aligningSettings`          | une capabilité pour chaque écriture exacte d'enveloppe/journal/outcome de Settings dans le plan de récupération partagé, puis un checkpoint de journal distinct `settings_aligned`                                             |
| `writingReceipt`            | écriture (put) du reçu le plus récent uniquement ; sa relecture stricte est en lecture seule                                                                                                                                   |
| `checkpointingCommit`       | checkpoint de la phase de journal `committed`                                                                                                                                                                                  |
| `adoptingBackgroundHandoff` | lecture/restauration/adoption du sidecar, puis checkpoint `handoff_adopted` ; l'adoption elle-même est en lecture seule et conserve le sidecar                                                                                 |
| `clearingBackgroundHandoff` | la lane d'origine ou de remplacement réémet/utilise le tuple de nettoyage exact ; suppression/preuve de l'absence du sidecar exact, puis checkpoint de journal distinct `handoff_cleared`                                      |
| `clearingJournal`           | suppression du journal réservé exact ; la relecture stricte de l'absence précède la complétion de la portée                                                                                                                    |
| `checkpointingFailure`      | persistance de la phase/compteur de réessais inchangés exacts et de l'erreur `lastError` en attente exacte ; la relecture stricte précède `blocked`/`failed`                                                                   |
| `checkpointingRetry`        | persistance de la phase inchangée exacte, `retryCount + 1`, `lastError:null` ; la relecture stricte précède la récupération                                                                                                    |
| `openingEpochAdmission`     | aucune ; opération d'autorité dédiée `installResetEpochAndOpen`                                                                                                                                                                |
| `postClearAdmissionFailed`  | aucune ; journal absent, diagnostic volatile uniquement                                                                                                                                                                        |

`preflightingCompletion`, `reacquiringFence`, `routingRestart`, `acquiringFence`, `quiescing`, `broadcastingReadiness`, `broadcastingCommitted`, la moitié lecture/adoption de `adoptingBackgroundHandoff`, `openingEpochAdmission` et `postClearAdmissionFailed` n'effectuent aucune écriture sur le Dataset et ne créent aucune revendication vide/factice. Les opérations de diffusion et d'alarme conservent leurs propres preuves strictes de livraison/effet ; elles ne peuvent être dissimulées dans un token de stockage.

L'époque d'autorité liée à une revendication de Reset est exacte :

- `journaling` observe l'époque admise actuelle lorsque l'admission normale est ouverte, ou l'époque nullable/en attente de l'autorité tant que le démarrage est fermé ;
- après prise de possession de la barrière et jusqu'à `clearingLocal`, elle est égale au `previousDataEpoch` de la requête de reset, y compris le littéral `null` ;
- de `reinitializing` jusqu'à `clearingJournal`, elle est égale à `nextDataEpoch`.

La portée initiale de journal ou de résolution d'issue est complétée avec `journalStatus:'durable_proven'` avant la mise en file d'attente d'`acquireResetFence`. L'acquisition de barrière est la méthode d'autorité dédiée, et non une écriture de capabilité. Dès qu'elle est linéarisée, elle incrémente les révisions d'autorité/barrière, révoque chaque ancien bail/capabilité et n'admet que les revendications `reset_owned` du même reset. Un commit précédant la barrière se termine en premier ; un commit suivant celle-ci n'invoque aucun adaptateur. Un appel externe de barrière de Reset ou d'échec arrivant pendant qu'une Promise d'adaptateur durable est en attente reçoit le ticket FIFO suivant et attend ; il n'est pas rejeté par un drapeau global de réentrance asynchrone.

Le plan de `reinitializing` comporte quatre frontières durables non compressibles. En particulier, le marqueur 3 ne peut être écrit avant que l'enveloppe complète Settings V2 de génération zéro n'ait été strictement relue. Un token de Reset étendu à l'ensemble du port, un token partagé entre DB/Settings/marqueur, ou un token partagé entre un effet physique et son checkpoint de journal est interdit.

`clearingJournal` consomme sa capabilité one-shot avant d'appeler remove, prouve strictement l'absence, termine sa portée, et permet seulement alors à la séquence d'installation/ouverture d'époque de l'autorité dédiée de se dérouler. Ni la capabilité ni le token de barrière de reset ne constitue un reçu de succès. `reset:true` exige toujours la preuve terminale complète du flux.

Lors de tout rejet d'effet, la capabilité reste consommée et la portée est complétée comme révoquée avant le `STEP_FAILED` corrélé. Si un journal strict existe, cet événement capture `pendingFailure` et entre dans `checkpointingFailure` ; l'acteur ne peut exposer `blocked`/`failed` tant que le checkpoint exact de `lastError` n'a pas été strictement relu. L'échec de ce checkpoint entre dans `failureCheckpointBlocked`, n'écrit aucune erreur récursive et ne peut que réessayer le même checkpoint avec des identifiants d'exécution neufs. Avant que le journal n'existe, les diagnostics de pré-vol relèvent du contexte uniquement.

`RETRY` depuis `blocked`/`failed` entre de la même manière dans `checkpointingRetry` ; seule la relecture exacte du journal avec une phase inchangée, `retryCount + 1` et `lastError:null` permet la récupération/réacquisition de barrière. Un échec de checkpoint de réessai entre dans `retryCheckpointBlocked` et ne déclenche aucun effet. Le réessai utilise par ailleurs les mêmes identités durables de Reset mais des identifiants de tentative, revendication, écriture, capabilité et opération feuille vierges. Lors d'un redémarrage de worker, une paire worker/tentative neuve réhydrate une réservation Reset pour le worker actuel depuis le journal strict avant de reconstruire le plan. Les anciens tokens d'objet exact de réservation, de capabilité et de feuille sont absents des nouveaux registres bornés et ne peuvent être acceptés.

Le Reset, la mise sous barrière des échecs de démarrage, la dérive de commande/état/tentative/époque, la complétion de portée et le changement de révision d'autorité/barrière révoquent tout token en suspens. Une discordance de worker entraîne un rejet, et un nouveau worker ne possède pas l'ancien registre d'objets exacts. Un commit tardif n'effectue donc aucune écriture. L'épuisement du registre, une exception/réentrance/collision d'allocateur, le clonage/substitution de token ou un second mutex constitue une erreur typée fail-closed ; aucun ne bascule vers des baux ordinaires, des appels directs Chrome/IndexedDB ou une porte no-op en production.

## Contrat de quiescence (Quiescence contract)

`quiesced` exige l'ensemble de ces faits indépendants :

| Dépendance | Preuve requise                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| scan       | aucun bail de cycle de vie, minuteur de réessai, persistance de connecteur ou checkpoint de scan en mesure d'écrire       |
| tracking   | aucune Tx A/Tx B/Tx C active ; registre d'acteurs arrêté ; appelants en attente stabilisés comme réinitialisés/redémarrés |
| migration  | aucune transaction de montée de version/données/récupération active et porte de réessai annulée                           |
| outbox     | aucun travail d'expéditeur/bail/réseau ; la capabilité de la Tâche 5b reste désactivée                                    |

L'annulation ne constitue pas une preuve tant que l'écrivain sous-jacent ne s'est pas stabilisé. Un dépassement de délai (timeout) est `QUIESCENCE_FAILED`, conserve le journal et la barrière, et rapporte `reset:false`.

## Statechart

```text
idle -> preflightingCompletion
preflightingCompletion -- post-clear exact proof --> openingEpochAdmission (recognized)
preflightingCompletion -- fresh exact proof ------> journaling
journaling -- durable outcome unknown ------------> resolvingInitialJournal
journaling|resolvingInitialJournal -- exact durable journal --> acquiringFence
acquiringFence -- RESET_FENCE_AUTHORITY_ACQUIRED --> checkpointingFence
checkpointingFence
  -> quiescing
  -> checkpointingQuiescence
  -> closingDatabase
  -> deletingDatabase
  -> clearingSession
  -> clearingLocal
  -> reinitializing
  -> aligningSettings
  -> broadcastingReadiness
  -> writingReceipt
  -> checkpointingCommit
  -> broadcastingCommitted
  -> adoptingBackgroundHandoff
  -> clearingBackgroundHandoff
  -> clearingJournal
  -> openingEpochAdmission
  -> completed [RESET_EPOCH_ADMISSION_OPENED]

any journaled active state -- valid failure ----> checkpointingFailure
checkpointingFailure -- exact read-back --------> blocked|failed
checkpointingFailure -- checkpoint failure -----> failureCheckpointBlocked
blocked|failed -- RETRY -------------------------> checkpointingRetry
checkpointingRetry -- exact read-back [live fence] --> recovering
checkpointingRetry -- exact read-back [fence lost] --> reacquiringFence
checkpointingRetry -- checkpoint failure ---------> retryCheckpointBlocked
openingEpochAdmission -- open failure ------------> postClearAdmissionFailed
postClearAdmissionFailed -- RETRY -----------------> openingEpochAdmission

idle -- SERVICE_WORKER_RESTARTED(valid journal) --> reacquiringFence
reacquiringFence -- BOOT_FENCE_ACQUIRED ----------> routingRestart
routingRestart -- journaled + lastError null -----> checkpointingFence
routingRestart -- later phase + lastError null ---> recovering
routingRestart -- lastError BLOCKED --------------> blocked
routingRestart -- other lastError ----------------> failed
recovering -- journal.phase ----------------------> exact idempotent resume state
```

`completed` est terminal pour un acteur de reset. `blocked`, `failed`, les deux états de checkpoint bloqué et `postClearAdmissionFailed` sont non-terminaux. Seul `openingEpochAdmission` peut rouvrir l'admission, et uniquement après l'absence du journal plus la preuve exacte de reçu/DB/autorité.

### États et commandes Shell

| État                        | Effet Shell autorisé                                                                                                                                              | Événement de succès                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `preflightingCompletion`    | preuve d'autorité journal/reçu/époque canonique/DB6-data3 en lecture seule ; aucune écriture ni barrière                                                          | `RESET_PREFLIGHT_FRESH` \| `RESET_COMPLETION_RECOGNIZED` |
| `reacquiringFence`          | réhydrater la réservation du worker actuel avec une feuille d'autorité en lecture seule, puis acquérir la barrière active de boot/époque ; aucun effet de reprise | `BOOT_FENCE_ACQUIRED`                                    |
| `routingRestart`            | aucun ; routage pur selon la classification du journal analysé                                                                                                    | automatique                                              |
| `journaling`                | écrire le journal initial                                                                                                                                         | `RESET_JOURNALED`                                        |
| `resolvingInitialJournal`   | résolution totale du même A d'une issue d'écriture/relecture initiale inconnue                                                                                    | `RESET_JOURNAL_OUTCOME_RESOLVED`                         |
| `acquiringFence`            | acquisition d'autorité dédiée ; aucune écriture de capabilité Dataset                                                                                             | `RESET_FENCE_AUTHORITY_ACQUIRED`                         |
| `checkpointingFence`        | persister la phase exacte `fenced` après la preuve d'autorité active                                                                                              | `FENCE_CHECKPOINTED`                                     |
| `quiescing`                 | coordonner les quatre dépendances                                                                                                                                 | quatre événements `*_QUIESCED`                           |
| `checkpointingQuiescence`   | persister la phase `quiesced` plus la référence exacte au sidecar de handoff après son CAS/relecture                                                              | `QUIESCENCE_CHECKPOINTED`                                |
| `closingDatabase`           | fermer le registre central de handles, checkpoint                                                                                                                 | `DB_HANDLES_CLOSED`                                      |
| `deletingDatabase`          | supprimer la DB, checkpoint                                                                                                                                       | `DATABASE_DELETED`                                       |
| `clearingSession`           | vider la session, relire le sidecar local exact, checkpoint                                                                                                       | `SESSION_CLEARED`                                        |
| `clearingLocal`             | supprimer chaque clé hors de la liste blanche exacte journal+sidecar, relire les deux, checkpoint                                                                 | `LOCAL_CLEARED`                                          |
| `reinitializing`            | créer/vérifier l'exactitude de DB6/data3, l'autorité d'époque et l'enveloppe de génération zéro initiale ; checkpoint                                             | `DATABASE_REINITIALIZED`                                 |
| `aligningSettings`          | exécuter la récupération des Settings détenue par le reset ; preuve de checkpoint sous `settings_aligned`                                                         | `SETTINGS_ALIGNED`                                       |
| `broadcastingReadiness`     | émettre l'événement exact de non-succès `ready_to_commit`                                                                                                         | `RESET_READY_BROADCASTED`                                |
| `writingReceipt`            | écrire et relire strictement le reçu le plus récent exact sous barrière/porte de quota système                                                                    | `RESET_RECEIPT_WRITTEN`                                  |
| `checkpointingCommit`       | persister la phase `committed` après disponibilité plus relecture exacte du reçu                                                                                  | `RESET_COMMIT_CHECKPOINTED`                              |
| `broadcastingCommitted`     | émettre l'événement rejouable exact `committed` tant que le journal subsiste                                                                                      | `RESET_COMMITTED_BROADCASTED`                            |
| `adoptingBackgroundHandoff` | restaurer/adopter le sidecar référencé exact, le conserver et consigner le checkpoint `handoff_adopted`                                                           | `BACKGROUND_SCHEDULING_HANDOFF_ADOPTED`                  |
| `clearingBackgroundHandoff` | la lane d'origine ou de remplacement utilise le tuple durable de nettoyage exact, prouve l'absence et consigne `handoff_cleared`                                  | `BACKGROUND_SCHEDULING_HANDOFF_CLEARED`                  |
| `clearingJournal`           | supprimer le journal réservé, relecture stricte d'absence et conservation de la preuve exacte de suppression                                                      | `JOURNAL_CLEARED`                                        |
| `checkpointingFailure`      | persister/relire l'erreur en attente exacte avec phase/compteur de réessais inchangés                                                                             | `FAILURE_CHECKPOINTED`                                   |
| `failureCheckpointBlocked`  | aucun ; diagnostic volatile, journal inchangé ; réessai explicite uniquement                                                                                      | `RETRY_FAILURE_CHECKPOINT`                               |
| `checkpointingRetry`        | persister/relire la phase inchangée, le compteur de réessais incrémenté et l'erreur effacée                                                                       | `RETRY_CHECKPOINTED`                                     |
| `retryCheckpointBlocked`    | aucun ; diagnostic volatile, journal inchangé ; réessai explicite uniquement                                                                                      | `RETRY_RETRY_CHECKPOINT`                                 |
| `openingEpochAdmission`     | installer de manière idempotente l'époque suivante et ouvrir l'admission à partir de la preuve exacte de suppression/reconnaissance                               | `RESET_EPOCH_ADMISSION_OPENED`                           |
| `postClearAdmissionFailed`  | aucun ; diagnostic post-effacement volatile ; réessai explicite pour le même reset uniquement                                                                     | `RETRY`                                                  |

Chaque événement de succès n'est émis qu'après la complétion de son effet et du checkpoint requis. Les événements asynchrones incluent l'identité actuelle du reset lorsqu'ils franchissent une frontière externe ; les événements portant une identité/époque obsolète sont ignorés.

### Routage de récupération (Recovery routing)

| Dernière phase durable          | État de reprise                                  | Pourquoi la répétition est sûre                                                                          |
| ------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| pas de journal / erreur pré-vol | `preflightingCompletion` après réessai explicite | la preuve est relue ; aucun effet destructif n'a été admis                                               |
| `journaled`                     | `checkpointingFence`                             | le boot a déjà acquis la barrière active de ce worker                                                    |
| `fenced`                        | `quiescing`                                      | les opérations d'annulation/arrêt/attente sont idempotentes                                              |
| `quiesced`                      | `closingDatabase`                                | fermer un handle déjà fermé est un no-op                                                                 |
| `handles_closed`                | `deletingDatabase`                               | supprimer une DB inexistante réussit                                                                     |
| `database_deleted`              | `clearingSession`                                | vider la session de manière répétée réussit                                                              |
| `session_cleared`               | `clearingLocal`                                  | le journal est exclu ; supprimer des clés absentes réussit                                               |
| `local_cleared`                 | `reinitializing`                                 | une DB/époque vierge correspondante exacte est vérifiée en tant que no-op                                |
| `database_reinitialized`        | `aligningSettings`                               | la récupération partagée reprend son journal Settings durable                                            |
| `settings_aligned`              | `broadcastingReadiness`                          | la disponibilité et l'écriture/lecture du reçu peuvent se répéter sans danger                            |
| `committed`                     | `broadcastingCommitted`                          | l'événement exact committed peut se répéter avant l'effacement du journal                                |
| `handoff_adopted`               | `clearingBackgroundHandoff`                      | le reçu d'autorité délivre trois tokens de nettoyage au worker actuel ; ancien/copie invalides           |
| `handoff_cleared`               | `clearingJournal`                                | le checkpoint d'absence omet l'émission/suppression de tokens et reprend le journal de façon idempotente |

Pour `handoff_adopted`, la réhydratation rejette d'abord l'égalité entre l'époque du worker actuel et celle du worker source, puis valide la lane/worker source, le sidecar/handoff et le digest de manifest détenus par la référence. L'autorité renvoie un reçu de commande/résultat enregistré pour la lane de remplacement et le worker actuel, avec trois tokens vierges liés à ce reçu et aux bundles sources durables. La preuve de nettoyage sélectionne exactement une tentative correspondante. Une copie de DTO, un échange de manifest/sidecar, un autre worker ou un token d'un ancien worker est invalide. Pour `handoff_cleared`, le worker actuel doit toujours être frais, mais le checkpoint d'absence durable est suffisant : la récupération n'émet ni lane de remplacement ni suppression et s'oriente directement vers `clearingJournal`.
Le drapeau de contexte volatile `backgroundSchedulingCleanupReplacementRequired` est `false` sur le chemin d'adoption d'origine, devient `true` uniquement lorsqu'un nouveau worker restaure la phase durable `handoff_adopted`, et repasse à `false` à `handoff_cleared`. La garde de nettoyage le transmet au parseur strict : une preuve de la lane d'origine est par conséquent rejetée après redémarrage, tandis qu'un reçu/token de remplacement fabriqué est rejeté sur le chemin sans redémarrage. `LocalDataResetMachineInput.workerEpoch` est copié dans le contexte et le parseur de nettoyage exige à la fois qu'`executingWorkerEpoch` et l'époque de worker du reçu/token de remplacement soient exactement égaux à ce worker actuel ; nommer un worker neuf différent n'est pas suffisant.

Lors du redémarrage du worker, chaque phase stricte attend dans `reacquiringFence` ; ni la phase ni `SERVICE_WORKER_RESTARTED` ne prouve une barrière JavaScript active. La réhydratation doit d'abord renvoyer la réservation exacte du worker actuel pour le Reset A du journal ; un doublon renvoie ce même objet, tandis qu'un Reset B, un clone, un reçu étranger ou une autorité physique incompatible avec la phase n'effectue aucun changement d'état. `BOOT_FENCE_ACQUIRED` provenant d'un autre ID de reset est ignoré. Un échec de barrière entre dans `checkpointingFailure`, et seule une relecture exacte du checkpoint d'échec peut entrer dans `failed` ; l'échec du checkpoint reste en fail-closed avec le journal et la porte de refus externe au boot préservés. Chaque démarrage à froid tente toujours automatiquement cette acquisition de barrière de sécurité ; cette tentative ne peut que restaurer la barrière d'admission active et réorienter vers `failed`. Ce n'est pas une autorité de réessai et cela ne peut pas reprendre un effet de flux. Seul un `RETRY` explicite pour le même reset, une fois la barrière active, autorise la reprise de la phase durable du flux.

L'échec persisté porte `origin:'boot_fence_reacquisition'` ; c'est la seule raison pour laquelle `FENCE_FAILED/fence` peut coexister avec une phase dont la prochaine étape durable n'est pas `fence`. Son deuxième redémarrage s'oriente toujours à travers `reacquiringFence -> routingRestart -> failed`, jamais directement vers `recovering`.

Seul un journal avec `lastError:null` représente une tentative interrompue/crasheée et s'oriente automatiquement depuis la barrière de démarrage acquise vers `recovering`. `lastError.code === 'BLOCKED'` s'oriente vers `blocked` ; toute autre erreur réessayable ou non réessayable s'oriente vers `failed`. Aucun effet ne redémarre à partir de l'un ou l'autre de ces états avant un `RETRY` du même reset ; les erreurs non réessayables n'ont aucune transition de réessai.

Un redémarrage après un effacement de journal réussi n'a aucun journal à restaurer. L'admission reste fermée à moins qu'une preuve préalable exacte d'ouverture ne soit déjà canonique. Rejouer la requête d'origine exécute alors le même pré-vol en lecture seule ; l'époque suivante canonique plus le reçu terminal exact (le plus récent uniquement) et l'autorité DB6/data3 reconnaissent la frontière post-effacement même si des écritures E2 légitimes ont suivi le reset, puis `installResetEpochAndOpen` prouve/ouvre l'admission de façon idempotente. L'absence de journal seule ne reprend jamais la destruction, n'ouvre pas l'admission et ne prouve pas le succès.

## Contrat d'échec et de réessai (Failure and retry contract)

```ts
type LocalDataResetErrorCode =
  | 'PREFLIGHT_FAILED'
  | 'BLOCKED'
  | 'JOURNAL_CORRUPT'
  | 'JOURNAL_FAILED'
  | 'FENCE_FAILED'
  | 'QUIESCENCE_FAILED'
  | 'HANDLE_CLOSE_FAILED'
  | 'DATABASE_FAILED'
  | 'SESSION_CLEAR_FAILED'
  | 'LOCAL_CLEAR_FAILED'
  | 'REINITIALIZE_FAILED'
  | 'SETTINGS_ALIGNMENT_FAILED'
  | 'BROADCAST_FAILED'
  | 'RECEIPT_FAILED'
  | 'HANDOFF_ADOPTION_FAILED'
  | 'HANDOFF_CLEANUP_FAILED'
  | 'ADMISSION_OPEN_FAILED'
  | 'PROTOCOL_ERROR';
```

La matrice d'erreurs acceptée est exacte :

| Code                        | Étape                                     | Phase durable            | Origine                    | `retryable` |
| --------------------------- | ----------------------------------------- | ------------------------ | -------------------------- | ----------- |
| `PREFLIGHT_FAILED`          | `preflight`                               | aucune                   | `workflow_step`            | `true`      |
| `BLOCKED`                   | `handles` \| `database` \| `reinitialize` | inchangée                | `workflow_step`            | `true`      |
| `JOURNAL_CORRUPT`           | `journal`                                 | octets préservés         | `workflow_step`            | `false`     |
| `JOURNAL_FAILED`            | `journal` depuis tout checkpoint          | inchangée                | `workflow_step`            | `true`      |
| `FENCE_FAILED`              | `fence` en mise sous barrière normale     | inchangée                | `workflow_step`            | `true`      |
| `FENCE_FAILED`              | `fence` pour toute phase restaurée        | inchangée                | `boot_fence_reacquisition` | `true`      |
| `QUIESCENCE_FAILED`         | `quiescence`                              | `fenced`                 | `workflow_step`            | `true`      |
| `HANDLE_CLOSE_FAILED`       | `handles`                                 | `quiesced`               | `workflow_step`            | `true`      |
| `DATABASE_FAILED`           | `database`                                | `handles_closed`         | `workflow_step`            | `true`      |
| `SESSION_CLEAR_FAILED`      | `session`                                 | `database_deleted`       | `workflow_step`            | `true`      |
| `LOCAL_CLEAR_FAILED`        | `local`                                   | `session_cleared`        | `workflow_step`            | `true`      |
| `REINITIALIZE_FAILED`       | `reinitialize`                            | `local_cleared`          | `workflow_step`            | `true`      |
| `SETTINGS_ALIGNMENT_FAILED` | `settings_recovery`                       | `database_reinitialized` | `workflow_step`            | `true`      |
| `BROADCAST_FAILED`          | `readiness_broadcast`                     | `settings_aligned`       | `workflow_step`            | `true`      |
| `RECEIPT_FAILED`            | `receipt`                                 | `settings_aligned`       | `workflow_step`            | `true`      |
| `BROADCAST_FAILED`          | `postcommit_broadcast`                    | `committed`              | `workflow_step`            | `true`      |
| `HANDOFF_ADOPTION_FAILED`   | `handoff_adoption`                        | `committed`              | `workflow_step`            | `true`      |
| `HANDOFF_CLEANUP_FAILED`    | `handoff_cleanup`                         | `handoff_adopted`        | `workflow_step`            | `true`      |
| `ADMISSION_OPEN_FAILED`     | `post_clear_admission`                    | journal absent + reçu    | contexte uniquement        | `true`      |
| `PROTOCOL_ERROR`            | étape courante non liée au journal        | inchangée                | `workflow_step`            | `false`     |

La machine enregistre à la fois `expectedStep` et `expectedErrorOrigin` à l'entrée de chaque état actif. Un `STEP_FAILED` portant un mauvais ID de reset, une mauvaise paire code/étape/origine, une réessayabilité erronée, une clé d'erreur superflue, un message vide/surdimensionné ou un contrat non actuel est ignoré et ne peut commander de transition. `JOURNAL_FAILED` est l'unique erreur transversale aux étapes du flux car chaque état de checkpoint écrit dans le journal ; la machine enregistre cette capabilité séparément, si bien que `JOURNAL_FAILED` est rejetée dans les états hors checkpoint tels que `quiescing` et les diffusions. L'origine boot-fence n'est acceptée que pendant que `reacquiringFence` l'attend. Pour un journal valide, un `STEP_FAILED` accepté n'écrit jamais et n'entre jamais directement dans un état de présentation : il entre dans `checkpointingFailure`, et la relecture stricte du même journal est l'unique transition vers `blocked`/`failed`.

`PREFLIGHT_FAILED` et `PROTOCOL_ERROR/preflight` relèvent du contexte uniquement car aucun journal n'existe encore ; ni l'un ni l'autre ne peut être encodé dans un journal en douze phases. Ils conservent les identités de la requête dans le contexte de l'acteur pour la projection diagnostique et, uniquement pour l'échec physique réessayable, pour un réessai explicite.

`ADMISSION_OPEN_FAILED/post_clear_admission` relève également du contexte uniquement car le journal a déjà été strictement supprimé. Il conserve la preuve exacte de reçu/suppression/DB dans le contexte de l'acteur, maintient l'autorité fermée et n'autorise qu'un réessai explicite d'`installResetEpochAndOpen`. Il n'est jamais persisté par recréation du journal.

`RECEIPT_FAILED/receipt` et `PROTOCOL_ERROR/receipt` sont les seules erreurs supplémentaires cohérentes avec la phase durable `settings_aligned` : la disponibilité n'a pas de phase durable, de sorte qu'un réessai/redémarrage répète la disponibilité avant l'opération du reçu. Le premier couvre les échecs de quota borné/stockage/relecture et est réessayable ; un conflit de clé exacte ou de corrélation est non réessayable.

- `deleteDatabase.onblocked`, un handle non fermé ou une ouverture détenue par le reset bloquée par un autre contexte utilise `BLOCKED` et l'état `blocked`.
- Les erreurs de quota, de permission/API, de transaction, de validation et de checkpoint de journal utilisent le code spécifique exact de l'étape et l'état `failed`.
- `RETRY` est explicite. Avec un journal valide, il entre d'abord dans `checkpointingRetry` ; la relecture stricte d'une phase inchangée, de `retryCount + 1` et de `lastError:null` est requise avant la récupération. Il n'y a pas de boucle automatique de réessai destructif.
- Un échec d'effacement du journal conserve la phase `committed` ; un réessai explicite rediffuse d'abord le payload committed exact, puis réessaie l'effacement.
- Un échec de reçu conserve la phase `settings_aligned` ; un réessai explicite répète la disponibilité, puis le put/relecture. Un reçu correspondant est un no-op idempotent, tandis qu'un reçu existant différent échoue en fail-closed.
- Un redémarrage de worker avec tout `lastError` non nul réacquiert la barrière active puis attend dans `blocked`/`failed` ; le redémarrage lui-même ne constitue jamais une autorité de réessai.
- Tant qu'un journal valide existe, les deux états d'échec préservent la barrière. Ils peuvent renvoyer `reset:false`, la phase exacte, le code et `retryable`, jamais `reset:true`.
- Un échec physique de lecture de pré-vol est réessayable sous `PREFLIGHT_FAILED/preflight` ; il laisse l'admission normale intacte et un réessai explicite pour le même reset relit le pré-vol avec la même identité d'intention.
- Une preuve syntaxiquement valide qui entre en conflit avec les époques requises ou les invariants physiques terminaux est non réessayable sous `PROTOCOL_ERROR/preflight` ; les événements de preuve malformés ou discordants sont ignorés et ne basculent jamais vers une admission vierge par défaut.
- Une époque vierge invalide/discordante ou des stores de tracking vierges non vides sont des `PROTOCOL_ERROR` corrélées à l'étape, non réparables et fail-closed. Un journal invalide emprunte le chemin distinct `JOURNAL_CORRUPT/journal` ; ses octets sont conservés.

## Comportement multi-panneaux et ancienne époque (Multi-panel and old-epoch behavior)

Lorsque la barrière est acquise, les appels en attente détenus par le worker se stabilisent sans succès. Les deux diffusions d'époque transportent l'époque précédente nullable, la nouvelle époque et un ID de requête de bootstrap stable. Chaque panneau ouvert doit :

1. abandonner la propriété des effets en attente, les tokens d'annulation (Undo) et les chargements préparés pour l'ancienne époque ;
2. désactiver les mutations de tracking/scan/settings tant que le statut de reset est en attente ;
3. lors de la disponibilité, conserver le payload complet en attente avec `command:null` et n'émettre aucun Load ;
4. sur le payload committed exact, émettre un unique Load rallié et corrélé ;
5. n'accepter les données que lorsque le worker ne rapporte aucun journal de reset, l'époque nouvelle exacte, l'enveloppe Settings stabilisée et la preuve d'alarme correspondante.

Chaque requête, réponse, événement d'acteur ou diffusion tardif issu de l'ancienne époque est rejeté ou ignoré. Il ne peut rouvrir un tombstone, recréer une ligne de tracking, restaurer un ancien état d'UI ou produire un toast de succès. Les règles de révision égale ne traversent jamais les époques.

Cette règle est globale. Chaque message de pont (bridge) mutatif post-bascule transporte le `dataEpoch` de bootstrap ; les écritures v1 de tracking/settings/profil/scan qui ne peuvent le porter échouent en fail-closed. Les opérations internes portent un bail révocable lié à l'époque et à l'identifiant d'opération. En particulier :

- une sauvegarde ancienne de settings avec révision/génération de base 0 ne peut correspondre à la nouvelle `SettingsEnvelopeV2(nextEpoch, revision 0, generation >= 0, journal:null, outcomes:[])` sans l'époque et la génération exactes ;
- un terminal ou checkpoint de scan ancien ne peut recréer l'état de session ou persister des missions après le reset ;
- d'anciens callbacks de profil/import ne peuvent repeupler le store de profil vierge ;
- d'anciens callbacks de sémantique/TJM/cache/vu/favori ne peuvent recréer les clés locales effacées ;
- aucun coordinateur ne peut obtenir `nextDataEpoch` pour une opération initialement admise sous l'époque précédente ou inconnue.

La nouvelle autorité d'époque n'ouvre les baux normaux qu'après la suppression du journal ; le Load/bootstrap rallié et corrélé peut alors s'exécuter auprès de cette autorité. `previousDataEpoch:null` révoque toujours tous les baux globalement ; cela n'affaiblit jamais la comparaison sous prétexte qu'"inconnu signifierait autorisé".

## Invariants

1. Chaque nouvelle requête valide exécute un pré-vol en lecture seule avant la création du journal.
2. Une admission vierge exige `canonicalDataEpoch === previousDataEpoch` et `nextDataEpoch !== canonicalDataEpoch` ; aucune autre preuve n'entre dans le journaling.
3. La reconnaissance post-effacement exige l'absence de journal, `canonicalDataEpoch === nextDataEpoch`, une époque précédente différente, le reçu terminal exact de la requête initiale et la preuve de l'autorité DB6/data3 actuelle.
4. La reconnaissance n'écrit aucun journal, n'acquiert aucune barrière et ne répète aucun effet destructif ; `completionDisposition` la distingue d'une exécution normale, mais les deux chemins requièrent toujours la preuve exacte d'ouverture de l'admission avant complétion.
5. Le reçu le plus récent est écrit/lu sous la barrière active après la preuve exacte des Settings/alarme et la disponibilité, mais avant le checkpoint committed du journal ; l'absence de journal combinée au reçu correspondant prouve donc le résultat antérieur même après d'ultérieures écritures E2.
6. La destruction ne peut commencer avant que le journal durable n'existe.
7. Un seul ID de reset possède la barrière globale d'admission d'époque et une unique époque suivante.
8. Aucune nouvelle écriture de scan, tracking, migration, outbox ou settings ne commence tant que la barrière est détenue.
9. `quiesced` signifie l'obtention des quatre preuves de dépendance, et non de simples requêtes d'annulation.
10. Chaque handle DB connu est fermé avant suppression ; aucun ouvrant étranger au reset n'entre en concurrence avec lui.
11. Une suppression bloquée préserve l'ancienne phase, le journal et la barrière.
12. La session est effacée avant le stockage local ; l'effacement local préserve exactement le journal de reset et le sidecar de passation en arrière-plan, et supprime le reçu précédent.
13. Les métadonnées DB vierges et l'`SettingsEnvelopeV2` partagée initiale utilisent l'époque suivante du journal ; les tables de tracking sont vides, la révision et la génération de Settings sont toutes deux à 0, `journal` est null et `outcomes` est vide.
14. `APP_DATA_VERSION = 3` et l'autorité d'époque vierge sont persistées/vérifiées avant l'alignement des Settings, tandis que l'admission normale reste fermée.
15. La phase `settings_aligned` implique les valeurs par défaut exactes, l'enveloppe partagée stabilisée et la preuve exacte de l'alarme auto-scan pour l'époque suivante ; aucun panneau n'est requis.
16. La disponibilité est uniquement une invalidation pré-commit et n'émet aucun Load.
17. La phase `committed` implique l'alignement des Settings, la disponibilité exacte acceptée et la relecture stricte du reçu terminal sous la réserve bornée de quota système ; aucun événement committed n'est émis avant ce checkpoint.
18. Sur le chemin d'exécution, le journal subsiste jusqu'à ce que l'événement committed exact, l'adoption du sidecar, la relecture d'absence du sidecar et le checkpoint `handoff_cleared` soient acceptés ; la suppression produit une preuve de récupération durable, puis une opération d'autorité idempotente distincte doit installer/ouvrir l'époque suivante avant `completed`, tandis que le reçu borné subsiste pour le rejeu.
19. Un Load corrélé voyant le même journal `committed` se rallie à la finalisation et ne retourne jamais `SETTINGS_RESET_IN_PROGRESS` pour ce journal.
20. `reset:true` implique la base de données supprimée, la session et le stockage local effacés, DB6/data3 réinitialisée, la preuve exacte des Settings/alarme, la disponibilité, le reçu terminal, le checkpoint committed, la diffusion committed, la suppression du journal et la preuve exacte d'ouverture de l'admission à l'époque suivante, soit exécutée à présent, soit prouvée par le chemin strict de reconnaissance post-effacement.
21. Toute issue partielle ou bloquée implique `reset:false` et n'est réessayable que selon ce que déclare son erreur.
22. Le réessai et le redémarrage du worker conservent tous les identifiants/époques et ne ressuscitent jamais d'anciennes données.
23. Aucun LLM ne décide de l'admission, de la phase, de la suppression, du réessai ou du succès.
24. Chaque message mutatif transporte l'époque de bootstrap ; chaque écrivain interne revalide son bail révocable à l'intérieur de la porte de commit.
25. Reset révoque chaque ancien bail avant la quiescence et n'ouvre l'admission de la nouvelle époque qu'après la suppression stricte du journal complétée par la preuve reçu/DB/autorité.
26. Une phase durable restaurée a toujours `fenceAcquired:false` jusqu'au `BOOT_FENCE_ACQUIRED` corrélé ; avant cet événement, une réhydratation FIFO stricte a créé une réservation de remplacement pour le worker actuel et `acquireResetFence` l'a consommée.
27. Chaque écriture sur le Dataset lors du Reset dans le mapping fermé possède une capabilité vierge ; elle possède également un token feuille correspondant exact de la table fermée des adaptateurs, et aucune capabilité/feuille ne couvre un état entier, un port ou un effet multi-écritures.
28. Les revendications de Reset, la délivrance/commit/complétion de capabilités, les commits ordinaires, la barrière de reset et l'installation d'époque partagent l'unique FIFO de l'autorité.
29. Chaque capabilité est consommée avant l'appel/attente (await) de l'adaptateur enregistré et ne peut jamais être rejouée après rejet, complétion ou redémarrage.
30. Les capabilités de nettoyage de Reset lient l'époque précédente nullable exacte `previousDataEpoch` ; les capabilités de reconstruction et terminales lient l'époque suivante exacte `nextDataEpoch`.
31. La réinitialisation utilise quatre capabilités ordonnées : transaction DB6, écriture/relecture complète de `SettingsEnvelopeV2` génération zéro, écriture/relecture du marqueur 3 et checkpoint `database_reinitialized`.
32. Un événement de succès d'état ou `STEP_FAILED` n'est pas envoyé tant que la portée de cet état reste active ; la complétion/révocation précède l'événement.
33. La barrière de reset/d'échec et la dérive de commande/état/tentative/époque/révision font que chaque commit tardif perdant n'exécute aucun effet durable ; un nouveau worker ne possède pas l'ancien registre d'objets exacts.
34. Les registres de capabilités sont bornés sans éviction, et aucune erreur d'épuisement, d'allocateur ou de validation ne permet de basculer vers un mode dégradé (baux ordinaires/appels directs/porte no-op).
35. Le pré-vol vierge/reconnaissance est le seul ouvrant IDB avant version : DB absente implique pas d'ouverture, DB présente n'utilise aucune version cible et des transactions en lecture seule, `onupgradeneeded` abandonne, et toutes les issues prouvent la fermeture du handle temporaire.
36. La restauration du journal ne clone jamais une ancienne réservation. La relecture compatible avec la phase et la création du remplaçant `reset_pending` forment une seule opération FIFO liée au worker actuel ; le Reset B et chaque troisième époque/reçu étranger échouent sans mutation d'autorité.
37. Les adaptateurs durables/de lecture sont un mapping fermé défini à la compilation avec des tokens exacts de données pures, sans import d'autorité/contrôleur/Settings publiques. Les appels externes de barrière de Reset ou d'échec restent empilables dans la file pendant qu'une Promise d'adaptateur est en cours.
38. `reset_pending` possède un statut de journal total. `outcome_unknown` n'autorise que la résolution pour le même A ; le Reset B et l'acquisition de barrière sont rejetés.
39. Les chemins vierge et restauré de la phase `journaled` acquièrent une seule barrière active par worker : l'acquisition au boot s'oriente directement vers `checkpointingFence`, jamais à nouveau par `acquiringFence`.
40. Chaque mutation durable de `lastError`/`retryCount` utilise la capabilité exacte d'échec/réessai et la relecture stricte du journal. L'échec de checkpoint ne peut pas entrer en récursion ni reprendre un effet.
41. La suppression du journal ne termine jamais le Reset. Un échec d'ouverture de l'admission préserve la preuve reçu/suppression/DB, maintient l'admission fermée et ne réessaie que l'opération d'autorité idempotente.
42. La seule clé de payload de handoff est `missionpulse.backgroundSchedulingHandoff.v1` ; le journal de reset ne porte que sa référence exacte id/digest et jamais le payload.
43. Le handoff se ferme de façon irréversible à une séquence de boîte aux lettres avant le checkpoint. Les rappels antérieurs sont dans la cible à 131 slots ; les rappels postérieurs reçoivent `RESET_HANDOFF_CLOSED`, n'allouent aucun ID, n'écrivent rien et ne peuvent rendre obsolète la référence du journal. La création interne de points de contrôle ne peut consommer que les entrées préallouées exactes requises pour matérialiser cette cible gelée.
44. Un échec de CAS/capacité/relecture avant l'effacement de session n'efface rien. Après l'effacement de session, le sidecar survit au redémarrage et à l'effacement local exact.
45. L'adoption conserve le sidecar. Seule une capabilité de nettoyage distincte combinée à une relecture stricte d'absence et un checkpoint de journal permet la suppression du journal.
46. Un pré-vol vierge ou de reconnaissance exige l'absence du journal de reset et du sidecar de handoff ; des octets de sidecar orphelins échouent en fail-closed.
47. La lane préalloue un `sidecarId` distinct et vierge avant le travail ordinaire ; l'ensemble des 1 584 bundles CAS, trois bundles de nettoyage, capabilités, sidecar, payload et référence portent cette identité exacte.
48. Le parseur fermé de payload recalcule les SHA-256 du payload/écrivain/journal, vérifie la cible gelée durable/préfixe de curseur et dérive le bitmap/décompte depuis ses 131 slots denses. Le non-JSON, la corruption, l'interversion ou la dérive des champs externes échoue en fail-closed.
49. Les octets canoniques du payload sont bornés indépendamment à 786 432 ; les octets du sidecar canonique complet sont recalculés, bornés à 1 048 576 et répétés comme `reference.sidecarEncodedBytes`.
50. `BACKGROUND_SCHEDULING_HANDOFF_CHECKPOINTED` gèle la lane, la tentative, le worker, le sidecar, le handoff, le manifest 1 584+3 et le digest de la cible gelée. Les 1 587 digests de bundle et les deux digests agrégés sont recalculés ; l'attente de barrière de confiance rejette même une lane étrangère cohérente en interne pour le même reset et la même époque.
51. L'initialisation du sidecar stocke durablement la cible/digest/curseur à la révision 0. Chaque slot présent matérialisé s'incrémente d'une unité, si bien que la révision, le popcount du bitmap et le nombre de slots sont identiques pour chaque sidecar accepté de 0 à 131 slots.
52. La référence du journal conserve les trois entrées de nettoyage exactes. Un worker de remplacement utilise un reçu de commande/résultat délivré par l'autorité et trois tokens liés au worker ; les anciens objets, DTO copiés et reçus de workers étrangers sont invalides.
53. La récupération depuis `handoff_adopted` effectue le nettoyage de remplacement et le checkpoint d'absence de manière idempotente ; la récupération depuis `handoff_cleared` n'émet aucune suppression ni token et procède directement à la suppression du journal.

## Transitions interdites (Forbidden transitions)

- `idle -> journaling` sans pré-vol vierge exact.
- traiter `reset_pending + outcome_unknown` comme absent, durable, échoué ou disponible pour Reset B ; acquérir la barrière avant `durable_proven`.
- traiter un pré-vol malformé ou en conflit, une époque canonique différente, un reçu manquant ou discordant, une autorité DB6/data3 divergente ou une clé superflue comme une admission vierge ou une complétion reconnue ; les données actuelles d'E2 ne constituent pas une preuve contre un reçu antérieur correspondant.
- une complétion reconnue effectuant journalisation, mise sous barrière, fermeture, suppression ou effacement.
- `idle -> deletingDatabase` ou tout état destructif sans journalisation/barrière.
- acquisition de barrière -> fermeture de DB avant toutes les preuves de quiescence.
- succès de suppression déduit de `onblocked`, d'un timeout, de l'envoi de la requête ou de l'absence d'une erreur immédiate.
- effacer le journal via un `chrome.storage.local.clear()` global.
- effacement local avec tout ensemble de clés préservées autre que le tuple exact journal de reset + sidecar de handoff, ou traiter un sidecar orphelin/discordant comme absent.
- effacement de session avant le CAS/relecture/checkpoint de référence exact du sidecar, ou après un échec de capacité/écriture CAS.
- allouer un ID ou écrire le sidecar pour un slot déjà présent, dépasser trois bundles CAS pour une transition, ou utiliser une capabilité non autorisée.
- accepter un checkpoint tant que le handoff est encore ouvert, muter la cible gelée ou admettre un slot externe après son marqueur de fermeture de boîte aux lettres, consommer un bundle interne pour un slot hors cible, ignorer silencieusement un callback tardif, ou ré-enregistrer un checkpoint d'une référence différente après `quiesced`.
- allouer `sidecarId` à la première écriture, l'omettre d'une capabilité CAS/cleanup, ou intervertir une identité de lane/bundle/sidecar/référence.
- faire confiance au texte sérialisé, au digest/bitmap/décompte/longueur d'octets fourni par l'appelant, ou accepter un contenu de payload non-JSON/creux/personnalisé sans re-parsing canonique.
- générer une nouvelle époque suivante pendant le réessai/récupération.
- réinitialisation no-op lorsque l'époque des métadonnées diffère ou que les tables de tracking ne sont pas vides.
- accepter `DATABASE_REINITIALIZED` sans la génération 0 initiale exacte des Settings.
- disponibilité avant la preuve Settings/alarme détenue par le reset, ou disponibilité déclenchant un Load.
- écriture du reçu terminal avant l'acceptation exacte de la disponibilité, en dehors de la porte globale/réserve de quota système, ou sans relecture stricte.
- enregistrer le checkpoint `committed` avant la relecture du reçu terminal correspondant.
- diffusion committed avant la phase durable `committed`.
- effacement du journal avant l'acceptation de la diffusion committed exacte.
- suppression du sidecar avant l'adoption exacte, suppression sans la capabilité de nettoyage exacte d'origine ou sans un tuple de remplacement entièrement prouvé/relecture d'absence, réutilisation de token d'un ancien worker, ou effacement du journal avant `handoff_cleared`.
- terminer ou renvoyer `reset:true` après la suppression du journal mais avant le `RESET_EPOCH_ADMISSION_OPENED` exact ; répéter la destruction après un échec d'ouverture post-effacement.
- supprimer le dernier reçu après le succès au lieu de le conserver jusqu'à l'effacement local sélectif du reset suivant.
- renvoyer `SETTINGS_RESET_IN_PROGRESS` au Load corrélé du même reset dans la phase `committed` au lieu de rallier la finalisation.
- rouvrir l'admission depuis `blocked` ou `failed` tant que le journal existe.
- router une phase restaurée ou émettre un effet de reprise avant `BOOT_FENCE_ACQUIRED` pour le même ID de reset.
- router la phase restaurée `journaled` à nouveau par `acquiringFence` après que l'opération de boot a déjà acquis la barrière active du worker actuel.
- réacquérir une barrière restaurée depuis une réservation clonée ou d'un worker mort, ou directement depuis les champs du journal sans réhydratation FIFO stricte dans une réservation d'objet exact du worker actuel.
- réessayer automatiquement un `lastError` persistant non nul au réveil du worker.
- entrer dans `blocked`/`failed` avant la relecture exacte du checkpoint d'échec, ou reprendre après `RETRY` avant la relecture exacte du checkpoint de réessai ; écrire une erreur récursive lorsque l'un ou l'autre checkpoint échoue.
- persister l'échec de réacquisition de boot comme une erreur d'étape de phase sans la mention exacte `origin:'boot_fence_reacquisition'`, ou accepter cette origine pour toute erreur autre que `FENCE_FAILED/fence` réessayable.
- réponse de succès ou `reset:true` sur le chemin d'exécution avant `JOURNAL_CLEARED`, ou sur le chemin de reconnaissance sans reçu exact sans journal plus preuve canonique de l'autorité DB6/data3.
- acceptation de l'une ou l'autre diffusion sans écho strict de l'étape/version/resetId/époques précédente+suivante/requête de bootstrap, ou traiter un véritable rejet d'API comme no-receiver.
- événement d'une ancienne époque modifiant l'état de la nouvelle époque.
- rafraîchir une ancienne opération avec une nouvelle époque/bail au lieu de la rejeter.
- coordinateur de reset appelant un écrivain direct de tracking ou un chemin distant de tableau de bord.
- une capabilité de Reset réutilisée pour deux écritures, une capabilité de Reset à l'échelle du port, ou une capabilité d'effet physique réutilisée pour son checkpoint de journal.
- marqueur 3 avant relecture stricte de Settings V2 génération zéro, ou partage d'un token entre l'une des quatre frontières de réinitialisation.
- bail ordinaire, écrivain Chrome/IDB direct, second mutex ou porte no-op en production utilisé parce qu'une capabilité de pré-admission est manquante/rejetée.
- callback durable/pré-vol asynchrone fourni par l'appelant, injection d'adaptateur au runtime, import/référence d'adaptateur vers l'autorité/contrôleur/Settings publiques, ou traiter un appelant FIFO externe comme une réentrance d'adaptateur.
- pré-vol ouvrant une DB absente, fournissant une version cible, acceptant `onupgradeneeded`, utilisant une transaction readwrite, laissant fuiter son handle temporaire ou se stabilisant avant la preuve de fermeture/désenregistrement.
- transition d'état/commande publiée avant que sa portée active ne soit complétée ou révoquée.
- `STEP_FAILED` malformé ou sur une mauvaise étape modifiant l'état.
- redéfinir ou affaiblir `LocalDataResetEpochEventV1` dans Reset, Settings ou un adaptateur au lieu d'utiliser le parseur partagé neutre ; la preuve de barrière spécifique à Settings ne doit pas être insérée dans le payload neutre.

## Vérification RED requise avant implémentation

- séquence d'états nominale exacte et chaque paire événement/état interdite ;
- une requête malformée est ignorée sans journal ni barrière ;
- chaque requête valide entre dans `preflightingCompletion` ; une preuve vierge exacte est l'unique chemin vers `journaling`, tandis qu'une preuve post-effacement exacte atteint `openingEpochAdmission` reconnue sans journal, sans barrière et sans commande destructive ;
- la reconnaissance post-effacement rejette une époque canonique étrangère, une mauvaise autorité DB/données/schéma, un reçu manquant/discordant/non le plus récent, un mauvais requestedAt/ID/époque/phase, une clé manquante/superflue et un UUID non canonique/en collision ; elle reconnaît toujours après des écritures valides de missions/settings/alarme de même époque ;
- le pré-vol vierge rejette `canonicalDataEpoch !== previousDataEpoch` et `nextDataEpoch === canonicalDataEpoch` ; un échec de lecture physique est réessayable sous `PREFLIGHT_FAILED/preflight`, tandis qu'un conflit de protocole est non réessayable et aucun des deux chemins n'écrit de journal ;
- le pré-vol sur DB absente n'effectue aucun `indexedDB.open` ; le pré-vol sur DB présente n'utilise aucune version cible et des transactions en lecture seule, abandonne lors de `onupgradeneeded`, et prouve la fermeture/désenregistrement du handle en cas de succès, de blocage, de versionchange, d'échec d'analyse et de stockage avec zéro écriture de schéma/migration/marqueur ;
- la matrice différentielle réseau partagée accepte `ready_to_commit` et `committed` exacts, y compris l'époque précédente nullable, et rejette de façon identique les UUID en majuscules, les collisions reset/next/bootstrap/previous, une mauvaise étape, une clé manquante et une clé superflue provenant des consommateurs Reset comme Settings ;
- les objets réseau/preuve hostiles comportant un prototype personnalisé/hérité, un accesseur, un Symbol, une clé requise/superflue non énumérable ou un Proxy levant une exception échouent en fail-closed ; un accesseur rejeté n'est jamais invoqué, tandis que les enregistrements de données exacts gelés et à prototype null restent valides ;
- un échec d'écriture de journal n'effectue aucune destruction ;
- l'adaptateur de journal initial renvoie une durabilité exacte, une absence exacte et une issue inconnue : seule la durabilité procède vers la barrière, l'absence réessaie A avec des identifiants neufs, l'inconnu reste en résolution pour le même A, et B est rejeté dans tous les cas ;
- chaque paire code/étape/réessayabilité acceptée transitionne comme spécifié et chaque erreur malformée/sur un mauvais état est ignorée ;
- pour `reset_pending` et `reset_owned`, chaque échec accepté entre d'abord dans `checkpointingFailure` ; la relecture exacte seule expose `blocked`/`failed`. L'échec de ce checkpoint n'écrit rien de façon récursive. Chaque réessai explicite attend de même la relecture exacte de `retryCount + 1`/`lastError:null` ;
- la quiescence de scan/tracking/migration/outbox doit être entièrement prouvée ;
- la cinquième preuve de quiescence est la relecture exacte du sidecar/référence ; quatre preuves de dépendances seules restent dans `quiescing` et ne peuvent pas effacer la session ;
- le parseur exact de sidecar accepte les slots canoniques 0/1/131 et rejette toute clé/schéma étranger, le non-JSON, la dérive de digest payload/écrivain/journal, la dérive bitmap/décompte/taille de payload/taille complète du sidecar, les interversions, les champs inconnus et le payload/sidecar surdimensionné ;
- la provenance exacte du checkpoint transporte la lane, la tentative, le worker source, le sidecar/handoff, le manifest ordonné 1 584+3 et le digest de la cible gelée ; chaque bundle et les deux digests agrégés sont recalculés, et un échange de provenance entre lanes distinctes pour le même reset et la même époque est rejeté ;
- initialiser puis remplir l'ensemble des 131 slots avec au plus trois bundles vierges par transition ; persister le curseur CAS complet exact avant consommation et son successeur après un échec définitif, crasher après `0:37:0`, et prouver que le bundle suivant restauré est exactement `0:37:1` sans réutilisation ni saut ; les révisions sont exactement 0/1/131 pour 0/1/131 slots présents ; les rappels répétés pour un slot présent consomment zéro ID/écriture ; un échec de capacité ou au douzième CAS maintient Reset avant l'effacement avec session/local intacts ;
- course critique à la fermeture de la boîte aux lettres dans les deux ordres : le rappel précédent est dans le digest gelé, le rappel suivant reçoit `RESET_HANDOFF_CLOSED` exact avec zéro allocation ; la création interne de checkpoints ne peut consommer que les entrées préallouées pour la cible gelée, et aucun chemin ne peut muter la référence après `quiesced` ;
- la lane alloue un identifiant de sidecar unique avant l'admission du travail ; chaque bundle/preuve de CAS et de nettoyage le porte, et tout identifiant substitué ou alloué à la première écriture échoue ;
- une suppression de DB bloquée conserve le journal, la barrière et `reset:false`, puis un réessai explicite reprend à la suppression ;
- un crash après chaque phase durable reprend à l'état exact de la table ;
- crasher indépendamment dans `handoff_adopted` avant les tentatives de nettoyage 0, 1 et 2 : une lane/worker neuf réémet le tuple durable exact à trois entrées, chaque token d'ancien worker et toute substitution de tuple/manifest/sidecar est rejeté, et l'état exact supprimé/déjà-absent procède à travers `handoff_cleared` jusqu'à l'effacement du journal ; un crash dans `handoff_cleared` n'effectue aucune autre émission de token ou suppression ;
- chaque phase restaurée reste dans `reacquiringFence` jusqu'au `BOOT_FENCE_ACQUIRED` correspondant ; réhydrater d'abord une nouvelle réservation d'objet exact pour A sur le worker actuel, prouver l'identité exacte de doublon, rejeter B/clone/ancien worker/troisième époque/reçu étranger et tout fait physique incompatible avec la phase, puis acquérir la barrière active ; l'échec ne produit aucun effet de reprise ;
- la phase `journaled` restaurée observe exactement une acquisition de barrière du worker actuel et s'oriente depuis `BOOT_FENCE_ACQUIRED` directement vers `checkpointingFence` ;
- pour chacune des douze phases, un échec de barrière de boot persiste avec son origine explicite, se re-parse strictement, survit à un second redémarrage comme `failed`, ignore un ID de reset étranger et ne permet que la réacquisition automatique de barrière de sécurité avant un `RETRY` du même reset ; aucun effet de flux durable ne reprend avant ce réessai ;
- un redémarrage avec `lastError:null` reprend après la barrière de boot ; un redémarrage avec chaque famille réessayable attend dans `failed`, `BLOCKED` attend dans `blocked`, et aucun effet ne redémarre avant le `RETRY` corrélé ; une erreur non réessayable n'a aucune transition de réessai ;
- un redémarrage avec une erreur de journal non réessayable reste sous barrière/en échec, tandis qu'une discordance phase/erreur est classifiée comme un journal corrompu ;
- un crash après l'effacement local mais avant la réinitialisation préserve le journal et l'époque ;
- un crash après l'effacement de session et après l'effacement local restaure le même sidecar par id/digest ; la liste blanche locale exacte ne préserve que journal de reset + sidecar ;
- le réessai de réinitialisation accepte une DB vide correspondante exacte et rejette une mauvaise époque ou des tables de tracking non vides ;
- les paramètres hérités, manquants/nouvelle installation et de reset produisent tous l'`SettingsEnvelopeV2` partagée exacte ; le réessai est un no-op uniquement pour son époque canonique, tandis qu'un journal malformé, un registre d'outcomes malformé ou une mauvaise époque échoue en fail-closed ;
- les échos d'UUID/époque-précédente-nullable de disponibilité et de commit sont acceptés uniquement avec l'étape/version/reset/époques/ID de bootstrap exacts ; des champs erronés/superflus ne peuvent consigner le checkpoint de commit ou effacer le journal ;
- les issues livrées et normalisées sans destinataire (no-receiver) font progresser chaque diffusion ; un véritable échec d'API reste en échec et réessayable à son étape distincte ;
- le checkpoint de commit est ignoré avant l'écriture/relecture exacte du reçu ; un échec de quota/API du reçu est réessayable sous `RECEIPT_FAILED/receipt`, un reçu existant différent est un échec de protocole non réessayable, et une réécriture correspondante est idempotente ;
- un crash après le reçu mais avant le checkpoint restaure la phase `settings_aligned`, répète la disponibilité et l'opération exacte du reçu, puis enregistre le checkpoint une seule fois ;
- un échec de suppression du journal maintient la phase `committed` ; un réessai rediffuse le payload committed exact avant l'adoption ;
- une discordance d'adoption/échec de relecture laisse le sidecar présent et la phase de journal committed ; l'adoption exacte consigne le checkpoint `handoff_adopted` mais préserve toujours la clé ; un échec de nettoyage la conserve ; seule la relecture d'absence consigne le checkpoint `handoff_cleared` et autorise la suppression du journal ;
- échouer et crasher après la suppression stricte du journal mais avant la preuve d'ouverture de l'admission : l'autorité reste fermée, aucune réponse de succès n'est émise, et le réessai/reconnaissance à froid s'ouvre de manière idempotente à partir de la preuve reçu/suppression/DB sans répéter aucun effet destructif ;
- seul l'état completed renvoie `reset:true` et l'époque suivante ;
- deux panneaux abandonnent les anciens effets et convergent via un bootstrap de pont frais ;
- les messages tardifs d'une ancienne époque et les événements de reset obsolètes n'effectuent aucune écriture ;
- l'ancien tracking v1/v2, la sauvegarde de settings avec révision de base 0, le terminal/checkpoint de scan, le callback de profil et l'écrivain de cache effectuent tous zéro écriture post-reset ;
- la révocation de bail entre le calcul et le commit fait échouer la revalidation finale dans la porte et n'effectue aucune écriture durable ;
- un bail ordinaire avant admission est rejeté, tandis qu'une revendication exacte du même reset et la capabilité d'écriture/token feuille suivante exacts ne sont admis que dans l'état modélisé ;
- substituer indépendamment revendication/reset/étape/commande/tentative/worker/époque nullable, révision d'autorité/barrière, ID d'écriture, ID de capabilité, ID d'opération feuille ou ID d'adaptateur et affirmer qu'aucun adaptateur n'est invoqué ;
- chaque état de Reset à deux écritures reçoit deux capabilités distinctes one-shot ; une double consommation, une réutilisation entre écritures/entre états, une complétion avant commit et un rejeu de feuille d'un ancien worker effectuent tous zéro écriture ;
- exécuter commit/Reset et commit/barrière-d'échec dans les deux ordres FIFO ; seule l'opération précédant la barrière peut entrer dans son adaptateur durable ; mettre en file d'attente un Reset externe pendant une Promise d'adaptateur en attente et prouver qu'il attend derrière l'effet sans `AUTHORITY_REENTRANCY_FORBIDDEN` ni interblocage ;
- réentrance d'allocateur dans la même écriture, une autre écriture, la complétion, le Reset et la barrière d'échec ; exception d'allocateur/UUID invalide/collision ; épuisement exact du registre borné sans éviction ni fallback ;
- crash après transaction DB6, relecture des Settings V2 génération zéro, relecture du marqueur 3 et checkpoint de réinitialisation ; récupérer avec des ID de capabilités neufs et sans admission anticipée ;
- les contrats exhaustifs de phase/erreur acceptent `JOURNAL_FAILED` transverse, acceptent `RECEIPT_FAILED/receipt` et `PROTOCOL_ERROR/receipt` exacts uniquement à `settings_aligned`, n'acceptent autrement `PROTOCOL_ERROR` qu'à l'étape courante non liée au journal attendue, et rejettent `PROTOCOL_ERROR/journal` ;
- les parseurs/matrices de contrats purs peuvent être testés sans instancier XState, tandis que la machine ne contient que l'orchestration ;
- les vérifications d'architecture statique prouvent que la machine n'a aucune E/S et que tous les écrivains respectent la barrière d'admission du reset.

### Traces multi-modèles R1-R5

- **R1 — pas de panneau, alarme absente :** initialiser la génération 0 exacte avec les valeurs par défaut (`autoScan=true`, période 30) ; prouver que ni la disponibilité ni le commit ne sont acceptés avant que la récupération détenue par le reset n'installe/exécute/efface le journal Settings du système et n'enregistre le checkpoint `settings_aligned` ; accepter les deux diffusions comme `no_receiver` ; écrire/lire le reçu exact avant le checkpoint de commit ; effacer le journal de reset ; affirmer que l'alarme et le reçu exacts précèdent `committed`, l'admission et `reset:true`.
- **R2 — panneau ouvert lors de la disponibilité :** `ready_to_commit(E1,E2)` produit `resetPending`, `command:null`, zéro Load/mutation ; les résultats tardifs de Load/Save E1 sont ignorés et aucun `SETTINGS_RESET_IN_PROGRESS` synthétique n'est créé.
- **R3 — committed pendant que le journal existe :** écrire/lire le reçu exact, enregistrer le checkpoint `committed`, accepter l'événement exact, émettre un Load corrélé, rallier le finaliseur, effacer le journal/ouvrir E2, puis renvoyer le snapshot E2 stabilisé ; un committed dupliqué n'émet aucune seconde commande.
- **R4 — matrice crash/réessai :** crash après l'installation du journal système, l'effet d'alarme, la preuve d'alarme, la disponibilité, l'écriture/lecture du reçu, le checkpoint de commit, la diffusion committed, et l'effacement du journal avant réponse. Un crash après le reçu mais avant le checkpoint reprend depuis `settings_aligned` et répète de façon idempotente la disponibilité plus le reçu. Chaque route avec journal présent conserve tous les identifiants, réacquiert la barrière active, reprend depuis la phase durable et n'ouvre jamais l'admission ni ne réussit avant la preuve. Pour l'effacement avant réponse, autoriser les écritures légitimes de missions E2, Settings et alarme, puis rejouer la même requête d'origine : le pré-vol constate l'absence de journal, une époque canonique actuelle égale à l'époque suivante de cette requête, le reçu le plus récent exact et l'autorité DB6/data3 actuelle. Il se termine comme `recognized` avec zéro second journal, barrière, suppression, effacement, réinitialisation ou diffusion.
- **R5 — échecs exacts :** un échec d'alarme est réessayable sous `SETTINGS_ALIGNMENT_FAILED/settings_recovery` à `database_reinitialized` ; une preuve avec ID correspondant malformée est non réessayable sous `PROTOCOL_ERROR/settings_recovery` ; les échecs de diffusion conservent respectivement `settings_aligned` et `committed` ; un échec de stockage/relecture du reçu est réessayable sous `RECEIPT_FAILED/receipt` à `settings_aligned`, un conflit de reçu est non réessayable sous `PROTOCOL_ERROR/receipt` ; un échec d'effacement est `JOURNAL_FAILED/journal` à `committed` ; un payload erroné/superflu ne modifie ni la phase de reset ni l'acteur de Settings.

## Projection de disponibilité à l'exécution (Runtime availability projection)

L'UI destructive projette une capabilité explicite à l'exécution, jamais un bouton optimiste. Tant que l'acteur de Reset exécutable n'a pas tous ses ports détenus par le modèle raccordés — l'autorité du Dataset, le ralliement à la barrière de démarrage (Startup Barrier), la quiescence des écrivains, le journal/reçu, la récupération des Settings et la passation en arrière-plan (background handoff) — la seule projection valide est :

```ts
{
  status: 'unavailable',
  reason: 'Réinitialisation indisponible : coordination de sécurité en cours de finalisation.'
}
```

Dans cet état, l'UI de production n'affiche pas le point d'entrée destructif et n'émet aucune commande `RESET_LOCAL_DATA`. Une capabilité indisponible est un fait de périmètre de release, et non une annonce de fonctionnalité désactivée : l'onglet Settings ne doit pas promouvoir un flux destructif inachevé. Les diagnostics de développement peuvent exposer la raison en dehors de la surface de Settings visible par l'utilisateur, mais ils ne peuvent toujours pas émettre la commande de reset. Si la capabilité devient indisponible après qu'une confirmation s'est déjà ouverte, les contrôles de confirmation disparaissent et la même projection indisponible l'emporte. Une commande échouée légitimement démarrée pendant qu'elle était disponible reste visible sous forme d'alerte en ligne ; elle ne ferme jamais la confirmation, ne navigue pas vers l'onboarding et ne présente pas de succès. Seule l'installation de l'ensemble complet des ports exécutables peut basculer ce contrat vers `available` et rendre le point d'entrée affichable.

La source exécutable de cette projection actuelle est `local-data-reset-availability.contract.ts`. Le libellé de l'UI peut évoluer, mais les invariants d'indisponibilité/masquage/absence de commande et d'erreur sincère ne le peuvent pas.

| Capabilité à l'exécution | Confirmation existante                             | Surface des Settings en production                  | Effet admis                                        |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| `unavailable`            | non                                                | aucun point d'entrée Reset                          | aucun                                              |
| `unavailable`            | oui, issue d'une projection `available` antérieure | la confirmation est immédiatement retirée           | aucun                                              |
| `available`              | non                                                | le point d'entrée Reset peut s'afficher             | aucun avant confirmation explicite                 |
| `available`              | oui et confirmation exacte satisfaite              | la confirmation reste visible pendant le traitement | commande de Reset détenue par le modèle uniquement |

Résultat de la revue : la disponibilité nominale, la révocation de capabilité, une confirmation obsolète, l'affichage de réessai/erreur et l'admission de commande sont explicites. Aucun texte, état de bouton désactivé ou booléen d'UI obsolète n'autorise une transition destructive. Le gestionnaire en arrière-plan reste fail-closed même si un appelant non approuvé fabrique un `RESET_LOCAL_DATA` alors que la capabilité est indisponible.

## Hors périmètre (Out of scope)

- export/restauration sélectif des données réinitialisées ;
- effacement à distance / multi-appareils ;
- réparation automatique d'un journal de reset corrompu ;
- suppression d'un tableau de bord connecté à distance ;
- rédaction de l'UI et design visuel au-delà d'une projection fidèle des états en attente/bloqué/échec/succès ;
- implémentation des contrats de capabilités de pré-admission, des méthodes d'autorité ou de l'adaptateur Shell avant leur revue de modèle indépendante.
