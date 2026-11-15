# Modèle de feuille inférieure des filtres du Feed

Source de vérité pour la feuille inférieure de filtres du feed de missions,
inspirée des feuilles mobiles de filtrage et de tri de Notion. Le filtrage
déterministe existant du feed reste souverain pour déterminer quelles missions
correspondent. Ce modèle gère l'ouverture de la feuille, la modification de la
projection de filtres en direct, sa réinitialisation et sa fermeture.

Le flux est synchrone et local à l'UI. Il ne nécessite pas d'acteur XState : il
n'y a ni I/O, ni timer de relance, ni worker concurrent, ni acquittement de
persistance, ni effet de longue durée. Une fonction de transition pure est la
projection exécutable consommée par la page Svelte.

## État et contexte

```ts
interface FeedFilterDraft {
  decisionPreset: 'priority' | 'remote-compatible' | 'tjm-negotiation' | 'new' | null;
  selectedScoreBucket: 'strong' | 'good' | 'weak' | null;
  selectedTjmMin: number | null;
  selectedSource: MissionSource | null;
  selectedRemote: RemoteType | null;
  selectedCategory: MissionCategory | null;
  selectedSeniority: SeniorityLevel | null;
  selectedStacks: string[];
}

type FeedFilterSheetState =
  { value: 'closed' } | { value: 'open'; filters: FeedFilterDraft } | { value: 'disposed' };
```

L'instantané de filtres à l'état ouvert est immuable. Les tableaux sont copiés à
chaque frontière du modèle afin que l'état de la page et la commande émise ne
partagent jamais de référence (_alias_).

## Événements

```ts
type FeedFilterSheetEvent =
  | { type: 'OPEN'; committed: FeedFilterDraft }
  | { type: 'TOGGLE_PRESET'; preset: NonNullable<FeedFilterDraft['decisionPreset']> }
  | { type: 'SET_SCORE_BUCKET'; bucket: FeedFilterDraft['selectedScoreBucket'] }
  | { type: 'SET_TJM_MIN'; tjmMin: FeedFilterDraft['selectedTjmMin'] }
  | { type: 'SET_SOURCE'; source: FeedFilterDraft['selectedSource'] }
  | { type: 'SET_REMOTE'; remote: FeedFilterDraft['selectedRemote'] }
  | { type: 'SET_CATEGORY'; category: FeedFilterDraft['selectedCategory'] }
  | { type: 'SET_SENIORITY'; seniority: FeedFilterDraft['selectedSeniority'] }
  | { type: 'TOGGLE_STACK'; stack: string }
  | { type: 'RESET_FILTERS' }
  | { type: 'DISMISS'; reason: 'button' | 'scrim' | 'escape' | 'page-hidden' }
  | { type: 'DISPOSE' };
```

## Commandes

```ts
type FeedFilterSheetCommand = { type: 'NONE' } | { type: 'SYNC_FILTERS'; filters: FeedFilterDraft };
```

Chaque modification de filtre acceptée émet exactement une commande
`SYNC_FILTERS`. La page la consomme de manière synchrone, de sorte que la liste
des missions et le compteur de résultats en direct changent pendant que la
feuille reste ouverte. La fermeture ne rejoue ni n'annule jamais les filtres.

## Table de transitions

| De         | Événement                                          | Garde                            | Vers       | Commande / effet                                                  |
| ---------- | -------------------------------------------------- | -------------------------------- | ---------- | ----------------------------------------------------------------- |
| `closed`   | `OPEN(committed)`                                  | filtres structurellement valides | `open`     | Copie les filtres validés dans l'état ouvert.                     |
| `closed`   | édition / reset / dismiss                          | —                                | `closed`   | Aucune.                                                           |
| `open`     | preset / score / TJM / source / remote / seniority | payload canonique                | `open`     | Normalise, copie et émet `SYNC_FILTERS`.                          |
| `open`     | `TOGGLE_STACK(stack)`                              | stack après trim non vide        | `open`     | Ajoute / retire une stack unique ; émet `SYNC_FILTERS`.           |
| `open`     | `RESET_FILTERS`                                    | —                                | `open`     | Vide tous les filtres propres à la feuille ; émet `SYNC_FILTERS`. |
| `open`     | `DISMISS(*)`                                       | —                                | `closed`   | Ferme uniquement ; les filtres en direct restent validés.         |
| tout actif | `DISPOSE`                                          | —                                | `disposed` | Abandonne l'instantané de filtres et n'accepte plus d'événement.  |
| `disposed` | tout                                               | —                                | `disposed` | Aucune.                                                           |

La normalisation des presets est déterministe :

- sélectionner le preset déjà sélectionné le désactive ;
- sélectionner `priority` efface un palier de score afin que deux autorités de
  score n'entrent pas en conflit ;
- sélectionner `remote-compatible` efface un mode de travail explicite ;
- sélectionner `tjm-negotiation` efface un minimum de TJM explicite ;
- sélectionner un palier de score ou un mode de travail explicite efface le
  preset en conflit lorsque nécessaire ;
- sélectionner un minimum de TJM explicite positif et fini efface le preset
  `tjm-negotiation` en conflit ; les valeurs invalides sont ignorées et les
  valeurs acceptées sont arrondies à l'euro entier ;
- `tjm-negotiation` utilise la cible TJM du profil déjà détenue par le feed ;
- sélectionner `new` utilise la projection de file stable existante des
  nouveautés.

## Projection de présentation

- `closed` : la feuille et le scrim n'existent pas ; le déclencheur des filtres
  annonce `aria-expanded="false"`.
- `open` : le déclencheur annonce `aria-expanded="true"` ; un scrim modal
  recouvre tout le Feed, dock inclus, et une feuille structurée est ancrée au
  bord inférieur. Trois pilules de filtre rapide se trouvent au-dessus des
  lignes explicites de note minimale et de TJM minimum, suivies de la section
  des sources de connecteurs.
- La feuille utilise une surface blanche, un grand bord supérieur arrondi et une
  poignée centrée. Elle occupe environ 70 % de la hauteur disponible, glisse
  verticalement depuis le bord inférieur et laisse suffisamment d'espace
  au-dessus de son bord supérieur pour un contrôle circulaire de fermeture
  détaché.
- La section des sources affiche chaque connecteur renvoyé par le catalogue
  filtré au build comme un sélecteur à vrai logo. Elle projette également les
  compteurs déterministes de missions dans une liste de couverture compacte et
  des indicateurs de progression natifs proportionnels.
- La sélection de source reste canonique et à valeur unique : `null` signifie
  que toutes les sources embarquées sont incluses ; sélectionner un logo émet
  `SET_SOURCE` pour cette source ; sélectionner à nouveau le logo actif émet
  `SET_SOURCE(null)`.
- Les compteurs de connecteurs, le chargement des logos et les largeurs de
  barres sont uniquement des signaux de présentation. Ils ne peuvent ni
  sélectionner une source ni déclencher une transition.
- Le contrôle de fermeture détaché se trouve hors de la surface de la feuille,
  reste visuellement associé au déclencheur des filtres et constitue le moyen
  principal de reprendre le contrôle direct du Feed assombri. Le scrim est une
  cible de fermeture secondaire.
- Le dock reste monté sous le scrim dans les deux états afin que sa géométrie ne
  saute pas, mais il n'est pas opérable tant que la feuille modale est ouverte.
- Le focus initial se déplace vers le conteneur de la feuille sans contour. La
  fermeture rend le focus au déclencheur du dock lorsqu'il reste connecté.
- `Escape`, l'action explicite `Terminer`, le bouton de fermeture détaché, un
  clic sur le scrim et le masquage de la page Feed déclenchent `DISMISS`.
- Le mouvement réduit met à zéro les durées du scrim et du glissement de la
  feuille sans changer l'état, le focus ni les résultats des filtres.

## Effets de bord et propriété

- L'ouverture et la fermeture n'effectuent aucune I/O et n'altèrent pas les
  filtres.
- Les éditions acceptées et la réinitialisation émettent une unique commande
  synchrone typée. La projection de filtres existante de `feed-page.svelte.ts`
  détient la liste de missions résultante.
- Le sélecteur explicite de TJM filtre les missions supérieures ou égales à la
  valeur choisie. Le preset existant `tjm-negotiation` reste disponible comme
  preset de décision rapide distinct et ne peut pas être actif en même temps.
- La couverture des sources lit l'agrégat déterministe existant du Feed. Un
  compteur manquant est affiché à zéro et n'implique ni une erreur de connecteur
  ni un état désactivé.
- Un favicon de connecteur en échec se replie sur les initiales du connecteur
  sans modifier les données de sélection ni de compteur.
- La recherche est détenue par la saisie centrale du dock. Les détails
  opérationnels sont détenus par l'action droite du dock. Aucun des deux n'est
  décidé par ce modèle.
- La feuille ne démarre jamais un scan, ne modifie jamais un connecteur, ne
  persiste jamais une vue et n'ouvre jamais d'URL externe.

## Revue d'erreurs, annulation, relance et permissions

- **Événement invalide / inconnu :** ignoré avec `NONE` ; l'état reste inchangé.
- **Texte de stack invalide :** les valeurs vides ou composées uniquement
  d'espaces sont ignorées.
- **TJM invalide :** les valeurs non finies et non positives sont ignorées.
- **Compteur de source manquant :** normalisé à zéro pour la présentation.
- **Échec de logo :** affiche le repli déterministe par initiales ; aucune
  relance ni transition d'état n'est effectuée par la feuille.
- **Fermeture :** ferme la feuille sans émettre de synchronisation dupliquée.
  Les changements déjà synchronisés restent visibles par conception.
- **Ouverture / fermeture rapide :** `OPEN` alors que déjà ouvert est ignoré,
  afin qu'un double déclenchement ne puisse pas remplacer l'instantané en
  direct.
- **Navigation de page :** `page-hidden` ferme avant que le Feed ne devienne
  inerte ; revenir sur Missions démarre fermé avec les derniers filtres en
  direct.
- **Hors ligne :** le filtrage local reste disponible ; aucune relance réseau
  n'existe.
- **Permissions :** aucune permission n'est demandée ni interprétée.
- **Relance :** il n'y a aucune opération asynchrone à relancer.
- **État terminal :** `disposed` est terminal et ne contient aucun instantané.

## Transitions interdites

- Aucune mutation de filtre tant que fermé ou détruit (`disposed`).
- Aucun retour arrière implicite depuis la fermeture, le scrim, Escape, la
  navigation ou le démontage.
- Aucun preset, source, valeur de télétravail, séniorité ou palier de score
  inconnu.
- Aucune stack dupliquée.
- Aucun callback d'animation, texte rendu ou sortie LLM ne choisit un état de
  filtre.

## Invariants

1. Au plus une feuille inférieure de filtres est ouverte pour une instance de
   page Feed.
2. Les états `closed` et `disposed` ne conservent aucun instantané de filtres.
3. Les tableaux ouverts ne partagent jamais de référence avec les tableaux
   validés ni avec les tableaux des commandes émises.
4. Exactement une commande `SYNC_FILTERS` est émise par édition acceptée ou
   réinitialisation.
5. Chaque chemin de fermeture émet `NONE`.
6. Les autorités conflictuelles de preset et de filtre explicite sont
   normalisées.
7. Le dock reste monté et visuellement séparé du contenu du feed ; la feuille
   modale ouverte l'empêche d'être manipulé.
8. Le modèle — et non le texte d'un composant, le timing d'animation ou un LLM —
   décide du filtrage.
9. Les compteurs de sources et les résultats de chargement des logos ne décident
   jamais de la sélection de source.
10. Le sélecteur de sources n'expose que les connecteurs présents dans le
    catalogue filtré au build.

## Résultat de revue

- [x] Chemins nominaux d'ouverture, édition en direct, réinitialisation et
      fermeture explicites.
- [x] Contrôle de fermeture détaché, Terminer, scrim, Escape, changement de
      route et destruction explicites.
- [x] Ouverture dupliquée, éditions pendant la fermeture et entrées invalides
      couverts.
- [x] Hors ligne, permissions, erreurs, absence de relance et destruction
      terminale couverts.
- [x] Preset et champs explicites en conflit ne peuvent pas créer d'autorité
      implicite.
- [x] Mouvement de la feuille inférieure réversible, purement de présentation et
      sûr pour le mouvement réduit.
- [x] Comportement de sélection de source, désélection, compteur à zéro et repli
      de logo explicites.
- [x] Chaque changement de mission reste détenu par l'état déterministe de la
      page Feed.
