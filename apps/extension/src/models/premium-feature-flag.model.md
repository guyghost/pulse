# Premium Feature Flag — modèle historique remplacé

> **Statut : remplacé.** La source de vérité du produit freemium est
> [`models/freemium-entitlement-provisioning.model.md`](../../../../models/freemium-entitlement-provisioning.model.md).

Ce document conserve uniquement le constat nécessaire à la migration. Il ne
doit plus guider une nouvelle décision d'accès, une interface ou un message
marketing.

## Comportement historique encore présent

- La constante core `PREMIUM_FEATURE_ENABLED` vaut `false`.
- Quand le flag est dormant, les surfaces anciennement gated sont
  déverrouillées.
- Quand le flag est actif, la garde repose sur le booléen local
  `premium_enabled`.
- Le side panel peut lire et écrire ce booléen via
  `GET_PREMIUM_STATUS` / `SET_PREMIUM`.
- Le handler `GENERATE_ASSET` consulte ce mécanisme avant d'appeler Gemini Nano.
- Le DevPanel permet de simuler les combinaisons flag/compte.

Ce comportement est une dette de migration. Il ne constitue pas un
entitlement : le client peut écrire la valeur et aucune autorité de paiement ne
la signe.

## Règles de migration

1. Ne pas activer ce flag en production pour lancer le nouveau Premium.
2. Construire d'abord l'autorité serveur, le ledger webhook et la projection
   versionnée définis par le modèle freemium.
3. Remplacer les messages locaux par la projection authentifiée.
4. Supprimer `SET_PREMIUM` des builds de production ; conserver un override
   strictement dev pour les scénarios QA.
5. Retirer le flag historique seulement après migration de toutes les surfaces
   et tests d'expiration, révocation et changement de compte.
6. Ne jamais migrer `premium_enabled === true` vers un entitlement payé.

Le LLM ne décide aucune transition dans l'ancien mécanisme ni dans sa migration.
