# QA Hardening — Cross-cutting behavior model

> Source de vérité des corrections issues du QA Chrome du 29 juillet 2026.
> Ce modèle complète les machines métier existantes sans introduire de décision
> d'état pilotée par du texte libre.

## 1. Panneau de filtres

### États

`closed | open`

### Événements et transitions

| État     | Événement        | Cible    | Effets de présentation              |
| -------- | ---------------- | -------- | ----------------------------------- |
| `closed` | `TOGGLE_FILTERS` | `open`   | rendre le panneau au-dessus du feed |
| `open`   | `TOGGLE_FILTERS` | `closed` | retirer le panneau                  |
| `open`   | `CLEAR_FILTERS`  | `closed` | vider les filtres puis fermer       |

### Invariants

- `open` implique que le centre du panneau est le premier élément peint
  (`elementFromPoint` appartient au panneau ou à un descendant).
- Le panneau reste contenu horizontalement à 320 px et plus.
- `aria-expanded`, `aria-controls` et l'état rendu restent synchronisés.
- Aucune carte mission ne peut créer un contexte d'empilement supérieur.

## 2. Activation de Réglages et compte de favoris

### États

`inactive | refreshing | ready | refresh-error`

### Événements

- `PAGE_ACTIVATED`
- `PAGE_DEACTIVATED`
- `REFRESH_SUCCEEDED(count)`
- `REFRESH_FAILED(error)`
- `RETRY`

### Transitions

| Depuis          | Événement                  | Vers            | Effet shell                             |
| --------------- | -------------------------- | --------------- | --------------------------------------- |
| `inactive`      | `PAGE_ACTIVATED`           | `refreshing`    | lire favoris, missions, vues et alertes |
| `ready`         | `PAGE_DEACTIVATED`         | `inactive`      | aucun                                   |
| `refresh-error` | `RETRY` / `PAGE_ACTIVATED` | `refreshing`    | relire les données                      |
| `refreshing`    | `REFRESH_SUCCEEDED(count)` | `ready`         | projeter le nouveau compte              |
| `refreshing`    | `REFRESH_FAILED(error)`    | `refresh-error` | conserver les dernières données connues |

### Invariants

- Chaque activation déclenche au plus une lecture.
- Une erreur de refresh ne remet jamais un compte précédemment connu à zéro.
- L'export relit toujours la persistance avant de produire son fichier.
- Une mission ajoutée aux favoris dans Feed est reflétée à l'activation suivante
  de Réglages, sans rechargement de l'application.
- En développement, chaque lecture participant au refresh (`favoris`,
  `missions`, `vues`, `préférences` et `historique d'alertes`) possède une
  réponse bridge déterministe.

## 3. Présentation du score

Le score principal est toujours le total numérique `0–100`.
`scoreBreakdown.grade` est une métadonnée secondaire facultative.

Invariants :

- avant et après rescoring, la même mission garde le format principal `N/100` ;
- un grade ne remplace jamais le total ;
- le détail, le tri et le badge utilisent le même total canonique ;
- l'absence de breakdown utilise le score legacy sans changer la forme.

## 4. Sémantique et accessibilité des pages

- Chaque page active expose exactement un `h1`.
- Les sections commencent à `h2`, les cartes à `h3`.
- Une barre de complétude expose `role=progressbar`, `aria-valuemin=0`,
  `aria-valuemax=100` et sa valeur courante.
- Les jalons visuels de complétude sont dérivés de la valeur courante et se
  mettent à jour avec elle.
- Chaque champ possède un label visible ou accessible.
- L'entrée en édition du profil déplace le focus sur le premier champ et le
  rend visible sans déplacer l'utilisateur hors de la page.
- Les actions icône principales ont une cible d'au moins 32 × 32 px.

## 5. Fraîcheur de l'analyse TJM

### Entrées pures

- `lastUpdated` : dernière date de données valide ;
- `now` : horloge injectée par le shell ;
- `sampleConfidence` : confiance calculée depuis volume et stabilité.

### Projection

| Âge des données | Niveau     | Multiplicateur de confiance |
| --------------- | ---------- | --------------------------- |
| 0–30 jours      | `fresh`    | 1,00                        |
| 31–90 jours     | `aging`    | 0,75                        |
| 91–180 jours    | `stale`    | 0,40                        |
| > 180 jours     | `obsolete` | 0,20                        |

La confiance finale est `clamp(sampleConfidence × multiplicateur)`.

Invariants :

- la date est affichée en français (`1 avr. 2026`) ;
- à partir de 91 jours, l'UI dit explicitement `Données anciennes` et indique
  l'âge ;
- une analyse `stale` ou `obsolete` ne peut pas projeter `Confiance >= 45 %`,
  donc ne peut pas afficher l'état décisionnel `Aligné` ;
- date invalide ou future : aucun malus, pas de durée négative.

## 6. Données de suivi en développement

### États

`unseeded | seeded | mutated`

### Transitions

- première lecture : `unseeded → seeded`, crée et persiste une fois le jeu par
  défaut avec l'horloge injectée ;
- lecture suivante : `seeded → seeded`, retourne les timestamps persistés ;
- changement de statut : `seeded → mutated`, ajoute uniquement le nouvel
  événement puis persiste.

Invariant : un changement de statut ne modifie jamais les timestamps historiques.

## 7. Contrôles de développement et microcopy

- Les lanceurs DEV ne recouvrent jamais les actions produit ancrées en bas ;
  ils sont compacts et placés dans les coins supérieurs.
- Une commande d'état DEV est idempotente et reste autoritaire pendant le
  bootstrap : elle est rejouée à la frame suivante afin qu'un listener en cours
  de montage ne puisse pas la perdre.
- La commande `loaded` lève l'override transitoire et recharge le jeu de
  missions par défaut ; elle constitue le retour explicite depuis
  `empty | loading | error`.
- Le tooltip d'annulation décrit l'annulation ; celui du lancement décrit le
  lancement.
- Les compteurs utilisent une fonction d'inflexion testée pour `0`, `1`, `2+`.

## Review du modèle

| Cas demandé            | Couverture                                                                    |
| ---------------------- | ----------------------------------------------------------------------------- |
| Nominal                | ouverture filtres, onboarding complet, activation Réglages, analyse fraîche   |
| Erreurs                | teardown sûr, refresh-error conserve les données, date invalide sans mensonge |
| Annulations            | fermeture filtres, retour onboarding, arrêt scan avec copy dédiée             |
| Retries                | retry Réglages et scan restent des événements explicites                      |
| Permissions            | aucune nouvelle permission ; les lectures restent derrière les facades        |
| Terminaux              | onboarding `completed` demeure le seul terminal métier                        |
| Transitions interdites | aucune mutation favorite depuis Réglages, aucun score décidé par l'UI         |

Le modèle est implémentable sans transition implicite et sans décision d'état
par un LLM. Les machines métier existantes restent autoritaires.
