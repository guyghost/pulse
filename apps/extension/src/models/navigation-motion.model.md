# Modèle de mouvement de navigation

Source de vérité pour la présentation de la navigation du side-panel. Le modèle de l'app-shell reste l'autorité pour le bootstrap, les permissions de routes et le chargement différé (lazy loading) des pages ; ce modèle gère uniquement la projection déterministe d'une route acceptée en pilules extensibles et mouvements de page.

## Périmètre

La navigation maintient l'accès aux six destinations produit existantes : `Missions`, `Profil`, `CV`, `Suivi`, `TJM` et `Réglages`. `Missions` conserve l'identité de route `feed` existante ; aucun texte visible ou accessible ne modifie cette valeur de page canonique.

L'ordre canonique des pilules — qui est également l'ordre canonique des index de transition — place `Profil` en premier (le plus à gauche), puis `Missions`, `CV`, `Suivi`, `TJM` et `Réglages`. La position la plus à gauche est uniquement un choix de présentation : elle ne modifie jamais la route initiale. `Missions` (`feed`) reste la page d'atterrissage par défaut dès lors que le garde de route (route guard) de l'app-shell l'accepte, exactement comme auparavant.

Le contrat visuel s'inspire du storyboard retenu pour MissionPulse :

- chaque destination est une pilule distincte ;
- exactement une pilule est déployée et affiche son libellé visible ;
- les pilules inactives sont compactes et n'affichent qu'une icône ;
- la pilule active affiche son icône dans la variante **pleine** (filled), tandis que les pilules inactives affichent la variante de trait (stroke) par défaut — la variante d'icône est une fonction pure de `currentPage`, jamais un état indépendant ;
- la page nouvellement sélectionnée entre depuis la direction de son index de navigation ;
- la page précédemment sélectionnée sort dans la direction opposée.

Il s'agit d'une projection de présentation synchrone et finie, et non d'un workflow métier de longue durée. Elle ne nécessite donc pas d'acteur XState distinct. Le module d'état existant `createAppNavigation` possède la route acceptée et expose la projection consommée par l'UI.

## État et contexte

```ts
type Page = 'feed' | 'profile' | 'cv' | 'applications' | 'tjm' | 'settings' | 'onboarding';
type PagePosition = 'before' | 'current' | 'after';
type NavigationMotionLifecycle = 'mounted' | 'disposed';

interface NavigationMotionContext {
  currentPage: Page;
  previousPage: Page;
  transitionDirection: -1 | 1;
  lifecycle: NavigationMotionLifecycle;
}
```

`transitionDirection` vaut `1` lorsque la page cible a un index canonique supérieur à la page actuelle, et `-1` dans le cas contraire. L'ordre des index canoniques est le suivant :

```ts
const PAGE_INDEX = {
  profile: 0,
  feed: 1,
  cv: 2,
  applications: 3,
  tjm: 4,
  settings: 5,
  onboarding: -1, // route terminale de bootstrap, jamais une pilule
};
```

`PagePosition` est dérivé en comparant une page rendue avec `currentPage` ; il n'est jamais déduit du texte, des icônes ou de l'ordre dans le DOM.

## Événements

```ts
type NavigationMotionEvent = { type: 'NAVIGATE'; page: Page } | { type: 'UNMOUNT' };
```

Seul un événement `NAVIGATE` de l'app-shell ayant franchi avec succès le garde existant `routeAllowed` parvient à ce modèle.

## Table des transitions

| De                                | Événement           | Garde                               | Vers       | Effets                                                                                                               |
| --------------------------------- | ------------------- | ----------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `mounted`                         | `NAVIGATE(target)`  | cible différente et route autorisée | `mounted`  | Calculer la direction, retenir la page précédente, acter la page cible ; le CSS interpole les nouvelles projections. |
| `mounted` pendant l'interpolation | `NAVIGATE(target)`  | cible différente et route autorisée | `mounted`  | Remplacer la destination CSS précédente et recalculer à partir de la page actuellement actée.                        |
| tout état monté                   | `NAVIGATE(current)` | même page                           | identique  | Aucun changement d'état ni de mouvement.                                                                             |
| `mounted`                         | `UNMOUNT`           | —                                   | `disposed` | Cesser d'accepter des événements ; le démontage du DOM annule toute interpolation CSS.                               |
| `disposed`                        | tout événement      | —                                   | `disposed` | Ignorer.                                                                                                             |

## Projection de rendu

Pour chaque pilule de destination :

- active si et seulement si sa page est égale à `currentPage` ;
- la ligne de navigation occupe exactement 100 % de l'espace inline disponible ;
- chaque pilule inactive utilise le même diamètre réactif, compris entre 36 px et 40 px ;
- la pilule active n'a pas de largeur maximale visuelle et consomme tout l'espace restant après soustraction des cinq diamètres inactifs et des cinq espaces (gaps) égaux ;
- le padding externe appartient au shell et est symétrique ; la navigation ne crée jamais d'espace supplémentaire en fin de ligne ;
- le libellé actif a une largeur et une opacité visibles ;
- la pilule active affiche son icône dans la variante pleine (`filled`) ; chaque pilule inactive affiche la variante de trait par défaut (`stroke`). La variante est recalculée à partir de `currentPage` à chaque navigation — elle n'est jamais mémorisée, animée indépendamment, ni pilotée par autre chose que l'égalité de page ;
- le libellé inactif a une largeur visible nulle et n'est pas exposé deux fois aux technologies d'assistance ; le bouton conserve son nom accessible complet via `aria-label` ;
- l'interpolation des pilules dure 180 ms avec une courbe ease-out.

Pour chaque page montée :

- `current` projette `translateX(0)` et est interactive ;
- `before` se projette du côté horizontal négatif et est inerte ;
- `after` se projette du côté horizontal positif et est inerte ;
- l'interpolation de la page dure 220 ms avec une courbe ease-out ;
- tous les conteneurs (wrappers) de page restent montés afin que l'état local et la position de défilement (scroll) survivent à la navigation ;
- les pages masquées restent `aria-hidden` et `inert` pendant toute la durée de la transition.

Lorsque la media query CSS signale la préférence pour des mouvements réduits (`prefers-reduced-motion`), les deux durées s'effondrent à pratiquement zéro et aucune transformation intermédiaire n'est requise. Cette préférence est une entrée de rendu, et non une transition de route.

## Effets de bord

- Le module d'état ne modifie qu'un état de navigation éphémère.
- L'UI applique les transitions CSS de largeur / opacité / transformation.
- Les imports de page, la persistance, la télémétrie et les E/S du bridge restent sous la responsabilité de l'app-shell et demeurent inchangés.
- Le mouvement de page ne déclenche jamais de scan, de transition de tracking ou d'écriture de persistance.

## Revue des erreurs, permissions, réessais et annulations

- **Erreur de bootstrap :** la navigation reste désactivée sous le garde de l'app-shell ; aucun mouvement de pilule ou de page ne démarre.
- **Erreur de chargement de page :** la route acceptée reste active et sa surface d'erreur occupe la position de page courante ; le mouvement n'invente pas un succès.
- **Refus de permission :** une surface de verrouillage autorisée se déplace comme toute autre route acceptée ; le code protégé reste contrôlé par le modèle de l'app-shell.
- **Réessai (Retry) :** réessayer un chunk de page ne modifie pas la pilule active ni la direction.
- **Navigation rapide :** une nouvelle navigation acceptée remplace la destination CSS précédente ; il n'y a aucun événement de complétion capable de muter l'état de la route.
- **Annulation :** le démontage supprime tous les wrappers avec l'instance du shell, de sorte que toute interpolation CSS en cours s'interrompt sans callback côté route.
- **Hors-ligne :** la navigation locale et le mouvement restent disponibles ; l'état du réseau ne choisit pas de route.
- **État terminal :** seul `disposed` est terminal. `settled` est stable mais accepte un autre `NAVIGATE` explicite.

## Transitions interdites

- Aucune navigation pendant les états `bootstrapping` ou `error` de l'app-shell.
- Aucune transition vers une page inconnue.
- Aucun changement d'état lorsque la pilule active est de nouveau sélectionnée.
- Aucune direction de page dérivée de libellés textuels, d'icônes, de sorties de LLM ou de l'ordre d'achèvement des animations.
- Aucune page masquée ne peut recevoir le focus du pointeur, du clavier ou de l'accessibilité.

## Invariants

1. Exactement une destination produit est active lorsque le shell est prêt.
2. Exactement une pilule de destination est déployée.
3. La base active, les cinq diamètres inactifs et les cinq espacements totalisent la largeur complète du contenu de navigation, à chaque largeur de panneau supportée.
4. Chaque destination existante reste accessible et conserve son nom accessible.
5. `PagePosition(page, currentPage)` est déterministe pour chaque page connue.
6. Le mouvement ne modifie que la présentation ; la route et l'état métier restent la propriété du modèle d'app-navigation déterministe existant.
7. Les utilisateurs avec mouvements réduits obtiennent le même état final sans animation perceptible.
8. Un LLM ne choisit jamais une page, une direction, une durée ou une transition de complétion.
9. La pilule la plus à gauche (`Profil`) est un choix de position uniquement : la page d'atterrissage par défaut reste `feed` (`Missions`) dès lors que le garde de route l'accepte, et `PAGE_INDEX` n'influence jamais la sélection de route — uniquement la direction.
10. Seule la pilule active affiche la variante d'icône pleine (`filled`) ; chaque pilule inactive affiche la variante de trait (`stroke`). Aucune pilule ne possède d'état indépendant pour sa variante d'icône.

## Résultat de la revue

- [x] La navigation nominale vers l'avant et vers l'arrière est explicite.
- [x] La re-sélection et le remplacement en cas de navigation rapide sont explicites.
- [x] Les erreurs de bootstrap/chargement de page et les réessais conservent une responsabilité déterministe.
- [x] Les comportements relatifs aux permissions, au mode hors-ligne et aux mouvements réduits sont couverts.
- [x] L'annulation au démontage et l'état terminal sont couverts.
- [x] Aucune destination existante n'est supprimée ou masquée derrière un texte implicite.
- [x] Les largeurs étroites ou larges du side-panel ne peuvent pas laisser d'espace de navigation inutilisé ni tronquer une destination inactive.
- [x] L'ordre canonique (`profile` le plus à gauche) est un choix de présentation qui ne modifie jamais la route initiale `feed` ; la table de direction dérive uniquement de `PAGE_INDEX`.
- [x] La variante d'icône pleine / trait est une projection déterministe de `currentPage` et n'introduit aucun nouvel état ni transition.
