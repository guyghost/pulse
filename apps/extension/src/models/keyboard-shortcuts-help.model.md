# Aide des raccourcis clavier — Modèle d'interaction et de lisibilité

Ce document est la source de vérité pour le panneau d'aide des raccourcis
clavier. Il modélise uniquement une superposition de présentation : il
n'enregistre, ne modifie ni n'exécute jamais de raccourci clavier. Le registre de
raccourcis reste l'autorité pour la liste.

Règle : _« Si le comportement ne peut pas être modélisé, il n'est pas prêt à
être implémenté. »_ Il n'y a aucun LLM dans ce flux.

## Périmètre

Le panneau est rendu par `KeyboardShortcutsHelp.svelte` et contrôlé par l'état
de page `showShortcutsHelp`. Il présente les raccourcis actuellement
enregistrés, regroupés selon leur catégorie déclarée.

## Machine à états

```
États : closed · open

                 OPEN (? ou action du toast de première utilisation)
  closed ──────────────────────────────────────────────────────────► open
                                                                       │
                  CLOSE_BUTTON · CLOSE_BACKDROP · ESCAPE
  closed ◄─────────────────────────────────────────────────────────────┘
```

| De     | Événement                                           | Vers   | Effet                                                                                                |
| ------ | --------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| closed | `OPEN`                                              | open   | Affiche le dialogue, expose l'instantané du registre et déplace le focus sur le bouton de fermeture. |
| open   | `CLOSE_BUTTON`                                      | closed | Passe la valeur liée `isOpen` à `false`.                                                             |
| open   | `CLOSE_BACKDROP` (la cible du pointeur est le fond) | closed | Passe la valeur liée `isOpen` à `false`.                                                             |
| open   | `ESCAPE`                                            | closed | Passe la valeur liée `isOpen` à `false`.                                                             |
| open   | Toute autre touche / pointeur dans le panneau       | open   | Aucune transition d'état.                                                                            |

`open` n'est pas terminal : le panneau peut être rouvert après toute fermeture.
Les raccourcis enregistrés eux-mêmes restent détenus par
`shell/utils/keyboard-shortcuts.ts` ; l'affichage de l'aide ne doit pas muter
ce registre.

La livraison de `OPEN` est liée à l'enregistrement des raccourcis de la page
feed : l'écouteur global `?` est installé par l'effet de montage de la page
feed, et une pression sur `?` déclenchée avant cet enregistrement est ignorée —
il n'y a ni file d'attente ni rejeu. `OPEN` est donc éventuellement livrable
(_eventually-deliverable_), jamais instantanément livrable : les scénarios
doivent attendre que l'enregistrement soit actif (en réappuyant sur `?` jusqu'à
l'apparition du dialogue) avant d'asserter l'état du dialogue.

Note de livraison synthétique : l'identifiant dans le registre du raccourci
d'aide est `shift+?` (`SHOW_HELP` déclare `shift: true`). Un clavier réel envoie
`Shift+Slash`, donc les scénarios automatisés doivent synthétiser `Shift+Slash` —
une pression synthétique `?` sans le modificateur Shift produit l'identifiant
`?` et ne correspond jamais au registre.

## Hiérarchie de lisibilité

```
scrim (contexte uniquement ; visuellement atténué)
└─ surface du dialogue (tout le contenu d'aide ; lisible au contraste AA)
   ├─ en-tête : icône, titre, objectif concis, action de fermeture
   ├─ liste groupée défilante
   │  └─ libellé de catégorie → description du raccourci → touche clavier
   └─ pied de page : note sur la saisie et action d'acquittement
```

Le scrim et la surface du dialogue sont des couches distinctes. Le scrim
assombrit uniquement le feed sous-jacent. Le dialogue utilise les tokens de
surface et de texte sémantique du design system, afin que le titre, les libellés
de section, les descriptions, les touches et le texte de pied de page
n'héritent jamais du faible contraste du scrim.

## Invariants

- **I1 — Fidélité au registre.** Chaque élément affiché provient de
  `getRegisteredShortcuts()` et utilise `formatShortcut()`. Aucun raccourci
  uniquement UI ne peut être inventé ou exécuté ici.
- **I2 — Regroupement stable.** Les catégories conservent leur ordre déclaré :
  Navigation, Actions, Recherche, Filtres, Aide, puis Autres / alphabétique.
- **I3 — Chemin de lecture unique et clair.** Un libellé de catégorie précède
  ses lignes ; chaque ligne présente exactement une description d'action et une
  touche alignée à droite.
- **I4 — Frontière de contraste.** Aucun texte d'aide ni contrôle n'est placé
  directement sur le scrim sombre translucide. La surface du dialogue possède un
  arrière-plan opaque et un token de bordure / élévation visible.
- **I5 — Fermeture prévisible.** Bouton de fermeture, bouton d'acquittement,
  clic sur le fond et `Escape` produisent tous la même transition
  `open → closed`.
- **I6 — Contexte préservé.** Le feed n'est pas muté pendant l'ouverture du
  panneau ; la fermeture restaure exactement le même état du feed en dessous.
- **I7 — Sémantique clavier.** Le conteneur expose `role="dialog"`,
  `aria-modal="true"` et un titre accessible. Son contrôle de fermeture possède
  un nom accessible clair et reçoit le focus à l'ouverture du dialogue.
- **I8 — Distance de balayage bornée.** La surface utilise la largeur disponible
  dans un panneau latéral étroit, mais est centrée et contrainte aux grandes
  largeurs afin que chaque action reste visuellement associée à sa touche.

## Checklist de revue

- Nominal : l'ouverture via `?` ou l'action du toast de première utilisation
  affiche toutes les catégories et tous les raccourcis enregistrés.
- Erreur / vide : un registre vide affiche une zone de liste intentionnellement
  vide ; la fermeture fonctionne toujours.
- Annulation : cliquer à l'intérieur du panneau ne le ferme pas ; cliquer sur le
  scrim le ferme.
- Relance : le panneau peut être rouvert immédiatement après fermeture sans
  lignes périmées.
- Permissions : aucune permission Chrome, persistance, appel réseau ou worker
  IA n'est impliqué.
- État terminal : `closed` démonte le dialogue et laisse le feed intact.

## Correspondance de vérification

`tests/unit/ui/KeyboardShortcutsHelp.test.ts` vérifie le regroupement, la
structure sémantique du dialogue, la séparation des couches scrim / surface et
chaque chemin de fermeture pris en charge. L'inspection visuelle dans le
navigateur vérifie que la surface reste lisible aux largeurs étroites et larges
du panneau latéral.
