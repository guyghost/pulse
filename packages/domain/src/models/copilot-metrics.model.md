# Modèle : métriques du pilote Copilot

## Objectif

Mesurer si le pilote fermé Copilot produit du contenu utile et révisable sans
donner à l'analytique aucune autorité sur l'état produit. Les métriques
observent les transitions durables déjà acceptées par les machines Copilot.
Elles ne déclenchent, ne relancent, n'approuvent, ne rejettent, ne facturent,
ne remboursent ni ne suppriment jamais un job.

Aucune télémétrie n'est émise par l'extension. Aucun texte de mission, champ de
profil, preuve, résultat généré, session fournisseur ou message d'erreur libre
n'est copié vers un système analytique. L'implémentation initiale est une
projection privée côté serveur sur les enregistrements opérationnels, qui sont
supprimés avec leur dossier.

## Jalons immuables

Chaque job peut persister ces horodatages une seule fois :

| Jalon              | Transition source                             | Règle                |
| ------------------ | --------------------------------------------- | -------------------- |
| `reviewReadyAt`    | commit `JOB_REVIEW_READY` validé              | Première valeur fixe |
| `firstUncertainAt` | première transition vers `uncertain`          | Première valeur fixe |
| `terminalAt`       | `accepted`, `rejected`, `failed`, `cancelled` | Première valeur fixe |

Les horodatages faisant autorité existants demeurent :

- `createdAt` : admission idempotente d'un nouveau job ;
- `providerDispatchedAt` : la commande a potentiellement atteint Eve ;
- `reviewedAt` : acceptation ou rejet explicite par l'utilisateur ;
- heures de réservation / remboursement : écritures du registre de crédits, sans
  analytique dupliquée.

`providerDispatchedAt`, `reviewReadyAt`, `reviewedAt`, `firstUncertainAt` et
`terminalAt` sont estampillés par PostgreSQL. Les horodatages applicatifs
signalent uniquement que la transition modélisée a eu lieu ; ils ne sont jamais
acceptés comme autorité d'horloge. Cela préserve les invariants d'ordre lorsque
les horloges Vercel et Supabase dérivent. Les lignes existantes sont normalisées
avant l'installation des contraintes. `providerDispatchedAt` peut toujours être
effacé lorsque l'adaptateur fournisseur prouve que la commande tentée n'a pu
produire aucun effet distant ; cet effacement constitue une preuve métier, pas
un horodatage de remplacement.

Invariants :

1. `reviewReadyAt >= providerDispatchedAt` lorsque les deux sont connus.
2. `reviewedAt >= reviewReadyAt`.
3. `terminalAt >= createdAt`.
4. `review`, `accepted` et `rejected` exigent `reviewReadyAt`.
5. `accepted`, `rejected`, `failed` et `cancelled` exigent `terminalAt`.
6. Les nouvelles tentatives idempotentes n'écrasent jamais un jalon existant.
7. La suppression d'un dossier supprime les faits de ses jobs ; l'historique
   agrégé peut diminuer.

Les fonctions de base de données peuvent estampiller un jalon après l'acceptation
d'une transition modélisée. Un déclencheur d'horodatage ne décide jamais si une
transition est autorisée.

## Faits privés

La projection réservée au `service-role` peut contenir les identifiants de job
et de dossier, le type d'opération, l'état ou code d'échec borné, les jalons et
les crédits nets dérivés du registre existant. Elle ne doit jamais exposer les
payloads, le consentement, les preuves, les résultats, les artefacts, les
handles fournisseur, les jetons de continuation ni les messages d'erreur.

Il n'existe aucune route publique `/api/copilot/metrics`. L'agrégation
inter-utilisateurs appartient à un rôle opérateur / analytique et doit appliquer
une taille minimale de cellule vérifiée avant tout export.

## Définitions des KPI

- **Taux de contenu approuvé :** dossier ayant au moins un job hors analyse
  accepté. Les fenêtres de cohorte doivent indiquer leur horizon de maturité ;
  le taux sur toute la durée est uniquement diagnostique car les dossiers
  récents sont censurés à droite.
- **Temps jusqu'au premier brouillon utilisable :** création du dossier jusqu'à
  la première acceptation explicite d'un résultat hors analyse par l'utilisateur.
  Publier p50/p90 avec le taux d'approbation.
- **Temps jusqu'à prêt pour révision :** création du dossier jusqu'au premier
  `reviewReadyAt` hors analyse ; c'est un indicateur moteur, pas la preuve que
  le brouillon était utile.
- **Latence fournisseur :** `reviewReadyAt - providerDispatchedAt`.
- **Taux d'erreur / remboursement :** échecs terminaux, première incertitude,
  réservations et remboursements issus du registre faisant autorité, segmentés
  uniquement par type d'opération borné, code d'échec et phase d'incertitude.
- **Coût en crédits par dossier :** crédits nets réservés moins remboursés. Ce
  n'est pas un coût monétaire fournisseur.

## Métriques explicitement indisponibles

- **Coût monétaire Eve par dossier :** indisponible tant qu'une source de
  facturation fournisseur vérifiée n'expose pas un enregistrement stable corrélé
  à une exécution fournisseur. Les données manquantes sont signalées via
  `PROVIDER_BILLING_SOURCE_MISSING`, jamais `0 EUR`.
- **Rétention Premium :** indisponible tant que des événements d'abonnement
  vérifiés ne sont pas stockés prospectivement dans un historique privé
  idempotent en ajout seul (_append-only_). Le statut actuel du profil n'est pas
  une preuve historique. L'impact causal nécessite en outre un plan de
  comparaison revu.

## Confidentialité et jalon de déploiement

La politique de confidentialité publique promet actuellement l'absence de suivi
et d'analytique. Par conséquent, la projection privée peut être préparée et
testée pour le pilote interne désactivé par défaut, mais aucun rapport
comportemental public ni export n'est activé avant une revue de confidentialité
explicite et une mise en cohérence de la politique.
