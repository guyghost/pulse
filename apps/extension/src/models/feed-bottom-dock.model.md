# Dock inférieur du Feed — Modèle de présentation

> Source de vérité pour le dock flottant inférieur du feed. Il s'agit d'une
> projection de présentation synchrone sur l'état `feed-page` existant (même
> nature que `navigation-motion.model.md`) : aucune machine XState, aucun nouvel
> état métier — le dock dérive tout d'un état déjà détenu et ne possède que son
> rendu.

## Périmètre

Le feed expose un **dock flottant** ancré au-dessus du bord inférieur de la
liste défilante des missions. Le dock est composé de **trois éléments séparés**,
chacun autonome et travaillé individuellement — jamais d'une barre unifiée :

1. une **pilule de recherche** (champ de saisie, s'élargit avec le contenu),
2. un **bouton filtres** rond (ouvre la feuille de filtres),
3. un **bouton activité** rond (« détails opérationnels »).

Le dock reste visible dès que la page feed est la page active de l'application,
flotte **au-dessus** de la liste défilante (le contenu défile en dessous) et
disparaît avec la page lorsque le feed devient inactif.

## État et contexte

Le dock ne possède aucun état. Tout est dérivé :

| Préoccupation du dock   | Propriétaire (existant)                                 |
| ----------------------- | ------------------------------------------------------- |
| Visibilité de page      | `app-navigation` — montage `{#if active}` de `FeedPage` |
| Requête de recherche    | module d'état `feed-page`                               |
| Feuille filtres ouverte | machine `feed-filter-sheet.model.md` (`filterOpen`)     |
| Indicateur filtre actif | état dérivé `feed-page` (`filterActive`)                |
| Retour du focus         | `feed-filter-sheet.model.md` (Escape → déclencheur)     |

Contrat : les boutons du dock peuvent **appeler** des actions existantes
(basculer la feuille, focaliser la saisie) mais ne définissent jamais de
nouvelles transitions métier. Aucun LLM, aucun texte libre, aucune heuristique
ne produit jamais un état du dock.

## Contrat de rendu — Liquid Glass, par élément

Chacun des trois éléments est une surface flottante indépendante. La lisibilité
est garantie sur un contenu clair, sombre et saturé, au repos, au survol et
pendant que le contenu défile en dessous.

Par élément :

- **Couche de surface translucide :** arrière-plan utilisant le token
  `surface-white` à une opacité bornée (45–65 %), afin que le contenu sous-jacent
  reste perceptible sans jamais concurrencer le texte au premier plan.
- **Traitement d'arrière-plan :** `backdrop-blur` plus `backdrop-saturate` sur
  le même élément, dosés de sorte que le contenu défilant se fonde en une teinte
  cohérente plutôt qu'en bruit net (flou ≥ 16 px, saturation ≥ 150 %).
- **Définition par filet fin :** une bordure claire de 1 px (blanc ≈ 70 %
  d'opacité) tout autour de l'élément, gardant chaque silhouette nette et
  empêchant la fusion visuelle entre éléments voisins.
- **Bord supérieur spéculaire :** un reflet supérieur intérieur (dégradé / ligne
  blanche à forte opacité) simulant la lumière rasant le bord supérieur du verre.
- **Élévation en couches :** deux ombres empilées — une grande ombre diffuse
  (douce, faible opacité, grand flou) et une ombre de contact plus serrée (petit
  décalage, opacité plus élevée) — afin que l'élément se détache visiblement du
  contenu.
- **Harmonisation des états :** hover / active / focus-within ajustent
  l'opacité et l'intensité des ombres dans le même langage vitré (légèrement
  plus opaque, un cran d'ombre en plus) ; focus-within affiche aussi l'anneau de
  focus accessible.

Les trois éléments partagent le même langage de calibration (même bordure, pile
d'ombres, traitement de flou) tout en restant des surfaces visuellement
distinctes et séparées — une **notion de jetons de verre empilés**, pas une
barre unique.

## Contrat d'interaction

- Saisie de recherche : comportement standard de champ texte, détenu par l'état
  de requête `feed-page` ; la saisie ne déclenche jamais de navigation ni de
  transition de feuille.
- Bouton filtres : envoie l'événement d'ouverture `feed-filter-sheet` existant ;
  `aria-expanded` reflète l'état de la machine ; `aria-controls="filter-panel"`
  est conservé ; Escape ferme la feuille et **rend le focus au déclencheur des
  filtres** (comportement existant, désormais garanti par contrat).
- Badge du bouton filtres : un petit point actif est affiché lorsque
  `filterActive` est vrai et que la feuille est fermée — purement dérivé.
- Bouton activité : ouvre la surface existante de détails opérationnels. Aucune
  nouvelle transition.

## Ordre Z et mise en page

- L'ordre Z du dock reste **en dessous** de la superposition de la feuille de
  filtres (la feuille s'affiche au-dessus du dock lorsqu'elle est ouverte).
- La liste de missions réserve une marge inférieure (`pb-28` / `pb-40`) afin que
  les derniers éléments ne soient jamais masqués en permanence par le dock.
- Le dock ne recouvre jamais la sémantique du déclencheur de la feuille de
  filtres ; lorsque la feuille est ouverte, le dock reste monté en dessous.

## Effets de bord

- Aucun au-delà des actions `feed-page` / `filter-sheet` existantes invoquées
  par l'interaction utilisateur. Le dock lui-même n'effectue aucune I/O, aucune
  persistance, aucun appel bridge.

## Revue d'erreurs, permissions, relances et annulation

- **États d'erreur de la feuille de filtres :** gérés par le modèle de la
  feuille de filtres ; le dock reste stable et refocalisable.
- **Saisie de recherche vide / longue :** dérivation pure de `feed-page` ; la
  pilule s'agrandit, les deux boutons ronds gardent une taille fixe.
- **Feed inactif :** le dock se démonte avec la page (existant `{#if active}`) ;
  aucun élément orphelin ne survit.
- **Ouverture / fermeture rapide de la feuille :** gérée par la machine ; le dock
  reflète uniquement l'état `aria`.
- **Mouvement réduit :** le dock n'a aucune exigence d'animation d'entrée /
  sortie ; seules les règles de transition de page existantes s'appliquent.

## Interdits

- Aucune barre unifiée fusionnant les trois éléments.
- Aucun état du dock dérivé d'une sortie LLM ou d'un texte libre.
- Aucun accès direct à `chrome.*` / IndexedDB depuis les handlers du dock (tout
  passe par les modules d'état / bridge existants).
- Aucun masquage du contenu de la liste sans réservation de marge.
- Aucun nouveau piège de focus : le comportement Escape / focus reste détenu par
  le modèle de la feuille de filtres.

## Invariants

1. Le dock est rendu ssi la page feed est la page courante de l'application.
2. Le dock se compose toujours exactement de trois éléments séparés,
   individuellement bordés et ombrés.
3. Chaque élément conserve son `backdrop-filter`, sa bordure fine et ses ombres
   en couches dans chaque état (repos, survol, actif, focus-within, défilement
   en dessous).
4. L'opacité de surface reste dans la plage bornée sur chaque élément.
5. Escape avec la feuille de filtres ouverte ferme la feuille et restaure le
   focus sur le déclencheur des filtres.
6. La marge inférieure effective de la liste de missions dégage toujours la
   hauteur du dock.
7. Tous les états des boutons du dock dérivent exclusivement de l'état de
   `feed-page` et de la feuille de filtres.

## Résultat de revue

- [x] États nominal, survol, actif, focus couverts par élément.
- [x] Visibilité par rapport à la page active et à l'ordre Z de la feuille de
      filtres couverte.
- [x] Escape / retour du focus et dérivation du badge couverts.
- [x] Aucun nouvel état métier ; toutes les dérivations tracées vers les
      propriétaires existants.
- [x] Lisibilité sur contenu clair / sombre / saturé traitée par le contrat
      opacité bornée + flou + saturation.
