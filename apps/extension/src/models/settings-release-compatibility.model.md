# Modèle de compatibilité de version pour Settings

Statut : **approuvé le 2026-07-16** suite au PASS indépendant du candidat de catalogue
de première version exact et du reçu de prédécesseur vide décrits
ci-dessous. L'approbation est limitée à ces formes canoniques et digests exacts.

Le commit `6400c8ce093a858bb31ab6a1735bb18cab29bd6f` décrivait
`9aceac90e02c09da73bb4f3e146da5fb13d250df41d1021a51059d614846c705`
comme un hash de contenu de registre historique, mais ce commit ne contient aucun blob de
registre matérialisant cette affirmation ; le blob du modèle lui-même a pour SHA-256
`fe6594112529da4bbfd44f7aa8d899cf3e0ba24f9b9bef35f147e4f6943864ad`.
La valeur `9ace...` est par conséquent une affirmation historique non vérifiée. Elle n'est ni
requalifiée ni utilisée comme digest d'autorisation, reçu de revue ou preuve
d'ascendance. Le PASS indépendant n'a pas examiné ni autorisé `9ace...`.

Les entrées de première version approuvées sont sous contrôle de source indépendamment du
registre d'exécution (runtime) :

- l'objet prédécesseur vide exact se trouve dans
  `tests/fixtures/settings-release/connector-catalogue-history.predecessor.v1.json`
  avec
  `predecessorJcsSha256=1033ecb4dd9e23ca70a0ebae009663ab2196397526b6a7cce8333653f80be0b9` ;
- le snapshot candidat exact se trouve dans
  `tests/fixtures/settings-release/connector-catalogue-history.candidate.v1.json`
  avec
  `registryJcsSha256=9a81cff62e4d3f270e64e0fa98934535c49da6689a64a395dddf8d9191670334` ;

Ces hashes prouvent uniquement les formes exactes et l'auto-cohérence du
prédécesseur vide de première version et du candidat actuel. Un prédécesseur vide ne peut pas
prouver une ascendance approuvée. Des clés supplémentaires invalident l'un ou l'autre reçu. La revue
indépendante de ce modèle et candidat exacts a retourné PASS le 2026-07-16 et
n'autorise que cette paire de première version exacte ; elle ne crée, ne déduit ni
n'approuve rétroactivement aucune ascendance de prédécesseur.

Source de vérité pour le workflow borné de Settings et de consentement d'onboarding livré
tant que Dataset DB6/data3 et la bascule vers le rédacteur global Settings V2 restent
indisponibles. Cet acteur est une frontière de version (release boundary), et non une preuve de substitution pour le
protocole futur décrit dans `settings-persistence.model.md`.

Le service worker possède un acteur XState v5 pour ce workflow. Le side panel
utilise le bridge typé. Aucune sortie de LLM, texte d'interface, toast, événement de stockage ou erreur
en texte libre ne décide d'une transition.

## Frontière de version (Release boundary)

L'acteur est le seul lecteur et rédacteur de la version pour :

- la valeur stricte à neuf champs `AppSettings` ;
- le bit de consentement explicite d'onboarding terminé ;
- l'alarme `auto-scan` exacte ;
- le journal de compatibilité et le registre borné des résultats (outcomes).

Il stocke ces valeurs de manière atomique dans une enveloppe stricte à l'emplacement
`chrome.storage.local.missionpulse_settings_release_v1`. Après une migration
prouvée, les clés héritées `settings` et `onboarding_completed` ne sont ni
lues ni écrites par le code de la version. Tous les consommateurs du scanner, des notifications, du condensé (digest), du thème,
des connecteurs et de l'interface utilisateur obtiennent un snapshot confirmé immuable depuis cet
acteur. Une barrière de build (build gate) rejette tout autre lecteur/rédacteur de la version pour l'enveloppe,
pour l'une ou l'autre des clés héritées ou pour `auto-scan`.

Les dépôts V2 dormants, les preuves de réservation globale et la barrière DatasetEpoch
ne doivent pas être instanciés tant que chaque rédacteur local et IndexedDB ne participe pas à
cette autorité. Une bascule globale manquante n'est jamais normalisée en
`allLocalWritersFenced:true`.

L'import/restauration de sauvegarde et la réinitialisation des données locales (Local Data Reset) ne sont pas des points
d'entrée de mutation livrés. L'export reste en lecture seule. Leurs points d'entrée dans l'interface restent masqués tant que leurs
propres modèles de transactions multi-ressources ne sont pas exécutables.

## Enveloppe canonique

```ts
interface SettingsReleaseEnvelopeV1 {
  version: 1;
  installId: string; // lower-case RFC 4122 UUID, created once
  nextIdentity: number; // safe integer in [1, Number.MAX_SAFE_INTEGER]
  revision: number; // durable terminal-settlement version
  generation: number; // every proved envelope replacement
  scanAckThrough: number; // greatest retired scan identity, starts at zero
  catalogFingerprint: string; // admitted historical/current digest during boot; current in ready
  legacyRetirement: 'pending_removal' | 'retired';
  confirmed: {
    settings: AppSettings;
    onboardingCompleted: boolean;
  };
  pending: null | {
    commandId: string; // `settings-release:${installId}:${identity}:command`
    requestId: string; // strict lower-case RFC 4122 UUID from the caller
    intentDigest: string; // lower-case SHA-256 of the canonical mutation intent
    kind: 'save_settings' | 'set_consent' | 'clear_consent';
    baseRevision: number;
    previous: ConfirmedSettingsReleaseState;
    candidate: ConfirmedSettingsReleaseState;
    previousAlarm: AutoScanExpectation;
    candidateAlarm: AutoScanExpectation;
    phase: 'reserved' | 'prepared' | 'effect_proved' | 'compensating';
    compensationReason: null | 'effect_compensated' | 'permission_lost' | 'recovered_previous';
  };
  outcomes: SettingsReleaseOutcome[]; // oldest-first, maximum 64
  outbox: null | {
    broadcastId: string;
    commandId: string;
    reason: 'mutation_settlement' | 'catalog_migration';
    snapshot: SettingsReleaseSnapshot;
  };
  scanAdmission: null | {
    identity: number;
    token: string; // `settings-release:${installId}:${identity}:scan`
    snapshot: SettingsReleaseSnapshot;
    snapshotDigest: string;
    phase: 'reserved' | 'accepted';
    result: null | { status: 'accepted'; operationId: `missionpulse-scan:${string}:${number}` };
  };
}
```

La valeur est un objet ordinaire et détaché comportant exactement ces clés : aucune clé
inconnue, trou, symbole, accesseur, prototype personnalisé, `NaN`, infini ou entier
non sûr. Les valeurs imbriquées ont la même contrainte. `revision` et `generation`
commencent à zéro et ne diminuent jamais. `scanAckThrough` est un entier sûr, ne
dépasse jamais la plus grande identité allouée, n'avance qu'en effaçant de manière atomique
cet enregistrement de scan, et ne diminue jamais. Une commande qui ne dispose pas du budget
de compteurs complet spécifique à la branche défini ci-dessous est rejetée avec
`identity_exhausted` avant tout effet et l'acteur se bloque ; aucune boucle de repli aléatoire
n'existe.

Chaque remplacement prévu de l'enveloppe complète exige la génération précédente exacte
et incrémente `generation` d'exactement un, y compris lors des réservations,
préparations, preuves de phase, compensations, vidages d'outbox et changements d'admission de scan.
Au plus un élément parmi `pending`, `outbox` et `scanAdmission` est non nul. Une écriture
rejetée ne se poursuit que lorsque la relecture (read-back) est égale à la génération suivante
prévue complète. Elle ne revient à l'état antérieur que lorsque la relecture est égale à la
génération précédente complète ; toute autre valeur bloque l'acteur.

`compensationReason` est non nul exactement dans la phase `compensating` ; toute autre
phase requiert `null`. Cela rend le règlement après redémarrage indépendant du texte d'erreur.
Pour une admission de scan, `result` est nul exactement dans la phase `reserved` ; la phase
`accepted` stocke l'ID d'opération accepté exact retourné par le port. Un
résultat ignoré (skipped) n'est jamais persisté comme `accepted` et libère le bail directement.

L'acteur réserve un `commandId` en incrémentant de manière atomique `nextIdentity`
et `generation`, en installant `pending.phase:'reserved'`, puis en relisant
l'enveloppe complète. Les identifiants de commande ne peuvent donc pas être réutilisés au sein d'une
installation, y compris après éviction du registre ou redémarrage du service worker.
`requestId` est une entrée de corrélation et d'idempotence ; il n'est jamais une autorité de
transition en soi. Chaque identité retenue à travers pending et outcomes doit
être globalement disjointe. Réutiliser un `requestId` retenu avec un digest d'intention canonique
différent constitue un `request_identity_conflict` et bloque avant tout effet.

Un résultat (outcome) contient exactement :

```ts
type SettingsReleaseOutcomeBase = {
  commandId: string;
  requestId: string;
  intentDigest: string;
  kind: SettingsReleaseMutationKind;
  settledRevision: number;
  settledGeneration: number;
  snapshot: SettingsReleaseSnapshot;
};

type SettingsReleaseOutcome = SettingsReleaseOutcomeBase &
  (
    | { status: 'committed'; reason: 'committed' | 'recovered_candidate' }
    | {
        status: 'not_committed';
        reason:
          'permission_missing' | 'permission_unknown' | 'storage_failed' | 'recovered_previous';
      }
    | {
        status: 'compensated';
        reason: 'permission_lost' | 'effect_compensated';
      }
  );
```

Le règlement (settlement) ajoute le résultat et n'évince que le résultat réglé le plus ancien au-delà
de 64 entrées. Chaque règlement terminal durable, y compris la compensation et
recovered-previous, incrémente `revision` exactement une fois, même lorsque les valeurs
métier confirmées sont inchangées. Le snapshot de résultat stocké est donc exact,
et non reconstruit à partir de l'état actuel. Un `requestId` répété et retenu retourne
ce résultat sans allouer d'identité ni répéter d'effet. Après
éviction, le `baseRevision` initial est nécessairement plus ancien que la révision
de règlement, la requête retourne donc un conflit et ne peut pas être rejouée.

## Paramètres canoniques et migration

```ts
type ConnectorCatalogueTupleV1 = readonly [
  connectorId: string,
  included: boolean,
  sortedHostPermissions: readonly string[],
];

interface ConnectorCatalogueHistoryV1 {
  schema: 'missionpulse.connector-catalogue-history';
  version: 1;
  catalogues: readonly {
    catalogFingerprint: string; // exact lower-case SHA-256 derived below
    tuples: readonly ConnectorCatalogueTupleV1[];
  }[];
}

declare function decodeCatalogueSettings(
  raw: unknown,
  tuples: readonly ConnectorCatalogueTupleV1[]
): AppSettings | null;
```

Le registre validé et versionné `ConnectorCatalogueHistoryV1` est l'unique
autorité pour décoder une empreinte d'enveloppe non actuelle. Ses entrées
de catalogue sont non vides, uniques par empreinte, immuables et en ajout seul (append-only) à travers les
versions publiées ; le catalogue actuel est présent exactement une fois. Chaque tableau
de n-uplets est unique et ordonné par identifiant de connecteur strictement croissant en utilisant la comparaison
lexicale brute UTF-8/ASCII (`left < right`), de sorte que l'ordre actuel est
`cherry-pick, collective, free-work, hiway, lehibou, malt`. Chaque tableau de permissions
est unique et trié selon la même comparaison, et chaque empreinte est
recalculée indépendamment à partir de ses n-uplets exacts par la formule ci-dessous. Une empreinte
dupliquée, malformée, divergente ou inconnue
bloque avant la normalisation des clés héritées, la récupération de pending/outbox,
la requête/admission de scan, la mutation d'alarme ou la diffusion. L'environnement, le stockage et
les entrées d'exécution ne peuvent pas ajouter une entrée d'historique.

La barrière de version compare le registre candidat au blob de registre exact dans
la source publiée immédiatement précédente. Si le tableau précédent a une longueur
`N`, la longueur du candidat est au moins `N` et, pour chaque index inférieur à `N`, le JCS de
l'entrée candidate complète doit être égal au JCS de l'entrée précédente complète
octet par octet au même index. Aucune entrée ou aucun n-uplet ancien ne peut être retiré, réécrit
ou réordonné ; de nouvelles entrées ne peuvent être ajoutées qu'aux index `N...`. Une première
version exige un reçu de prédécesseur vide explicite. Le stockage d'exécution ne peut pas
satisfaire ni contourner cette barrière d'historique de source.

Pour une empreinte historique reconnue, toutes les valeurs retenues dans cette enveloppe
et toute clé héritée de paramètres toujours présente sont décodées et normalisées par rapport
à ce tableau de n-uplets historique exact en premier lieu. Seule la transition ultérieure de migration
de catalogue peut projeter la valeur confirmée historiquement valide dans le catalogue
actuel. `RECOGNIZED_CONNECTOR_IDS` est donc l'union des identifiants dans ce
registre validé, et jamais une liste d'autorisation non versionnée maintenue manuellement ; la reconnaissance
seule n'autorise pas une empreinte inconnue.

`decodeCatalogueSettings` est un décodeur pur et strict paramétré par exactement un
tableau de n-uplets de registre. Il accepte les neuf clés `AppSettings` et leurs bornes
documentées uniquement lorsque `enabledConnectors` est unique, ordonné selon ce tableau de n-uplets et
contient uniquement ses identifiants de connecteurs `included:true`. Il ne consulte jamais
implicitement le catalogue du build actuel. Une enveloppe peut donc contenir une valeur
historique valide de paramètres tant que le boot/récupération est en `catalog_migration_mode` ; ses valeurs
pending, confirmed, outcome, outbox et scan doivent toutes se décoder sous la même
empreinte. L'invariant « connecteurs livrés dans ce build » ne commence qu'après
la transition de projection de catalogue. Chaque snapshot `ready` public et chaque
nouvelle mutation utilise ensuite l'empreinte de catalogue actuelle et le décodeur de n-uplets
actuel ; une empreinte ou valeur historique ne peut jamais atteindre `ready`.

Le build actuel calcule
`catalogFingerprint` à partir des n-uplets ordonnés versionnés
`[connectorId,included,sortedHostPermissions]`. Les identifiants inconnus n'entrent jamais dans
une migration. L'empreinte est le SHA-256 en minuscules des octets UTF-8 de
`JSON.stringify(['missionpulse-connector-catalog',1,tuples])` ; l'ordre des n-uplets et
des permissions est fixé avant la sérialisation. Une enveloppe avec une empreinte plus ancienne
n'est analysée qu'en tant qu'entrée de migration par rapport au registre historique ;
elle n'est jamais exposée en tant que snapshot canonique du build actuel.

Le démarrage suit une branche sans ambiguïté :

1. une enveloppe de version valide n'est autoritative que lorsque sa
   preuve `legacyRetirement` est cohérente avec l'absence/présence exacte des
   clés héritées ;
2. lorsque l'enveloppe est absente, lire les deux clés héritées exactement une fois ;
3. des paramètres hérités absents produisent des valeurs par défaut strictes du build ; une valeur
   héritée exacte à huit champs ne peut ajouter que `theme:'system'` ; une valeur stricte à neuf champs est
   copiée sans modification ;
4. seuls les identifiants de connecteurs connus du catalogue mais exclus du build peuvent être retirés lors de
   cette unique migration, dans l'ordre du catalogue ; un identifiant inconnu ou toute autre valeur héritée
   non nulle malformée bloque le démarrage ;
5. un consentement hérité absent signifie `false` ; seuls les booléens exacts sont acceptés ;
6. créer/relire l'enveloppe avec `legacyRetirement:'pending_removal'`,
   réconcilier/relire l'alarme exacte, puis supprimer les deux clés héritées et prouver
   leur absence exacte ;
7. remplacer/relire l'enveloppe avec `legacyRetirement:'retired'` et une nouvelle
   génération uniquement après cette preuve d'absence ;
8. après un redémarrage dans `pending_removal`, chaque clé héritée est vérifiée
   indépendamment : l'absence est acceptée car elle prouve soit une absence
   historique soit une suppression achevée, tandis que chaque valeur toujours présente doit se normaliser
   exactement selon la valeur confirmée correspondante de l'enveloppe sous l'unique
   transformation autorisée. Ainsi, zéro, une ou deux clés présentes reprennent en toute sécurité ;
   une dérive, une valeur présente illisible ou une clé réapparaissant après `retired`
   bloque ;
9. lorsqu'une enveloppe valide a une empreinte de catalogue plus ancienne, le démarrage autorise une
   transformation déterministe : retirer les identifiants activés qui sont reconnus historiquement
   mais non livrés actuellement, préserver l'ordre de catalogue des autres, incrémenter
   revision/generation, et relire l'enveloppe entière. L'attente de l'alarme
   est inchangée. Un identifiant non reconnu ou tout autre changement bloque. Ce n'est qu'alors que l'on stocke
   l'empreinte actuelle et que l'on poursuit la réconciliation.

La migration de catalogue est ordonnée avant que toute valeur de l'ancien catalogue ne puisse être publiée
ou admise. Le démarrage marque une ancienne empreinte comme `catalog_migration_mode` avant
de choisir la récupération :

- une ancienne transaction `pending` est récupérée par rapport à son catalogue reconnu
  historique, mais son outbox de règlement est supprimée de la publication ;
- une ancienne `scanAdmission` n'est traitée que par le port de scan en lecture seule (query-only). Pour la phase
  `reserved`, un résultat accepté/ignoré est retiré et `not_found` prouve qu'elle
  n'a jamais été liée, la retirant comme `catalog_changed`. Pour la phase `accepted`, seul
  l'ID d'opération accepté stocké exact peut la retirer ; un résultat ignoré (skipped), `not_found`,
  `retired` ou un ID d'opération différent est contradictoire et bloque. Le
  port capable d'admission n'est jamais appelé avec un ancien snapshot ;
- une ancienne outbox est remplacée sans publication ;
- une fois ces enregistrements absents, la transformation intersecte uniquement `confirmed`,
  incrémente revision, alloue une identité de commande de catalogue interne,
  efface le registre des résultats historique, installe l'empreinte actuelle et
  crée une outbox de catalogue actuel. Les réessais exacts issus du registre effacé
  transportent l'ancienne révision de base et retournent donc un conflit à la nouvelle révision ;
  ils ne peuvent pas rejouer un effet.

La transformation de catalogue n'a aucune autre entrée légale et ne réécrit jamais sur place un snapshot
pending, d'outcome historique, d'outbox ou de scan. Elle prouve l'attente
d'alarme inchangée avant que sa nouvelle outbox ne puisse publier. Aucun snapshot d'ancien catalogue
n'est retourné à un panneau, une notification, un condensé (digest) ou un consommateur de scan.

La migration ne diffuse ni n'expose jamais de valeurs par défaut avant que l'enveloppe, l'alarme et
le retrait des clés héritées ne soient tous prouvés. Un état non nul invalide n'est jamais réparé
silencieusement. Chaque objet de bridge est détaché et validé à nouveau.

## Machine

```text
booting
  -> migrating                 ENVELOPE_ABSENT
  -> recovering                PENDING_FOUND
  -> retiringScanAdmission     OLD_CATALOG_SCAN_ADMISSION_FOUND
  -> recoveringScan            SCAN_ADMISSION_FOUND
  -> catalogMigrating          OLD_CATALOG_OUTBOX_OR_CONFIRMED_FOUND
  -> broadcasting              OUTBOX_FOUND
  -> reconciling               CONFIRMED_FOUND
  -> blocked                   BOOT_PROOF_FAILED

migrating
  -> reconciling               MIGRATION_PROVED
  -> blocked                   MIGRATION_FAILED

recovering
  -> broadcasting              RECOVERY_SETTLED
  -> catalogMigrating          OLD_CATALOG_RECOVERY_SETTLED
  -> blocked                   RECOVERY_AMBIGUOUS

recoveringScan
  -> reconciling               SCAN_RECOVERY_SETTLED
  -> blocked                   SCAN_RECOVERY_UNKNOWN

retiringScanAdmission
  -> catalogMigrating          OLD_SCAN_RESULT_RETIRED_OR_NOT_FOUND
  -> blocked                   OLD_SCAN_RESULT_UNKNOWN

catalogMigrating
  -> reconciling               CURRENT_CATALOG_OUTBOX_PROVED
  -> blocked                   CATALOG_MIGRATION_AMBIGUOUS

reconciling
  -> ready                     ALARM_AND_STORAGE_PROVED
  -> broadcasting              ALARM_PROVED_WITH_OUTBOX
  -> blocked                   RECONCILIATION_FAILED

ready
  -> reserving                 MUTATION_ADMITTED
  -> admittingScan             AUTO_SCAN_FIRED
  -> ready                     READ_REQUESTED | DUPLICATE_REQUEST

reserving
  -> preparing                 IDENTITY_RESERVED
  -> ready                     RESERVATION_NOT_COMMITTED
  -> blocked                   RESERVATION_AMBIGUOUS | IDENTITY_EXHAUSTED

preparing
  -> applyingEffect            PREPARE_PROVED
  -> broadcasting              POST_RESERVATION_SETTLEMENT_PROVED
  -> blocked                   PREPARE_AMBIGUOUS

applyingEffect
  -> settling                  EFFECT_AND_PERMISSION_PROVED
  -> compensating              EFFECT_OR_PERMISSION_FAILED

settling
  -> broadcasting              COMMIT_PROVED
  -> recovering                COMMIT_REJECTED_WITH_PENDING_READBACK
  -> blocked                   COMMIT_AMBIGUOUS

compensating
  -> broadcasting              COMPENSATION_PROVED
  -> blocked                   COMPENSATION_AMBIGUOUS

broadcasting
  -> reconciling               OUTBOX_ATTEMPT_PROVED_AND_CLEARED
  -> blocked                   OUTBOX_TRANSPORT_OR_CLEAR_AMBIGUOUS

admittingScan
  -> ready                     SCAN_ADMITTED | SCAN_SKIPPED | ALARM_REPAIRED
  -> blocked                   SCAN_PROOF_AMBIGUOUS | SCAN_ADMISSION_TIMEOUT

blocked
  -> booting                   EXPLICIT_RETRY_REQUESTED
```

Une FIFO détenue par l'acteur ordonne les commandes du bridge, les commandes de consentement, les
déclenchements d'alarme et les lectures de snapshot internes. Elle contient au plus 32 entrées en mémoire,
y compris un maximum de 8 entrées de démarrage mises en mémoire tampon. Seule la tête devient
durablement admise lorsque son enregistrement `pending` ou `scanAdmission` est prouvé. Les entrées
derrière la tête constituent un travail de transport, et non des revendications métier durables.

Le rejet pour dépassement de capacité relève de l'état de transport, jamais d'un résultat (outcome) métier et jamais d'un
snapshot canonique. Il est exactement :

```ts
type SettingsReleaseQueueRejection = {
  status: 'transport_rejected';
  reason: 'queue_full';
  commandType: 'mutation' | 'read' | 'auto_scan_fire';
  correlationId: string | null;
  snapshot: null;
};
```

Une mutation ou lecture excédentaire reçoit cette réponse typée. Un
`AUTO_SCAN_FIRED` excédentaire produit la même disposition interne avec un `correlationId`
égal à `auto-scan:${scheduledTimeMs}`, où `scheduledTimeMs` est l'entier
sûr non négatif exact porté par l'événement d'alarme Chrome validé, et aucun
effet de scan ; l'alarme récurrente reste inchangée. `EXPLICIT_RETRY_REQUESTED`
n'utilise pas la FIFO métier : un verrou de contrôle d'état bloqué séparé est
toujours réservé. Son résultat est exactement
`{status:'retry_accepted'|'retry_already_queued'|'retry_not_applicable',snapshot:null}`.
La première requête est acceptée, les doublons concurrents sont fusionnés (coalesced), et une
requête en dehors de `blocked` n'est pas applicable ; aucun ne mute l'état métier.

Si l'acteur entre dans `blocked`, chaque appelant en file d'attente toujours connecté reçoit
`blocked/actor_blocked`. Si le worker meurt d'abord, Chrome ferme leurs ports
de messages : la façade traite cela comme une perte de transport, retient le payload
de requête exact et réessaie une fois avec le même `requestId` après un nouveau boot
réussi. Elle n'invente jamais de résultat métier. Il n'y a aucune mutation
Settings parallèle et deux acteurs ne peuvent pas coexister au cours d'une même durée de vie du worker. Le démarrage installe
les écouteurs immédiatement, mais aucune lecture, aucun message ni aucun déclenchement d'alarme ne contourne la récupération.

## Snapshots confirmés et diffusions (broadcasts)

Le snapshot immuable public est :

```ts
interface SettingsReleaseSnapshot {
  settings: AppSettings;
  onboardingCompleted: boolean;
  revision: number;
  generation: number;
}
```

`GET_SETTINGS` et `GET_ONBOARDING_COMPLETED` retournent des données provenant du même snapshot
ou un échec typé ; aucun ne substitue de valeurs par défaut. Les lectures de scan,
de notifications et de condensé (digest) utilisent le même port d'acteur.

Chaque commande de mutation contient `{requestId, baseRevision, ...intent}` exact.
L'intention (intent) Settings contient un candidat strict complet. L'intention de consentement contient uniquement
le booléen cible exact. Son union est discriminée avant le calcul du digest :
`{kind:'set_consent',targetConsent:true}` ou
`{kind:'clear_consent',targetConsent:false}` ; toute paire non concordante est une
requête de bridge malformée et n'entre jamais dans la FIFO. La révision confirmée actuelle
doit être égale à `baseRevision` ; sinon, le résultat terminal est
`not_admitted/conflict` et inclut le snapshot canonique actuel. Un no-op retourne
`not_admitted/already_confirmed` sans effet d'alarme ni de stockage.

Chaque règlement durable stocke de manière atomique son résultat et un enregistrement d'outbox.
L'outbox diffuse (broadcast) exactement :

```ts
{
  type: 'SETTINGS_RELEASE_UPDATED',
  payload: {
    snapshot: SettingsReleaseSnapshot;
    commandId: string;
    broadcastId: string; // `${commandId}:broadcast`
  }
}
```

Chaque panneau se souvient du plus grand n-uplet `(revision, generation)` qu'il a accepté. Il
compare d'abord la révision puis la génération, n'accepte qu'un n-uplet lexicographiquement
supérieur, traite un n-uplet égal au contenu identique comme un doublon, et
rejette un n-uplet inférieur ou un n-uplet égal au contenu différent. La même fonction
de fusion gère le GET, le broadcast et les résultats corrélés : chaque promesse de commande
atteint toujours son résultat terminal, mais un snapshot corrélé plus ancien ne remplace
jamais un snapshot accepté plus récent.

`BroadcastPort.publish` retourne exactement `delivered` ou `no_receiver` après la
tentative d'envoi Chrome, ou lève une exception en cas de défaillance de transport. Les deux résultats exacts permettent
à l'acteur d'effacer/relire l'outbox ; `no_receiver` est sûr car chaque panneau nouveau
ou reconnecté doit exécuter un GET et fusionner le snapshot canonique avant tout rendu.
Une défaillance de transport ou un vidage d'outbox ambigu bloque avec l'outbox conservée.
Un crash avant publication la rejoue au boot ; un crash après publication mais avant
vidage peut la dupliquer, ce que la déduplication de n-uplet/ID de diffusion du panneau prend en charge.
Ainsi, un commit ne peut pas tomber dans un interstice commit-vers-diffusion non modélisé.

Le résultat de mutation corrélé est une union discriminée exacte :

```ts
type SettingsReleaseMutationResult =
  | {
      status: 'settled';
      outcome: SettingsReleaseOutcome;
    }
  | {
      status: 'not_admitted';
      requestId: string;
      commandId: null;
      reason:
        | 'already_confirmed'
        | 'conflict'
        | 'permission_missing'
        | 'permission_unknown'
        | 'storage_failed';
      snapshot: SettingsReleaseSnapshot;
    }
  | {
      status: 'blocked';
      requestId: string;
      commandId: string | null;
      reason:
        | 'identity_exhausted'
        | 'request_identity_conflict'
        | 'actor_blocked'
        | 'storage_ambiguous'
        | 'effect_ambiguous'
        | 'broadcast_ambiguous'
        | 'scan_admission_unknown';
      snapshot: null;
    };
```

Le schéma du bridge rejette tout champ manquant/superflu ou toute combinaison
statut/raison/identité inconsistante. Un échec typé ne transporte jamais de snapshot
fabriqué. Les résultats récupérés utilisent la même branche `settled`, de sorte que
`recovered_previous`, `recovered_candidate` et la compensation soient représentables
sans traduction. Les lectures utilisent une union exacte distincte de
`{status:'confirmed',snapshot}` ou
`{status:'unavailable',reason:'actor_blocked'|'storage_ambiguous',snapshot:null}` ;
le débordement de FIFO utilise plutôt `SettingsReleaseQueueRejection`. Les déclenchements d'alarme et le
verrou de contrôle de réessai possèdent les dispositions exactes définies ci-dessus et ne sont jamais
traduits en résultats de mutation.

## Attente exacte pour l'alarme

```ts
effectiveAutoScan = confirmed.onboardingCompleted === true && confirmed.settings.autoScan === true;

effectiveAutoScan
  ? { name: 'auto-scan', periodInMinutes: confirmed.settings.scanIntervalMinutes }
  : { name: 'auto-scan', absent: true };
```

L'acteur ne peut créer/remplacer ou effacer que `auto-scan`. Chaque opération est
suivie de `chrome.alarms.get('auto-scan')` ; le succès exige la présence exacte,
le nom et la période, ou l'absence exacte. Il n'appelle jamais `clearAll` et ne traite jamais une
Promise Chrome résolue comme une preuve sans relecture (read-back).

## Transaction de mutation

Le digest d'intention est versionné et exact au bit près. Après une validation stricte, construire
un tableau JSON sans aucune valeur optionnelle :

```ts
[
  'missionpulse-settings-release-intent',
  1,
  kind,
  baseRevision,
  kind === 'save_settings'
    ? [
        scanIntervalMinutes,
        enabledConnectors, // already catalogue-ordered
        notifications,
        autoScan,
        maxSemanticPerScan,
        notificationScoreThreshold,
        respectRateLimits,
        customDelayMs,
        theme,
      ]
    : targetConsent,
];
```

Hacher les octets UTF-8 d'`JSON.stringify` ECMAScript pour ce tableau avec SHA-256
et encoder 64 caractères hexadécimaux en minuscules. Une défaillance de sérialisation ou de digest
bloque avant la réservation. Aucun ordre de clés d'objet, locale ou espace n'est
défini par l'implémentation.

Avant le premier effet externe ou remplacement d'enveloppe, l'acteur prouve le
budget de compteurs maximal restant pour la branche sélectionnée. Un budget de génération
comprend toutes les écritures de phase, le règlement terminal et le vidage durable d'outbox/de bail ;
l'acteur peut consommer moins d'incréments mais ne s'appuie jamais sur cela après un effet.

| Branche à l'admission/récupération              | Marge de génération | Marge de révision | Marge d'identité |
| ----------------------------------------------- | ------------------- | ----------------- | ---------------- |
| Nouvelle mutation, y compris compensation       | 5                   | 1                 | 1                |
| Nouvelle admission de scan, chemin accepté      | 3                   | 0                 | 1                |
| Récupérer `reserved`/`prepared`/`effect_proved` | 3                   | 1                 | 0                |
| Récupérer `compensating`                        | 2                   | 1                 | 0                |
| Publier et vider une outbox existante           | 1                   | 0                 | 0                |
| Récupérer un scan réservé du catalogue actuel   | 2                   | 0                 | 0                |
| Retirer un ancien scan puis migrer le catalogue | 3                   | 1                 | 1                |
| Migrer le catalogue sans enregistrement de scan | 2                   | 1                 | 1                |

« Marge N » signifie que la valeur actuelle est au plus
`Number.MAX_SAFE_INTEGER - N` ; une marge d'identité de un exige en outre
`nextIdentity <= Number.MAX_SAFE_INTEGER - 1`. Si plusieurs actions de démarrage subsistent,
leurs budgets sont additionnés avant la première. Tout échec bascule vers `blocked` avant
une mutation d'alarme, un appel de scan capable de permissions, une diffusion (broadcast) ou
une écriture en stockage spécifique au candidat. En particulier, un scan ne peut jamais être accepté
à moins que son écriture de phase `accepted` et son effacement atomique/avancement de `scanAckThrough`
restent représentables.

Pour une tête de FIFO :

1. relire strictement l'enveloppe et exiger que le snapshot en mémoire y corresponde ;
2. valider l'intention complète, calculer son digest canonique, et ne retourner un
   résultat existant que pour un couple retenu exact `(requestId,intentDigest)` ;
3. exiger que `baseRevision` soit égal à la révision confirmée ; une divergence retourne
   un conflit avec le snapshot canonique, et un no-op exact retourne
   already-confirmed, tous deux avant réservation ;
4. pour les connecteurs nouvellement activés, calculer l'union exacte et triée des origines hôtes et
   exiger que `chrome.permissions.contains` retourne `true` ; ne jamais demander de
   permission ;
5. réserver une identité de commande unique et `pending.phase:'reserved'` par une
   écriture/relecture de l'enveloppe complète ; l'enregistrement en attente comprend les états
   précédent/candidat immuables et le `baseRevision` exact de l'appelant ;
6. relire immédiatement l'enveloppe et le résultat de permission ; une dérive de l'enveloppe
   bloque, tandis qu'une permission nouvellement fausse/inconnue règle durablement le
   résultat correspondant `not_committed/permission_missing` ou `permission_unknown`
   avec les données confirmées inchangées, crée une outbox et continue via
   `broadcasting` sans mutation d'alarme ;
7. écrire/relire `pending.phase:'prepared'` tout en laissant `confirmed`
   inchangé ;
8. appliquer/relire l'alarme candidate exacte ;
9. répéter la vérification exacte de permission pour les connecteurs nouvellement activés et relire
   l'enveloppe en attente complète ainsi que l'alarme ;
10. écrire/relire `pending.phase:'effect_proved'` ; une écriture de phase rejetée est
    interprétée uniquement par une relecture exacte de l'enveloppe complète ;
11. remplacer atomiquement `confirmed` par le candidat, incrémenter `revision` et
    `generation`, ajouter le résultat avec son snapshot exact, effacer `pending`,
    créer l'outbox correspondante, puis relire l'enveloppe complète et l'alarme ;
12. publier/vider l'outbox durable, puis retourner le résultat réglé exact.

La permission initiale `false` donne `not_admitted/permission_missing` ; une exception levée ou un
résultat malformé donne `not_admitted/permission_unknown`. Aucun n'écrit d'enregistrement en
attente ni d'alarme. Après réservation, une permission perdue/inconnue efface pending par un
règlement terminal prouvé, incrémente revision, enregistre la raison exacte
correspondante, et diffuse les valeurs confirmées inchangées au nouveau n-uplet.
Le même chemin de règlement durable est utilisé lorsqu'il est prouvé que le stockage de préparation n'a pas
committé : `not_committed/storage_failed` est diffusé avant `ready` ;
il n'y a aucun raccourci `preparing -> ready` tant qu'un enregistrement pending existe.
Après prepare, le même échec doit compenser et enregistre
`compensated/permission_lost`. Un rejet de
stockage n'est interprété que par une relecture exacte de l'enveloppe complète : l'état précédent
prouvé n'est pas committé, l'état prévu prouvé continue, et toute troisième valeur ou
valeur illisible bloque.

Si l'alarme ou la preuve finale de permission échoue après prepare, définir
`pending.phase:'compensating'`, restaurer/relire l'alarme précédente exacte, puis
effacer pending tandis que les données confirmées restent celles précédentes. Un échec d'alarme règle
`compensated/effect_compensated` ; un échec final de permission règle
`compensated/permission_lost`. Ce règlement incrémente revision et crée
une outbox. Toute compensation ambiguë bloque. Le candidat n'est jamais projeté
comme confirmé avant le règlement.

L'octroi et la révocation du consentement utilisent cette même transaction. Un
événement de stockage `SET_ONBOARDING_COMPLETED` ou `CLEAR_ONBOARDING_COMPLETED` n'est pas
une entrée : seule la commande FIFO corrélée peut modifier le consentement. La révocation ne peut pas
entrer en concurrence avec un enregistrement des paramètres car les deux sont sérialisés et chaque candidat comprend
la valeur actuelle de consentement.

## Récupération après redémarrage (Restart recovery)

Lorsque `pending` existe, le démarrage lit l'enveloppe et l'alarme exactes avant d'admettre
quoi que ce soit :

- `reserved` : prouver ou restaurer l'alarme précédente, en utilisant la raison de compensation
  `recovered_previous` lorsqu'une restauration est nécessaire, puis régler
  `not_committed/recovered_previous` ;
- `prepared` : persister d'abord la raison de compensation `recovered_previous`, compenser
  vers l'alarme précédente même lorsque les attentes de l'alarme candidate et précédente
  s'avèrent égales, puis régler `not_committed/recovered_previous` ;
- `effect_proved` : répéter les preuves finales de permission et d'alarme candidate, puis
  régler `committed/recovered_candidate` ; une preuve échouée entre en compensation ;
- `compensating` : achever la restauration et régler à partir de la raison stockée :
  `recovered_previous` correspond à `not_committed` ; les deux autres correspondent à
  `compensated` ;
- toute valeur illisible, tierce ou contradictoire : bloquer.

La récupération préserve le `requestId` et le `commandId` d'origine, écrit un résultat
terminal, et n'adopte jamais silencieusement un candidat. Un appelant qui a perdu sa réponse
peut réessayer le même `requestId` et recevoir le résultat récupéré. Après récupération,
l'acteur publie/vide l'outbox de règlement et réconcilie l'alarme avec l'état confirmé
une fois de plus avant d'entrer dans `ready`.

## Déclenchement d'alarme et bail d'admission de scan

`AUTO_SCAN_FIRED` est une commande FIFO, et non un callback indépendant. Pendant que l'acteur
est dans l'état `admittingScan`, les mutations de Settings et de consentement restent en file d'attente.

Le digest de snapshot de scan est un SHA-256 en minuscules sur les octets UTF-8 de
`JSON.stringify` de ce tableau exact, après que le snapshot et les paramètres ont
passé le même décodeur d'objet détaché strict utilisé par GET :

```ts
[
  'missionpulse-settings-release-scan-snapshot',
  1,
  revision,
  generation,
  onboardingCompleted,
  [
    scanIntervalMinutes,
    enabledConnectors,
    notifications,
    autoScan,
    maxSemanticPerScan,
    notificationScoreThreshold,
    respectRateLimits,
    customDelayMs,
    theme,
  ],
];
```

L'union exacte du résultat du port est :

```ts
type ScanAdmissionResult =
  | {
      status: 'accepted';
      operationId: `missionpulse-scan:${string}:${number}`;
    }
  | {
      status: 'skipped';
      reason: 'permission_missing' | 'already_running';
    };

type ScanAdmissionQueryResult =
  ScanAdmissionResult | { status: 'not_found' } | { status: 'retired' };

type SettingsScanDisposition =
  | ScanAdmissionResult
  | { status: 'skipped'; reason: 'catalog_changed' }
  | { status: 'transport_rejected'; reason: 'queue_full' }
  | { status: 'blocked'; reason: 'protocol_unknown' | 'timeout' | 'identity_error' };
```

L'ID d'opération doit contenir l'UUID d'installation exact en minuscules et une identité de scan
positive, sûre et monotone ; il est analysé et resérialisé octet par octet.
Les clés inconnues, les autres raisons, les ID d'opération malformés, les exceptions levées et les timeouts relèvent
de protocol-unknown, et non de skipped.

`ScanAdmissionPort.tryAdmit` accepte exactement
`{token,identity,snapshot,snapshotDigest,scanAckThrough}`. Le coordinateur de scan
lie durablement token, identité et digest avant de retourner un résultat. Comme étape finale
préalable à la liaison, il répète `permissions.contains` pour l'union d'origines triée exacte du snapshot ;
false retourne `skipped/permission_missing`, tandis qu'une preuve inconnue
retourne protocol-unknown et laisse la récupération bloquée. Répéter le même token
et les mêmes octets retourne le même résultat ; présenter des octets différents constitue une erreur
d'identité terminale. `query` est en lecture seule et peut retourner `not_found` ; il ne lie
ni ne démarre jamais de scan. Chaque appel a un délai limite (deadline) injecté de 10 000 ms. Un timeout ou
un résultat inconnu laisse `scanAdmission` durable et fait passer l'acteur Settings à l'état
`blocked`.

Le coordinateur de scan conserve un registre borné ainsi qu'un niveau de référence (watermark) de retrait durable par installation.
L'effacement atomique d'un enregistrement de scan avance
`scanAckThrough` jusqu'à l'identité de cet enregistrement. Le `tryAdmit` ou `query` suivant envoie
ce niveau de référence ; le coordinateur compacte ensuite les lignes détaillées plus anciennes tout en
conservant le niveau de référence, et retourne `retired` pour un token situé à ce niveau ou en dessous.
Comme au plus un enregistrement peut être non acquitté, le registre détaillé est borné
à deux lignes par installation et ne peut pas croître sans limite. Le boot ou un
réessai explicite utilise le même token et le même mode de requête/admission requis par l'état
du catalogue ; il n'alloue jamais de remplacement.

L'acteur :

1. relit l'enveloppe exacte et l'alarme `auto-scan` ;
2. prouve le consentement, l'auto-scan, l'intervalle, les ID de connecteurs livrés et les permissions
   d'hôtes actuelles à partir d'un snapshot immuable ;
3. réserve/relit un token monotone unique et
   son digest de snapshot exact dans `scanAdmission.phase:'reserved'` ;
4. appelle `tryAdmit` tout en maintenant le bail FIFO ;
5. sur un résultat accepté, écrit/relit `phase:'accepted'` ainsi que
   cet ID d'opération exact, puis efface/relit l'enregistrement tout en avançant
   `scanAckThrough` ; sur un résultat ignoré (skipped) exact, l'efface/le relit et
   avance directement le même niveau de référence ;
6. ne libère le bail qu'après l'une de ces preuves exactes.

Le scan utilise le snapshot immuable admis même si Settings change ultérieurement. Un
déclenchement obsolète, manquant, malformé, désactivé ou de mauvaise période ne démarre jamais de scan ;
l'acteur réconcilie et relit l'alarme selon l'attente canonique.
Une permission de connecteur manquante ignore également l'admission, mais n'efface **pas** une
alarme canoniquement présente : l'alarme reste alignée avec le consentement/paramètres et
un déclenchement ultérieur peut réussir une fois la permission restaurée. Un événement de stockage, une chaîne
de nom d'alarme ou un texte libre ne peut pas fabriquer une admission.

Lors d'un redémarrage avec le catalogue actuel, un enregistrement `reserved` durable rejoue `tryAdmit`
avec le même token ; un enregistrement `accepted` interroge (query) et exige l'ID d'opération accepté
exact stocké avant d'effacer. Sous un ancien catalogue, les deux phases utilisent
uniquement `query` : `reserved` peut retirer un résultat accepté/ignoré ou `not_found`,
mais `accepted` exige le résultat accepté stocké exact. Toute réponse contradictoire
ou inconnue bloque. Un crash après acceptation du scan ne peut donc pas
provoquer une seconde admission, et un port suspendu ne peut pas retenir une FIFO en mémoire
indéfiniment car le délai limite fait transiter vers un état de récupération bloqué durable.

## Matrice de revue

| Cas                                                   | Résultat terminal requis                                 | Effet interdit                          |
| ----------------------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| Nouvelle installation avant onboarding                | enveloppe prouvée, `ready`, alarme absente               | scan automatique                        |
| Migration héritée valide                              | enveloppe exacte + alarme + retrait hérité prouvés       | migration partielle                     |
| Crash après suppression des clés héritées             | la paire absente achève le retrait                       | faux blocage pour corruption            |
| Crash après suppression d'une seule clé héritée       | la clé exacte restante est retirée indépendamment        | faux blocage pour corruption            |
| Catalogue du build modifié                            | IDs reconnus intersectés avant `ready`                   | projection d'un connecteur retiré       |
| Changement de catalogue avec pending/outbox           | récupérer puis remplacer sans ancienne publication       | diffusion (broadcast) d'ancien snapshot |
| Changement de catalogue avec bail de scan             | retrait en query-only avant migration                    | admission d'ancien snapshot             |
| État hérité/enveloppe invalide                        | `blocked`                                                | repli par défaut ou réparation          |
| Édition de l'objet entier                             | committé après preuves d'enveloppe, permission et alarme | UI optimiste                            |
| Octroi/révocation de consentement                     | même transaction de mutation                             | écriture de stockage non corrélée       |
| Panneaux concurrents                                  | commit FIFO ou conflit avec snapshot canonique           | mise à jour perdue                      |
| Diffusion ancienne retardée                           | le panneau rejette le n-uplet plus ancien                | régression d'UI                         |
| Requête retenue dupliquée                             | résultat antérieur exact                                 | effet répété                            |
| Requête compensée évincée                             | conflit de révision obsolète                             | transition rejouée                      |
| Permission initiale manquante/inconnue                | non admise                                               | invite, écriture pending ou alarme      |
| Permission perdue après réservation                   | résultat durable à état inchangé                         | pending orphelin                        |
| Permission perdue après prepare                       | compensation prouvée ou `blocked`                        | règlement du candidat                   |
| Rejet avec relecture prévue                           | continuer à partir de la phase prouvée                   | rollback aveugle                        |
| Relecture tierce/illisible                            | `blocked`                                                | réessai aveugle                         |
| Défaillance de l'alarme                               | compensation prouvée ou `blocked`                        | diffusion de succès                     |
| Crash avant/après diffusion                           | rejeu/déduplication durable de l'outbox                  | panneau survivant obsolète              |
| Crash du worker avec commandes en file                | réessai de transport avec le même request ID             | résultat terminal inventé               |
| FIFO pleine au boot/runtime                           | rejet de transport typé avec snapshot null               | résultat métier fabriqué                |
| Retry pendant que la FIFO est pleine                  | verrou de contrôle réservé                               | état bloqué permanent                   |
| Redémarrage avec alarme candidate en attente          | résultat candidat récupéré                               | adoption silencieuse                    |
| Redémarrage avec alarme précédente                    | résultat précédent récupéré                              | projection du candidat                  |
| Révocation en concurrence avec sauvegarde             | la révision sérialisée ultérieure l'emporte              | alarme après révocation                 |
| Déclenchement d'alarme en concurrence avec révocation | le bail ordonne admission ou révocation                  | scan à snapshot mixte                   |
| Crash après acceptation du scan                       | le même token durable retourne la même admission         | scan dupliqué                           |
| Nettoyage du registre de scan                         | niveau de référence de retrait monotone                  | registre de résultats non borné         |
| Timeout du port de scan                               | enregistrement de récupération durable `blocked`         | rétention de FIFO en mémoire non bornée |
| Épuisement d'identité/compteur                        | rejet puis `blocked`                                     | repli aléatoire/non borné               |
| Restauration de sauvegarde ou réinitialisation locale | aucun point d'entrée visible                             | écriture multi-stores partielle         |

Résultat de revue : nominal, migration, consentement, permissions, panneaux concurrents,
diffusions désordonnées, écritures rejetées/ambiguës, compensation, récupération
après crash, réessais, idempotence, épuisement de compteurs et admission de scan cloisonnée sont
explicites. Aucune transition ne dépend d'un LLM ou de texte libre.

## Obligations de vérification

- Tests de transition XState pour chaque ligne, y compris les transitions interdites et
  le blocage terminal ;
- descripteurs hostiles, proxys, clés/connecteurs inconnus, compteurs non sûrs et
  divergence de contenu à révision/génération égale ;
- redémarrage à froid (cold) après réservation d'identité, prepare, application d'alarme,
  compensation, commit, publication d'outbox et suppression des clés héritées ;
- combinaisons indépendantes d'absence/présence pour les deux clés héritées pendant
  `pending_removal` ;
- deux panneaux, diffusions retardées, request IDs dupliqués et réessais obsolètes
  sur résultat évincé ;
- capacité de la FIFO/démarrage, déploiement (fan-out) bloqué et réessai de transport avec le même
  payload de requête, plus résultats de débordement exacts pour les mutations, lectures,
  déclenchements d'alarme et le verrou de contrôle de réessai réservé ;
- ordre exact create/get/clear/get pour l'alarme, revérifications de permission, rejeu idempotent
  de token de scan et délai limite d'admission de 10 secondes ;
- migration de l'empreinte de catalogue actuelle et historique, y compris auto-hashes
  exacts du registre, préservation exacte du préfixe de la dernière version, une empreinte
  inconnue, un ID retiré inconnu, une clé héritée valide de connecteur supprimé pendant
  `pending_removal`, rejet de toute empreinte historique dans `ready`, suppression des anciens
  pending/outbox et retrait en lecture seule (query-only) des anciens baux de scan ;
- chaque limite de compteur spécifique à une branche à une capacité exactement suffisante et manquante d'une unité
  avant tout effet externe ;
- preuve statique de l'absence de `permissions.request`, `alarms.clearAll`, repli
  permissif, lecteur/rédacteur hérité, second coordinateur ou rédacteur direct de
  `auto-scan` ;
- redémarrage du worker MV3 packagé à froid/chaud, conflit multi-panneaux, saut d'onboarding,
  octroi/révocation de consentement, édition des paramètres et scénarios de déclenchement d'alarme.
