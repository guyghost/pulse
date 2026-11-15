# Fenêtre d'annulation — Modèle d'état (source de vérité)

Ce document est la **spec faisant autorité** pour la fenêtre d'annulation en
suppression douce (_soft-delete_) utilisée par les actions destructrices du
panneau latéral : **masquer une mission** et **supprimer une vue enregistrée**.

Règle : _« Si le comportement ne peut pas être modélisé, il n'est pas prêt à
être implémenté. Si une transition d'état dépend d'un LLM, l'architecture est
incorrecte. »_ Il n'y a **aucun LLM** nulle part dans ce flux. Le reducer est
pur ; le shell exécute les effets qu'il émet.

## Pourquoi un modèle

Avant ce modèle, `handleHide` / `deleteSavedView` utilisaient un motif
**suppression dure optimiste + restauration au clic** : la suppression était
persistée dans `chrome.storage` à l'instant où l'utilisateur cliquait, et le
toast « Annuler » ne repersistait l'état précédent que s'il était cliqué dans
les ~6 s. Si le toast expirait **ou** si le panneau latéral se fermait pendant
la fenêtre, la donnée était déjà validée et **irrécupérable**.

La correction est une **fenêtre de suppression douce** : tant que la fenêtre est
ouverte, l'action ne vit qu'en mémoire (le stockage contient toujours l'état
antérieur à l'action) ; l'action n'est validée dans le stockage que lorsque la
fenêtre se ferme sans annulation. Fermer le panneau en cours de fenêtre est sûr
par défaut — le stockage conserve toujours la donnée, qui réapparaît donc au
chargement suivant.

## Périmètre

S'applique à deux actions (toutes deux initiées depuis le panneau latéral) :

| Action              | Id cible     | Instantané capturé à `REQUEST`                | Restauration sur `UNDO`      | Validation sur `TIMEOUT`               |
| ------------------- | ------------ | --------------------------------------------- | ---------------------------- | -------------------------------------- |
| Masquer une mission | `mission.id` | `hidden: Record<id, ts>` précédent            | `hidden` rétabli en mémoire  | persiste le `hidden` final en stockage |
| Supprimer une vue   | `view.id`    | `savedViews` + `activeSavedViewId` précédents | les deux rétablis en mémoire | persiste les `savedViews` finales      |

## Machine à états par cible

Une instance par identifiant cible. Le reducer (`core/undo/undo-window.ts`) gère
un **registre** des entrées en attente indexé par identifiant cible.

```
États :      idle · pending-undo · committed
Événements : REQUEST · UNDO · TIMEOUT
```

```
                       REQUEST(kind, targetId, snapshot, now, durationMs)
  idle ───────────────────────────────────────────────────────────► pending-undo
                                                                      │
                                          UNDO                        │
   idle ◄─────────────────────────────────────────── (restore) ◄──────┤
                                                                      │
                                          TIMEOUT                     │
   committed ◄───────────────────────────────────── (commit) ◄────────┘
                                  terminal
```

### Table de transitions

| De           | Événement                        | Vers         | Effet émis vers le shell                                                   |
| ------------ | -------------------------------- | ------------ | -------------------------------------------------------------------------- |
| idle         | REQUEST                          | pending-undo | `start-timer` (deadline = now + durationMs) ; affiche le toast undo        |
| pending-undo | UNDO                             | idle         | `restore(snapshot)` ; `cancel-timer` ; ferme le toast                      |
| pending-undo | TIMEOUT (timer shell déclenché)  | committed    | `commit(snapshot, stillPending)` ; ferme le toast                          |
| pending-undo | REQUEST (même cible, même type)  | pending-undo | `cancel-timer` + `start-timer` (réarme ; instantané remplacé)              |
| pending-undo | REQUEST (même cible, autre type) | pending-undo | rejeté → `none` (I1 ; le shell ne doit jamais émettre de types en conflit) |
| tout état    | EXPIRE_ALL(now)                  | committed\*  | `commit-all(entries)` pour chaque entrée avec `deadline <= now`            |
| committed    | \*                               | committed    | terminal — aucune opération                                                |

\* Seules les entrées expirées sont validées ; les fenêtres encore ouvertes ne
sont pas touchées (I6).

**Propriété du timer (shell) :** le shell possède exactement un `setTimeout` par
cible en attente, démarré sur `start-timer` et nettoyé sur `cancel-timer` /
destruction du panneau. Le toast d'annulation est un **visuel non faisant
autorité** : son minuteur interne de fermeture automatique et son bouton de
fermeture sont cosmétiques — cliquer sur le `×` du toast ne valide **pas**
prématurément ; la fenêtre d'annulation suit simplement sa durée complète sauf
si l'utilisateur clique sur **Annuler**. Cela conserve une source unique de
vérité temporelle (le timer du shell) et évite les bugs de double timer. Le
cycle de vie du toast suit la fenêtre d'annulation : le shell ferme le toast sur
`UNDO`, sur `commit`, sur réarmement et sur destruction du panneau, afin qu'une
action résolue ne laisse pas de toast périmé derrière elle.

`EXPIRE_ALL(now)` est une primitive de sécurité en lot : pour chaque entrée en
attente dont `deadline <= now`, émet un unique effet `commit-all` listant
**toutes** les cibles expirées afin que le shell valide chacune — aucune entrée
expirée n'est ignorée silencieusement. En pratique, le shell nettoie ses timers
au déchargement et ne valide rien (sûr par défaut, invariant I5), donc
`EXPIRE_ALL` est une porte de sortie documentée plutôt qu'un cas nominal.

## Invariants

- **I1 — Une entrée par cible.** Au plus une entrée en attente par `targetId`.
  Un second `REQUEST` pour le même `(targetId, kind)` réarme le timer et
  remplace l'instantané. Un `REQUEST` pour le même `targetId` avec un `kind`
  _différent_ est rejeté (renvoie `none`) ; le shell ne doit jamais émettre de
  types en conflit pour une même cible.
- **I2 — Le stockage est l'étape de validation, jamais l'étape de requête.**
  Tant qu'une entrée est en `pending-undo`, `chrome.storage` DOIT toujours
  contenir la collection antérieure à l'action. `REQUEST` n'émet que
  `start-timer`, jamais `commit`. La persistance n'a lieu que sur `TIMEOUT` /
  `commit-all`.
- **I3 — Les instantanés sont immuables.** `UNDO` restaure l'objet exact capturé
  à `REQUEST`. Le reducer ne mute jamais un instantané.
- **I4 — Les échéances sont déterministes.**
  `deadline === requestedAt + durationMs`. `now` et `durationMs` sont injectés
  (aucun `Date.now()` dans le core).
- **I5 — Sûr par défaut au déchargement.** Si le panneau se ferme pendant
  `pending-undo`, l'état en mémoire est perdu mais le stockage conserve l'état
  antérieur à l'action → la mission / vue réapparaît au chargement suivant.
  Aucune perte de données silencieuse.
- **I6 — Les timers sont annulables.** `UNDO`, un réarmement et la destruction
  du panneau annulent tous le timer shell actif afin qu'aucun `TIMEOUT` tardif
  ne se déclenche sur une cible restaurée.
- **I7 — La validation se limite à la cible en cours de validation.**
  Lorsqu'une cible est validée, le shell ne doit PAS finaliser une _autre_ cible
  dont la fenêtre est encore ouverte. L'effet `commit` transporte
  `stillPending` (les instantanés des autres fenêtres ouvertes) ; le module de
  persistance les exclut (masquage : omet leurs ids de la table persistée ;
  suppression de vue : réinclut leurs vues dans la liste persistée).

## Constantes

- `DEFAULT_UNDO_WINDOW_MS = 5000` (PRODUCT.md : fenêtre d'annulation de 5 s).

## Modèle exécutable

`apps/extension/src/lib/core/undo/undo-window.ts` — reducer pur renvoyant
`{ state, effect }`. Entièrement testé unitairement sans I/O, sans timers, sans
`Date.now`. Le shell (`lib/shell/undo/undo-controller.ts` +
`lib/state/feed-page.svelte.ts`) possède : les timers, la persistance
`chrome.storage`, l'affichage des toasts et la mutation de la collection en
mémoire.
