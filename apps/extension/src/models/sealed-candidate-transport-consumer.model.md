# Modèle du consommateur de transport de candidat scellé (Sealed Candidate Transport Consumer Model)

Statut : **EN ATTENTE DE REVUE INDÉPENDANTE — RÉVISION 12 ; IMPLÉMENTATION INTERDITE**

Version du modèle : `12`

Pending content SHA-256: `a70f1f6b410f82c45e4bd3acfedbef8bb2a2bb51b417038c1911f6633d5cfd2e`

Le hash en attente est le SHA-256 des octets complets UTF-8/LF de ce fichier après remplacement uniquement de la valeur sur la ligne `Pending content SHA-256` par le littéral `__PENDING_SHA256__`. Toute modification sémantique exige un nouveau hash et une nouvelle revue.

Le hash de contenu en attente de la révision 7 `b0f66e80b73c2d9b7028c902945f8cd84a04c2fd917ca7c8c5647e859ce99aea` a été rejeté de manière indépendante car il redéclarait des limites et des types de snapshot parents obsolètes, traitait le snapshot d'octets transitoire comme s'il pouvait être chargé depuis le stockage durable de disponibilité (readiness), et conservait des dépendances aux clarifications 3/4 après la bascule V2 du parent. La révision 8 importe directement l'autorité de la clarification 6, ne conserve que le tuple stable à trois identifiants plus le hash complet de l'événement V après commit, et n'accepte que l'inventaire de scénarios V2 à treize entrées. Aucune approbation n'est transférée depuis la révision 7.

Cette révision remplace également le hash en attente rejeté de la révision 6 `e47a72c8f1f9c17365e830e3644dbd2dc755a77aaccd59ac1471eada62548c8e`, les hashs en attente rejetés `aca997648e6072311ed69a4c544db1606fc4513534d9e4cd3b2524fc860c4820` et `b38f91143ce37c126c2a34c15ef390bd391cf9238149dbe276b2d4642b54d3e5`, le hash rejeté de la révision 3 `2f84cd4ac81c005a1437e7f475c119f9e84ae7a87095abff4ee05c89d89a331a`, le hash rejeté de la révision 4 `e9d9b288c194049ec3346f08671538acb773f65f4a57b7fa9b55ad95687fd466`, ainsi que le hash rejeté de la révision 5 `b55daa5e9b8a5e3c4cbabd2c60a6b18bdfa3e342168137c96f3a7b823ede1cef` ; aucune approbation n'est transférée depuis un hash antérieur. La révision 4 laissait le surveillant de date limite globale (global deadline watcher) non identifiable après réessai, laissait deux sous-phases du fournisseur en dehors de leur budget d'étape persistant, et ne fournissait aucune source authentifiée pour le digest de sortie dynamique de l'uploader. La révision 5 ne parvenait pas à distinguer les requêtes initiales `200` porteuses d'ETag de la réponse valide sans ETag `302` de téléchargement d'artefact. La révision 6 nommait une chaîne de producteurs locale au runner comme si elle était durable entre plusieurs jobs, référençait un type de ralliement de publication indéfini, et représentait les identifiants de run GitHub sous forme de nombres sujets à perte de précision. La révision 7 ne consomme que l'enregistrement terminal signé immuable du producteur et le type de ralliement commun exact du modèle producteur. La révision 8 préserve ces corrections.

La révision 8 a été rejetée de manière indépendante avec le hash de contenu normalisé UTF-8/LF `0b45a13f2616dc31261a9e42f944f9b48f9ca138ab7dd29b7a1f40ded3078d30` car la clarification 6 n'exposait ni les tuples complets d'autorité du modèle MV3/package ni une activation atomique, et le consommateur pouvait par conséquent accepter des preuves V2 revues sans prouver leurs reçus d'implémentation et de vérification. La révision 9 importe la clarification 7 avec le hash de comportement `68fcad275f84b07f050cef96e01d4dc8402be06123d4509ad792e3dd5cd7d9df`, exige la révision 7 du producteur avec le hash de contenu `4a50bdd112538e6c27a1bdd2dee9199afb4ac8cb93d0991b659ee69baeb1560d`, et n'admet que l'activation conjointe commitée portant le tuple d'autorité complet pour la révision 26 de MV3 avec le hash de comportement `da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b` et le tuple complet pour la révision 4 de packaged-tab avec le hash de comportement `24dd339609de659497eb6e958319fe244149184137360c2dc9ca464d049486b0`. Aucune approbation n'est transférée depuis la révision 8.

La révision 9 a été rejetée de manière indépendante avec le hash de contenu normalisé UTF-8/LF `c44b2923cb3ce2a0ba91e4946258b97610a6531180a43c8387158cebb2ad5d10`. Elle permettait à la sandbox de pré-activation de dépendre d'une autorité de modèle déjà vérifiée, préservant ainsi le cycle d'amorçage revue/implémentation/vérification, et s'appuyait sur un producteur qui exécutait des octets du checkout ambiant alors que l'activation ne prouvait que deux blobs de modèle. La révision 10 ne consomme l'ensemble implémenté que pour les preuves de vérification privées, ne consomme l'ensemble vérifié complet qu'à travers l'activation finale, et requiert la preuve d'espace de travail d'exécution par objets Git de la révision 8 du producteur. Aucune approbation n'est transférée depuis la révision 9.

La révision 10 importe la clarification 8 avec le hash de comportement `59291b22722dbf67117f32a5ff6153da9d3885aa13e4e3574cad6898c238624f`, exige la révision 8 du producteur avec le hash de contenu `9230fb822573972143a077fa5f2d7936775268553ead12c7524b246b7f344799`, et n'admet la production qu'à travers l'ensemble vérifié ordonné complet contenant la révision 26 de MV3 avec le hash de comportement `da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b` et la révision 5 de packaged-tab avec le hash de comportement `2e8e56fd119d8fccf08f1463cc12aca7dd9ff21af3d18118212ccbad6d911cc5`. Le chemin de pré-activation ne consomme que l'ensemble implémenté et émet des preuves ; aucun reçu ni autorité d'activation n'est déduit de ces preuves.

La révision 10 a été rejetée de manière indépendante avec le hash de contenu normalisé UTF-8/LF `afb672e8c1fa794d3deef7c4e436b68a515499d4ae5a77c40dadea86c4338d05`. Elle acceptait la recapture Git pré/post du producteur alors même que la source matérialisée et ses parents restaient accessibles en écriture pendant l'exécution des commandes. Un processus enfant du producteur pouvait temporairement modifier, faire un chmod, remplacer ou masquer (shadow) la source, dériver le candidat transporté, et restaurer les octets attendus avant le reçu terminal. La révision 11 exige la clarification 9 et l'autorité complète de source immuable garantie par l'OS de la révision 9 du producteur, ainsi que chaque reçu ordonné de commande de montage/capabilité pré/post avant la première requête auprès du fournisseur. Aucune approbation n'est transférée depuis la révision 10.

La révision 11 importe la clarification 9 avec le hash de comportement `8df2c60e71c02c279a167b78a4fb3b24931f069327d0137d26d461451418a9a5`, exige la révision 9 du producteur avec le hash de contenu `5c37fe07586b830b188fb0b6bf128e3955ae4ac103d16e32f56a1dea2c617872`, et n'admet la production qu'à travers l'ensemble vérifié ordonné complet contenant la révision 26 de MV3 avec le hash de comportement `da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b` et la révision 6 de packaged-tab avec le hash de comportement `9b73affd0e6096ec8b2b60a1e5cffaa93633c0a5fea4cbf4d2ba91ae2c56b044`.

La révision 11 a été retirée avec le hash de contenu normalisé UTF-8/LF `b71a879cbdccde9b2780588a302c2674f8ba1982e8619768beb87ad47b82676c`. Elle importait la clarification 9 et la révision 9 du producteur retirées, et son contrat d'admission actuel sélectionnait encore la révision 6 des packaged tabs. La révision 12 préserve la topologie complète d'états du consommateur, la durée de vie des octets transitoires, la preuve de source immuable, l'autorité V2 à treize identifiants et la projection durable à trois identifiants/hash d'événement. Elle importe la clarification 11 avec le hash de comportement normalisé `9afa97e0848b6c5c6540d33f38e29a409112a531f9ff2cd7124e50ef96511080` et la révision 11 du producteur avec le hash de contenu normalisé `bf681ebf0a2714f77bf48bfa0e121461ce69639814c5b60fbb6dffbadab43792`, et n'admet que l'activation vérifiée à six slots contenant la révision 26 de MV3, la révision 11 de packaged tabs et la révision 6 de l'ancre accessible CV à leurs hashs exacts. La révision 11 de packaged tabs a été approuvée de manière indépendante et commitée sous `ff9164c4`. Aucune approbation n'est transférée depuis la révision 11, depuis un modèle amont retiré ou depuis une dépendance de package/CV remplacée.

Un candidat antérieur de la révision 12 a été rejeté de manière indépendante avec le hash de contenu normalisé UTF-8/LF `2375eccc6c193db297f9d948a70d3b7d93a9be1fa5bbca95eeffd61e9c754107`. Il importait le hash de la clarification 11 de release-readiness rejetée `c684d808d1827f5cc7d5f688547c7da0feca30935956dcb16dc197301a461287` et le hash de la révision 11 dépendante du producteur `8769aa6fea28d0e1c37e416db27c30a7735bc8ec62cf2f38cbda16945e9fb1ab`, si bien que son activation à six slots ne pouvait authentifier son propre modèle parent. Le consommateur révisé importe les autorités corrigées du parent et du producteur. Aucune approbation n'est transférée depuis le candidat rejeté de la révision 12 ou depuis l'un des hashs amont rejetés.

## 1. Objectif et périmètre

Ce modèle définit l'unique consommateur légal de validation de package pour un artefact `missionpulse-sealed-candidate` déjà téléversé. Le succès signifie :

1. une observation exacte d'artefact GitHub et un blob téléchargé sont authentifiés ;
2. son transport canonique à sept composants et son autorité de payload à six entrées sont vérifiés à partir des octets capturés ;
3. une capabilité opaque de payload vérifié admet un hôte `linux/x64` ;
4. l'environnement d'exécution OCI prouvé `linux/amd64` émet un reçu exact de vérification de payload ; et
5. le protocole strictement réservé aux packages publie un `ValidatedZipArtifactV1` exact.

Ce modèle ne consomme que la clarification 11 de `release-readiness.model.md` et le raffinement de la révision 11 du producteur aligné sur celle-ci. Il importe directement les limites de snapshot détenues par le parent, le type de snapshot, le type de projection vérifiée, le vérificateur et l'enregistrement durable de l'événement V accepté. Il ne déclare aucune copie de compatibilité, limite de repli ou vérificateur local. Les schémas de la clarification 11, les préimages de digest, les règles ZIP canoniques, le journal de package, la chronologie, la durée de vie des octets transitoires et la projection durable à trois identifiants/hash restent normatifs. L'approbation de ce seul hash de consommateur ne peut satisfaire aucune dépendance de modèle amont.

Le candidat admis à G0 ne doit porter que l'inventaire V2 exact du parent : `apps/extension/tests/mv3/scenarios.v2.json`, version de schéma `2`, les treize identifiants ordonnés, le SHA-256 du blob `b386a936abad72ccd4fe2b0dd5cdf2390a6762e3d2ce3e0b0e07635f16f6a1ef` et le SHA-256 JCS du tableau `2a9c9f67e0c19a0dae126f7db15c25a0c1411b0753e63ecad6eaa0824720f79a`. Les preuves V1 ou mixtes n'ont aucune autorité auprès du consommateur.

Hors périmètre et bloquant toujours la release :

- la création du sceau (seal), de l'image d'exécution, du bundle de contrôleur ou du transport ; ceux-ci sont spécifiés par `sealed-candidate-transport-producer.model.md`, dont le statut est en attente de revue indépendante et l'implémentation interdite ;
- l'implémentation avant l'approbation indépendante de la clarification 11 exacte, de la révision 11 du producteur, de la révision 26 du harnais packagé MV3, de la révision 11 de packaged-tab et de la révision 6 de l'ancre accessible CV ;
- la consommation de tout candidat à la release avant que la phase conjointe détenue par le parent n'ait validé son activation atomique unique ;
- le téléversement/suppression/écrasement d'un artefact ou la modification de sa rétention ;
- la soumission, la promotion ou le rollback sur le Chrome Web Store ;
- les API génériques de téléchargement, décompression ou d'exécution OCI.

Le consommateur effectue des opérations en lecture seule auprès du fournisseur. Les identifiants accordent un accès, jamais une autorité de release. Aucun log, code de sortie, texte libre, état de tableau de bord ou résultat de LLM ne décide d'une transition.

La vérification de pré-activation est limitée à la `JointImplementationVerificationSandboxV1` de la clarification 11 délimitée à cette phase. Elle consomme exactement un `OrderedReviewedImplementedModelAuthoritySetV1`, jamais un ensemble vérifié ni un reçu de vérification. Son autorité complète de source immuable, son plan de commande fermé et les reçus ordonnés de montage/capabilité qui en résultent constituent des preuves obligatoires. Les gardes pures, machines, parseurs et adaptateurs hermétiques peuvent être exercés contre l'arbre gelé, mais aucun catalogue global, acteur de disponibilité de production, requête auprès du fournisseur, point d'entrée consommateur ou mutation d'artefact n'est permis. La seule sortie positive est le `JointModelVerificationEvidenceV1` du slot consommateur, consommé plus tard par le signataire indépendant du reçu de vérification. La véritable preuve fournisseur/runtime/package n'intervient qu'après l'activation atomique et reste une porte de release distincte ; elle n'est pas forgée pour briser le cycle de revue de modèle.

Chaque processus enfant de pré-activation qui charge du code du dépôt s'exécute à partir de la vue de source Git récursivement en lecture seule de la sandbox sous ses montages de sortie fermés et son protocole de reçus de montage/capabilité. Le consommateur de production post-activation ne monte pas la source Git, l'arbre de support du producteur ou le checkout ambiant du tout ; il exécute uniquement les octets du contrôleur/runtime autorisés par leur contenu et les entrées scellées capturées, avec les racines de préparation/rapport de package comme sorties explicites. Un processus enfant de production qui pourrait résoudre un chemin de source du dépôt est invalide avant son lancement.

## 2. Contrats d'entrée, de sortie et d'autorité privée

L'entrée publique de démarrage ne contient qu'une référence autoritaire d'acteur de disponibilité, des sélecteurs de fournisseur et les horodatages d'échéance à fenêtre fixe. Un `CandidateIdentityV1` ou un sceau fourni par l'appelant est interdit :

```ts
interface SealedCandidateConsumeRequestV6 {
  schema: 'missionpulse.sealed-candidate-consume-request';
  version: 6;
  consumerId: string;
  attemptId: string;
  readinessActor: {
    actorId: string;
    expectedContextSha256: Sha256;
  };
  runId: string; // canonical positive decimal ASCII, 1..32 bytes, no leading zero
  runAttempt: number;
  requestedAt: CanonicalUtcTimestamp;
  attemptDeadlineAt: CanonicalUtcTimestamp;
}
```

`runId` et chaque projection de fournisseur/attestation/workflow-run de celui-ci sont la même chaîne ASCII de 1 à 32 octets correspondant à `/^(?:[1-9]\d*)$/` ; la comparaison se fait octet par octet. Le parseur de fournisseur sans perte rejetant les clés dupliquées mappe directement un lexème entier JSON canonique brut vers cette chaîne sans jamais construire de nombre JavaScript ; une chaîne d'API doit respecter la même grammaire lors d'un aller-retour. Les fractions, exposants, signes, le zéro et les zéros initiaux sont rejetés. Cela préserve les identifiants au-delà de la plage des entiers sûrs de JavaScript. `runAttempt` reste un entier positif sûr. C'est le contrat exact `CanonicalPositiveDecimalString` de la clarification 11 de release-readiness.

```ts
type ConsumerBoundedStage =
  | 'readiness-load'
  | 'provider-observation'
  | 'transport-download'
  | 'attestation-verification'
  | 'transport-verification'
  | 'payload-authority-verification'
  | 'host-admission'
  | 'oci-runtime'
  | 'readiness-commit'
  | 'package-validation'
  | 'package-recovery'
  | 'cleanup';

interface ConsumerDeadlineAuthorityV1 {
  deadlineAuthorityId: Sha256;
  initialAttemptId: string;
  requestedAt: CanonicalUtcTimestamp;
  attemptDeadlineAt: CanonicalUtcTimestamp;
  workDeadlineAt: CanonicalUtcTimestamp;
  admittedWallAt: CanonicalUtcTimestamp;
  maxObservedWallAt: CanonicalUtcTimestamp;
  admittedMonotonicNs: string;
  workMonotonicDeadlineNs: string;
  hardMonotonicDeadlineNs: string;
  requestDeadlineWatcher: {
    generation: number;
    attemptId: string;
    invocationId: Sha256;
    startedMonotonicNs: string;
  };
  stageConsumedMs: Readonly<Record<ConsumerBoundedStage, number>>;
  activeInvocation: null | {
    stage: ConsumerBoundedStage;
    invocationId: Sha256;
    allocatedBudgetMs: number;
    startedWallAt: CanonicalUtcTimestamp;
    startedMonotonicNs: string;
  };
}

const CONSUMER_DEADLINES = Object.freeze({
  attemptMs: 2_700_000,
  cleanupReserveMs: 120_000,
  stageMs: Object.freeze({
    'readiness-load': 30_000,
    'provider-observation': 120_000,
    'transport-download': 600_000,
    'attestation-verification': 120_000,
    'transport-verification': 300_000,
    'payload-authority-verification': 300_000,
    'host-admission': 60_000,
    'oci-runtime': 600_000,
    'readiness-commit': 60_000,
    'package-validation': 600_000,
    'package-recovery': 600_000,
    cleanup: 120_000,
  }),
});

interface ConsumerDeadlineExceededV1 {
  schema: 'missionpulse.sealed-candidate-consumer-deadline-exceeded';
  version: 1;
  consumerId: string;
  attemptId: string;
  deadlineAuthorityId: Sha256;
  stage: ConsumerBoundedStage | 'request';
  invocationId: Sha256;
  attemptDeadlineAt: CanonicalUtcTimestamp;
  observedAt: CanonicalUtcTimestamp;
  observedMonotonicNs: string;
}

interface AdmittedReadinessActorSnapshotV1 {
  actorId: string;
  contextSha256: Sha256;
  state: 'rc_built';
  candidate: CandidateIdentityV1;
  jointModelActivation: JointReleaseModelActivationV1;
  seal: TestedDistSealV1;
  transportObservation: null;
  payloadVerification: null;
  packageJournal: null;
  artifact: null;
  pendingRestart: null;
}

interface ConsumerProducerSourceExecutionProofV1 {
  schema: 'missionpulse.consumer-producer-source-execution-proof';
  version: 1;
  proofSha256: Sha256;
  sourceCommit: string;
  gitTreeObjectId: string;
  sourceWorkspaceMaterializationSha256: Sha256;
  immutableSourceExecutionAuthority: ImmutableGitSourceExecutionAuthorityV1;
  sealCommandReceiptSetSha256: Sha256;
  sealCommandReceipts: readonly [
    ImmutableGitSourceCommandReceiptV1,
    ...ImmutableGitSourceCommandReceiptV1[],
  ];
  handoffCommandReceiptSetSha256: Sha256;
  handoffCommandReceipts: readonly [
    ImmutableGitSourceCommandReceiptV1,
    ...ImmutableGitSourceCommandReceiptV1[],
  ];
  terminalCommandReceiptSetSha256: Sha256;
  terminalCommandReceipts: readonly [
    ImmutableGitSourceCommandReceiptV1,
    ...ImmutableGitSourceCommandReceiptV1[],
  ];
  verifiedAt: CanonicalUtcTimestamp;
}

interface ReleaseRuntimeHostAdmissionReceiptV1 {
  schema: 'missionpulse.release-runtime-host-admission-receipt';
  version: 1;
  consumerId: string;
  attemptId: string;
  readinessActorId: string;
  controllerExecutionAuthoritySha256: Sha256;
  producerSourceExecutionProofSha256: Sha256;
  admittedAt: CanonicalUtcTimestamp;
}

// Normative parent imports. This consumer declares none of these symbols.
import {
  PACKAGED_MV3_SCENARIO_INVENTORY_V2,
  JOINT_MODEL_BLOB_RULES_V1,
  REQUIRED_CV_ACCESSIBLE_ANCHOR_MODEL_V6,
  REQUIRED_MV3_HARNESS_MODEL_V26,
  REQUIRED_PACKAGED_TAB_MODEL_V11,
  RELEASE_PAYLOAD_SNAPSHOT_AGGREGATE_WITNESS,
  RELEASE_PAYLOAD_SNAPSHOT_FIELD_LIMIT_SUM,
  RELEASE_PAYLOAD_SNAPSHOT_LIMITS,
  verifyPayloadByteSnapshot,
  type AcceptedPayloadVerificationLocalEventV1,
  type ImmutableGitSourceCommandReceiptV1,
  type ImmutableGitSourceExecutionAuthorityV1,
  type JointImplementationVerificationSandboxV1,
  type JointModelVerificationEvidenceV1,
  type JointReleaseModelActivationV1,
  type OrderedReviewedImplementedModelAuthoritySetV1,
  type OrderedReviewedImplementedVerifiedModelAuthoritySetV1,
  type ReleasePayloadByteSnapshotV1,
  type ReleasePayloadVerifiedIngestedV1,
  type ReviewedImplementedVerifiedModelAuthorityV1,
  type VerifiedReleasePayloadProjectionV1,
} from 'missionpulse-release-readiness-clarification-11-authority';
```

L'import est nominal et provient d'une source unique : les vérifications de contrat sur source/AST rejettent toute déclaration du consommateur portant le même nom qu'un symbole importé, toute copie de structure à seize/vingt clés, toute copie de carte de limites de champs, toute copie de valeur agrégée, tout wrapper réimplémentant le vérificateur ou tout repli à l'exécution lorsque l'export parent est indisponible. La limite agrégée du parent est exactement `1_610_612_736`, la somme de ses treize plafonds de champs donne `1_707_081_728`, et le consommateur ne lit ces nombres qu'à travers les trois exports de limite/témoin importés.

`ConsumerProducerSourceExecutionProofV1.proofSha256` est le SHA-256 du JCS RFC 8785 de la preuve complète avec uniquement `proofSha256` omis. Il est construit et gelé pendant G0, avant toute requête GitHub. Le consommateur recalcule de manière indépendante le digest propre de l'`ImmutableGitSourceExecutionAuthorityV1` parente et exige que le terminal signé du producteur, son handoff complet, le sceau de readiness et les deux reçus de complétion de workspace contiennent exactement la même autorité de production et le même commit/arbre/matérialisation Git.

L'autorité n'est validée que lorsque la vue complète des sources et chaque ancêtre adressable sont récursivement `ro,nodev,nosuid,noexec`, que l'arbre/chemin sous-jacent et ses descripteurs étaient inaccessibles aux enfants, que `overlayMountCount` est nul, et que les seules racines accessibles en écriture sont les dépendances, le cache, dist, le profil du navigateur et les rapports. Chaque racine sous-jacente accessible en écriture se situe en dehors des sources ; une cible située dans les sources dispose d'une preuve d'absence complète et exacte dans l'arbre, d'aucun descendant suivi et d'une observation pré-montage vide. Tout ancêtre accessible en écriture, tout montage supplémentaire/tardif/imbriqué/chevauchant, tout bind ou overlay sur un chemin de source/module/test/fixture/harness/script/model/policy/manifest/lock/config, tout masquage par le gestionnaire de paquets ou toute sortie implicite est terminal.

Chaque ensemble de capabilités effectif, permis, héritable, ambiant et limitant est vide ; `CAP_SYS_ADMIN` est absent, `no_new_privs` est vrai, et la politique seccomp/système de fichiers revue refuse mount/remount, l'évasion de namespace/chroot et toute écriture/troncature/chmod/chown/lien physique/lien symbolique/renommage/remplacement sur les sources. Chaque enfant du projet doit également avoir zéro socket de service privilégié ou périphérique FUSE et aucun gain par sudo, setuid, capabilité de fichier ou courtier d'aide ; tout adaptateur Buildx détenu par le contrôleur est validé comme un port de requête fixe séparé qui ne reçoit jamais de chemins de source/support ni n'expose sa capabilité Docker à un enfant. Chaque reçu de commande ordonné valide indépendamment son digest propre, son plan d'exécutable/argv/environnement/cwd/sorties, le ralliement complet de ses descendants et les observations de montage, capabilités et descripteurs pré/post correspondantes. Les reçus de sceau constituent un préfixe exact des reçus de handoff, et les reçus de handoff constituent un préfixe exact des reçus terminaux. Le reçu produisant le build est unique et écrit uniquement dans le montage séparé dist.

Les projections Git propres pré/post ne relèvent que de la défense en profondeur. Une réécriture-et-restauration temporaire, une réécriture à l'octet identique, un chmod-et-restauration, un lien, un lien symbolique, un renommage, un masquage bind/overlay, un remontage, une évasion de namespace, un accès au chemin sous-jacent, un reçu manquant ou un enfant non rallié entraîne un rejet même si le digest final de la source est identique. G0 ne persiste que le digest immuable de la preuve après admission ; le terminal signé complet reste son autorité de rechargement. Sans cette preuve, le consommateur n'effectue aucune lecture de fournisseur, téléchargement, exécution runtime ou mutation de readiness.

Le consommateur charge uniquement le contexte durable de l'acteur de release-readiness par son `actorId` exact avant toute requête GitHub, recalcule `releaseContextSha256` sur le contexte canonique renvoyé et exige l'égalité avec `expectedContextSha256`. À G0, le contexte contient le candidat et le sceau mais aucun snapshot, aucune projection vérifiée et aucun événement V accepté. Après V, il peut contenir l'observation et la vérification acceptées plus exactement un `AcceptedPayloadVerificationLocalEventV1` importé ; cet enregistrement durable ne contient que `[attestationId, verificationId, snapshotId]` et le `eventSha256` complet. Le snapshot à seize champs et la projection à vingt champs ne sont jamais chargeables depuis un stockage durable. Il n'existe aucune révision d'acteur ou de registre d'acteurs dans ce contrat CAS. L'acteur chargé, et non la requête publique, fournit le candidat immuable, le sceau, le commit source, le dépôt, la référence principale, le workflow et les politiques. Le run ID/attempt positifs restent des filtres non approuvés. Le nom de l'artefact et le format de transport sont des constantes :

```text
missionpulse-sealed-candidate
missionpulse-canonical-zip-v1
```

### 2.1 Échéance absolue de requête et budgets enfants sans réinitialisation

Avant d'analyser `CONSUME_REQUESTED`, le port d'horloge fixe capture une valeur d'horloge murale de confiance et une valeur en nanosecondes monotone au processus. La requête n'est acceptée que lorsque les deux horodatages sont canoniques, que `attemptDeadlineAt - requestedAt` est exactement égal à 2 700 000 ms, et que l'observation murale de confiance se situe dans cet intervalle semi-ouvert. `workDeadlineAt` est situé exactement 120 000 ms avant `attemptDeadlineAt`. L'acteur dérive les deux échéances monotones privées en ajoutant uniquement la durée restante de l'horloge murale de confiance à l'échantillon monotone capturé ; un appelant ne peut fournir aucune des deux valeurs monotones.

`deadlineAuthorityId` est le SHA-256 JCS de `{domain:"missionpulse.consumer-deadline-authority.v1", consumerId, initialAttemptId, requestedAt, attemptDeadlineAt}`. L'autorité complète `ConsumerDeadlineAuthorityV1` est gelée dans le contexte sérialisable de l'acteur. Chaque échantillon mural de confiance met à jour `maxObservedWallAt = max(previous, sample)`. Un échantillon inférieur au maximum persisté lors d'un redémarrage constitue une ambiguïté de rollback et déclenche le nettoyage d'échéance sans démarrer de nouveau travail ; il n'est jamais utilisé pour dériver une échéance plus longue. À l'intérieur d'un processus, le temps écoulé et les décisions d'échéance n'utilisent que l'horloge monotone.

L'entrée de requête acceptée persiste `requestDeadlineWatcher` avant d'invoquer l'acteur fixe `watchConsumerRequestDeadline`. Son `invocationId` est le SHA-256 JCS de l'ID d'autorité d'échéance, de l'ID de tentative courante exact, de la génération et de `workDeadlineAt` inchangé. Son reçu utilise l'étape `request` et le même `deadlineAuthorityId`. Le surveillant reste actif à travers les états ordinaires et `retry_wait`. Un réessai accepté arrête et rallie atomiquement la génération N, met à jour l'ID de tentative, incrémente la génération en entier sûr, persiste le nouvel ID d'invocation et démarre la génération N+1 contre la même échéance absolue `workDeadlineAt` ; ce remplacement n'accorde aucun temps supplémentaire. Après redémarrage, la même génération persistée est recréée sans extension. Un timeout de requête n'est accepté que depuis ce surveillant privé exact ; un timeout d'enfant n'est accepté que depuis l'`activeInvocation` exacte. Un reçu d'étape `request` peut ainsi être authentifié même lorsqu'aucun enfant n'est actif. Le surveillant est arrêté dans un état terminal. Les minuteurs par enfant utilisent leur `ConsumerBoundedStage` exacte.

Après `SERVICE_RESTARTED`, un enfant actif inconnu se voit prudemment imputer la totalité de son budget alloué persisté `allocatedBudgetMs`, et non une estimation non prouvable de l'horloge murale, puis est effacé. Ce n'est qu'alors qu'une échéance monotone locale au processus peut être dérivée de la durée absolue restante inchangée. Un redémarrage, un réessai, un nouvel enfant, un conflit CAS, une annulation ou une récupération peut raccourcir mais jamais remplacer l'une ou l'autre échéance absolue.

Les douze clés de `stageConsumedMs` sont présentes exactement une fois, s'initialisent à l'entier sûr zéro et ne peuvent augmenter que par des millisecondes bornées en entiers sûrs. `activeInvocation` est à assignation unique tant qu'un enfant est actif ; un second enfant ne peut réserver un budget simultanément.

Avant d'invoquer un enfant, l'acteur persiste `activeInvocation`, y compris son allocation exacte `allocatedBudgetMs`, et assigne la plus petite valeur entre :

1. le budget cumulé restant exact de l'étape `CONSUMER_DEADLINES.stageMs[stage] - stageConsumedMs[stage]` ; et
2. la durée restante de l'échéance de travail pour les étapes ordinaires, ou la durée restante absolue de tentative pour `cleanup`.

Lors d'un résultat ordinaire, d'un échec ou d'une annulation, il impute atomiquement `min(allocatedBudgetMs, ceil(monotonicElapsedNs / 1_000_000))` à cette étape et efface `activeInvocation` avant qu'un autre enfant ne puisse démarrer. Tout intervalle écoulé positif coûte au moins une milliseconde. Le redémarrage impute l'allocation complète comme spécifié ci-dessus. Les budgets sont cumulatifs pour la requête complète : réessayer une lecture auprès du fournisseur, redémarrer Docker, réentrer dans la récupération de package ou gérer un conflit CAS ne réinitialise pas un compteur d'étape. Les lectures initiales d'API, la réponse de redirection de téléchargement avec identifiants, chaque corps de réponse et chaque revalidation d'ETag sont inclus dans `provider-observation` ; seul le corps du transport redirigé sans identifiants est inclus dans `transport-download` ; le démarrage du processus, stdin, stdout/stderr et le ralliement sont inclus dans `oci-runtime` ; chaque action d'analyse/CAS/récupération de journal est incluse dans son étape de package. Aucun helper non borné ni enfant détaché n'existe en dehors d'un budget nommé.

Le travail ordinaire ne peut jamais consommer la réserve de nettoyage de 120 000 ms. L'expiration d'un budget d'étape ou de l'échéance de travail produit l'événement privé exact `DEADLINE_EXCEEDED` ci-dessous et entre dans le même protocole de nettoyage one-shot qu'une annulation par l'opérateur. Le nettoyage lui-même est plafonné à la fois par son budget cumulé restant de 120 000 ms et par l'échéance absolue de tentative. Si le nettoyage ne peut prouver une disposition terminale avant l'une de ces bornes, l'acteur rejette avec `CLEANUP_AMBIGUOUS` ; il ne revendique jamais `cancelled`. L'arrêt brutal du processus (kill) à l'échéance stricte n'est classifié que par la matrice de redémarrage, jamais comme un faux résultat de timeout fabriqué.

Le travail CAS de disponibilité au moment de l'annulation est une opération imbriquée sans enfant dont le même intervalle monotone est atomiquement imputé à la fois à `cleanup` et à `readiness-commit` ; l'observation/récupération de journal au moment de l'annulation est imputée de la même façon à `cleanup` et à `package-recovery`. Avant chaque opération, son allocation correspond à la plus petite valeur restante entre les deux compteurs et l'échéance stricte. L'`activeInvocation` unique reste l'acteur de nettoyage ; aucun second enfant ni minuteur n'est créé. Déplacer du travail sous le nettoyage ne peut donc récupérer une allocation d'étape épuisée.

Si l'observation de confiance initiale se situe déjà à ou après `workDeadlineAt`, la requête est rejetée directement avec `DEADLINE_EXCEEDED` : aucun enfant, espace de travail, capabilité ou acteur de nettoyage n'existe encore. Une chronologie malformée constitue une `INVALID_REQUEST`, pas un timeout.

La seule sortie terminale réussie est :

```ts
interface SealedCandidateConsumerSuccessV1 {
  schema: 'missionpulse.sealed-candidate-consumer-success';
  version: 1;
  consumerId: string;
  attemptId: string;
  readinessActorId: string;
  readinessContextSha256: Sha256; // final context after artifact publication
  transportObservation: SealedCandidateTransportObservationV1;
  payloadVerification: ReleaseExecutionPayloadVerificationV1;
  packageJournal: PackageJournalV1; // terminal phase `published`
  artifact: ValidatedZipArtifactV1;
  completedAt: CanonicalUtcTimestamp;
}
```

Le contexte sérialisable du consommateur stocke uniquement les identités et les reçus. Les octets capturés, les descripteurs ouverts, le snapshot d'octets et les capabilités ne vivent que dans un enregistrement privé détenu par l'acteur. Le snapshot est assemblé une fois à partir de ces octets capturés exacts pour l'ingestion V ; il n'est jamais reconstruit depuis des chemins ni stocké en tant qu'autorité de consommateur pouvant reprendre son exécution. L'enregistrement privé n'existe qu'entre l'assemblage post-vol final et l'accusé de réception du réducteur/CAS et est effacé de façon synchrone en cas de succès, rejet, annulation, timeout ou nettoyage. Il n'est jamais sérialisé dans un snapshot de saga, un contexte de disponibilité, un journal, un diagnostic, une passation ou un résultat de succès.

```ts
interface TransientPayloadVerificationRecordV1 {
  readonly payloadByteSnapshot: ReleasePayloadByteSnapshotV1;
  readonly verifiedProjection: VerifiedReleasePayloadProjectionV1;
  readonly acceptedEvent: AcceptedPayloadVerificationLocalEventV1;
}

declare const verifiedTransportPayloadBrand: unique symbol; // module-private
declare const runtimeHostAdmissionBrand: unique symbol; // module-private

interface VerifiedTransportPayloadCapabilityV1 {
  readonly [verifiedTransportPayloadBrand]: true;
}

interface ReleaseRuntimeHostAdmissionCapabilityV1 {
  readonly [runtimeHostAdmissionBrand]: true;
}

declare function authorizeReleaseRuntimeHostAdmission(
  verifiedPayload: VerifiedTransportPayloadCapabilityV1
): Promise<ReleaseRuntimeHostAdmissionCapabilityV1>;

declare function executeVerifiedOciRuntime(
  admission: ReleaseRuntimeHostAdmissionCapabilityV1
): Promise<ReleaseExecutionPayloadVerificationV1>;
```

Ce sont les seules signatures des frontières d'exécution. Aucune n'accepte de DTO bruts, chemins, tampons d'octets, ports Docker, rappels, options, surcharges, arguments optionnels, replis d'environnement ou hooks de test. Aucun constructeur exporté, émetteur, `mint`, registre, marque (brand) ou accesseur de registre ne peut exister.

Chaque frontière est implémentée comme un wrapper ordinaire non `async` avec un prologue d'admission synchrone ; ce n'est qu'après la vérification d'hôte requise et la suppression du registre privé qu'il peut construire/retourner la Promise pour la vérification asynchrone ultérieure ou le travail Docker. Déplacer l'une de ces consommations sous un `await` est une violation du modèle.

L'enregistrement de capabilité est un effet privé de la machine dans le même module d'autorité qui possède ses `WeakSet`/`WeakMap`. Il n'est accessible qu'après le passage complet des gardes de transport et d'autorité de payload ; ce n'est pas une API appelable.

## 3. États et événements exacts

L'implémentation doit être une unique machine XState v5 avec ces états exacts :

```ts
type SealedCandidateConsumerState =
  | 'created'
  | 'loading_readiness_actor'
  | 'observing_provider'
  | 'downloading_transport'
  | 'revalidating_provider'
  | 'verifying_attestation'
  | 'verifying_transport'
  | 'verifying_payload_authority'
  | 'capability_ready'
  | 'admitting_host'
  | 'runtime_executing'
  | 'payload_verified'
  | 'package_validating'
  | 'package_recovering'
  | 'retry_wait'
  | 'cancelling'
  | 'package_validated'
  | 'rejected'
  | 'cancelled';
```

Les états terminaux sont exactement `package_validated`, `rejected` et `cancelled`.

Les appelants externes peuvent envoyer uniquement :

```ts
type PublicConsumerEvent =
  | { type: 'CONSUME_REQUESTED'; request: SealedCandidateConsumeRequestV6 }
  | {
      type: 'RETRY_REQUESTED';
      priorAttemptId: string;
      nextAttemptId: string;
      requestedAt: CanonicalUtcTimestamp;
    }
  | {
      type: 'CANCEL_REQUESTED';
      cancelId: string;
      requestedAt: CanonicalUtcTimestamp;
    }
  | { type: 'SERVICE_RESTARTED'; restartId: string; restartedAt: CanonicalUtcTimestamp };

interface ConsumerCancellationV1 {
  cancelId: string;
  requestedAt: CanonicalUtcTimestamp;
  cleanupInvocationId: Sha256;
}

type ConsumerCleanupPlan = 'private-only' | 'invalidate-post-v' | 'reconcile-journal';

type ConsumerCleanupTriggerV1 =
  | {
      kind: 'operator';
      cancellation: ConsumerCancellationV1;
    }
  | {
      kind: 'deadline';
      deadline: ConsumerDeadlineExceededV1;
    };

interface ConsumerCleanupInvocationV1 {
  cleanupInvocationId: Sha256;
  trigger: ConsumerCleanupTriggerV1;
  plan: ConsumerCleanupPlan;
  readinessActorId: string | null;
  expectedContextSha256: Sha256 | null;
}

type ConsumerCleanupDispositionV1 =
  | {
      kind: 'private-clean';
      finalReadinessContextSha256: Sha256 | null;
    }
  | {
      kind: 'post-v-blocked';
      finalReadinessContextSha256: Sha256;
      state: 'blocked';
      packageJournal: null;
    }
  | {
      kind: 'journal-cleaned-blocked';
      finalReadinessContextSha256: Sha256;
      state: 'blocked';
      packageJournalPhase: 'cleaned';
    }
  | {
      kind: 'publication-completed';
      finalReadinessContextSha256: Sha256;
      packageJournal: PackageJournalV1;
      artifact: ValidatedZipArtifactV1;
    };
```

`cancelId` correspond à `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. Lors de la première annulation acceptée, `cleanupInvocationId` est gelé sous forme de SHA-256 JCS de `{domain:"missionpulse.consumer-cleanup-invocation.v1", consumerId, attemptId, cancelId, requestedAt}`. Un doublon exact correspond au JCS canonique identique octet par octet pour l'événement `CANCEL_REQUESTED` complet ; faire correspondre uniquement `cancelId` est insuffisant. Un ID de nettoyage d'échéance hache à la place le même domaine plus `consumerId`, `attemptId`, le reçu d'échéance complet et le déclencheur littéral `deadline`. Exactement un `ConsumerCleanupInvocationV1` gelé lie cet ID au plan dérivé de l'état et au hash du contexte de readiness actuel ; aucun déclencheur ne peut remplacer le plan après l'entrée.

Les acteurs enfants privés seuls peuvent émettre :

```ts
type PrivateConsumerEvent =
  | { type: 'READINESS_ACTOR_LOADED'; snapshot: AdmittedReadinessActorSnapshotV1 }
  | {
      type: 'PROVIDER_OBSERVATION_CAPTURED';
      envelopeSha256: Sha256;
      producerSagaSnapshotSha256: Sha256;
    }
  | { type: 'TRANSPORT_DOWNLOAD_CAPTURED'; bytes: number; sha256: Sha256 }
  | { type: 'PROVIDER_EPOCH_REVALIDATED'; envelopeSha256: Sha256 }
  | { type: 'ATTESTATION_VERIFIED'; observation: SealedCandidateTransportObservationV1 }
  | { type: 'TRANSPORT_VERIFIED'; transportZipReceiptSha256: Sha256 }
  | {
      type: 'PAYLOAD_AUTHORITY_VERIFIED';
      payloadInventorySha256: Sha256;
      controllerExecutionAuthoritySha256: Sha256;
    }
  | { type: 'HOST_ADMITTED'; receipt: ReleaseRuntimeHostAdmissionReceiptV1 }
  | { type: 'RUNTIME_VERIFIED'; receipt: ReleaseExecutionPayloadVerificationV1 }
  | { type: 'PACKAGE_VALIDATED'; artifact: ValidatedZipArtifactV1 }
  | { type: 'PACKAGE_RECOVERY_REQUIRED'; journal: PackageJournalV1 }
  | { type: 'PACKAGE_RECOVERED'; artifact: ValidatedZipArtifactV1 }
  | { type: 'STAGE_FAILED'; error: SealedCandidateConsumerErrorV1 }
  | { type: 'DEADLINE_EXCEEDED'; receipt: ConsumerDeadlineExceededV1 }
  | {
      type: 'CLEANUP_SUCCEEDED';
      cleanupInvocationId: Sha256;
      disposition: ConsumerCleanupDispositionV1;
      completedAt: CanonicalUtcTimestamp;
    }
  | {
      type: 'CLEANUP_FAILED';
      cleanupInvocationId: Sha256;
      error: SealedCandidateConsumerErrorV1;
    };
```

Un événement privé structurellement identique provenant d'un appelant est rejeté sous `UNAUTHORIZED_INTERNAL_EVENT` sans mutation.

## 4. Table normative des transitions

| Depuis                                                           | Événement                                                                 | Garde et effet atomique                                                                                                                                                                | Vers                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `created`                                                        | `CONSUME_REQUESTED` valide mais délai de travail expiré                   | persister l'erreur exacte d'échéance ; ne créer aucun enfant/espace de travail/capabilité                                                                                              | `rejected`                    |
| `created`                                                        | `CONSUME_REQUESTED`                                                       | valider/geler la référence d'acteur et les sélecteurs ; invoquer le chargement durable exact de l'acteur                                                                               | `loading_readiness_actor`     |
| `loading_readiness_actor`                                        | `READINESS_ACTOR_LOADED`                                                  | exiger le SHA-256 de contexte/état exact et le snapshot G0 ; geler l'autorité candidat+sceau détenue par l'acteur ; créer l'espace de travail absent                                   | `observing_provider`          |
| `observing_provider`                                             | `PROVIDER_OBSERVATION_CAPTURED`                                           | valider un ralliement de publication terminal du producteur, l'époque initiale du fournisseur et la réponse de redirection avec identifiants sous le budget du fournisseur             | `downloading_transport`       |
| `downloading_transport`                                          | `TRANSPORT_DOWNLOAD_CAPTURED`                                             | conserver un tampon complet borné sans identifiants et le digest recalculé                                                                                                             | `revalidating_provider`       |
| `revalidating_provider`                                          | `PROVIDER_EPOCH_REVALIDATED`                                              | réémettre exactement l'ensemble gelé de requêtes statut-200 porteuses d'ETag sous une seconde invocation cumulée du budget fournisseur ; exclure la redirection 302                    | `verifying_attestation`       |
| `verifying_attestation`                                          | `ATTESTATION_VERIFIED`                                                    | vérifier Sigstore et le workflow ; geler l'observation exacte du transport                                                                                                             | `verifying_transport`         |
| `verifying_transport`                                            | `TRANSPORT_VERIFIED`                                                      | vérifier le ZIP canonique ; extraire en mode sécurisé ; conserver les descripteurs ouverts/snapshots                                                                                   | `verifying_payload_authority` |
| `verifying_payload_authority`                                    | `PAYLOAD_AUTHORITY_VERIFIED`                                              | lier de manière croisée tous les octets du payload ; dériver/recapturer l'autorité de contrôleur ; enregistrer atomiquement un token opaque de payload gelé et un enregistrement privé | `capability_ready`            |
| `capability_ready`                                               | XState gardé `always`                                                     | requérir uniquement l'enregistrement privé du payload                                                                                                                                  | `admitting_host`              |
| `admitting_host`                                                 | `HOST_ADMITTED`                                                           | valider le résultat d'invocation exact et persister uniquement le reçu borné d'admission d'hôte                                                                                        | `runtime_executing`           |
| `runtime_executing`                                              | `RUNTIME_VERIFIED`                                                        | valider/lier de façon croisée le résultat ; assembler le snapshot exact d'octets ; ingérer par CAS `RELEASE_PAYLOAD_VERIFIED_INGESTED` exact dans le même acteur de readiness          | `payload_verified`            |
| `payload_verified`                                               | XState gardé `always`                                                     | exiger des reçus exacts durables ; réserver le journal strictement après la vérification ; invoquer l'acteur réservé aux packages                                                      | `package_validating`          |
| `package_validating`                                             | `PACKAGE_VALIDATED`                                                       | exiger le journal publié plus le CAS artefact/catalogue                                                                                                                                | `package_validated`           |
| `package_validating`                                             | `PACKAGE_RECOVERY_REQUIRED`                                               | arrêter le travail ordinaire ; capturer l'observation exacte de récupération locale                                                                                                    | `package_recovering`          |
| `package_recovering`                                             | `PACKAGE_RECOVERED`                                                       | appliquer l'unique transition de récupération de package observée                                                                                                                      | `package_validated`           |
| `loading_readiness_actor`, état fournisseur/download/attestation | `STAGE_FAILED` réessayable                                                | fermer/abandonner chaque ressource partielle ; persister l'erreur typée                                                                                                                | `retry_wait`                  |
| `retry_wait`                                                     | `RETRY_REQUESTED`                                                         | même acteur/run ; ID de tentative neuf ; aucune ressource/effet actif ; faire tourner la génération du surveillant persisté sans changer son échéance ; recharger l'acteur             | `loading_readiness_actor`     |
| tout état actif non terminal sauf `created`/`cancelling`         | premier `CANCEL_REQUESTED`                                                | persister l'identité d'annulation immuable ; dériver/geler le plan de nettoyage de la section 6 ; entrer dans l'unique invocation de nettoyage bornée exactement une fois              | `cancelling`                  |
| tout état actif non terminal sauf `created`/`cancelling`         | `DEADLINE_EXCEEDED`                                                       | valider l'invocation/étape/échéance courante exacte ; persister l'erreur typée ; dériver/geler le même plan de nettoyage one-shot                                                      | `cancelling`                  |
| `cancelling`                                                     | doublon exact `CANCEL_REQUESTED`                                          | no-op interne ; préserver l'état/contexte ; ne pas réentrer et ne pas réinvoquer le nettoyage                                                                                          | `cancelling`                  |
| `cancelling`                                                     | `CANCEL_REQUESTED` différent                                              | rejeter `CANCELLATION_ALREADY_STARTED` ; préserver l'état/contexte ; aucun effet de nettoyage                                                                                          | `cancelling`                  |
| `cancelling`                                                     | `CLEANUP_SUCCEEDED(private-clean/post-v-blocked/journal-cleaned-blocked)` | prouver la disposition durable exacte de la section 6 et l'absence d'autorité active ou de sortie possédée ambiguë                                                                     | `cancelled`                   |
| `cancelling`                                                     | `CLEANUP_SUCCEEDED(publication-completed)`                                | valider le journal/artefact publié déjà durable ; l'annulation ne peut supplanter la publication                                                                                       | `package_validated`           |
| tout état non terminal sauf `cancelling`                         | `STAGE_FAILED` non réessayable                                            | révoquer l'autorité, fermer les descripteurs, persister l'échec typé                                                                                                                   | `rejected`                    |
| `cancelling`                                                     | `CLEANUP_FAILED`                                                          | persister l'ambiguïté de nettoyage ; ne jamais revendiquer l'annulation                                                                                                                | `rejected`                    |
| tout état                                                        | `SERVICE_RESTARTED`                                                       | appliquer la matrice de redémarrage exhaustive de la section 6                                                                                                                         | spécifique à l'état           |

Chaque paire état/événement non répertoriée est rejetée sans mutation. Il n'y a aucune transition de succès générique (wildcard). Les événements privés de succès doivent correspondre à l'acteur enfant invoqué exact et à l'identifiant de tentative.

L'ordre d'invocation à l'entrée dans l'état est normatif et ne constitue pas un effet d'événement :

- chaque entrée dans un état de travail possédant un enfant commence par persister son allocation d'étape cumulée et démarre exactement un minuteur d'échéance monotone détenu par l'acteur et corrélé à l'ID d'invocation de l'enfant. `observing_provider` et `revalidating_provider` sont des invocations distinctes imputant le même compteur cumulé `provider-observation`. L'expiration du minuteur abandonne/rallie cet enfant et est seule autorisée à émettre le `DEADLINE_EXCEEDED` privé ; un reçu périmé, public ou d'une mauvaise étape est rejeté ;
- l'entrée dans `admitting_host` invoque l'acteur d'admission fixe ; son prologue synchrone effectue la vérification de l'hôte et la suppression du token de payload avant toute Promise ;
- l'entrée dans `runtime_executing` invoque l'acteur d'exécution fixe ; son prologue synchrone supprime l'admission avant toute Promise ou accès à Docker ;
- l'entrée dans `cancelling` depuis la première annulation acceptée invoque exactement un acteur de nettoyage lié au `ConsumerCleanupInvocationV1` gelé ; une échéance invoque cette même forme d'acteur. L'entrée arrête le surveillant d'échéance de travail ; le minuteur de nettoyage applique seul l'échéance stricte. Une transition interne dupliquée a `reenter: false`, ne planifie aucune action et ne peut pas le relancer ;
- `HOST_ADMITTED` et `RUNTIME_VERIFIED` valident et persistent uniquement les résultats d'invocation complétés. Ils ne peuvent ni exécuter ni rejouer l'un ou l'autre prologue ;
- `CLEANUP_SUCCEEDED` et `CLEANUP_FAILED` valident le déclencheur courant exact, le plan, le hash de contexte, `cleanupInvocationId`, la tentative et l'enfant invoqué. Leurs gestionnaires consomment un résultat uniquement ; ils ne peuvent ni démarrer, ni répéter, ni élargir le nettoyage.

## 5. Gardes et vérification ordonnée

### G0 — acteur de readiness autoritaire et ordre S-avant-V

- Charger un acteur de release-readiness durable par l'`actorId` public exact ; exiger que `readActor(actorId)` renvoie un contexte. Recalculer `releaseContextSha256(context)` et exiger l'égalité exacte avec l'`expectedContextSha256` public avant de l'accepter. C'est l'identité CAS réelle de l'acteur ; aucune révision de registre, révision d'acteur ou digest d'acteur fourni séparément n'y participe.
- Exiger l'état `rc_built`, `pendingRestart === null`, un candidat immuable valide et un sceau final valide. L'observation du transport, la vérification du payload, le journal de package et l'artefact doivent encore être nuls.
- Exiger que le candidat, l'audit, le sceau et le reçu packagé-MV3 ne nomment que le chemin/schéma d'inventaire V2 importé du parent, les deux hashs exacts et les treize identifiants ordonnés exacts, exécutés et réussis une fois chacun avec zéro saut, échec, réessai ou diagnostic. Les preuves V1 ou mixtes sont rejetées avant le terminal du producteur ou la requête GitHub.
- Exiger que le candidat, l'audit et le reçu packagé-MV3 répètent à l'octet identique les projections à indice fixe `mv3HarnessModelAuthority` et `packagedTabScenariosModelAuthority` plus `jointModelActivationSha256`. Les identités doivent être exactement égales à `REQUIRED_MV3_HARNESS_MODEL_V26`, `REQUIRED_PACKAGED_TAB_MODEL_V11` et le slot CV doit être exactement égal à `REQUIRED_CV_ACCESSIBLE_ANCHOR_MODEL_V6`.
- Charger l'activation conjointe complète depuis le catalogue global au contrôleur, vérifier son digest propre/révision CAS/commit source/arbre, et exiger que son `OrderedReviewedImplementedVerifiedModelAuthoritySetV1` intégré valide sa préimage JCS exacte, son ordre à six slots et ses projections revues/implémentées. Les valeurs du candidat/audit/porte doivent être égales aux projections à indice fixe de cet ensemble ; elles ne peuvent le remplacer. L'activation charge l'ensemble des dix-huit blobs de reçus et recalcule l'ensemble des six blobs de modèles bruts et normalisés en utilisant `JOINT_MODEL_BLOB_RULES_V1`. Elle doit lier la clarification 11 au hash de comportement exact `9afa97e0848b6c5c6540d33f38e29a409112a531f9ff2cd7124e50ef96511080`, la révision 11 du producteur au hash de contenu exact `bf681ebf0a2714f77bf48bfa0e121461ce69639814c5b60fbb6dffbadab43792`, l'autorité de la révision 12 du consommateur et les deux digests de l'inventaire V2. Son tableau complet de reçus de commande de vérification et le digest de l'ensemble doivent se valider contre son autorité de vérification à source immuable ; une source/ancêtre accessible en écriture ou une dérive de montage/capabilité bloque l'activation. Les signatures de reçus ne sont vérifiées que sous le digest de politique externe de reçus global au contrôleur de l'activation ; les clés de tuple/appelant sont interdites. Une revue, implémentation, preuve ou vérification sans activation atomique finale est terminale avant toute requête auprès du fournisseur.
- Exiger que le terminal signé du producteur contienne la révision 11 du producteur avec le hash de contenu `bf681ebf0a2714f77bf48bfa0e121461ce69639814c5b60fbb6dffbadab43792`, sa matérialisation exacte de l'espace de travail d'exécution Git, l'autorité complète de source immuable de production, le reçu de complétion du handoff local et le reçu de complétion terminal. Recalculer leurs digests JCS exacts et construire un `ConsumerProducerSourceExecutionProofV1`. Les tableaux de commandes de sceau, handoff et terminal doivent former des extensions de préfixe exactes et chaque commande doit lier les mêmes sources/ancêtres en lecture seule, la topologie sans overlay, la liste blanche des cinq racines de sortie, des ensembles de capabilités vides, la politique seccomp/système de fichiers héritée et les observations de montage/capabilité pré/post correspondantes. Rejeter les octets du checkout ambiant/support, toute source/ancêtre accessible en écriture, le masquage de chemin suivi, chmod/lien/lien symbolique/renommage, montage/remontage/évasion de namespace, source modifiée/non suivie, reçu manquant ou descendant détaché avant la première requête GitHub. Un build au vert, une projection post-run propre, un sceau ou un téléversement chez le fournisseur sans cette preuve d'exécution de l'OS est terminal.
- Tout échec de preuve d'exécution de source du producteur produit `PRODUCER_SOURCE_EXECUTION_INVALID` avec la classe de réessai `never`, préserve l'acteur de readiness chargé à l'octet identique et ne démarre aucun enfant GitHub/fournisseur.
- Le candidat chargé et le sceau constituent l'unique autorité d'identité en aval. La requête ne peut ni fournir, ni remplacer, ni restreindre l'une ou l'autre valeur.
- La propriété des événements et leur ordonnancement sont exacts :

```text
le producteur émet l'immuable TestedDistSealV1
  -> le contrôleur de release-readiness ingère par CAS RC_SEAL_INGESTED dans l'acteur audité
  -> le réducteur valide le sceau et valide l'état de l'acteur rc_built
  -> le producteur complète l'attestation/téléversement du transport
  -> le consommateur charge cet acteur exact rc_built et son SHA-256 de contexte
  -> le consommateur vérifie le transport téléchargé et l'environnement d'exécution (runtime)
  -> l'adaptateur de readiness du consommateur ingère par CAS RELEASE_PAYLOAD_VERIFIED_INGESTED
     avec l'observation exacte + vérification + snapshot d'octets dans le même acteur
  -> le réducteur reste rc_built avec les deux valeurs assignées une seule fois
  -> la réservation du journal de package peut débuter
```

Le producteur ne modifie jamais directement l'état de readiness, et le consommateur n'émet jamais `RC_SEAL_INGESTED`. Les deux événements du réducteur sont soumis via le contrôleur de release-readiness. `RELEASE_PAYLOAD_VERIFIED_INGESTED` est illégal tant que le résultat durable de `RC_SEAL_INGESTED` n'a pas été chargé et mis en correspondance.

### Projection fermée du handoff signé et de la politique

Le consommateur n'introduit aucun nouveau reçu de producteur. Il réutilise le `ProducerTerminalRecordV1` exact du modèle producteur, son `ProducerTerminalPublicationReceiptV1` signé, l'`ProducerTerminalEnvelopeV1` complète et l'`ArtifactPublicationJoinV1` commune, puis construit cette projection privée compatible avec la release-readiness :

```ts
interface ProviderArtifactFactsV1 {
  artifactId: string;
  name: 'missionpulse-sealed-candidate';
  bytes: number;
  digest: Sha256;
  expired: false;
  createdAt: CanonicalUtcTimestamp;
  expiresAt: CanonicalUtcTimestamp;
  workflowRunId: string;
  headSha: string;
}

interface ClosedTransportHandoffV1 {
  signedAttestation: GitHubTransportAttestationV1;
  producerTerminalRecordSha256: Sha256;
  producerTerminalPublicationReceiptSha256: Sha256;
  producerTerminalEnvelopeSha256: Sha256;
  producerSagaTerminalSnapshotSha256: Sha256;
  producerPublicationJoin: ArtifactPublicationJoinV1;
  transportAttestationPolicySha256: Sha256;
  workflowBlobSha256: Sha256;
  privilegedJobProjectionSha256: Sha256;
  providerArtifact: ProviderArtifactFactsV1;
  downloadedTransportSha256: Sha256;
}
```

`signedAttestation` est le seul composant de handoff **signé par GitHub/Sigstore** ; il est dérivé uniquement après la vérification Sigstore depuis le `GitHubTransportAttestationV1` existant. Après que G0 a chargé l'acteur et avant toute requête GitHub, l'adaptateur fixe de terminal du producteur du consommateur dérive l'unique URI depuis `candidate.producerTerminalReadAuthority`, l'ID de l'acteur et le run ID/tentative canonique de la requête. Il effectue exactement un GET direct sans identifiants, ne suit aucune redirection, valide l'origine gelée/TLS SPKI/type de média du candidat, ne lit pas plus de 25 165 824 octets, et exige un Content-Length exact, l'ETag `"sha256:{recordSha256}"` et un contrôle de cache immuable. Aucun URI, chemin, enregistrement, snapshot, reçu ou ralliement fourni par l'appelant n'est accepté.

La construction de l'URI substitue l'ID de l'acteur en utilisant la règle exacte `rfc3986-uppercase-percent-v1` de l'autorité, substitue le run ID sous ses octets décimaux positifs canoniques inchangés, et substitue la tentative de run sous forme de décimal ASCII positif canonique. Elle rejette l'injection de barres obliques (slashes), les hexadécimaux de pourcentage en minuscules, le double encodage, la normalisation, les requêtes (query), les fragments, les informations d'utilisateur (userinfo), les ports alternatifs ou tout chemin hors modèle avant l'envoi de la requête.

L'adaptateur rejette les clés JSON dupliquées et exige que les octets de réponse soient le JCS RFC 8785 exact d'un `ProducerTerminalRecordV1`. Il recalcule le digest propre de l'enregistrement ; vérifie le digest propre du reçu de publication, la signature Ed25519 à séparation de domaine et l'URI immuable sous la clé de reçu exacte liée au candidat ; exige que le digest de politique de port de catalogue soit égal à l'autorité de lecture liée au candidat ; décode et recalcule octet par octet l'enveloppe terminale complète ; et valide sa séquence complète et sans trou de snapshots immuables / chaîne de hashs. L'unique dernier snapshot doit être `uploaded_digest_verified` ; son unique artefact et l'`ArtifactPublicationJoinV1` commune de l'enveloppe doivent être égaux selon le JCS exact. L'acteur, la release, le commit source, le dépôt, le workflow, le job, le run ID canonique, la tentative, le digest de contexte rc-built, le reçu d'ingestion de sceau et chaque champ de corrélation doivent être égaux à l'autorité G0/requête. Le `ProducerHandoffV1` complet de l'enveloppe doit passer son propre digest et ses gardes contrôleur/transport/readiness, être égal à chaque digest de handoff de la chaîne, et être égal au digest de handoff du ralliement de publication. Ses champs de digest de candidat, d'audit et de sceau doivent être égaux aux valeurs exactes complètes déjà chargées depuis l'acteur de readiness G0 ; aucun octet dupliqué transporté par le handoff n'existe. Ses reçus complets de constructeur et de sceau rc doivent se vérifier sous les clés de catalogue gelées du candidat et former la chaîne CAS exacte du contexte audité au contexte rc-built chargée par G0. Le reçu complet de disposition terminale doit se vérifier sous les mêmes clés, être égal au digest du snapshot terminal, prouver active_for_consumer/producer-upload-joined avec les deux effets distants confirmés, et ne contenir aucune mutation de readiness. Un répertoire de saga local au runner, une sortie d'étape GitHub, un snapshot terminal sans cet enregistrement signé, une chaîne partielle ou un ralliement fourni indépendamment n'a aucune autorité auprès du consommateur.

Le champ `actionOutput.artifactDigest` du ralliement est l'unique autorité pour le digest dynamique de sortie de l'uploader ; son égalité avec le transport local, le sujet signé et les octets capturés du producteur a déjà été fermée par la garde du producteur, et le consommateur revalide le ralliement complet plutôt que de se fier à ce champ.

Les hashs de politique et de workflow proviennent uniquement du candidat G0. Les faits d'artefact frais du fournisseur proviennent uniquement de la réponse REST authentifiée, et le digest téléchargé provient uniquement des octets capturés. Le tuple n'est gelé qu'après que l'attestation signée, l'enregistrement terminal/ralliement signé durable du producteur, la politique, les faits frais du fournisseur et les octets téléchargés concordent sur le digest du sujet, le run ID/tentative canonique et le head SHA.
C'est une autorité de transition privée et non persistée, qui n'ajoute aucun champ à `SealedCandidateTransportObservationV1`. L'`uploaderOutputDigest` de cette observation est projeté exactement à partir du ralliement validé du producteur, jamais depuis REST ni depuis la politique.

La frontière d'autorité est explicite : la représentation REST de l'artefact par GitHub n'expose pas l'ID de job de l'uploader, la tentative de run, le mode de téléversement direct ou l'entrée de rétention demandée. Le consommateur ne lit ni ne déduit ces champs à partir de cette représentation. La tentative de run et le workflow du signataire proviennent de l'attestation signée vérifiée plus des métadonnées de tentative de run authentifiées indépendamment. Les entrées `archive:false`, `overwrite:false`, `retention-days:30`, l'uploader épinglé et la topologie ordonnée des jobs de production proviennent de la politique exacte de workflow liée au candidat. Les dates `created_at`/`expires_at` de l'API restent des faits observés du fournisseur et ne sont jamais rétro-traduites en rétention demandée. Aucune affirmation d'ID de job n'est déduite, et la sortie d'action dynamique n'est jamais synthétisée depuis la politique, conformément à la clarification 11 de release-readiness.

### G1 — observation GitHub exacte

- La première invocation de `provider-observation` effectue l'unique GET de terminal du producteur autorisé par le candidat et valide l'enregistrement signé/enveloppe/chaîne/ralliement complet ci-dessus. Cette réponse immuable de contrôle de release n'est pas membre de l'époque du fournisseur GitHub et n'est jamais ré-extraite ni revalidée par ETag lors de cette tentative. Ce n'est qu'alors que la même invocation cumulée effectue chaque lecture de première partie GitHub initiale, y compris la requête de téléchargement d'artefact avec identifiants et son unique réponse de redirection. Ce n'est qu'après le succès de toutes les opérations bornées que `PROVIDER_OBSERVATION_CAPTURED` peut entrer dans `downloading_transport`.
- Chaque requête de première partie utilise exactement l'origine `https://api.github.com`, le port HTTPS par défaut, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2026-03-10`, `redirect: manual`, et aucun cookie ni proxy ambiant. Les segments owner/repo/path sont canoniquement encodés en pourcentages ; les informations d'utilisateur, fragments, ports/origines alternatifs et GraphQL sont interdits.
- Le token en lecture seule est capturé une seule fois depuis le canal secret fixe de CI et ne peut posséder que les portées de dépôt `actions:read`, `attestations:read` et `contents:read`. `Authorization: Bearer <token>` est envoyé uniquement à l'origine exacte `https://api.github.com` ; le token n'est jamais placé dans une URL, une redirection, un contexte, un reçu, un log ou une requête vers l'origine de téléchargement. `Set-Cookie` provoque un rejet et aucun gestionnaire de cookies n'existe.
- Extraire les métadonnées de tentative de run uniquement depuis `/repos/{owner}/{repo}/actions/runs/{runId}/attempts/{runAttempt}` et les octets du workflow uniquement depuis `/repos/{owner}/{repo}/contents/.github/workflows/ci.yml?ref={headSha}` ; exiger que les octets du blob régulier renvoyé et l'identité du blob Git correspondent au blob/digest de workflow intégré du candidat G0. Extraire exactement la page 1 de `/repos/{owner}/{repo}/actions/runs/{runId}/artifacts?name=missionpulse-sealed-candidate&per_page=100&page=1&direction=asc`. Exiger `total_count === 1`, une seule entrée dans le tableau et aucun `Link rel="next"` ; une deuxième page est une ambiguïté, pas une continuation.
- Extraire exactement la page 1 de `/repos/{owner}/{repo}/attestations/sha256:{transportDigest}?predicate_type=provenance&per_page=100` sans curseur `before`/`after`. Exiger l'absence de lien suivant et exactement un bundle passant ultérieurement G3 ; zéro, plusieurs ou des réponses avec curseur provoquent un rejet.
- Chaque réponse JSON/blob du fournisseur avec un statut `200` doit porter un `ETag` borné et syntaxiquement valide. Capturer les octets exacts de l'ETag et geler l'ensemble ordonné exact de ces descripteurs de requêtes portant un ETag. Après le téléchargement, `revalidating_provider` démarre une nouvelle invocation persistée imputée au même compteur cumulé `provider-observation`, réémet exactement cet ensemble gelé avec l'`If-None-Match` exact de chaque descripteur, et exige `304` sans corps de représentation. La requête de téléchargement d'artefact avec identifiants dont le résultat initial requis est `302` ne fait pas partie de cet ensemble, ne se voit jamais attribuer d'ETag, et n'est pas réémise. Seul le résultat exact `PROVIDER_EPOCH_REVALIDATED` peut entrer dans G3. Un descripteur manquant/superflu/réordonné, un 200, un ETag modifié/manquant, une dérive d'endpoint/query ou un résultat mixte initial/revalidation rejette l'époque d'observation entière.
- Exiger indépendamment les métadonnées de tentative de run pour le dépôt, chemin de workflow, `runId`, `runAttempt`, head SHA, ref principale demandés et une conclusion avec succès. Cela authentifie la tentative de run demandée ; elle n'est pas traitée comme un champ d'artefact.
- Sélectionner exactement un artefact REST dont les champs exposés correspondent au nom littéral, `workflow_run.id == runId`, `workflow_run.head_sha == headSha`, aux ID de dépôt, au statut non expiré, à l'identifiant d'artefact/digest/nombre d'octets canoniques exacts et à la chronologie création/expiration. Zéro ou plusieurs correspondances provoquent un rejet ; l'ordre ne sert jamais à départager. Aucun prédicat artefact-job ou artefact-tentative n'existe.
- Sélectionner exactement une attestation applicable par nom de sujet authentifié et digest. Zéro ou plusieurs bundles applicables provoquent un rejet.

### G2 — blob téléchargé exact

- Pendant la première invocation de `provider-observation`, demander exactement `https://api.github.com/repos/{owner}/{repo}/actions/artifacts/{artifactId}/zip` avec les en-têtes de première partie ci-dessus et redirections manuelles. Exiger exactement un `302` avec un `Location` et aucun corps utilisé comme autorité.
- `downloading_transport` canonise ensuite cet unique `Location` capturé. Exiger HTTPS, port 443/par défaut, aucun userinfo/fragment, un nom d'hôte DNS plutôt qu'une adresse IP littérale, et aucune résolution d'adresse loopback, link-local, privée, multicast ou de métadonnées. Figer la résolution publique pour la connexion et exiger que le nom d'hôte TLS ainsi que l'adresse distante connectée correspondent. Enregistrer l'URL complète exacte et l'origine exacte ; les motifs, suffixes et listes blanches d'appelants ne constituent pas une autorité d'origine.
- Effectuer exactement un `GET` sans identifiants vers cette URL complète exacte avec `redirect: manual`. N'envoyer aucun Authorization, Cookie, Proxy-Authorization, token GitHub ou ETag de première partie. Exiger le statut `200` ; tout second Location, redirection ou changement d'origine provoque un rejet.
- Lire un corps de réponse jusqu'à EOF dans un unique tampon borné par `maxSealedCandidateTransportBytes` ; la longueur déclarée, si présente, doit concorder.
- Aucune concaténation de plages, reprise, réempaquetage transparent, réouverture de chemin ou second téléchargement ne peut remplacer les octets capturés.
- Le SHA-256 recalculé doit être égal au digest unique normalisé de GitHub `sha256:<64 caractères hexadécimaux en minuscules>`.

### G3 — attestation et autorité du workflow

- Analyser strictement le bundle Sigstore borné complet ; recalculer le JCS RFC 8785 et son digest.
- Vérifier la signature DSSE, la chaîne de certificats, la racine de confiance épinglée, la preuve de transparence et le matériel d'inclusion à travers la politique exacte du candidat.
- Dériver le dépôt, la référence principale, le chemin/ref/SHA du workflow, le run, la tentative et le head SHA à partir des revendications authentifiées, jamais de projections non vérifiées.
- Exiger le type de prédicat SLSA `https://slsa.dev/provenance/v1` ; ne déduire aucun ID de job absent et n'attribuer aucun champ de tentative de run aux métadonnées de l'artefact REST.
- Revalider le ralliement de publication du producteur et exiger l'égalité exacte du sujet attesté, de son digest avant téléversement handoff/contrôleur/capturé, de `producerPublicationJoin.actionOutput.artifactDigest`, du digest d'artefact GitHub frais et du digest téléchargé. La politique prouve les entrées de téléversement mais ne peut fournir ni synthétiser cette sortie d'action dynamique.
- Relire le blob de workflow complet à `headSha` ; redériver strictement les permissions exactes du job, l'ordre des étapes/entrées/environnement et l'inventaire exhaustif des `uses` littéraux de SHA40. Rejeter les tags, branches, SHA courts, expressions, actions locales, Docker/services, workflows réutilisables, matrices ou étapes privilégiées supplémentaires.
- À partir de cette seule projection de politique, exiger l'action de téléversement épinglée et les entrées exactes `archive:false`, `overwrite:false`, `retention-days:30`, un chemin littéral unique et `if-no-files-found:error`. Les dates de création/expiration du fournisseur ne peuvent se substituer à cette preuve.
- Construire `ClosedTransportHandoffV1` seulement après que le digest du sujet signé, le ralliement de publication/sortie d'action terminal du producteur, le digest d'artefact frais du fournisseur, le digest téléchargé, le commit source, le run ID et la projection signée de tentative de run authentifiée indépendamment sont tous liés de manière croisée.

Aucune analyse de ZIP ni extraction n'a lieu avant la validation de G3.

### G4 — transport canonique et sceau

- Vérifier le contrat ZIP canonique complet non-ZIP64 à partir du tampon capturé : en-têtes exacts, décalages (offsets), noms UTF-8, méthode STORE, ordre, horodatage, modes, CRCs/tailles et aucun extra, commentaire, descripteur ou octet superflu en fin de fichier.
- Exiger exactement ces sept composants logiques de premier niveau :

```text
tested-dist-seal.json
dist/
release-controller.bundle.mjs
release-execution-authority.json
build-metadata.json
build-provenance.json
release-execution-image.oci.tar
```

- Extraire en mode sécurisé dans une racine privée vierge avec des opérations relatives aux descripteurs sans suivi de liens symboliques (no-follow). Rejeter la traversée de répertoires, les chemins en doublon/collision, les alias, les liens physiques, les liens symboliques, les objets spéciaux et les racines superflues.
- Vérifier les octets exacts du sceau JCS borné, son digest propre, son identité, sa chronologie et l'ensemble des portes préalables complètes. Les octets JCS et tous les champs de candidat/sceau doivent être égaux au sceau et candidat exacts du snapshot de readiness G0 ; des octets de candidat/sceau alternatifs cohérents en interne sont rejetés.
- Exiger que l'inventaire exact à six entrées non auto-référencé du sceau corresponde aux métadonnées, à la provenance, à `dist`, au bundle de contrôleur, à l'autorité d'exécution et à l'archive OCI à l'octet près ; lier ces mêmes octets dans le reçu du ZIP de transport.

### G5 — payload et autorité d'exécution du contrôleur

- Vérifier les métadonnées canoniques de BuildKit et la provenance SLSA par rapport à la recette, au contexte, aux matériaux exacts et au manifest OCI prouvé.
- Lier de façon croisée `ReleaseExecutionAuthorityV1` au candidat/source, à l'inventaire source du contrôleur, à la politique d'invocation, aux objets effectifs/runtime Python et au graphe OCI complet.
- Ouvrir le tar OCI en mode no-follow, le capturer une seule fois et vérifier l'index unique, le manifest, la configuration, les couches/diff IDs ordonnés, l'inventaire racine, les annotations et la plateforme `linux/amd64` à partir de ce tampon.
- Authentifier exactement cinq fichiers de preuve : métadonnées, provenance, autorité d'exécution transportée, sceau et reçu du ZIP de transport.
- Dériver le `verificationId` de la clarification 3, puis le JCS de l'autorité du contrôleur et `authoritySha256` sans cycle de digest. Créer/recapturer exclusivement le sixième fichier de preuve dérivé et exiger exactement six fichiers de preuve réguliers.
- Conserver chaque descripteur source et snapshot exact d'identité/octets/arbre à travers l'admission de l'hôte, la complétion de l'enfant Docker et le post-vol.

Ce n'est qu'après la validation de G1 à G5 que la transition d'état privée peut enregistrer une `VerifiedTransportPayloadCapabilityV1`.

### G6 — admission de l'hôte et capabilité one-shot

- L'entrée dans `admitting_host` invoque uniquement l'acteur d'admission de production fixe. Son prologue synchrone non asynchrone vérifie `process.platform === "linux"` et `process.arch === "x64"` avant d'examiner l'identité du token, le proxy, le getter, l'enregistrement privé ou les octets du candidat.
- Après cette vérification d'hôte, le même prologue synchrone exige le token actif exact dans les deux registres privés et le supprime de ces deux registres avant de construire ou d'attendre (await) toute Promise et avant tout retour de succès ou d'échec.
- Redériver/revérifier l'autorité du contrôleur et tous les snapshots de descripteurs pendant l'admission ; un transfert d'enregistrement brut est interdit.
- Enregistrer exactement une admission d'hôte one-shot gelée dans une seconde paire `WeakSet`/`WeakMap` privée.
- `HOST_ADMITTED` est uniquement le résultat privé de complétion de l'invocation. Son gestionnaire valide l'acteur/tentative, le digest d'autorité et l'identité d'admission enregistrée, et persiste uniquement le reçu borné d'admission d'hôte. L'entrée dans l'état `runtime_executing` qui en résulte invoque le runtime ; cet événement n'effectue pas la vérification d'hôte, la consultation/consommation du token de payload, la création d'admission ou le travail runtime.

### G7 — exécution OCI et reçu

- L'entrée dans `runtime_executing` invoque uniquement l'acteur d'exécution de production fixe. Son prologue synchrone non asynchrone exige et supprime l'admission exacte des deux registres privés avant de construire/attendre toute Promise et avant tout examen, chargement ou autre accès à Docker.
- Transmettre les octets OCI capturés à `docker load` via stdin ; ne jamais passer/rouvrir son chemin et ne jamais faire de pull.
- Exiger le tag local exact `missionpulse-release-runtime:sealed-candidate`, puis réexaminer `linux/amd64` et exécuter uniquement `missionpulse-release-runtime@sha256:<manifestSha256>` avec `--pull=never`.
- Imposer une racine en lecture seule, aucun accès réseau, toutes les capabilités abandonnées, pas de nouveaux privilèges, UID/GID 65532, des PID bornés, des montages tmpfs durcis et bornés, et uniquement trois entrées en lecture seule dérivées de descripteurs.
- Dériver les sources de montage uniquement depuis les handles `/proc/<hostPid>/fd/<fd>` conservés ; revalider les identités de descripteurs et les snapshots complets immédiatement avant le démarrage de l'enfant et après sa complétion.
- N'accepter une `ReleaseExecutionPayloadVerificationV1` stricte et bornée que si son digest propre, son identifiant de clarification 3, son `controllerExecutionAuthoritySha256` et chaque digest payload/runtime sont égaux à l'autorité capturée. Tout stdout/stderr supplémentaire, mauvais code de sortie/signal ou dérive provoque un rejet.
- `RUNTIME_VERIFIED` est uniquement le résultat privé de complétion de l'invocation. Son gestionnaire valide/lie de manière croisée et persiste le reçu ; il ne consomme jamais d'admission ni ne démarre Docker.

### G8 — ingestion durable et validation réservée aux packages

- Avant V, assembler exactement un `ReleasePayloadByteSnapshotV1` à partir de l'enregistrement d'octets privé toujours ouvert et revalidé au post-vol. Aucune réouverture de chemin, sérialisation alternative ou synthèse de reçu n'est autorisée. Analyser avec les limites parentes importées et appeler uniquement le `verifyPayloadByteSnapshot` importé ; le résultat doit être la `VerifiedReleasePayloadProjectionV1` exacte importée. Geler le snapshot, la projection et l'enregistrement d'événement accepté importé dans un unique `TransientPayloadVerificationRecordV1` privé. Le snapshot exact est transporté avec l'observation et la vérification sous un seul événement :

```ts
interface CommitActorRequestV1 {
  readonly actorId: string;
  readonly expectedContextSha256: string;
  readonly nextContext: ReleaseReadinessContextV1;
}
```

- Soumettre cet événement exact à l'acteur G0. Le réducteur de readiness valide le snapshot ainsi que les deux reçus à travers le même vérificateur parent importé, dérive le contexte suivant, et commite via le CAS `CommitActorRequestV1` existant avec l'`actorId + expectedContextSha256` exact. Seul un commit durable réussi peut entrer dans `payload_verified`. Le contexte renvoyé est rehaché sous `readinessContextSha256` ; il doit conserver l'observation, la vérification et exactement l'`AcceptedPayloadVerificationLocalEventV1` importé dont le tuple stable est `[attestationId, verificationId, snapshotId]` et dont l'`eventSha256` couvre l'événement V canonique complet, y compris chaque octet du snapshot transitoire. Il ne doit conserver ni le snapshot ni la projection vérifiée. Le consommateur efface ensuite son enregistrement transitoire privé. Aucune révision d'acteur/registre n'existe dans ce protocole.
- Lors d'un `ACTOR_CAS_CONFLICT`, relire uniquement le même `actorId` et recalculer son SHA-256 de contexte. N'accepter que (a) le même candidat, sceau et état `rc_built` avec les deux champs V toujours nuls et aucun redémarrage en attente, puis resoumettre l'événement identique octet par octet sous ce nouvel `expectedContextSha256`, ou (b) l'événement/reçus déjà acceptés identiques octet par octet, traités par le réducteur comme un accusé de réception idempotent. Tout autre contexte, état ou octet entraîne un rejet sous `READINESS_CAS_CONFLICT` ; les effets fournisseur et Docker ne sont jamais rejoués.
- Lors d'un accusé de réception exact déjà accepté après un conflit CAS, l'observation durable, la vérification, le tuple stable à trois ID et le hash d'événement complet doivent correspondre à l'événement privé octet par octet ; ni des ID/hash durables manquants ni un snapshot/projection durable ne peuvent être acceptés. L'enregistrement transitoire privé est ensuite effacé sans réexécuter les effets de fournisseur, d'OCI ou de vérification d'octets.
- Exiger `observedAt <= verifiedAt < packageJournal.reserved.at` et l'expiration de l'artefact après la vérification.
- Exécuter uniquement le protocole existant de verrou exclusif, snapshot no-follow, normalisation, double ZIP canonique, extraction sécurisée, sidecar/JCS, publication sans remplacement, journal et CAS de catalogue.
- Ne jamais installer, construire, incrémenter la version, éditer le manifest, résoudre les connecteurs ou muter le `dist` testé.
- Le succès exige la phase de journal `published` et un `ValidatedZipArtifactV1` exact ; après chaque CAS de journal/artefact, le consommateur remplace son SHA-256 de contexte courant par le hash de contexte retourné. La valeur de succès transporte le hash de contexte publié final. Le code de sortie de commande seul n'a aucune autorité.

## 6. Erreurs, réessais, annulation et redémarrage

```ts
type SealedCandidateConsumerErrorCode =
  | 'INVALID_REQUEST'
  | 'READINESS_STORE_UNAVAILABLE'
  | 'READINESS_ACTOR_NOT_ADMITTED'
  | 'READINESS_CAS_CONFLICT'
  | 'PRODUCER_SOURCE_EXECUTION_INVALID'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_OBSERVATION_AMBIGUOUS'
  | 'GITHUB_PROTOCOL_INVALID'
  | 'DOWNLOAD_INTERRUPTED'
  | 'TRANSPORT_DIGEST_DIVERGENT'
  | 'ATTESTATION_INVALID'
  | 'ATTESTATION_AMBIGUOUS'
  | 'WORKFLOW_AUTHORITY_DIVERGENT'
  | 'TRANSPORT_INVALID'
  | 'PAYLOAD_AUTHORITY_INVALID'
  | 'CAPABILITY_INVALID_OR_REPLAYED'
  | 'HOST_UNSUPPORTED'
  | 'OCI_RUNTIME_INVALID'
  | 'RECEIPT_INGESTION_FAILED'
  | 'PACKAGE_VALIDATION_FAILED'
  | 'PACKAGE_RECOVERY_AMBIGUOUS'
  | 'EPHEMERAL_AUTHORITY_LOST'
  | 'POST_V_PRE_JOURNAL_CRASH'
  | 'DEADLINE_EXCEEDED'
  | 'CANCELLATION_ALREADY_STARTED'
  | 'CLEANUP_AMBIGUOUS'
  | 'UNAUTHORIZED_INTERNAL_EVENT';

interface SealedCandidateConsumerErrorV1 {
  schema: 'missionpulse.sealed-candidate-consumer-error';
  version: 1;
  consumerId: string;
  attemptId: string;
  code: SealedCandidateConsumerErrorCode;
  retryClass: 'never' | 'fresh-read-attempt';
  observedAt: CanonicalUtcTimestamp;
  evidenceSha256: Sha256 | null;
}
```

Seuls `READINESS_STORE_UNAVAILABLE`, `PROVIDER_UNAVAILABLE`, `DOWNLOAD_INTERRUPTED`, ou `EPHEMERAL_AUTHORITY_LOST` dans l'une des lignes explicites de redémarrage pré-autorité ci-dessous peuvent dériver `fresh-read-attempt`. Le réessai n'est jamais automatique et requiert : le même acteur/run, un nouvel ID de tentative, aucun effet de capabilité, Docker, reçu ou package, et le nettoyage prouvé de chaque ressource partielle. Il redémarre à `loading_readiness_actor` ; le candidat, le sceau, les octets et les projections du fournisseur sont tous rechargés plutôt que réutilisés.

Toute ambiguïté, échec de digest/signature/canonique, hôte non supporté, rejeu de capabilité, échec d'exécution ou échec de package est non réessayable dans l'acteur. `DEADLINE_EXCEEDED` et `POST_V_PRE_JOURNAL_CRASH` sont toujours non réessayables pour cette requête/candidat. La récupération du journal de package ne constitue pas un réessai et ne réexécute jamais les effets de fournisseur ou Docker.

### Matrice de nettoyage one-shot lors d'annulation et d'échéance

La première annulation valide dans tout état non terminal sauf `cancelling`, ou le premier événement d'échéance exact, gèle atomiquement un déclencheur et un plan de nettoyage, puis entre dans `cancelling`. Le mapping d'état vers plan est fermé :

| État du consommateur lorsque le déclencheur commite                                                                                  | Plan gelé           |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| de `loading_readiness_actor` jusqu'à `runtime_executing`, avant que le gestionnaire de `RUNTIME_VERIFIED` ne valide V ; `retry_wait` | `private-only`      |
| `payload_verified`                                                                                                                   | `invalidate-post-v` |
| `package_validating` ou `package_recovering`, quelle que soit la dernière projection J mise en cache localement par l'acteur         | `reconcile-journal` |

Aucun déclencheur n'est accepté depuis `created` ou un état terminal car aucune autorité d'identité de requête/échéance n'y existe. L'unique acteur de nettoyage commence par arrêter et rallier l'enfant actuel, impute son budget final écoulé, révoque les deux registres de capabilités, ferme les descripteurs et relit l'acteur de readiness exact avant toute suppression de chemin ou mutation de readiness. L'enfant lui-même est un unique acteur XState invoqué et fermé avec la matrice de transition finie suivante ; il ne réentre pas dans le `cancelling` parent, ne s'invoque pas récursivement et ne démarre aucun travail fournisseur/Docker :

| Plan / observation durable de l'acteur                                                     | Effet obligatoire et preuve avant résultat                                                | Disposition                     |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------- |
| `private-only` ; aucun acteur chargé                                                       | prouver l'absence d'effet V, J, de chemin de package ou d'enfant local                    | `private-clean`                 |
| `private-only` ; l'acteur G0 exact a toujours V/J/artefact nuls                            | même hash de contexte, fermer/supprimer uniquement les ressources privées pré-V           | `private-clean`                 |
| `private-only` ; tout V, J ou artefact apparaît                                            | aucune mutation ; la frontière d'effet durable est inexpliquée                            | `CLEANUP_FAILED`                |
| `invalidate-post-v` ; V exact est durable et J/artefact sont nuls                          | ingérer par CAS l'invalidation exacte ci-dessous et relire l'acteur bloqué                | `post-v-blocked`                |
| `reconcile-journal` ; V exact est durable et J est null                                    | même CAS d'invalidation post-V exact                                                      | `post-v-blocked`                |
| `reconcile-journal` ; J est non terminal                                                   | exécuter uniquement le protocole existant de récupération de journal jusqu'au bout        | continuer dans cette invocation |
| `reconcile-journal` ; J est `cleaned`, artefact null                                       | ingérer par CAS l'invalidation exacte ; relire l'acteur bloqué en préservant le J nettoyé | `journal-cleaned-blocked`       |
| `reconcile-journal` ; J est `published` avec le CAS durable exact artefact/catalogue       | revalider le contexte complet publié ; n'effectuer aucune mutation de nettoyage           | `publication-completed`         |
| tout plan ; acteur, V, J, artefact, contexte ou projection de catalogue étranger/divergent | aucune mutation ni suppression                                                            | `CLEANUP_FAILED`                |

La récupération du journal est bornée par l'historique maximal existant du journal et n'autorise que l'unique transition suivante déjà autorisée par `SERVICE_RESTARTED -> LOCAL_RELEASE_OBSERVATION_INGESTED`. Elle peut observer ou compléter le nettoyage, ou reconnaître une publication déjà complétée. Elle ne peut reprendre la construction ordinaire du package. Si la récupération observe la publication, le parent entre dans `package_validated` : une annulation tardive ou une échéance ne peut ré-étiqueter comme annulé un artefact déjà durable. Si la récupération atteint `cleaned`, le candidat est bloqué avant `cancelled` ; aucun journal non terminal actif ne subsiste.

L'invalidation post-V est un événement exact `LOCAL_EVIDENCE_INVALIDATED` avec le code existant `LOCAL_GATE_INVALID`, l'étape `consumer-cancelled-post-v` ou `consumer-deadline-post-v`, l'ID de release courant et `cleanupInvocationId` comme digest de preuve corrélé. Il est soumis via le contrôleur de readiness en utilisant l'`actorId + expectedContextSha256` courant exact. Le succès exige une relecture prouvant l'état `blocked`, des reçus de candidat/sceau/V identiques octet par octet, un J inchangé null ou nettoyé selon le cas, un artefact null et le digest de l'événement d'invalidation accepté. Un conflit CAS de l'acteur n'autorise qu'une relecture du même acteur et soit l'invalidation exacte déjà acceptée, soit une resoumission identique octet par octet tant que la même précondition reste vraie. Un J nouvellement apparu, une publication, un remplacement, une erreur différente ou un reçu différent constitue une ambiguïté, pas une autorité pour élargir le plan.

Seuls `private-clean`, `post-v-blocked` ou `journal-cleaned-blocked` peuvent entrer dans `cancelled`. Ainsi, ni un V assigné une seule fois ni un J non terminal ne se trouve orphelin dans un acteur `rc_built` en apparence annulable. Les protocoles ultérieurs de nouveau candidat restent ceux de la section post-V ci-dessous ; le nettoyage n'invente jamais un abandon de candidat ou de catalogue.

Une nouvelle livraison d'annulation d'opérateur identique octet par octet dans `cancelling` est un no-op interne sans réentrée dans l'état. Toute autre annulation est rejetée sous `CANCELLATION_ALREADY_STARTED` sans modifier le contexte, arrêter un autre enfant ou émettre un autre effet de nettoyage. La gestion générique de `STAGE_FAILED` exclut `cancelling` ; seul le résultat de nettoyage corrélé peut en sortir. L'expiration de l'échéance, un redémarrage, un nettoyage ambigu ou l'épuisement du budget de nettoyage réservé produit `rejected/CLEANUP_AMBIGUOUS`, jamais `cancelled`.

Avant d'appliquer une ligne de redémarrage, l'acteur impute l'allocation complète de l'invocation active persistée, avance `maxObservedWallAt`, et recalcule uniquement le budget monotone au processus restant sans extension. Un échantillon d'horloge murale inférieur au maximum persisté est une ambiguïté d'échéance et ne peut démarrer de nouveau travail. Les cinq cibles `retry_wait` ci-dessous ne sont légales que tant que l'échéance de travail et le budget d'étape cumulé correspondant subsistent. Sinon, le redémarrage entre dans le même plan de nettoyage d'échéance ; une échéance stricte déjà expirée ne peut que produire la classification durable fail-closed de la ligne, jamais un travail neuf ou `cancelled`.

La gestion du redémarrage est exhaustive :

| État persisté                  | Cible                | Effet de redémarrage exact                                                                                                                               |
| ------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `created`                      | `created`            | no-op exact ; aucune requête ni autorité n'existe                                                                                                        |
| `loading_readiness_actor`      | `retry_wait`         | annuler l'acteur de lecture perdu ; consigner `EPHEMERAL_AUTHORITY_LOST` réessayable ; conserver uniquement les sélecteurs acteur/run                    |
| `observing_provider`           | `retry_wait`         | annuler l'acteur API ; abandonner enveloppe/ETags ; consigner `EPHEMERAL_AUTHORITY_LOST` réessayable                                                     |
| `downloading_transport`        | `retry_wait`         | abandonner le flux ; jeter tous les octets partiels/faits de redirection ; consigner `EPHEMERAL_AUTHORITY_LOST` réessayable                              |
| `revalidating_provider`        | `retry_wait`         | annuler la revalidation ; abandonner le tampon téléchargé et l'époque d'observation complète ; consigner `EPHEMERAL_AUTHORITY_LOST` réessayable          |
| `verifying_attestation`        | `retry_wait`         | annuler le vérificateur ; abandonner le tampon/enveloppe non accepté ; consigner `EPHEMERAL_AUTHORITY_LOST` réessayable                                  |
| `verifying_transport`          | `rejected`           | fermer/abandonner les descripteurs/racine d'extraction ; consigner `EPHEMERAL_AUTHORITY_LOST` non réessayable                                            |
| `verifying_payload_authority`  | `rejected`           | fermer tous les descripteurs conservés et l'autorité temporaire dérivée ; consigner `EPHEMERAL_AUTHORITY_LOST` non réessayable                           |
| `capability_ready`             | `rejected`           | révoquer le token/enregistrement de payload ; fermer les descripteurs ; ne jamais reconstruire la capabilité                                             |
| `admitting_host`               | `rejected`           | révoquer tout enregistrement de payload/admission survivant ; le résultat d'admission est inconnu et jamais rejoué                                       |
| `runtime_executing`            | `rejected`           | traiter le résultat Docker comme inconnu ; si V est déjà durable tant que J est null, consigner `POST_V_PRE_JOURNAL_CRASH` ; sinon ne jamais ingérer V   |
| `payload_verified`             | `rejected`           | V est durable mais J est null ; consigner `POST_V_PRE_JOURNAL_CRASH`, abandonner ce candidat et ne jamais reprendre ni réexécuter le runtime             |
| `package_validating`, J null   | `rejected`           | V est durable mais la première réservation de journal ne l'était pas ; consigner `POST_V_PRE_JOURNAL_CRASH` et abandonner ce candidat                    |
| `package_validating`, J défini | `package_recovering` | ne pas réexécuter le fournisseur/runtime ; invoquer le protocole exact de journal de readiness `SERVICE_RESTARTED -> LOCAL_RELEASE_OBSERVATION_INGESTED` |
| `package_recovering`, J null   | `rejected`           | impossible sous une entrée valide ; fail-closed sous `POST_V_PRE_JOURNAL_CRASH` plutôt que de synthétiser une autorité de récupération                   |
| `package_recovering`, J défini | `package_recovering` | renouveler uniquement le protocole d'observation locale corrélé ; n'appliquer aucun effet de package avant la récupération unique observée               |
| `retry_wait`                   | `retry_wait`         | no-op exact ; l'utilisateur doit demander une nouvelle tentative                                                                                         |
| `cancelling`                   | `rejected`           | issue d'annulation/nettoyage inconnue ; consigner `CLEANUP_AMBIGUOUS`, ne jamais déduire l'état annulé                                                   |
| `package_validated`            | `package_validated`  | no-op terminal exact                                                                                                                                     |
| `rejected`                     | `rejected`           | no-op terminal exact                                                                                                                                     |
| `cancelled`                    | `cancelled`          | no-op terminal exact                                                                                                                                     |

Aucune ligne de redémarrage ne reconstruit les octets téléchargés, les descripteurs, une capabilité ou une admission. Les paires de lignes gardées `package_validating` et `package_recovering` s'excluent mutuellement et sont exhaustives sur la valeur de `packageJournal` de l'acteur de readiness durable. Une entrée valide `PACKAGE_RECOVERY_REQUIRED` implique déjà un J non nul ; la ligne nulle est le cas de corruption de persistance en fail-closed.

### Abandon et remplacement en cas de crash post-V/pré-journal

Un crash intervenant après que le CAS d'acteur V commite et avant le premier commit de `PACKAGE_JOURNAL_INGESTED` constitue une frontière irrévocable pour ce candidat, y compris la sous-fenêtre où le consommateur persistait encore `runtime_executing`, persistait déjà `payload_verified`, ou entrait dans `package_validating` sans journal. Après redémarrage, le résidu durable de readiness est exactement :

```ts
interface PostVPreJournalReadinessResidueV1 {
  state: 'rc_built';
  actorId: string;
  candidate: CandidateIdentityV1; // unchanged
  seal: TestedDistSealV1; // unchanged
  transportObservation: SealedCandidateTransportObservationV1; // V, assigned once
  payloadVerification: ReleaseExecutionPayloadVerificationV1; // V, assigned once
  packageJournal: null;
  packageJournalIdentity: null;
  artifact: null;
  pendingRestart: null;
  // acceptedLocalEvents contains exactly one
  // AcceptedPayloadVerificationLocalEventV1 with
  // [attestationId, verificationId, snapshotId] plus eventSha256.
  // payloadByteSnapshot and verifiedProjection are not present.
}
```

Le consommateur entre durablement dans `rejected/POST_V_PRE_JOURNAL_CRASH`, nettoie uniquement ses chemins privés non ambigus, et ne rouvre jamais les octets du fournisseur, ne réexécute pas Docker, ne réémet pas V, ne crée pas J pour l'ancien candidat et ne traite pas le digest d'événement comme une autorité d'octets. Le résidu de readiness reste `rc_built` jusqu'à ce que le contrôleur applique explicitement l'un des protocoles de release-readiness existants suivants :

1. **Remplacement intra-acteur (In-actor replacement).** Ingérer `LOCAL_EVIDENCE_INVALIDATED` avec une `ReleaseReadinessError` typée en utilisant le code existant `LOCAL_GATE_INVALID`, l'étape `consumer-post-v-pre-journal-crash`, l'ancien `releaseId` et le hash de preuve corrélé. Cela fait passer `rc_built -> blocked` tout en préservant les anciens reçus V. Soumettre ensuite `NEW_CANDIDATE_INGESTED` uniquement avec un candidat frais, un audit complet et une révision de catalogue. Avec J null et un espace de noms différent, la clôture de remplacement est `no_journal` ; réutiliser l'ancien espace de noms non publié exige en outre l'observation de redémarrage corrélée exacte prouvant l'absence des chemins de staging et finaux. Le CAS de contexte d'acteur utilise `actorId + expectedContextSha256`, et la même transaction effectue le CAS de catalogue, archive le contexte ancien complet, abandonne sa réservation active, réserve la nouvelle identité, efface le sceau/V/J/artefact actuels et retourne à `audited`.
2. **Nouvel acteur distinct (Distinct new actor).** Ingérer d'abord le même `LOCAL_EVIDENCE_INVALIDATED` afin que l'ancien acteur soit durablement bloqué, puis réserver un ID de release authentiquement nouveau et un espace de noms globalement disponible différent via le CAS ordinaire atomique de fabrique d'acteur/catalogue. L'ancien acteur et sa réservation restent des preuves immuables ; aucun champ ni reçu n'est copié dans le nouvel acteur.

Chaque chemin exige un nouveau candidat/audit propre, un sceau final, un transport et une passe complète du consommateur. Aucun des deux chemins ne reprend le candidat abandonné. Toute tentative de remplacer directement depuis `rc_built`, de jeter les reçus V assignés une seule fois, de réutiliser un espace de noms publié, de contourner la preuve de fermeture ou de modifier l'ancien acteur est rejetée.

## 7. Matrice hostile fail-closed

| Cas hostile ou ambigu                                                                                     | Doit rejeter avant                         |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| candidat/sceau fourni par l'appelant ou discordance d'état/SHA-256 de contexte de readiness               | première requête GitHub                    |
| `RELEASE_PAYLOAD_VERIFIED_INGESTED` avant `RC_SEAL_INGESTED`/`rc_built` durable                           | mutation de readiness                      |
| champ de snapshot d'octets de payload manquant/superflu/non canonique/hors bornes                         | mutation de readiness                      |
| seconde annulation non identique ou doublon exact qui réentre/relance le nettoyage                        | second effet de nettoyage                  |
| échéance prolongée/remplacée, génération de surveillant périmée, étape réinitialisée/sous-imputée         | invocation d'enfant                        |
| annulation/échéance après V qui omet l'invalidation durable ou la récupération de J                       | `cancelled`                                |
| la projection d'artefact REST invente job, tentative de run, mode direct ou TTL demandé                   | autorité de handoff                        |
| ralliement terminal du producteur manquant/divergent ou digest d'uploader déduit de REST                  | autorité de handoff                        |
| zéro ou plusieurs artefacts ou attestations ; changement de pagination                                    | autorité de téléchargement                 |
| appel d'API de redirection ou revalidation d'ETag hors du budget cumulé du fournisseur                    | autorité de téléchargement                 |
| page 2/curseur, ETag manquant/changeant, époque d'observation mixte                                       | vérification d'attestation                 |
| origine/version/chemin/requête d'API alternatifs, redirection automatique ou proxy ambiant                | utilisation de réponse fournisseur         |
| identifiant d'API sur la cible de redirection, cookie, seconde redirection/origine ou IP privée           | lecture du corps téléchargé                |
| projection d'API forgée avec tuple dépôt/run valide                                                       | analyse de ZIP                             |
| preuve DSSE/chaîne/racine/transparence invalide                                                           | analyse de ZIP                             |
| workflow/ref/blob alternatif ; action modifiable/non répertoriée ; étape privilégiée injectée             | analyse de ZIP                             |
| divergence de digest d'artefact/uploader/attestation/téléchargement                                       | analyse de ZIP                             |
| téléchargement partiel/repris/réempaqueté/second                                                          | analyse de ZIP                             |
| objet ZIP dupliqué, en traversée, en collision Unicode/casse, lien, spécial ou superflu                   | complétion d'extraction                    |
| JSON/JCS "équivalent" mais différent en octets                                                            | enregistrement de capabilité               |
| sceau modifié ou l'une quelconque des six entrées de payload modifiée                                     | enregistrement de capabilité               |
| métadonnées/provenance/contrôleur/autorité alternatifs avec digests locaux recalculés                     | enregistrement de capabilité               |
| objet OCI superflu/manquant, manifest multiple, mauvaise plateforme/annotation/graphe de couches          | enregistrement de capabilité               |
| DTO brut, cast, fausse marque (brand), proxy, getter ou contournement d'environnement                     | accès à l'enregistrement de token          |
| hôte non-Linux ou non-x64                                                                                 | accès token/proxy/getter/candidat          |
| faux `HOST_ADMITTED` utilisé pour déclencher vérification hôte/consommation token/création admission      | accès à l'enregistrement de token          |
| seconde utilisation de token/admission                                                                    | accès à Docker                             |
| faux `RUNTIME_VERIFIED` utilisé pour consommer l'admission/démarrer Docker                                | accès à Docker                             |
| port/callback/options/second argument/hook de test Docker fourni par l'appelant                           | accès à Docker                             |
| réouverture de chemin OCI, référence par tag uniquement/digest de config, pull ou graphe local différent  | démarrage du contrôleur                    |
| fermeture/réutilisation/échange de descripteur, reciblage de lien symbolique, mutation à taille identique | démarrage contrôleur ou succès             |
| injection Python/env/chargeur, racine/montage accessible en écriture, socket Docker, privilège excessif   | démarrage du contrôleur                    |
| stdout/stderr superflu, mauvais code de sortie/signal ou reçu falsifié                                    | ingestion de reçu                          |
| démarrage de package avant la preuve d'exécution durable                                                  | première écriture de package               |
| redémarrage après V durable mais avant le premier J tentant de reprendre le candidat abandonné            | premier travail repris fournisseur/package |
| reconstruction/installation/incrément/édition ou récupération de journal ambiguë                          | publication d'artefact                     |

Chaque test de mutation affirme qu'une sentinelle malveillante unique n'a jamais été créée, et non pas simplement que le post-vol a remarqué l'attaque plus tard.

## 8. Invariants

1. Un contexte `rc_built` d'acteur de readiness exact, admis par `actorId + expectedContextSha256`, fournit le candidat et le sceau immuables ; l'entrée publique ne peut fournir ni l'un ni l'autre et aucune révision d'acteur/registre ne s'y substitue.
2. Le contrôleur de readiness accepte durablement `RC_SEAL_INGESTED` avant que le consommateur ne puisse charger `rc_built`, et n'accepte l'événement V observation+vérification+snapshot d'octets exact qu'ensuite dans ce même acteur.
3. Les limites, la forme, le vérificateur et la projection vérifiée du snapshot sont importés uniquement depuis la clarification 11 de release-readiness ; le consommateur ne contient aucun miroir, parseur alternatif, limite numérique copiée ou vérificateur de repli.
4. Un acteur lie une tentative de run demandée et une identité d'acteur de readiness.
5. Chaque digest en aval nomme le même tampon d'artefact capturé unique.
6. Le protocole GitHub fermé utilise une origine/version d'API exacte, une portée d'identifiants, une époque d'une seule page/ETag et une URL exacte de redirection sans identifiants.
7. L'autorité d'attestation/workflow est validée avant l'analyse ou l'extraction du ZIP.
8. Le transport comporte exactement sept composants ; le payload comporte six entrées non auto-référencées ; les preuves comportent cinq fichiers authentifiés plus une autorité dérivée.
9. Le `verificationId` de la clarification 3, le digest propre de l'autorité et le digest propre du reçu restent acycliques.
10. Les capabilités sont privées, opaques, gelées, basées sur l'identité et one-shot.
11. La vérification de l'hôte puis la consommation du token de payload se produisent de façon synchrone à l'intérieur de l'invocation d'admission avant sa première frontière asynchrone ; `HOST_ADMITTED` ne fait que valider/persister le résultat.
12. La consommation de l'admission se produit de façon synchrone à l'intérieur de l'invocation runtime avant sa première frontière asynchrone ou accès à Docker ; `RUNTIME_VERIFIED` ne fait que valider/persister le résultat.
13. Le runtime n'accepte aucun DTO/chemin/octets/port/options/callback/surcharge/hook brut.
14. Aucun émetteur de capabilité/mint/registre/marque/registre/hook de test exporté n'existe.
15. Les descripteurs du candidat restent ouverts et sont entièrement revalidés autour de Docker.
16. Seul le digest de manifest `linux/amd64` capturé peut s'exécuter ; aucun pull/rebuild.
17. La réservation de package n'intervient qu'après l'ingestion durable de la preuve d'exécution.
18. Le packaging est réservé aux packages et ne peut modifier les octets du candidat testé.
19. Seuls les événements et gardes typés répertoriés entraînent une transition ; le texte et les LLM ne décident jamais.
20. L'accès du consommateur au fournisseur est en lecture seule ; il n'effectue aucune mutation externe.
21. La première annulation démarre exactement un nettoyage ; une réémission identique est un no-op et une seconde annulation différente n'a aucun effet de nettoyage ou d'état.
22. Le redémarrage suit la matrice exhaustive et ne reconstruit jamais d'autorité éphémère.
23. Un V durable avec un J null abandonne définitivement ce candidat ; ni V ni le digest d'événement accepté ne peut reprendre le travail fournisseur, runtime ou package.
24. Le remplacement exige le protocole explicite bloqué/nouveau-candidat/CAS de catalogue ou un acteur/espace de noms distinct ; les anciennes preuves V ne sont jamais réécrites.
25. Les états terminaux ne démarrent jamais de nouveau travail ; les observations dupliquées exactes sont des no-ops et les doublons divergents sont rejetés.
26. Une identité de surveillant persistée applique l'échéance absolue de requête de 45 minutes à travers les générations de réessai. Les budgets par étape, y compris les deux invocations de fournisseur, survivent aux réessais/redémarrages sans réinitialisation ni sous-imputation ; le travail ordinaire ne peut consommer la réserve de nettoyage.
27. `cancelled` est impossible après un V/J durable tant que le même acteur de readiness n'est pas durablement bloqué avec V préservé et J null/nettoyé ; une publication observée produit à la place `package_validated`.
28. REST ne fournit que ses champs d'artefact documentés. Les faits de tentative signés proviennent de `GitHubTransportAttestationV1` ; le mode d'uploader/rétention/topologie provient de la politique de workflow fermée du candidat ; le digest dynamique de l'uploader provient uniquement de l'`ArtifactPublicationJoinV1` terminale validée ; aucun ID de job n'est déduit.
29. Le snapshot et la projection vérifiée relèvent de l'autorité privée transitoire uniquement. La rétention durable de V est exactement l'observation, la vérification, `[attestationId, verificationId, snapshotId]` et le SHA-256 de l'événement V complet ; les octets durables de snapshot/projection sont interdits.
30. Le consommateur n'accepte que le chemin/schéma V2 parent, les treize identifiants ordonnés exacts et les deux hashs exacts, et l'implémentation reste bloquée jusqu'aux approbations de modèle exactes de la clarification 11, de la révision 11 du producteur, de la révision 26 de MV3, de la révision 11 de packaged-tab et de la révision 6 de l'ancre accessible CV.
31. La vérification de pré-activation consomme l'ensemble implémenté ordonné et n'émet que des preuves de slot consommateur. Elle ne peut consommer de reçus de vérification, d'ensemble vérifié ou d'activation, effectuer de requête auprès d'un fournisseur ou publier une autorité de package.
32. Aucune lecture auprès du fournisseur n'intervient tant que le candidat, l'audit, la porte et l'activation globale au contrôleur ne s'accordent pas sur des projections à indice fixe depuis un ensemble vérifié ordonné complet, l'ensemble des dix-huit reçus distincts par rôle et un unique digest final d'activation conjointe. Une revue, preuve ou vérification sans activation n'a aucune autorité auprès du consommateur.
33. Le terminal signé du producteur prouve que chaque octet de projet exécuté provient de la vue d'exécution récursivement en lecture seule du commit/arbre du candidat avec chaque ancêtre source adressable en lecture seule, zéro overlay/masquage de chemin suivi, uniquement les cinq montages de sortie fermés, des ensembles de capabilités vides et la politique seccomp/système de fichiers héritée.
34. Le sceau, le handoff et le terminal contiennent des reçus ordonnés de commande formant des extensions de préfixe exactes avec des états de montage/capabilité pré/post correspondants. La recapture Git n'est qu'une défense en profondeur ; une restauration temporaire, chmod, lien, lien symbolique, renommage, remontage, évasion de namespace, sortie implicite ou descendant détaché empêche la première lecture auprès du fournisseur.

## 9. Porte de vérification et de revue

Tests futurs requis :

- chaque transition autorisée/interdite, chaque ligne de redémarrage et l'ensemble des 34 invariants ;
- véritables tests de conflit CAS/idempotence de contexte d'acteur utilisant uniquement `actorId + expectedContextSha256` ;
- tests de contrat d'import direct pour les clés de snapshot parentes, le champ Base64 et les bornes agrégées atteignables, le vérificateur et la projection ; les analyses de source/AST doivent rejeter chaque miroir/redéclaration/repli local ;
- tests de dépendance réservés à V2 pour `scenarios.v2.json`, schéma 2, les treize identifiants ordonnés exacts et les deux hashs, plus mauvais chemin/révision/hash de comportement de modèle, reçu de revue/implémentation/vérification manquant ou entrecroisant les rôles, l'un quelconque des six échecs de normalisation de blob de modèle, réordonnancement d'ensemble/dérive de projection entre candidat/audit/porte et autorité conjointe revue mais non activée ;
- les tests d'ensembles d'autorité reproduisent les préimages JCS revues, implémentées, de preuve et vérifiées, rejettent chaque omission/champ superflu/réordonnancement/doublon/champ entre phases, et prouvent que les reçus de vérification ne peuvent être émis qu'à partir de preuves acceptées ;
- les tests de sandbox de phase prouvent que la vérification de pré-activation n'accepte que l'ensemble implémenté, rejette un reçu de vérification/ensemble vérifié, émet des preuves de slot consommateur et n'effectue aucun effet de catalogue, d'acteur, de fournisseur, d'endpoint ou d'artefact ; le consommateur de production rejette jusqu'à l'activation et la véritable preuve fournisseur/runtime reste post-activation ;
- les tests de source de producteur mutent chaque matérialisation, autorité de source immuable, commande et champ de reçu pré/post, catégorie de source suivie, chemin inattendu non suivi, cwd, origine de script/config chargé et ralliement commit/arbre ; le consommateur rejette le terminal signé avant sa première requête GitHub ;
- les terminaux de producteur hostiles avec source/ancêtre accessible en écriture, exposition de chemin sous-jacent/FD, masquage bind par overlay ou chemin suivi, montage de sortie inconnu/tardif/non vide, socket Docker/containerd/buildkit/systemd, courtier FUSE/aide, gain sudo/setuid/capabilité de fichier, `CAP_SYS_ADMIN` ou tout ensemble de capabilités non vide, `no_new_privs` absent, seccomp élargi, dérive de topologie de montage, reçu de préfixe manquant/réordonné ou descendant non rallié rejettent avant l'accès au fournisseur ;
- réécriture-et-restauration temporaire d'octets, réécriture à l'octet identique, chmod-et-restauration, lien physique, lien symbolique, renommage, montage/remontage, évasion de namespace/chroot et sentinelle dist dérivée par un attaquant sont exercés explicitement. Une projection Git finale correspondante ne peut autoriser aucun cas ;
- tests de durée de vie transitoire prouvant que le snapshot/projection privé est effacé après accusé de réception/échec CAS et que le contexte durable ne conserve que l'observation, la vérification, les trois identifiants stables et le hash complet de l'événement V ;
- première annulation, doublon exact d'annulation, seconde annulation divergente et corrélation d'invocation/résultat de nettoyage one-shot ;
- frontières d'échéance initiale/de travail/stricte, corrélation de génération/tentative de surveillant, chaque budget cumulé d'enfant, imputation d'allocation complète au redémarrage, rollback/timeout périmé, non-réinitialisation lors de réessai/redémarrage/CAS et épuisement de la réserve de nettoyage ;
- annulation/échéance avant V, après V avec J null, à travers chaque phase de J, invalidation nettoyée, course critique de publication et chaque résidu durable ambigu ;
- chaque sous-fenêtre de crash post-V/pré-J plus remplacement bloqué, absence observée dans le même espace de noms et protocoles de nouvel acteur distinct ;
- gardes pures d'enveloppe GitHub, Sigstore, workflow, ZIP, sceau, payload, provenance, autorité, OCI et reçus avec toutes les mutations de la matrice hostile ;
- tests de schéma fournisseur prouvant que job/tentative de run/mode direct/rétention demandée ne peuvent provenir de REST ; tests de budget persisté séparés pour les phases de redirection et d'ETag ; mutations terminales de chaîne de producteur/ralliement de publication/sortie d'action ; liaison croisée exacte handoff signé/politique/fournisseur frais/téléchargement ;
- analyse de source/export public plus attaques de capabilité brute/cast/marque/proxy/getter/rejeu/environnement/port/hook ;
- véritable consommateur de production sur `linux/x64`, build/load/run OCI exacts, mutations de descripteurs/runtime et validation réservée aux packages sans aucun saut.

Cibles d'acceptation à l'intérieur de la phase conjointe inactive après l'ensemble des revues indépendantes requises ; cette liste de commandes seule ne constitue pas une autorité d'implémentation :

```bash
cd apps/extension
../../node_modules/.bin/vitest run tests/unit/scripts/sealed-candidate-transport-consumer.test.ts --pool=forks --maxWorkers=1
../../node_modules/.bin/vitest run tests/integration/release/sealed-candidate-consumer-linux.test.ts --pool=forks --maxWorkers=1
../../node_modules/.bin/tsc --noEmit --pretty false --incremental false
../../node_modules/.bin/eslint scripts/release-consumer tests/unit/scripts/sealed-candidate-transport-consumer.test.ts
../../node_modules/.bin/prettier --check src/models/sealed-candidate-transport-consumer.model.md
```

Auto-revue structurée :

| Vérification                                                                     | Résultat    |
| -------------------------------------------------------------------------------- | ----------- |
| entrées explicites, sortie et non-revendications                                 | PASS        |
| acteur de readiness autoritaire et ordre S-avant-V                               | PASS        |
| le véritable CAS d'acteur utilise l'ID d'acteur plus le hash de contexte attendu | PASS        |
| import direct de l'autorité de snapshot parent, pas de miroir                    | PASS        |
| snapshot transitoire contre hash d'événement / 3 ID durable                      | PASS        |
| dépendance exclusive à l'inventaire V2 à treize entrées                          | PASS        |
| ensembles de modèles ordonnés étagés et activation conjointe atomique            | PASS        |
| alignement des slots release 11, producteur 11 et consommateur 12                | PASS        |
| liaison exacte des hashs MV3 26, packaged-tabs 11 et CV 6                        | PASS        |
| commit source approuvé `ff9164c4` de packaged-tabs 11                            | PASS        |
| états finis, événements typés et états terminaux                                 | PASS        |
| transitions nominales avec gardes/effets                                         | PASS        |
| chaîne GitHub/Sigstore/transport/payload/runtime/package                         | PASS        |
| protocole d'exécution de l'OS avec source Git immuable signée                    | PASS        |
| montages source/sortie et reçus de capabilité pré/post                           | PASS        |
| type commun ArtifactPublicationJoinV1 producteur/consommateur                    | PASS        |
| run ID sous forme de chaîne décimale canonique de bout en bout                   | PASS        |
| ambiguïté fatale et cas hostiles                                                 | PASS        |
| réessais, annulation et redémarrage                                              | PASS        |
| gestion des doublons d'annulation et nettoyage one-shot                          | PASS        |
| disposition CAS durable d'annulation post-V/J                                    | PASS        |
| échéance absolue et budgets enfants sans réinitialisation                        | PASS        |
| frontière de faits REST et politique de handoff signé fermée                     | PASS        |
| abandon post-V et remplacement par candidat frais                                | PASS        |
| chronologie token/admission d'invocation avant l'asynchrone                      | PASS        |
| origines/identifiants/pages/époque d'ETag GitHub exacts                          | PASS        |
| capabilité opaque one-shot et chemins d'API interdits                            | PASS        |
| chronologie de package et invariant réservé aux packages                         | PASS        |
| approbation indépendante du hash en attente exact                                | **PENDING** |

L'implémentation reste interdite jusqu'à ce que des réviseurs indépendants recalculent et approuvent ce hash en attente exact, la clarification 11 de release-readiness, la révision 11 alignée du producteur, la révision 26 du harnais MV3, la révision 11 de packaged-tab et la révision 6 de l'ancre accessible CV, le tout sans constat bloquant. Ces revues n'autorisent que la phase inactive d'implémentation conjointe ; le travail de release du consommateur exige en outre des reçus distincts d'implémentation/vérification et l'activation atomique finale. Les points bloquants actuels de la release demeurent :

1. les six hashs de modèles exacts ne sont pas tous approuvés indépendamment ou conjointement activés ;
2. aucun consommateur de production ne possède encore le registre privé de payload vérifié ;
3. la véritable preuve consommateur/runtime/package sur Linux/x64 n'a pas été validée avec zéro saut ;
4. aucun test au vert ne peut remplacer une approbation de modèle manquante.

Si un comportement ne peut être représenté par cette machine, il n'est pas prêt à être implémenté. Si une transition dépend d'un LLM, l'architecture est incorrecte.
