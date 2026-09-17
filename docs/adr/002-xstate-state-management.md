# ADR-002 : XState 5 pour la gestion d'état

## Statut

~~Accepté~~ **Remplacé** (2026-04-02)

> **Note :** Cette ADR est historique. XState a été retiré du projet au profit des runes Svelte 5 (`$state`, `$derived`, `$effect`) dans `src/lib/state/*.svelte.ts`. Les machines d'état mentionnées ci-dessous n'existent plus dans le code.

## Contexte

Svelte 5 fournit des runes (`$state`, `$derived`) pour l'état réactif, mais MissionPulse a des transitions d'état complexes (cycle de vie du scan, surveillance de connexion, files de toast) réparties sur plusieurs contextes Chrome. De simples stores réactifs mènent à des transitions implicites et à des bugs difficiles à reproduire — par exemple, que se passe-t-il quand un scan échoue hors ligne et qu'une reconnexion survient en plein retry ?

## Décision

Utiliser des machines à états XState 5 comme couche principale de gestion d'état, intégrées via `@xstate/svelte`.

Trois machines gouvernent l'application :

- **`feed.machine.ts`** : gère le cycle de vie de chargement des missions (`empty -> loading -> loaded | error`) avec filtrage par recherche. Les actions utilisent des fonctions helpers pures (`recomputeFilteredMissions`).
- **`toast.machine.ts`** : file de notifications FIFO avec capacité maximale (5), auto-dismiss et événements toast typés. Le helper pur `addToast` applique les limites.
- **`connection.machine.ts`** : suivi de l'état réseau (`unknown -> online | offline | slow | reconnecting`) via le modèle acteur — un acteur `fromCallback` s'abonne aux événements de connectivité du navigateur et renvoie des événements typés à la machine.

## Conséquences

- **Positif** : chaque transition d'état valide est déclarée explicitement. Les états impossibles sont impossibles. Les machines se testent en envoyant des séquences d'événements et en assertant le contexte.
- **Positif** : le modèle acteur (`fromCallback`, `invoke`) correspond naturellement aux patterns d'extension Chrome — abonnements background, opérations async, communication inter-contextes.
- **Positif** : l'API `setup()` de XState v5 offre une typage complet pour événements, contexte, actions et guards.
- **Négatif** : courbe d'apprentissage plus élevée que les stores Svelte. XState v5 est encore en maturation (quelques manques dans l'écosystème).
- **Négatif** : ajoute ~15 Ko au bundle (acceptable pour une extension non servie via le réseau).
