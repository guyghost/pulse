# File d'arrivée des missions et modèle de présentation du Feed

Statut : **RÉVISION DU MODÈLE 3 — APPROUVÉ POUR IMPLÉMENTATION**.

Revue indépendante à froid : **APPROUVÉE** le 2026-07-16 pour le hash de comportement
`01d08395fd5cf7446b36032493d414deb0f543415b4537007e811ce3a0fe8e4d`.

Ce modèle possède trois comportements du Feed :

1. l'action principale unique pour les états de Feed loading, empty, error et loaded ;
2. l'appartenance stable de la file **Nouvelles** pendant que les missions deviennent vues ; et
3. l'application explicite des missions reçues par un panneau monté à chaud (warm).

L'acteur est local et éphémère. IndexedDB, écrit et lu uniquement par le
service worker, constitue le catalogue de missions durable. L'acteur possède l'état
de présentation, les corrélations et l'autorisation synchrone ; il ne possède aucune donnée durable.
Aucun composant, texte libre ou LLM ne décide d'une transition.

## Périmètre et responsabilités

| Préoccupation                                               | Propriétaire                                |
| ----------------------------------------------------------- | ------------------------------------------- |
| Scan accepté, annulation et commit durable du catalogue     | `scan-lifecycle.model.md` et service worker |
| Objets mission canoniques                                   | Service worker sur IndexedDB                |
| Catalogue de Feed visible actuel                            | Feed store dans le panneau monté            |
| Transitions d'action Feed, de file et d'application (apply) | Réducteur Core pur défini ici               |
| Appels bridge, écritures Feed, cache d'aperçu et effets DOM | Shell du panneau                            |

Seules les publications issues des alarmes en arrière-plan empruntent le chemin d'arrivée. Un démarrage manuel (Start) ou
une nouvelle tentative (Retry) constitue un consentement explicite à remplacer le Feed : le scan qu'il possède projette son
résultat terminal directement via la façade/bridge. Il ne distribue jamais
`ALARM_MISSIONS_RECEIVED` et ne crée jamais de tiroir (tray).

Fermer le panneau ou quitter le Feed détruit l'acteur et abandonne sa présentation
optionnelle `+N`. Lors d'un remontage, `smartLoad()` demande le catalogue actuel
via la façade/bridge. Le panneau n'importe jamais l'adaptateur IndexedDB.

Sont hors du périmètre de ce modèle : les tampons d'arrivée durables, les journaux d'application,
la réconciliation après redémarrage, l'exécution des connecteurs, le scoring, la recherche, les facettes,
les favoris et le suivi de candidatures.

## Acteur sérialisé et commit de Feed indivisible

L'acteur d'arrivée et son adaptateur de Feed partagent une FIFO synchrone et non réentrante.
Les événements externes, les résultats du bridge, le travail des abonnés et les dispatches
réentrants sont mis en file d'attente ; une commande est réduite jusqu'à son achèvement avant que la suivante ne commence.

L'hydratation à froid (cold) et l'application préparée (Apply) utilisent une section critique Shell spéciale. Elle
exécute, sans céder l'exécution : une garde pure finale ; une écriture synchrone préparée (staged) dans le Feed ;
une transition de succès d'acteur inline (l'ACK interne) ; puis la publication auprès des abonnés Svelte.
Aucun callback, abonné, gestionnaire de bridge ou dispatch imbriqué ne s'exécute
entre la garde, l'écriture et l'ACK. Un dispatch imbriqué est uniquement mis en file pour la commande FIFO
suivante. Si la garde, la préparation (staging) ou le commit de l'acteur échoue, l'adaptateur annule
l'étape préparée, préserve le Feed précédent et réduit l'échec correspondant inline.
Ce n'est qu'après la fermeture de la section critique que les callbacks des abonnés peuvent observer le
nouveau Feed et empiler du travail. Les prochaines révisions de feed/scope requises sont précalculées ;
l'épuisement des entiers sûrs échoue avant de préparer toute écriture.

## Présentation totale du Feed

```ts
type FeedState = 'empty' | 'loading' | 'loaded' | 'error';
type OwnedActiveScanState = 'starting' | 'scanning' | 'retrying' | 'persisting' | 'cancelling';

interface FeedPresentationFacts {
  feedState: FeedState;
  ownedScan: { operationId: string; state: OwnedActiveScanState } | null;
  networkOnline: boolean;
}

type FeedPresentation =
  | { value: 'loading'; primaryAction: 'cancel'; actionEnabled: boolean; arrivalCompatible: false }
  | { value: 'empty'; primaryAction: 'start'; actionEnabled: boolean; arrivalCompatible: false }
  | { value: 'error'; primaryAction: 'retry'; actionEnabled: boolean; arrivalCompatible: false }
  | { value: 'loaded'; primaryAction: 'start'; actionEnabled: boolean; arrivalCompatible: true }
  | { value: 'inconsistent'; primaryAction: null; actionEnabled: false; arrivalCompatible: false };

declare function deriveFeedPresentation(facts: Readonly<FeedPresentationFacts>): FeedPresentation;
```

| Faits                            | Projection     | Action principale unique                           |
| -------------------------------- | -------------- | -------------------------------------------------- |
| `loading` plus un scan possédé   | `loading`      | Cancel ; désactivé uniquement pendant `cancelling` |
| `empty` plus aucun scan possédé  | `empty`        | Start ; désactivé hors ligne                       |
| `error` plus aucun scan possédé  | `error`        | Retry ; désactivé hors ligne                       |
| `loaded` plus aucun scan possédé | `loaded`       | Start ; désactivé hors ligne                       |
| Tout autre n-uplet               | `inconsistent` | Aucune ; fail-closed (échec sécurisé)              |

`ownedScan` ne représente jamais un scan d'alarme non observé. Les composants consomment cette
projection et ne doivent pas reproduire ses conditions.

`presentationRevision` commence également à `-1`. Les événements de faits de Feed sont acceptés uniquement
pour une révision d'entier sûr non négatif strictement supérieure à la valeur stockée ; toute
révision antérieure, égale ou non sûre est un no-op exact.

## Protocole de révision du périmètre (scope)

La Page publie le périmètre en attente complet chaque fois que les sources activées ou
les identifiants visibles du Feed changent :

```ts
interface PendingScopeFacts {
  enabledSources: ReadonlySet<MissionSource>;
  feedRevision: number;
  orderedVisibleFeedIds: readonly string[];
  visibleFeedIds: ReadonlySet<string>;
}
```

`scopeRevision` commence à `-1`. Le premier événement valide
`PENDING_SCOPE_CHANGED` possède la révision `0` ; chaque événement de périmètre accepté ultérieurement possède un
entier sûr non négatif strictement supérieur à la révision stockée. Les révisions égales,
plus anciennes, non sûres ou incomplètes sont des no-ops exacts. L'adaptateur sérialisé
est l'unique allocateur de révision : il estampille une nouvelle révision de périmètre pour chaque
changement factuel de périmètre et ne peut pas muter un ensemble publié. `feedRevision` est également
un entier sûr monotone ; il s'incrémente exactement lorsque l'appartenance ordonnée du Feed est
committée. Un changement de périmètre portant uniquement sur les sources le préserve. `visibleFeedIds` doit être égal
à l'ensemble des `orderedVisibleFeedIds` uniques.

Un événement de périmètre accepté ne peut pas diminuer `feedRevision`. Une révision de Feed égale
exige des identifiants ordonnés identiques élément par élément ; des identifiants ordonnés modifiés exigent
une révision de Feed supérieure. Toute non-concordance est un no-op exact.

Chaque `ALARM_MISSIONS_RECEIVED` transporte la révision qu'il a observée. Il est
accepté uniquement lorsque cette révision est exactement la révision actuelle de l'acteur. Core
filtre toujours à l'aide de ses faits de périmètre immuables stockés, jamais avec les ensembles fournis
par l'alarme. Cela rend obsolète une alarme basée sur une vue connecteur/Feed plus ancienne plutôt
que de redéfinir implicitement le périmètre.

## Routage des publications d'alarme

Après qu'un scan d'alarme a committé dans IndexedDB, le service worker publie un
message `projection: 'cold-only'` avec les objets mission. L'entrée (ingress) synchrone du panneau
mappe ces objets vers des candidats purs. L'adaptateur d'acteur/commit de Feed
ne retient les entrées de commit canoniques que pour la durée de ce tour d'ingress. Au
cours du même tour, le Shell peut projeter séparément ces objets typés dans le
cache d'aperçu non autoritatif défini ci-dessous. Un objet d'aperçu mis en cache peut
restituer un identifiant autorisé par l'acteur, mais ne peut jamais autoriser ni fournir une écriture dans le Feed ;
Apply résout toujours son candidat canonique complet via le service
worker.

```ts
interface ArrivalCandidate {
  id: string;
  source: MissionSource;
}

interface AlarmMissionsReceived {
  type: 'ALARM_MISSIONS_RECEIVED';
  scopeRevision: number;
  candidates: readonly ArrivalCandidate[];
}
```

Core retire les candidats provenant de sources désactivées, les identifiants déjà visibles et les identifiants
gelés par une application active, puis déduplique dans l'ordre de publication.

```ts
declare function selectPendingArrivalIds(input: {
  candidates: readonly ArrivalCandidate[];
  enabledSources: ReadonlySet<MissionSource>;
  visibleFeedIds: ReadonlySet<string>;
  excludedApplyIds: ReadonlySet<string>;
}): readonly string[];
```

| Présentation exacte à la réception                         | Routage requis                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `empty` et le store de Feed réel est vide                  | Filtrer la publication de façon pure, puis émettre `hydrate-cold-feed-sync` ; ne jamais créer d'attente |
| `loaded`                                                   | Capturer/fusionner en attente ; ne jamais remplacer les missions visibles                               |
| `loading`, `error` ou `inconsistent`                       | Ignorer pour la présentation ; les données durables restent récupérables par `smartLoad()`              |
| Toute présentation avec une révision de périmètre obsolète | No-op exact                                                                                             |

L'hydratation à froid (cold) est délibérément synchrone et n'a aucun état d'ACK dispatchable
de manière externe :

1. Core autorise d'abord la présentation empty exacte, les identifiants de Feed vides, la révision de
   périmètre actuelle et les identifiants filtrés.
2. Dans le même tour d'écoute de bridge non suspensif (sans await), le Shell résout chaque
   objet sélectionné à partir de cette même publication. Les objets manquants échouent de façon sécurisée (fail-closed).
3. Immédiatement avant l'écriture, une garde pure revérifie le cycle de vie actif, la présentation
   empty exacte, les révisions de scope/feed exactes et le Feed ordonné vide exact.
4. Le commit indivisible écrit une seule fois, avance les révisions autoritatives de feed/scope
   et les identifiants visibles inline, puis publie les faits résultants.
5. Une exception d'écriture laisse le Feed inchangé et signale une erreur.

Aucun événement ne peut s'intercaler entre la garde finale et l'écriture. Par conséquent,
deux publications cold séquentielles ne peuvent pas toutes deux emprunter la route empty : le premier
écouteur se termine avec un Feed chargé (loaded) avant que le second ne soit réduit, le
second emprunte donc la route chaude (warm).

## État et contexte

```ts
interface PendingSnapshot {
  revision: number;
  orderedIds: readonly string[];
  sourceById: Readonly<Record<string, MissionSource>>;
}

type QueueRegion =
  | { value: 'all-feed' }
  | {
      value: 'stable-queue';
      queueIds: readonly string[];
      dwells: Readonly<Record<string, number>>;
      seenInFlight: Readonly<Record<string, number>>;
      confirmedSeenIds: readonly string[];
    };

type StackRegion =
  | { value: 'empty' }
  | { value: 'collapsed'; pending: PendingSnapshot }
  | { value: 'open'; pending: PendingSnapshot; previewIds: readonly string[] }
  | {
      value: 'applying';
      applyId: number;
      applied: PendingSnapshot;
      appliedScopeRevision: number;
      baseFeedRevision: number;
      orderedBaseFeedIds: readonly string[];
      latest: PendingSnapshot | null;
      prepared: ProjectionCandidate | null;
      returnView: 'collapsed' | 'open';
      previewIds: readonly string[];
    }
  | {
      value: 'projection-error';
      pending: PendingSnapshot;
      failedApplyId: number;
      reason: ProjectionFailureReason;
      drawerOpen: boolean;
      previewIds: readonly string[];
    };

interface MissionArrivalQueueState {
  lifecycle: 'active' | 'disposed';
  presentationRevision: number;
  presentation: FeedPresentation;
  pendingRevision: number;
  applyOrdinal: number;
  seenOperationOrdinal: number;
  scopeRevision: number;
  feedRevision: number;
  enabledSources: ReadonlySet<MissionSource>;
  orderedVisibleFeedIds: readonly string[];
  visibleFeedIds: ReadonlySet<string>;
  queue: QueueRegion;
  stack: StackRegion;
}
```

L'état initial est actif avec une révision de présentation `-1`, la présentation
inconsistante, une révision d'attente (pending) `0`, des ordinaux d'application et d'opération vue `0`,
des révisions de scope/feed `-1`, des faits de périmètre ordonnés/ensembles vides, `queue='all-feed'`
et `stack='empty'`.

Chaque snapshot non vide possède des identifiants uniques non vides. Une révision de snapshot ne change
que lorsque l'appartenance ou l'ordre change. La fusion préserve l'ordre antérieur et
ajoute les identifiants réellement nouveaux dans l'ordre de publication. Le décompte et les aperçus sont dérivés
uniquement de l'appartenance actuelle au snapshot éligible.

## Événements et effets

```ts
type ProjectionFailureReason =
  'CATALOGUE_READ_FAILED' | 'CATALOGUE_INCOMPLETE' | 'FEED_WRITE_FAILED' | 'INVALID_CANDIDATE';

interface ProjectionCandidate {
  applyId: number;
  appliedRevision: number;
  scopeRevision: number;
  baseFeedRevision: number;
  orderedAllFeedIds: readonly string[];
  orderedUnseenIds: readonly string[];
}

type MissionArrivalQueueEvent =
  | { type: 'FEED_FACTS_CHANGED'; revision: number; facts: FeedPresentationFacts }
  | AlarmMissionsReceived
  | {
      type: 'PENDING_SCOPE_CHANGED';
      scopeRevision: number;
      feedRevision: number;
      enabledSources: ReadonlySet<MissionSource>;
      orderedVisibleFeedIds: readonly string[];
      visibleFeedIds: ReadonlySet<string>;
    }
  | { type: 'OPEN_STACK' }
  | { type: 'CLOSE_STACK' }
  | { type: 'APPLY_REQUESTED' }
  | { type: 'PROJECTION_PREPARED'; candidate: ProjectionCandidate }
  | {
      type: 'PROJECTION_LOAD_FAILED';
      applyId: number;
      appliedRevision: number;
      scopeRevision: number;
      baseFeedRevision: number;
      reason: 'CATALOGUE_READ_FAILED' | 'CATALOGUE_INCOMPLETE';
    }
  | {
      type: 'PROJECTION_WRITE_SUCCEEDED';
      applyId: number;
      appliedRevision: number;
      scopeRevision: number;
      baseFeedRevision: number;
    }
  | {
      type: 'PROJECTION_WRITE_FAILED';
      applyId: number;
      appliedRevision: number;
      scopeRevision: number;
      baseFeedRevision: number;
    }
  | { type: 'RETRY_REQUESTED' }
  | { type: 'ENTER_NEW_QUEUE'; orderedUnseenIds: readonly string[] }
  | { type: 'EXIT_NEW_QUEUE' }
  | { type: 'SORT_QUEUE'; orderedQueueIds: readonly string[] }
  | { type: 'DWELL_STARTED'; missionId: string; now: number }
  | { type: 'DWELL_CANCELLED'; missionId: string }
  | { type: 'DWELL_ELAPSED'; missionId: string; now: number }
  | { type: 'SEEN_PERSISTED'; missionId: string; seenOpId: number }
  | { type: 'SEEN_PERSIST_FAILED'; missionId: string; seenOpId: number }
  | { type: 'FEED_UNMOUNTED' }
  | { type: 'PANEL_CLOSED' };

type MissionArrivalQueueEffect =
  | {
      type: 'hydrate-cold-feed-sync';
      scopeRevision: number;
      baseFeedRevision: number;
      orderedIds: readonly string[];
    }
  | {
      type: 'load-feed-projection';
      applyId: number;
      snapshot: PendingSnapshot;
      scopeRevision: number;
      baseFeedRevision: number;
      orderedBaseFeedIds: readonly string[];
      queueMode: 'all-feed' | 'stable-queue';
    }
  | { type: 'write-feed-projection-sync'; candidate: ProjectionCandidate }
  | { type: 'persist-seen'; missionId: string; seenOpId: number }
  | { type: 'focus-drawer-heading' }
  | { type: 'focus-stack-trigger' }
  | { type: 'scroll-feed-start' }
  | { type: 'report-arrival-error'; reason: ProjectionFailureReason }
  | { type: 'report-seen-error'; missionId: string; seenOpId: number };
```

`PROJECTION_WRITE_SUCCEEDED` et `PROJECTION_WRITE_FAILED` sont des commandes de commit
privées et inline, et non des entrées de dispatch publiques. Toute tentative d'un bridge ou d'un composant
de dispatcher l'une ou l'autre est ignorée ; seul l'adaptateur sérialisé peut les réduire entre
son écriture préparée et la publication aux abonnés.

## Protocole d'application (Apply) et linéarisation

L'opération Apply comporte une phase de préparation asynchrone et une phase d'écriture
synchrone autorisée. Elles sont délibérément distinctes.

```ts
declare function mergeAppliedIntoBase(
  orderedBaseFeedIds: readonly string[],
  orderedAppliedIds: readonly string[]
): readonly string[];
```

Les deux entrées doivent être uniques et disjointes. Le seul résultat valide est constitué de chaque identifiant
de base dans un ordre inchangé suivi de chaque identifiant appliqué dans un ordre inchangé. Il n'y a aucun
tri, remplacement ou ajout à l'échelle du catalogue.

1. `APPLY_REQUESTED` fige `applied`, un nouvel `applyId` local, les révisions actuelles
   exactes de scope/feed et les `orderedBaseFeedIds` exacts, puis émet
   `load-feed-projection` sans effacer les éléments en attente (pending).
2. Le Shell demande au service worker les objets canoniques requis pour construire
   le Feed visible cible. Le service worker lit seul dans IndexedDB. La
   cible résout les objets pour exactement
   `mergeAppliedIntoBase(orderedBaseFeedIds, applied.orderedIds)` ; les arrivées
   ultérieures restent dans `latest`.
3. Le Shell normalise le résultat complet en mémoire et dispatche soit
   `PROJECTION_PREPARED` soit le `PROJECTION_LOAD_FAILED` corrélé.
4. Core n'accepte un candidat préparé que tant que le cycle de vie est actif, que la pile (stack) est
   dans l'état `applying`, que la présentation est compatible avec loaded, et que `applyId`, la révision
   appliquée, la révision de périmètre et la révision de base du Feed sont exactement égales aux
   valeurs figées/actuelles. Les identifiants ordonnés actuels du Feed doivent toujours être exactement égaux à la base figée.
   `orderedAllFeedIds` doit être égal à la fusion déterministe élément par élément :
   aucun identifiant étranger, omis, dupliqué ou réordonné n'est accepté.
   `orderedUnseenIds` doit être un sous-ensemble ordonné unique de cette liste exacte.
   Une structure invalide bascule vers `INVALID_CANDIDATE` (réessayable) sans écrire.
5. Seul un candidat accepté est stocké comme `prepared` et émet
   `write-feed-projection-sync`.
6. Au sein de la même commande FIFO, le commit indivisible réexécute la garde pure vérifiant
   le cycle de vie actif, la présentation loaded, les valeurs exactes de `applyId`, de la révision appliquée,
   de la révision de périmètre, de la révision de base du Feed, des identifiants de base ordonnés et du candidat préparé stocké.
   Il prépare (stage) un remplacement de Feed et réduit le succès/échec inline
   avant que tout callback ou dispatch ne puisse s'exécuter.

Aucun événement ne peut s'intercaler entre la garde finale de l'étape 6 et l'écriture. Si l'autorisation
n'est plus exacte, l'effet n'effectue aucune écriture ; un candidat/résultat obsolète est
un no-op exact. L'événement inline `PROJECTION_WRITE_SUCCEEDED` constitue le point de linéarisation :
dans le même commit indivisible, il efface les éléments appliqués en attente, met à jour exactement une
branche de Queue, avance les révisions de feed et de scope d'une unité, et remplace les identifiants
visibles ordonnés/ensembles par le candidat committé exact. Une alarme en file estampillée avec la
révision de périmètre antérieure au commit est donc obsolète et ne peut pas remettre en attente un identifiant appliqué.
Un échec de chargement ou d'écriture préserve les éléments appliqués éligibles ainsi que les arrivées ultérieures et
expose l'action utilisateur Retry.
La primitive de remplacement de Feed est atomique : elle committe la liste normalisée
complète en une seule assignation ou laisse la liste précédente inchangée avant de signaler
`PROJECTION_WRITE_FAILED` ; tout remplacement partiel est interdit.

### Transitions de l'opération Apply

| Depuis                | Événement / garde exacte                                                | Résultat et effets                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collapsed` ou `open` | Apply, éléments en attente non vides, présentation loaded exacte        | Allouer l'ID d'application ; figer pending/scope/previews ; `latest=null` ; émettre un chargement asynchrone                                                                       |
| `applying`            | Apply ou Retry                                                          | No-op exact ; exécution unique (single-flight)                                                                                                                                     |
| `applying`            | Alarme filtrée sur le périmètre actuel                                  | Fusionner uniquement les identifiants hors visible/applied dans `latest` ; ne pas altérer les éléments appliqués figés                                                             |
| `applying`            | Candidat préparé valide et correspondant                                | Stocker le candidat ; émettre exactement une écriture synchrone                                                                                                                    |
| `applying`            | Candidat préparé malformé et correspondant                              | Fusionner/filtrer applied plus latest ; passer à `projection-error(INVALID_CANDIDATE)`                                                                                             |
| `applying`            | Échec de chargement/écriture correspondant                              | Fusionner/filtrer applied plus latest ; passer à l'état réessayable `projection-error` ; signaler                                                                                  |
| `applying`            | Succès d'écriture correspondant                                         | Avancer de manière indivisible les faits de Feed/scope et une branche de Queue ; filtrer `latest` par rapport aux nouveaux identifiants visibles ; fermer/vider ; défiler une fois |
| `projection-error`    | Alarme                                                                  | Fusionner les identifiants éligibles ; préserver l'erreur                                                                                                                          |
| `projection-error`    | Retry avec une présentation loaded exacte                               | Allouer un nouvel ID d'application ; figer pending/scope actuels ; émettre exactement un chargement asynchrone                                                                     |
| Tout état             | Préparation/résultat/ACK obsolète, dupliqué, croisé ou post-destruction | No-op exact                                                                                                                                                                        |

Il n'y a aucune boucle de réessai automatique.

## Changements de périmètre pendant l'application (applying)

Un événement `PENDING_SCOPE_CHANGED` accepté stocke toujours ses faits complets plus récents et
refiltre l'état en attente existant. Dans l'état `applying`, il **annule logiquement
l'application avant toute écriture future** :

1. faire l'union de `applied` figé et de `latest` dans un ordre stable ;
2. filtrer l'union avec les nouveaux faits activés/visibles ;
3. quitter `applying` immédiatement pour `collapsed(eligible)` ou `empty` ; et
4. n'émettre aucun effet d'écriture de projection ni de succès.

Les détails causals figés ne peuvent être conservés que dans les diagnostics ; le décompte et les aperçus
proviennent exclusivement du nouveau snapshot éligible. Tout résultat préparé/chargement/écriture ultérieur
est obsolète car aucun état applying correspondant n'existe. Si un effet d'écriture
synchrone a déjà été émis, sa garde et son écriture se terminent lors du tour d'acteur non suspensif
antérieur avant qu'un événement de périmètre ne puisse s'intercaler ; sinon, le
changement de périmètre l'emporte avant toute écriture dans le Feed. Il n'existe aucun ordre intermédiaire ambigu.

Un nouvel événement `FEED_FACTS_CHANGED` qui rend la présentation non chargée (non-loaded)
abandonne de même une application non écrite pour revenir à son snapshot en attente éligible. Une écriture
synchrone déjà autorisée se termine en premier en vertu de la même règle de sérialisation.

## Transitions ordinaires de la pile (stack)

| Depuis / condition                    | Événement                           | Résultat                                                                                                                                                 |
| ------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actif                                 | Nouvelle révision de faits Feed     | Dériver/stocker la présentation totale du Feed                                                                                                           |
| `empty` chargé (loaded)               | Alarme non vide du périmètre actuel | `collapsed(snapshot)`                                                                                                                                    |
| `collapsed` chargé                    | Alarme                              | Fusionner les éléments en attente ; rester collapsed                                                                                                     |
| `open` chargé                         | Alarme                              | Fusionner les éléments en attente ; conserver les identifiants d'aperçu figés                                                                            |
| `collapsed`                           | `OPEN_STACK`                        | `open` ; afficher en aperçu les trois premiers identifiants éligibles ; focaliser le titre                                                               |
| `open`                                | `CLOSE_STACK`                       | `collapsed` ; restaurer le focus sur le déclencheur                                                                                                      |
| `projection-error`                    | Ouverture/fermeture                 | Basculer le tiroir (drawer) uniquement                                                                                                                   |
| Toute pile non-applying               | Alarme filtrée vide                 | No-op exact                                                                                                                                              |
| `collapsed`/`open`/`projection-error` | Nouveaux faits de périmètre         | Stocker les faits ; élaguer les identifiants désactivés/visibles ; allouer une révision de snapshot uniquement si l'appartenance/ordre change            |
| Présentation incompatible avec loaded | Toute pile                          | Le tiroir n'est pas restitué ; les éléments en attente/erreur ordinaires peuvent subsister, mais une application non écrite est invalidée comme spécifié |

Réactiver une source ne ressuscite pas les publications filtrées. Ces missions
n'apparaissent que dans une publication ultérieure ou via `smartLoad()`.

## Convergence réactive du cache d'aperçu

Le Shell du panneau peut conserver un catalogue d'aperçu local `id -> Mission` afin qu'une
pile d'arrivée ouverte puisse continuer à restituer les objets mission exacts reçus
avant qu'un snapshot de façade ultérieur ne change. Ce catalogue est un cache de présentation,
et non un état d'acteur ni une autorité durable.

```ts
type PreviewCacheState =
  | { lifecycle: 'active'; byId: Readonly<Record<string, Mission>> }
  | { lifecycle: 'disposed'; byId: Readonly<Record<string, never>> };

type PreviewCacheEvent =
  | {
      type: 'PREVIEW_OBJECTS_OBSERVED';
      source: 'facade-pending-snapshot' | 'alarm-ingress';
      missions: readonly Mission[];
    }
  | { type: 'APPLY_CYCLE_SETTLED'; hasRemainingPreviewMembership: boolean }
  | { type: 'PREVIEW_CACHE_DISPOSED'; reason: 'feed-unmounted' | 'panel-closed' };
```

L'état initial est actif avec une map vide. Un snapshot complet `pendingMissions`
provenant de la façade de Feed émet `PREVIEW_OBJECTS_OBSERVED` avec
`source='facade-pending-snapshot'`. L'écouteur synchrone `cold-only` émet
le même événement avec `source='alarm-ingress'` avant de rejeter son entrée de commit.
Les deux sources possèdent une sémantique de cache identique ; la source n'existe qu'à des fins d'audit et
de tests.

```ts
declare function transitionPreviewCache(
  state: PreviewCacheState,
  event: PreviewCacheEvent
): PreviewCacheState;
```

| État actuel / événement                                                                   | Résultat exact                                                                                           |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Actif / liste vide observée                                                               | No-op exact ; une observation vide n'efface pas les aperçus figés d'une pile ouverte                     |
| Actif / identifiant manquant observé ou objet mission canonique modifié                   | Fusionner uniquement ces entrées entrantes, en préservant chaque entrée en cache non liée                |
| Actif / chaque identifiant observé correspond déjà à son objet identique                  | No-op exact ; préserver l'identité existante du cache                                                    |
| Actif / Apply résolu avec une appartenance d'aperçu restante                              | No-op exact ; l'appartenance de l'acteur contrôle seule quelles entrées en cache peuvent être restituées |
| Actif / Apply résolu sans appartenance d'aperçu restante                                  | Vider une fois                                                                                           |
| Actif / démontage du Feed ou fermeture du panneau                                         | Vider et entrer dans l'état terminal `disposed`                                                          |
| Disposed / tout événement, y compris alarme tardive, observation de façade ou ACK d'Apply | No-op exact ; rester disposed avec une map vide                                                          |

L'effet de synchronisation Svelte ne suit que le snapshot de façade. La comparaison
et la mutation du cache s'exécutent en dehors de la collecte de dépendances (ou via une
frontière de comparaison et fusion pure équivalente), de sorte que l'effet ne s'abonne jamais
au cache dans lequel il peut écrire. Créer un nouveau wrapper de tableau autour du même snapshot
de façade ne constitue pas un changement factuel d'aperçu. Réobserver des objets mission
identiques ne peut pas allouer un nouvel objet de cache ni planifier un autre tour d'effet.

`APPLY_CYCLE_SETTLED` n'est projeté qu'après que `whenIdle()` a résolu la commande
Apply/Retry exacte de l'acteur actuel. Son booléen est dérivé de l'appartenance de la pile de cet acteur
après règlement, jamais du cache. Le démontage du Feed ou la fermeture du panneau
détruit le cache au sein du même nettoyage de Page qui détruit l'acteur ; la
garde terminale de cache rend inoffensif tout règlement asynchrone tardif.

Des missions malformées ne peuvent pas entrer dans ce chemin car la façade typée possède
le snapshot. Toute future entrée (ingress) non fiable doit valider avant de dispatcher cet
événement de projection. Un échec du cache d'aperçu n'autorise jamais une transition d'acteur,
une écriture dans le Feed ou une persistance durable ; les objets d'aperçu manquants restent omis
de la vue comme déjà spécifié par la projection de pile.

`isArrivalStackRenderable(state)` est vrai uniquement pour une présentation loaded exacte,
active, avec une appartenance actuellement éligible non vide. L'état applying restitue
son décompte/ses aperçus éligibles figés, peut annoncer un décompte `latest` distinct et
désactive Apply/Retry.

## File stable et persistance corrélée de l'état vu

Entrer dans Nouvelles capture les identifiants non vus ordonnés uniques et initialise des
registres de temporisation (dwell), en vol (in-flight) et confirmés vides. La recherche, les facettes et le tri projettent cette
appartenance stable. Le fait de devenir vu ne change que son badge, jamais son appartenance ni son ordre.

| État           | Événement                           | Résultat exact                                                                                                                                                                                       |
| -------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `all-feed`     | `ENTER_NEW_QUEUE(ids)`              | Capturer l'appartenance ordonnée unique avec dwell/in-flight/confirmed vides ; préserver l'ordinal de l'acteur                                                                                       |
| `stable-queue` | `SORT_QUEUE(ids)`                   | N'accepter qu'une permutation exacte                                                                                                                                                                 |
| `stable-queue` | `DWELL_STARTED(id, now)`            | Exiger que ce soit un membre, temps fini, non confirmé et sans dwell/in-flight                                                                                                                       |
| `stable-queue` | `DWELL_CANCELLED(id)`               | Supprimer uniquement son dwell actif                                                                                                                                                                 |
| `stable-queue` | `DWELL_ELAPSED(id, now)`            | Exiger le dwell actif exact et au moins 1 500 ms ; allouer de façon atomique le prochain `seenOpId` à l'échelle de l'acteur, déplacer l'ID en in-flight, effacer le dwell, émettre un `persist-seen` |
| `stable-queue` | `SEEN_PERSISTED` correspondant      | Supprimer la paire in-flight exacte ; si l'ID reste dans la file, l'ajouter une fois aux confirmés et projeter `Vu`, sinon régler sans présentation                                                  |
| `stable-queue` | `SEEN_PERSIST_FAILED` correspondant | Supprimer la paire in-flight exacte, ne pas confirmer, signaler ; seul un ID toujours présent peut démarrer un nouveau dwell/retry                                                                   |
| `stable-queue` | Résultat croisé/obsolète/dupliqué   | No-op exact                                                                                                                                                                                          |
| `stable-queue` | Succès d'écriture Apply valide      | Remplacer les IDs ; intersecter dwells/confirmed avec les nouveaux IDs ; préserver chaque opération in-flight corrélée jusqu'à son résultat durable                                                  |
| `stable-queue` | `EXIT_NEW_QUEUE`                    | Retourner à tout le Feed et abandonner les corrélations de présentation sans réinitialiser l'ordinal à l'échelle de l'acteur                                                                         |

Tant que la persistance est en vol (in-flight), le badge reste **Nouveau**. Seul un succès
confirmé le change en **Vu**. Un échec active une nouvelle temporisation (dwell) de 1 500 ms ; il ne
crée jamais de faux badge vu. La persistance durable peut s'achever après avoir quitté la
file, mais son résultat d'interface tardif est délibérément ignoré ; la capture suivante utilise
les faits vus canoniques. Le succès d'Apply ne constitue pas une sortie de file : il préserve
`seenInFlight`, de sorte qu'un ACK durable correspondant ultérieur règle toujours l'opération et
projette `Vu` lorsque cette mission reste dans la file de remplacement.

`seenOperationOrdinal` appartient à l'acteur, commence à `0`, est un entier
sûr monotone et n'est jamais réinitialisé par `ENTER_NEW_QUEUE`, `EXIT_NEW_QUEUE`, Apply ou un
résultat de persistance abandonné. L'allocation échoue de manière sécurisée (fail-closed) sans émettre
`persist-seen` lorsque la valeur suivante ne serait pas un entier sûr. Une clôture de résultat dispatche
toujours en retour vers l'acteur qui l'a allouée ; la destruction (disposal) rend cet ancien acteur
terminal. Par conséquent, quitter et réintégrer Nouvelles peut abandonner une opération
mais ne peut jamais réutiliser son `seenOpId` au sein du même acteur ni le transmettre à un nouveau.

## Annulation, erreurs et comportement terminal

- L'annulation de scan appartient au modèle de scan. Un scan d'alarme annulé
  ne publie aucun résultat et ne peut pas effacer l'état en attente plus ancien.
- La fermeture du tiroir (tray) relève uniquement de la présentation ; Apply n'a pas d'annulation utilisateur.
- Les échecs de chargement, de validation et d'écriture sont réessayables et ne produisent jamais
  de succès visuel.
- `PANEL_CLOSED` et `FEED_UNMOUNTED` font transiter tout état actif vers l'état terminal
  `disposed`, effacent l'état de présentation et ignorent tous les événements/effets tardifs.
- L'orchestration de réinitialisation doit détruire cet acteur avant de remplacer IndexedDB. Un
  nouvel acteur s'amorce via le bridge.

## Projection UX et accessibilité

- La pile est ancrée au bord inférieur du Feed avec une cible tactile d'au moins 44 px.
- Le décompte et les aperçus proviennent uniquement des snapshots Core éligibles ; les aperçus sont plafonnés à
  trois et restent figés pendant que le tiroir est ouvert.
- Le tiroir d'arrivée est non modal : aucun arrière-plan sombre (backdrop), aucun piège de focus ni
  `aria-modal=true` ; il ne s'enregistre jamais dans `modal-focus.model.md`.
- L'ouverture place le focus sur son titre ; la fermeture restaure le focus sur son déclencheur ; le succès d'Apply fait défiler
  une fois au début du Feed.
- Les changements de décompte acceptés annoncent un résumé poli (polite) régulé (throttled).
- L'animation du décompte dure au plus 160 ms ; l'animation du tiroir au plus 180 ms et 6 px ;
  l'animation réduite (reduced motion) est immédiate.

## Invariants

1. Core dérive l'unique action de Feed ; les arrivées ne sont restituées que pour une
   présentation loaded exacte.
2. IndexedDB derrière le service worker est le seul catalogue durable ; le
   panneau ne l'atteint qu'à travers la façade/bridge.
3. Les publications d'alarme sont cold-only. Les commits de Feed cold/Apply sont des sections
   critiques sérialisées garde-écriture-ACK-inline ; aucun callback ou dispatch ne peut
   s'intercaler. Une publication warm ne remplace jamais le Feed sans Apply.
4. Les révisions de périmètre sont monotones, les alarmes exigent la révision actuelle exacte, et
   les faits activés/visibles filtrent le décompte, l'aperçu et l'appartenance d'Apply.
5. Deux publications cold séquentielles ne peuvent pas toutes deux hydrater un Feed vide.
6. Les identifiants/aperçus en attente sont uniques et ont une autorité Core unique.
7. Apply est à exécution unique (single-flight). Son chargement asynchrone ne peut pas écrire ; seul un candidat
   exact et déterministe base-plus-appliqué peut entrer dans le commit indivisible.
8. Un changement de périmètre pendant le chargement annule logiquement Apply avant l'écriture et transforme
   tous les résultats tardifs en no-ops.
9. Seul un succès d'écriture inline correspondant efface les éléments en attente appliqués, avance
   de manière atomique les faits autoritatifs de Feed/scope et met à jour exactement une branche de Queue ;
   chaque échec préserve les éléments appliqués éligibles ainsi que les arrivées ultérieures.
10. Les arrivées survenant pendant Apply résident dans `latest` ; le succès ne peut pas les consommer en tant
    qu'appartenance appliquée et l'échec ne peut pas les perdre.
11. L'appartenance/ordre de la file stable ne change jamais simplement parce qu'une mission
    devient vue. Chaque mission a au plus une opération vue en vol (in-flight) ; seul un
    succès de persistance correspondant la confirme ; un échec autorise un
    réessai corrélé. Le succès d'Apply n'abandonne jamais une corrélation in-flight, et
    l'ordinal à l'échelle de l'acteur n'est jamais réinitialisé ni réutilisé à travers les captures de file.
12. La destruction (dispose) abandonne les éléments en attente de l'interface mais ne modifie jamais le catalogue durable.
13. Aucun session storage, journal, réconciliation, epoch, texte libre ou sortie de LLM
    ne participe.
14. La synchronisation du cache d'aperçu converge : les snapshots de façade et les entrées (ingress) d'alarme
    sont des entrées explicites non autoritatives, les entrées identiques préservent l'identité
    du cache, et aucun effet réactif ne s'abonne à un état qu'il réécrit.
15. Le règlement d'Apply du cache d'aperçu est projeté à partir de l'appartenance de l'acteur
    actuel après règlement ; la destruction du Feed/panneau le vide de manière terminale et
    chaque événement de cache tardif est un no-op exact.

## Matrice de revue obligatoire

- chaque n-uplet FeedState/scan possédé et chaque combinaison inconsistante ;
- première révision de périmètre `0`, changements monotones, révisions d'alarme égales/antérieures et
  faits complets immuables ;
- hydratation cold synchrone exacte, objet de publication manquant/levée d'exception à l'écriture,
  callback/dispatch réentrant pendant le commit, et deux publications séquentielles ;
- capture d'attente warm, omission de loading/error, filtrage des sources désactivées et des
  identifiants visibles avant le décompte/l'aperçu/Apply ;
- aperçus figés collapsed/open, publications dupliquées/vides et fusion
  ordonnée ;
- Apply depuis collapsed/open, double Apply, succès/échec de chargement asynchrone et
  succès/échec d'écriture synchrone ;
- révision/ordre de Feed figé et résultat déterministe exact base-plus-appliqué,
  rejetant les identifiants étrangers, omis, dupliqués ou réordonnés ;
- candidats préparés malformés, catalogue incomplet et préparation ou ACK
  obsolète/croisé/dupliqué ;
- changement de périmètre/source/visibilité avant préparation, après préparation mais avant
  le tour d'écriture sérialisé (doit être impossible), et après succès ;
- alarme ultérieure avant l'achèvement du chargement et avant l'échec de chargement/écriture ;
- un Retry explicite produisant un nouveau chargement et aucune boucle automatique ;
- permutation de la file stable, temporisation (dwell) interrompue, limite 1 499/1 500 ms,
  succès/échec de persistance, succès d'Apply pendant que la persistance est en vol (in-flight),
  réessai avec un nouvel ID d'opération, sortie/réentrée avant un résultat tardif, épuisement
  d'ordinal sûr, résultat croisé et tardif ;
- succès d'Apply all-Feed par rapport à stable-queue ;
- fermeture du panneau/démontage du Feed dans chaque état de pile et `smartLoad()` au remontage ;
- remplacement direct par Start/Retry manuel et zéro événement de tiroir ;
- preuve architecturale de l'absence d'import d'IndexedDB dans le panneau, de tampon de session ou
  d'événement de réinitialisation ;
- snapshot d'aperçu non vide suivi par le même wrapper de tableau et par un nouveau
  wrapper sur des objets mission identiques ; chacun doit se stabiliser sans seconde
  allocation de cache ni échec de profondeur de mise à jour réactive ;
- ajout/mise à jour d'aperçu par la façade et par l'alarme, snapshot vide, règlement d'Apply
  avec/sans appartenance restante, destruction terminale et tout événement croisé/tardif après destruction ;
- comportement du focus non modal, de l'animation réduite et d'objet d'aperçu manquant.

## Correspondance avec la Tâche 9

| Interface de la Tâche 9                                                      | Clause autoritative                                    | Preuve RED requise avant implémentation                                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Tiroir uniquement pour les éléments en attente compatibles avec le Feed      | Règles de présentation totale, de périmètre et de pile | Aucun `+N` en dehors de loaded exact ; décompte éligible exact                                          |
| Cancel sur Loading ; Start sur Empty ; Retry sur Error                       | Présentation totale du Feed                            | Test exhaustif des faits de Feed                                                                        |
| Un scan warm ne réordonne pas le Feed                                        | Routage d'alarme et linéarisation d'Apply              | Une alarme loaded laisse les identifiants visibles inchangés jusqu'au succès d'écriture exact           |
| Le cold empty est atomique                                                   | Acteur sérialisé et route cold                         | Aucun callback entre garde/écriture/ACK ; le premier hydrate, le second passe en attente                |
| Les changements de périmètre ne peuvent pas entrer en concurrence avec Apply | Protocole d'Apply et invalidation de périmètre         | Un nouveau périmètre avant la préparation asynchrone empêche toute écriture dans le Feed                |
| Le badge vu suit la persistance                                              | Protocole de vu corrélé                                | L'échec reste Nouveau et réessaie avec une nouvelle opération ; seul un succès correspondant devient Vu |
| L'échec d'Apply reste exploitable                                            | Transitions d'Apply                                    | Un échec de lecture/validation/écriture conserve l'appartenance ; un Retry émet un chargement           |
| Accessibilité du tiroir d'arrivée                                            | Projection UX et frontière modale                      | Sémantique non modale, focus sur titre/déclencheur et animation réduite                                 |

Les surfaces d'implémentation attendues restent `FeedPage.svelte`,
`MissionArrivalStack.svelte`, le réducteur pur et leurs tests. Toute
implémentation nécessitant une persistance de session ou un protocole d'arrivée durable
contredit ce modèle et doit retourner en revue de Modèle.

## Grille d'auto-revue

- Les états, événements, transitions, effets, gardes, erreurs, réessais et chemins
  terminaux sont explicites.
- Les écritures de Feed cold et warm bénéficient toutes deux d'une autorisation synchrone
  au dernier instant sans fenêtre d'intercalation.
- L'invalidation de périmètre, les résultats asynchrones obsolètes et les échecs de vu corrélés
  sont traités en échec sécurisé (fail-closed).
- Aucune transition ne dépend de texte libre ou d'un LLM.

**VERDICT DE L'AUTO-REVUE : PRÊT POUR LA REVUE INDÉPENDANTE À FROID ; NON APPROUVÉ POUR
L'IMPLÉMENTATION.**
