# Modèle de déduplication des missions

## Périmètre

Ce modèle est la source de vérité pour la résolution d'identité des missions
après le parsing par les connecteurs. Il couvre la détection des doublons et la
sélection de la mission canonique pour les missions republiées, y compris les
cas de proxy de plateforme comme une mission Cherry Pick republiée sur
Free-Work.

## Entrées

- `Mission[]` : missions parsées par les parsers Core des connecteurs.
- `threshold` : confiance minimale requise pour marquer un doublon, par défaut
  `0.8`.
- `source` : identité de plateforme de confiance issue du connecteur, et non du
  texte libre.

Aucune sortie LLM ne peut décider de l'identité d'une mission, du statut de
doublon ou de la sélection canonique. Le scoring sémantique ne peut ajouter des
signaux de revue qu'après la résolution de l'identité de la mission.

## États

| État                 | Signification                                                                               | Terminal |
| -------------------- | ------------------------------------------------------------------------------------------- | -------- |
| `candidate`          | Une mission parsée est prête à être comparée aux missions retenues.                         | Non      |
| `unique`             | Aucune mission retenue compatible n'a atteint le seuil de doublon.                          | Oui      |
| `duplicate`          | Une mission retenue compatible a atteint le seuil de doublon.                               | Oui      |
| `canonical_replaced` | Le nouveau doublon possède une priorité canonique ou une qualité supérieure à la retenue.   | Oui      |
| `rejected_candidate` | Une mission retenue a été évaluée mais a échoué aux contrôles de compatibilité ou de seuil. | Oui      |

## Événements et transitions

| Événement                   | De          | Garde                                                                                                                            | Vers                 | Effet                                                                 |
| --------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------- |
| `same_url`                  | `candidate` | les URL normalisées correspondent et ont toutes deux un chemin spécifique                                                        | `duplicate`          | enregistre la relation avec une confiance `1`                         |
| `same_structured_signature` | `candidate` | les signatures normalisées de titre, client et stack correspondent                                                               | `duplicate`          | enregistre la relation avec une confiance `1`                         |
| `proxy_repost_match`        | `candidate` | un client est un proxy de plateforme connu, les lieux sont compatibles, le recouvrement de titre est fort et la stack suffisante | `duplicate`          | enregistre la relation avec la raison `same_title_stack_proxy_client` |
| `direct_source_preferred`   | `duplicate` | la priorité de source ou la qualité du doublon est supérieure à celle de la mission retenue                                      | `canonical_replaced` | la mission retenue est remplacée par la meilleure mission canonique   |
| `client_conflict`           | `candidate` | les vrais noms de clients divergent et aucun n'est un proxy de plateforme                                                        | `rejected_candidate` | aucune relation n'est enregistrée                                     |
| `location_conflict`         | `candidate` | les localisations spécifiques divergent sans contexte compatible avec le télétravail                                             | `rejected_candidate` | aucune relation n'est enregistrée                                     |
| `below_threshold`           | `candidate` | la confiance calculée est inférieure au seuil                                                                                    | `rejected_candidate` | aucune relation n'est enregistrée                                     |
| `no_candidate`              | `candidate` | aucune mission retenue ne partage de jetons indexés                                                                              | `unique`             | ajoute la mission à l'ensemble retenu                                 |

## Invariants de parsing Cherry Pick

- Les `skills` Cherry Pick ne deviennent `Mission.stack` que lorsque chaque
  élément est un libellé de compétence concis.
- Les paragraphes de description, explications sémantiques ou textes sous forme
  de phrases trouvés dans `skills` sont écartés.
- La sortie du parser reste pure : zéro I/O, aucun accès à l'horloge et aucun
  appel LLM.
- `description` reste l'unique champ pour le texte long de la mission après
  nettoyage des métadonnées.

## Invariants de déduplication

- La déduplication dans le Core est déterministe et pure.
- Un nom de plateforme connu dans `client` indique une source proxy, pas le
  client final réel.
- Les republications Free-Work avec le client `Cherry Pick` doivent se résoudre
  vers la mission Cherry Pick lorsque les signaux de titre et de stack
  correspondent.
- Les sources directes / natives priment sur les agrégateurs généralistes
  lorsque la confiance de doublon est suffisamment élevée.
- Des clients réels incompatibles ou des localisations spécifiques incompatibles
  empêchent la fusion.
- Les relations de doublon pointent toujours de la mission canonique retenue
  vers la mission dupliquée.

## Checklist de revue

- Nominal : les URL exactes, signatures structurées exactes et republications
  proxy fusionnent.
- Erreurs : les champs optionnels malformés sont tolérés par la normalisation du
  parser et ne lèvent pas d'exception.
- Annulations / relances : non applicable dans le Core ; le comportement
  d'annulation / relance du scan dans le Shell ne doit pas modifier les décisions
  de déduplication.
- Permissions : non applicable dans le Core ; les permissions des connecteurs
  affectent uniquement la disponibilité des missions en entrée.
- États terminaux : chaque candidat se termine en `unique`, `duplicate`,
  `canonical_replaced` ou `rejected_candidate`.
- Interdit : transitions d'état fondées sur du texte LLM, une raison sémantique
  ou une sortie de prompt libre.
