# Modèle du Producteur de Transport de Candidat Scellé

Statut : **EN ATTENTE DE REVUE INDÉPENDANTE — RÉVISION 11 ; IMPLÉMENTATION INTERDITE**.
Révision du modèle : `11`
Pending content SHA-256: `bf681ebf0a2714f77bf48bfa0e121461ce69639814c5b60fbb6dffbadab43792`

Le hachage du contenu en attente est le SHA-256 des octets bruts UTF-8/LF complets de ce
fichier après avoir remplacé uniquement la valeur sur la ligne `Pending content SHA-256` par
le littéral `__PENDING_SHA256__`. Toute modification sémantique requiert un nouveau hachage et une
revue indépendante.

La révision 6 remplace le hachage du modèle de producteur en attente indépendamment rejeté
0fdd63f0d800cddd9ffa300ae6ec8945c571fc7c7f6e67a6f420c972b3aee8db,
qui remplaçait le hachage de modèle en attente rejeté
42aaebcfd22b1bd3c33ffca7fc85ed33a695ef7a425e4f9f2b7c85832c4cf649,
qui remplaçait le hachage rejeté
ac02d4d6b804af7b7f5b3613e124d35af1ba19cca6929d120e55bbcb58ae2183
et les hachages rejetés antérieurs
f0334ce24460b184d83eaa7e8e5a12cdb976bd2f1ed9e25e4cb631184687926a et
7e192fbd2ea866c4be0fc788f074e964464cef45f9fd5d70fdaeb2b719bfa012.
Le producteur rejeté sélectionnait encore `scenarios.v1.json` alors que son parent avait
basculé exclusivement vers l'inventaire V2 à treize entrées. La révision 6 supprime
cette autorité scindée et importe le chemin, le schéma, les ID ordonnés et les deux
hachages V2 exacts du parent. Aucune approbation ne se transfère depuis un hachage antérieur. Le formatage,
une revue indépendante et un nouveau hachage de contenu accepté sont requis avant que tout
code de producteur, de workflow, de politique ou de test ne puisse être implémenté.

La révision 6 a été indépendamment rejetée au hachage de contenu normalisé UTF-8/LF
`ab29a6e08e4d074ddbeeb7271a1634d7b39fbb314a4d71f20c64ff7c4bfb2029`
parce que son parent n'exposait aucun tuple complet d'autorité de modèle, son port fixe
d'objets Git ne lisait pas les blobs des modèles du harness MV3 et des onglets packagés, et sa
bascule V2 participait à un cycle d'implémentation parent/enfant. La révision 7
importe le tuple exact et les contrats d'activation conjointe de la clarification 7, lit et
recalcule les deux blobs de modèles validés, propage les deux tuples à travers le candidat,
l'audit et la gate packagée, et reste non autoritaire jusqu'à ce que l'unique CAS
d'activation conjointe soit validé. Aucune approbation ne se transfère depuis la révision 6.

La révision 7 a été indépendamment rejetée au hachage de contenu normalisé UTF-8/LF
`4a50bdd112538e6c27a1bdd2dee9199afb4ac8cb93d0991b659ee69baeb1560d`.
Elle attribuait au bac à sable de vérification une autorité déjà vérifiée, de sorte que la
production de reçu de vérification était circulaire. Son port Git authentifiait les blobs sélectionnés mais
exécutait toujours les outils contre le checkout ambiant, et l'activation ne recalculait
que les blobs de modèle MV3 et d'onglets packagés. La révision 8 consomme les ensembles
ordonnés par étapes de la clarification 8, matérialise et exécute un espace de travail propre complet
à partir d'objets Git de commit/arbre, et fait du recalcul des six blobs une
précondition d'activation. Aucune approbation ne se transfère depuis la révision 7.

La révision 8 a été indépendamment rejetée au hachage de contenu normalisé UTF-8/LF
`9230fb822573972143a077fa5f2d7936775268553ead12c7524b246b7f344799`.
Sa recapture Git pré/post détectait une dérive durable, mais chaque fichier source
matérialisé et parent restait accessible en écriture par son propriétaire pendant l'exécution des commandes. Un enfant pouvait
temporairement modifier, chmod, remplacer ou masquer des octets faisant autorité, dériver
`dist`, puis restaurer la projection Git attendue avant le reçu d'achèvement.
La révision 9 exécute chaque enfant depuis une vue source Git récursivement en lecture seule
imposée par l'OS, n'expose que des racines de sortie fermées et montées séparément, abandonne toute
autorité d'échappement de montage/capabilité, et lie des reçus pré/post
de montage/capabilité par commande. Aucune approbation ne se transfère depuis la révision 8.

La révision 9 a été retirée au hachage de contenu normalisé UTF-8/LF
`5c37fe07586b830b188fb0b6bf128e3955ae4ac103d16e32f56a1dea2c617872`.
Elle importait la clarification 9 de release-readiness retirée et la révision 6
des onglets packagés, de sorte qu'elle ne pouvait pas lier la sémantique CV/package corrigée. Elle
ne faisait pas non plus des trois échecs de CI observés des bloqueurs d'activation explicites :
CPython `3.14.5` autorisé par le contenu, la gate hôte fermée à dix commandes détenue par le producteur
derrière un véritable point d'entrée de contrôleur, et la politique exacte de téléversement
séparée `diagnostic_only` pour `test-mv3`. Un brouillon d'auteur provisoire de révision 10 importait
le hachage candidat de clarification 10
`371f1fd8d9ef83b3840aaecb860808b0ba54a44b66508153a566e35042588425`
et la révision 8 des onglets packagés au hachage
`4933b559dc9fca2977d7f3d7371eed69a4f72ca8f687979cb1ebee8716693155`,
mais cette chaîne a été retirée lorsque la révision 4 de CV a omis des lignes de transition en direct
pour les résolutions de callbacks périmées, inconnues ou discordantes. Le prochain candidat
de révision 10 doit lier la clarification 10 finale et la révision 9 des onglets packagés,
préserver la frontière d'exécution complète à source immuable, et clore les trois
responsabilités de workflow sans accorder d'autorité candidate au texte YAML brut ou aux artefacts
de diagnostic. Aucune approbation ne se transfère depuis la révision 9 ou le brouillon provisoire de révision 10.

La révision 10 a été retirée au hachage de contenu normalisé UTF-8/LF
`1d8116c0a4bb905b34e536df425d0282290735ee55ca9015ccebebb0e26d9dba`.
Son en-tête ciblait la clarification 10, la révision 5 de CV et la révision 9 des onglets packagés,
alors que les imports normatifs, les assertions de gate packagée et les obligations finales
sélectionnaient encore la clarification 9 et la révision 6 des onglets packagés. La révision 11
préserve le producteur complet à source immuable, l'inventaire V2 à treize ID,
l'activation à six créneaux et l'ensemble des trois responsabilités de CI à échec sécurisé, et
importe la clarification 11 ainsi que la révision 11 des onglets packagés à leurs hachages exacts.
La source de révision 11 des onglets packagés a été indépendamment approuvée et validée
sous le commit `ff9164c4`. Aucune approbation ne se transfère depuis la révision 10, tout candidat
retiré d'onglets packagés ou tout prédécesseur de CV.

Un candidat antérieur de révision 11 a été indépendamment rejeté au hachage de contenu
normalisé UTF-8/LF
`8769aa6fea28d0e1c37e416db27c30a7735bc8ec62cf2f38cbda16945e9fb1ab`.
Il importait le hachage rejeté de la clarification 11 de release-readiness
`c684d808d1827f5cc7d5f688547c7da0feca30935956dcb16dc197301a461287`,
dont la limite de 262 144 octets par créneau ne pouvait pas admettre le propre blob
de 267 797 octets du modèle parent. Le producteur révisé importe l'autorité
corrigée de la clarification 11 avec sa limite indépendante de 512 Kio pour chaque créneau de modèle conjoint. Aucune
approbation ne se transfère depuis le candidat de révision 11 rejeté ou le hachage parent.

Ce document est un raffinement strict côté producteur de la clarification 11
de `release-readiness.model.md` au hachage de comportement normalisé
`9afa97e0848b6c5c6540d33f38e29a409112a531f9ff2cd7124e50ef96511080`.
Les types tels que
`CandidateIdentityV1`, `AuditReceiptV1`, `ReleaseExecutionAuthorityV1`,
`SealedCandidatePayloadInventoryV1`, `TestedDistSealV1`, le contrat de
transport canonique, les trois types d'autorité de modèle échelonnés et leurs
ensembles ordonnés,
`JointReleaseModelActivationV1`, `REQUIRED_MV3_HARNESS_MODEL_V26`,
`REQUIRED_PACKAGED_TAB_MODEL_V11`, `ImmutableGitSourceExecutionAuthorityV1`,
`ImmutableGitSourceCommandReceiptV1`, `JOINT_MODEL_BLOB_RULES_V1` et
`PACKAGED_MV3_SCENARIO_INVENTORY_V2`,
`SealCandidateWorkflowClosurePolicyV1` et
`Mv3DiagnosticArtifactPolicyV1` conservent leurs
définitions normatives dans ce document et sont importés, jamais redéclarés. Si les deux
modèles sont en désaccord, l'implémentation reste bloquée en attente d'une nouvelle revue des modèles
parent et producteur ; une réinterprétation localement plus stricte ne peut réparer une
discordance d'autorité entre modèles.

L'implémentation reste interdite jusqu'à ce qu'une revue indépendante approuve les hachages
en attente exacts de ce producteur, de la clarification 11 de release-readiness, de la révision 26
du harness packagé MV3 à
`da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`,
de la révision 11 des onglets packagés à
`30b628046132da3222a7affb19044ed92d46ea71bf31192509f10a98e400ddb9`,
et de la révision 6 d'ancre accessible CV à
`d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98`.
Ces approbations n'autorisent que la phase d'implémentation conjointe fermée détenue par le parent ;
un test de producteur au vert ou une révision antérieure ne peut se substituer aux trois
reçus distincts par rôle ou à l'activation conjointe.

L'unique import d'autorité de scénario du producteur est :

```ts
import {
  PACKAGED_MV3_SCENARIO_INVENTORY_V2,
  JOINT_MODEL_BLOB_RULES_V1,
  REQUIRED_MV3_HARNESS_MODEL_V26,
  REQUIRED_PACKAGED_TAB_MODEL_V11,
  type ImmutableGitSourceCommandReceiptV1,
  type ImmutableGitSourceExecutionAuthorityV1,
  type JointImplementationVerificationSandboxV1,
  type JointModelVerificationEvidenceV1,
  type OrderedReviewedImplementedModelAuthoritySetV1,
  type OrderedReviewedImplementedVerifiedModelAuthoritySetV1,
  type JointReleaseModelActivationV1,
  type Mv3DiagnosticArtifactPolicyV1,
  type ReviewedImplementedVerifiedModelAuthorityV1,
  type SealCandidateWorkflowClosurePolicyV1,
} from 'missionpulse-release-readiness-clarification-11-authority';
```

Aucun objet de scénario local au producteur, alias de compatibilité V1 ou chemin de secours n'est
autorisé.

### Clôture CI de la clarification 11 portée par ce producteur

Les trois contrats de workflow de release en échec sont des preuves d'implémentation ROUGES,
et non une permission de patcher le YAML jusqu'à ce qu'une assertion textuelle passe au vert. Ce
producteur détient leur frontière d'implémentation fermée :

1. L'autorité de CPython `3.14.5` provient uniquement de l'archive exacte, du
   `release/Dockerfile` révisé, du contexte BuildKit fermé à deux fichiers, du digest de l'arborescence d'exécution
   et du digest de l'exécutable déjà définis dans la section 5. Le reçu de matériel/image
   résultant doit valider avant tout effet d'image d'exécution ou dépendant de Python. Le `PATH` du runner,
   `setup-python`, `PULSE_RELEASE_PYTHON`, une chaîne de version YAML et le chemin de release hérité
   `3.14.6` sont des solutions de secours interdites ; le chemin hérité doit être migré ou rendu non invocable,
   et non conservé comme seconde autorité de release.
2. Le workflow invoque un contrôleur de producteur autorisé par le contenu et un
   `commandPlanSha256` ; il ne reproduit jamais les dix commandes métier comme une autorité
   YAML libre. Le plan pur de host-gate du producteur détient leurs déclarations ordonnées exactes
   d'argv/cwd/environnement/sorties et le lanceur à source immuable détient leurs reçus. Le fichier actuellement référencé
   `scripts/build-sealed-candidate-transport.ts` est absent, donc aucun sceau
   de production ne peut être revendiqué tant que ce contrôleur et sa preuve d'inventaire source
   n'existent pas et que le plan exact à dix commandes ne s'exécute une fois avec un seul build d'extension.
3. L'étape existante `upload-mv3-evidence` de `test-mv3` est une projection
   `diagnostic_only` distincte. Le décodeur de politique parent, la factory de candidat
   et l'inspecteur de workflow ne doivent accepter que son action épinglée exacte, son job en lecture seule,
   sa condition, son chemin de rapport borné et sa rétention, tout en rejetant tout
   second uploader, mutable ou ayant la forme d'un candidat. Elle n'entre jamais dans l'acteur
   local, le plan de job privilégié, le candidat, le sceau, le handoff, le sujet d'attestation,
   le transport, le préfixe terminal ou l'autorité de transition de release de ce producteur.

Le START du producteur rejette une politique de clôture CI de clarification 11 manquante ou discordante
avant la matérialisation. La construction du handoff et du terminal revalide indépendamment
le reçu de matériel/image Python, l'ensemble exact de reçus des dix commandes et
la disjointure diagnostic/candidat. Une suite sans rapport au vert, un téléversement de diagnostic
absent ou une correspondance de sous-chaîne de commande brute n'ont aucune autorité.

## 1. Périmètre et non-revendications explicites

Le producteur comporte deux systèmes à états distincts :

1. un **acteur XState local** construit, teste, scelle et capture un transport
   exact ; son unique état terminal positif est transport_captured ;
2. une **saga intra-job GitHub Actions** valide le handoff local, demande aux
   actions épinglées d'attester et de téléverser, et enregistre une chaîne
   RUNNER_TEMP cohérente face aux crashs pendant que ce job exact est actif ; son état
   terminal positif local est uploaded_digest_verified, et son autorité positive
   inter-jobs est uniquement la publication terminale signée et durable à l'externe définie
   dans la section 9.1.

L'acteur local ne reste jamais actif d'une étape YAML à l'autre. Les sorties des actions GitHub sont
des observations non fiables, et non une autorité de transition. Le moteur de workflow YAML,
et non l'acteur local, invoque les actions d'attestation et de téléversement.

Aucun fichier de RUNNER_TEMP n'est garanti de survivre à la perte d'un runner. La durabilité
du transport entre jobs est assurée par les magasins authentifiés d'attestations et d'artefacts GitHub ;
la durabilité de l'état du producteur entre jobs est fournie séparément par
l'enveloppe sans remplacement `ProducerTerminalEnvelopeV1` et le reçu de publication signé dans le catalogue.
Le consommateur autorisé séparément les vérifie tous. La durabilité de l'acteur, de la réservation,
de l'ingestion de sceau et du terminal est fournie par le port concret
authentifié ExternalReleaseCatalogPortV1 dans la section 3.2, jamais par un fichier
du runner ou un adaptateur local au processus. Toute réservation active sans terminal
de producteur durable réussi requiert prudemment une réconciliation. Si le
runner disparaît avant que cette publication terminale externe ne soit validée, ce
producteur n'émet aucune revendication terminale inter-jobs ; les consommateurs rejettent le terminal
signé absent au lieu d'en reconstruire un à partir du texte d'étapes GitHub ou de fichiers locaux perdus.

Le producteur :

- ne consomme la clarification 11 qu'après que son hachage exact et son ensemble de politiques sont
  indépendamment approuvés ;
- ne peut être implémenté et testé qu'au sein de la phase conjointe inactive détenue
  par le parent ; son chemin `verification_only` ne consomme que l'ensemble ordonné
  revue-plus-implémentation et émet une preuve de vérification de créneau de producteur.
  Il ne peut pas consommer de reçu de vérification, d'ensemble vérifié ou d'activation sur ce
  chemin, et ne peut construire un acteur d'état de préparation à la release tant que le CAS
  d'activation exact n'est pas déjà validé ;
- dérive CandidateIdentityV1 et AuditReceiptV1 via la factory ci-dessous ;
- consomme, mais ne forge jamais, de capabilités de release-readiness ;
- construit l'acteur de release-readiness et la réservation dans le catalogue de manière atomique ;
- soumet le TestedDistSealV1 immuable via le CAS RC_SEAL_INGESTED
  médié par le contrôleur et prouve l'état durable rc_built avant le handoff ou
  le téléversement ;
- capture un fichier de transport à téléversement direct nommé exactement
  missionpulse-sealed-candidate ;
- crée une attestation de provenance GitHub SLSA pour ce fichier ;
- téléverse directement exactement ces octets sans archive englobante ;
- ne soumet jamais au Chrome Web Store, ne promeut pas, ne fait pas de rollback, ne supprime
  pas d'attestation, ne supprime pas d'artefact et n'écrase pas d'artefact.

La sortie d'une commande, une valeur GITHUB_OUTPUT, le résultat d'une action, un chemin de fichier, une URL, un
journal de workflow ou une déclaration de LLM ne peuvent à eux seuls faire progresser l'une ou l'autre machine.

## 2. Constantes figées, chemins et limites

```ts
type Sha256 = string; // exactly 64 lowercase hexadecimal ASCII characters
type CanonicalUtcTimestamp = string; // release-readiness timestamp contract

const PRODUCER_LIMITS = {
  jobTimeoutMs: 2_700_000,
  localActorTimeoutMs: 2_100_000,
  reservedSagaTimeoutMs: 600_000,
  childValidationTimeoutMs: 60_000,
  maxHandoffBytes: 4_194_304,
  maxSagaSnapshotBytes: 1_048_576,
  maxSagaSnapshots: 8,
  maxArtifactPublicationJoinBytes: 1_048_576,
  maxDispositionReceiptBytes: 1_048_576,
  maxTerminalPublicationReceiptBytes: 1_048_576,
  maxProducerTerminalStructuralBytes: 1_048_576,
  maxActionOutputAsciiBytes: 2_048,
  maxAttestationBundleBytes: 16_777_216,
  maxControllerEnvelopeBytes: 4_194_304,
  maxControllerStdoutBytes: 4_194_305,
  maxControllerStderrBytes: 1_048_576,
  maxFinalizerAuthorityBundleBytes: 100_663_296,
  maxFinalizerLocalGateJcsBytes: 1_048_576,
  maxFinalizerBuildReceiptJcsBytes: 25_165_824,
  maxFinalizerMv3GateReceiptJcsBytes: 50_331_648,
  finalizerTimeoutMs: 120_000,
  finalizerTerminateGraceMs: 5_000,
  maxPlaywrightJsonBytes: 67_108_864,
  maxPlaywrightOutputBytes: 536_870_912,
  maxPlaywrightOutputEntries: 20_000,
  maxBuildkitMetadataBytes: 16_777_216,
  maxOciArchiveBytes: 536_870_912,
  maxAuditEvidenceEnvelopeBytes: 4_194_304,
  maxCatalogRequestBytes: 5_242_880,
  maxCatalogResponseBytes: 4_194_304,
  maxProducerTerminalEnvelopeBytes: 16_777_216,
  maxProducerTerminalRequestBytes: 25_165_824,
  maxProducerTerminalRecordBytes: 25_165_824,
  maxCatalogClockSkewMs: 30_000,
  maxOidcTokenBytes: 16_384,
  producerProbeTimeoutMs: 60_000,
  maxProducerProbeStdoutBytes: 1_048_577,
  maxProducerProbeStderrBytes: 65_536,
} as const;

const PRODUCER_PATHS = {
  gitBackingRoot: '${RUNNER_TEMP}/missionpulse-git-execution-workspace/backing',
  executionRoot: '${RUNNER_TEMP}/missionpulse-git-execution',
  executionSourceRoot: '${RUNNER_TEMP}/missionpulse-git-execution/source',
  dependencyBackingRoot: '${RUNNER_TEMP}/missionpulse-git-outputs/dependencies',
  cacheBackingRoot: '${RUNNER_TEMP}/missionpulse-git-outputs/cache',
  distBackingRoot: '${RUNNER_TEMP}/missionpulse-git-outputs/dist',
  browserProfileBackingRoot: '${RUNNER_TEMP}/missionpulse-git-outputs/browser-profile',
  reportBackingRoot: '${RUNNER_TEMP}/missionpulse-git-outputs/reports',
  stateRoot: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state',
  sagaRoot: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/saga',
  localRoot: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local',
  admissionRoot: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/admission',
  auditReceipt:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/admission/release-audit-receipt.json',
  auditReport:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/admission/release-audit-report.json',
  handoff: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/producer-handoff.json',
  transport: '${RUNNER_TEMP}/missionpulse-sealed-candidate',
  localCancellationReceipt:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/local-cancellation-receipt.json',
  finalizerCwd: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/finalizer-cwd',
  finalizerHome: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/finalizer-home',
  finalizerStaging: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/finalizer-staging',
  finalizerAuthorityBundle:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/finalizer-authority-bundle.json',
  playwrightRaw:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/reports/playwright-mv3.raw.json',
  playwrightOutput:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/reports/playwright-mv3-results',
  packagedMv3Receipt:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/reports/packaged-mv3-gate.json',
  ownedToolRoot: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/tools',
  ownedNode: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/tools/node/bin/node',
  ownedPnpmCli:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/tools/pnpm/node_modules/.bin/bin/pnpm',
  immutableSourceLauncher:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/tools/immutable-source-exec',
} as const;
```

Chaque substitution à l'exécution est effectuée une seule fois depuis l'environnement de runner
de confiance. Les chemins développés doivent être des descendants absolus de RUNNER_TEMP,
doivent passer avec succès l'aller-retour dans le validateur de chemin POSIX validé, et ne doivent pas déjà
exister sauf lorsqu'un instantané de saga antérieur exact est requis.

Les répertoires state, admission, local, saga, reports, build-context et staging
sont créés de manière relative aux descripteurs avec le mode 0700. Chaque fichier faisant autorité
est un fichier régulier ouvert avec O_NOFOLLOW et borné avant allocation.
La publication utilise O_CREAT | O_EXCL, le mode 0600, fsync(file), fsync(parent), une
recapture relative au descripteur et une revalidation octet par octet. Les liens symboliques, les liens
physiques, les fichiers spéciaux, les substitutions de montage, les noms en double, les entrées inattendues
et les réouvertures par chemin d'accès comme autorité sont rejetés.

Le chemin du transport est un **fichier régulier unique** dont le basename est exactement
missionpulse-sealed-candidate. Son contenu est le ZIP canonique non-ZIP64
à sept composants défini par release-readiness.model.md. Il ne possède aucune extension
de nom de fichier car actions/upload-artifact avec archive:false dérive le
nom d'artefact depuis le nom de fichier et ignore son entrée name.

## 3. Factory START exacte

CandidateIdentityV1 et AuditReceiptV1 ne sont pas des entrées publiques. La seule valeur de
démarrage publique est :

```ts
interface ProducerStartRequestV2 {
  schema: 'missionpulse.sealed-candidate-producer-start';
  version: 2;
  actorId: string;
  releaseId: string;
  expectedCatalogRevision: number;
  repository: string;
  workflowPath: '.github/workflows/ci.yml';
  eventName: 'workflow_dispatch';
  sourceRef: 'refs/heads/main';
  headSha: string;
  runId: string; // canonical positive decimal ASCII, no leading zero
  runAttempt: number; // positive safe integer
  attemptStartedAt: CanonicalUtcTimestamp;
  attemptDeadlineAt: CanonicalUtcTimestamp;
  auditEvidence: {
    envelopeSha256: Sha256;
    envelopeBytes: number;
  };
}

interface ExternalAuditEvidenceChannelPolicyV1 {
  schema: 'missionpulse.external-audit-evidence-channel-policy';
  version: 1;
  policySha256: Sha256;
  origin: 'https://release-evidence.missionpulse.app';
  pathTemplate: '/v1/envelopes/sha256/{envelopeSha256}';
  method: 'GET';
  redirects: 'forbidden';
  credentials: 'omit';
  responseMediaType: 'application/vnd.missionpulse.producer-audit-evidence.v1+json';
  tlsSpkiSha256: readonly [Sha256, ...Sha256[]];
  maxResponseBytes: 4_194_304;
}

interface ExternalAuditEvidencePortV1 {
  kind: 'missionpulse.external-audit-evidence-port';
  policySha256: Sha256;
  fetchByDigest(input: { envelopeSha256: Sha256; envelopeBytes: number }): Promise<Uint8Array>;
}

interface ExternalReleaseCatalogPortPolicyV1 {
  schema: 'missionpulse.external-release-catalog-port-policy';
  version: 1;
  policySha256: Sha256;
  origin: 'https://release-control.missionpulse.app';
  oidcIssuer: 'https://token.actions.githubusercontent.com';
  catalogBrokerOidcAudience: 'missionpulse-release-catalog';
  repository: string;
  ref: 'refs/heads/main';
  workflowRef: string; // exactly {repository}/.github/workflows/ci.yml@refs/heads/main
  jobWorkflowPath: '.github/workflows/ci.yml';
  allowedJobId: 'seal-candidate';
  producerTerminalReadPathTemplate: '/v1/catalog/producer-terminals/{actorId}/{runId}/{runAttempt}';
  producerTerminalReadPathEncoding: 'rfc3986-uppercase-percent-v1';
  producerTerminalReadMethod: 'GET';
  producerTerminalReadCredentials: 'omit';
  producerTerminalReadRedirects: 'forbidden';
  producerTerminalResponseMediaType: 'application/vnd.missionpulse.producer-terminal.v1+json';
  producerTerminalMaxResponseBytes: 25_165_824;
  tlsSpkiSha256: readonly [Sha256, ...Sha256[]];
  receiptKeys: readonly [
    {
      issuer: 'missionpulse-release-catalog';
      keyId: string;
      algorithm: 'ed25519';
      publicKeyBase64: string;
    },
    ...{
      issuer: 'missionpulse-release-catalog';
      keyId: string;
      algorithm: 'ed25519';
      publicKeyBase64: string;
    }[],
  ];
  maxRequestBytes: 25_165_824;
  maxResponseBytes: 25_165_824;
}

interface ExternalReleaseCatalogPortV1 {
  kind: 'missionpulse.external-release-catalog-port';
  policySha256: Sha256;
  createReadinessActor(
    request: CreateReleaseReadinessActorRequestV1
  ): Promise<ReleaseReadinessActorConstructionReceiptV1>;
  ingestRcSeal(
    request: IngestReleaseCandidateSealRequestV1
  ): Promise<ReleaseReadinessRcSealIngestionReceiptV1>;
  publishProducerTerminal(
    request: PublishProducerTerminalRequestV1
  ): Promise<ProducerTerminalRecordV1>;
  recordDisposition(
    request: ProducerReservationDispositionRequestV1
  ): Promise<ProducerReservationDispositionReceiptV1>;
  readReservation(
    request: ProducerReservationReadRequestV1
  ): Promise<ProducerReservationDispositionReceiptV1>;
}

interface ProducerAdmissionV1 {
  sourceWorkspaceMaterialization: GitExecutionWorkspaceMaterializationV1;
  immutableSourceExecutionAuthority: ImmutableGitSourceExecutionAuthorityV1;
  candidate: CandidateIdentityV1;
  candidateJcsSha256: Sha256;
  audit: AuditReceiptV1;
  auditReceiptJcsSha256: Sha256;
  auditReportSha256: Sha256;
  admittedAt: CanonicalUtcTimestamp; // dérivé de l'horloge de confiance
  readinessActor: {
    actorId: string;
    releaseId: string;
    state: 'audited';
    expectedCatalogRevision: number;
    reservedCatalogRevision: number;
    reservationRecordSha256: Sha256;
    constructionReceiptSha256: Sha256;
    constructionReceipt: ReleaseReadinessActorConstructionReceiptV1;
    auditedContextSha256: Sha256;
  };
  correlation: ProducerRunCorrelationV1;
}

interface ProducerAuditEvidenceEnvelopeV1 {
  schema: 'missionpulse.producer-audit-evidence-envelope';
  version: 1;
  envelopeSha256: Sha256;
  repository: string;
  sourceCommit: string;
  releaseId: string;
  candidateJcsSha256: Sha256;
  issuer: string;
  keyId: string;
  authorizationPolicySha256: Sha256;
  auditReceiptJcsBase64: string;
  auditReceiptJcsSha256: Sha256;
  auditReportBase64: string;
  auditReportSha256: Sha256;
  issuedAt: CanonicalUtcTimestamp;
  expiresAt: CanonicalUtcTimestamp;
  signedPayloadSha256: Sha256;
  signatureAlgorithm: 'ed25519';
  signatureBase64: string;
}
```

La `ProducerTerminalReadAuthorityV1` du candidat est une projection pure et fermée
de `ExternalReleaseCatalogPortPolicyV1` : elle copie l'origine exacte, le modèle
de chemin GET terminal et la règle d'encodage RFC 3986 en majuscules, le digest
de la politique du port de catalogue, l'ensemble TLS SPKI, les clés de reçu et la limite
de réponse de 25 165 824 octets ; fixe la méthode GET, credentials omit, redirects
forbidden et le type de média terminal ; puis calcule son propre auto-digest
du modèle parent. Elle omet
délibérément l'audience OIDC en écriture seule et les méthodes de mutation. La factory exige
cette projection octet par octet avant de construire le candidat, de sorte que ni un
terminal de producteur ni une réponse de consommateur ne puisse choisir son vérificateur.

La factory est un acteur invoqué nommé, constructProducerAdmissionV2. Avant de
lire la requête, son port d'horloge de confiance capture factoryObservedAt. Son
prologue synchrone valide l'ensemble de la grammaire scalaire, des bornes, de la chronologie et les
égalités suivantes :

- repository est égal au repository authentifié par le runner ;
- workflowPath, eventName et sourceRef sont égaux aux littéraux ci-dessus ;
- headSha est égal au `GITHUB_SHA` authentifié ; le port d'objets Git prouve
  indépendamment que cet objet est le commit exact, sans consulter l'état du checkout ;
- runId et runAttempt sont égaux à GITHUB_RUN_ID et GITHUB_RUN_ATTEMPT ;
- actorId est égal au littéral dérivé en interne `producer:{runId}:{runAttempt}` ;
- attemptDeadlineAt - attemptStartedAt vaut exactement 2 700 000 ms ;
- factoryObservedAt n'est pas antérieur à attemptStartedAt et se situe au plus 5 000 ms
  après celui-ci ;
- expectedCatalogRevision est non négatif et sûr.

Chaque run ID dans la requête, la corrélation, le handoff, la saga, le catalogue, l'enveloppe terminale,
la projection d'attestation, l'URL d'action et le sélecteur de consommateur est la même chaîne décimale positive canonique
de 1 à 32 octets correspondant à `/^(?:[1-9]\d*)$/`. Il n'est jamais
parsé via un nombre JavaScript. Le texte du contexte GitHub et les projections authentifiées d'API ou
d'attestation doivent faire l'aller-retour vers ces octets exacts. `runAttempt`
reste un entier sûr positif.

La factory utilise ensuite un `GitObjectExecutionWorkspacePortV1` fixe :

```ts
interface GitExecutionTreeEntryV1 {
  path: string;
  mode: '100644' | '100755';
  objectId: string;
  byteLength: number;
  blobSha256: Sha256;
}

interface GitExecutionWorkspaceMaterializationV1 {
  schema: 'missionpulse.git-execution-workspace-materialization';
  version: 1;
  materializationSha256: Sha256;
  sourceCommit: string;
  gitTreeObjectId: string;
  gitObjectFormat: 'sha1' | 'sha256';
  controllerOnlyBackingRootIdentitySha256: Sha256;
  executionMountpointPlanSha256: Sha256;
  orderedTreeEntriesSha256: Sha256;
  treeEntryCount: number;
  treeByteCount: number;
  entries: readonly GitExecutionTreeEntryV1[];
  protectedSourceProjectionSha256: Sha256;
  materializedAt: CanonicalUtcTimestamp;
}

interface GitExecutionWorkspaceCompletionReceiptV1 {
  schema: 'missionpulse.git-execution-workspace-completion-receipt';
  version: 1;
  receiptSha256: Sha256;
  phase: 'local_handoff' | 'terminal_publication';
  materializationSha256: Sha256;
  immutableSourceExecutionAuthoritySha256: Sha256;
  sourceCommit: string;
  gitTreeObjectId: string;
  commandPlanSha256: Sha256;
  commandReceiptSetSha256: Sha256;
  commandReceipts: readonly [
    ImmutableGitSourceCommandReceiptV1,
    ...ImmutableGitSourceCommandReceiptV1[],
  ];
  preExecutionProtectedSourceProjectionSha256: Sha256;
  postExecutionProtectedSourceProjectionSha256: Sha256;
  generatedOutputInventorySha256: Sha256;
  result: 'passed';
  completedAt: CanonicalUtcTimestamp;
}
```

Il invoque uniquement l'exécutable littéral `/usr/bin/git` sous forme de tableaux d'arguments, sans
shell, alias, pager, objets replace, alternates, hooks, conversion de texte,
filtres, sous-modules, protocole réseau, sparse checkout ou autorité de contenu de worktree. Le port :

1. lit le format d'objet avec `/usr/bin/git rev-parse --show-object-format` ;
2. prouve que `headSha` est exactement un objet commit et résout exactement
   `headSha^{tree}` ;
3. exécute `/usr/bin/git ls-tree -rz --full-tree {gitTreeObjectId}` et parse
   chaque enregistrement délimité par NUL `<mode> <type> <object>\t<path>` sans guillemets ni
   découpage par saut de ligne ;
4. accepte uniquement `type=blob` et les modes `100644` ou `100755` ; le mode lien symbolique
   `120000`, le mode sous-module `160000`, les entrées d'arbres dans le résultat récursif et
   tout mode/type inconnu sont rejetés ;
5. exige que chaque chemin brut soit un UTF-8 valide et borné, relatif et canonique,
   sans segment vide, `.` ou `..`, barre oblique inverse, octet de contrôle, doublon,
   conflit de préfixe ou collision de casse ;
6. exige un ordre strict des chemins par octets non signés et la largeur exacte d'ID d'objet, borne
   le total des enregistrements/octets de chemins/octets de blobs avant allocation, et lit chaque blob
   listé via une session bornée `/usr/bin/git cat-file --batch-command --buffer`
   tout en vérifiant l'ID d'objet, le type et la longueur retournés ;
7. crée exactement le chemin sous-jacent réservé au contrôleur
   `${RUNNER_TEMP}/missionpulse-git-execution-workspace/backing` sous un nouveau parent
   détenu en mode `0700`, prouve que les deux étaient absents, ouvre le descripteur
   de racine backing une seule fois, et matérialise chaque répertoire/fichier listé
   de manière relative au descripteur avec `O_NOFOLLOW | O_CREAT | O_EXCL` ;
8. écrit exactement les octets de `cat-file`, attribue le mode `0644` ou `0755`, appelle fsync
   sur chaque fichier et répertoire créé, puis recapture de manière relative au descripteur chaque
   mode, nombre d'octets et SHA-256 avant d'exposer la capabilité d'espace de travail ; et
9. prouve que le tableau ordonné d'entrées recapturé est identique octet par octet à
   l'inventaire complet de `ls-tree`, ferme tous les descripteurs sous-jacents héritables par
   l'enfant et maintient le chemin backing en dehors de l'espace de noms de montage ultérieur de l'enfant. Il ne superpose,
   ne copie ni ne substitue jamais un fichier du checkout de l'appelant.

L'environnement Git fixe contient uniquement LANG=C.UTF-8, LC_ALL=C.UTF-8, TZ=UTC,
GIT_CONFIG_NOSYSTEM=1, GIT_TERMINAL_PROMPT=0, GIT_OPTIONAL_LOCKS=0,
GIT_PAGER=cat, et un HOME vide et dédié. PATH est absent et ne peut affecter
l'exécutable littéral. Chaque commande fournit également
-c core.hooksPath=/dev/null et -c protocol.file.allow=never. Le format d'objet
observé doit être égal au format validé du dépôt et détermine la
largeur d'ID d'objet acceptée ; aucune surcharge en ligne de commande ne le modifie.

`materializationSha256` est le SHA-256 du JCS de la matérialisation complète avec
uniquement `materializationSha256` omis. `orderedTreeEntriesSha256` est le SHA-256 du
JCS du tableau ordonné complet `entries`. L'arbre source commence avec chaque
entrée du commit et aucun autre chemin : par construction, il ne comporte aucune entrée modifiée, supprimée
ou non suivie. Ce n'est qu'après le gel de cette égalité que le contrôleur peut créer
les répertoires de points de montage de sortie vides et fixes nommés par
`executionMountpointPlanSha256` ; chacun reste non autoritaire, absent de Git
et couvert par son observation pré-montage vide. Aucun enfant de package ou de projet
ne peut en créer un. `protectedSourceProjectionSha256` est une projection JCS
rescannée indépendamment de **toutes** les entrées suivies, de ces points de montage vides
exacts déclarés, et de l'absence de tout autre chemin non suivi sous les espaces de noms
source protégés. Ces espaces de noms couvrent les fichiers
racines du dépôt, `.github`, chaque source de `apps/*` et `packages/*`, test, fixture,
harness, configuration Playwright, script, modèle, politique, manifeste, manifeste de package,
lockfile, configuration d'espace de travail/Turbo/Vite/TypeScript et Dockerfile de release. Il
n'existe aucun sous-ensemble maintenu manuellement.

Les chemins suivants restent des sous-projections obligatoires de cet arbre exhaustif,
ainsi que chaque chemin borné désigné par l'inventaire des sources de contrôleur validé et révisé :

- package.json, pnpm-lock.yaml, pnpm-workspace.yaml, et turbo.json ;
- apps/extension/package.json et apps/extension/src/manifest.json ;
- apps/extension/connectors.config.json ;
- apps/extension/tests/mv3/scenarios.v2.json ;
- apps/extension/src/models/release-readiness.model.md ;
- apps/extension/src/models/mv3-packaged-harness.model.md ;
- apps/extension/src/models/packaged-tab-scenarios.model.md ;
- apps/extension/src/models/cv-experience-card-accessibility.model.md ;
- apps/extension/src/models/sealed-candidate-transport-producer.model.md ;
- apps/extension/src/models/sealed-candidate-transport-consumer.model.md ;
- apps/extension/release/Dockerfile ;
- chaque source de contrôleur validée sélectionnée par l'inventaire de sources révisé ;
- .github/workflows/ci.yml ;
- apps/extension/scripts/release-readiness/policies/connector-authorities.v1.json ;
- apps/extension/scripts/release-readiness/policies/transport-attestation-policy.v1.json ;
- apps/extension/scripts/release-readiness/policies/github-trusted-root.v1.json ;
- apps/extension/scripts/release-readiness/policies/authorization-policy.v1.json ;
- apps/extension/scripts/release-readiness/policies/external-receipt-policy.v1.json ;
- apps/extension/scripts/release-readiness/policies/external-audit-evidence-channel-policy.v1.json ;
- apps/extension/scripts/release-readiness/policies/release-catalog-port-policy.v1.json ;
- apps/extension/scripts/release-readiness/policies/producer-host-tool-materials.v1.json ;
- apps/extension/scripts/release-readiness/policies/playwright-runtime-materials.v1.json.

Avant qu'un enfant de projet n'existe, le contrôleur crée un nouvel espace de noms
de montage Linux privé et construit le
`ImmutableGitSourceExecutionAuthorityV1` exporté par le parent. Une nouvelle racine d'exécution en lecture seule
contient exactement un bind récursif de la matérialisation backing complète à
`${RUNNER_TEMP}/missionpulse-git-execution/source`. Le contrôleur applique
la sémantique récursive `ro,nodev,nosuid,noexec` de manière atomique à ce montage source ;
la racine d'exécution et chaque ancêtre de montage par lequel un enfant peut adresser la
source sont également en lecture seule. Le chemin backing réservé au contrôleur n'est ni monté,
ni adressable, ni hérité par l'enfant. `overlayfs` et tout autre système de fichiers source d'union,
de copie vers le haut ou empilé sont interdits ; `overlayMountCount` vaut
exactement zéro.

Le plan d'exécution ne comporte que cinq types de racines inscriptibles : `dependencies`, `cache`,
`dist`, `browser_profile` et `report`. Chacun est un nouveau répertoire backing détenu par le contrôleur
en dehors de la matérialisation source et un montage `rw,nodev,nosuid` distinct.
Sa cible est soit en dehors de la vue source, soit un point de montage exact dont l'inventaire
complet `ls-tree` prouve l'absence, sans descendant suivi, et qu'une observation
relative au descripteur prouve vide immédiatement avant le rattachement. La cible de dépendance
couvre le seul magasin virtuel `node_modules`/pnpm autorisé ; elle n'est pas copiée sur un module validé.
Aucun montage inscriptible ne peut être un ancêtre source, un chemin suivi, un préfixe de chemin suivi,
un chemin de module/test/fixture/harness/script/modèle/politique/manifeste/lock/config, ni un masquage
en overlay/bind de l'un d'eux. Les montages imbriqués, chevauchants, en double, tardifs ou inconnus sont rejetés.

Chaque commande d'installation, de build, d'unités, de contrats, de release-readiness et de Playwright
s'exécute avec son `cwd` résolu de manière relative au descripteur sous la vue source en lecture seule
et avec chaque chemin de script/config/module du projet résolu depuis cette vue.
Chaque chemin autorisé de sortie, de cache, de profil de navigateur, de rapport et de `dist` est une
valeur explicite du plan de commande sous l'une des cinq racines montées. Le checkout de l'appelant
et l'arborescence backing du contrôleur ne sont ni montés ni lisibles par le sandbox
de commande ; `PWD`, `OLDPWD`, `INIT_CWD`, `NODE_PATH`, les préfixes de gestionnaire de paquets,
les caches et les répertoires temporaires sont des valeurs explicites fermées et ne peuvent nommer
l'un ou l'autre. Une commande dont le cwd, le script chargé, la config, le test, la fixture, le harness,
la source ou la sortie se résout en dehors de sa vue/racine déclarée est rejetée avant
le spawn.

Le contrôleur abandonne les ensembles de capabilités effectives, autorisées, héritables, ambiantes et
de délimitation, y compris `CAP_SYS_ADMIN`, active `no_new_privs`, et
installe la politique seccomp/écriture-système-de-fichiers révisée par le parent pour chaque enfant et
descendant. Il refuse `mount`, `umount2`, `move_mount`, `open_tree`,
`mount_setattr`, `fsopen`, `fsmount`, `fspick`, `pivot_root`, `chroot`,
`unshare`, `setns` et l'échappement par espace de noms utilisateur. Les tentatives d'écriture/troncature,
chmod/chown, lien physique, lien symbolique, renommage et remplacement ciblant la source échouent à la
frontière du système d'exploitation. Une frontière pidfd/cgroup joint l'arbre complet des descendants et interdit
à un assistant détaché de survivre à la capture du reçu.

Aucun enfant de projet/scénario ne peut résoudre ou hériter d'un
socket Docker/containerd/buildkit/systemd, périphérique FUSE, identifiant sudo, gain
setuid, gain de capabilité de fichier ou courtier de mutation privilégié. L'adaptateur hôte fixe ultérieur
Buildx/BuildKit reçoit seul son unique capabilité Docker en dehors de l'espace de noms
de l'enfant de projet. Il n'accepte que l'argv/environnement fermé et
le contexte de build à deux fichiers capturé séparément décrit ci-dessous ; il ne reçoit aucun
chemin source/backing, rappel de montage ou option sélectionnée par l'enfant, et ne retourne que
des reçus typés de métadonnées/OCI dans les racines de sortie déclarées. Le socket et l'adaptateur
brut n'entrent jamais dans le PATH, l'environnement, le système de fichiers ou les descripteurs d'une
commande source.

Chaque enfant démarre arrêté avant `exec`. Pendant qu'il est arrêté, le contrôleur de confiance
valide son identité exacte d'espace de noms de montage, `/proc/{pid}/mountinfo`, les drapeaux de lecture seule
de la source et des ancêtres, la liste de montage des cinq racines, les ensembles de capabilités de `/proc/{pid}/status`,
`no_new_privs`, l'état seccomp, le cwd et l'inventaire des descripteurs hérités.
Seul un processus correspondant est libéré. Après que l'arborescence complète des descendants se termine, les
mêmes observations sont répétées. Le `ImmutableGitSourceCommandReceiptV1` résultant exporté
par le parent lie l'exécutable, l'argv, l'environnement, le cwd, l'arbre de processus, la topologie
de montage pré/post, l'état des capabilités pré/post et l'inventaire des sorties fermées. Son auto-digest
omet uniquement `receiptSha256` ; le digest du tableau de reçus ordonné non vide est `commandReceiptSetSha256`.

Avant la première commande et après le dernier enfant joint, le port recapture
également de manière exhaustive toutes les entrées suivies et les espaces de noms protégés. Chaque
mode/octet/digest suivi est égal à la matérialisation et tout chemin inattendu
non suivi en dehors de l'inventaire des points de montage déclarés est terminal, mais cela
constitue une défense en profondeur plutôt que le mécanisme d'immuabilité
de la source. Un enfant ne peut temporairement muter, chmod, lier,
lier symboliquement, renommer, monter, remonter ou masquer la source et la restaurer plus tard : la frontière
de l'OS rend ces opérations impossibles pendant son exécution. Les racines de sortie
générées font l'objet d'un inventaire distinct et ne peuvent apparaître ailleurs.
`ImmutableGitSourceExecutionAuthorityV1.authoritySha256` omet uniquement lui-même du
pré-image JCS RFC 8785 complet. Le `receiptSha256` d'achèvement omet de même
uniquement lui-même ; il incorpore les reçus de commandes ordonnés complets, et ses projections
source protégée pré/post doivent être égales. Un octet source modifié, un ancêtre inscriptible,
un overlay, un masquage, un montage/sortie inattendu, une dérive de capabilité, une entrée
manquante, un chemin échappé ou un reçu de commande incomplet produit
`producer.admission.executed-source-invalid` et aucun acteur, sceau ou activation.

Aucune politique n'a de valeur par défaut générée. Un blob manquant, un schéma incorrect, une discordance
d'auto-digest, une discordance de projection de politique de workflow, une discordance d'autorité de connecteur ou
une politique supplémentaire non approuvée produit `producer.admission.policy-missing` ou
`producer.admission.policy-invalid` et ne publie aucun acteur.

Les blobs de scénarios et de modèles ne sont pas des contrats locaux au producteur. Le producteur
importe `PACKAGED_MV3_SCENARIO_INVENTORY_V2`,
`REQUIRED_MV3_HARNESS_MODEL_V26`, `REQUIRED_PACKAGED_TAB_MODEL_V11` et
`JOINT_MODEL_BLOB_RULES_V1` de la clarification 11 de release-readiness et
exige son chemin littéral `apps/extension/tests/mv3/scenarios.v2.json`, son schéma
`missionpulse.packaged-mv3-scenario-inventory`, sa version `2`, ses treize ID
ordonnés exacts, son SHA-256 de blob
`b386a936abad72ccd4fe2b0dd5cdf2390a6762e3d2ce3e0b0e07635f16f6a1ef`
et son SHA-256 de JCS du tableau de scénarios
`2a9c9f67e0c19a0dae126f7db15c25a0c1411b0753e63ecad6eaa0824720f79a`.
Le blob validé est vérifié octet par octet par rapport à cette autorité avant
la construction de l'acteur. Un chemin V1, un schéma V1, des octets V1 au chemin V2, une union
ou intersection V1/V2, un ID manquant/en trop/réordonné/en double, ou une constante d'inventaire
copiée localement est terminal avant la réservation dans le catalogue.

La même matérialisation d'objets Git contient exactement les six chemins de modèles dans
`JOINT_MODEL_BLOB_RULES_V1`. Le décodeur strict les lit uniquement via le
descripteur de racine d'exécution en lecture seule, exige UTF-8/LF sans BOM, exactement une
ligne de hachage spécifique au créneau et la révision exacte, puis remplace uniquement la valeur
hexadécimale à 64 caractères enregistrée par le placeholder fixe de ce créneau. Chaque SHA-256 de blob
Git brut doit être égal à son reçu de revue et chaque digest normalisé recalculé doit être égal à
l'identité d'autorité ordonnée correspondante. La révision 26 de MV3 doit de plus
être égale à
`da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b` ;
la révision 11 des onglets packagés doit être égale à
`30b628046132da3222a7affb19044ed92d46ea71bf31192509f10a98e400ddb9` ;
les identités figées du parent et de la révision 6 de CV doivent également correspondre. Une lecture dans l'arbre de travail,
un créneau d'autorité de modèle manquant/supplémentaire, un BOM/CRLF, une ligne de hachage ambiguë, un placeholder,
une révision plus ancienne, une convention alternative ou une dérive d'octets est terminal avant la réservation
dans le catalogue ou l'activation.

Le producteur comporte deux points d'entrée d'autorité disjoints. Le point d'entrée privé
`verification_only` exige le `JointImplementationVerificationSandboxV1` parent exact
intégrant un `OrderedReviewedImplementedModelAuthoritySetV1`. Il valide le digest
JCS de l'ensemble et la projection révisée, exige que l'autorité à source immuable/le plan de commande complet
du bac à sable corresponde à la frontière d'OS fraîchement construite,
matérialise/exécute l'arbre propre commun, et émet exactement un `JointModelVerificationEvidenceV1`
de créneau de producteur ainsi que l'ensemble complet ordonné de reçus de commande. Il
ne peut pas charger de reçu de vérification, construire un ensemble vérifié, réserver un acteur
de release, publier un transport ou forger une activation. Le point d'entrée de production rejette
ce bac à sable et n'accepte qu'un `JointReleaseModelActivationV1` final intégrant
un `OrderedReviewedImplementedVerifiedModelAuthoritySetV1` valide.

Pour la production, la factory charge l'ensemble des dix-huit blobs de reçus immuables désignés par
les six entrées vérifiées, vérifie leurs schémas/signatures spécifiques aux rôles,
les preuves acceptées et les jointures exactes chemin/révision/comportement/commit/arbre, et
exige que le candidat, l'audit et la gate packagée utilisent des projections MV3/package à index fixe
provenant de ce même ensemble. L'activation doit être finale, désigner ce commit/arbre source
exact, les deux digests V2, l'autorité à source immuable validée
et le digest de l'ensemble complet de reçus de commandes, et posséder une révision de catalogue d'activation
déjà validée avant la construction du candidat. Une phase révisée, implémentée ou
vérifiée mais non activée ne possède aucune autorité de producteur. Les signatures de reçus utilisent
uniquement la politique de reçus externes globale au contrôleur dont le digest est conservé par
l'ensemble et l'activation ; ni le producteur ni aucun tuple ne fournit de clés de vérificateur.

Le dépôt actuel ne contient pas encore authorization-policy.v1.json,
external-receipt-policy.v1.json,
external-audit-evidence-channel-policy.v1.json,
release-catalog-port-policy.v1.json,
producer-host-tool-materials.v1.json, ou
playwright-runtime-materials.v1.json. Les deux services HTTPS désignés et le
workflow seal-candidate actuel n'implémentent pas non plus encore les ports et la saga dans
les sections 3.2 et 9. Ce sont des bloqueurs d'admission explicites, et non des valeurs que
l'implémentation pourrait synthétiser ou remplacer par un fichier local au runner.

La factory dérive, dans l'ordre :

1. le SemVer validé et l'espace de noms de release ;
2. les valeurs SHA-256 du lockfile et de la configuration des connecteurs ;
3. l'ensemble des connecteurs inclus à partir du contrat validé de résolveur de connecteurs ;
4. le ManifestAuthorityV1 attendu à partir du modèle de manifeste validé,
   de la configuration des connecteurs et de l'ensemble d'autorités des connecteurs ;
5. l'inventaire exact de scénarios MV3 validé ;
6. l'ensemble des six identités exactes de modèles validées, leur ensemble d'autorité vérifié
   complet ordonné et l'activation conjointe validée ;
7. GitHubTransportAttestationPolicyV1 à partir des octets de workflow exacts validés,
   de la racine de confiance, de la projection de job privilégié, des uses épinglés, des permissions, des
   étapes ordonnées, des entrées, des expressions et de l'environnement ;
8. les deux politiques de signature et les politiques exactes indépendamment révisées de preuves,
   de port de catalogue, d'outils hôtes et de matériel Playwright ;
9. CandidateIdentityV1, y compris les projections MV3/package à index fixe issues de
   l'ensemble vérifié ordonné, le digest d'activation conjointe, la projection exacte
   d'autorité de lecture de terminal de producteur de la politique de catalogue, et son
   digest JCS.

Le manifeste construit ultérieurement doit être identique octet par octet à ce manifeste attendu.
Les octets dist réels peuvent confirmer l'attente mais ne peuvent pas la redéfinir.

### 3.1 Canal de preuves d'audit authentifié et immuable

Les preuves d'audit ne constituent délibérément pas un blob dans headSha : un commit ne peut pas contenir
une enveloppe dont la charge utile signée authentifie récursivement ce même commit.
La factory ne fait pas confiance aux chemins d'audit préexistants à l'exécution.
PRODUCER_PATHS.auditReceipt et PRODUCER_PATHS.auditReport doivent tous deux être absents. Le
digest de l'enveloppe et la taille de la requête sont uniquement des sélecteurs hostiles. La factory
construit l'unique URI autorisée en substituant envelopeSha256 dans le modèle de chemin
exact validé de ExternalAuditEvidenceChannelPolicyV1 ; aucun appelant ne fournit
d'origine, de chemin, de requête, de fragment, de port, d'identifiant, de redirection ou de miroir.

Le ExternalAuditEvidencePortV1 fixe effectue exactement un GET HTTPS direct. Il
n'utilise aucun proxy ambiant, cookie, identifiant, surcharge DNS ou nouvelle tentative ; accepte uniquement
une connexion TLS à adresse publique dont la chaîne terminale et le SPKI correspondent à la politique
validée ; ne suit aucune redirection ; et exige le statut 200, le type de média exact,
un Content-Length égal à request.envelopeBytes, un ETag exactement
`"sha256:{envelopeSha256}"`, et `Cache-Control: public, max-age=31536000,
immutable`. Il lit en continu au maximum 4 194 304 octets, exige le nombre exact d'octets
demandé et le SHA-256, et ne consomme aucune seconde réponse comme autorité. L'adressage par le contenu
de l'URI associé au stockage de service sans remplacement assure l'immuabilité ; l'épinglage TLS
SPKI et la signature de l'enveloppe assurent l'authentification.

Les octets retournés doivent déjà être le JCS RFC 8785 d'exactement un
ProducerAuditEvidenceEnvelopeV1. envelopeSha256 est exactement le SHA-256 sur le JCS de
l'enveloppe complète avec **uniquement** envelopeSha256 omis ; ce pré-image
comprend les deux valeurs de preuves en base64, signedPayloadSha256, signatureAlgorithm
et signatureBase64. La factory vérifie également le digest exact de la politique d'autorisation,
la paire émetteur/clé autorisée, chaque champ de corrélation de candidat,
audit.recordedAt <= issuedAt <= factoryObservedAt < expiresAt, une fenêtre d'expiration
d'au maximum 24 heures, et exige que signedPayloadSha256 soit égal au SHA-256 des
octets exacts ci-dessous. Elle vérifie la signature Ed25519 sur ces mêmes
octets séparés par domaine :

```text
missionpulse.producer-audit-evidence.v1\x00 ||
JCS({
  schema,
  version,
  repository,
  sourceCommit,
  releaseId,
  candidateJcsSha256,
  issuer,
  keyId,
  authorizationPolicySha256,
  auditReceiptJcsSha256,
  auditReportSha256,
  issuedAt,
  expiresAt
})
```

La factory décode strictement en base64 les deux chaînes d'octets incorporées bornées,
exige que leurs valeurs SHA-256 indépendantes soient égales aux digests signés, exige
que les octets de reçu soient déjà le JCS RFC 8785 d'exactement un AuditReceiptV1, et
exige que les octets et le nombre d'octets du rapport soient égaux à la référence de rapport imbriquée
de ce reçu. L'URI immuable du rapport est exactement
`https://release-evidence.missionpulse.app/v1/reports/sha256/{auditReportSha256}` ;
les octets incorporés rendent inutile une seconde récupération. Elle lie de manière croisée l'ID de release,
le commit source, la version, l'espace de noms, l'inventaire de scénarios, les nombres nuls de P0/P1 ouverts,
les domaines couverts, les projections MV3/package à index fixe de l'ensemble d'autorité de modèles vérifié
ordonné, le digest d'activation conjointe et la chronologie au
candidat dérivé. L'audit ne peut remplacer un
rôle de reçu par un autre ou nommer une phase révisée mais non activée.

Ce n'est qu'après cette validation authentifiée complète que la factory matérialise
les octets exacts de reçu et de rapport décodés aux deux chemins fixes d'exécution en utilisant
O_CREAT | O_EXCL, fsync(file), fsync(parent) et une recapture relative
au descripteur. Elle revalide ensuite les deux descripteurs d'exécution octet par octet par rapport
à l'enveloppe signée récupérée de l'extérieur. Aucune entrée de workflow, étape précédente,
fichier de worktree, variable d'environnement, auto-référence Git ou rapport non signé ne peut
produire l'une ou l'autre preuve.
Une preuve manquante, périmée, non signée, mal signée ou discordante correspond à
`producer.admission.audit-missing` ou `producer.admission.audit-invalid`.

### 3.2 Port de catalogue de release authentifié, durable et concret

`ExternalReleaseCatalogPortV1` est l'unique autorité de catalogue disponible pour ce
producteur. C'est un adaptateur non sérialisable vers l'origine exacte dans la
`ExternalReleaseCatalogPortPolicyV1` validée ; ce n'est pas une implémentation en mémoire, un blob
Git, une base de données dans RUNNER_TEMP, un artefact de workflow ou un chemin d'accès. Le service externe
applique un fsync durable à son `GlobalReleaseCatalogV1` en ajout seul et à son reçu
d'opération avant de retourner le succès. Une exécution autorisée ultérieure peut récupérer le même
enregistrement et reçu après une perte totale du runner.

Pour chaque opération, le courtier d'identifiants du port lit uniquement les
descripteurs ACTIONS_ID_TOKEN_REQUEST_URL et ACTIONS_ID_TOKEN_REQUEST_TOKEN fournis par le runner,
les borne, demande un JWT OIDC GitHub pour l'audience littérale du courtier de catalogue
`missionpulse-release-catalog`, et le conserve uniquement en mémoire jusqu'à ce que la seule
requête HTTPS se termine. Le JWT doit valider l'émetteur,
l'audience, le dépôt, la ref, le head SHA, workflow_ref, workflow_sha, event_name,
run_id et run_attempt par rapport à la requête et à la politique validée ; il expire en
cinq minutes au maximum. Ni le token ni l'URL de requête ne sont écrits dans une sortie,
un instantané, un reçu, un journal, l'environnement enfant ou sur le disque.

Cette utilisation du courtier est disjointe du protocole OIDC de `actions/attest` épinglé. L'action
d'attestation peut seule demander des tokens GitHub avec les audiences littérales
`nobody` et `sigstore`, dans l'ordre interne révisé de cette action et uniquement pour
son échange Sigstore/Fulcio. Les modules du courtier de catalogue rejettent ces deux audiences ;
l'action épinglée ne reçoit aucune origine de catalogue, audience de catalogue, token bearer ou
méthode de requête de catalogue et ne peut pas demander `missionpulse-release-catalog` via
une entrée de workflow. La projection de la politique de workflow admet exactement ces deux consommateurs OIDC :
l'action épinglée pour `{nobody,sigstore}` et les modules du courtier de catalogue nommés
pour `{missionpulse-release-catalog}`. Un token partagé, une substitution d'audience, un assistant OIDC générique
ou un token transmis entre eux échoue de manière sécurisée.

Le port prend en charge uniquement ces opérations fixes :

| Méthode et chemin                                | Requête typée                           | Effet                                                                                                                            |
| ------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| POST /v1/readiness/actors:construct              | CreateReleaseReadinessActorRequestV1    | persiste de manière atomique l'acteur audité et ajoute par CAS exactement un enregistrement candidate_reserved                   |
| POST /v1/readiness/actors:ingest-rc-seal         | IngestReleaseCandidateSealRequestV1     | applique par context-CAS exactement RC_SEAL_INGESTED et valide de manière durable rc_built sans changer la révision du catalogue |
| POST /v1/catalog/producer-terminals:publish      | PublishProducerTerminalRequestV1        | stocke sans remplacement une enveloppe de saga terminale complète et son reçu de publication signé                               |
| POST /v1/catalog/reservations:record-disposition | ProducerReservationDispositionRequestV1 | ajoute par CAS candidate_abandoned, ou signe une observation active/non réservée exacte et non mutante                           |
| POST /v1/catalog/reservations:read               | ProducerReservationReadRequestV1        | signe une observation de réservation exacte et non mutante                                                                       |

La politique fige de plus la route GET de terminal sans identifiants et ses
limites d'encodage/média/TLS/clés de reçu afin que la factory puisse projeter
`ProducerTerminalReadAuthorityV1` dans le candidat. Cette lecture est délibérément
absente de `ExternalReleaseCatalogPortV1` : le code du producteur ne peut récupérer ou
réinterpréter son propre terminal comme autorité de mutation, tandis que le consommateur utilise
uniquement la projection du candidat.

Chaque requête est un JCS RFC 8785 borné avec le type de média
application/vnd.missionpulse.release-catalog.v1+json. Elle utilise Authorization:
Bearer avec cet unique JWT OIDC et Idempotency-Key:
sha256:{requestSha256}. La construction d'acteur et la disposition/lecture du catalogue utilisent
`If-Match: "revision-{expectedCatalogRevision}"` ; l'ingestion de sceau utilise à la place
`If-Match: "context-sha256-{expectedContextSha256}"` ; la publication de terminal utilise
`If-None-Match: *` contre sa clé immuable acteur/run/tentative. Le HTTPS est direct,
utilise l'origine exacte et l'ensemble TLS SPKI de la politique, ne suit aucune redirection, n'utilise
aucun proxy ambiant ou cookie, et dispose d'une échéance unique de 60 000 ms sans nouvelle tentative
automatique. Une clé d'idempotence identique retourne des octets de reçu signés identiques octet par octet ;
une réutilisation de clé avec des octets de requête différents, un conflit HTTP, un champ de réponse inconnu,
un type de média incorrect, un corps surdimensionné, une divergence contexte/catalogue ou
une collision de clé de terminal échoue de manière sécurisée. Les requêtes de construction, de sceau et de disposition/lecture
restent bornées par `maxCatalogRequestBytes` et leurs réponses par
`maxCatalogResponseBytes` ; seule la requête de publication terminale portant du Base64
peut utiliser `maxProducerTerminalRequestBytes`, et seul son enregistrement signé peut utiliser
`maxProducerTerminalRecordBytes`. L'enveloppe terminale décodée est
bornée indépendamment par `maxProducerTerminalEnvelopeBytes` avant allocation.

Pour chaque requête de catalogue, requestSha256 est le SHA-256 sur le JCS avec
exactement requestSha256 et idempotencyKey omis ; idempotencyKey est alors
`sha256:{requestSha256}`. Cette omission de deux champs est l'unique règle de
pré-image de requête et supprime la dépendance d'idempotence récursive.

Chaque réponse est signée par une clé de reçu de catalogue exacte figurant dans la
politique validée et son `receiptSha256` omet uniquement lui-même. Les deux reçus
de release-readiness utilisent le domaine signé exact
`missionpulse.release-readiness-controller-receipt.v1` du modèle parent. Un
`ProducerTerminalPublicationReceiptV1` utilise le domaine exact défini avec ce
type dans la section 9.1. Les reçus de disposition/lecture utilisent le domaine ASCII
`missionpulse.release-catalog-receipt.v1\x00` suivi du JCS du reçu complet avec
receiptSha256, signedPayloadSha256, signatureAlgorithm et signatureBase64 omis ;
Ed25519 signe directement ces octets séparés par domaine. La réponse ne fait autorité
qu'après que son domaine exact, sa signature, son auto-digest, son digest de requête,
sa clé d'idempotence, sa corrélation, ses digests de candidat/audit/sceau/enveloppe, ses
révisions, sa séquence d'enregistrements, sa chronologie et son effet demandé s'associent tous selon ce qui
s'applique à ce type de réponse fermé.

Ce n'est qu'après que toutes les dérivations réussissent que la factory prélève un second
échantillon d'horloge de confiance comme admittedAt, exige factoryObservedAt <= admittedAt strictement
avant l'échéance locale, construit une `CreateReleaseReadinessActorRequestV1` et
invoque ce port une seule fois contre expectedCatalogRevision. Sa corrélation est la
projection `ReleaseReadinessProducerCorrelationV1` exacte de la corrélation plus riche
du producteur ; aucun champ n'est silencieusement abandonné, à l'exception du nom d'événement réservé au producteur.
La requête transporte les octets candidats et d'audit en Base64/JCS bornés exacts.
L'événement privé SOURCE_ACCEPTED transporte le ProducerAdmissionV1 complet dérivé
du `ReleaseReadinessActorConstructionReceiptV1` validé, y compris le
digest de contexte audité durable. Un échec de validation avant le CAS ne publie
ni acteur ni réservation. Dès que le CAS atomique acteur-plus-réservation
est validé, son enregistrement externe existe même si le runner meurt avant
SOURCE_ACCEPTED ; interpréter cet enregistrement actif comme
reconciliation_required après l'échéance, tel que spécifié dans la section 11,
empêche un orphelin d'être silencieusement réutilisé. Aucun candidat,
audit, heure d'admission, politique, manifeste, réservation, reçu, endpoint, clé ou
surcharge libre fourni par l'appelant n'est accepté.

## 4. Acteur producteur local

### 4.1 États et événements

```ts
type LocalProducerState =
  | 'created'
  | 'admitting_source'
  | 'capturing_tool_materials'
  | 'running_local_gates'
  | 'building_candidate'
  | 'testing_packaged_mv3'
  | 'freezing_dist'
  | 'bundling_controller'
  | 'building_execution_image'
  | 'proving_execution_image'
  | 'controller_invoking'
  | 'ingesting_rc_seal'
  | 'capturing_handoff'
  | 'transport_captured'
  | 'cleaning_failure'
  | 'cancelling'
  | 'cancelled'
  | 'failed';

type LocalProducerEvent =
  | { type: 'START'; request: ProducerStartRequestV2 }
  | { type: 'SOURCE_ACCEPTED'; admission: ProducerAdmissionV1 }
  | { type: 'TOOL_MATERIALS_CAPTURED'; receipt: ToolMaterialsReceiptV1 }
  | { type: 'LOCAL_GATES_PASSED'; receipt: LocalGateReceiptV1 }
  | { type: 'CANDIDATE_BUILT'; receipt: BuildReceiptV1 }
  | { type: 'MV3_GATE_PASSED'; receipt: PackagedMv3GateReceiptV1 }
  | { type: 'DIST_FROZEN'; receipt: FrozenDistObservationV1 }
  | { type: 'CONTROLLER_BUNDLED'; receipt: ControllerBundleReceiptV1 }
  | { type: 'EXECUTION_IMAGE_BUILT'; result: BuildkitProducerResultV1 }
  | {
      type: 'EXECUTION_IMAGE_PROVED';
      authority: ReleaseExecutionAuthorityV1;
      producerPort: ProducerExecutionImagePortV1;
    }
  | { type: 'CONTROLLER_COMPLETED'; result: ControllerProducerResultV1 }
  | {
      type: 'RC_SEAL_COMMITTED';
      receipt: ReleaseReadinessRcSealIngestionReceiptV1;
    }
  | { type: 'HANDOFF_CAPTURED'; handoff: ProducerHandoffV1 }
  | { type: 'LOCAL_STAGE_FAILED'; error: LocalProducerErrorV1 }
  | { type: 'CANCEL_REQUESTED'; reason: 'operator' | 'runner_sigterm' }
  | { type: 'LOCAL_FAILURE_CLEANUP_SUCCEEDED'; receipt: LocalCleanupReceiptV1 }
  | { type: 'LOCAL_CANCELLATION_CLEANUP_SUCCEEDED'; receipt: LocalCleanupReceiptV1 }
  | { type: 'LOCAL_CLEANUP_FAILED'; error: LocalProducerErrorV1 };

interface LocalProducerErrorV1 {
  schema: 'missionpulse.sealed-candidate-local-error';
  version: 1;
  errorSha256: Sha256;
  code: ProducerSagaErrorCode;
  correlation: ProducerRunCorrelationV1;
  stateAtFailure: Exclude<LocalProducerState, 'transport_captured' | 'cancelled' | 'failed'>;
  invocationId: string | null;
  causeSha256: Sha256 | null;
  retryable: false;
  observedAt: CanonicalUtcTimestamp;
}

interface CapturedDescriptorIdentityV1 {
  relativePath: string;
  kind: 'directory' | 'regular-file';
  mode: string;
  bytes: number;
  sha256: Sha256 | null; // null uniquement pour un répertoire
  device: string;
  inode: string;
  ctimeNs: string;
  mtimeNs: string;
}

interface FrozenDistObservationV1 {
  schema: 'missionpulse.frozen-dist-observation';
  version: 1;
  observationSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  buildReceiptJcsSha256: Sha256;
  packagedMv3ReceiptSha256: Sha256;
  rootAbsolutePath: string;
  descriptorSetId: string; // clé de registre privé, pas une autorité de réouverture de chemin
  entries: readonly CapturedDescriptorIdentityV1[];
  descriptorInventorySha256: Sha256;
  treeBeforeSuite: CanonicalTreeReceiptV2;
  treeAfterSuite: CanonicalTreeReceiptV2;
  frozenTree: CanonicalTreeReceiptV2;
  manifestBytesSha256: Sha256;
  manifestAuthoritySha256: Sha256;
  frozenAt: CanonicalUtcTimestamp;
}

interface ControllerBundleReceiptV1 {
  schema: 'missionpulse.controller-bundle-receipt';
  version: 1;
  receiptSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  sourceCommit: string;
  sourceInventory: readonly {
    repositoryPath: string;
    gitBlobObjectId: string;
    bytes: number;
    sha256: Sha256;
  }[];
  sourceInventorySha256: Sha256;
  sourceCount: number;
  bundleAlgorithm: 'esbuild-node-esm-single-file-v1';
  bundlerPackageTreeSha256: Sha256;
  outputRelativePath: 'release-controller.bundle.mjs';
  outputBytes: number;
  outputSha256: Sha256;
  outputMode: '0444';
  descriptorSetId: string;
  startedAt: CanonicalUtcTimestamp;
  completedAt: CanonicalUtcTimestamp;
}

interface BuildkitProducerResultV1 {
  schema: 'missionpulse.buildkit-producer-result';
  version: 1;
  resultSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  invocationId: string;
  toolMaterialsReceiptSha256: Sha256;
  frozenDistObservationSha256: Sha256;
  controllerBundleReceiptSha256: Sha256;
  builderName: string;
  buildxVersion: 'v0.34.1';
  buildxRevision: 'e0b0e77d18d3379bc1e0d55f3b37de288d36fe47';
  buildkitVersion: 'v0.30.0';
  createArgvSha256: Sha256;
  inspectArgvSha256: Sha256;
  buildArgvSha256: Sha256;
  removeArgvSha256: Sha256;
  rawMetadata: {
    bytes: number;
    sha256: Sha256;
    keySet: readonly [
      'buildx.build.provenance',
      'buildx.build.ref',
      'containerimage.descriptor',
      'containerimage.digest',
      'image.name',
    ];
    buildxSlsa02PredicateJcsSha256: Sha256;
  };
  rawOci: {
    bytes: number;
    sha256: Sha256;
    indexSha256: Sha256;
    imageManifestSha256: Sha256;
    imageConfigSha256: Sha256;
    attestationManifestSha256: Sha256;
    attestationConfigSha256: Sha256;
    rawStatementV01JcsSha256: Sha256;
    rawSlsaV1PredicateJcsSha256: Sha256;
  };
  projection: {
    algorithm: 'missionpulse.buildx-0.34.1-slsa1-to-slsa02-semantic-join.v1';
    joinSha256: Sha256;
    completenessEqual: true;
  };
  normalized: {
    buildMetadata: ImmutableBlobRefV1 & {
      kind: 'release-execution-buildkit-metadata';
    };
    buildProvenance: ImmutableBlobRefV1 & {
      kind: 'release-execution-slsa-provenance';
    };
    ociArchive: ImmutableBlobRefV1 & { kind: 'release-execution-image-oci' };
    indexSha256: Sha256;
    manifestSha256: Sha256;
    configSha256: Sha256;
    imageConfigEnvironmentJcsSha256: Sha256;
    layerSha256: readonly Sha256[];
    diffIdSha256: readonly Sha256[];
    finalRootInventorySha256: Sha256;
  };
  descriptorSetId: string;
  startedAt: CanonicalUtcTimestamp;
  completedAt: CanonicalUtcTimestamp;
}

interface LocalCleanupReceiptV1 {
  schema: 'missionpulse.sealed-candidate-local-cleanup';
  version: 1;
  receiptSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  reason: 'stage_failure' | 'operator' | 'runner_sigterm';
  cleanupStartedAt: CanonicalUtcTimestamp;
  everyChildStopped: true;
  buildxBuilderRemoved: true;
  liveDescriptorCount: 0;
  ambiguousStagingObjectCount: 0;
  publishedTransportBeforeCleanup: boolean;
  publishedHandoffBeforeCleanup: boolean;
  removedPublishedTransport: boolean;
  removedPublishedHandoff: boolean;
  publishedTransportAfterCleanup: false;
  publishedHandoffAfterCleanup: false;
  transportPathAbsent: true;
  handoffPathAbsent: true;
  reservationDisposition: 'unreserved' | 'abandoned';
  reservationDispositionReceiptSha256: Sha256;
  completedAt: CanonicalUtcTimestamp;
}
```

observationSha256, receiptSha256, resultSha256 et errorSha256 sont des SHA-256 sur le JCS RFC 8785
de leur valeur conteneur complète avec uniquement leur champ d'auto-digest correspondant
omis. L'inventaire source et l'inventaire de descripteurs sont triés par octets de chemin
UTF-8 non signés, ne contiennent aucune entrée racine implicite ou en double, et leur digest
porte sur le tableau JCS exact. `descriptorSetId` indexe un registre de descripteurs privé, figé
et non sérialisable détenu par l'acteur actuel ; la seule possession de la chaîne n'accorde
aucune autorité de lecture. Les descripteurs conservés doivent encore être égaux octet par octet
à chaque identité sérialisée avant chaque événement de succès ultérieur.

### 4.2 Table de transition

| État                     | Événement                            | Garde et effet                                                                                                                                                                                                                                                                                       | État suivant             |
| ------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| created                  | START                                | valider la requête ; invoquer constructProducerAdmissionV2                                                                                                                                                                                                                                           | admitting_source         |
| admitting_source         | SOURCE_ACCEPTED                      | conserver l'admission privée ; invoquer la capture d'outils matériels fixes                                                                                                                                                                                                                          | capturing_tool_materials |
| capturing_tool_materials | TOOL_MATERIALS_CAPTURED              | valider les versions et matériels exacts de Node, pnpm, Python, Buildx, BuildKit, Playwright, Chromium et FFmpeg                                                                                                                                                                                     | running_local_gates      |
| running_local_gates      | LOCAL_GATES_PASSED                   | valider le reçu exact de gate locale                                                                                                                                                                                                                                                                 | building_candidate       |
| building_candidate       | CANDIDATE_BUILT                      | valider l'unique build de production et le manifeste attendu                                                                                                                                                                                                                                         | testing_packaged_mv3     |
| testing_packaged_mv3     | MV3_GATE_PASSED                      | valider le reçu complet de scénarios sur le même dist                                                                                                                                                                                                                                                | freezing_dist            |
| freezing_dist            | DIST_FROZEN                          | conserver chaque descripteur de dist et l'observation immuable pré/post                                                                                                                                                                                                                              | bundling_controller      |
| bundling_controller      | CONTROLLER_BUNDLED                   | valider l'inventaire de sources validé et un bundle borné unique                                                                                                                                                                                                                                     | building_execution_image |
| building_execution_image | EXECUTION_IMAGE_BUILT                | valider les métadonnées brutes, la provenance et l'OCI normalisé à manifeste unique                                                                                                                                                                                                                  | proving_execution_image  |
| proving_execution_image  | EXECUTION_IMAGE_PROVED               | figer ReleaseExecutionAuthorityV1 ainsi que son port d'image réservé au producteur ; invoquer exactement un contrôleur finaliseur                                                                                                                                                                    | controller_invoking      |
| controller_invoking      | CONTROLLER_COMPLETED                 | valider l'unique résultat atomique et le descripteur de transport conservé ; invoquer le CAS exact du contrôleur de sceau RC                                                                                                                                                                         | ingesting_rc_seal        |
| ingesting_rc_seal        | RC_SEAL_COMMITTED                    | valider le reçu signé audited->rc_built, les digests de sceau/événement/contexte, la révision de catalogue inchangée et la recapture durable                                                                                                                                                         | capturing_handoff        |
| capturing_handoff        | HANDOFF_CAPTURED                     | exiger un rc_built durable ; valider la matérialisation de local-handoff, l'autorité à source immuable, les reçus de commande complets et la projection source exhaustive inchangée ; recapturer le transport ; publier uniquement le handoff sans remplacement ; émettre quatre sorties non fiables | transport_captured       |
| created                  | LOCAL_STAGE_FAILED                   | prouver que START n'a pas été accepté et qu'aucune réservation, aucun enfant, descripteur ou objet de staging n'existe                                                                                                                                                                               | failed                   |
| cleanup-required state   | LOCAL_STAGE_FAILED                   | révoquer les capabilités locales ; démarrer le nettoyage d'échec borné                                                                                                                                                                                                                               | cleaning_failure         |
| any cancellable          | CANCEL_REQUESTED                     | signal coopératif uniquement ; démarrer le nettoyage borné                                                                                                                                                                                                                                           | cancelling               |
| cleaning_failure         | LOCAL_FAILURE_CLEANUP_SUCCEEDED      | exiger reason=stage_failure ; prouver qu'aucun enfant, builder, ambiguïté de descripteur, transport/handoff local publié ou sortie partielle ne subsiste                                                                                                                                             | failed                   |
| cancelling               | LOCAL_CANCELLATION_CLEANUP_SUCCEEDED | exiger reason=operator ou runner_sigterm ; prouver qu'aucun enfant, builder, ambiguïté de descripteur, transport/handoff local publié ou sortie partielle ne subsiste                                                                                                                                | cancelled                |
| cleaning_failure         | LOCAL_CLEANUP_FAILED                 | préserver l'échec typé et l'ambiguïté de nettoyage                                                                                                                                                                                                                                                   | failed                   |
| cancelling               | LOCAL_CLEANUP_FAILED                 | préserver l'ambiguïté typée ; ne revendiquer ni annulation ni capture                                                                                                                                                                                                                                | failed                   |

Toute paire état/événement non répertoriée rejette sans mutation. Les événements privés de succès
doivent porter l'ID d'invocation exact, l'ID d'acteur, le run ID, le run attempt, le digest
du candidat et le résultat de l'enfant enregistrés par l'acteur d'entrée dans l'état. Les gestionnaires
d'événements valident les résultats achevés ; ils n'effectuent pas le travail.

transport_captured, cancelled et failed sont des états terminaux locaux.
transport_captured signifie uniquement que les octets locaux exacts et un handoff existent. Cela
ne signifie pas qu'ils sont attestés, téléversés ou prêts pour la production.

Les classes de transition ci-dessus sont fermées et disjointes. cleanup-required state
désigne exactement admitting_source, capturing_tool_materials, running_local_gates,
building_candidate, testing_packaged_mv3, freezing_dist, bundling_controller,
building_execution_image, proving_execution_image, controller_invoking,
ingesting_rc_seal, ou capturing_handoff. any cancellable désigne exactement ce
même ensemble. created ne peut
échouer directement que sous la preuve négative figurant sur sa ligne. cleaning_failure
accepte uniquement LOCAL_FAILURE_CLEANUP_SUCCEEDED ou LOCAL_CLEANUP_FAILED ;
cancelling accepte uniquement LOCAL_CANCELLATION_CLEANUP_SUCCEEDED ou
LOCAL_CLEANUP_FAILED. Aucun état, résultat de garde ou erreur ne peut choisir entre deux
états suivants.

La chronologie locale est exacte et utilise les millisecondes d'époque parsées :

```text
audit.recordedAt
<= localGate.startedAt <= localGate.completedAt
<= build.startedAt <= build.completedAt
<= mv3Gate.startedAt <= mv3Gate.completedAt
<= executionAuthority.startedAt <= executionAuthority.completedAt
<= controllerReceipt.startedAt <= seal.sealedAt <= controllerReceipt.completedAt
<= rcSealReceipt.committedAt
<= handoff.localCapturedAt
```

Le reçu correspondant est déjà complet avant que son événement de succès ne soit
accepté. Aucune étape ultérieure ne peut antidater, redéfinir ou reconstruire une valeur antérieure.

L'entrée dans `ingesting_rc_seal` construit exactement une
`IngestReleaseCandidateSealRequestV1` à partir du reçu de constructeur conservé et
du sceau exact produit par le finaliseur. `expectedContextSha256` est le digest
de contexte audité provenant de ce reçu de constructeur ; le Base64 du sceau est son JCS exact ;
et `eventSha256` est le digest local canonique du modèle parent de
`RC_SEAL_INGESTED`. L'acteur fixe `ingestProducerRcSeal` invoque uniquement
`ExternalReleaseCatalogPortV1.ingestRcSeal`. `RC_SEAL_COMMITTED` est accepté
uniquement lorsque le reçu signé prouve les mêmes acteur/release/candidat/sceau/événement,
l'état antérieur `audited`, l'état résultant `rc_built`, une révision de catalogue
inchangée, et un digest de contexte résultant dont l'acteur chargé séparément
recalcule exactement les octets. Une nouvelle tentative idempotente exacte peut retourner le même reçu ;
aucun événement différent n'est réessayé. Le handoff local et chaque étape de saga
à effets distants sont inaccessibles tant que cette garde ne passe pas.

Avant que l'un ou l'autre événement de succès de nettoyage ne soit émis, l'acteur local appelle l'opération
de disposition de ExternalReleaseCatalogPortV1. Comme l'acteur local n'a aucune capabilité
d'attestation/téléversement, les deux effets distants sont de manière prouvée inexistants : le port
soit authentifie qu'aucune réservation n'a été créée, soit abandonne par CAS la réservation
connue exacte. Le nettoyage avant la publication du transport exige que les quatre
booléens avant/suppression soient faux. Le nettoyage après l'étape de publication du finaliseur,
y compris les échecs dans `controller_invoking`, `ingesting_rc_seal` ou
`capturing_handoff`, doit utiliser la racine capturée conservée et les identités d'objets :
il prouve que le transport actuel et tout handoff sont les fichiers réguliers exacts
détenus par l'acteur, que chacun a un nombre de liens de un et un(e) périphérique/inode/mode/taille/
horodatages/digest inchangé, délie uniquement ces entrées de manière relative au descripteur, appelle fsync
sur chaque parent, recapture les deux noms littéraux comme absents, et définit chaque
drapeau `removedPublished*` exactement égal à son drapeau
`published*BeforeCleanup` correspondant. Une discordance d'identité, un objet étranger ou lié
physiquement, une réouverture par chemin d'accès, une identité conservée manquante, un fichier achevé non supprimable,
une entrée de staging inattendue ou un handoff partiel ambigu fait échouer le nettoyage et
ne peut émettre aucun des deux événements de succès de nettoyage. Aucune attestation ou artefact distant
n'est supprimé. Le même acteur supprime uniquement ses entrées de staging et de bundle d'autorité
du finaliseur privé correspondant à l'identité, appelle fsync sur leurs parents, et prouve que l'arbre
de staging privé est vide avant de fermer tous les descripteurs. L'acteur local écrit alors
exclusivement, applique fsync et
recapture le LocalCleanupReceiptV1 JCS exact à
PRODUCER_PATHS.localCancellationReceipt. receiptSha256 omet uniquement lui-même. Un
échec ou un signal sans ce reçu durable ne peut entrer ni dans failed local
via le nettoyage d'échec, ni dans cancelled local, et ne peut étayer le cancelled de la saga.

La configuration XState comporte les ID d'acteurs invoqués fermés suivants :
constructProducerAdmissionV2, captureProducerToolMaterials,
runProducerLocalGates, buildSingleCandidate, runSameDistMv3Gate,
freezeTestedDist, bundleReleaseController, buildPinnedExecutionImage,
provePinnedExecutionImage, finalizeSealedCandidateTransport,
ingestProducerRcSeal, captureProducerHandoff, cleanupProducerFailure, et
cleanupProducerCancellation. Chacun est invoqué uniquement lors de l'entrée dans son état
correspondant, reçoit une entrée typée figée et ne retourne que l'événement de succès
privé correspondant. La machine ne possède aucun acteur de commande générique, transition joker,
handle d'envoi à l'enfant public, ou acteur sélectionné par chaîne.

## 5. Outils matériels autorisés par le contenu

La chaîne d'outils de release exacte héritée de release-readiness.model.md demeure :

- Node 22.23.1 ;
- pnpm 10.32.1 avec intégrité
  sha512-pwaTjw6JrBRWtlY+q07fHR+vM2jRGR/FxZeQ6W3JGORFarLmfWE94QQ9LoyB+HMD5rQNT/7KnfFe8a1Wc0jyvg== ;
- CPython autonome 3.14.5 release 20260510 ;
- archive Python
  cpython-3.14.5+20260510-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz ;
- URL de l'archive Python
  https://github.com/astral-sh/python-build-standalone/releases/download/20260510/cpython-3.14.5%2B20260510-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz ;
- taille de l'archive Python 35 955 046 et SHA-256
  dc10977b0db3bef1ee2275107fde6fe9c148135b556fa352e83c6baa67d17ed6 ;
- SHA-256 de l'arborescence d'exécution Python
  82db8156fbb2fb988df9b609747e3e07b125133e702b55d076dd73419da10ba8 ;
- exécutable /opt/missionpulse-python/python/bin/python3.14 avec SHA-256
  a1512f9a07029c4a9b02a1bb63bbd156d36b0dcb26f49cb7f5ee175f19b222da ;
- image de base Node manifeste linux/amd64 SHA-256
  8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27.

L'invocation de Python utilise uniquement cet exécutable avec -I, -E, -S et -B. Elle utilise
l'environnement fixe et les octets du scanner de descripteurs de release-readiness. Le
scanner est transmis sous forme d'octets via -c ; le Python de l'hôte, setup-python,
PULSE_RELEASE_PYTHON, les site packages, les packages utilisateur, PYTHONPATH et le repli
par chemin d'accès sont interdits.

Buildx est autorisé par le contenu de manière indépendante :

```ts
const BUILDX_AUTHORITY = {
  version: 'v0.34.1',
  platform: 'linux/amd64',
  url: 'https://github.com/docker/buildx/releases/download/v0.34.1/buildx-v0.34.1.linux-amd64',
  bytes: 65_138_850,
  sha256: 'f1332ddb9010bd0b72628266c3a906d9a6979848033df4c8d9bd2cd113bae12b',
  installedPath: '${OWNED_DOCKER_CONFIG}/cli-plugins/docker-buildx',
  installedMode: '0555',
} as const;

const BUILDKIT_AUTHORITY = {
  version: 'v0.30.0',
  imageIndexSha256: '0168606be2315b7c807a03b3d8aa79beefdb31c98740cebdffdfeebf31190c9f',
  linuxAmd64ManifestSha256: '57269d1784e49b46228c45a1a1b870fbe40e0a639ab60b37b032d83af5bccdfc',
  driverImage:
    'moby/buildkit@sha256:57269d1784e49b46228c45a1a1b870fbe40e0a639ab60b37b032d83af5bccdfc',
} as const;

interface ReadOnlyToolTreeAuthorityV1 {
  sourceRoot: string; // absolute, exact policy-expanded path
  ownedRoot: string; // absolute descendant of PRODUCER_PATHS.ownedToolRoot
  entryCount: number;
  regularFileBytes: number;
  treeSha256: Sha256;
  entrypointRelativePath: string;
  entrypointBytes: number;
  entrypointSha256: Sha256;
  entrypointMode: '0444' | '0555';
  sourceDevice: string;
  sourceInode: string;
  ownedDevice: string;
  ownedInode: string;
}

interface ProducerHostToolMaterialsPolicyV1 {
  schema: 'missionpulse.producer-host-tool-materials-policy';
  version: 1;
  policySha256: Sha256;
  runner: 'ubuntu-24.04';
  architecture: 'x64';
  setupNodeAction: 'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1';
  setupPnpmAction: 'pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86';
  node: {
    version: '22.23.1';
    sourceRoot: '/opt/hostedtoolcache/node/22.23.1/x64';
    executableRelativePath: 'bin/node';
    entryCount: number;
    regularFileBytes: number;
    treeSha256: Sha256;
    executableBytes: number;
    executableSha256: Sha256;
  };
  pnpm: {
    version: '10.32.1';
    integrity: 'sha512-pwaTjw6JrBRWtlY+q07fHR+vM2jRGR/FxZeQ6W3JGORFarLmfWE94QQ9LoyB+HMD5rQNT/7KnfFe8a1Wc0jyvg==';
    setupDestination: '${RUNNER_TEMP}/missionpulse-bootstrap-pnpm';
    sourceRoot: '${RUNNER_TEMP}/missionpulse-bootstrap-pnpm';
    actionBinDestination: '${RUNNER_TEMP}/missionpulse-bootstrap-pnpm/node_modules/.bin/bin';
    cliRelativePath: 'node_modules/.bin/bin/pnpm';
    resolvedCliRelativePath: string; // cible exacte révisée dans la racine, jamais découverte via PATH
    entryCount: number;
    regularFileBytes: number;
    treeSha256: Sha256;
    cliBytes: number;
    cliSha256: Sha256;
  };
  immutableSourceLauncher: {
    sourceRoot: string;
    entrypointRelativePath: 'immutable-source-exec';
    entrypointBytes: number;
    entrypointSha256: Sha256;
    seccompPolicySha256: Sha256;
    filesystemWritePolicySha256: Sha256;
  };
}

interface ToolMaterialsReceiptV1 {
  schema: 'missionpulse.producer-tool-materials-receipt';
  version: 1;
  receiptSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  hostPolicySha256: Sha256;
  playwrightPolicySha256: Sha256;
  node: ReadOnlyToolTreeAuthorityV1 & {
    ownedRoot: string; // expansion exacte de la racine Node détenue
    entrypointRelativePath: 'bin/node';
    entrypointMode: '0555';
    versionStdoutSha256: Sha256;
  };
  pnpm: ReadOnlyToolTreeAuthorityV1 & {
    ownedRoot: string; // expansion exacte de la racine pnpm détenue
    entrypointRelativePath: 'node_modules/.bin/bin/pnpm';
    entrypointMode: '0555';
    versionStdoutSha256: Sha256;
    packageIntegrity: 'sha512-pwaTjw6JrBRWtlY+q07fHR+vM2jRGR/FxZeQ6W3JGORFarLmfWE94QQ9LoyB+HMD5rQNT/7KnfFe8a1Wc0jyvg==';
  };
  immutableSourceLauncher: ReadOnlyToolTreeAuthorityV1 & {
    ownedRoot: string;
    entrypointRelativePath: 'immutable-source-exec';
    entrypointMode: '0555';
    seccompPolicySha256: Sha256;
    filesystemWritePolicySha256: Sha256;
  };
  python: {
    archiveBytes: 35_955_046;
    archiveSha256: 'dc10977b0db3bef1ee2275107fde6fe9c148135b556fa352e83c6baa67d17ed6';
    runtimeTreeSha256: '82db8156fbb2fb988df9b609747e3e07b125133e702b55d076dd73419da10ba8';
    executableAbsolutePath: '/opt/missionpulse-python/python/bin/python3.14';
    executableSha256: 'a1512f9a07029c4a9b02a1bb63bbd156d36b0dcb26f49cb7f5ee175f19b222da';
  };
  buildx: {
    executableAbsolutePath: string;
    bytes: 65_138_850;
    sha256: 'f1332ddb9010bd0b72628266c3a906d9a6979848033df4c8d9bd2cd113bae12b';
    versionStdoutSha256: Sha256;
  };
  buildkit: {
    driverImageManifestSha256: '57269d1784e49b46228c45a1a1b870fbe40e0a639ab60b37b032d83af5bccdfc';
    reportedVersion: 'v0.30.0';
  };
  playwright: readonly [
    {
      kind: 'chromium';
      archiveBytes: 185_646_494;
      archiveSha256: '13113b963ac22fffdad898a677591028e4397c46c1daa9e61811258eed6e35b5';
      executableAbsolutePath: string;
      executableBytes: 278_568_152;
      executableSha256: '2d18db9d8608b052b6a552ee00ec1e830f93692e928b65ecc67d693bd33fe801';
    },
    {
      kind: 'ffmpeg';
      archiveBytes: 2_376_500;
      archiveSha256: 'ebc74fc5b94830176a3c2914ae96bd8bc7f6a91f4f33890230f84a172ee61ccc';
      executableAbsolutePath: string;
      executableBytes: 5_101_056;
      executableSha256: '460d44f3416005662f528d4b92e7b94ace924e8a0288106d3803b73c56eaadc8';
    },
  ];
  capturedAt: CanonicalUtcTimestamp;
}

interface PlaywrightRuntimeMaterialsPolicyV1 {
  schema: 'missionpulse.playwright-runtime-materials-policy';
  version: 1;
  policySha256: Sha256;
  runner: 'ubuntu-24.04';
  architecture: 'x64';
  playwrightVersion: '1.61.1';
  materials: readonly [
    {
      kind: 'chromium';
      revision: '1228';
      browserVersion: '149.0.7827.55';
      initialUrl: 'https://cdn.playwright.dev/builds/cft/149.0.7827.55/linux64/chrome-linux64.zip';
      finalUrl: 'https://storage.googleapis.com/chrome-for-testing-public/149.0.7827.55/linux64/chrome-linux64.zip';
      archiveBytes: 185_646_494;
      archiveSha256: '13113b963ac22fffdad898a677591028e4397c46c1daa9e61811258eed6e35b5';
      executableRelativePath: 'chrome-linux64/chrome';
      executableBytes: 278_568_152;
      executableSha256: '2d18db9d8608b052b6a552ee00ec1e830f93692e928b65ecc67d693bd33fe801';
      executableMode: '0755';
    },
    {
      kind: 'ffmpeg';
      revision: '1011';
      initialUrl: 'https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip';
      finalUrl: 'https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip';
      archiveBytes: 2_376_500;
      archiveSha256: 'ebc74fc5b94830176a3c2914ae96bd8bc7f6a91f4f33890230f84a172ee61ccc';
      executableRelativePath: 'ffmpeg-linux';
      executableBytes: 5_101_056;
      executableSha256: '460d44f3416005662f528d4b92e7b94ace924e8a0288106d3803b73c56eaadc8';
      executableMode: '0755';
    },
  ];
}
```

Chaque téléchargement de release GitHub utilise une URL HTTPS initiale exacte, des redirections manuelles,
aucun identifiant ou proxy ambiant, exactement une redirection 302 vers une
URL HTTPS release-assets.githubusercontent.com, et exactement une réponse 200 finale.
L'URL canonique, les vérifications DNS/TLS/adresse publique, la longueur déclarée, la longueur
bornée lue en continu et le SHA-256 doivent tous concorder. Il n'y a aucune reprise, miroir, résolution de balise,
architecture alternative ou seconde réponse prise comme autorité.

Node et pnpm ne sont pas autorisés par le succès de l'action de configuration, PATH, une chaîne
de version, Corepack ou les métadonnées de packageManager. La factory valide l'auto-digest
exact de la `ProducerHostToolMaterialsPolicyV1` validée et exige ses
versions, l'intégrité de pnpm, les épinglages d'action de configuration, les modèles de chemin source, les tailles en octets
et les valeurs SHA-256. Le workflow futur configure pnpm/action-setup avec la
destination exacte `${{ runner.temp }}/missionpulse-bootstrap-pnpm` ; l'unique arbre source
accepté de setup-node est
`/opt/hostedtoolcache/node/22.23.1/x64`. Toute autre disposition du runner est un échec
d'outils matériels strict, et non une alternative découvrable.

Au commit épinglé de pnpm/action-setup, Node 22.23.1 sélectionne l'auto-installateur non autonome
et une version cible différente de sa version bootstrap ; son
bin_dest attendu fermé est par conséquent exactement
`${RUNNER_TEMP}/missionpulse-bootstrap-pnpm/node_modules/.bin/bin`, et
l'entrée cible est exactement `pnpm` sous ce répertoire. La sortie de l'action est uniquement
vérifiée par rapport à ce littéral ; elle ne peut pas sélectionner un chemin. La politique
d'outils hôtes validée fige de plus la cible entièrement résolue dans la racine de l'entrée, le nombre
d'octets, le SHA-256 et le digest complet de l'arbre d'installation. Une sortie d'auto-mise à jour manquante,
un repli vers le `.bin` de bootstrap, un lien d'échappement, un binaire autonome ou une
disposition cible différente est rejeté.

captureProducerToolMaterials ouvre toutes les arborescences sources sélectionnées par la politique de manière relative au descripteur,
rejette les liens absolus/d'échappement, les liens physiques, les fichiers spéciaux, les mutations, les nombres d'entrées ou modes inattendus, et
vérifie l'arbre complet de la politique, le nombre d'octets du point d'entrée et le SHA-256
du point d'entrée. Elle copie ensuite les arbres exacts vers les deux racines détenues, les rend
en lecture seule, les recapture et répète la preuve complète. Chaque invocation de gate locale
Node/pnpm de premier niveau utilise l'exécutable PRODUCER_PATHS.ownedNode et comme premier
argument PRODUCER_PATHS.ownedPnpmCli sous forme de chemins absolus. Elle n'exécute jamais un
lanceur pnpm ou un node sélectionné par un shebang ou PATH.

La même capture valide l'arborescence source complète du lanceur sélectionnée par la politique,
les octets du point d'entrée et le SHA-256, la copie vers le chemin détenu exact avec le mode 0555,
conserve son descripteur et lie les digests révisés des politiques seccomp et d'écriture sur le système
de fichiers. Le lanceur est l'unique processus autorisé à créer l'espace de noms de montage
privé et à libérer un enfant arrêté. Un shell, un processus Node, un script de package,
une action épinglée ou une étape de workflow ne peut pas invoquer une commande de projet en dehors
de lui ; l'exécution directe constitue `producer.admission.executed-source-invalid`.

L'environnement parent pour chaque gate locale Node/pnpm est la table fermée
suivante ; les valeurs entre accolades sont des chemins absolus déjà validés. Aucune valeur héritée
ne survit :

```text
CI=1
HOME={owned empty host-gate home}
LANG=C.UTF-8
LC_ALL=C.UTF-8
TZ=UTC
PATH={ownedNodeBin}:{executionSourceRoot}/node_modules/.bin:/usr/bin:/bin
```

PATH n'existe que pour les descendants révisés du cycle de vie des packages. Le processus de premier niveau
est toujours l'exécutable Node absolu capturé. Chaque exécutable descendant
sélectionné depuis node_modules/.bin est ouvert depuis l'installation verrouillée par le lockfile,
capturé par descripteur avant et après la commande, et consigné dans le reçu de gate locale.
NODE_OPTIONS, NODE_PATH, PNPM_HOME, COREPACK_HOME, npm_config_*, les variables de proxy, les hooks de préchargement,
la configuration utilisateur et toute variable non déclarée sont absents. Le shell enfant fixe, lorsqu'un
script validé en requiert un, est `/bin/sh` ; les hooks de pré-installation/post-installation de package et une seconde
installation de dépendances sont interdits pendant les gates.

ToolMaterialsReceiptV1 est complet avant TOOL_MATERIALS_CAPTURED. Son
receiptSha256 est le SHA-256 du JCS RFC 8785 avec uniquement receiptSha256 omis. Chaque
chemin source/détenu développé est absolu même si son commentaire de type montre son
modèle. Le reçu lie de manière croisée la corrélation actuelle, les deux digests de politiques
validées, les identités des descripteurs conservés, les digests complets des arbres, les octets
exacts des points d'entrée, les digests des sorties de version, les autorités des archives téléchargées et
l'heure de capture. La sortie standard de version de Node doit être exactement `v22.23.1\n` ; la sortie standard
de version de pnpm doit être exactement `10.32.1\n`, avec une sortie 0, un stderr vide et au plus 64
octets sur stdout, mais ces auto-déclarations ne font que confirmer des octets déjà autorisés
par le contenu.

Chromium et FFmpeg sont également autorisés par le contenu. La factory lit le fichier
playwright-runtime-materials.v1.json validé depuis le port d'objets Git fixe,
valide son auto-digest et le tuple exact ci-dessus, et rejette les champs vides, en double,
relatifs, développés par redirection ou non bornés. captureProducerToolMaterials
télécharge chaque archive indépendamment depuis son URL initiale littérale avec des vérifications manuelles
de redirection et d'adresse publique, applique l'URL finale exacte de la politique,
le nombre d'octets lus en continu et le SHA-256, extrait dans une racine dédiée sans suivi de liens
avec l'extracteur d'archives sécurisé révisé, et prouve le nombre exact d'octets de l'exécutable
et le SHA-256. Elle consigne les autorités complètes de l'archive et de l'exécutable dans
ToolMaterialsReceiptV1. Ni playwright-core/browsers.json, ni un script d'installation,
ni un cache sur le runner, ni un navigateur préinstallé, ni PATH, ni l'auto-déclaration de version
ne peuvent autoriser des octets. La politique actuellement manquante maintient START
bloqué jusqu'à ce qu'une politique validée et indépendamment révisée soit égale octet par octet à chaque
URL, taille, digest, chemin et mode littéral figé ci-dessus.

## 6. Topologie et provenance figées de Buildx/BuildKit

### 6.1 Environnement dédié

L'acteur local délègue à l'adaptateur hôte Buildx fixe détenu par le contrôleur,
qui installe le binaire Buildx au chemin de plugin dédié exact ci-dessus et
invoque uniquement /usr/bin/docker. Cet adaptateur n'est pas un enfant de projet, n'expose aucun
socket/rappel Docker à un enfant et ne reçoit que le contexte de build à deux fichiers capturé
ainsi que la requête fermée. Le nom du builder est exactement
missionpulse-{runId}-{runAttempt} ; runId et runAttempt utilisent leurs formes validées
canoniques. Une exécution a un seul nom de builder, un seul nœud, un seul
pilote docker-container, une seule plateforme linux/amd64, aucun QEMU, aucun endpoint distant,
et aucun second builder.

L'environnement transmis à chaque commande Buildx est une table fermée :

```text
BUILDX_METADATA_PROVENANCE=max
DOCKER_CONFIG={owned absolute docker config}
DOCKER_HOST=unix:///var/run/docker.sock
HOME={owned empty home}
TMPDIR={owned temporary directory}
LANG=C.UTF-8
LC_ALL=C.UTF-8
TZ=UTC
SOURCE_DATE_EPOCH=0
```

PATH n'est pas consulté car le chemin de l'exécutable est absolu. Les variables de proxy,
les agents SSH, les registres, les identifiants, DOCKER_CONTEXT, BUILDKIT_HOST,
BUILDX_BUILDER, BUILDX_CONFIG, BUILDX_BAKE_FILE, BUILDX_DEFAULT_POLICY,
SOURCE_POLICY, les drapeaux de fonctionnalités expérimentales et toutes les variables non déclarées sont
absents.

Le contexte de build est un répertoire capturé par descripteur contenant exactement deux fichiers
réguliers :

1. Dockerfile, identique octet par octet à
   headSha:apps/extension/release/Dockerfile ;
2. l'archive Python autorisée exacte sous son nom d'archive littéral.

Aucun .dockerignore, métadonnées VCS, arbre source, socket, lien, secret, montage SSH,
montage de cache, contexte bind, contexte nommé, surcharge de frontend, argument de build ou
octet supplémentaire n'est présent.

### 6.2 Commandes exactes

Les commandes sont des tuples argv fixes. Les valeurs entre accolades sont des chemins absolus
déjà validés ou le nom canonique du builder ; aucun shell n'effectue d'interpolation.

```text
CREATE =
  /usr/bin/docker
  buildx
  create
  --name {builderName}
  --driver docker-container
  --driver-opt image=moby/buildkit@sha256:57269d1784e49b46228c45a1a1b870fbe40e0a639ab60b37b032d83af5bccdfc
  --driver-opt network=bridge
  --buildkitd-flags --oci-worker-gc=false
  --platform linux/amd64
  --use
  unix:///var/run/docker.sock

INSPECT =
  /usr/bin/docker
  buildx
  inspect
  --builder {builderName}
  --bootstrap
  --format {{json .}}

BUILD =
  /usr/bin/docker
  buildx
  build
  --builder {builderName}
  --platform linux/amd64
  --progress plain
  --file {contextRoot}/Dockerfile
  --network none
  --pull
  --no-cache
  --provenance=mode=max,version=v1
  --sbom=false
  --metadata-file {rawMetadataPath}
  --output type=oci,dest={rawOciPath},tar=true,oci-mediatypes=true,oci-artifact=true,name=docker.io/library/missionpulse-release-runtime:sealed-candidate
  {contextRoot}

REMOVE =
  /usr/bin/docker
  buildx
  rm
  --force
  {builderName}
```

L'ordre, l'orthographe, le placement des signes égal et le nombre de valeurs sont normatifs. Des drapeaux
supplémentaires ou manquants sont rejetés. Avant CREATE, l'argv exact `/usr/bin/docker buildx
version` doit se terminer avec le code 0, n'écrire aucun stderr et écrire exactement ces 74 octets UTF-8
sur stdout, y compris l'unique LF final et aucun CR :

```text
github.com/docker/buildx v0.34.1 e0b0e77d18d3379bc1e0d55f3b37de288d36fe47
```

Le parseur découpe exactement trois tokens ASCII et exige indépendamment que le package,
la version et la révision soient égaux à ces littéraux ; une correspondance par préfixe, une révision omise,
des espaces/lignes supplémentaires, un hachage tronqué ou toute autre auto-déclaration est rejeté. INSPECT
doit décoder strictement un objet JSON et prouver le nom du builder, le pilote
docker-container, un nœud, BuildKit v0.30.0, le manifeste exact de l'image du pilote,
linux/amd64, et aucun endpoint ou plateforme supplémentaire. Un résumé textuel lisible par l'humain
ne fait pas autorité.

CREATE et BUILD sont chacun invoqués exactement une fois. REMOVE est invoqué exactement une fois
après l'achèvement de BUILD ou lors du nettoyage observé. L'acteur ne réessaie jamais
sur place. Le téléchargement du pilote BuildKit et de l'image de base n'est autorisé que par leurs
digests exacts de manifeste. Toute résolution de tag mutable ou manifeste différent est
rejeté.

### 6.3 Projection exacte des métadonnées Buildx et SLSA v1 brut de BuildKit

Le drapeau explicite --provenance=mode=max,version=v1 est la requête exécutable
pour un prédicat brut SLSA Build Provenance v1. --sbom=false interdit une attestation
SBOM ; aucune valeur par défaut d'environnement ou version implicite de provenance Buildx n'est
acceptée. `BUILDX_METADATA_PROVENANCE=max` ne rend **pas** la valeur des métadonnées
égale octet par octet à l'attestation OCI brute : Buildx v0.34.1 convertit le prédicat BuildKit SLSA
v1 en un prédicat de compatibilité SLSA v0.2 avec perte avant d'écrire
`buildx.build.provenance`.

Le fichier de métadonnées brutes est privé et n'est jamais transporté tel quel. Un parseur
strict rejetant les clés en double accepte un objet JSON borné avec exactement cinq
clés :

- buildx.build.provenance ;
- buildx.build.ref ;
- containerimage.descriptor ;
- containerimage.digest ;
- image.name.

`image.name` doit être la chaîne JSON exacte
`docker.io/library/missionpulse-release-runtime:sealed-candidate`.
`containerimage.digest` et `containerimage.descriptor.digest` doivent tous deux être égaux au
digest de **l'index OCI brut de premier niveau**. `containerimage.descriptor` doit être
égal champ sémantique par champ sémantique au descripteur d'index brut émis pour cet
index : type de média `application/vnd.oci.image.index.v1+json`, digest, taille en octets
et annotations exactes ; ce n'est pas un descripteur de manifeste d'image. La plateforme n'est
prouvée qu'en parcourant cet index capturé. Il n'existe aucune clé de métadonnées
`containerimage.config.digest`. Le digest unique du manifeste d'image
et son digest de configuration unique sont dérivés exclusivement en validant le graphe de descripteurs
OCI brut et en faisant correspondre chaque blob référencé, jamais à partir des métadonnées
Buildx ou d'un scalaire copié.
`buildx.build.ref` doit être une référence Buildx bornée corrélée à l'invocation unique
du builder et est enregistrée, jamais traitée comme une autorité de contenu.

`buildx.build.provenance` doit être exactement un **objet prédicat** de provenance SLSA v0.2,
et non une déclaration in-toto ni un prédicat SLSA v1. Il doit avoir la
forme v0.2 fermée émise par la conversion SLSA1-vers-SLSA02 de `build/provenance.go`
de Buildx v0.34.1 : builder, buildType, invocation, métadonnées et matériaux ordonnés exacts ; il n'y a aucun champ
`_type`, `predicateType`, `subject` ou de premier niveau inconnu. Son
`metadata.completeness.materials` est une observation booléenne, et non une revendication de l'hôte.

Indépendamment, l'unique couche de prédicat OCI brute doit être exactement un Statement in-toto
dont le `_type` est `https://in-toto.io/Statement/v0.1`, dont le
`predicateType` est `https://slsa.dev/provenance/v1`, dont l'unique sujet est le
nom/digest du manifeste d'image prouvé, et dont le prédicat est la forme fermée SLSA v1 de BuildKit
v0.30.0. Dans ce prédicat, l'observation d'exhaustivité réside sous
`runDetails.metadata.buildkit_completeness.resolvedDependencies` ; elle n'est pas
lue depuis un chemin v0.2.

La garde figée `validateBuildx0341Projection` compare les deux représentations
sémantiquement plutôt qu'octet par octet. Elle exige une égalité exacte après la projection
connue de Buildx v0.34.1 pour : l'identité du builder ; le type de build ; les paramètres
externes/internes et le point d'entrée source ; les champs d'environnement d'invocation préservés par
le convertisseur ; chaque URI et digest de dépendance/matériel résolu ordonné ; la chronologie
de début/fin de build ; le drapeau de reproductibilité ; et
`raw.runDetails.metadata.buildkit_completeness.resolvedDependencies ===
metadata.metadata.completeness.materials`. Un champ éliminé par le convertisseur
n'est validé que dans le v1 brut et doit être absent du v0.2 ; un champ préservé par
le convertisseur doit être exactement identique. Des clés sémantiques inconnues, des nombres avec perte,
des clés JSON en double, des chaînes de digest non canoniques, des dépendances inventées,
une divergence d'exhaustivité, un matériel réseau non déclaré ou un sujet non égal
au manifeste d'image OCI prouvé est rejeté.

```ts
interface ProducerMaterialProjectionV1 {
  schema: 'missionpulse.producer-material-projection';
  version: 1;
  materials: readonly [
    { kind: 'base-manifest'; authority: 'buildkit-and-host'; sha256: Sha256 },
    { kind: 'recipe'; authority: 'git-object-source'; sha256: Sha256 },
    { kind: 'python-archive'; authority: 'download-capture'; sha256: Sha256 },
    { kind: 'build-context'; authority: 'host-descriptor-scan'; sha256: Sha256 },
  ];
  rawBuildkitResolvedDependenciesComplete: boolean;
  hostProjectionAddsLocalMaterials: true;
}
```

La projection ordonnée de matériaux requise par release-readiness.model.md est cette
valeur trans-autorité produite par le contrôleur. Son
provenanceMaterialsSha256 est le SHA-256 de ses octets JCS RFC 8785. Ce n'est pas une
revendication que BuildKit a émis les quatre entrées dans resolvedDependencies.

Le normaliseur émet :

- build-metadata.json sous forme de JCS RFC 8785 d'exactement
  `{schema:"missionpulse.normalized-buildx-metadata",version:1,buildxMetadata,producerMaterialProjection}`,
  où `buildxMetadata` est égal octet par valeur sémantique à l'objet Buildx exact validé
  à cinq clés (y compris son prédicat SLSA v0.2) et
  `producerMaterialProjection` est l'exact
  `ProducerMaterialProjectionV1` ; aucun scalaire dérivé de manifeste/config n'est
  inséré dans `buildxMetadata` ;
- build-provenance.json en tant que normalisation révisée de la **couche OCI brute**
  validée, jamais de la valeur de métadonnées avec perte : il copie le sujet, predicateType
  et le prédicat SLSA v1 octet par valeur sémantique, modifie uniquement `_type` de
  `https://in-toto.io/Statement/v0.1` à
  `https://in-toto.io/Statement/v1`, puis émet un objet JCS RFC 8785 ;
- ReleaseExecutionAuthorityV1 liant de manière croisée les deux fichiers, la recette, le contexte,
  les matériaux, les autorités Buildx/BuildKit, le bundle du contrôleur, le runtime Python,
  et le graphe OCI normalisé.

La disposition OCI brute doit contenir exactement deux descripteurs d'index : un manifeste
d'image linux/amd64 et un descripteur d'attestation de provenance BuildKit avec
une plateforme unknown/unknown. Le manifeste d'attestation doit contenir exactement une
couche de prédicat de type de média application/vnd.in-toto+json dont la charge utile est la
combinaison Statement/v0.1 validée et prédicat SLSA v1 ci-dessus. Comme BUILD inclut
`oci-artifact=true`, le manifeste d'attestation doit également comporter
`artifactType=application/vnd.docker.attestation.manifest.v1+json`, exactement un
descripteur `subject` égal octet par champ au type de média, digest
et taille du manifeste d'image sans plateforme ni annotations, et exactement un descripteur
de configuration de type de média application/vnd.oci.empty.v1+json dont les octets du blob sont
l'objet JSON vide canonique `{}`. Le descripteur d'attestation d'index possède
exactement les annotations de type de référence et digest de référence de BuildKit qui le lient
au manifeste d'image. Il n'y a aucun SBOM, seconde attestation, artefact
inconnu, référenceur ou index imbriqué.
Le normaliseur déterministe :

1. capture l'archive tar brute une seule fois et valide chaque en-tête et digest de blob ;
2. vérifie le manifeste unique, la configuration, les couches ordonnées, les diff IDs, l'historique et
   l'inventaire racine ;
3. supprime exactement le manifeste d'attestation de provenance, la configuration, le blob de prédicat
   et le descripteur d'index brut déjà validés ; tout blob non correspondant ou partagé
   est rejeté plutôt qu'éliminé ;
4. ne conserve que les deux annotations OCI révisées avec les valeurs exactes :
   io.containerd.image.name =
   docker.io/library/missionpulse-release-runtime:sealed-candidate et
   org.opencontainers.image.ref.name = sealed-candidate ;
5. reconstruit de manière canonique oci-layout, index.json et les blobs avec un ordre
   de chemin fixe, mode, uid/gid, uname/gname, mtime, PAX et terminaison tar ;
6. réouvre l'archive normalisée sans suivi de liens et répète la preuve complète
   du graphe.

L'index transporté normalisé comporte exactement un manifeste d'image comme l'exige
release-readiness.model.md. La normalisation ne peut supprimer que l'unique ensemble de descripteurs
de provenance exact précédemment validé ; elle ne peut pas effacer un descripteur inconnu ou
malformé pour faire passer un index brut hostile.

## 7. Gate hôte figée et invocation unique et fermée du finaliseur

La gate hôte locale dans la section 7.2 s'achève et fige dist avant que l'image
d'exécution ne soit construite. provePinnedExecutionImage retourne l'autorité
immuable ainsi qu'exactement une capabilité privée réservée au producteur :

```ts
interface FrozenProducerProbeInputV1 {
  schema: 'missionpulse.frozen-producer-probe-input';
  version: 1;
  inputSha256: Sha256;
  invocationId: string;
  candidateJcsSha256: Sha256;
  auditReceiptJcsSha256: Sha256;
  packagedMv3ReceiptSha256: Sha256;
  frozenDistTreeSha256: Sha256;
  controllerBundleSha256: Sha256;
  executionAuthorityJcsSha256: Sha256;
  imageManifestSha256: Sha256;
  imageRootInventorySha256: Sha256;
  effectiveContainerEnvironmentJcsSha256: Sha256;
  network: 'none';
  rootFilesystem: 'read-only';
  writableTmpfs: '/tmp/missionpulse-producer-probe';
  deadlineAt: CanonicalUtcTimestamp;
}

interface FrozenProducerProbeOutputV1 {
  schema: 'missionpulse.frozen-producer-probe-output';
  version: 1;
  outputSha256: Sha256;
  invocationId: string;
  inputSha256: Sha256;
  candidateJcsSha256: Sha256;
  executionAuthorityJcsSha256: Sha256;
  imageManifestSha256: Sha256;
  imageRootInventorySha256: Sha256;
  effectiveContainerEnvironmentJcsSha256: Sha256;
  controllerBundleSha256: Sha256;
  pythonRuntimeTreeSha256: Sha256;
  pythonExecutableSha256: Sha256;
  descriptorScannerSha256: Sha256;
  probeProgramSha256: Sha256;
  network: 'none';
  rootFilesystem: 'read-only';
  writableTmpfs: '/tmp/missionpulse-producer-probe';
  status: 'passed';
  observedAt: CanonicalUtcTimestamp;
}

interface ProducerProbeReceiptV1 {
  schema: 'missionpulse.producer-probe-receipt';
  version: 1;
  receiptSha256: Sha256;
  portId: string;
  invocationId: string;
  inputSha256: Sha256;
  authorityJcsSha256: Sha256;
  manifestSha256: Sha256;
  imageReference: string; // exactly missionpulse-release-runtime@sha256:{manifestSha256}
  executable: '/usr/bin/docker';
  argvSha256: Sha256;
  entrypoint: '/opt/missionpulse/producer-probe.mjs';
  network: 'none';
  rootFilesystem: 'read-only';
  stdinJcsSha256: Sha256;
  stdinBytes: number;
  output: FrozenProducerProbeOutputV1;
  exitCode: 0;
  stdoutJcsSha256: Sha256;
  stdoutBytes: number;
  stderrBytes: 0;
  startedAt: CanonicalUtcTimestamp;
  completedAt: CanonicalUtcTimestamp;
}

interface ProducerExecutionImagePortV1 {
  kind: 'missionpulse.producer-execution-image-port';
  portId: string;
  authorityJcsSha256: Sha256;
  manifestSha256: Sha256;
  invocationBudget: 1;
  invokeProducerProbe(input: FrozenProducerProbeInputV1): Promise<ProducerProbeReceiptV1>;
}

type ProducerFinalizerDescriptorBindingV1 =
  | {
      logicalName: 'dist-root';
      fd: 3;
      procPath: '/proc/self/fd/3';
      kind: 'directory';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'audit-receipt';
      fd: 4;
      procPath: '/proc/self/fd/4';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'audit-report';
      fd: 5;
      procPath: '/proc/self/fd/5';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'controller-bundle';
      fd: 6;
      procPath: '/proc/self/fd/6';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'build-metadata';
      fd: 7;
      procPath: '/proc/self/fd/7';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'build-provenance';
      fd: 8;
      procPath: '/proc/self/fd/8';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'normalized-oci';
      fd: 9;
      procPath: '/proc/self/fd/9';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'execution-authority';
      fd: 10;
      procPath: '/proc/self/fd/10';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'producer-probe-receipt';
      fd: 11;
      procPath: '/proc/self/fd/11';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'staging-root';
      fd: 12;
      procPath: '/proc/self/fd/12';
      kind: 'directory';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'finalizer-authority-bundle';
      fd: 13;
      procPath: '/proc/self/fd/13';
      kind: 'regular-file';
      identitySha256: Sha256;
    };

interface ProducerFinalizerAuthorityBundleV1 {
  schema: 'missionpulse.producer-finalizer-authority-bundle';
  version: 1;
  bundleSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  candidate: CandidateIdentityV1;
  candidateJcsSha256: Sha256;
  immutableSourceExecutionAuthority: ImmutableGitSourceExecutionAuthorityV1;
  releaseCommandReceiptSetSha256: Sha256;
  releaseCommandReceipts: readonly [
    ImmutableGitSourceCommandReceiptV1,
    ...ImmutableGitSourceCommandReceiptV1[],
  ];
  localGate: LocalGateReceiptV1;
  localGateJcsSha256: Sha256;
  buildReceipt: BuildReceiptV1;
  buildReceiptJcsSha256: Sha256;
  mv3GateReceipt: PackagedMv3GateReceiptV1;
  mv3GateReceiptJcsSha256: Sha256;
}

interface ProducerFinalizerInputEnvelopeV1 {
  schema: 'missionpulse.producer-finalizer-input';
  version: 1;
  inputSha256: Sha256;
  invocationId: string;
  correlation: ProducerRunCorrelationV1;
  candidateJcsSha256: Sha256;
  immutableSourceExecutionAuthoritySha256: Sha256;
  releaseCommandReceiptSetSha256: Sha256;
  localGateJcsSha256: Sha256;
  buildReceiptJcsSha256: Sha256;
  mv3GateReceiptJcsSha256: Sha256;
  finalizerAuthorityBundleBytes: number;
  finalizerAuthorityBundleSha256: Sha256;
  executionAuthorityJcsSha256: Sha256;
  frozenDistObservationSha256: Sha256;
  controllerBundleReceiptSha256: Sha256;
  buildkitProducerResultSha256: Sha256;
  producerProbeReceiptSha256: Sha256;
  descriptorBindings: readonly [
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 3 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 4 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 5 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 6 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 7 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 8 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 9 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 10 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 11 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 12 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 13 }>,
  ];
  stagingMustBeEmpty: true;
  deadlineAt: CanonicalUtcTimestamp;
}

interface ProducerFinalizerOutputEnvelopeV1 {
  schema: 'missionpulse.producer-finalizer-output';
  version: 1;
  outputSha256: Sha256;
  inputSha256: Sha256;
  invocationId: string;
  authorityJcsSha256: Sha256;
  payloadInventoryJcsSha256: Sha256;
  testedDistSealJcsSha256: Sha256;
  transportZipReceiptJcsSha256: Sha256;
  stagedTransport: {
    relativePath: 'missionpulse-sealed-candidate';
    bytes: number;
    sha256: Sha256;
    mode: '0600';
  };
  producerReceipt: ControllerProducerReceiptV1;
  completedAt: CanonicalUtcTimestamp;
}
```

Séparément, pour `FrozenProducerProbeInputV1` et
`FrozenProducerProbeOutputV1`, inputSha256 et outputSha256 omettent uniquement leur
champ d'auto-digest correspondant ; `ProducerProbeReceiptV1.receiptSha256` omet
de même uniquement lui-même. Cette invocation de sonde écrit les octets d'entrée JCS RFC 8785 exacts
plus un LF sur stdin, puis ferme stdin. L'entrée avec le LF fait au maximum 65 536
octets. L'enfant de la sonde doit écrire le JCS RFC 8785 exact d'un
FrozenProducerProbeOutputV1 plus un LF sur stdout, au maximum 1 048 577 octets, et
zéro octet sur stderr. L'hôte exige un UTF-8 strict, sans BOM/CR/clé en double,
le LF exact, l'auto-digest, toutes les égalités entrée/sortie, le code de sortie 0, et l'achèvement
avant la première échéance entre input.deadlineAt et le timeout fixe de 60 000 ms.
stdinJcsSha256 et stdoutJcsSha256 hachent les octets JCS respectifs sans le LF ;
stdinBytes et stdoutBytes incluent cet unique LF.

L'exécutable et l'argv uniques du processus sont :

```text
/usr/bin/docker
run
--interactive
--rm
--pull=never
--platform=linux/amd64
--read-only
--network=none
--cap-drop=ALL
--security-opt=no-new-privileges:true
--hostname=missionpulse-producer-probe
--user=65532:65532
--pids-limit=64
--tmpfs
/tmp/missionpulse-producer-probe:rw,noexec,nosuid,nodev,size=16777216,mode=0700,uid=65532,gid=65532
--entrypoint
/opt/missionpulse/producer-probe.mjs
missionpulse-release-runtime@sha256:{manifestSha256}
```

L'environnement du client Docker hôte est exactement
DOCKER_HOST=unix:///var/run/docker.sock, HOME={owned empty probe home},
TMPDIR={owned probe tmp}, LANG=C.UTF-8, LC_ALL=C.UTF-8, et TZ=UTC. PATH, proxy,
contexte Docker, identifiant, surcharge de socket et toute autre variable hôte sont
absents. Aucun `--env`, `--env-file` ou shell n'est utilisé. L'environnement effectif
du conteneur est le tableau ordonné Env fermé exact déjà parsé depuis la configuration
OCI prouvée plus uniquement l'entrée d'exécution exacte
`HOSTNAME=missionpulse-producer-probe` de Docker ; son digest JCS est
effectiveContainerEnvironmentJcsSha256 et la sonde rapporte indépendamment
le même digest. Des variables de conteneur inconnues, en double ou ajoutées à l'exécution sont
rejetées. L'image a été préalablement chargée et ré-inspectée sous le
BuildkitProducerResultV1 conservé ;
la référence locale doit se résoudre sans téléchargement vers le digest de manifeste exact
et les configurations/couches prouvées. L'invocation n'a aucun montage bind, volume, périphérique,
secret, capabilité, espace de noms hôte, racine inscriptible ou réseau. Son unique stockage inscriptible
est le tmpfs borné ci-dessus ; son unique entrée est stdin et son unique sortie
est stdout.

Le port n'expose aucune validation par le consommateur, promotion, téléversement, shell, argv
arbitraire, point d'entrée alternatif, montage, réseau ou méthode de second appel. Il n'est pas
sérialisable et n'est pas la voie de capabilité côté consommateur ultérieure
`ReleaseRuntimeHostAdmissionCapabilityV1` / `executeVerifiedOciRuntime`
de release-readiness.model.md. Son appel unique consomme le
budget à usage unique avant la création du processus et ne peut jamais être réémis, y compris
après un échec.

L'entrée dans controller_invoking invoque un acteur d'orchestration hôte fermé. Cet
acteur consomme le port à usage unique et appelle invokeProducerProbe exactement une fois
avant de démarrer exactement un processus de finaliseur de producteur fixe. Le port démarre
l'image prouvée par digest exact de manifeste et point d'entrée fixe avec le
FrozenProducerProbeInputV1 fermé, détient et joint l'enfant, et retourne un
ProducerProbeReceiptV1 typé. Ce n'est qu'après que l'hôte a validé ce reçu qu'il transmet
les octets JCS exacts du reçu et les descripteurs conservés de frozen-dist, rapport,
controller-bundle, BuildKit/SLSA, execution-authority et OCI normalisé
dans l'unique processus de finaliseur. Le processus ne reçoit aucun port actif
ni callback. Le finaliseur ne peut retourner de succès sans preuve de sonde égale octet par octet ;
zéro, deux, des invocations optionnelles, simulées, natives de l'hôte, avec argv/env Docker alternatifs,
portant des montages, avec réseau ou de port consommateur sont rejetées.

Le contrat du processus de finaliseur est fermé. L'hôte crée exclusivement les répertoires vides
`PRODUCER_PATHS.finalizerCwd`, `PRODUCER_PATHS.finalizerHome` et
`PRODUCER_PATHS.finalizerStaging` avec le mode 0700, appelle fsync sur leurs
parents, les ouvre de manière relative aux descripteurs, et prouve que l'arbre de staging a zéro
entrée. Avant la création du processus, il sérialise également exactement un
`ProducerFinalizerAuthorityBundleV1` vers
`PRODUCER_PATHS.finalizerAuthorityBundle` avec O_CREAT | O_EXCL, mode 0400,
fsync(file), fsync(parent), et recapture sans suivi de liens. `bundleSha256` omet uniquement
lui-même. L'autorité à source immuable et les reçus de commande dérivés de la source pré-finaliseur
ordonnés complets
sont les mêmes valeurs validées conservées par l'admission ; leurs digests d'autorité/d'ensemble
sont égaux à chaque sous-valeur de gate locale, build et MV3 packagé. Le candidat
et ces trois reçus sont les valeurs complètes déjà validées ; leurs digests d'octets
JCS RFC 8785 autonomes
sont égaux à leurs champs adjacents et leurs longueurs en octets sont respectivement bornées par
`RELEASE_LIMITS.maxCandidateIdentityJcsBytes`,
`maxFinalizerLocalGateJcsBytes`, `maxFinalizerBuildReceiptJcsBytes` et
`maxFinalizerMv3GateReceiptJcsBytes`. Le bundle complet fait au maximum
`maxFinalizerAuthorityBundleBytes`, et sa corrélation est exacte. Une référence
de blob, un reçu de commande/source omis, un sérialiseur alternatif ou un substitut par digest seul
est invalide. L'hôte conserve le descripteur de ce fichier. Le spawn du finaliseur
est lui-même un reçu de commande à source immuable ordonné ; ses seuls descripteurs
de staging/sortie inscriptibles se résolvent sous des montages de sortie déclarés. Pour éviter un
cycle d'auto-digest, ce reçu post-sortie est ajouté à l'ensemble d'achèvement de handoff
après que la sortie du finaliseur et le sceau soient validés ; le sceau et le reçu du contrôleur
lient l'ensemble pré-finaliseur complet. Il exécute exactement
`PRODUCER_PATHS.ownedNode`, sans shell, avec cet argv à trois tokens :

```text
{expanded PRODUCER_PATHS.ownedNode}
/proc/self/fd/6
produce-sealed-candidate-v1
```

Le répertoire de travail courant est exactement
`PRODUCER_PATHS.finalizerCwd` développé. L'environnement complet est exactement :

```text
HOME={expanded PRODUCER_PATHS.finalizerHome}
LANG=C.UTF-8
LC_ALL=C.UTF-8
TZ=UTC
```

`PATH`, `NODE_OPTIONS`, `NODE_PATH`, les variables de gestionnaire de paquets, les valeurs de proxy,
les identifiants, les variables GitHub, les variables Docker et toute variable non déclarée
sont absents. stdin, stdout et stderr sont trois pipes détenus aux descripteurs 0, 1
et 2. Immédiatement avant `execve`, le parent duplique les descripteurs source/staging/autorité
sans suivi de liens déjà conservés vers exactement les FD 3 à 13 dans l'ordre
du tuple de `ProducerFinalizerInputEnvelopeV1`. Il revalide chaque identité de descripteur
après duplication, efface délibérément `FD_CLOEXEC` sur exactement 3..13,
et ferme ou laisse `FD_CLOEXEC` activé sur tout autre FD hérité supérieur à 2.
L'enfant est un nouveau leader de groupe de processus. Il n'y a aucune réouverture par chemin d'accès, descripteur
ambiant, socket hérité, rappel ou numéro de FD alternatif.

Le parent sérialise un `ProducerFinalizerInputEnvelopeV1` exact en tant que JCS RFC 8785.
`inputSha256` omet uniquement lui-même. Son nombre d'octets de bundle d'autorité et
`finalizerAuthorityBundleSha256` sont égaux aux octets complets du fichier FD 13 conservé ;
ce digest de fichier brut est distinct du `bundleSha256` du bundle validé avec omission d'un champ.
Ses quatre digests de composants sont égaux aux valeurs validées à l'intérieur
de ce bundle. L'`identitySha256` de chaque liaison de descripteur
hache l'identité complète capturée
périphérique/inode/type/mode/taille/horodatages/contenu-ou-arbre, et le tuple ordonné
est exact. `deadlineAt` est la plus proche entre l'échéance de tentative du producteur
et la projection de temps réel de confiance de 120 000 ms depuis le démarrage du finaliseur. Le parent
écrit les octets JCS plus exactement un LF sur stdin, au maximum
`maxControllerEnvelopeBytes`, gère les écritures partielles, puis ferme stdin ; un EOF
avant/après ces octets exacts, une seconde valeur, un BOM, un CR ou des espaces supplémentaires sont
invalides. Le finaliseur ne lit les entrées sources que de manière relative aux descripteurs depuis
3..11 et 13. FD 13 doit être parsé comme le bundle exact lié par stdin avant que tout
octet du candidat ne soit consommé. Il ne peut créer que l'unique littéral
`/proc/self/fd/12/missionpulse-sealed-candidate` avec `O_CREAT|O_EXCL`, mode 0600. Il ne peut créer de frère, sous-répertoire, lien ou objet spécial.

stdout doit être exactement le JCS RFC 8785 d'un
`ProducerFinalizerOutputEnvelopeV1` plus un LF et au maximum
`maxControllerStdoutBytes` ; stderr doit être vide en cas de succès et est vidé et
borné par `maxControllerStderrBytes` pour chaque issue. `outputSha256` omet
uniquement lui-même. L'hôte valide le schéma/version, l'identité exacte
d'entrée/invocation, tous les digests scalaires, le `ControllerProducerReceiptV1` complet et
le seul fichier placé en staging avant d'accepter une sortie. La sortie ne répète
intentionnellement pas les octets d'autorité, d'inventaire, de sceau ou de reçu ZIP : l'hôte dérive
ces valeurs complètes à partir du transport capturé et du validateur ZIP canonique
ci-dessous, puis exige que leurs digests JCS soient égaux à l'enveloppe et
au reçu du contrôleur. Une enveloppe syntaxiquement valide n'autorise pas une
transition sans ce descripteur et cette preuve par digests croisés.

Un minuteur monotone sans réinitialisation applique cette échéance fixe. À l'échéance,
en cas de débordement stdout/stderr, d'échec de pipe/protocole ou d'annulation parentale, l'hôte
ferme stdin, envoie SIGTERM à l'ensemble du groupe de processus du finaliseur, attend au plus
5 000 ms, envoie SIGKILL au groupe si un membre subsiste, vide les deux pipes bornés
et joint le leader avec `waitpid`. Lors d'une sortie ordinaire, il vide de même,
joint avec waitpid et prouve qu'aucun membre du groupe ne subsiste. Aucun événement de succès n'existe tant que
le code de sortie 0, la validation complète de la sortie et cette jointure ne sont pas tous vérifiés. Un signal,
un timeout, un descendant non joint, une disposition inconnue du processus ou un échec de nettoyage
ne produit aucun résultat de contrôleur et laisse le staging privé pour l'acteur de nettoyage
local ; ce n'est jamais déduit comme une annulation ou un succès.

Il n'y a aucun protocole start/continue/finalize, démon, socket accessible
de l'extérieur, second exec de finaliseur, callback ou supposition qu'un contrôleur
survit. L'acteur XState local reçoit soit un résultat privé complet
après la sortie du processus, soit un échec.

```ts
interface CapturedTransportV1 {
  path: string; // exactly expanded PRODUCER_PATHS.transport
  basename: 'missionpulse-sealed-candidate';
  bytes: number;
  sha256: Sha256;
  mode: '0600';
  device: string;
  inode: string;
  ctimeNs: string;
  mtimeNs: string;
  descriptorToken: object; // autorité privée, figée, non sérialisable
}

interface ControllerProducerReceiptV1 {
  schema: 'missionpulse.controller-producer-receipt';
  version: 1;
  receiptSha256: Sha256;
  invocationId: string;
  actorId: string;
  releaseId: string;
  sourceCommit: string;
  runId: string;
  runAttempt: number;
  candidateJcsSha256: Sha256;
  immutableSourceExecutionAuthoritySha256: Sha256;
  releaseCommandReceiptSetSha256: Sha256;
  auditReceiptJcsSha256: Sha256;
  executionAuthorityJcsSha256: Sha256;
  payloadInventoryJcsSha256: Sha256;
  testedDistSealJcsSha256: Sha256;
  transportZipReceiptJcsSha256: Sha256;
  transportSha256: Sha256;
  transportBytes: number;
  packagedMv3ReceiptSha256: Sha256;
  producerProbeReceiptSha256: Sha256;
  startedAt: CanonicalUtcTimestamp;
  completedAt: CanonicalUtcTimestamp;
}

interface ControllerProducerResultV1 {
  authority: ReleaseExecutionAuthorityV1;
  inventory: SealedCandidatePayloadInventoryV1;
  seal: TestedDistSealV1;
  transport: CapturedTransportV1;
  receipt: ControllerProducerReceiptV1;
}
```

`ProducerFinalizerInputEnvelopeV1.inputSha256`,
`ProducerFinalizerOutputEnvelopeV1.outputSha256`, et
`ControllerProducerReceiptV1.receiptSha256` sont des SHA-256 sur le JCS de leurs
valeurs conteneurs complètes avec exactement leur auto-digest respectif omis.
`ProducerFinalizerAuthorityBundleV1.bundleSha256` suit la même règle d'omission
d'un seul champ. Tout autre digest JCS s'applique à la valeur validée complète. Cette
construction est acyclique : le reçu lie le reçu et les octets du transport final ;
ni le transport ni le sceau n'intègrent ControllerProducerReceiptV1.

Le finaliseur écrit uniquement dans le répertoire de staging privé frais exact ouvert
en tant que FD 12. L'enfant d'image
du port producteur préalable ne peut écrire que sur son tmpfs privé et stdout selon
le contrat de sonde ci-dessus. Le stdout du finaliseur est exactement le
`ProducerFinalizerOutputEnvelopeV1` fermé plus un LF ; le stderr en cas de succès est vide.
Les octets de transport restent dans un descripteur de fichier de staging conservé et sont
représentés dans l'enveloppe uniquement par le nom relatif, la taille, le digest et le digest
du reçu ZIP de transport. Après que le finaliseur
se termine avec 0 et que son enfant soit joint, l'hôte :

1. capture l'arborescence complète de staging sans suivi de liens et exige exactement l'unique
   fichier régulier `missionpulse-sealed-candidate` avec le mode 0600 et aucune entrée
   supplémentaire ;
2. parse l'autorité, l'inventaire à six entrées et le sceau depuis l'unique transport capturé,
   recalcule le reçu ZIP de transport canonique complet à partir de
   ces octets, et valide l'ensemble des sept composants de transport et chaque
   digest croisé par rapport à la sortie et au reçu du contrôleur ;
3. exige que l'autorité complète extraite du transport soit égale octet par octet à l'autorité du FD 10
   transmise lors de l'invocation et valide le ProducerProbeReceiptV1 obligatoire
   par rapport à l'ID de port consommé, au digest de manifeste, au point d'entrée fixe,
   à l'ID d'invocation, à l'entrée, à la sortie, à la chronologie et à la sortie de l'enfant ;
4. prouve que le budget d'invocation du port producteur est épuisé exactement une fois ;
5. publie le transport sans remplacement vers PRODUCER_PATHS.transport et conserve
   le descripteur final recapturé ;
6. construit le CapturedTransportV1 privé à partir de ce descripteur final ;
7. ne construit ControllerProducerResultV1 qu'après que toutes les validations ont réussi.

L'étape 5 est la seule publication de transport de tout le producteur. Elle utilise une
écriture O_CREAT | O_EXCL à partir du descripteur de staging conservé, fsync(file),
fsync(parent) et une recapture de descripteur sans suivi de liens. captureProducerHandoff n'est
pas autorisé à créer, renommer, copier, tronquer ou remplacer le transport. Il ne fait que
revalider le descripteur déjà publié par rapport à CapturedTransportV1 et
publie ensuite exclusivement PRODUCER_PATHS.handoff et les quatre pistes de sortie non fiables.
Un transport existant avant l'étape de publication 5, ou une tentative de seconde
publication lors de la capture du handoff, est rejeté.

Une sortie, un signal, un timeout, des stdout/stderr supplémentaires, un résultat partiel, un fichier manquant,
un fichier en trop, un descripteur modifié ou un composant invalide ne donne aucun
ControllerProducerResultV1. Une sortie de staging partielle n'est jamais un candidat et n'est
jamais exposée à la saga.

### 7.2 Gate hôte MV3 packagé sur le même dist

Avant la première commande, captureProducerToolMaterials a déjà installé
les archives autorisées par le contenu de Chromium et FFmpeg dans la racine Playwright
détenue et en a conservé les reçus. Il n'y a aucun `playwright install`,
`--with-deps`, invocation apt, téléchargement de navigateur ou accès à un cache mutable dans la
gate. L'image de runner ubuntu-24.04 est une TCB explicite pour les bibliothèques partagées ; une
vérification de fermeture `ldd` en lecture seule rejette une dépendance manquante ou introuvable mais
ne peut pas en installer une.

Avant l'invocation du finaliseur et avant la construction de l'image d'exécution, les
acteurs de la gate hôte locale exécutent toutes les gates et builds pertinents pour la release dans
l'ordre relatif exact suivant depuis la racine du dépôt :

```text
1. {ownedNode} {ownedPnpmCli} format:check
2. {ownedNode} {ownedPnpmCli} lint
3. {ownedNode} {ownedPnpmCli} typecheck
4. {ownedNode} {ownedPnpmCli} test
5. {ownedNode} {ownedPnpmCli} --filter @pulse/extension verify-manifest src/manifest.json
6. {ownedNode} {ownedPnpmCli} --filter @pulse/ui build
7. {ownedNode} {ownedPnpmCli} --filter @pulse/extension build
8. {ownedNode} {ownedPnpmCli} --filter @pulse/extension verify-manifest dist/manifest.json --post-build
9. {ownedNode} {ownedPnpmCli} --filter @pulse/extension exec playwright test --config=playwright.mv3.config.ts --reporter=json --output={playwrightOutput}
10. {ownedNode} {ownedPnpmCli} --filter @pulse/extension verify-manifest dist/manifest.json --post-build
```

Chaque accolade s'étend avant la construction de l'argv vers les deux chemins absolus,
conservés par descripteur et autorisés par digest dans ToolMaterialsReceiptV1 ; aucun shell
ne segmente le tuple. Les dix commandes utilisent toutes l'environnement de gate hôte fermé de la
section 5. Chaque commande possède exactement un
`ImmutableGitSourceCommandReceiptV1` exporté par le parent capturé via le protocole
d'arrêt avant exec et de jonction complète des descendants. Les commandes 1 à 5 lisent la source et n'écrivent que sur les
montages déclarés de dépendances/cache/rapports ; la commande 6 n'écrit que ses sorties explicites
de dépendances/rapports ; la commande 7 est le producteur exclusif du montage de dist distinct ;
les commandes 8 à 10 ne peuvent pas écrire sur la source ou dist et n'écrivent que sur les racines de rapport/profil.
Les reçus locaux, de build et de MV3 packagé lient la même autorité à source
immuable et leurs sous-ensembles exacts ordonnés de reçus. Le
`producingCommandReceiptSha256` du reçu de build est la commande 7 et aucun autre reçu ne peut nommer une
sortie produisant dist. Pour la commande 9 uniquement, cette table est étendue par exactement ces trois
variables :

```text
PLAYWRIGHT_JSON_OUTPUT_FILE={playwrightRaw}
PLAYWRIGHT_BROWSERS_PATH={ownedPlaywrightRoot}
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
```

Le lockfile doit résoudre @playwright/test et playwright-core exactement en 1.61.1.
L'autorité de Chromium installée est exactement la révision 1228 et la version de navigateur
149.0.7827.55 ; l'autorité de FFmpeg installée est exactement la révision 1011. Ces
identifiants sont des attentes associées à la politique de matériel d'exécution validée,
et non une autorité obtenue depuis playwright-core/browsers.json. Le reçu d'approvisionnement
capture, tant pour les archives que pour les exécutables, le digest de la politique, l'URL
initiale/finale littérale, le descripteur conservé, le chemin détenu absolu, la taille en octets,
le SHA-256, le mode de l'exécutable, la révision et l'inventaire d'extraction sécurisée. Le descripteur
et le digest de Chromium sont revalidés immédiatement avant le lancement du navigateur et
après la suite ; ceux de FFmpeg sont revalidés avant et après la suite, qu'un
scénario l'invoque ou non.

Le nombre de builds de production de l'extension est exactement un : la commande 7. Le
build du package UI est un prérequis et n'incrémente pas ce décompte d'extension. Les commandes
test:mv3, test:e2e:extension, pnpm build, les alias de cycle de vie de package, les hooks ou
toute commande capable de reconstruire l'extension sont interdits après la commande 7.
La commande réservée à Playwright ne doit pas comporter de webServer, de configuration globale, de dépendance
de projet, de fixture ou de processus enfant qui invoque un build.

Immédiatement après la commande 8, l'acteur de gate hôte ouvre apps/extension/dist
de manière relative aux descripteurs sans suivre les liens. Il conserve un descripteur pour la
racine et chaque entrée et consigne, pour chaque répertoire et fichier régulier, le périphérique,
l'inode, le type, le mode, la taille, les nanosecondes de ctime, les nanosecondes de mtime et le SHA-256 du fichier.
Il consigne également le reçu d'arbre canonique et les octets exacts du manifeste. Le harness
MV3 ne charge que ce chemin de dist absolu exact.

Après la fin de Playwright, chaque descripteur conservé fait l'objet d'un fstat, l'arborescence
complète de chemins est recapturée, et toutes les identités, métadonnées, octets, hachages, octets de manifeste et
l'arbre canonique doivent être égaux à l'observation antérieure à la suite. Une suppression/recréation,
une réécriture des mêmes octets, un chmod-et-restauration, une nouvelle entrée, une entrée manquante, un lien symbolique ou un remplacement
de racine est par conséquent rejeté. La commande 10 est en lecture seule et son résultat doit
correspondre à la commande 8.

Le rapport JSON est exactement PRODUCER_PATHS.playwrightRaw, un fichier régulier sans suivi de liens
d'au maximum 67 108 864 octets. La sortie auxiliaire de Playwright est exactement
PRODUCER_PATHS.playwrightOutput, d'au maximum 20 000 entrées et 536 870 912 octets totaux
de fichiers réguliers, sans aucun lien ni objet spécial. Le reçu JCS borné dérivé
est exactement PRODUCER_PATHS.packagedMv3Receipt. Il exige que les treize ID de scénarios
attendus V2 ordonnés exacts importés du parent soient égaux octet par octet aux ID exécutés,
un décompte de réussite de `13`, et zéro constatation ignorée, échouée,
réessayée ou de diagnostic d'exécution. Il exige également les projections d'autorité approuvées
de MV3 révision 26 et d'onglets packagés révision 11, y compris leurs six digests distincts de reçus
de revue/implémentation/vérification, et le digest exact d'activation conjointe
candidat/audit. Ces trois valeurs sont copiées
octet par octet dans `PackagedMv3GateReceiptV1` ; ses digests attendus de blob et de tableau
sont égaux aux constantes du candidat et du parent. Il lie en outre les autorités
Playwright/Chromium/FFmpeg, l'ensemble des dix commandes et résultats exacts,
le décompte de build d'extension 1, et les observations pré/post exactes de dist.

Ce paragraphe constitue la voie de production post-activation. Au sein de la phase conjointe,
les mêmes assertions dérivées émettent uniquement
`JointPackagedMv3VerificationEvidenceV1` avec
`authorityMode:'verification_only'`, l'ID de phase, l'arbre figé et le
`implementedModelAuthoritySetSha256` exact. Ses scénarios se terminent en `verified_only` ;
il ne contient aucun digest de reçu de vérification, ensemble vérifié, ID de candidat,
digest d'activation ou schéma `PackagedMv3GateReceiptV1` et ne peut pas être transmis au
contrôleur de readiness. Son digest est une entrée du
`JointModelVerificationEvidenceV1` de créneau de producteur ; seul le vérificateur parent indépendant
peut consommer cette preuve et émettre le reçu de vérification ultérieur. Après
l'activation, le producteur réexécute la suite complète et crée de nouvelles preuves
de release ; il ne convertit ni ne copie jamais le reçu du bac à sable.

## 8. Handoff local

```ts
interface ProducerRunCorrelationV1 {
  repository: string;
  workflowPath: '.github/workflows/ci.yml';
  workflowJobId: 'seal-candidate';
  eventName: 'workflow_dispatch';
  sourceRef: 'refs/heads/main';
  headSha: string;
  runId: string;
  runAttempt: number;
  actorId: string;
  releaseId: string;
}

interface ProducerHandoffV1 {
  schema: 'missionpulse.sealed-candidate-producer-handoff';
  version: 1;
  handoffSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  sourceWorkspaceMaterializationSha256: Sha256;
  immutableSourceExecutionAuthority: ImmutableGitSourceExecutionAuthorityV1;
  sourceWorkspaceCompletionReceipt: GitExecutionWorkspaceCompletionReceiptV1 & {
    phase: 'local_handoff';
  };
  candidateJcsSha256: Sha256;
  readinessActor: {
    actorId: string;
    state: 'rc_built';
    expectedCatalogRevision: number;
    reservedCatalogRevision: number;
    reservationRecordSha256: Sha256;
    constructionReceiptSha256: Sha256;
    constructionReceipt: ReleaseReadinessActorConstructionReceiptV1;
    auditedContextSha256: Sha256;
    rcSealIngestionReceiptSha256: Sha256;
    rcSealIngestionReceipt: ReleaseReadinessRcSealIngestionReceiptV1;
    rcBuiltContextSha256: Sha256;
  };
  auditReceiptJcsSha256: Sha256;
  testedDistSealJcsSha256: Sha256;
  controllerReceipt: ControllerProducerReceiptV1;
  transport: {
    path: string;
    basename: 'missionpulse-sealed-candidate';
    bytes: number;
    sha256: Sha256;
    mode: '0600';
    device: string;
    inode: string;
    ctimeNs: string;
    mtimeNs: string;
  };
  localCapturedAt: CanonicalUtcTimestamp;
}
```

handoffSha256 est le SHA-256 sur le JCS avec exactement handoffSha256 omis. Le
handoff ne duplique délibérément pas les octets JCS potentiellement volumineux du candidat,
de l'audit ou du sceau. Leurs trois digests doivent être égaux aux valeurs complètes dans
l'acteur de readiness durable exact désigné par les deux reçus incorporés ; le
reçu du contrôleur doit lier les mêmes digests de candidat, d'audit et de sceau.
L'autorité complète à source immuable est validée indépendamment et est égale octet par octet
à l'admission et au sceau de dist testé. Son digest est égal au reçu d'achèvement
et à chaque reçu imbriqué local/build/MV3. Le reçu d'achèvement intègre les
reçus de commandes non vides ordonnés exacts via la capture locale ; chaque observation
de montage et de capabilité pré/post correspond à cette autorité et le digest de l'ensemble est
recalculé plutôt que considéré comme acquis.
Les deux reçus de readiness incorporés doivent passer leurs auto-digests, leurs
signatures de catalogue séparées par domaine, la corrélation requête/idempotence, la
transition d'état et les gardes CAS contexte/catalogue. Leurs digests de reçus sont égaux aux
champs scalaires adjacents ; la construction produit le contexte audité, et l'ingestion de sceau
consomme ce contexte exact et produit le contexte rc-built du handoff.

Le builder écrit exactement quatre champs GITHUB_OUTPUT :

```text
producer-handoff-path={expanded PRODUCER_PATHS.handoff}
producer-handoff-sha256={handoffSha256}
transport-path={expanded PRODUCER_PATHS.transport}
transport-sha256={transport.sha256}
```

Ces champs sont des pistes de commodité uniquement. Aucune étape ultérieure ne leur fait confiance. Chaque
validateur ultérieur exige indépendamment le chemin développé littéral, ouvre le handoff et
le transport sans suivi de liens, recalcule les deux digests, valide tous les champs de corrélation
et compare les métadonnées de descripteurs au handoff. Une valeur GITHUB_OUTPUT malveillante, tronquée,
dupliquée, multiligne, échappée ou alternative est rejetée.

## 9. Saga intra-job GitHub Actions cohérente face aux crashs

### 9.1 Instantanés et états

```ts
type ProducerSagaState =
  | 'awaiting_local_handoff'
  | 'local_handoff_verified'
  | 'attestation_in_flight'
  | 'attestation_verified'
  | 'upload_in_flight'
  | 'uploaded_digest_verified'
  | 'failed'
  | 'cancelled';

type RemoteEffectKnowledge = 'none' | 'possible' | 'confirmed';
type SagaStepOutcome = 'success' | 'failure' | 'cancelled' | 'skipped';
type ProducerReservationDisposition =
  | 'unreserved'
  | 'active_producer'
  | 'active_for_consumer'
  | 'abandoned'
  | 'reconciliation_required';

interface ValidatedAttestationActionV1 {
  schema: 'missionpulse.validated-attestation-action';
  version: 1;
  evidenceSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  handoffSha256: Sha256;
  transportSha256: Sha256;
  transportBytes: number;
  actionUsesLiteral: 'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6';
  actionOutcome: 'success';
  actionOutput: {
    attestationId: string;
    attestationUrl: string;
    storageRecordIds: null | '';
  };
  sigstoreBundleJcsBase64: string;
  sigstoreBundleJcsSha256: Sha256;
  sigstoreBundleJcsBytes: number;
  signedAttestation: GitHubTransportAttestationV1;
  validatedAt: CanonicalUtcTimestamp;
}

interface ProducerSagaErrorV1 {
  schema: 'missionpulse.sealed-candidate-producer-saga-error';
  version: 1;
  errorSha256: Sha256;
  code: ProducerSagaErrorCode;
  correlation: ProducerRunCorrelationV1;
  stateAtFailure: Exclude<ProducerSagaState, 'failed' | 'cancelled'>;
  priorSagaSnapshotSha256: Sha256;
  remoteAttestation: RemoteEffectKnowledge;
  remoteArtifact: RemoteEffectKnowledge;
  causeSha256: Sha256 | null;
  retryable: false;
  observedAt: CanonicalUtcTimestamp;
}

interface ProducerReservationDispositionRequestV1 {
  schema: 'missionpulse.producer-reservation-disposition-request';
  version: 1;
  requestSha256: Sha256;
  idempotencyKey: string; // exactly `sha256:${requestSha256}`
  operation: 'record-disposition';
  expectedCatalogRevision: number;
  reservationRecordSha256: Sha256;
  candidateJcsSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  priorSagaSnapshotSha256: Sha256 | null;
  remoteAttestation: RemoteEffectKnowledge;
  remoteArtifact: RemoteEffectKnowledge;
  requestedDisposition: 'active_for_consumer' | 'abandoned' | 'reconciliation_required';
  requestedReason:
    'producer-upload-joined' | 'proved-no-remote-effect' | 'remote-effect-possible-or-confirmed';
  readinessMutation:
    | {
        kind: 'none';
        expectedContextSha256: Sha256;
      }
    | {
        kind: 'block-and-abandon';
        expectedContextSha256: Sha256;
        blockerEventSha256: Sha256;
        error: ReleaseReadinessError;
      };
  observedAt: CanonicalUtcTimestamp;
}

interface ProducerReservationReadRequestV1 {
  schema: 'missionpulse.producer-reservation-read-request';
  version: 1;
  requestSha256: Sha256;
  idempotencyKey: string; // exactly `sha256:${requestSha256}`
  operation: 'read';
  expectedCatalogRevision: number;
  candidateJcsSha256: Sha256 | null;
  correlation: ProducerRunCorrelationV1;
  priorSagaSnapshotSha256: Sha256 | null;
  remoteAttestation: RemoteEffectKnowledge;
  remoteArtifact: RemoteEffectKnowledge;
  requestedDisposition: 'unreserved' | 'active_producer' | 'reconciliation_required';
  requestedReason: 'no-reservation-created' | 'producer-terminal-missing-after-deadline';
  observedAt: CanonicalUtcTimestamp;
}

interface ProducerReservationDispositionReceiptV1 {
  schema: 'missionpulse.producer-reservation-disposition';
  version: 1;
  receiptSha256: Sha256;
  catalogPortPolicySha256: Sha256;
  requestSha256: Sha256;
  idempotencyKey: string;
  operation: 'record-disposition' | 'read';
  reservationRecordSha256: Sha256 | null;
  candidateJcsSha256: Sha256 | null;
  correlation: ProducerRunCorrelationV1;
  priorCatalogRevision: number;
  resultingCatalogRevision: number;
  catalogJcsSha256: Sha256;
  terminalCatalogSequence: number | null;
  disposition: ProducerReservationDisposition;
  priorSagaSnapshotSha256: Sha256 | null;
  remoteAttestation: RemoteEffectKnowledge;
  remoteArtifact: RemoteEffectKnowledge;
  reason:
    | 'no-reservation-created'
    | 'producer-upload-joined'
    | 'proved-no-remote-effect'
    | 'remote-effect-possible-or-confirmed'
    | 'producer-terminal-missing-after-deadline';
  readinessMutation:
    | {
        kind: 'none';
        contextSha256: Sha256 | null;
      }
    | {
        kind: 'block-and-abandon';
        priorContextSha256: Sha256;
        resultingContextSha256: Sha256;
        priorState: 'audited' | 'rc_built';
        resultingState: 'blocked';
        blockerEventSha256: Sha256;
      };
  recordedAt: CanonicalUtcTimestamp;
  issuer: 'missionpulse-release-catalog';
  keyId: string;
  signedPayloadSha256: Sha256;
  signatureAlgorithm: 'ed25519';
  signatureBase64: string;
}

interface ReservationReconciliationReceiptV1 {
  schema: 'missionpulse.reservation-reconciliation-receipt';
  version: 1;
  receiptSha256: Sha256;
  issuer: string;
  keyId: string;
  externalReceiptPolicySha256: Sha256;
  reservationRecordSha256: Sha256;
  candidateJcsSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  workflowRunConclusion: 'success' | 'failure' | 'cancelled' | 'timed_out';
  attestationObservation:
    | { status: 'absent'; queryReceiptSha256: Sha256 }
    | { status: 'present'; id: string; subjectSha256: Sha256; queryReceiptSha256: Sha256 };
  artifactObservation:
    | { status: 'absent'; queryReceiptSha256: Sha256 }
    | {
        status: 'present';
        id: string;
        artifactSha256: Sha256;
        artifactBytes: number;
        queryReceiptSha256: Sha256;
      };
  conclusiveAbsenceHorizonAt: CanonicalUtcTimestamp;
  decision: 'artifact_matches' | 'both_conclusively_absent' | 'partial_or_ambiguous';
  expectedCatalogRevision: number;
  observedAt: CanonicalUtcTimestamp;
  signedPayloadSha256: Sha256;
  signatureAlgorithm: 'ed25519';
  signatureBase64: string;
}

interface DerivedDirectUploadAuthorityV1 {
  schema: 'missionpulse.derived-direct-upload-authority';
  version: 1;
  authoritySha256: Sha256;
  handoffSha256: Sha256;
  transportAttestationPolicySha256: Sha256;
  workflowBlobSha256: Sha256;
  privilegedJobProjectionSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  stepId: 'upload';
  actionUsesLiteral: 'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9';
  inputs: {
    name: 'missionpulse-sealed-candidate';
    pathExpression: '${{ steps.verify-attestation.outputs.transport-path }}';
    archive: false;
    overwrite: false;
    retentionDays: 30;
    ifNoFilesFound: 'error';
  };
  directUpload: true;
  requestedRetentionDays: 30;
}

interface ArtifactPublicationJoinV1 {
  schema: 'missionpulse.sealed-candidate-artifact-publication-join';
  version: 1;
  joinSha256: Sha256;
  priorSagaSnapshotSha256: Sha256;
  handoffSha256: Sha256;
  attestationId: string;
  attestationBundleSha256: Sha256;
  actionOutput: {
    artifactId: string;
    artifactUiUrl: string;
    artifactDigest: Sha256;
  };
  derived: DerivedDirectUploadAuthorityV1;
  transportSha256: Sha256;
  transportBytes: number;
  joinedAt: CanonicalUtcTimestamp;
}

type DirectUploadActionJoinV1 = ArtifactPublicationJoinV1;

interface SagaCancellationReceiptV1 {
  schema: 'missionpulse.sealed-candidate-saga-cancellation';
  version: 1;
  receiptSha256: Sha256;
  cancellationActorId: 'recordProducerSagaCancellation';
  correlation: ProducerRunCorrelationV1;
  priorSagaSnapshotSha256: Sha256;
  githubCancelledPredicate: true;
  localDisposition:
    | {
        kind: 'never_started';
        buildOutcome: 'skipped';
        localCleanupReceiptSha256: null;
      }
    | {
        kind: 'cooperatively_cleaned';
        buildOutcome: 'cancelled' | 'failure';
        localCleanupReceiptSha256: Sha256;
      }
    | {
        kind: 'transport_captured';
        buildOutcome: 'success';
        localCleanupReceiptSha256: null;
        handoffSha256: Sha256;
      };
  stepOutcomes: {
    initializeSaga: 'success';
    build: SagaStepOutcome;
    prepareAttestation: SagaStepOutcome;
    attest: SagaStepOutcome;
    verifyAttestation: SagaStepOutcome;
    upload: SagaStepOutcome;
    verifyUpload: SagaStepOutcome;
  };
  remoteAttestation: RemoteEffectKnowledge;
  remoteArtifact: RemoteEffectKnowledge;
  observedAt: CanonicalUtcTimestamp;
}

interface ProducerSagaSnapshotV1 {
  schema: 'missionpulse.sealed-candidate-producer-saga-snapshot';
  version: 1;
  snapshotSha256: Sha256;
  sequence: number;
  previousSnapshotSha256: Sha256 | null;
  state: ProducerSagaState;
  correlation: ProducerRunCorrelationV1;
  handoffSha256: Sha256 | null;
  transportSha256: Sha256 | null;
  transportBytes: number | null;
  remoteAttestation: RemoteEffectKnowledge;
  remoteArtifact: RemoteEffectKnowledge;
  attestation: null | {
    id: string;
    url: string;
    bundleSha256: Sha256;
    bundleBytes: number;
    subjectName: 'missionpulse-sealed-candidate';
    subjectSha256: Sha256;
  };
  artifact: ArtifactPublicationJoinV1 | null;
  reservationDisposition: ProducerReservationDisposition;
  reservationDispositionReceiptSha256: Sha256 | null;
  observedAt: CanonicalUtcTimestamp;
  failureCode: ProducerSagaErrorCode | null;
}

interface ProducerTerminalEnvelopeV1 {
  schema: 'missionpulse.sealed-candidate-producer-terminal-envelope';
  version: 1;
  envelopeSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  sourceWorkspaceMaterializationSha256: Sha256;
  immutableSourceExecutionAuthority: ImmutableGitSourceExecutionAuthorityV1;
  terminalSourceWorkspaceCompletionReceipt: GitExecutionWorkspaceCompletionReceiptV1 & {
    phase: 'terminal_publication';
  };
  readinessActor: {
    actorId: string;
    state: 'rc_built';
    rcBuiltContextSha256: Sha256;
    rcSealIngestionReceiptSha256: Sha256;
  };
  handoff: ProducerHandoffV1;
  snapshots: readonly [ProducerSagaSnapshotV1, ...ProducerSagaSnapshotV1[]];
  terminalSnapshotSha256: Sha256;
  terminalDispositionReceipt: ProducerReservationDispositionReceiptV1;
  publicationJoin: ArtifactPublicationJoinV1;
  completedAt: CanonicalUtcTimestamp;
}

interface PublishProducerTerminalRequestV1 {
  schema: 'missionpulse.publish-producer-terminal-request';
  version: 1;
  requestSha256: Sha256;
  idempotencyKey: string; // exactly `sha256:${requestSha256}`
  envelopeJcsBase64: string;
  envelopeSha256: Sha256;
  envelopeBytes: number;
  correlation: ProducerRunCorrelationV1;
  publishedAt: CanonicalUtcTimestamp;
}

interface ProducerTerminalPublicationReceiptV1 {
  schema: 'missionpulse.producer-terminal-publication-receipt';
  version: 1;
  receiptSha256: Sha256;
  catalogPortPolicySha256: Sha256;
  requestSha256: Sha256;
  idempotencyKey: string;
  envelopeSha256: Sha256;
  envelopeBytes: number;
  terminalSnapshotSha256: Sha256;
  publicationJoinSha256: Sha256;
  immutableUri: string;
  correlation: ProducerRunCorrelationV1;
  recordedAt: CanonicalUtcTimestamp;
  issuer: 'missionpulse-release-catalog';
  keyId: string;
  signedPayloadSha256: Sha256;
  signatureAlgorithm: 'ed25519';
  signatureBase64: string;
}

interface ProducerTerminalRecordV1 {
  schema: 'missionpulse.producer-terminal-record';
  version: 1;
  recordSha256: Sha256;
  envelopeJcsBase64: string;
  envelopeSha256: Sha256;
  envelopeBytes: number;
  publicationReceipt: ProducerTerminalPublicationReceiptV1;
}
```

Les limites terminales sont constructives plutôt qu'indicatives. Une enveloppe terminale
admet au plus un handoff de 4 194 304 octets, huit instantanés de 1 048 576 octets,
une jointure de publication de 1 048 576 octets, un reçu de disposition de 1 048 576 octets,
et 1 048 576 octets pour toute la structure JCS restante ; son plafond strict
indépendant est de 16 777 216 octets. Les plafonds de requête/enregistrement de 25 165 824 octets
couvrent l'expansion canonique en Base64 de cette enveloppe maximale plus au maximum un
reçu de publication de 1 048 576 octets et 1 048 576 octets de structure englobante.
Chaque composant et la valeur conteneur complète doivent passer à la fois leur plafond de
composant et leur plafond conteneur avant allocation ou signature.

authoritySha256, joinSha256, evidenceSha256, errorSha256 et chaque
receiptSha256 sont chacun le SHA-256 sur le JCS RFC 8785 de leur valeur conteneur
complète avec uniquement le champ d'auto-digest correspondant omis. Le Base64 des preuves
d'attestation validées est un RFC 4648 canonique avec remplissage (padded), se décode en exactement
`sigstoreBundleJcsBytes` borné par `maxAttestationBundleBytes`, reproduit le digest
du bundle, et sa projection d'attestation signée complète est re-dérivée
depuis ces octets plutôt que considérée comme acquise. Chaque requestSha256 de catalogue est le SHA-256 sur le JCS avec
requestSha256 et idempotencyKey omis ; idempotencyKey est alors exactement
`sha256:{requestSha256}`. Pour chaque reçu de disposition/lecture du catalogue,
signedPayloadSha256 et sa signature Ed25519 utilisent le domaine exact de reçu
de catalogue et l'ensemble d'omissions définis dans la section 3.2 ; sa clé de signature et
catalogPortPolicySha256 doivent correspondre à la politique de port validée.

`ProducerTerminalEnvelopeV1.envelopeSha256` omet uniquement lui-même. Ses instantanés
constituent le répertoire complet et borné de saga, et non une projection filtrée : la séquence
commence à zéro, est sans trou, chaque digest précédent se lie exactement, chaque
corrélation d'instantané est identique, et le dernier instantané unique est
`uploaded_digest_verified`. `terminalSnapshotSha256` est égal au digest de ce dernier
instantané ; `publicationJoin` est identique octet par octet à son unique artefact non nul ;
le digest d'instantané antérieur de la jointure nomme l'instantané `upload_in_flight`
immédiatement précédent. `handoff` est le handoff JCS exact complet déjà
validé par `LOCAL_HANDOFF_VALIDATED` ; son auto-digest est égal à chaque digest de handoff
d'instantané non nul et au digest de handoff de la jointure. Son candidat, son audit,
son sceau et son acteur de readiness sont rechargés via la chaîne de reçus signés et
leurs digests sont comparés au handoff et au reçu du contrôleur ; son
reçu de contrôleur et son transport sont revalidés plutôt que projetés. Les
valeurs d'acteur de readiness de l'enveloppe sont égales à ce handoff et
au reçu de sceau RC signé. Les deux reçus d'achèvement d'espace de travail reproduisent
la même matérialisation source, l'autorité d'exécution à source immuable, le commit/arbre,
une projection source protégée pré/post égale et des observations de montage/capabilité
concordantes. L'ensemble ordonné de reçus de commande du reçu terminal est une extension
exacte préservant le préfixe du reçu de handoff à travers chaque commande de saga exécutée
ultérieurement ; il ne contient aucune commande dont le cwd ou l'octet de projet chargé
proviendrait du checkout ambiant. Son `completedAt` est égal au `observedAt`
du dernier instantané. `terminalDispositionReceipt` est le reçu signé complet
active_for_consumer/producer-upload-joined dont l'auto-digest est égal au digest
de disposition de l'instantané terminal ; il a les effets distants confirmés et aucune
mutation de readiness. Zéro/instantanés en trop, un embranchement, un dernier état non terminal,
un autre terminal, un handoff partiel, une jointure projetée ou un chemin de RUNNER_TEMP comme
autorité de consommateur est rejeté avant publication.

`PublishProducerTerminalRequestV1` contient le Base64 canonique avec remplissage de ces
octets JCS d'enveloppe exacts. Son nombre d'octets et son digest sont recalculés
indépendamment ; son digest de requête et son idempotence utilisent la règle d'omission de deux champs
de la section 3.2. La clé terminale est exactement le tuple
`{actorId,runId,runAttempt}` de la corrélation de l'enveloppe. Le service stocke
un `ProducerTerminalRecordV1` immuable sous cette clé avec une sémantique exclusive
sans remplacement, valide de manière durable l'enregistrement et le reçu signé avant
de retourner, et rejette définitivement tout rejeu divergent. Avant de signer, il charge
l'acteur rc-built durable exact et réexécute les gardes fermées d'enveloppe, de handoff,
de chaîne, de jointure, de corrélation et d'auto-digest ci-dessus ; l'identité OIDC authentifiée
du producteur seule ne peut rendre autoritaires des octets hostiles. L'URI
immuable exacte est l'origine validée plus
`/v1/catalog/producer-terminals/{percentEncode(actorId)}/{runId}/{runAttempt}` ;
le percent encoding utilise l'hexadécimal RFC 3986 en majuscules et n'est requis que pour les octets
en dehors de l'ensemble non réservé. Aucun producteur ou consommateur ne fournit d'URI.

`ProducerTerminalPublicationReceiptV1.receiptSha256` omet uniquement lui-même.
`signedPayloadSha256` est le SHA-256 sur
`ASCII("missionpulse.producer-terminal-publication.v1") || 0x00 ||
JCS(receipt with receiptSha256, signedPayloadSha256, signatureAlgorithm and
signatureBase64 omitted)`, et Ed25519 signe ces mêmes octets séparés par domaine.
`ProducerTerminalRecordV1.recordSha256` omet uniquement lui-même ; son enveloppe décodée
doit être égale octet par octet au JCS publié et son reçu doit être revalidé sous la
clé de catalogue liée au candidat. Une lecture publique retourne exactement cet enregistrement sous forme de RFC
8785 JCS avec le type de média
`application/vnd.missionpulse.producer-terminal.v1+json`, une longueur de contenu ne dépassant pas
25 165 824 octets, l'ETag `"sha256:{recordSha256}"`, un cache-control immuable, aucun
identifiant et aucune redirection. Le SPKI TLS, l'origine, le chemin, les clés et la limite de réponse
proviennent uniquement de `candidate.producerTerminalReadAuthority`.

Pour ReservationReconciliationReceiptV1, signedPayloadSha256 est le SHA-256 de
`missionpulse.reservation-reconciliation.v1\x00` suivi du JCS RFC 8785
du reçu avec receiptSha256, signedPayloadSha256, signatureAlgorithm et
signatureBase64 omis. La signature Ed25519 couvre ces octets exacts
séparés par domaine et doit valider sous externalReceiptPolicySha256.

La garde pure deriveDirectUploadAuthority dérive
DerivedDirectUploadAuthorityV1 uniquement depuis la corrélation exacte de handoff,
la politique de transport de CandidateIdentityV1, les octets de workflow validés, la projection
fermée de job privilégié, l'action de téléversement épinglée et les six entrées
littérales d'action. Aucune observation de l'API du fournisseur producteur ne fournit directUpload ou
requestedRetentionDays. Les deux ne sont que des faits autorisés des entrées de workflow. Le
consommateur observe ultérieurement la rétention, l'expiration et les octets du fournisseur sous sa propre
autorité.

`ArtifactPublicationJoinV1` ci-dessus est l'unique type de câble commun producteur/consommateur.
`DirectUploadActionJoinV1` est uniquement un alias exact pour la prose antérieure du producteur
et ne peut ajouter, supprimer ou réinterpréter un champ. La garde pure joinDirectUploadAction
ne crée `ArtifactPublicationJoinV1` que
lorsque toutes ces autorités indépendantes concordent :

1. le handoff et l'instantané de saga antérieur ont un dépôt, un chemin de workflow, un
   job ID seal-candidate, un run ID, un run attempt, un head SHA, un acteur, une release et un
   digest de transport identiques ;
2. le blob de workflow exact et la projection de job privilégié de la politique candidate
   contiennent l'étape de téléversement, son action épinglée, ses entrées littérales et l'ordre des étapes ;
3. l'attestation Sigstore déjà validée lie le dépôt, la ref principale,
   la ref/SHA du workflow signataire, le run ID, le run attempt, le head SHA, le nom du sujet et
   le digest de transport à ce handoff ; elle ne déduit pas un job ID GitHub ;
4. l'ID d'artefact, l'URL d'interface utilisateur et le digest de la sortie de l'action passent leurs propres grammaires
   strictes mais restent des observations ;
5. les digests de transport de la sortie de l'action, du sujet d'attestation, du transport fraîchement recapturé, du reçu
   du contrôleur, du handoff et de la saga sont tous égaux.

Le chemin de workflow et le job ID proviennent donc du handoff plus la politique
validée ; le run attempt provient du handoff plus l'attestation authentifiée ; le téléversement
direct et la rétention demandée proviennent des entrées d'action validées et de la sémantique
de l'action épinglée ; l'ID d'artefact, l'URL d'interface utilisateur et le digest sont des sorties d'action hostiles
acceptées uniquement par leurs grammaires et la jointure par digests croisés. Les octets d'artefacts,
l'expiration, les horodatages et l'identité de l'API côté fournisseur sont des obligations explicites du consommateur,
et non des revendications du producteur.

La saga intra-job cohérente face aux crashs est une seconde machine XState ne comportant que ces
événements typés :

```ts
type ProducerSagaEvent =
  | { type: 'LOCAL_HANDOFF_VALIDATED'; handoff: ProducerHandoffV1 }
  | { type: 'ATTESTATION_AUTHORIZED'; transportSha256: Sha256 }
  | { type: 'ATTESTATION_VALIDATED'; evidence: ValidatedAttestationActionV1 }
  | { type: 'UPLOAD_AUTHORIZED'; evidence: ValidatedAttestationActionV1 }
  | {
      type: 'UPLOAD_VALIDATED';
      evidence: ArtifactPublicationJoinV1;
      reservation: ProducerReservationDispositionReceiptV1;
    }
  | {
      type: 'SAGA_FAILED';
      error: ProducerSagaErrorV1;
      reservation: ProducerReservationDispositionReceiptV1;
    }
  | {
      type: 'SAGA_CANCELLED';
      receipt: SagaCancellationReceiptV1;
      reservation: ProducerReservationDispositionReceiptV1;
    };
```

| État                   | Événement               | Effet durable requis                                                                                                                | État suivant             |
| ---------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| awaiting_local_handoff | LOCAL_HANDOFF_VALIDATED | ajouter la corrélation exacte handoff/transport                                                                                     | local_handoff_verified   |
| local_handoff_verified | ATTESTATION_AUTHORIZED  | ajouter la valeur prudente remoteAttestation=possible                                                                               | attestation_in_flight    |
| attestation_in_flight  | ATTESTATION_VALIDATED   | ajouter la preuve validée locale du bundle Sigstore                                                                                 | attestation_verified     |
| attestation_verified   | UPLOAD_AUTHORIZED       | ajouter la valeur prudente remoteArtifact=possible                                                                                  | upload_in_flight         |
| upload_in_flight       | UPLOAD_VALIDATED        | exiger le reçu de catalogue active_for_consumer ; ajouter l'égalité exacte des digests sortie-action/attestation/local              | uploaded_digest_verified |
| any nonterminal        | SAGA_FAILED             | exiger le reçu de catalogue unreserved, abandoned ou reconciliation_required ; ajouter l'échec typé et les effets distants prudents | failed                   |
| any nonterminal        | SAGA_CANCELLED          | exiger le reçu de catalogue unreserved, abandoned ou reconciliation_required ; ajouter le reçu d'annulation validé exact            | cancelled                |

Toute paire non répertoriée rejette sans mutation. Chaque action de transition ajoute
et recapture son instantané immuable avant que XState n'accepte l'événement
privé résultant. La configuration comporte les ID d'acteurs invoqués fixes initializeProducerSaga,
prepareTransportAttestation, verifyTransportAttestation, prepareDirectUpload,
verifyDirectUpload, recordProducerSagaCancellation, et
reconcileProducerSaga. SAGA_CANCELLED est accepté uniquement depuis l'invocation
enregistrée de recordProducerSagaCancellation pour l'acteur/run/tentative actuel et
l'instantané antérieur.

L'instantané initial awaiting_local_handoff utilise
reservationDisposition=unreserved et un digest de reçu nul car le build
n'a pas encore invoqué l'admission. LOCAL_HANDOFF_VALIDATED exige le bloc
`readinessActor` exact du handoff, recharge indépendamment cet acteur au
`rcBuiltContextSha256` lié, et déplace les instantanés suivants vers active_producer avec
reservationDispositionReceiptSha256 égal à
handoff.readinessActor.constructionReceiptSha256.
Avant qu'un événement terminal ne soit émis, le validateur enregistré obtient exactement
un reçu de disposition du catalogue. Il recapture et revalide le reçu
déjà désigné par LocalCleanupReceiptV1 lorsque le nettoyage local a fermé la
réservation ; sinon, il invoque ExternalReleaseCatalogPortV1 exactement une fois
avec la réservation connue ou la corrélation d'exécution exacte,
le dernier digest d'instantané non terminal, les valeurs prudentes d'effets distants
et l'intention terminale. Le reçu retourné doit être authentifié,
auto-digéré, monotone par CAS et lié de manière croisée à toutes les entrées :

- uploaded_digest_verified exige active_for_consumer et la raison
  producer-upload-joined ;
- failed ou cancelled avec les deux effets distants à none exige abandoned et
  la raison proved-no-remote-effect ;
- failed ou cancelled avec l'un des effets distants à possible ou confirmed exige
  reconciliation_required et la raison remote-effect-possible-or-confirmed ;
- failed ou cancelled avant la réservation exige unreserved, un
  reservationRecordSha256 nul et la raison no-reservation-created ; le port du catalogue
  doit prouver qu'aucune réservation correspondante n'existe pour acteur/run/tentative.

Pour active_for_consumer et reconciliation_required, `readinessMutation.kind`
est `none` et son digest de contexte doit être égal à l'acteur audité ou
rc-built toujours courant ; aucune des deux classifications ne mute l'état de readiness. Pour abandoned,
il est exactement `block-and-abandon` : `error` est l'échec typé du producteur,
`blockerEventSha256` est le digest de l'événement local canonique `BLOCKERS_INGESTED`,
et une transaction de contrôleur combinée applique un context-CAS à l'acteur d'audited ou
rc_built vers blocked **et** ajoute par catalog-CAS candidate_abandoned. Le reçu
lie les deux digests de contexte antérieur/résultant ainsi que la révision/séquence du catalogue.
Aucune moitié ne peut être validée seule. Un reçu de lecture unreserved comporte
`readinessMutation={kind:"none",contextSha256:null}` car aucun acteur n'a été
publié. Ainsi, le nettoyage local ne peut jamais laisser un acteur audited/rc-built adossé
à une réservation abandonnée.

L'instantané terminal n'intègre que le digest de ce reçu, évitant ainsi un cycle
de digests. Le reçu signé complet reste durable et récupérable auprès du
service externe de catalogue. Un conflit de catalogue, un échec OIDC/TLS/signature ou un port
de disposition indisponible n'émet aucun événement terminal et laisse active la réservation
durable à l'extérieur. Aucun fichier local ne peut abandonner, remplacer ou silencieusement
expirer une réservation.

snapshotSha256 est le SHA-256 sur le JCS avec exactement snapshotSha256 omis.
La séquence commence à zéro, s'incrémente de un et lie le digest antérieur. Les noms
de fichiers d'instantanés comportent exactement quatre chiffres de séquence décimaux, un tiret, l'état
et .json. Le répertoire de la saga ne contient aucun pointeur courant mutable. Un lecteur liste,
borne, trie, ouvre et valide l'ensemble de la chaîne.

Chaque instantané fait au plus 1 048 576 octets ; la chaîne compte au maximum huit instantanés.
Les instantanés utilisent la création exclusive sans suivi de liens et un fsync du fichier ainsi que du répertoire. Une
transition d'état n'est validée qu'après qu'une recapture a prouvé les octets exacts.
L'état est reconstruit à partir du dernier instantané valide uniquement tant que le même job
et le système de fichiers RUNNER_TEMP restent disponibles, jamais à partir du texte de résultat d'étape ou
des variables de sortie. La perte du runner détruit cette source de reconstruction et ne produit
aucune classification de producteur inter-jobs en soi.

Immédiatement après que l'instantané `uploaded_digest_verified` a fait l'objet d'un fsync et que
toute la chaîne a été recapturée, l'acteur `verifyDirectUpload` toujours enregistré
construit l'unique `ProducerTerminalEnvelopeV1` et appelle
`publishProducerTerminal`. Il ne retourne le succès à l'étape du workflow qu'après que
le `ProducerTerminalRecordV1` sans remplacement et le reçu de publication signé sont
récupérables octet par octet et revalidés. Le reçu n'est délibérément pas
inséré dans un autre instantané de saga, évitant un cycle de digests enveloppe/reçu.
Si la publication expire par timeout, entre en conflit ou ne peut pas être authentifiée, l'instantané
terminal local peut exister mais `verify-upload` échoue et aucun consommateur ne peut
l'utiliser. L'étape ordinaire `reconcile-saga` valide alors ce terminal local exact,
enregistre une disposition prudente signée `reconciliation_required` avec les deux
effets distants confirmés, n'écrit aucun instantané ultérieur et maintient le workflow
en échec. Cela couvre à la fois la publication absente et l'ambiguïté validation/réponse ; un
enregistrement qui a réellement été validé reste découvrable de manière indépendante et peut être
validé par le consommateur, mais aucun succès du producteur n'est déduit d'une
réponse non validée. Un succès de producteur inter-jobs signifie donc que l'enregistrement
terminal signé existe et a été revalidé, et non simplement qu'un terminal XState
local ou une sortie d'action GitHub existait.

### 9.2 Topologie exacte du workflow

La future interface workflow_dispatch comporte exactement quatre entrées de chaînes requises :
release-id, expected-catalog-revision, audit-evidence-sha256 et
audit-evidence-bytes. Les trois dernières formes numériques/digests doivent être canoniques ;
release-id utilise la grammaire d'ID fixe. Ce sont des pistes hostiles et elles ne peuvent contourner
l'enveloppe d'audit signée ou le CAS du catalogue. actorId est dérivé en interne comme
`producer:{runId}:{runAttempt}` et n'est jamais une entrée.

Le futur job seal-candidate reste sur runs-on ubuntu-24.04,
timeout-minutes 45, avec exactement :

```yaml
permissions:
  attestations: write
  contents: read
  id-token: write
```

Cela correspond exactement à l'autorité de clarification 11 parent une fois ce hachage exact
indépendamment approuvé. actions:read et toute
autre permission implicite ou explicite sont absentes. id-token:write autorise
l'action d'attestation épinglée et le courtier d'identifiants de catalogue externe exact
restreint par audience ; il n'accorde ni un token réutilisable ni un endpoint non modélisé.
Le producteur n'appelle pas d'API REST d'artefact ou d'attestation GitHub.
L'observation côté fournisseur relève du consommateur autorisé séparément ;
l'ajouter ici requerrait une nouvelle revue du modèle parent avant START.

Le même workflow validé peut contenir le job de diagnostic `test-mv3` en lecture seule
séparément projeté du modèle parent. Il n'accorde que `contents: read` ; son étape
`upload-mv3-evidence` utilise
`actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9`, la condition
exacte `always()`, le nom
`missionpulse-mv3-evidence-${{ github.run_id }}-${{ github.run_attempt }}`,
le chemin `output/playwright/`, `if-no-files-found:error`, `overwrite:false`, et
`retention-days:14`. Cette sortie de diagnostic archivée ordinaire n'est jamais un téléversement
direct, un transport candidat, un handoff, un sujet signé ou une entrée de saga. La
projection de job privilégié l'exclut explicitement tandis que la politique complète de workflow
l'exige séparément ; son existence n'accorde aucune permission, étape ou nom d'artefact
supplémentaire à `seal-candidate`.

La projection complète de job privilégié est fermée et ordonnée. Elle contient le
checkout existant épinglé par SHA uniquement pour exposer la base de données d'objets du dépôt ; aucune
commande ultérieure ne lit les octets de son arbre de travail. Elle effectue ensuite la configuration de Node et
de pnpm dans cet ordre exact. La configuration de Node ne comporte que
`node-version: ${{ env.NODE_VERSION }}` avec la valeur exacte
22.23.1 ; son entrée cache est absente. La configuration de pnpm observe alors ce Node
exact, et possède les entrées exactes version `${{ env.PNPM_VERSION }}` et dest
`${{ runner.temp }}/missionpulse-bootstrap-pnpm`. La projection contient ensuite les
étapes d'exécution validées ci-dessous, puis exactement ces deux actions à effets distants :

```text
actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6
actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
```

Aucun workflow réutilisable, matrice, service, action conteneur, action locale, tag,
branche, SHA raccourci, uses basé sur une expression, action privilégiée supplémentaire ou
étape non modélisée n'est autorisé.

Avant la matérialisation, les actions de configuration n'ont aucun montage source/backing. Le
contrôleur fait alors en sorte que l'espace de noms d'exécution externe du job n'expose que la même
vue source récursivement en lecture seule tout en masquant l'arbre backing. Les enfants des actions
d'attestation et de téléversement héritent de ce montage externe en lecture seule, d'ensembles de capabilités
vides et de `no_new_privs` ; ils ne reçoivent que leurs racines inscriptibles
modélisées d'état/transport. Les blocs run du projet entrent en outre dans la frontière
lanceur/seccomp délimitée par la commande et produisent les reçus ordonnés. Ni une action
épinglée ni un chemin d'annulation/finaliseur ne peut remonter, chmod, lier, lier symboliquement,
remplacer ou masquer un chemin suivi.

Après vérification exacte de la chaîne d'outils, le port d'objets Git fixe matérialise le
commit complet dans son arborescence backing réservée au contrôleur et construit la source
d'exécution distincte récursivement en lecture seule à
`${RUNNER_TEMP}/missionpulse-git-execution/source`. L'installation figée et chaque
commande de build/test/saga s'exécutent au sein de cette vue source immuable avec uniquement les cinq
montages de sortie déclarés, des capabilités vides et la frontière héritée d'espace de noms/seccomp ;
le checkout ambiant et l'arborescence backing sont inaccessibles. Les étapes de la saga sont :

1. initialize-saga : un validateur validé crée la séquence 0000 dans
   awaiting_local_handoff ;
2. build : invoque l'acteur local une fois et s'arrête définitivement à
   transport_captured ;
3. prepare-attestation : valide les quatre sorties du builder, le handoff, le transport,
   le candidat, l'audit, le sceau, la corrélation de workflow, et ajoute
   local_handoff_verified suivi de attestation_in_flight ; il émet uniquement
   les subject-name, subject-digest, digest de handoff et digest de transport validés ;
4. attest : l'action épinglée crée l'attestation distante ;
5. verify-attestation : s'exécute avec
   always() && !cancelled() && steps.prepare-attestation.outcome == 'success' ;
   valide le résultat de l'action et les sorties, ajoute attestation_verified suivi
   de upload_in_flight, et réémet le chemin/digest de transport recapturé ;
6. upload : s'exécute uniquement lorsque verify-attestation a émis upload-authorized=true ;
7. verify-upload : s'exécute avec
   always() && !cancelled() && steps.upload.outcome != 'skipped', valide
   le résultat de l'action et toutes les sorties, ajoute uploaded_digest_verified, puis
   publie et revalide l'enregistrement terminal de producteur complet et durable à l'extérieur
   avant que l'étape ne puisse réussir ;
8. record-cancellation : s'exécute uniquement sous le prédicat exact GitHub cancelled()
   ci-dessous, invoque recordProducerSagaCancellation, et ajoute cancelled uniquement
   après que son reçu passe la garde fermée de la section 9.4 ;
9. reconcile-saga : s'exécute avec always() && !cancelled(), valide la chaîne et,
   lorsqu'un échec ordinaire antérieur n'a pas d'instantané terminal, ajoute failed avec
   la connaissance prudente des effets distants impliquée par le dernier état ; lorsque le
   terminal local existe mais que sa publication terminale externe n'a pas été
   revalidée, il exécute uniquement la disposition signée reconciliation-required
   ci-dessus et ne peut réétiqueter ou étendre ce terminal local.

Les six expressions conditionnelles sont des octets de workflow exacts :

```yaml
attest:
  if: ${{ steps.prepare-attestation.outputs.attest-authorized == 'true' }}
verify-attestation:
  if: ${{ always() && !cancelled() && steps.prepare-attestation.outcome == 'success' }}
upload:
  if: ${{ steps.verify-attestation.outputs.upload-authorized == 'true' }}
verify-upload:
  if: ${{ always() && !cancelled() && steps.upload.outcome != 'skipped' }}
record-cancellation:
  if: ${{ cancelled() && steps.initialize-saga.outcome == 'success' }}
  timeout-minutes: 1
  continue-on-error: false
reconcile-saga:
  if: ${{ always() && !cancelled() }}
```

Chaque bloc run de projet validé utilise l'exécutable
`PRODUCER_PATHS.immutableSourceLauncher` exact autorisé par le contenu comme son `shell` GitHub Actions, avec
le chemin du script généré transmis uniquement via le créneau fixe `{0}` du lanceur,
et la configuration exacte
`working-directory: ${{ runner.temp }}/missionpulse-git-execution/source`.
Le lanceur ouvre ce script généré borné sans suivi de liens avant d'entrer dans
l'espace de noms, exige que ses octets/SHA-256 exacts soient égaux au bloc run unique
de la politique de workflow validée sélectionné par `commandPlanSha256`, conserve le
descripteur, crée/valide l'espace de noms privé et le reçu d'arrêt avant exec,
puis exécute `/bin/bash --noprofile --norc -euo pipefail` contre ce
descripteur à l'intérieur de la frontière fermée. Un chemin d'accès, une réécriture ultérieure ou
un script fourni par GitHub sans cette égalité d'octets ne possède aucune autorité de commande.
Il n'existe aucun shell de projet non confiné. Chaque bloc contient exactement une
invocation entre guillemets. L'étape de
matérialisation/bootstrap s'exécute seule avant que cette racine n'existe et est une
invocation de contrôleur fixe autorisée par le contenu séparément sur les objets Git. Aucune
valeur dérivée d'une étape n'est interpolée dans la source du shell :

```text
initialize-saga:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/sealed-candidate-saga.ts" initialize --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state"

build:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/build-sealed-candidate-transport.ts" --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state" --output "$RUNNER_TEMP/missionpulse-sealed-candidate" --handoff "$RUNNER_TEMP/missionpulse-sealed-candidate-state/producer-handoff.json" --release-id "$RELEASE_ID" --expected-catalog-revision "$EXPECTED_CATALOG_REVISION" --audit-evidence-sha256 "$AUDIT_EVIDENCE_SHA256" --audit-evidence-bytes "$AUDIT_EVIDENCE_BYTES" --github-output "$GITHUB_OUTPUT"

prepare-attestation:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/sealed-candidate-saga.ts" prepare-attestation --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state" --github-output "$GITHUB_OUTPUT"

verify-attestation:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/sealed-candidate-saga.ts" verify-attestation --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state" --github-output "$GITHUB_OUTPUT"

verify-upload:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/sealed-candidate-saga.ts" verify-upload --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state"

record-cancellation:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/sealed-candidate-saga.ts" record-cancellation --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state"

reconcile-saga:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/sealed-candidate-saga.ts" reconcile --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state"
```

Les seules projections dynamiques d'environnement du contexte de workflow sont :

```yaml
build:
  env:
    RELEASE_ID: ${{ inputs.release-id }}
    EXPECTED_CATALOG_REVISION: ${{ inputs.expected-catalog-revision }}
    AUDIT_EVIDENCE_SHA256: ${{ inputs.audit-evidence-sha256 }}
    AUDIT_EVIDENCE_BYTES: ${{ inputs.audit-evidence-bytes }}
prepare-attestation:
  env:
    BUILDER_HANDOFF_PATH: ${{ steps.build.outputs.producer-handoff-path }}
    BUILDER_HANDOFF_SHA256: ${{ steps.build.outputs.producer-handoff-sha256 }}
    BUILDER_TRANSPORT_PATH: ${{ steps.build.outputs.transport-path }}
    BUILDER_TRANSPORT_SHA256: ${{ steps.build.outputs.transport-sha256 }}
verify-attestation:
  env:
    ATTEST_STEP_OUTCOME: ${{ steps.attest.outcome }}
    ATTESTATION_ID: ${{ steps.attest.outputs.attestation-id }}
    ATTESTATION_URL: ${{ steps.attest.outputs.attestation-url }}
    ATTESTATION_BUNDLE_PATH: ${{ steps.attest.outputs.bundle-path }}
    ATTESTATION_STORAGE_RECORD_IDS: ${{ steps.attest.outputs.storage-record-ids }}
verify-upload:
  env:
    UPLOAD_STEP_OUTCOME: ${{ steps.upload.outcome }}
    UPLOAD_ARTIFACT_ID: ${{ steps.upload.outputs.artifact-id }}
    UPLOAD_ARTIFACT_URL: ${{ steps.upload.outputs.artifact-url }}
    UPLOAD_ARTIFACT_DIGEST: ${{ steps.upload.outputs.artifact-digest }}
record-cancellation:
  env:
    GITHUB_CANCELLED_PREDICATE: ${{ cancelled() }}
    INITIALIZE_SAGA_STEP_OUTCOME: ${{ steps.initialize-saga.outcome }}
    BUILD_STEP_OUTCOME: ${{ steps.build.outcome }}
    PREPARE_ATTESTATION_STEP_OUTCOME: ${{ steps.prepare-attestation.outcome }}
    ATTEST_STEP_OUTCOME: ${{ steps.attest.outcome }}
    VERIFY_ATTESTATION_STEP_OUTCOME: ${{ steps.verify-attestation.outcome }}
    UPLOAD_STEP_OUTCOME: ${{ steps.upload.outcome }}
    VERIFY_UPLOAD_STEP_OUTCOME: ${{ steps.verify-upload.outcome }}
reconcile-saga:
  env:
    BUILD_STEP_OUTCOME: ${{ steps.build.outcome }}
    PREPARE_ATTESTATION_STEP_OUTCOME: ${{ steps.prepare-attestation.outcome }}
    ATTEST_STEP_OUTCOME: ${{ steps.attest.outcome }}
    VERIFY_ATTESTATION_STEP_OUTCOME: ${{ steps.verify-attestation.outcome }}
    UPLOAD_STEP_OUTCOME: ${{ steps.upload.outcome }}
    VERIFY_UPLOAD_STEP_OUTCOME: ${{ steps.verify-upload.outcome }}
```

Chaque valeur de ce type est bornée et analysée comme une entrée hostile avant toute utilisation
du système de fichiers ou du réseau. GITHUB_OUTPUT est le descripteur de commande de fichier fourni par le runner
et est utilisé uniquement par build, prepare-attestation et verify-attestation comme indiqué.

Cette assertion `GITHUB_OUTPUT` est délimitée exactement aux étapes `run` validées dans
le workflow projeté. L'inspecteur exige que chaque commande shell/Node rédigée par le projet
qui ouvre ou nomme `$GITHUB_OUTPUT` soit l'une de ces trois étapes et
n'émette que son ensemble fermé de clés de sortie. Il ne prétend pas qu'une action `uses`
JavaScript épinglée soit dépourvue du canal de commande de fichier interne de GitHub. Les
capabilités révisées de `actions/attest` et `actions/upload-artifact` ne peuvent exposer
que leurs sorties documentées d'action ; les expressions exactes
`steps.attest.outputs.{attestation-id,attestation-url,bundle-path,storage-record-ids}`
et `steps.upload.outputs.{artifact-id,artifact-url,artifact-digest}`
énumérées ci-dessus sont admises comme des observations hostiles bornées. Elles ne peuvent pas être
traitées comme des écritures d'étapes run de projet, omises de la projection privilégiée, ou
acceptées comme autorité de transition sans leur validateur correspondant. Toute
clé de sortie d'étape de projet supplémentaire ou expression de sortie d'action supplémentaire est une
divergence de politique de workflow.

GitHub injecte également ACTIONS_ID_TOKEN_REQUEST_URL et
ACTIONS_ID_TOKEN_REQUEST_TOKEN lorsque et seulement lorsque id-token:write est effectif.
Ces deux variables sensibles de service du runner ne sont pas des projections de contexte
de workflow et n'entrent jamais dans un bloc YAML env. Parmi les commandes `run` rédigées
par le projet, seuls les modules de courtier d'identifiants de catalogue au sein de build,
verify-upload, record-cancellation et reconcile-saga peuvent les lire ; ils appliquent
immédiatement le comportement borné à usage unique `missionpulse-release-catalog`
de la section 3.2 et retirent les deux variables de chaque environnement enfant Node/pnpm, Buildx, navigateur,
sonde Docker, finaliseur et contrôleur. Séparément, l'action JavaScript épinglée révisée
`actions/attest` peut utiliser les descripteurs OIDC internes du runner uniquement pour ses audiences
exactes `nobody` et `sigstore`. Elle n'est pas un courtier de catalogue de projet, ne peut recevoir ni
transmettre de token de catalogue, et ne partage aucune réponse de token avec les commandes du projet.
La projection de la politique de workflow validée lie ces consommateurs de capabilités disjoints,
l'origine/audience exacte de catalogue dans la politique validée, les quatre entrées de dispatch
et les quatre expressions env de build. Toute autre commande de projet, action, audience, transmission
d'URL de requête ou réutilisation de bearer échoue de manière sécurisée.

initialize-saga, prepare-attestation, verify-attestation, verify-upload,
record-cancellation et reconcile-saga sont des commandes validées distinctes avec une
échéance interne de 60 000 ms. Elles n'importent pas la mémoire de processus du builder. Un
validateur ne peut ajouter deux instantanés dans un même processus que dans l'ordre exact
ci-dessus, en appliquant fsync et en recapturant le premier avant de créer le second.

Les entrées de l'action d'attestation sont exactement :

```yaml
subject-name: missionpulse-sealed-candidate
subject-digest: sha256:${{ steps.prepare-attestation.outputs.transport-sha256 }}
show-summary: false
```

Aucun subject-path, subject-checksums, SBOM, prédicat personnalisé, push vers un registre,
enregistrement de stockage ou entrée de token alternative n'est présent. Sans entrée
de prédicat personnalisé, le mode de provenance de l'action épinglée doit produire le type de prédicat
https://slsa.dev/provenance/v1.

Les entrées de l'action de téléversement sont exactement :

```yaml
name: missionpulse-sealed-candidate
path: ${{ steps.verify-attestation.outputs.transport-path }}
archive: false
overwrite: false
retention-days: 30
if-no-files-found: error
```

archive:false exige exactement un fichier régulier, le téléverse directement, dérive
le nom de l'artefact depuis son basename, et fait de artifact-digest le digest de
ces octets exacts. Le nom explicite reste requis par la politique de workflow même
si l'action épinglée l'ignore en mode téléversement direct.

transport-attestation-policy.v1.json, le blob de workflow incorporé et son SHA-256,
le SHA-256 de la projection de job privilégié et workflow-policy.ts doivent tous être
régénérés à partir de ce futur YAML exact. Le parseur de politique doit exiger chaque
ID d'étape, ordre, expression if, shell, clé env, argv run, permission, SHA d'action,
entrée d'action et expression de sortie ci-dessus. Les valeurs par défaut d'entrées inconnues ne sont
pas acceptées comme équivalentes. Tant que le YAML et tous les hachages de politique ne concordent pas, START échoue
avec `producer.admission.workflow-policy-divergent`.

### 9.3 Validation des sorties d'actions non fiables

prepare-attestation réouvre le handoff et le transport sans suivi de liens, recalcule
leurs octets et leurs digests, et conserve les descripteurs jusqu'à l'achèvement. Il émet
attest-authorized=true uniquement après avoir ajouté attestation_in_flight.

verify-attestation traite steps.attest.outcome, attestation-id,
attestation-url et bundle-path comme des chaînes non fiables. Le succès exige :

- le succès du résultat d'action et aucune sortie vide, multiligne, trop longue ou malformée ;
- attestation-id est une valeur ASCII décimale canonique positive unique ;
- attestation-url est exactement
  https://github.com/{owner}/{repository}/attestations/{attestation-id} ;
- bundle-path se développe en un descendant absolu de RUNNER_TEMP, mais le validateur
  l'ouvre sans suivi de liens et n'accepte que les octets du descripteur capturé ;
- le bundle fait au maximum 16 777 216 octets et se parse strictement comme un unique bundle
  Sigstore ;
- DSSE, la chaîne Fulcio, le matériel d'inclusion Rekor, la racine de confiance, l'émetteur OIDC,
  le dépôt, la ref principale, la ref/SHA du workflow signataire, le run, la tentative, le head SHA,
  le nom du sujet, le digest du sujet et le prédicat SLSA v1 valident tous par rapport à la
  politique de transport de CandidateIdentityV1 ; le job ID GitHub n'est pas déduit
  de ce bundle.

L'URL et l'ID de la sortie de l'action sont enregistrés uniquement après la validation
du bundle Sigstore local et la corrélation exacte des sorties. storage-record-ids doit être absent ou
vide. Le producteur n'effectue aucune requête REST GitHub et ne revendique pas une
découvrabilité externe ; c'est l'obligation indépendante du consommateur. Le transport
est réouvert et rehaché à nouveau avant que upload-in-flight ne soit ajouté. L'étape
émet upload-authorized=true, transport-path et transport-sha256 uniquement depuis
cette recapture.

verify-upload traite steps.upload.outcome, artifact-id, artifact-url et
artifact-digest comme non fiables. Le succès exige :

- le succès du résultat d'action ;
- un ID d'artefact décimal canonique positif unique ;
- l'URL d'interface utilisateur de l'artefact de sortie d'action exactement
  https://github.com/{owner}/{repository}/actions/runs/{runId}/artifacts/{id} ;
- le digest d'artefact exactement en 64 caractères hexadécimaux minuscules ;
- deriveDirectUploadAuthority prouve indépendamment le chemin de workflow, le job ID, le run
  attempt, archive:false, la rétention demandée 30, overwrite:false, l'expression de
  chemin, if-no-files-found:error et l'épinglage exact de l'action depuis le handoff et
  la politique validée ;
- joinDirectUploadAction exige que la sortie de téléversement, le transport fraîchement recalculé,
  le handoff, le sujet attesté, le reçu du contrôleur et les digests pré-action capturés
  soient tous exactement égaux.

Seul le ArtifactPublicationJoinV1 complet peut être placé dans l'instantané
terminal et ce n'est qu'alors que uploaded_digest_verified peut être ajouté. Ce terminal
signifie que l'action épinglée a rapporté le succès et que son digest a rejoint les octets
locaux exacts ; il ne revendique pas de re-téléchargement côté fournisseur, d'expiration, de rétention ou
de visibilité d'API. Un succès d'action sans ce validateur est un échec. Un
échec d'action après invocation est classifié avec un effet distant possible ;
il n'est jamais réessayé silencieusement.

### 9.4 Annulation atteignable et perte du runner

L'expression cancelled() de GitHub n'est que le prédicat de l'ordonnanceur de workflow qui
rend l'étape record-cancellation éligible. Ce n'est pas un événement de saga, un reçu
de nettoyage, un état terminal ou une preuve qu'un processus en cours s'est arrêté.

Lorsque cette étape exacte démarre, recordProducerSagaCancellation :

1. exige GITHUB_CANCELLED_PREDICATE=true,
   INITIALIZE_SAGA_STEP_OUTCOME=success, la corrélation d'exécution exacte et la
   politique de workflow validée du candidat contenant cette étape et condition ;
2. charge et recapture la chaîne de saga immuable complète, exige que son dernier
   état soit non terminal, et acquiert le verrou d'écriture exclusif unique de saga ;
3. parse strictement l'ensemble des sept résultats d'étapes antérieurs comme des valeurs terminales
   SagaStepOutcome et accepte exactement une disposition locale :
   - never_started : build est ignoré (skipped), la saga est dans awaiting_local_handoff, et
     aucun bail local, handoff, transport, objet de staging ou reçu de nettoyage
     n'existe ;
   - cooperatively_cleaned : build est cancelled ou failure, le LocalCleanupReceiptV1
     exact sans suivi de liens existe à
     PRODUCER_PATHS.localCancellationReceipt, désigne ce run/tentative, et prouve
     que l'acteur local a atteint son propre terminal cancelled après que chaque enfant et
     ressource Buildx se soit arrêté ;
   - transport_captured : build est success, le handoff et le transport exacts sont
     recapturés, l'acteur local s'est déjà terminé à transport_captured, et
     aucun enfant ou bail d'écrivain local ne subsiste ;
4. dérive remoteAttestation et remoteArtifact à partir du dernier état intra-job ayant fait l'objet d'un fsync
   et des résultats d'actions antérieurs sans jamais rétrograder none/possible/confirmed ou
   traiter une sortie d'action non validée comme confirmée ;
5. construit le SagaCancellationReceiptV1 auto-digéré, émet l'événement privé
   SAGA_CANCELLED, ajoute l'instantané cancelled, lui applique fsync et
   recapture la chaîne complète avant de libérer le verrou d'écriture.

Si la saga est déjà uploaded_digest_verified, failed ou cancelled, l'acteur
valide cet instantané terminal et n'effectue aucune transition. Si une disposition
locale est ambiguë, qu'un écrivain est peut-être encore actif, qu'un reçu de nettoyage est
manquant ou que l'acteur lui-même est arrêté, il n'émet aucun événement et n'écrit aucun
instantané terminal.

Pour `uploaded_digest_verified`, « aucune transition » ne supprime pas la disposition
de catalogue distincte de reconcile-saga requise après une publication non validée dans le magasin
de terminaux. Cette branche n'écrit aucun instantané de saga et ne transforme jamais une ambiguïté
de publication en succès de producteur.

Les trois notions d'annulation sont par conséquent distinctes :

- **cancelled() de GitHub** planifie uniquement l'acteur d'annulation borné exact ;
- **l'annulation coopérative** est un CANCEL_REQUESTED local observé plus un
  reçu de nettoyage durable, ou un acteur local déjà terminé/jamais démarré
  prouvé par les deux autres dispositions fermées ;
- **le kill de runner, force-cancel, perte de machine ou timeout de job** peut empêcher l'étape
  record-cancellation ou son fsync de se terminer. RUNNER_TEMP est alors
  indisponible et le producteur n'émet aucun état terminal ni classification
  reconstruite ultérieurement. Les consommateurs rejettent l'absence du
  `ProducerTerminalRecordV1` externe signé plus leurs propres preuves de fournisseur authentifiées,
  même si GitHub rapporte ultérieurement une action réussie.

reconcile-saga est mutuellement exclusif avec record-cancellation car sa condition
exacte contient !cancelled(). Aucun des deux acteurs ne supprime ou n'écrase une attestation ou un artefact
distant possible ou confirmé.

## 10. Graphe d'autorité et invariants

Le graphe normatif est :

```text
commit exact + politiques requises + enveloppe d'audit authentifiée récupérée de l'extérieur
  -> constructProducerAdmissionV2
  -> acteur de readiness audité atomique + CandidateIdentityV1 + AuditReceiptV1 + réservation de catalogue
  -> Node, pnpm, Playwright, Chromium et FFmpeg autorisés par le contenu
  -> gates locales exactes
  -> un build prérequis UI exact + un build de production d'extension exact
  -> reçu MV3 packagé sur le même dist + descripteurs de dist figés
  -> matériels Python et Buildx autorisés par le contenu
  -> un bundle de source de contrôleur
  -> build exact Buildx v0.34.1 / BuildKit v0.30.0
  -> projection brute et bornée de métadonnées SLSA v0.2 + Statement/v0.1/SLSA v1 attaché
  -> jointure de projection sémantique + projection honnête de matériels de l'hôte
  -> OCI normalisé à manifeste unique
  -> ReleaseExecutionAuthorityV1
  -> une invocation fermée du contrôleur finaliseur + sonde obligatoire du port d'image du producteur
  -> SealedCandidatePayloadInventoryV1 à six entrées
  -> TestedDistSealV1
  -> transport canonique à sept composants
  -> ControllerProducerReceiptV1
  -> RC_SEAL_INGESTED ingéré par CAS du contrôleur + état durable rc_built
  -> ProducerHandoffV1
  -> transport_captured terminal local
  -> vérification d'attestation de saga intra-job cohérente face aux crashs
  -> vérification de téléversement direct
  -> uploaded_digest_verified terminal de saga locale
  -> ProducerTerminalEnvelopeV1 immuable + ProducerTerminalRecordV1 externe signé
```

Les six entrées de charge utile non réflexives sont exactement, dans l'ordre canonique :

```text
build-metadata.json
build-provenance.json
dist
release-controller.bundle.mjs
release-execution-authority.json
release-execution-image.oci.tar
```

Le transport ajoute tested-dist-seal.json comme septième composant logique. Il
ne contient pas le handoff local, le reçu du contrôleur producteur en tant que fichier
supplémentaire, d'instantané de saga, de sortie d'action GitHub, de bundle d'attestation, de reçu d'artefact,
d'archive englobante, de sidecar, de journal mutable, d'identifiant ou de métadonnées de fournisseur.
Le reçu du contrôleur producteur est transporté par le handoff privé et lie le
transport ; il n'altère pas l'inventaire établi du transport.

Invariants toujours valides :

1. un seul commit source, un seul candidat, une seule réservation de catalogue, un seul
   bundle de contrôleur, un seul builder Buildx, une seule image d'exécution, une seule invocation de contrôleur,
   un seul build d'extension, un seul dist, un seul sceau, un seul transport ;
2. la pureté de Core et la détention par Shell définies dans AGENTS.md restent intactes ;
3. chaque transition de modèle est pilotée par un événement typé et une garde pure ;
4. aucun LLM n'émet d'événement de transition ni ne décide d'une garde ;
5. le succès local s'arrête à transport_captured ;
6. le succès de la saga locale est uniquement uploaded_digest_verified ; le succès inter-jobs
   requiert également l'enregistrement terminal de producteur immuable et signé ;
7. toute autorité inter-étapes intra-job est un JCS ayant fait l'objet d'un fsync plus des octets recapturés,
   jamais la vivacité du processus, et ne revendique aucune durabilité face à la perte du runner ;
8. les sorties d'actions sont des observations validées par le code validé ;
9. le digest de l'action de téléversement est égal aux digests attesté, de handoff, du contrôleur
   et du transport ; les octets du fournisseur restent une preuve du consommateur ;
10. exactement un acteur effectue exactement une publication de transport sans remplacement ;
    la capture du handoff ne peut pas publier le transport ;
11. chaque mutation ou disposition non mutante du catalogue est autorisée par une requête
    OIDC restreinte par audience et un reçu signé durable à l'extérieur ;
12. l'autorité du producteur n'accorde jamais d'autorité de soumission au Chrome Web Store.

## 11. Échec, annulation, interruption et nouvelle tentative

```ts
type ProducerSagaErrorCode =
  | 'producer.admission.invalid-request'
  | 'producer.admission.source-invalid'
  | 'producer.admission.audit-missing'
  | 'producer.admission.audit-invalid'
  | 'producer.admission.evidence-channel-invalid'
  | 'producer.admission.policy-missing'
  | 'producer.admission.policy-invalid'
  | 'producer.admission.workflow-policy-divergent'
  | 'producer.admission.catalog-conflict'
  | 'producer.admission.catalog-port-invalid'
  | 'producer.tool-material-invalid'
  | 'producer.buildx-topology-invalid'
  | 'producer.build-metadata-invalid'
  | 'producer.oci-invalid'
  | 'producer.controller-invalid'
  | 'producer.execution-probe-invalid'
  | 'producer.rc-seal-ingestion-invalid'
  | 'producer.mv3-dist-drift'
  | 'producer.transport-invalid'
  | 'producer.handoff-invalid'
  | 'producer.attestation-failed'
  | 'producer.attestation-invalid'
  | 'producer.upload-failed'
  | 'producer.upload-invalid'
  | 'producer.terminal-publication-invalid'
  | 'producer.digest-divergent'
  | 'producer.deadline-exceeded'
  | 'producer.cleanup-ambiguous';
```

L'échéance stricte du job GitHub est de 45 minutes. L'échéance de l'acteur local est exactement
attemptStartedAt + 2 100 000 ms et ne doit pas être postérieure à
attemptDeadlineAt - 600 000 ms. Chaque enfant local reçoit le plus petit entre son
budget d'étape fixe et le budget local restant. Les validateurs de saga reçoivent chacun
60 000 ms mais n'étendent jamais l'échéance fixe du job. L'attemptDeadlineAt
logique de la requête ne peut pas étendre l'arrêt strict antérieur appliqué indépendamment par le runner.
Si la configuration du runner a déjà consommé une partie du budget du job, un arrêt
antérieur ne produit aucun état terminal de producteur, jamais un succès fabriqué,
une annulation ou un état d'interruption reconstruit.

Le CANCEL_REQUESTED local n'est coopératif que tant que le processus local peut l'observer.
Un SIGTERM observé peut être traduit en runner_sigterm, mais cancelled local
n'est atteignable qu'après que tous les enfants se soient arrêtés, que le nettoyage de Buildx soit achevé,
que les descripteurs soient fermés, qu'aucun transport publié ou de staging ambigu ne subsiste, et que
LocalCleanupReceiptV1 soit durable. Le cancelled de la saga est atteignable séparément uniquement
via l'étape record-cancellation exacte et la garde SagaCancellationReceiptV1
de la section 9.4. cancelled() de GitHub rend simplement cette étape éligible. Un kill
de processus, force-cancel, perte de machine, perte de runner ou timeout de job peut empêcher
l'écriture de l'un ou l'autre reçu ou instantané ; ce producteur n'émet alors aucune
classification terminale plutôt que d'inventer cancelled.

Les effets distants sont suivis séparément :

| Dernier état intra-job ayant fait l'objet d'un fsync | remoteAttestation | remoteArtifact |
| ---------------------------------------------------- | ----------------- | -------------- |
| awaiting_local_handoff                               | none              | none           |
| local_handoff_verified                               | none              | none           |
| attestation_in_flight                                | possible          | none           |
| attestation_verified                                 | confirmed         | none           |
| upload_in_flight                                     | confirmed         | possible       |
| uploaded_digest_verified                             | confirmed         | confirmed      |

failed et cancelled préservent les valeurs prudentes impliquées par le dernier
état ayant fait l'objet d'un fsync. L'attestation est un effet de bord distant avant même qu'un artefact
quelconque n'existe. Aucune valeur n'est reconstruite après la perte du runner.

Aucune voie d'échec ne supprime, n'écrase, ne remplace, ne masque ou ne nettoie une
attestation ou un artefact distant.

Le producteur n'ajoute pas un quatrième type d'enregistrement de catalogue et ne mute pas le modèle
approuvé de catalogue parent. Le catalogue global du contrôleur, durable à l'extérieur et exposé
uniquement via ExternalReleaseCatalogPortV1, ne permet toujours que :

```text
candidate_reserved -> candidate_abandoned
candidate_reserved -> artifact_published
```

ProducerReservationDisposition est une vue typée sur ces enregistrements, et non un nouvel
état de catalogue. active_producer, active_for_consumer et
reconciliation_required conservent tous le même enregistrement candidate_reserved actif :
les deux premiers ne diffèrent que par une intention terminale locale validée, mais
active_for_consumer n'accorde aucune autorité de consommateur tant que l'enregistrement
terminal externe de producteur signé correspondant n'existe pas ;
reconciliation_required est l'interprétation à échec sécurisé d'un enregistrement actif
après un échec, une annulation, la perte du runner, attemptDeadlineAt, ou tout effet distant possible
ou confirmé. Pour ces observations non mutantes,
priorCatalogRevision est égal à resultingCatalogRevision. Seul abandoned ajoute
candidate_abandoned, fait progresser la révision du catalogue de un, et transporte le
terminalCatalogSequence exact non nul de cet enregistrement. Chaque reçu unreserved,
active_producer, active_for_consumer ou reconciliation_required possède un
terminalCatalogSequence nul. Aucune transition d'échéance ne déduit une absence distante ni
n'abandonne automatiquement.

Clôturer la réconciliation exige un ReservationReconciliationReceiptV1 compatible avec
external-receipt-policy.v1.json et signé, produit en dehors de ce job par
l'autorité consommatrice. Il lie la réservation, le candidat, le run/tentative, les requêtes
authentifiées exactes d'attestation et d'artefact, tous les ID/digests découverts,
l'horizon d'absence concluante de la politique, et une révision de catalogue CAS. Une preuve
d'artefact correspondante avec son attestation correspondante permet au consommateur existant
d'ajouter artifact_published ; l'absence concluante des deux autorisée par la politique permet
au contrôleur d'ajouter candidate_abandoned. Une attestation présente avec un
artefact absent, toute décision partial_or_ambiguous, ou un reçu d'absence non signé, périmé,
antérieur à l'échéance ou ambigu laisse la réservation active bloquée
et ne peut pas clôturer la réconciliation.

Une nouvelle tentative utilise un nouveau runAttempt, ID d'acteur, racine d'état, nom de builder et saga. Elle
ne peut réserver le même espace de noms de version/release qu'après que la réservation antérieure
ait été durablement abandonnée ; active_producer, reconciliation_required,
active_for_consumer ou consumed la bloque. Sinon, la nouvelle tentative doit utiliser un nouvel
espace de noms de version/release supérieur et indépendamment autorisé. Elle ne forge jamais silencieusement
une nouvelle réservation et ne réutilise jamais un handoff, un instantané, une sortie
d'attestation, une sortie d'artefact, un builder local, un résultat de contrôleur ou un chemin publié antérieur.

## 12. Vérification hostile requise

L'implémentation reste interdite jusqu'à ce que les tests prouvent au moins :

- START rejette les valeurs de candidat/audit fournies par l'appelant, un commit incorrect, une
  substitution d'arbre de travail, des fichiers d'audit d'exécution préexistants, une enveloppe
  d'audit manquante/non signée, un émetteur/clé/signature Ed25519 incorrect, une dérive de digest
  de reçu/rapport, des politiques de signature manquantes, une autorité de connecteur périmée, une dérive
  de workflow et un conflit de catalogue ;
- les preuves d'audit rejettent une enveloppe validée dans Git/auto-référentielle, une
  origine/chemin alternatif, une redirection, une adresse privée, une dérive de SPKI TLS, un mauvais type de média,
  une discordance d'ETag/cache-control/taille/hachage, un ensemble d'omissions d'auto-digest erroné, une
  expiration périmée, ou une divergence candidat/release/source ;
- la machine locale ne possède aucun état d'attestation ou de téléversement et ne peut effectuer de transition
  après transport_captured ;
- LOCAL_STAGE_FAILED ne peut atteindre que cleaning_failure/failed, CANCEL_REQUESTED
  ne peut atteindre que cancelling/cancelled, et les reçus de nettoyage de types croisés sont rejetés ;
- aucune vivacité de processus de contrôleur ou IPC inter-étapes n'est requise ;
- zéro, des sondes d'images en double, réessayées, à point d'entrée arbitraire, natives de l'hôte ou de port
  consommateur sont rejetées, et seule une sonde obligatoire de port producteur peut aboutir ;
- les valeurs partielles, en double, rejouées ou de second ControllerProducerResultV1
  sont rejetées ;
- l'arbre source/détenu de Node ou pnpm, la taille/digest du point d'entrée, le chemin absolu, le digest
  de politique, la sortie de version, l'environnement parent fermé, l'ordre de PATH ou la dérive
  d'exécutable descendant est rejeté avant la première gate locale ;
- la dérive d'archive Python/Dockerfile/contexte à deux fichiers/arbre d'exécution/exécutable,
  le `PATH` du runner, `setup-python`, `PULSE_RELEASE_PYTHON`, une preuve par version YAML uniquement
  ou tout chemin de release hérité `3.14.6` encore invocable est rejeté avant les effets d'image
  d'exécution ou dépendant de Python ;
- la taille/digest du binaire Buildx, la sortie exacte à trois tokens version-et-révision,
  le manifeste/version de BuildKit, le nom du builder,
  le nombre de nœuds, le pilote, la plateforme, les argv create/build/remove, l'ordre des drapeaux, l'env et
  les mutations de contexte sont rejetés ;
- les métadonnées BuildKit manquantes, supplémentaires, malformées ou tronquées, un image.name
  manquant ou incorrect, des métadonnées qui ne sont pas la projection exacte du prédicat SLSA v0.2,
  un `_type` brut autre que Statement/v0.1, un prédicat brut autre que SLSA v1,
  une dérive de projection sémantique, une exhaustivité malhonnête, des matériaux bruts fabriqués,
  et toute mutation de sujet/recette sont rejetés ;
- une attestation de provenance attendue manquante ou altérée, un SBOM, un troisième descripteur
  OCI, un index imbriqué, une plateforme alternative, un artifactType ou sujet
  manquant/incorrect, une configuration d'attestation non vide/au mauvais type de média, une dérive d'annotations et un
  normaliseur qui éliminerait quoi que ce soit d'autre que l'ensemble de descripteurs de provenance
  déjà validé sont rejetés ;
- Playwright 1.61.1, Chromium révision 1228/version 149.0.7827.55, FFmpeg
  révision 1011, l'URL/taille/digest de l'archive, le chemin/taille/digest de l'exécutable, la racine
  de navigateur détenue, le chemin du reporter, les limites, l'inventaire de scénarios et les mutations
  de l'exécutable du navigateur sont rejetés ;
- `scenarios.v1.json`, schéma/version 1, des octets V1 sous le chemin V2, un inventaire
  mixte, tout changement à l'ordre/nombre/hachage de blob/tableau exact des treize ID, un blob de modèle
  validé manquant/ayant dérivé, un rôle de tuple ou reçu erroné, ou une activation
  conjointe absente est rejeté avant la construction de l'acteur et avant toute
  mutation de catalogue ;
- l'omission, le réordonnancement, l'aliasing, la dérive d'environnement ou le résultat non nul de l'une
  quelconque des dix commandes de gate locale est rejeté, y compris l'autorité de manifeste source
  à apps/extension/src/manifest.json avant le build d'extension unique ;
- un point d'entrée de contrôleur de producteur manquant/non autorisé, un miroir YAML
  de commandes brutes, une discordance de hachage de plan de commande ou un ensemble de reçus terminaux non produit par
  cette tentative exacte de contrôleur est rejeté ; l'absence actuelle de
  `scripts/build-sealed-candidate-transport.ts` demeure un cas ROUGE explicite ;
- chaque commande échoue avant exec lorsque le montage source ou tout ancêtre adressable
  est inscriptible, que la lecture seule récursive est absente, que le chemin/FD backing est
  exposé, qu'un overlay existe ou qu'un montage inscriptible est inconnu, tardif, imbriqué,
  chevauchant, non vide, suivi, ou masque un chemin source/module/test/config ;
- un enfant de projet qui peut résoudre/hériter d'un socket Docker/containerd/buildkit/systemd,
  d'un périphérique FUSE, d'un identifiant sudo, d'un gain setuid/capabilité de fichier ou d'un courtier
  d'assistance est rejeté ; l'adaptateur Buildx fixe rejette tout chemin source/backing,
  callback d'enfant, option Docker supplémentaire ou contexte de build ne comportant pas deux fichiers ;
- des enfants hostiles ne peuvent pas temporairement réécrire-et-restaurer ou réécrire à l'identique les octets
  de la source, chmod-et-restaurer, lier physiquement, lier symboliquement, renommer, masquer par bind, appliquer un overlay,
  monter/remonter, exécuter `unshare`, `setns`, `chroot` ou détacher un assistant. Chaque opération
  échoue à la frontière de l'OS et ne peut créer une sentinelle dist dérivée d'un attaquant ;
- un reçu de montage/capabilité/descripteur pré-exec ou post-exit manquant/muté/réordonné, un ensemble
  de capabilités/délimitations non vide, `CAP_SYS_ADMIN`, l'absence de
  `no_new_privs`, une politique seccomp élargie, une topologie d'espace de noms modifiée, un descendant
  non joint, une sortie implicite ou une sortie en dehors des cinq racines déclarées est rejeté
  avant toute autorité locale, de build, de gate packagée, de sceau, de handoff ou de terminal ;
- test:mv3 ou tout second build d'extension est rejeté ;
- une réécriture de dist aux mêmes octets, un remplacement d'inode, une restauration de mode, une réécriture
  de manifeste, un nouveau fichier, un fichier manquant, un lien ou un chemin d'extension chargée alternatif
  est rejeté ;
- les mutations de chemin, digest, corrélation, descripteur, base64, JCS et
  chronologie du handoff/GITHUB_OUTPUT sont rejetées ; la dérive d'autorité ou de reçu de commande
  du handoff/terminal, un ensemble de reçus terminaux qui n'est pas une extension exacte de préfixe, et toute
  discordance d'autorité imbriquée locale/build/MV3/sceau sont rejetés ;
- le finaliseur est l'unique éditeur de transport sans remplacement ; la préexistence,
  la création/copie/renommage à l'étape de handoff, le remplacement ou une seconde publication est rejeté ;
- les instantanés de saga rejettent les trous, les embranchements, les fichiers écrasés, un digest précédent erroné,
  une tentative d'exécution erronée, les fichiers supplémentaires et les combinaisons état/effet illégales ;
- l'ajout de actions:read, l'omission de attestations:write, contents:read, ou
  id-token:write, l'escalade de toute permission ou toute permission de job
  non modélisée est rejeté avant la première étape privilégiée ;
- l'uploader distinct exact `diagnostic_only` pour `test-mv3` n'est accepté que par
  la projection de politique/contrats/factory parent ; le rejet en bloc, un second
  uploader, un épinglage/entrées modifiés, des octets en forme de candidat ou toute valeur de diagnostic
  dans le graphe d'autorité de ce producteur est rejeté ;
- des sorties de succès attest/upload forgées, un mauvais résultat d'action, un chemin de bundle
  vide ou hostile, un mauvais bundle Sigstore, un mauvais ID/URL, l'absence de
  if-no-files-found:error, archive:true, overwrite:true, un chemin alternatif et chaque
  discordance de digest sont rejetés ;
- les tentatives du producteur d'interroger les API du fournisseur, de fabriquer la rétention ou les
  octets du fournisseur, de modifier la dérivation d'entrées épinglées ou de rompre toute
  égalité de ArtifactPublicationJoinV1 sont rejetées ;
- record-cancellation atteint cancelled de la saga pour chacun de never_started,
  cooperatively_cleaned et transport_captured, tandis qu'un nettoyage manquant, un état
  ambigu d'écrivain/processus, un kill forcé du runner,
  un timeout d'étape d'annulation ou un fsync absent n'émet aucune revendication terminale ;
- un échec/annulation sans effet abandonne la réservation, des effets distants possibles/confirmés
  et un terminal manquant exigent une réconciliation, et des reçus de réconciliation hostiles,
  périmés ou partiels portant uniquement sur l'attestation ne peuvent pas débloquer
  l'espace de noms ;
- la dérive d'endpoint de catalogue/preuves, d'audience/revendications/TTL d'OIDC, de SPKI TLS, de digest de requête,
  de clé d'idempotence, de révision CAS, de clé/signature de reçu, de relecture durable ou
  de chemin d'opération est rejetée ; des fichiers de runner ne peuvent jamais se substituer à l'un ou l'autre
  service externe ;
- les nouvelles tentatives ne réutilisent jamais un acteur, une racine de tentative, un builder, un handoff, une attestation ou
  un artefact et ne peuvent pas réserver un espace de noms antérieur bloqué.

La gate finale de vérification doit également exécuter les tests de modèle de release-readiness
du dépôt, les tests de politique de workflow, les tests de transport canonique, les tests
adversariaux de consommateur, la vérification de formatage, le typecheck et git diff --check. Une suite
de tests au vert ne peut supplanter un hachage de modèle révisé manquant ou tout bloqueur
explicite d'admission dans ce document. En particulier, elle ne peut supplanter des approbations
indépendantes manquantes pour la clarification 11 de release-readiness, la révision 26 du harness MV3,
la révision 11 des onglets packagés, la révision 6 de CV ou ce modèle de producteur, ni supplanter
un reçu spécifique à un rôle ou une activation conjointe manquante.

## 13. Liste de contrôle de revue

- [ ] Le terminal local est transport_captured ; le terminal de la saga est
      uploaded_digest_verified.
- [ ] La saga ne se reconstruit qu'au sein du même job et ne revendique aucune durabilité
      de RUNNER_TEMP après la perte du runner.
- [ ] La construction de l'acteur et la réservation du candidat forment un CAS durable unique ;
      RC_SEAL_INGESTED valide de manière durable rc_built avant le handoff/téléversement.
- [ ] L'autorité du producteur inter-jobs est l'enregistrement terminal immuable signé complet
      contenant la chaîne complète et le ArtifactPublicationJoinV1 exact.
- [ ] Les sorties d'actions sont validées et corrélées avant les transitions.
- [ ] L'exécution du contrôleur est une invocation atomique fermée unique avec l'exécutable,
      l'argv, le cwd, l'environnement, le stdin, les FDs/CLOEXEC, le staging,
      les schémas d'enveloppe, l'échéance absolue et le comportement kill/join exacts.
- [ ] Le succès du contrôleur consomme exactement une invocation de port d'image d'exécution
      réservée au producteur, distincte de chaque port consommateur.
- [ ] L'argv de sonde, stdin/stdout, le digest d'image, l'environnement, le timeout, le tmpfs,
      le réseau, l'ensemble de montages, la consommation à usage unique et les pré-images de reçus sont fermés.
- [ ] La topologie de Buildx v0.34.1 et BuildKit v0.30.0 est exacte.
- [ ] Les métadonnées brutes de Buildx comportent exactement cinq clés réelles ; le digest/descripteur lient
      l'index OCI brut et le manifeste/config proviennent uniquement du parcours du graphe.
- [ ] SLSA v1 est explicitement demandé, ses matériaux bruts restent honnêtes, et la
      projection d'hôte distincte lie le contexte local.
- [ ] L'OCI brut comporte exactement une image et une attestation de provenance validée ;
      l'OCI normalisé comporte exactement une image et aucune attestation.
- [ ] Le téléversement a le chemin exact et if-no-files-found:error avec archive:false.
- [ ] Le finaliseur publie le transport exactement une fois ; la capture de handoff ne peut que
      le recapturer et publier le handoff.
- [ ] Le job possède exactement attestations:write, contents:read, et id-token:write.
- [ ] Les audiences OIDC d'attestation nobody/sigstore et l'audience du courtier de catalogue
      missionpulse-release-catalog sont des capabilités disjointes à usage unique.
- [ ] La politique de workflow couvre chaque permission, étape, expression, entrée, sortie,
      clé env et épinglage d'action.
- [ ] Les restrictions GITHUB_OUTPUT s'appliquent aux étapes run du projet tandis que les sorties d'actions
      épinglées exactes restent des observations hostiles bornées.
- [ ] Le téléversement de preuves en lecture seule de test-mv3 est projeté séparément et ne peut
      jamais constituer une autorité de transport candidat.
- [ ] Chaque run ID est une chaîne décimale canonique unique de bout en bout et n'est jamais
      contraint via un nombre JavaScript.
- [ ] Le producteur ne formule aucune revendication d'API fournisseur ; l'observation fournisseur reste une
      responsabilité du consommateur.
- [ ] L'autorité de scénario est importée exclusivement depuis la constante V2 parent :
      `scenarios.v2.json`, schéma 2, treize ID ordonnés et les deux hachages exacts ;
      les preuves V1 et mixtes échouent avant la réservation.
- [ ] Le port d'objets Git fixe matérialise de manière exhaustive le commit/arbre propre complet
      dans un arbre backing réservé au contrôleur ; chaque enfant s'exécute depuis
      la vue source récursivement en lecture seule avec des ancêtres en lecture seule, zéro
      overlay/masquage, uniquement cinq montages de sortie fermés, aucune capabilité,
      le seccomp hérité et des reçus de commandes pré/post concordants.
- [ ] Les attaques par réécriture/restauration temporaire, réécriture aux mêmes octets, chmod, lien physique, lien symbolique,
      renommage, masquage par bind/overlay, remontage, échappement d'espace de noms et enfant détaché
      échouent à la frontière de l'OS ; une projection Git post-exécution propre seule
      ne possède aucune autorité.
- [ ] L'activation recalcule l'ensemble des six blobs de modèles sous leurs conventions de hachage
      distinctes ; le candidat, l'audit et la gate packagée répètent les projections fixes
      identiques octet par octet de MV3 révision 26 et d'onglets packagés révision 11 plus
      le même digest d'activation conjointe validé.
- [x] La révision 11 des onglets packagés est liée au hachage normalisé
      `30b628046132da3222a7affb19044ed92d46ea71bf31192509f10a98e400ddb9`
      et au commit source approuvé `ff9164c4`.
- [ ] Les approbations indépendantes de la clarification 11 parent, de la révision 26 de MV3, de la révision
      6 de CV et de ce hachage en attente exact de révision 11 du producteur n'autorisent que la phase d'implémentation
      conjointe inactive ; la construction de l'acteur requiert de plus l'activation
      atomique finale.
- [ ] La vérification nominale pré-activation utilise uniquement le bac à sable `verification_only`
      délimité à la phase avec l'ensemble implémenté ordonné, émet uniquement des preuves de créneau de producteur,
      et prouve qu'elle ne peut pas consommer de reçus de vérification,
      muter le catalogue global, publier un acteur/transport ou forger une autorité
      d'activation.
- [ ] Chromium et FFmpeg autorisés par le contenu sont approvisionnés avant le build
      unique d'extension.
- [ ] Node et pnpm autorisés par le contenu utilisent des points d'entrée conservés absolus et un
      environnement de gate fermé, avec liaison complète de ToolMaterialsReceiptV1.
- [ ] Playwright teste le dist figé exact sans le reconstruire.
- [ ] START dérive le candidat depuis les objets Git et l'audit depuis le canal de preuves
      externe immuable, signé et épinglé par TLS sans auto-référence Git.
- [ ] Les politiques requises manquantes sont des bloqueurs explicites.
- [ ] record-cancellation rend SAGA_CANCELLED atteignable sans confondre
      cancelled() de GitHub, le nettoyage coopératif ou la mort non observée du runner.
- [ ] Les effets distants d'attestation et d'artefact sont représentés indépendamment.
- [ ] Les gardes de succès de réservation, d'abandon, de réconciliation, de perte d'échéance et
      de nouvelle tentative utilisent des reçus signés du catalogue externe authentifié par OIDC
      et restent durables après la perte du runner.

Si un élément quelconque ne peut être prouvé par des valeurs typées, des gardes pures, des descripteurs conservés,
des instantanés intra-job ayant fait l'objet d'un fsync, des enregistrements de catalogue signés et durables à l'extérieur, des
reçus de réconciliation signés et des comparaisons exactes d'octets, le producteur n'est pas prêt
à être implémenté.
