# Modèle d'accessibilité de la carte d'expérience CV

Statut : **RÉVISION 6 DU MODÈLE — en attente de revue indépendante ; implémentation interdite jusqu'à approbation**.

Pending behavior SHA-256: `d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98`.

Le hachage normalisé du comportement est le SHA-256 de l'intégralité des octets bruts UTF-8/LF de ce fichier après remplacement uniquement de la valeur entre accents graves (backticks) sur la ligne `Pending behavior SHA-256` par le littéral `__PENDING_BEHAVIOR_SHA256__`. Aucune autre normalisation n'est autorisée.

La révision 6 clôt l'observation post-revue de la révision 5. Elle remplace la sortie fantôme de sortie de focus (focus-exit) par un port de rappel (callback port) Svelte synchrone explicite, décode sa disponibilité/référence, confine chaque résultat de port invalide, et rend la libération d'ID ainsi que la suppression terminale inconditionnelles via des effets `finally` imbriqués. Elle préserve toutes les autres résolutions de la révision 5 et le contrat empaqueté (packaged) exact A3.

## Objectif et frontière

`ExperienceCard.svelte` expose un contrat d'accessibilité stable et utilisable au clavier pour une expérience de CV persistée. Les tests MV3 empaquetés et les technologies d'assistance identifient la carte, basculent (toggle) ses détails et corrèlent le basculeur avec la région contrôlée sans utiliser la position dans le DOM, les classes CSS, les chevrons visibles ou du texte non scopé.

Ce modèle détient l'identité sémantique de la carte, la projection locale des détails et le focus tant que son sous-arbre est connecté. Le workflow CV parent détient la création, l'état métier d'édition/sauvegarde/suppression, la persistance et la destination du focus après la destruction de la carte. L'expansion ne mute jamais une expérience, n'écrit pas dans le stockage, n'invoque pas de LLM et ne décide pas si une édition/sauvegarde/suppression a réussi.

## Entrées immuables et décodeur fermé

`experience` et `draft` franchissent la frontière du composant sous forme de snapshots de valeurs immuables. `skills` est une séquence ordonnée immuable. La carte prend une copie détenue en propre (owned copy) de chaque snapshot accepté ; ni le parent ni la carte ne peuvent muter sur place (in place) un objet `Experience` ou son tableau `skills`. Une valeur modifiée est transmise sous forme de snapshot de remplacement. Une mutation sur place est une intégration invalide et ne peut pas sélectionner une transition d'état.

La signature d'entrée d'accessibilité est exactement ce tuple typé, dans cet ordre :

```ts
type ExperienceAccessibilitySignature = readonly [
  id: string,
  title: string,
  company: string | null,
  description: string,
  skills: readonly string[],
  isEditing: boolean,
  draftId: string | null,
  isBusy: boolean,
  hasOnEdit: boolean,
  hasOnDelete: boolean,
  hasOnSave: boolean,
  hasOnCancelEdit: boolean,
  hasOnFocusExitRequest: boolean,
];
```

L'égalité des tuples se fait élément par élément via `Object.is` ; l'égalité de `skills` requiert de plus la même longueur, le même ordre et les mêmes valeurs élément par élément. Il ne s'agit pas de JSON, de concaténation avec délimiteurs, d'identité d'objet ou d'un hachage. `draftId` vaut exactement `draft?.id ?? null` ; chaque valeur `hasOn*` vaut exactement `typeof callback === 'function'`. L'identité de la fonction de rappel n'est pas un guard d'état. Le décodage d'entrée est à événement unique et ordonné : une différence sur le tuple émet `EXPERIENCE_INPUT_CHANGED`, qui transporte déjà les dernières références ; lorsque le tuple est égal, l'adaptateur compare les cinq références de rappel avec `Object.is`, et une ou plusieurs différences émettent exactement un `CALLBACK_REFERENCE_CHANGED { nextExperience, nextDraft, nextCallbacks }`. Ce n'est que lorsque le tuple et les références de rappel sont égaux que d'autres différences de snapshot peuvent émettre `EXPERIENCE_PRESENTATION_CHANGED`. Ainsi, le remplacement de référence est détecté même avec un tuple égal sans produire deux événements d'entrée.

Avant la première projection dans le DOM, l'adaptateur copie le snapshot complet initial, calcule ce tuple et exécute le classificateur initial ci-dessous de manière synchrone. Il n'existe pas d'événement mount distinct ni d'état vivant (live state) non classifié.

Lors de chaque mise à jour ultérieure d'entrée de remplacement, l'adaptateur prend d'abord des copies détenues en propre de `nextExperience` et `nextDraft`, puis calcule le tuple. Une différence sur le tuple émet exactement un `EXPERIENCE_INPUT_CHANGED { previous, next, nextExperience, nextDraft, nextCallbacks }` au sein de cette même mise à jour. Le décodeur traite chaque paire ordonnée `(previous.isEditing, next.isEditing)` exactement une fois et dans cet ordre de priorité :

1. `true -> false` : dériver exactement un événement mutuellement exclusif `EDIT_EXITED_CHANGED` ou `EDIT_EXITED_UNCHANGED`, puis exécuter le classificateur de non-édition. Cette règle est prioritaire sur la règle générique de non-édition et en est exclue.
2. `false -> true` : dériver `EDIT_STARTED`, puis classifier la nouvelle paire identité/draft en tant que `editing` valide ou repli sécurisé (fail-closed) `unavailable`.
3. `true -> true` : dériver `EDIT_INPUT_REPLACED`. Un prochain draft valide entre/reste toujours dans `editing` avec le nouveau snapshot validé et le nouveau draft lorsque l'identité est également valide. Cela inclut la récupération depuis `unavailable.invalid_edit_input` ou `unavailable.draft_owner_mismatch`, le remplacement avec le même ID et le remplacement avec un ID d'expérience différent. Une identité ou un prochain draft invalide entre/reste dans la raison `unavailable` ordonnée correspondante. Aucune raison invalide antérieure ni aucun draft obsolète ne peut l'emporter sur les prochaines copies détenues en propre.
4. `false -> false` : dériver `DISPLAY_INPUT_REPLACED` et exécuter uniquement le classificateur de non-édition.

Au sein des règles 3 et 4, une modification est `capabilityOnly` exactement lorsque `id/title/company/description/skills/isEditing/draftId` sont égaux et qu'au moins l'un des champs `isBusy/hasOnEdit/hasOnDelete/hasOnSave/hasOnCancelEdit/hasOnFocusExitRequest` diffère. Un changement `capabilityOnly` dérive `INTERACTION_CAPABILITY_CHANGED` au lieu de `EDIT_INPUT_REPLACED`/`DISPLAY_INPUT_REPLACED`, conserve l'état courant de la machine et l'expansion, remplace le snapshot de capacités et réconcilie les contrôles. Lorsque les champs d'expérience/édition et les champs de capacité changent ensemble, la transition ordonnée de la paire d'édition s'exécute une fois et la réconciliation des capacités est un effet de cette transition, jamais une seconde transition d'état.

La ligne de base (baseline) de comparaison d'édition est le tuple à cinq champs `id/title/company/description/skills` capturé lors de `false -> true`, ou le tuple initial à cinq champs lorsque le composant se monte pour la première fois avec `isEditing=true`. `EDIT_EXITED_CHANGED` signifie qu'au moins une valeur de la ligne de base diffère du prochain snapshot validé (committed) ; `EDIT_EXITED_UNCHANGED` signifie que les cinq valeurs sont égales selon l'égalité exacte ci-dessus. Les deux événements de sortie sont intentionnellement nommés d'après les entrées d'accessibilité observables, et non « saved » ou « cancelled » : la sauvegarde de données inchangées et une annulation externe sont indiscernables à cette frontière et ont la même projection déterministe. Le `SAVE_RESULT` métier reste la propriété du parent.

Un remplacement qui modifie uniquement des champs extérieurs à la signature émet `EXPERIENCE_PRESENTATION_CHANGED` ; il remplace tout de même le snapshot complet détenu en propre et peut rafraîchir les champs date, contract, location, source ou draft, mais constitue une auto-transition d'état exacte. Un changement de tuple limité à `isBusy` ou `hasOn*` dérive `INTERACTION_CAPABILITY_CHANGED` ; il préserve `display.collapsed` ou `display.expanded`, préserve `editing`/`unavailable`, met à jour les contrôles et applique la règle de suppression du contrôle ayant le focus ci-dessous. Il ne sélectionne jamais l'expansion.

`isEditing=true` avec `draft=null` est invalide. Un draft non nul dont l'`id` n'est pas égal à `experience.id` est également invalide. Aucune de ces conditions ne peut basculer par défaut vers la carte d'affichage ou rendre un formulaire semi-édité ; elle entre dans `unavailable` avec une erreur de contrat typée.

## Payload de sauvegarde validé et fusion immuable

`EDIT_SAVE_REQUESTED` n'est pas sans payload. Il transporte une copie détenue en propre de cette valeur de formulaire fermée :

```ts
interface ExperienceFormData {
  title: string;
  company: string;
  employmentType: string;
  location: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string;
  skills: string[];
}
```

La notion de « plain object » (objet simple) est fermée ici : `Object.getPrototypeOf(payload) === Object.prototype` ; `Reflect.ownKeys(payload)` contient exactement les neuf clés de chaînes ci-dessus, sans clé de type symbol, manquante ou supplémentaire ; et chaque clé possède un descripteur de données propre et énumérable (pas de getter/setter). L'inspection de forme est confinée de sorte qu'une exception levée par un piège (trap) de proxy devienne `INVALID_SAVE_PAYLOAD { field:'payload', reason:'inspection_failed' }`. Les cinq champs de texte sont des chaînes ; `skills` est un tableau contenant uniquement des chaînes ; les deux champs de date sont de type string ou `null` ; `isCurrent` est un booléen. La validation applique ensuite ces règles fermées :

L'inspection complète, la copie détenue en propre et la normalisation s'exécutent au sein de ce même confinement ; tout échec de trap de proxy/itérateur/propriété produit le même échec de forme et aucun rappel.

```text
title        = trim(payload.title); required non-empty
company      = trim(payload.company); required non-empty
employment  = trim(payload.employmentType); empty -> null
location    = trim(payload.location); empty -> null
startDate   = trim(payload.startDate ?? ""); required YYYY-(01..12)
description = trim(payload.description)
skills      = payload.skills.map(trim).filter(non-empty), order/duplicates kept

if isCurrent=true:  payload.endDate must be null; endDate = null
if isCurrent=false: endDate = null or trimmed YYYY-(01..12)
```

L'expression régulière du mois est exactement `^[0-9]{4}-(0[1-9]|1[0-2])$`. La validation s'effectue avant tout rappel. `INVALID_SAVE_PAYLOAD { field, reason }` conserve `editing`, le draft détenu en propre et les valeurs du formulaire, et n'invoque aucun gestionnaire (handler). La cible du focus est le premier élément en échec dans cet ordre exact : title -> `Titre du poste` ; company -> `Entreprise` ; startDate -> `Début` ; un endDate non actuel invalide -> `Fin` ; skills -> `Compétences` ; échec de forme/type/inspection -> article externe. La contradiction particulière `isCurrent=true && endDate!==null` utilise la raison `current_requires_null` et positionne le focus sur la case à cocher activée nommée `Poste actuel`, jamais sur le champ `Fin` désactivé ; si cette case à cocher est inopinément indisponible, le repli déterministe est l'article externe.

Pour un payload valide, la carte construit un candidat `Experience` profondément immuable par assignation explicite de champs :

```text
candidate.id               = ownedDraft.id
candidate.title            = title
candidate.company          = company
candidate.employmentType   = employment
candidate.location         = location
candidate.startDate        = startDate
candidate.endDate          = endDate
candidate.isCurrent        = payload.isCurrent
candidate.description      = description
candidate.skills           = immutable copy of normalized skills
candidate.source           = ownedDraft.source
candidate.sourceExternalId = ownedDraft.sourceExternalId
candidate.positionIndex    = ownedDraft.positionIndex
candidate.updatedAt        = ownedDraft.updatedAt
```

Le tableau des compétences normalisées est copié puis gelé avec `Object.freeze` ; le candidat explicitement construit est ensuite gelé avec `Object.freeze`. Aucune référence mutable issue du payload ne survit dans l'une ou l'autre de ces valeurs.

Aucun déversement (spread) du payload non validé n'est autorisé. Les neuf valeurs éditables sont remplacées exactement comme indiqué ; les cinq valeurs d'identité/provenance/ordre/horodatage sont conservées à l'identique depuis le draft détenu en propre. Le composant ne génère aucun ID ni horodatage et ne normalise pas l'ordonnancement métier. Il transmet ce candidat une seule fois à `onSave` ; le parent demeure responsable de la persistance, d'un nouveau `updatedAt`, du recalcul de position et du remplacement autoritaire ultérieur de l'entrée.

## Projection normalisée

`trim(value)` désigne `String.prototype.trim()` d'ECMAScript, supprimant les espaces de début et de fin d'ECMAScript sans conversion de casse ni réduction des espaces internes.

```text
normalizedTitle       = trim(experience.title)
normalizedCompany     = trim(experience.company ?? "")
normalizedDescription = trim(experience.description)
normalizedSkills      = experience.skills.map(trim).filter(value.length > 0)

displayTitle   = normalizedTitle.length > 0 ? normalizedTitle : "Sans titre"
displayCompany = normalizedCompany.length > 0
                   ? normalizedCompany
                   : "Entreprise inconnue"
cardName       = "Expérience " + displayTitle + " chez " + displayCompany
toggleName     = (display.collapsed ? "Afficher" : "Masquer")
                 + " les détails de l’expérience " + displayTitle
regionName     = "Détails de l’expérience " + displayTitle
hasDetails     = normalizedDescription.length > 0
                 || normalizedSkills.length > 0
```

Un title/company composé uniquement d'espaces utilise donc le repli indiqué. Des valeurs de description et de compétences composées uniquement d'espaces ne créent pas de contrôle de détails. Les compétences normalisées préservent l'ordre source et les doublons ; aucun badge vide n'est projeté.

## Identité de la région contrôlée

Le composant capture `$props.id()` exactement une fois à la création de l'instance sous le nom `instanceSuffix`. Il n'est pas recalculé lors d'un nouveau rendu (rerender) et n'est jamais dérivé d'un ID d'expérience, d'un index de carte, du texte rendu, d'une sortie aléatoire, de l'heure courante ou d'un LLM.

La valeur du fournisseur n'est acceptée que lorsque toutes ces règles exactes sont respectées :

```text
instanceSuffix regex  = ^[A-Za-z][A-Za-z0-9-]{0,63}$
instanceSuffix length = 1..64 ASCII code units, inclusive
detailsId             = "cv-experience-details-" + instanceSuffix
detailsId regex       = ^cv-experience-details-[A-Za-z][A-Za-z0-9-]{0,63}$
detailsId length      = 23..86 ASCII code units, inclusive
```

Avant la première projection dans le DOM, le composant crée une référence d'objet en mémoire `ownerLeaseToken` (identité pure, sans données aléatoires) et exécute l'effet fermé `reserve_details_id(document, detailsId, ownerLeaseToken)`. Le registre scopé au document renvoie exactement un résultat :

```text
reserved  registry had no detailsId; store detailsId -> ownerLeaseToken
owned     registry already had detailsId -> same ownerLeaseToken; idempotent success
collision registry had detailsId -> different ownerLeaseToken; do not mutate registry
```

L'état du bail (lease) d'identité est exactement `unvalidated | reserved | rejected | released`. Une regex ou une borne invalide ignore la réservation et devient `rejected` ; une collision devient également `rejected`. Une instance rejetée ne publie jamais l'ID, ne réessaie jamais avec une valeur modifiée et ne détient jamais le bail du gagnant. Une instance réservée conserve le bail lors des remplacements d'entrées, des changements d'état busy/rappel, de l'entrée/sortie d'édition et de l'expansion.

Chaque rejet d'identité stocke exactement un diagnostic immuable :

```text
reason = INVALID_DETAILS_ID | DETAILS_ID_COLLISION
diagnosticKey = reason + ":" + detailsId.length + ":" + detailsId
                + ":" + instanceSuffix.length + ":" + instanceSuffix
identityDiagnostic = { detailsId, reason, diagnosticKey, reported: boolean }
```

`report_contract_failure` remplace une fois le snapshot de diagnostic immuable par un snapshot par ailleurs identique avec `reported:true` ; les ré-exécutions de rendu (rerenders) ne peuvent plus le signaler. La clé inclut le `detailsId` exact non assaini et la raison avec des préfixes de longueur. Lors de `COMPONENT_DESTROYED`, un propriétaire `reserved` exécute `release_details_id(document, detailsId, ownerLeaseToken)` : supprimer uniquement lorsque l'entrée du registre correspond au même token, puis entrer dans `released`. La destruction d'une instance rejetée/non validée/libérée (`rejected`/`unvalidated`/`released`) est un no-op idempotent et ne peut jamais libérer le bail d'une autre instance. Si une destruction supposée réservée (`reserved`) ne trouve aucune entrée ou trouve un token différent, elle émet `DETAILS_ID_RELEASE_MISMATCH`, laisse le registre inchangé, le signale une fois et se termine ; elle ne supprime jamais l'entrée étrangère. Le registre de document ne conserve aucune entrée libérée avec succès.

Le suffixe n'est pas persisté. Un remontage peut recevoir un nouveau suffixe ; la même instance montée conserve son ID réservé exact. Des tests ciblés doivent prouver l'existence de cartes simultanées distinctes, le rejet des collisions, le signalement exactement une fois et la libération lors de la destruction.

## Machine à états

```text
states:
  display
    collapsed
    expanded
  editing
  unavailable
  terminal

unavailableReason:
  no_details
  invalid_edit_input
  draft_owner_mismatch
  invalid_details_id
  details_id_collision

context:
  ownedExperience: immutable Experience
  ownedDraft: immutable Experience | null
  inputSignature: ExperienceAccessibilitySignature
  callbackReferences: latest onEdit/onDelete/onSave/onCancelEdit/onFocusExitRequest
  identityLease: unvalidated | reserved | rejected | released
  identityDiagnostic: immutable diagnostic | null
  nextInvocationId: positive integer
  settledInvocationIds: set of positive integers
  settlementRecords: map invocationId -> immutable intent/outcome/consumed
  settlementDiagnostics: map invocationId -> immutable diagnostic
```

Les noms exacts des états vivants sont `display.collapsed`, `display.expanded`, `editing` et `unavailable` ; `terminal` est déconnecté. La classification initiale est fermée et ordonnée :

1. `detailsId` invalide -> bail `rejected`, `unavailable.invalid_details_id` ;
2. collision de réservation -> bail `rejected`, `unavailable.details_id_collision` ;
3. `isEditing=true && draft=null` -> `unavailable.invalid_edit_input` ;
4. `isEditing=true && draft.id!==experience.id` -> `unavailable.draft_owner_mismatch` ;
5. `isEditing=true` valide -> `editing` ;
6. `isEditing=false && hasDetails=true` -> `display.collapsed` ;
7. sinon -> `unavailable.no_details`.

### Événements externes et d'interface utilisateur

```text
EXPERIENCE_INPUT_CHANGED(previous, next, nextExperience, nextDraft, nextCallbacks)
EXPERIENCE_PRESENTATION_CHANGED(nextExperience, nextDraft, nextCallbacks)
CALLBACK_REFERENCE_CHANGED(nextExperience, nextDraft, nextCallbacks)
TOGGLE_REQUESTED(ownerInstanceSuffix, source: pointer | Enter | Space)
EDIT_REQUESTED
DELETE_REQUESTED
EDIT_SAVE_REQUESTED(payload: unknown)
EDIT_CANCEL_REQUESTED
PARENT_CALLBACK_FULFILLED(invocationId, intentKind)
PARENT_CALLBACK_FAILED(invocationId, intentKind, failureKind)
COMPONENT_DESTROYED
```

Seul le bouton natif de détails peut produire `TOGGLE_REQUESTED`. Chaque événement de bascule (toggle) transporte le suffixe de l'instance montée et n'est accepté que par ce propriétaire. Il n'existe aucun producteur d'événement de bascule dans `editing` ou `unavailable` ; un basculement synthétique, obsolète ou provenant d'un propriétaire tiers est un événement rejeté typé et un no-op exact.

Les événements d'interface utilisateur relèvent d'un monde clos (closed-world). Les seules paires événement/état d'UI autorisées sont les lignes explicitement indiquées comme acceptées dans la table des transitions. Tout autre `TOGGLE_REQUESTED`, `EDIT_REQUESTED`, `DELETE_REQUESTED`, `EDIT_SAVE_REQUESTED` ou `EDIT_CANCEL_REQUESTED` est rejeté de manière synchrone, conserve l'état/snapshot/focus inchangé et n'invoque aucun rappel parent. En particulier, une sauvegarde/annulation reçue après la sortie de l'édition constitue un `STALE_EDIT_INTENT` ; toute intention de mutation en cours d'occupation (busy) constitue un `MUTATION_INTENT_BUSY` ; un rappel manquant constitue un `INTENT_HANDLER_MISSING`. Les contrôles natifs pour une paire rejetée sont absents ou désactivés et non focalisables, de sorte que seul un appelant synthétique/obsolète peut produire l'événement rejeté.

L'évaluation des guards d'interface utilisateur est fermée et la première défaillance l'emporte (first-failure wins). Le basculement vérifie le propriétaire, l'état d'affichage autorisé, l'identité réservée, puis `hasDetails`. Les intentions de mutation vérifient l'état autorisé, `isBusy=false`, le `hasOn*` correspondant, et la propriété valide du draft lors de l'édition ; save valide son payload en dernier. Il en résulte exactement un effet accepté ou un rejet typé — jamais les deux.

### Port de rappel synchrone de sortie de focus (focus-exit)

Le composant Svelte 5 déclare cette prop de rappel explicite et optionnelle :

```ts
type FocusExitResult =
  | 'next_experience_article'
  | 'previous_experience_article'
  | 'add_experience_button'
  | 'cv_heading'
  | null;

interface FocusExitRequest {
  readonly experienceId: string;
  readonly positionIndex: number;
  readonly orderedTargets: readonly [
    'next_experience_article',
    'previous_experience_article',
    'add_experience_button',
    'cv_heading',
  ];
}

onFocusExitRequest?: (request: FocusExitRequest) => FocusExitResult;
```

Le composant crée et gèle la requête ainsi que son tuple de cibles. Le parent tente uniquement ces cibles dans cet ordre exact, focalise de manière synchrone la première cible connectée, et renvoie son enum exact. Il ne renvoie `null` que si aucune n'existe. Ce retour est un accusé de réception d'effet de focus, jamais une autorité d'état ; son texte, son absence ou son échec ne peuvent pas sélectionner une transition de la carte et aucun LLM n'y participe.

Le port n'est délibérément pas acheminé via le confinement de rappel asynchrone. Lorsque la destruction détient le focus, le composant capture un snapshot de la dernière référence décodée et l'appelle au plus une fois au sein d'un bloc `try`. La validation est fermée :

- port absent -> `FOCUS_EXIT_PORT_MISSING` ;
- exception synchrone levée -> `FOCUS_EXIT_PORT_THROW` ;
- l'une des quatre chaînes exactes -> accusé de réception valide ;
- `null` -> `FOCUS_EXIT_TARGET_MISSING` ;
- objet/fonction : lire `.then` une seule fois avec `Reflect.get` au sein d'un bloc `try` ; `then` appelable -> `FOCUS_EXIT_ASYNC_RETURN`, exception levée par le getter -> `FOCUS_EXIT_RESULT_INSPECTION_FAILED`, sinon `INVALID_FOCUS_EXIT_RESULT` ;
- tout autre retour -> `INVALID_FOCUS_EXIT_RESULT`.

Aucun objet de sortie de focus n'est passé à `Promise.resolve`, attendu (awaited), souscrit ou assimilé. Chaque échec est signalé une fois pour cette tentative de destruction et confiné ; il ne peut pas propager d'exception au-delà du port ni empêcher le nettoyage. Si la carte ne possède pas le focus, le port n'est pas appelé et son absence ne constitue pas une erreur.

### Confinement des rappels parents

Chaque rappel possède le contrat de résultat runtime fermé `void | PromiseLike<void>`. La distribution d'intention acceptée utilise un entier monotone par instance `invocationId` commençant à 1 ; il n'utilise jamais l'heure ni l'aléa :

```text
intentKind  = edit | delete | save | cancel
failureKind = throw | reject | invalid_return
```

1. valider l'état, les guards busy/capacité et le payload de sauvegarde le cas échéant ;
2. capturer la référence de rappel courante et l'argument immuable ;
3. allouer un `invocationId` et invoquer une seule fois au sein d'un bloc `try` ;
4. une exception synchrone levée appelle `settleOnce(invocationId, 'throw')` ;
5. un retour synchrone `undefined` appelle `settleOnce(invocationId, 'fulfilled')` ;
6. un primitif non-`undefined` ou `null` appelle `settleOnce(invocationId, 'invalid_return')` ;
7. tout résultat objet/fonction non nul est passé directement au `Promise.resolve(result)` natif au sein d'un bloc `try`, sans lire ni invoquer `.then` dans le code du composant ; attacher un gestionnaire d'accomplissement (fulfillment) et un gestionnaire de rejet ;
8. un rejet asynchrone appelle `settleOnce(invocationId, 'reject')`, ce qui émet `PARENT_CALLBACK_FAILED` ; le rejet est consommé, de sorte qu'aucun rejet non géré ne s'échappe ;
9. un accomplissement avec la valeur `undefined` appelle `settleOnce(invocationId, 'fulfilled')` ; un accomplissement avec toute autre valeur appelle `settleOnce(invocationId, 'invalid_return')`.

`settledInvocationIds` est un ensemble par instance. `settleOnce` vérifie d'abord l'ensemble, ajoute l'ID ainsi qu'un enregistrement de règlement (settlement record) immuable `{ invocationId, intentKind, outcome, consumed:false }` avant d'émettre, et ignore toute tentative ultérieure de règlement. Un événement de règlement n'est accepté que lorsque chaque champ d'identité/résultat correspond à cet enregistrement et que `consumed=false`. Son unique effet remplace atomiquement l'enregistrement par `consumed=true` et insère un diagnostic de règlement sous cet `invocationId`. Un rejeu voit `consumed=true` et constitue un `STALE_CALLBACK_SETTLEMENT` ; un événement inconnu ou discordant produit le même no-op typé exact. Aucun rejeu ne peut écraser l'enregistrement ni insérer un second diagnostic. Le `Promise.resolve` natif convertit la levée d'exception d'un getter `then` hostile en un rejet et respecte la règle du premier règlement gagnant (first-settlement wins) pour un thenable qui appelle fulfill/reject de manière répétée ; l'ensemble constitue le second guard fermé. Un objet non-thenable se résout en cet objet non-`undefined` et constitue par conséquent un `invalid_return` ; un `PromiseLike<void>` doit s'accomplir avec `undefined`. Si l'appel d'assimilation natif lui-même lève une exception de manière synchrone, il est confiné sous forme de `failureKind='throw'` via le même ensemble.

La clé de diagnostic de règlement est exactement `instanceSuffix + ':' + invocationId + ':' + intentKind + ':' + outcome`, où `outcome = fulfilled | throw | reject | invalid_return`. L'accomplissement prouve uniquement la distribution ; il ne signifie jamais le succès de l'édition/sauvegarde/suppression et ne modifie jamais l'état de la carte, l'état busy, le snapshot ou le focus. L'échec conserve les mêmes valeurs d'état/formulaire/draft et ne peut pas invoquer de nouvelle tentative (retry). Un remplacement d'entrée autoritaire ultérieur est la seule projection de succès. Le règlement après `terminal` est consommé et enregistré comme ignoré sans effets sur le DOM, le focus ou les rappels. Les gestionnaires sont ainsi totaux à cette frontière et aucune levée d'exception/rejet ne peut s'échapper ou produire un faux succès.

### Transitions

| État actuel                              | Événement / guard                                                                                             | État suivant           | Effets                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `display.collapsed`                      | propre `TOGGLE_REQUESTED`, `hasDetails`, identité réservée                                                    | `display.expanded`     | définir atomiquement la sémantique développée et monter la région contrôlée exacte                                                                                            |
| `display.expanded`                       | propre `TOGGLE_REQUESTED`, `hasDetails`, identité réservée                                                    | `display.collapsed`    | définir atomiquement la sémantique repliée et retirer la région contrôlée exacte                                                                                              |
| l'un ou l'autre affichage                | `EDIT_REQUESTED`, non occupé, `hasOnEdit`                                                                     | identique              | confiner une invocation de `onEdit()` sans argument ; ne pas modifier l'expansion                                                                                             |
| l'un ou l'autre affichage                | `DELETE_REQUESTED`, non occupé, `hasOnDelete`                                                                 | identique              | confiner une invocation de `onDelete()` sans argument ; ne pas modifier l'expansion                                                                                           |
| `unavailable.no_details`                 | `EDIT_REQUESTED`, non occupé, `hasOnEdit`                                                                     | identique              | confiner une invocation de `onEdit()` sans argument                                                                                                                           |
| `unavailable.no_details`                 | `DELETE_REQUESTED`, non occupé, `hasOnDelete`                                                                 | identique              | confiner une invocation de `onDelete()` sans argument                                                                                                                         |
| `editing`                                | `EDIT_SAVE_REQUESTED(payload)`, non occupé, `hasOnSave`, draft détenu valide et payload valide                | `editing`              | construire le candidat fusionné immuable exact et confiner une invocation de `onSave(candidate)`                                                                              |
| `editing`                                | `EDIT_SAVE_REQUESTED(payload)`, non occupé, `hasOnSave`, draft détenu valide, payload invalide                | `editing`              | `INVALID_SAVE_PAYLOAD` ; conserver le formulaire/draft, n'invoquer rien et focaliser la cible invalide exacte                                                                 |
| `editing`                                | `EDIT_CANCEL_REQUESTED`, non occupé, `hasOnCancelEdit`, draft détenu valide                                   | `editing`              | confiner une invocation de `onCancelEdit()` sans argument                                                                                                                     |
| tout état vivant                         | `EXPERIENCE_PRESENTATION_CHANGED` ou `CALLBACK_REFERENCE_CHANGED`                                             | identique              | remplacer uniquement les références de présentation/gestionnaires courants détenues en propre                                                                                 |
| tout état vivant, drapeau editing stable | `EXPERIENCE_INPUT_CHANGED`, `capabilityOnly` dérivant `INTERACTION_CAPABILITY_CHANGED`                        | identique              | remplacer les snapshots de capacités/gestionnaires, réconcilier les contrôles et déléguer le focus si un contrôle focalisé devient indisponible                               |
| tout état vivant, `false` précédent      | changement d'entrée `false -> true` dérivant `EDIT_STARTED`, identité réservée valide et prochain draft       | `editing`              | remplacer toutes les entrées détenues en propre, réconcilier les capacités, supprimer la sémantique d'affichage, projeter le formulaire d'édition et déléguer le focus retiré |
| tout état vivant, `false` précédent      | changement d'entrée `false -> true` dérivant `EDIT_STARTED`, identité ou prochain draft invalide              | `unavailable` corr.    | remplacer toutes les entrées détenues en propre, supprimer les contrôles/formulaire et signaler l'échec d'intégration exact                                                   |
| `editing` ou `unavailable` edit-invalide | non-capability-only `true -> true` dérivant `EDIT_INPUT_REPLACED`, identité réservée valide et prochain draft | `editing`              | remplacer toutes les entrées détenues en propre ; réconcilier les contrôles, récupérer/projeter le formulaire d'édition et appliquer le focus de remplacement d'édition       |
| `editing` ou tout `unavailable` invalide | non-capability-only `true -> true` dérivant `EDIT_INPUT_REPLACED`, identité ou prochain draft invalide        | `unavailable` corr.    | remplacer toutes les entrées détenues en propre, supprimer les contrôles et signaler l'échec courant exact                                                                    |
| tout état vivant, `true` précédent       | changement d'entrée `true -> false` dérivant l'événement de sortie exclusif changé/inchangé                   | non-édition classifiée | remplacer toutes les entrées détenues en propre, réconcilier les contrôles, retirer la projection d'édition/invalide et déléguer le focus retiré                              |
| tout état vivant, `false` précédent      | non-capability-only `false -> false` dérivant `DISPLAY_INPUT_REPLACED`                                        | non-édition classifiée | remplacer toutes les entrées détenues en propre, réconcilier les contrôles, fermer les détails obsolètes et appliquer les règles de focus de remplacement                     |
| tout état vivant                         | `PARENT_CALLBACK_FULFILLED` ou `PARENT_CALLBACK_FAILED` corrélé, correspondance exacte et `consumed=false`    | identique              | marquer l'enregistrement comme consommé et insérer son unique diagnostic ; ne jamais projeter de succès                                                                       |
| tout état vivant                         | `PARENT_CALLBACK_FULFILLED` ou `PARENT_CALLBACK_FAILED`, inconnu, discordant ou déjà consommé                 | identique              | `STALE_CALLBACK_SETTLEMENT` ; no-op exact, aucun effet d'enregistrement/diagnostic/rappel/DOM/focus                                                                           |
| tout état vivant                         | toute paire événement/état/guard d'UI non acceptée ci-dessus                                                  | identique              | rejet typé ; no-op exact sans effet de rappel, de focus ou de snapshot                                                                                                        |
| tout état vivant                         | `COMPONENT_DESTROYED`                                                                                         | `terminal`             | nettoyage imbriqué : confiner le port de focus synchrone ; finally tenter la libération du bail ; finally terminal/suppression                                                |
| `terminal`                               | tout événement, y compris un règlement tardif de rappel                                                       | `terminal`             | consommer/ignorer ; aucun effet de rappel, minuteur, registre, DOM ou focus                                                                                                   |

L'audit d'événements en monde clos (closed-world) pour ces octets exacts est exhaustif :

| Famille d'événements                                            | Couverture exhaustive de la table                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `EXPERIENCE_INPUT_CHANGED`                                      | capability-only ; false->true valide/invalide ; true->true valide/invalide ; exclusif true->false ; false->false non-cap |
| `EXPERIENCE_PRESENTATION_CHANGED`, `CALLBACK_REFERENCE_CHANGED` | une auto-transition vivante                                                                                              |
| événements d'UI toggle/edit/delete/save/cancel                  | chaque ligne acceptée plus la ligne explicite d'UI non autorisée                                                         |
| `PARENT_CALLBACK_FULFILLED`, `PARENT_CALLBACK_FAILED`           | ligne de corrélation exacte non consommée plus ligne obsolète explicite inconnue/discordante/consommée                   |
| `COMPONENT_DESTROYED`                                           | une transition terminale vivante                                                                                         |
| tout événement après `terminal`                                 | rattrapage (catch-all) terminal                                                                                          |

Aucun autre événement externe n'appartient à l'union déclarée. Une valeur échouant au décodeur strict d'événements n'atteint jamais la machine et produit `EVENT_NOT_ALLOWED` avec les mêmes garanties exactes de no-op.

« Non-édition classifiée » utilise uniquement les règles 1, 2, 6 et 7 du classificateur initial car le décodeur a déjà prouvé que `next.isEditing=false`. La ligne de sortie `true -> false` est exclusive et précède toute ligne de non-édition générique ; elle ne peut jamais exécuter en plus `DISPLAY_INPUT_REPLACED`. La ligne `false -> false` exclut explicitement une entrée d'édition préalable.

Pour `true -> true`, la propriété est évaluée uniquement par rapport aux prochaines copies détenues en propre : `nextDraft !== null && nextDraft.id === nextExperience.id` ; la validité de l'identité est ensuite appliquée avant la projection de l'édition. Un remplacement d'identité/propriété valide reste/récupère toujours vers `editing`, même après un draft invalide et même lorsque l'ID d'expérience change. Un remplacement avec le même ID conserve un contrôle d'édition focalisé toujours connecté. La récupération, le remplacement avec un ID différent ou la suppression du contrôle d'édition focalisé délègue vers le nouveau champ `Titre du poste`, avec repli vers le nouvel article, uniquement lorsque la carte possédait le focus. Un remplacement invalide focalise l'article résultant uniquement lorsque le contenu d'édition supprimé détenait le focus.

Les résultats de syntaxe/collision de réservation sont consommés uniquement par le classificateur initial synchrone ; il n'existe pas d'événement de rejet d'identité public ou tardif susceptible de rendre orphelin un bail gagnant. Tout remplacement accepté de signature d'expérience de non-édition non limité aux capacités (non-capability-only) ferme une région développée avant de projeter le contenu modifié. Aucune transition n'attend de texte libre, d'animation, d'achèvement réseau ou de LLM.

## Contrat DOM requis

Chaque état non terminal rend exactement une carte externe avec :

```text
role="article"
aria-label=cardName
tabindex="-1"
```

Le nom de l'article provient toujours du snapshot `experience` validé, jamais du draft d'édition mutable. Ce contrat d'article exact subsiste dans `editing` et `unavailable` ; le mode édition ne lui substitue pas un conteneur de formulaire sans nom. Le `tabindex` n'ajoute aucun point d'arrêt séquentiel au clavier et existe uniquement comme repli déterministe pour le focus programmatique.

### `display.collapsed` et `display.expanded`

Exactement un bouton natif détient l'expansion des détails et comporte :

```text
aria-label=toggleName
aria-expanded="false" | "true"
aria-controls=detailsId
```

Le résumé titre/entreprise/date peut demeurer à l'intérieur de ce bouton. L'édition et la suppression sont des boutons natifs distincts et n'héritent jamais d'`aria-controls`, ne produisent pas `TOGGLE_REQUESTED` et ne modifient pas l'expansion de cette carte/la carte courante/une autre carte. Chaque bouton de mutation n'existe que si son rappel correspondant existe et est désactivé/non focalisable tant que `isBusy=true`. `isBusy` ne désactive, ne clique ni ne bascule jamais implicitement le bouton de détails.

Dans `display.expanded`, exactement un élément contrôlé visible existe :

```text
id=detailsId
role="region"
aria-label=regionName
```

Il contient la description non vide normalisée et chaque badge de compétence normalisé. Dans `display.collapsed`, aucun élément avec `id=detailsId` n'existe.

### `editing`

Le même article nommé contient exactement un formulaire d'édition alimenté par le draft valide. Aucun basculeur de détails obsolète, `aria-expanded`, `aria-controls` ou région de détails n'est présent. Sauvegarder et annuler sont des contrôles exclusifs du formulaire d'édition ; un pointeur, Entrée ou Espace sur l'un d'eux ne peut produire que son intention d'édition correspondante et ne peut jamais basculer cette expérience ni une autre. Un contrôle de sauvegarde/annulation n'existe qu'avec son rappel correspondant et est désactivé/non focalisable en cours d'occupation (busy). La carte transmet exactement le candidat fusionné immuable validé à `onSave` et transmet l'annulation à `onCancelEdit` ; l'accomplissement/l'échec de rappel ne sélectionne jamais une transition.

### `unavailable`

Le résumé validé est un élément non interactif, jamais un bouton ni un producteur de `TOGGLE_REQUESTED`. Il n'existe aucun élément avec `aria-expanded`, `aria-controls` ou `id=detailsId`.

Pour `unavailable.no_details`, les boutons d'édition/suppression détenus séparément utilisent la même règle fermée que l'affichage : chacun existe si et seulement si son rappel correspondant existe, est désactivé/non focalisable en cours d'occupation, et une activation acceptée transmet exactement un rappel sans argument. Le résumé non interactif ne reçoit jamais cette activation.

Les motifs d'édition invalide, de discordance de propriétaire de draft et d'identité ont une seule projection : le résumé validé nommé non interactif demeure, chaque contrôle de basculement/édition/suppression/formulaire/sauvegarde/annulation est supprimé, et l'échec d'intégration typé est signalé. La déduplication exactement une fois de la clé de diagnostic immuable s'applique uniquement au rejet d'identité, en utilisant la clé définie dans Identité de la région contrôlée. `INVALID_EDIT_INPUT` et `DRAFT_OWNER_MISMATCH` sont signalés une fois pour chaque classification initiale acceptée ou transition `EXPERIENCE_INPUT_CHANGED` qui entre ou demeure dans ce motif ; un rerender sans événement d'entrée ne signale rien, et il n'y a aucune revendication de déduplication entre transitions. « Désactivé au lieu de supprimé » n'est pas une option d'implémentation. La carte ne prétend jamais que l'édition a réussi.

`terminal` ne rend aucun article, contrôle ou région.

## Clavier, détention et délégation du focus

Le basculeur natif associe une activation par pointeur, une activation par Entrée ou une activation par Espace à exactement un `TOGGLE_REQUESTED` corrélé au propriétaire. L'expansion et le repli ne déplacent pas le focus : si le basculeur reste connecté, il conserve le focus.

Tant qu'elle est connectée, la carte ne détient le focus que lorsque `document.activeElement` est l'article ou l'un de ses descendants. Une transition qui retire le nœud ayant le focus doit déléguer exactement une fois après la validation (commit) DOM de remplacement et au plus tard lors de la prochaine mise à jour Svelte :

| Cause de suppression                                                                        | Cible déterministe                                                                                                  |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| repli alors que le focus est dans la région de détails                                      | le basculeur toujours connecté de cette carte                                                                       |
| remplacement de même expérience retirant le basculeur ou l'enfant de détails ayant le focus | l'article externe de cette carte                                                                                    |
| remplacement avec un `experience.id` différent                                              | l'article externe de la carte de remplacement ; le focus n'est jamais transféré silencieusement à son basculeur     |
| entrée dans `editing`                                                                       | le champ d'édition libellé `Titre du poste`, ou l'article externe si ce champ exact est désactivé/indisponible      |
| récupération d'une édition invalide vers `editing`                                          | le champ d'édition récupéré libellé `Titre du poste`, ou l'article externe si indisponible                          |
| remplacement avec même ID tout en restant dans `editing`                                    | conserver un contrôle d'édition connecté ayant le focus ; sinon le champ `Titre du poste`, puis repli sur l'article |
| remplacement avec ID différent tout en restant dans `editing`                               | le champ d'édition de remplacement libellé `Titre du poste`, puis repli sur l'article                               |
| sortie de `editing`                                                                         | l'article externe résultant                                                                                         |
| transition d'entrée invalide vers `unavailable`                                             | l'article externe résultant                                                                                         |
| `hasOnEdit/hasOnDelete: true -> false` en display/no-details avec son bouton focalisé       | l'article externe de cette carte                                                                                    |
| `isBusy: false -> true` en display/no-details avec edit/delete focalisé                     | l'article externe de cette carte                                                                                    |
| `hasOnSave/hasOnCancelEdit: true -> false` en editing avec son contrôle focalisé            | `Titre du poste` lorsqu'il est activé, sinon l'article externe de cette carte                                       |
| `isBusy: false -> true` en editing avec save/cancel focalisé                                | `Titre du poste` lorsqu'il est activé, sinon l'article externe de cette carte                                       |
| `COMPONENT_DESTROYED`                                                                       | cible de sortie détenue par le parent sélectionnée avant la déconnexion                                             |

La réconciliation des capacités calcule chaque contrôle à partir du nouveau tuple avant la délégation du focus. Ajouter un rappel, effacer l'état occupé (busy), remplacer une référence de rappel ou modifier un contrôle non focalisé ne déplace jamais le focus. Si une transition simultanée d'état/entrée et un changement de capacité retirent tous deux le nœud focalisé, la délégation a lieu exactement une fois selon cette priorité : cible de destruction ; cible d'édition/remplacement/indisponible ; cible de capacité seule. Le règlement d'un rappel ne déplace jamais le focus.

Ajouter, retirer ou remplacer `onFocusExitRequest` tant que la carte reste vivante ne déplace pas le focus ; la dernière référence décodée est la seule consultée lors de la destruction. Lorsque la destruction détient le focus, ce port demande au parent de sélectionner la première cible connectée dans cet ordre exact : article d'expérience suivant par position de rendu ascendante, article d'expérience précédent, `Ajouter une expérience`, puis l'en-tête de la page CV avec `tabindex=-1`. Basculer par défaut sur `document.body`, deviner un sélecteur CSS ou laisser le focus sur un nœud déconnecté produit le diagnostic confiné de cible manquante. Aucun résultat de focus ne peut modifier l'expansion de cette carte ou d'une autre carte.

La destruction est un effet de nettoyage imbriqué non interruptible :

```text
try:
  if card owns focus: invoke/validate latest onFocusExitRequest once
catch:
  confine focus-port failure (never rethrow)
finally:
  try:
    release_details_id when this owner holds a reserved lease
    confine release mismatch/throw (never rethrow)
  finally:
    enter terminal
    remove the card subtree
```

L'absence du port de focus, une exception levée, un thenable, un résultat invalide, une cible manquante, un échec de rapport de diagnostic ou un échec de libération ne peuvent pas contourner le `finally` interne. La libération du bail est tentée quel que soit le résultat du focus, et terminal/suppression a lieu quel que soit le résultat de la libération. Le port de focus est synchrone et ne prolonge jamais la destruction au-delà du tour de nettoyage courant.

## Convergence sémantique et animation

Pour chaque transition acceptée, l'état de la machine, `aria-expanded`, le nom du basculeur et la présence de la région contrôlée sont validés (commit) atomiquement en une seule mise à jour DOM Svelte. À aucun moment après cette validation `aria-expanded=true` ne peut exister sans la région exacte, ou la région exister alors qu'`aria-expanded=false`.

Une transition visuelle peut se poursuivre après la validation sémantique, mais elle ne peut pas conserver de doublon accessible obsolète, émettre d'événement d'état ou être attendue en tant qu'autorité de transition. Il n'existe pas d'état `transitioning`, pas de dépendance à `transitionend` et aucun état intermédiaire indéfini. La délégation de focus est bornée comme indiqué ci-dessus.

## Effets et erreurs

Les effets autorisés sont fermés :

```text
project_card_semantics
project_toggle_semantics
mount_exact_details_region
unmount_exact_details_region
reserve_details_id
release_details_id
reconcile_interaction_controls
validate_save_payload
construct_immutable_save_candidate
forward_parent_edit_intent
forward_parent_delete_intent
forward_parent_save_intent
forward_parent_cancel_intent
confine_parent_callback_result
record_callback_diagnostic
focus_owned_target
invoke_sync_focus_exit_port
validate_sync_focus_exit_result
run_nested_destroy_cleanup
report_contract_failure
```

Les échecs typés sont :

```text
INVALID_EDIT_INPUT          isEditing=true with draft=null
DRAFT_OWNER_MISMATCH        draft.id !== experience.id
INVALID_DETAILS_ID          suffix/full ID violates exact regex or bounds
DETAILS_ID_COLLISION        two live instances publish the same detailsId
DETAILS_ID_RELEASE_MISMATCH reserved destroy no longer owns the registry entry
DETAILS_ID_RELEASE_FAILED   registry release effect throws unexpectedly
FOREIGN_TOGGLE_OWNER        event owner differs from mounted instance suffix
TOGGLE_UNAVAILABLE          toggle event received outside display states
EVENT_NOT_ALLOWED           UI event/state/guard pair absent from the accepted table
STALE_EDIT_INTENT           save/cancel arrives outside editing
MUTATION_INTENT_BUSY        edit/delete/save/cancel arrives while busy
INTENT_HANDLER_MISSING      requested callback is absent
INVALID_SAVE_PAYLOAD        save form fails the exact closed validator
PARENT_CALLBACK_THROW       accepted callback throws synchronously
PARENT_CALLBACK_REJECTED    accepted callback rejects asynchronously
INVALID_CALLBACK_RESULT     primitive/null return or assimilation fulfills non-undefined
STALE_CALLBACK_SETTLEMENT   settlement is unknown, mismatched or already consumed
FOCUS_EXIT_PORT_MISSING     focused destruction has no callback reference
FOCUS_EXIT_PORT_THROW       focus callback throws synchronously
FOCUS_EXIT_ASYNC_RETURN     focus callback returns an object/function with callable then
FOCUS_EXIT_RESULT_INSPECTION_FAILED reading returned object.then throws
INVALID_FOCUS_EXIT_RESULT   focus callback return is outside exact enum/null
FOCUS_EXIT_TARGET_MISSING   parent cannot supply any ordered destruction target
CONTRACT_DIAGNOSTIC_FAILED  diagnostic reporting throws during destroy cleanup
```

`STALE_EDIT_INTENT`, `MUTATION_INTENT_BUSY`, `INTENT_HANDLER_MISSING`, `EVENT_NOT_ALLOWED`, `FOREIGN_TOGGLE_OWNER`, `TOGGLE_UNAVAILABLE` et `STALE_CALLBACK_SETTLEMENT` sont des no-ops typés exacts : aucun effet de rappel, de focus, de snapshot ou de DOM. De plus, `STALE_CALLBACK_SETTLEMENT` n'insère aucun diagnostic et ne modifie aucun enregistrement de règlement. Les échecs d'intégration ne basculent jamais, ne persistent rien, n'invoquent pas de LLM et ne mutent pas d'entrée. Les défaillances de contrat sont des diagnostics déterministes ; aucun libellé d'erreur visible en texte libre ne sélectionne une récupération. Les échecs de rappel et de libération sont confinés et consommés comme spécifié ; aucun ne peut s'échapper de la frontière du composant.

Chaque résultat `FOCUS_EXIT_*`, `INVALID_FOCUS_EXIT_RESULT` et `CONTRACT_DIAGNOSTIC_FAILED` est confiné à l'intérieur du `try/catch` externe de destruction ; chaque résultat `DETAILS_ID_RELEASE_*` est confiné à l'intérieur du `try/finally` interne. Aucun ne peut annuler la tentative de libération du bail, l'entrée en état terminal ou la suppression du sous-arbre.

### Audit fermé des sorties

| Famille de sorties                                 | Unique port/effet autorisé                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| DOM de carte/basculeur/région/édition              | effets de projection/montage/démontage nommés                                                                           |
| intention parent d'édition/suppr/sauvegarde/annul  | quatre derniers rappels métier via le confinement de rappel asynchrone                                                  |
| focus conservé/délégué au sein de la carte vivante | références d'éléments détenus en propre via `focus_owned_target`                                                        |
| focus quittant une carte détruite                  | dernier `onFocusExitRequest` explicite via le port fermé synchrone ; aucune alternative d'événement/promesse/LLM        |
| propriété de l'identité                            | `reserve_details_id` / `release_details_id` scopé au document avec le token du propriétaire                             |
| diagnostics                                        | `report_contract_failure` / enregistrements de diagnostics de rappel ; échecs confinés et jamais autorité de transition |
| destruction                                        | un effet de nettoyage imbriqué se terminant par terminal/suppression                                                    |

Il n'existe pas d'événement `FOCUS_EXIT_REQUESTED`, de dispatcher implicite, de recherche globale ou de sortie en texte libre. La disponibilité/référence de chaque rappel externe est décodée dans le chemin de signature/référence d'entrée, et aucune sortie en dehors de cette table n'est licite.

## Invariants

1. Chaque carte non terminale expose exactement un article nommé d'après son expérience validée immuable ; l'état terminal n'en expose aucun.
2. Seuls `display.collapsed`/`display.expanded` exposent un basculeur natif corrélé au propriétaire. `editing` et `unavailable` n'en exposent aucun.
3. Au plus une région de détails existe par carte. Un `aria-controls` vivant résout vers celle-ci exactement lorsque `aria-expanded=true`.
4. Chaque ID contrôlé correspond au contrat ASCII exact de 23..86 caractères, est soutenu par un bail de propriétaire vivant et est libéré par ce propriétaire lors de la destruction ; une collision n'écrase ni ne libère jamais le gagnant.
5. Tout changement accepté de signature d'expérience de non-édition non limité aux capacités (non-capability-only) ou sortie d'édition commence replié lorsque des détails subsistent ; les changements de capacité seule préservent l'expansion.
6. `isEditing=true` sans un draft de même propriétaire ne peut pas rendre de contrôles d'affichage ou d'édition et doit échouer en repli sécurisé (fail-closed) avec l'unique projection `unavailable` à contrôles supprimés.
7. Les événements d'édition, suppression, sauvegarde, annulation, d'occupation (busy) et de carte tierce ne basculent jamais la carte courante ni aucune autre carte.
8. Un nœud ayant le focus qui est retiré dispose exactement d'une cible de focus déterministe et bornée ; le focus lors de la destruction appartient au parent via la dernière référence synchrone `onFocusExitRequest`.
9. Les requêtes sur le texte visible, l'ascendance DOM extérieure à l'article nommé, l'ordre des cartes, l'état CSS, les rappels d'animation, les minuteurs, le stockage, les résultats réseau et la sortie d'un LLM ne décident jamais d'une transition.
10. La molécule n'importe aucun module d'état, n'effectue aucune I/O de persistance/réseau et ne mute jamais `Experience` ou `skills`.
11. Chaque `EXPERIENCE_INPUT_CHANGED` est traité par exactement l'une des quatre règles ordonnées de paires d'édition ; `true -> true` remplace toujours les snapshots détenus en propre et peut récupérer d'une édition invalide, et `true -> false` ne prend jamais en plus la règle d'affichage générique.
12. Chaque événement d'UI non autorisé est un no-op typé exact. Un rappel parent autorisé est transmis exactement une fois et uniquement depuis sa paire état/guard acceptée.
13. L'état occupé (busy) et l'ensemble des cinq valeurs de disponibilité de rappel font partie de la signature d'entrée exacte. Retirer/désactiver un contrôle focalisé délègue le focus une fois ; le changement seul de disponibilité/référence du port de focus et chaque ajout de capacité ne déplacent rien.
14. Un gestionnaire de sauvegarde ne reçoit que le candidat immuable validé et explicitement fusionné ; tous les champs du draft extérieurs au formulaire sont conservés et aucun déversement (spread) de payload, ID généré ou horodatage généré n'est autorisé.
15. L'accomplissement d'un rappel ne projette jamais de succès. Chaque exception levée/rejet est consommé dans un diagnostic d'invocation typé et l'état ne change qu'à partir d'un remplacement d'entrée autoritaire ultérieur.
16. Chaque rejet d'identité possède une clé immuable contenant la raison exacte et le details ID, est signalé exactement une fois, et une destruction réservée libère le bail exactement une fois.
17. Un règlement corrélé n'est accepté que tant que son enregistrement exact est non consommé, le consomme de manière atomique et insère un diagnostic. Les événements de règlement inconnus, discordants et rejoués sont des no-ops exacts obsolètes.
18. Les valeurs de retour de sortie de focus ne décident jamais de l'état. Le port est appelé au plus une fois uniquement pour une destruction détenant le focus, n'est jamais attendu/assimilé, et chaque résultat absent/levée d'exception/thenable/invalide/null est typé et confiné.
19. `COMPONENT_DESTROYED` tente toujours la libération du bail détenu dans `finally` et entre toujours dans `terminal`/retire le sous-arbre dans un `finally` imbriqué, quels que soient les résultats du port de focus, des diagnostics, d'une discordance de libération ou d'une levée d'exception lors de la libération.

## Contrat préservé du point de contrôle A3 empaqueté

La révision 6 préserve et renforce le contrat empaqueté exact A3. Après le rechargement de l'expérience sauvegardée, le scénario empaqueté ne peut résoudre que :

```text
role=article, nom accessible="Expérience Lead Packaged UI chez MissionPulse QA"
nom accessible du basculeur="Afficher les détails de l’expérience Lead Packaged UI"
basculeur aria-expanded=false -> true après exactement un clic
basculeur aria-controls=<detailsId unique et stable correspondant à la regex bornée exacte>
rôle contrôlé=region, nom accessible="Détails de l’expérience Lead Packaged UI"
compétences Svelte, TypeScript et Playwright scopées à l'intérieur de cette région contrôlée
```

L'action ne doit pas utiliser l'index de carte, `nth`, l'ascendance DOM extérieure à l'article nommé, une classe CSS, la position en pixels ou une supposition basée sur le texte visible. La même instance montée conserve l'ID contrôlé exact tout au long de l'action.

## Revue indépendante et scénarios RED

L'implémentation reste interdite jusqu'à ce qu'un réviseur indépendant recalcule le hachage et approuve ces octets exacts de la révision 6. L'implémentation doit ensuite débuter par des tests en échec pour :

1. l'article exact empaqueté A3, le basculeur replié, l'ID contrôlé borné, l'expansion en un clic, la région nommée correspondante et les trois compétences scopées ;
2. le repli retirant atomiquement la région exacte tandis que le basculeur conserve le focus ;
3. le pointeur, Entrée et Espace produisant chacun exactement une transition ;
4. deux cartes simultanées recevant des ID distincts correspondant à la regex complète et aux bornes de 23..86 ;
5. suffixe invalide/trop grand/non-ASCII et collision directe échouant en repli sécurisé (fail-closed) sans assainissement ni sémantique de bascule ;
6. valeurs de repli pour titre/entreprise composés uniquement d'espaces et détails composés uniquement d'espaces produisant `unavailable.no_details` avec un résumé non interactif ;
7. `isEditing=true` sans draft et avec un draft de mauvais propriétaire produisant chacun l'état indisponible typé, jamais une carte semi-éditée/d'affichage ;
8. l'entrée en édition retirant la sémantique développée obsolète, conservant l'article nommé et déléguant le focus détenu à `Titre du poste` ;
9. les sorties d'édition modifiées et inchangées prenant chacune exactement une règle de sortie exclusive, jamais la règle d'affichage générique, et renvoyant collapsed/unavailable avec le focus sur l'article ;
10. chaque cas `true -> true` : remplacement d'édition valide avec même ID, remplacement valide avec ID différent, draft invalide, propriétaire invalide et récupération d'invalide à valide avec snapshots détenus et focus exacts ;
11. remplacement immuable et changements de signature élément par élément émettant un événement d'entrée, sans chemin de mutation sur place ;
12. remplacement en état développé retirant les détails obsolètes, préservant l'ID monté et appliquant les règles de focus exactes pour une expérience identique/différente ;
13. contrôles d'édition/suppression sans détails transmettant exactement un rappel lorsqu'ils sont présents/activés et ne produisant aucun basculement ;
14. sauvegarde/annulation obsolète/occupée/avec gestionnaire manquant ainsi que tout autre événement d'UI non autorisé produisant son no-op typé exact sans rappel ;
15. convergence de l'état, du nom du basculeur, d'`aria-expanded` et de la présence de région en une mise à jour DOM même si l'animation visuelle continue ;
16. destruction avec focus détenu déléguant à travers les cibles ordonnées exactes du parent, et destruction sans focus détenu ne déplaçant rien ;
17. terminal ignorant tous les événements tardifs et ne laissant aucun article ni région contrôlée ;
18. chaque booléen de présence de rappel et `isBusy` entrant dans la signature exacte ; le retrait de rappel et `isBusy:false -> true` délèguent chacun un contrôle focalisé une fois sans replier les détails développés, tandis que l'ajout de capacité ne déplace rien ;
19. remplacement de référence de rappel avec un tuple par ailleurs égal émettant un `CALLBACK_REFERENCE_CHANGED`, conservant focus/état et utilisant uniquement le nouveau gestionnaire sur l'intention suivante ;
20. `ExperienceFormData` valide construisant chaque champ éditable, préservant l'ensemble des cinq champs du draft extérieurs au formulaire et prouvant que le candidat et ses compétences sont gelés sans référence survivante au payload ;
21. rejet de payload de sauvegarde pour mauvais prototype, clé de chaîne manquante/supplémentaire, clé symbol, propriété accesseur, propriété non énumérable, mauvais type, mois invalide et piège de Proxy levant une exception ; plus `isCurrent=true/endDate!=null` focalisant `Poste actuel` (repli sur l'article), conservant l'état d'édition et n'invoquant aucun gestionnaire de sauvegarde ;
22. rappel `undefined`, thenable accompli, exception synchrone levée, thenable rejeté, accomplissement non-void, getter `then` hostile levant une exception et thenable appelant fulfill/reject plusieurs fois ; chacun se règle une fois sans faux succès, nouvelle tentative ni rejet non géré, y compris après destruction ;
23. un règlement corrélé passant `consumed:false -> true` et insérant un diagnostic, puis rejeu identique, ID inconnu et résultat discordant produisant tous des no-ops exacts `STALE_CALLBACK_SETTLEMENT` sans double enregistrement ;
24. succès/idempotence/collision de réservation d'identité, un diagnostic par instance rejetée avec champs de clé exacts, préservation du gagnant, libération par le propriétaire lors de la destruction et discordance de propriétaire de libération ne supprimant jamais une entrée étrangère ;
25. `hasOnFocusExitRequest` et sa référence entrant dans le décodeur fermé ; le retrait/ajout de disponibilité et le remplacement de référence ne déplacent aucun focus vivant, et une destruction avec focus appelle uniquement la dernière référence une fois ;
26. destruction avec focus avec port absent, exception synchrone levée et résultat `null` produisant respectivement des diagnostics de port manquant/exception levée/cible manquante tout en libérant le bail du propriétaire et en atteignant terminal/suppression ;
27. port de focus renvoyant un thenable, un primitif/objet invalide et un objet avec un getter `then` hostile levant une exception produisant leurs erreurs confinées exactes sans `Promise.resolve`, await ou souscription ;
28. discordance de propriétaire de libération, exception levée lors de la libération et exception levée lors du rapport de diagnostic prouvant chacune que le nettoyage imbriqué tente toujours la libération exactement une fois là où elle est détenue, ne supprime jamais un bail étranger, et atteint toujours terminal/suppression ; plus la destruction sans focus prouvant que le port de focus n'est jamais appelé.

La vérification exige des tests de composants ciblés, des tests de transition/invariants, des tests de registre d'identité, de confinement de rappel et de port de focus parent, des contrôles TypeScript/Svelte et le point de contrôle A3 empaqueté utilisant uniquement le contrat accessible ci-dessus.
