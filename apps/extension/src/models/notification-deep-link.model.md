# Notification Deep-Link — Modèle d'état

> Source de vérité pour l'expérience de lien profond (_deep-link_) :
> lorsqu'une notification se déclenche (ou que l'utilisateur ouvre le panneau
> alors que des missions notifiées existent), le feed se focalise sur ces
> missions. Règle courte : **la notification produit une intention de focus ; le
> modèle décide ce que le feed affiche.**

Deux machines à états coopératives, une par contexte :

- **Intent** (service worker, `chrome.storage.session`) — quoi afficher.
- **Focus** (side panel, `feed-page.svelte.ts`) — comment le feed le restitue.

---

## 1. Machine Intent (service worker)

Persistée dans `chrome.storage.session` sous `deepLinkIntent`. Écrite lorsqu'une
notification est créée ; lue et effacée atomiquement lorsque le panneau est
monté.

### États

| État       | Signification                                    |
| ---------- | ------------------------------------------------ |
| `absent`   | Aucune intention en stockage. Par défaut.        |
| `pending`  | Une intention est écrite, pas encore consommée.  |
| `consumed` | L'intention a été lue et effacée par le panneau. |

### Événements

| Événement       | De → Vers              | Effet de bord                                                          |
| --------------- | ---------------------- | ---------------------------------------------------------------------- |
| `NOTIFY`        | tout → `pending`       | écrase le stockage avec `{ focusMissionIds, source, triggeredAt }`     |
| `CONSUME`       | `pending` → `consumed` | lit + supprime atomiquement du stockage ; renvoie la valeur au panneau |
| `CONSUME`       | `absent` → `absent`    | aucune opération, renvoie `null`                                       |
| `SESSION_RESET` | tout → `absent`        | zone de stockage effacée par le navigateur                             |

### Forme

```ts
type DeepLinkIntentSource = 'notification' | 'digest';
interface DeepLinkIntent {
  focusMissionIds: string[]; // non vide, ≤ 20, dédupliqué
  source: DeepLinkIntentSource;
  triggeredAt: number; // epoch ms
}
```

### Invariants (Intent)

- **I1 (consommation unique) :** une intention donnée est renvoyée à
  exactement un montage de panneau. `CONSUME` est une lecture-puis-effacement
  atomique.
- **I2 (non vide) :** `NOTIFY` n'est déclenché qu'avec ≥ 1 id de mission ; les
  écritures vides sont ignorées.
- **I3 (borné) :** la longueur de `focusMissionIds` est ≤ 20 (plafond
  d'affichage ; reflète le plafond `maxResults`).
- **I4 (le dernier gagne) :** un nouveau `NOTIFY` écrase une intention en
  attente.
- **I5 (aucune fuite) :** l'intention ne vit que dans le stockage de session ;
  jamais persistée sur disque, jamais journalisée avec le contenu des missions.

---

## 2. Machine Focus (side panel / feed-page)

Vit dans `createFeedPageState()`. Pilote `displayMissions` + la bannière.

### États

| État        | Signification                                                          |
| ----------- | ---------------------------------------------------------------------- |
| `idle`      | Aucune intention consommée ; le feed est normal.                       |
| `focused`   | Le feed est filtré sur les missions de l'intention ; bannière visible. |
| `dismissed` | L'utilisateur a fermé ; le feed est de nouveau normal.                 |

L'état intermédiaire antérieur `focusing` a été supprimé lors de
l'implémentation (voir « Gestion des courses » ci-dessous). `APPLY` entre dans
`focused` de manière optimiste et un effet différé revérifie la correspondance
une fois les missions disponibles.

### Événements

| Événement       | De → Vers               | Effet de bord                                                        |
| --------------- | ----------------------- | -------------------------------------------------------------------- |
| `APPLY(intent)` | `idle` → `focused`      | définit les ids de focus ; bannière + filtre appliqués immédiatement |
| `APPLY(intent)` | `idle` → `idle`         | l'intention est nulle (rien consommé)                                |
| `STALE_GUARD`   | `focused` → `idle`      | missions chargées mais aucun id d'intention ne correspond → retour   |
| `DISMISS`       | `focused` → `dismissed` | efface les ids de focus ; restaure le feed complet                   |

`STALE_GUARD` est un `$effect` différé, pas un message : il se déclenche après
le règlement du chargement asynchrone des missions, afin qu'une intention
consommée survive jusqu'à ce que les missions soient réactivement présentes.

### Gestion des courses (_race handling_)

Le panneau consomme l'intention au montage (appel façade asynchrone) pendant
que les missions se chargent de façon asynchrone en parallèle. Plutôt qu'un
état intermédiaire, `APPLY` entre dans `focused` de manière optimiste (la
bannière s'affiche immédiatement, `displayMissions` filtre aussitôt) et l'effet
`STALE_GUARD` revérifie la correspondance dès que `missions.length > 0`. Cela
fusionne la conception antérieure `focusing` + `MISSIONS_LOADED` en un seul
état et affiche la bannière sans délai.

### Invariants (Focus)

- **F1 (surcharge) :** lorsqu'il est `focused`, `displayMissions` n'affiche que
  les missions de l'intention (toujours triées), en ignorant tous les autres
  filtres. Les autres filtres ne sont PAS mutés — fermer restaure l'état de
  filtrage antérieur intact.
- **F2 (focus ≠ vu) :** les ids de focus sont comparés aux missions chargées
  par id, jamais à l'ensemble des missions vues. Le marquage comme vu au moment
  de la notification n'affecte pas le focus.
- **F3 (fermable) :** `DISMISS` est toujours disponible en `focused`. Il ne mute
  jamais l'état de filtre persisté.
- **F4 (expiration auto) :** une fois les missions chargées et qu'aucun id
  d'intention ne correspond, l'effet `STALE_GUARD` ramène `focused` → `idle`
  (aucun feed vide, aucune loupe morte).
- **F5 (activation unique) :** une fois `dismissed`, le panneau ne revient pas
  en `focused` sans une nouvelle intention consommée (c.-à-d. un nouveau
  `NOTIFY` → `APPLY`).
- **F6 (défilement) :** sur `focused`, le feed fait défiler la section des
  missions dans la vue.

---

## 3. Pourquoi le marquage « vu » est découplé

Aujourd'hui `persistScanResults` appelle
`saveSeenIds(markAsSeen(seenIds, notifiedMissionIds))` au moment de la
notification. L'ancien filtre `showNewOnly` exclut les missions vues, donc
l'activer après une notification masquerait les missions mêmes que nous voulons
afficher. La loupe de focus contourne entièrement « vu » (F2) : le focus est une
liste blanche explicite d'ids appliquée après le pipeline normal, rendant ainsi
le marquage « vu » inoffensif pour l'UX de deep-link. Nous conservons le
marquage « vu » (il évite de ré-alerter les mêmes missions), mais il ne dicte
plus la surface de focus.

Le badge de l'icône d'extension est piloté par `notifiableMissionIds` issu de
`notifyHighScoreMissions` (même filtre de score / alerte intelligente que la
notification Chrome), et non par le nombre brut de missions non vues du scan.

---

## 4. Invariant Zéro-LLM

Aucune transition d'état dans l'une ou l'autre machine ne dépend d'un LLM.
`filterSmartNotifications` (utilisé au moment de la notification pour choisir
quelles missions remonter) filtre uniquement par seuils de score / stack / TJM —
de manière déterministe. Le LLM ne décide jamais du focus.
