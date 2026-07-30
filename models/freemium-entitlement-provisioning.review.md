# Freemium, entitlement et assistance candidature — Review

Statut : **Review v2 post-implémentation, 30 juillet 2026**

Source de vérité :
[`freemium-entitlement-provisioning.model.md`](./freemium-entitlement-provisioning.model.md)

Cette revue confronte le modèle aux quatre surfaces du produit et au schéma de
données. Elle remplace la review pré-implémentation. Les vérifications
automatisées exécutées sont consignées à la fin du document.

## 1. Conclusion

Le flux freemium est désormais cohérent sur son chemin critique :

- offre gratuite utile et premier compte par plateforme ;
- Premium fixé à **10 € TTC/an** ;
- deux droits Premium seulement : `multi_account` et
  `application_form_ai_assistance` ;
- entitlement versionné et autoritaire côté serveur ;
- checkout authentifié, webhook signé, application idempotente et refus des
  événements obsolètes ;
- extension liée explicitement à une identité Pulse via secret local et hash
  serveur révocable ;
- multi-compte sous cette identité, quota serveur et permutation atomique ;
- assistance locale dans un worker dédié, consentement explicite, validation
  champ par champ, contrôle de fraîcheur, rollback et absence de soumission ;
- landing, dashboard de compte, dashboard opérationnel et extension alignés sur
  la même offre.

La mise en production reste conditionnée à une validation sandbox du
prestataire, à l'application de la migration sur un environnement vide et à une
revue Chrome réelle des permissions/Worker. Aucun secret, variant réel, URL
Chrome Store exacte, commande fournisseur ou donnée de production n'a été
créé.

## 2. Faits observés après implémentation

### 2.1 Domaine et transitions

1. `packages/domain/src/freemium.ts` porte le catalogue immuable
   `premium_yearly`, 1000 centimes EUR, cadence annuelle et prix TTC.
2. La garde `canUsePremiumFeature` refuse par défaut une projection absente,
   expirée, périmée, appartenant à un autre compte ou sans feature.
3. Les machines XState couvrent checkout, webhook, liaison extension,
   ajout/switch de binding et assistance de formulaire.
4. Le consentement de formulaire possède les états explicites
   `awaiting_consent`, `consent_refused_terminal` et `cancelled_terminal`.
5. Une sortie LLM est seulement un tableau de suggestions validé par Zod. Elle
   n'importe aucune machine et ne produit aucun événement d'état.

### 2.2 Checkout, webhook et provisioning

1. `/api/checkout/premium` exige une session Pulse et n'accepte qu'un
   `requestId`; le prix et le variant sont résolus côté serveur.
2. La même clé est conservée par le dashboard pendant les retries de la
   tentative courante.
3. La réponse checkout du fournisseur est acceptée uniquement avec une URL
   HTTPS.
4. Le webhook vérifie la signature avant parsing et exige
   `account_id`, `checkout_attempt_id` et `offer_id` dans `custom_data`.
5. La fonction SQL `apply_premium_billing_event` réserve l'événement, vérifie
   l'intent fixe à 10 EUR TTC, ordonne les signaux, projette l'entitlement et
   met à jour l'intent dans une transaction.
6. Un retour navigateur reste `awaiting_payment`; il n'accorde aucun droit.
7. Les crédits restent un commerce séparé. Aucun solde ou achat de crédit
   n'accorde Premium.

### 2.3 Liaison de l'extension et permissions

1. Le secret d'appareil est créé localement ; seul son hash est envoyé au
   démarrage de la liaison et persisté côté serveur.
2. L'approbation ou le refus est explicite dans une page authentifiée.
3. Le token peut être révoqué et la projection est rafraîchie par un endpoint
   authentifié par appareil.
4. L'ancienne policy RLS qui autorisait un utilisateur à modifier directement
   `extension_devices` est remplacée par une policy de lecture seule.
5. `SET_PREMIUM` n'existe plus dans le bridge de production. Le message
   historique de lecture projette seulement l'entitlement canonique.

### 2.4 Multi-compte et provenance

1. Un premier binding est autorisé gratuitement par connecteur.
2. Un binding supplémentaire exige l'entitlement `multi_account`; le quota est
   défini côté serveur, borné entre 2 et 20, avec défaut conservateur à 2.
3. Les RPC d'ajout et de switch utilisent des advisory locks et un index partiel
   impose un seul binding actif par compte/connecteur.
4. Le switch vérifie le propriétaire, l'entitlement et le hash de la session
   courante avant commit.
5. Un déclassement garde le binding actif et verrouille les bindings non actifs.
6. Le scanner refuse un connecteur si la session ne correspond pas au binding
   actif connu.
7. Les missions liées reçoivent un ID local scindé, leur ID fournisseur
   original, `accountId` et `bindingId`. L'unicité Supabase est scindée par
   binding.
8. Le catalogue multi-compte et le catalogue d'origines d'assistance suivent
   les connecteurs réellement inclus au build.

### 2.5 Assistance IA

1. L'assistance requiert compte Pulse, entitlement valide, consentement, origine
   incluse et permission Chrome.
2. La capture exclut les champs sensibles selon la politique pure partagée.
3. L'appel Gemini Nano est exécuté dans un `Worker` module dédié. Si ce runtime
   n'est pas disponible, le shell renvoie `AI_UNAVAILABLE`; il n'exécute pas le
   LLM dans le service worker.
4. Les suggestions sont éditables, approuvables ou refusables individuellement.
5. L'application revalide l'empreinte du formulaire, n'écrit que les champs
   approuvés, tente un rollback en cas d'échec et ne clique ni ne soumet.
6. Les captures et suggestions vivent dans `chrome.storage.session` seulement,
   puis sont purgées après application ou refus terminal.

### 2.6 Landing et dashboards

1. La landing annonce la valeur gratuite, 10 € TTC/an et les deux bénéfices
   Premium, sans modifier les tokens du design system.
2. Le CTA Premium mène à l'inscription/compte puis au checkout authentifié.
3. Le dashboard de compte distingue l'attente du webhook de l'activation et
   présente les crédits comme séparés.
4. Le dashboard opérationnel lit l'entitlement canonique et affiche les
   bindings sans exposer le hash ni les cookies.
5. La politique de confidentialité décrit le consentement formulaire, le
   traitement local, l'absence d'auto-submit et les liaisons pseudonymisées.

## 3. Inférences et choix prudents appliqués

1. Multi-compte signifie plusieurs comptes plateforme sous une identité Pulse.
2. Le plan gratuit conserve un binding actif par connecteur.
3. Le quota Premium par défaut est 2 bindings par connecteur, configurable côté
   serveur.
4. La projection d'entitlement client expire par défaut après 24 heures,
   configurable entre 1 et 168 heures.
5. `past_due` bloque les nouveaux effets Premium immédiatement ; aucune période
   de grâce n'est implicite.
6. Une annulation conserve le droit jusqu'à `validUntil`.
7. Le périmètre d'assistance est exactement celui des connecteurs inclus dans
   le package, jamais le catalogue complet théorique.
8. Une session plateforme est identifiée par un hash du jar de cookies courant ;
   les cookies bruts ne quittent pas le module Chrome.
9. Un scan local anonyme reste gratuit et non lié. Il n'est pas réattribué
   implicitement lorsqu'un compte Pulse est connecté plus tard.
10. Il n'existe aucun client, paiement ou crédit historique : aucune migration,
    conversion, compatibilité ou backfill de droit n'est prévu.

## 4. Revue des cas obligatoires

| Cas                                         | Résultat                                               |
| ------------------------------------------- | ------------------------------------------------------ |
| checkout nominal                            | couvert : intent → fournisseur → webhook → entitlement |
| création checkout en erreur                 | état retryable/terminal et même requestId côté UI      |
| abandon ou retour sans webhook              | aucun droit, état d'attente ou annulation              |
| webhook dupliqué                            | ledger unique, résultat `duplicate`                    |
| webhook hors ordre                          | tuple version/priorité/ID, résultat `ignored_stale`    |
| provisioning invalide                       | aucun entitlement, code d'erreur déterministe          |
| annulation fin de période                   | Premium jusqu'à `validUntil`                           |
| past due / expiration / remboursement       | accès bloqué ou révoqué                                |
| liaison extension approuvée/refusée/expirée | états explicites et token hashé                        |
| ajout premier binding                       | gratuit                                                |
| ajout deuxième binding                      | Premium + quota                                        |
| session absente ou différente               | aucune création/permutation/scan                       |
| switch concurrent                           | lock transactionnel + un seul actif                    |
| déclassement                                | actif conservé, extras verrouillés                     |
| consentement IA refusé                      | terminal avant capture                                 |
| origine/permission refusée                  | terminal sans capture                                  |
| sortie LLM invalide                         | erreur typée, aucune transition décidée par le LLM     |
| suggestions toutes refusées                 | session purgée, aucune écriture                        |
| formulaire modifié                          | `stale_form`, aucune écriture                          |
| échec DOM                                   | rollback ou revue manuelle si résultat incertain       |
| auto-submit                                 | absent par construction et contrôle source             |

## 5. Migrations effectives

La migration append-only
`apps/landing/supabase/migrations/20260730131500_create_freemium_billing.sql`
ajoute :

- `billing_checkout_intents` ;
- `billing_events` ;
- `subscription_entitlements` ;
- `platform_account_bindings` ;
- `extension_link_requests` ;
- hash, liaison et révocation sur `extension_devices` ;
- `platform_account_binding_id` et l'unicité scindée des futures missions ;
- les RPC server-only de liaison, ajout/switch de binding et application du
  billing.

Il n'y a volontairement aucun `INSERT … SELECT`, backfill de crédits, lecture
de paiements antérieurs ou binding `legacy-default`. Le projet n'ayant aucun
client, la migration crée seulement le flux futur propre.

## 6. Sécurité et privacy

Contrôles présents :

- secrets et variant uniquement côté serveur ;
- signature webhook avant parsing ;
- attribution obligatoire à un intent et un compte ;
- token d'appareil hashé et révocable ;
- RLS de lecture seule pour appareils, entitlements et bindings ;
- mutations sensibles via service role/RPC privés ;
- hash de session au lieu de cookies ;
- permission et origine vérifiées avant capture ;
- denylist de champs sensibles, Zod, worker local, fraîcheur, rollback ;
- aucune donnée formulaire envoyée au backend ;
- aucune transition LLM.

Risques à traiter avant production :

1. Tester dans Chrome MV3 cible que le Prompt API est disponible dans le Worker
   module empaqueté ; sinon l'état sûr reste `AI_UNAVAILABLE`.
2. Un renouvellement de cookies peut changer le hash d'un même compte. Cela peut
   exiger une nouvelle liaison et doit être testé sur chaque plateforme.
3. Ajouter un rate limiter d'infrastructure aux endpoints publics de démarrage
   et polling de liaison.
4. Définir la durée légale de rétention de `billing_events` et le processus
   d'effacement/anonymisation compatible avec les obligations comptables.
5. Vérifier en sandbox les noms et formes exacts de tous les webhooks Lemon
   Squeezy, notamment refund/chargeback et reprise de paiement.
6. Les politiques/conditions des plateformes et la revue Chrome Web Store
   doivent valider les permissions réellement distribuées.

## 7. Questions ouvertes non bloquantes pour le code

1. Quelle valeur de quota remplacerait éventuellement le défaut 2 ?
2. Une période de grâce `past_due` est-elle souhaitée ? Aujourd'hui : non.
3. Quelle rétention appliquer au ledger de facturation ?
4. Faut-il retirer commercialement les packs de crédits futurs, bien qu'ils
   soient techniquement séparés de Premium ?
5. Quel mécanisme d'assistance doit remplacer le hash de cookies si une
   plateforme le rend instable ?

## 8. Vérification attendue

Les suites doivent couvrir :

- catalogue, gardes, transitions autorisées/interdites et terminaux ;
- idempotence et ordre des webhooks ;
- prix/TVA/intent et absence de backfill ;
- RLS et fonctions server-only ;
- liaison, révocation, quota, switch, session mismatch et provenance mission ;
- consentement, permission, denylist, worker, sortie invalide, fraîcheur,
  rollback et absence de submit ;
- typecheck, tests et build des packages domain, landing, dashboard et extension.

La validation fournisseur, Supabase distante, Chrome Web Store et navigateur
MV3 réel reste une étape de déploiement, pas une preuve obtenue par les tests
locaux.
