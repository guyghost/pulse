# Freemium, entitlement et assistance candidature — modèle source de vérité

Statut : **Model v2 — source de vérité implémentée, revue post-implémentation requise**

Les contrôles préproduction, le rate limiting et la rétention opérationnelle
sont définis dans
`models/preproduction-validation-hardening.model.md`.

Portée : extension Chrome, dashboard, backend Supabase/SvelteKit, landing et
fournisseur de paiement.

Décision produit immuable dans ce modèle : l'offre Premium coûte **10 € par an**
et donne accès au **multi-compte plateforme** et à l'**assistance IA de
remplissage des formulaires de candidature**.

Ce document remplace le modèle dormant
`apps/extension/src/models/premium-feature-flag.model.md` comme source de vérité
du produit freemium. Le flag historique reste un constat de l'implémentation
actuelle jusqu'à sa migration ; il ne définit plus la cible.

Règle d'architecture :

> Le LLM produit des suggestions typées. Le modèle, les politiques déterministes
> et les actions explicites de l'utilisateur décident des transitions.

## 1. Terminologie et périmètre

- **Compte Pulse** : identité Supabase de l'utilisateur. Un compte est
  `anonymous`, `active`, `suspended`, `deleting` ou `deleted`.
- **Compte plateforme** : représentation locale d'un compte sur une plateforme
  cible (Free-Work, LeHibou, etc.) appartenant à un compte Pulse.
- **Binding** : association entre un compte Pulse, un connecteur et un compte
  plateforme pseudonymisé. Un binding ne contient ni mot de passe, ni cookie, ni
  jeton de session.
- **Compte plateforme actif** : l'unique binding utilisé par un connecteur pour
  le prochain scan ou la prochaine assistance.
- **Entitlement** : projection serveur, versionnée, de l'accès au plan Premium.
  Ce n'est ni un booléen local ni le résultat d'un retour navigateur après
  checkout.
- **Intent de checkout** : tentative persistée et idempotente d'acheter Premium
  pour un compte Pulse.
- **Événement de facturation** : événement signé du fournisseur, persisté avant
  application et traité une seule fois.
- **Tentative d'assistance** : session éphémère qui capture un formulaire,
  demande des suggestions à un AI Worker, recueille les décisions de
  l'utilisateur puis applique uniquement les champs approuvés.

Le multi-compte désigne ici plusieurs **comptes plateforme sous un même compte
Pulse**. Les identités Pulse multiples, le partage familial et les équipes sont
hors périmètre.

## 2. Catalogue d'offre

Le catalogue est une donnée serveur versionnée. Les clients peuvent l'afficher,
mais ne peuvent ni fixer le prix, ni inventer un plan, ni accorder un
entitlement.

```ts
type PlanId = 'free' | 'premium_yearly';
type PremiumFeature = 'multi_account' | 'application_form_ai_assistance';

interface Offer {
  id: PlanId;
  amountMinor: 0 | 1000;
  currency: 'EUR';
  interval: null | 'year';
  intervalCount: 0 | 1;
  features: readonly PremiumFeature[];
  catalogVersion: number;
}
```

| Plan             | Prix | Cadence | Fonctionnalités régies par ce modèle                               |
| ---------------- | ---: | ------- | ------------------------------------------------------------------ |
| `free`           |  0 € | aucune  | usage local utile, un binding plateforme utilisable par connecteur |
| `premium_yearly` | 10 € | un an   | multi-compte plateforme, assistance IA de formulaire               |

Règles :

1. `premium_yearly.amountMinor === 1000`, `currency === 'EUR'`,
   `interval === 'year'` et `intervalCount === 1`.
2. Une demande de checkout ne contient qu'un `offerId`. Le serveur résout
   lui-même le variant fournisseur et le prix.
3. Les fonctionnalités existantes non citées ci-dessus ne deviennent pas
   Premium implicitement. Toute nouvelle restriction exige une décision produit
   et une mise à jour de ce modèle.
4. Les crédits de génération sont un commerce séparé et ne peuvent pas accorder
   les deux entitlements Premium. Il n'existe aucun paiement, client ou crédit
   historique à convertir, migrer ou reconnaître comme droit.
5. L'assistance de formulaire est incluse par l'entitlement Premium. Une future
   limite d'usage doit être modélisée séparément avant d'être appliquée.

## 3. Modèle de compte Pulse

### 3.1 États

```text
anonymous ── SIGN_IN_SUCCEEDED ──► active
    ▲                                  │
    │                                  ├─ ACCOUNT_SUSPENDED ─► suspended
    │                                  ├─ DELETE_REQUESTED ───► deleting
    │                                  └─ SIGN_OUT ───────────► anonymous
    │
suspended ── ACCOUNT_RESTORED ────────► active
suspended ── DELETE_REQUESTED ────────► deleting
deleting  ── DELETE_FAILED_RETRYABLE ─► delete_failed_retryable
delete_failed_retryable ── RETRY_DELETE ─► deleting
deleting  ── DELETE_CANCELLED ────────► active
deleting  ── DELETE_COMMITTED ────────► deleted
deleted   ── terminal
```

### 3.2 Table de transitions

| État source               | Événement                       | Garde                         | État cible                | Effets                                                                                                      |
| ------------------------- | ------------------------------- | ----------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `anonymous`               | `SIGN_IN_SUCCEEDED(accountId)`  | session serveur vérifiée      | `active`                  | charger projection d'entitlement et bindings                                                                |
| `active`                  | `SIGN_OUT`                      | aucune écriture en cours      | `anonymous`               | effacer jetons et projections locales, conserver données locales non sensibles selon politique de rétention |
| `active`                  | `ACCOUNT_SUSPENDED(reasonCode)` | événement serveur autorisé    | `suspended`               | refuser tout nouvel effet Premium                                                                           |
| `suspended`               | `ACCOUNT_RESTORED`              | événement serveur autorisé    | `active`                  | resynchroniser entitlement avant accès                                                                      |
| `active` ou `suspended`   | `DELETE_REQUESTED`              | confirmation explicite        | `deleting`                | créer demande idempotente                                                                                   |
| `deleting`                | `DELETE_CANCELLED`              | suppression non commitée      | `active`                  | annuler la demande                                                                                          |
| `deleting`                | `DELETE_FAILED_RETRYABLE`       | erreur typée retryable        | `delete_failed_retryable` | persister l'erreur, sans retry implicite                                                                    |
| `delete_failed_retryable` | `RETRY_DELETE`                  | budget de retry disponible    | `deleting`                | rejouer avec la même clé d'idempotence                                                                      |
| `delete_failed_retryable` | `DELETE_CANCELLED`              | suppression non commitée      | `active`                  | annuler la demande                                                                                          |
| `deleting`                | `DELETE_COMMITTED`              | suppression serveur confirmée | `deleted`                 | révoquer entitlement, dissocier appareils, purger selon politique                                           |

`deleted` est terminal pour l'identifiant de compte concerné. Une nouvelle
inscription crée un nouvel identifiant et une nouvelle machine.

### 3.3 Liaison d'une extension à un compte Pulse

La projection Premium ne peut atteindre l'extension qu'après une liaison
explicite d'appareil. La liaison utilise un secret aléatoire généré localement ;
seul son hash est persisté côté serveur. Le secret ne figure jamais dans l'URL
ouverte pour l'approbation.

```text
unlinked ── LINK_REQUESTED ─────────────► creating_link
creating_link ── LINK_CREATED ──────────► awaiting_user_approval
creating_link ── CREATE_FAILED ─────────► link_failed_retryable
awaiting_user_approval ── USER_APPROVED ► linked
awaiting_user_approval ── USER_REFUSED ─► refused_terminal
awaiting_user_approval ── LINK_EXPIRED ─► expired_terminal
awaiting_user_approval ── CANCEL ───────► cancelled_terminal
linked ── DEVICE_REVOKED | SIGN_OUT ────► unlinked
```

| État source              | Événement                         | Garde                                                      | État cible               | Effets                                                                |
| ------------------------ | --------------------------------- | ---------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| `unlinked`               | `LINK_REQUESTED(installId)`       | geste utilisateur                                          | `creating_link`          | générer secret 256 bits, envoyer seulement son hash avec l'install ID |
| `creating_link`          | `LINK_CREATED(linkId, expiresAt)` | réponse conforme                                           | `awaiting_user_approval` | ouvrir `/extension/connect?linkId=…` sans secret                      |
| `creating_link`          | `CREATE_FAILED(code, true)`       | erreur retryable                                           | `link_failed_retryable`  | conserver install ID, détruire secret si terminal                     |
| `link_failed_retryable`  | `RETRY_LINK`                      | budget disponible                                          | `creating_link`          | générer un nouveau secret et un nouvel intent                         |
| `awaiting_user_approval` | `POLL_PENDING`                    | intent non expiré                                          | `awaiting_user_approval` | backoff borné                                                         |
| `awaiting_user_approval` | `USER_APPROVED(accountId)`        | hash secret + linkId concordants, approbation authentifiée | `linked`                 | conserver secret dans `chrome.storage.local`, charger projection      |
| `awaiting_user_approval` | `USER_REFUSED`                    | refus authentifié                                          | `refused_terminal`       | détruire secret                                                       |
| `awaiting_user_approval` | `LINK_EXPIRED`                    | horloge serveur                                            | `expired_terminal`       | détruire secret                                                       |
| `awaiting_user_approval` | `CANCEL`                          | aucune                                                     | `cancelled_terminal`     | révoquer intent, détruire secret                                      |
| `linked`                 | `ENTITLEMENT_REFRESHED(snapshot)` | bearer hashé, compte identique, révision non décroissante  | `linked`                 | remplacer projection locale                                           |
| `linked`                 | `DEVICE_REVOKED` ou `SIGN_OUT`    | signal serveur ou utilisateur                              | `unlinked`               | effacer secret et projection                                          |

Un intent de liaison est à usage unique, expire rapidement et ne porte aucun
entitlement. L'endpoint de polling ne renvoie la projection qu'au détenteur du
secret. Le dashboard affiche l'install ID et demande une confirmation
explicite ; il ne peut pas approuver silencieusement une liaison.

## 4. Entitlement Premium

### 4.1 Autorité et projection

L'autorité est une projection serveur versionnée :

```ts
type EntitlementStatus =
  | 'free'
  | 'premium_active'
  | 'premium_cancel_at_period_end'
  | 'premium_past_due'
  | 'premium_expired'
  | 'premium_revoked';

interface EntitlementSnapshot {
  accountId: string;
  planId: PlanId;
  status: EntitlementStatus;
  validFrom: string | null;
  validUntil: string | null;
  features: readonly PremiumFeature[];
  sourceSubscriptionId: string | null;
  sourceVersion: {
    providerUpdatedAt: string;
    eventPriority: number;
    providerEventId: string;
  };
  revision: number;
  issuedAt: string;
  cacheExpiresAt: string;
}
```

La comparaison de `sourceVersion` est lexicographique sur
`providerUpdatedAt`, `eventPriority`, puis `providerEventId`. Un événement plus
ancien ou égal est enregistré comme obsolète et ne modifie pas la projection.

### 4.2 États et signaux normalisés

| État source                                        | Signal serveur normalisé                                      | État cible                     | Accès Premium                        |
| -------------------------------------------------- | ------------------------------------------------------------- | ------------------------------ | ------------------------------------ |
| absent                                             | `ACCOUNT_CREATED`                                             | `free`                         | non                                  |
| `free`, `premium_expired`, `premium_revoked`       | `SUBSCRIPTION_ACTIVATED`                                      | `premium_active`               | oui jusqu'à `validUntil`             |
| `premium_active`                                   | `CANCELLATION_SCHEDULED`                                      | `premium_cancel_at_period_end` | oui jusqu'à `validUntil`             |
| `premium_cancel_at_period_end`                     | `SUBSCRIPTION_RESUMED`                                        | `premium_active`               | oui                                  |
| `premium_active` ou `premium_cancel_at_period_end` | `PAYMENT_FAILED`                                              | `premium_past_due`             | non pour les nouveaux effets Premium |
| `premium_past_due`                                 | `PAYMENT_RECOVERED`                                           | `premium_active`               | oui                                  |
| tout état Premium non révoqué                      | `PERIOD_ENDED`                                                | `premium_expired`              | non                                  |
| tout état                                          | `REFUND_CONFIRMED`, `CHARGEBACK_CONFIRMED` ou `ADMIN_REVOKED` | `premium_revoked`              | non                                  |
| tout état non actif                                | nouvelle `SUBSCRIPTION_ACTIVATED` plus récente                | `premium_active`               | oui                                  |

`premium_expired` et `premium_revoked` sont terminaux pour l'instance
d'abonnement source, mais pas pour le compte Pulse : un nouvel achat crée une
nouvelle instance.

### 4.3 Décision d'accès pure

`canUsePremiumFeature(snapshot, accountState, feature, now)` vaut `true`
uniquement si :

1. `accountState === 'active'` ;
2. `snapshot.accountId` correspond à la session active ;
3. `snapshot.status` est `premium_active` ou
   `premium_cancel_at_period_end` ;
4. `snapshot.validUntil !== null` et `now < validUntil` ;
5. `now < cacheExpiresAt` dans un client hors ligne ;
6. `feature` appartient à `snapshot.features` ;
7. la révision et la signature/provenance de la projection sont valides.

Toute valeur absente, mal formée, expirée, périmée ou appartenant à un autre
compte produit `false`. Le temps est injecté ; la fonction pure n'appelle jamais
`Date.now()`.

La projection client est bornée par une configuration serveur
`premiumEntitlementCacheTtlHours` comprise entre 1 et 168 heures. Son défaut
conservateur est 24 heures. Une indisponibilité au-delà de ce délai refuse tout
nouvel effet Premium.

La perte d'entitlement :

- n'efface aucune donnée ;
- n'interrompt pas un effet DOM déjà commencé ;
- empêche toute nouvelle création de binding au-delà du quota gratuit ;
- verrouille les bindings Premium non actifs ;
- empêche toute nouvelle tentative d'assistance ;
- ne modifie jamais l'état d'une candidature.

## 5. Checkout et provisioning

### 5.1 Machine `premiumCheckout`

Chaque tentative possède `checkoutAttemptId`, `accountId`, `offerId`,
`idempotencyKey` et un état persisté.

| État source                     | Événement                                    | Garde                                                                              | État cible                      | Effets                                                |
| ------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------- |
| `idle`                          | `START_CHECKOUT(offerId, requestId)`         | compte `active`, offre `premium_yearly`, aucune tentative ouverte pour la même clé | `creating_checkout`             | créer intent serveur, résoudre le variant serveur     |
| `creating_checkout`             | `CHECKOUT_CREATED(providerCheckoutId, url)`  | réponse conforme et intent courant                                                 | `awaiting_payment`              | persister identifiants et URL                         |
| `creating_checkout`             | `CREATE_FAILED(code, retryable=true)`        | erreur typée                                                                       | `create_failed_retryable`       | persister erreur sans secret                          |
| `creating_checkout`             | `CREATE_FAILED(code, retryable=false)`       | erreur typée                                                                       | `failed_terminal`               | fermer tentative                                      |
| `creating_checkout`             | `CANCEL_REQUESTED`                           | requête fournisseur annulable                                                      | `cancelled`                     | abort de la requête, ignorer réponse tardive          |
| `create_failed_retryable`       | `RETRY_CREATE`                               | budget de retry disponible                                                         | `creating_checkout`             | réutiliser la même clé d'idempotence                  |
| `create_failed_retryable`       | `CANCEL_REQUESTED`                           | aucune                                                                             | `cancelled`                     | fermer tentative                                      |
| `awaiting_payment`              | `RETURN_FROM_PROVIDER`                       | aucune                                                                             | `awaiting_payment`              | afficher « confirmation en cours », aucun entitlement |
| `awaiting_payment`              | `CHECKOUT_CANCELLED`                         | signal fournisseur lié à l'intent                                                  | `cancelled`                     | fermer tentative                                      |
| `awaiting_payment`              | `CHECKOUT_EXPIRED`                           | signal fournisseur lié à l'intent                                                  | `expired`                       | fermer tentative                                      |
| `awaiting_payment`              | `VERIFIED_PAYMENT_LINKED(eventId)`           | événement signé, non dupliqué, account/intent/offer concordants                    | `payment_confirmed`             | lier événement et intent                              |
| `payment_confirmed`             | `BEGIN_PROVISIONING`                         | événement réservé                                                                  | `provisioning`                  | réduire l'événement dans une transaction              |
| `provisioning`                  | `ENTITLEMENT_COMMITTED(revision)`            | projection et ledger commités atomiquement                                         | `provisioned`                   | publier nouvelle projection                           |
| `provisioning`                  | `PROVISIONING_FAILED(code, retryable=true)`  | transaction non commitée                                                           | `provisioning_failed_retryable` | persister erreur et programmer retry                  |
| `provisioning`                  | `PROVISIONING_FAILED(code, retryable=false)` | erreur de données non récupérable                                                  | `failed_terminal`               | alerte opérateur, aucune concession locale            |
| `provisioning_failed_retryable` | `RETRY_PROVISIONING`                         | budget/permission serveur valides                                                  | `provisioning`                  | rejouer le même événement idempotent                  |

États terminaux d'une tentative : `cancelled`, `expired`, `provisioned`,
`failed_terminal`. Un paiement confirmé ne peut plus être annulé par cette
machine ; un remboursement ou chargeback arrive comme un nouvel événement de
facturation.

### 5.2 Machine `billingWebhookEvent`

Chaque requête fournisseur reçoit d'abord un `receiptId` interne et conserve le
corps brut le temps de la vérification. Le `providerEventId` est extrait
seulement après signature valide, puis réservé de façon unique dans le ledger.

| État source           | Événement                             | État cible            | Effets                                        |
| --------------------- | ------------------------------------- | --------------------- | --------------------------------------------- |
| `received`            | `VERIFY_SIGNATURE`                    | `verifying_signature` | vérifier le corps brut avec le secret         |
| `verifying_signature` | `SIGNATURE_INVALID`                   | `rejected_terminal`   | réponse 401, aucune mutation métier           |
| `verifying_signature` | `SIGNATURE_VALID`                     | `deduplicating`       | extraire l'identité structurée                |
| `deduplicating`       | `EVENT_ALREADY_APPLIED`               | `duplicate_terminal`  | réponse 200, aucune seconde application       |
| `deduplicating`       | `EVENT_RESERVED`                      | `mapping`             | réserver l'ID dans le ledger                  |
| `mapping`             | `EVENT_UNSUPPORTED`                   | `ignored_terminal`    | marquer ignoré avec type, réponse 200         |
| `mapping`             | `EVENT_INVALID(code)`                 | `failed_terminal`     | marquer invalide, aucune projection           |
| `mapping`             | `EVENT_MAPPED(signal)`                | `applying`            | vérifier account, intent, offre et abonnement |
| `applying`            | `APPLY_SUCCEEDED(revision)`           | `applied_terminal`    | commit atomique ledger + projection + intent  |
| `applying`            | `APPLY_FAILED(code, retryable=true)`  | `failed_retryable`    | stocker erreur et prochain retry              |
| `applying`            | `APPLY_FAILED(code, retryable=false)` | `failed_terminal`     | alerte opérateur                              |
| `failed_retryable`    | `RETRY_EVENT`                         | `applying`            | rejouer avec le même `providerEventId`        |

États terminaux : `rejected_terminal`, `duplicate_terminal`,
`ignored_terminal`, `applied_terminal`, `failed_terminal`.

Invariants webhook :

1. La signature est vérifiée avant le parsing métier.
2. `providerEventId` est unique et l'effet est idempotent.
3. Un email seul n'est jamais une preuve d'appartenance. Le lien d'autorité est
   `checkoutAttemptId + accountId + offerId`, posé par le serveur dans les
   custom data.
4. Le retour navigateur `?checkout=success` n'accorde jamais Premium.
5. Les événements hors ordre sont journalisés mais ne réduisent pas la
   projection si leur `sourceVersion` n'est pas supérieure.
6. Une erreur après paiement ne transforme jamais l'utilisateur en Premium
   localement ; elle reste retryable ou nécessite une intervention opérateur.

## 6. Multi-compte plateforme

### 6.1 Données

```ts
type BindingStatus =
  'ready' | 'locked_by_entitlement' | 'needs_session' | 'needs_permission' | 'error' | 'removed';

interface PlatformAccountBinding {
  id: string;
  accountId: string;
  connectorId: string;
  externalAccountKeyHash: string;
  displayLabel: string;
  status: BindingStatus;
  isActive: boolean;
  createdAt: string;
  revision: number;
}
```

Le quota gratuit est exactement **un binding utilisable par connecteur**. Le
quota Premium est une configuration serveur positive
`premiumMaxBindingsPerConnector`, bornée entre 2 et 20. Le défaut conservateur
est 2 ; une autre valeur doit être définie côté serveur, jamais dans un client.

Un même profil Chrome possède normalement un seul jar de cookies actif par
origine. Pulse mémorise donc l'identité pseudonymisée et la séparation des
données, pas la session. Si le compte cible n'est pas la session courante, le
modèle exige une reconnexion explicite de l'utilisateur sur la plateforme.

### 6.2 Machine `addPlatformAccount`

| État source             | Événement                          | Garde                                  | État cible                                           | Effets                               |
| ----------------------- | ---------------------------------- | -------------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| `idle`                  | `ADD_REQUESTED(connectorId)`       | compte Pulse `active`                  | `checking_access`                                    | lire entitlement, quota, permission  |
| `checking_access`       | `ACCESS_DENIED_PREMIUM`            | binding existant et entitlement absent | `premium_required_terminal`                          | aucun changement                     |
| `checking_access`       | `LIMIT_REACHED`                    | quota déterministe atteint             | `limit_reached_terminal`                             | aucun changement                     |
| `checking_access`       | `PERMISSION_MISSING`               | origine optionnelle non accordée       | `permission_required`                                | expliquer la permission exacte       |
| `checking_access`       | `ACCESS_READY`                     | permission présente                    | `detecting_session`                                  | détecter la session et l'identité    |
| `permission_required`   | `REQUEST_PERMISSION`               | geste utilisateur encore actif         | `requesting_permission`                              | `chrome.permissions.request` côté UI |
| `permission_required`   | `CANCEL_REQUESTED`                 | aucune                                 | `cancelled_terminal`                                 | aucun changement                     |
| `requesting_permission` | `PERMISSION_GRANTED`               | origine exacte accordée                | `detecting_session`                                  | détecter session                     |
| `requesting_permission` | `PERMISSION_DENIED`                | refus navigateur                       | `permission_denied_terminal`                         | aucune nouvelle demande automatique  |
| `detecting_session`     | `SESSION_DETECTED(keyHash, label)` | identité structurée valide             | `awaiting_confirmation`                              | présenter le compte détecté          |
| `detecting_session`     | `SESSION_MISSING`                  | aucune session                         | `session_required`                                   | guider la connexion                  |
| `detecting_session`     | `DETECTION_FAILED(code, true)`     | erreur retryable                       | `failed_retryable`                                   | conserver contexte non sensible      |
| `detecting_session`     | `DETECTION_FAILED(code, false)`    | erreur non retryable                   | `failed_terminal`                                    | aucun binding                        |
| `session_required`      | `RETRY_SESSION_CHECK`              | geste utilisateur                      | `detecting_session`                                  | nouvelle détection                   |
| `session_required`      | `CANCEL_REQUESTED`                 | aucune                                 | `cancelled_terminal`                                 | aucun binding                        |
| `awaiting_confirmation` | `CONFIRM_BINDING`                  | clé non dupliquée, quota encore valide | `persisting`                                         | créer binding dans transaction       |
| `awaiting_confirmation` | `CANCEL_REQUESTED`                 | aucune                                 | `cancelled_terminal`                                 | aucun binding                        |
| `persisting`            | `BINDING_COMMITTED(bindingId)`     | écriture complète                      | `ready_terminal`                                     | activer seulement si aucun actif     |
| `persisting`            | `PERSIST_FAILED(code, true)`       | transaction non commitée               | `failed_retryable`                                   | aucun binding partiel                |
| `persisting`            | `PERSIST_FAILED(code, false)`      | transaction non commitée               | `failed_terminal`                                    | aucun binding partiel                |
| `failed_retryable`      | `RETRY`                            | budget disponible                      | dernier état sûr (`checking_access` ou `persisting`) | même requestId                       |
| `failed_retryable`      | `CANCEL_REQUESTED`                 | aucune                                 | `cancelled_terminal`                                 | aucun nouvel effet                   |

### 6.3 Machine `switchPlatformAccount`

| État source               | Événement                     | Garde                                               | État cible                  | Effets                                                                                                 |
| ------------------------- | ----------------------------- | --------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `idle`                    | `SWITCH_REQUESTED(bindingId)` | propriétaire, binding non supprimé                  | `checking_access`           | vérifier entitlement et session                                                                        |
| `checking_access`         | `TARGET_ALREADY_ACTIVE`       | cible active                                        | `completed_terminal`        | no-op                                                                                                  |
| `checking_access`         | `ACCESS_DENIED_PREMIUM`       | plusieurs bindings conservés mais cible verrouillée | `premium_required_terminal` | actif inchangé                                                                                         |
| `checking_access`         | `SESSION_MATCHES_TARGET`      | hash détecté identique                              | `committing`                | préparer permutation atomique                                                                          |
| `checking_access`         | `SESSION_MISMATCH`            | autre session plateforme                            | `session_switch_required`   | demander connexion au compte cible                                                                     |
| `session_switch_required` | `RETRY_SESSION_CHECK`         | geste utilisateur                                   | `checking_access`           | redétecter                                                                                             |
| `session_switch_required` | `CANCEL_REQUESTED`            | aucune                                              | `cancelled_terminal`        | actif inchangé                                                                                         |
| `committing`              | `SWITCH_COMMITTED`            | un seul actif après transaction                     | `completed_terminal`        | publier nouveau binding actif                                                                          |
| `committing`              | `SWITCH_FAILED(code, true)`   | rollback réussi                                     | `failed_retryable`          | actif précédent conservé                                                                               |
| `committing`              | `SWITCH_FAILED(code, false)`  | transaction non commitée                            | `failed_terminal`           | actif précédent conservé ; connecteur marqué `blocked_data_integrity` si la lecture de contrôle échoue |
| `failed_retryable`        | `RETRY`                       | budget disponible                                   | `checking_access`           | redémarrer vérifications                                                                               |

La suppression d'un binding est une commande séparée. Si le binding à supprimer
est actif et qu'un autre binding subsiste, la commande doit fournir un
`replacementBindingId` explicite. La transaction vérifie la session de
remplacement, désactive l'ancien, active le remplacement, puis marque l'ancien
`removed`. Sans remplacement valide, la suppression est refusée. Les missions
historiques gardent leur `bindingId`; aucune donnée n'est réattribuée
implicitement.

### 6.4 Déclassement Premium → gratuit

Sur `ENTITLEMENT_LOST` :

1. le binding actif de chaque connecteur reste utilisable ;
2. tous les autres bindings `ready` deviennent `locked_by_entitlement` ;
3. aucune session, donnée ou historique n'est supprimé ;
4. les scans ne lisent que le binding actif ;
5. l'utilisateur peut supprimer un binding verrouillé ;
6. un changement vers un binding verrouillé requiert Premium, sauf remplacement
   explicite et atomique lors de la suppression du binding actif.

## 7. Assistance IA des formulaires de candidature

### 7.1 Frontière de confiance

L'assistance fonctionne uniquement :

- depuis un geste utilisateur explicite dans l'extension ;
- sur une origine cible supportée et autorisée ;
- pour un compte Pulse `active` avec entitlement
  `application_form_ai_assistance` valide ;
- avec un **AI Worker dédié**, distinct du service worker d'orchestration ;
- sur une capture structurée, minimisée et validée ;
- sans soumission automatique du formulaire.

Le LLM reçoit un schéma de champs autorisés et renvoie seulement :

```ts
interface FieldSuggestion {
  suggestionId: string;
  fieldId: string;
  proposedValue: string;
  confidence: number;
  rationale: string;
  sourceRefs: string[];
}
```

La réponse brute est validée par Zod puis filtrée par une politique pure. Aucun
texte libre, score de confiance ou raisonnement du LLM ne déclenche de
transition.

Champs interdits à la suggestion et au remplissage :

- mots de passe, secrets, paiements, coordonnées bancaires ;
- CAPTCHA, signatures et consentements ;
- numéros d'identité ou administratifs ;
- santé, handicap, origine, religion, démographie et champs EEO ;
- casier judiciaire, déclarations juridiques et autorisation de travail ;
- téléversement de pièces ou de CV sans action utilisateur dédiée.

### 7.2 État d'une suggestion

Chaque suggestion suit exactement :

```text
pending ── APPROVE_FIELD ─────────► approved
pending ── EDIT_AND_APPROVE_FIELD ► approved_edited
pending ── REFUSE_FIELD ──────────► refused
approved | approved_edited ── APPLY_SUCCEEDED ► applied
```

Seuls `approved` et `approved_edited` sont applicables. `APPROVE_ALL_SAFE` est
un événement utilisateur explicite qui applique la même politique pure à chaque
champ ; ce n'est pas une décision du LLM.

### 7.3 Machine `applicationFormAssist`

| État source                   | Événement                                                                     | Garde                                                 | État cible                        | Effets                                                      |
| ----------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| `idle`                        | `ASSIST_REQUESTED(tabId)`                                                     | geste utilisateur, tentative unique                   | `awaiting_consent`                | afficher les données capturées et le traitement local prévu |
| `awaiting_consent`            | `CONSENT_APPROVED`                                                            | action utilisateur explicite                          | `checking_access`                 | injecter `now`, lire compte/entitlement/origine             |
| `awaiting_consent`            | `CONSENT_REFUSED`                                                             | action utilisateur explicite                          | `consent_refused_terminal`        | aucune capture, aucun appel IA, aucune écriture             |
| `awaiting_consent`            | `CANCEL_REQUESTED`                                                            | aucune                                                | `cancelled_terminal`              | aucune capture, aucune écriture                             |
| `checking_access`             | `ACCOUNT_INACTIVE`                                                            | compte non actif                                      | `account_required_terminal`       | aucun accès au formulaire                                   |
| `checking_access`             | `PREMIUM_MISSING`                                                             | entitlement invalide                                  | `premium_required_terminal`       | aucun accès au formulaire                                   |
| `checking_access`             | `ORIGIN_UNSUPPORTED`                                                          | origine hors catalogue                                | `unsupported_terminal`            | aucune permission demandée                                  |
| `checking_access`             | `PERMISSION_MISSING`                                                          | origine optionnelle                                   | `permission_required`             | expliquer l'origine exacte                                  |
| `checking_access`             | `ACCESS_READY`                                                                | toutes gardes vraies                                  | `capturing`                       | capture minimale structurée                                 |
| `permission_required`         | `REQUEST_PERMISSION`                                                          | geste utilisateur encore actif                        | `requesting_permission`           | demande d'origine exacte côté UI                            |
| `permission_required`         | `REFUSE_PERMISSION`                                                           | action utilisateur                                    | `permission_denied_terminal`      | aucune relance automatique                                  |
| `permission_required`         | `CANCEL_REQUESTED`                                                            | aucune                                                | `cancelled_terminal`              | aucun effet                                                 |
| `requesting_permission`       | `PERMISSION_GRANTED`                                                          | origine exacte                                        | `capturing`                       | capture                                                     |
| `requesting_permission`       | `PERMISSION_DENIED`                                                           | refus navigateur                                      | `permission_denied_terminal`      | aucune capture                                              |
| `capturing`                   | `CAPTURE_SUCCEEDED(snapshot, fingerprint)`                                    | schéma valide, champs interdits retirés               | `requesting_suggestions`          | transmettre au AI Worker                                    |
| `capturing`                   | `CAPTURE_FAILED(code, true)`                                                  | erreur retryable                                      | `capture_failed_retryable`        | aucune donnée persistée                                     |
| `capturing`                   | `CAPTURE_FAILED(code, false)`                                                 | erreur non retryable                                  | `failed_terminal`                 | aucune donnée persistée                                     |
| `capturing`                   | `CANCEL_REQUESTED`                                                            | capture interruptible                                 | `cancelled_terminal`              | abort + purge mémoire                                       |
| `requesting_suggestions`      | `SUGGESTIONS_VALIDATED(list)`                                                 | Zod + politique pure, même fingerprint                | `reviewing`                       | initialiser chaque décision à `pending`                     |
| `requesting_suggestions`      | `SUGGESTIONS_REJECTED(code, true)`                                            | sortie invalide ou AI indisponible retryable          | `suggestion_failed_retryable`     | détruire session AI                                         |
| `requesting_suggestions`      | `SUGGESTIONS_REJECTED(code, false)`                                           | échec terminal                                        | `failed_terminal`                 | détruire session AI                                         |
| `requesting_suggestions`      | `CANCEL_REQUESTED`                                                            | requête interruptible                                 | `cancelled_terminal`              | abort + purge mémoire                                       |
| `reviewing`                   | `APPROVE_FIELD`, `EDIT_AND_APPROVE_FIELD`, `REFUSE_FIELD`, `APPROVE_ALL_SAFE` | suggestion courante et champ autorisé                 | `reviewing`                       | mettre à jour décision explicite                            |
| `reviewing`                   | `REFUSE_ALL`                                                                  | action utilisateur                                    | `refused_terminal`                | purge des suggestions                                       |
| `reviewing`                   | `CANCEL_REQUESTED`                                                            | aucune application commencée                          | `cancelled_terminal`              | purge mémoire                                               |
| `reviewing`                   | `APPLY_APPROVED_REQUESTED`                                                    | au moins une approbation, aucune suggestion `pending` | `checking_freshness`              | recapturer empreinte et préflight DOM                       |
| `checking_freshness`          | `FORM_UNCHANGED`                                                              | fingerprint identique, toutes cibles présentes        | `applying`                        | appliquer atomiquement les champs approuvés                 |
| `checking_freshness`          | `FORM_CHANGED`                                                                | fingerprint différent ou cible absente                | `stale_form`                      | aucune mutation                                             |
| `stale_form`                  | `RECAPTURE_REQUESTED`                                                         | geste utilisateur                                     | `capturing`                       | nouvelle tentative de capture                               |
| `stale_form`                  | `CANCEL_REQUESTED`                                                            | aucune                                                | `cancelled_terminal`              | purge mémoire                                               |
| `applying`                    | `APPLY_SUCCEEDED(appliedIds)`                                                 | toutes écritures + événements DOM réussis             | `applied_terminal`                | journal minimal, aucun submit                               |
| `applying`                    | `APPLY_FAILED_ROLLED_BACK(code)`                                              | valeurs d'origine restaurées                          | `apply_failed_retryable`          | journal d'erreur sans contenu                               |
| `applying`                    | `APPLY_FAILED_ROLLBACK_UNCERTAIN(code)`                                       | état DOM incertain                                    | `manual_review_required_terminal` | interdire retry automatique                                 |
| `capture_failed_retryable`    | `RETRY_CAPTURE`                                                               | budget disponible, geste utilisateur                  | `capturing`                       | nouvelle capture                                            |
| `suggestion_failed_retryable` | `RETRY_SUGGESTIONS`                                                           | même snapshot encore frais                            | `requesting_suggestions`          | nouvelle session AI                                         |
| `suggestion_failed_retryable` | `RECAPTURE_REQUESTED`                                                         | snapshot périmé                                       | `capturing`                       | nouvelle capture                                            |
| `apply_failed_retryable`      | `RETRY_APPLY`                                                                 | nouvelle empreinte identique                          | `checking_freshness`              | nouveau préflight                                           |
| tout état retryable           | `CANCEL_REQUESTED`                                                            | aucune application incertaine                         | `cancelled_terminal`              | abort + purge mémoire                                       |

États terminaux :

- `account_required_terminal`
- `premium_required_terminal`
- `unsupported_terminal`
- `permission_denied_terminal`
- `refused_terminal`
- `cancelled_terminal`
- `applied_terminal`
- `manual_review_required_terminal`
- `failed_terminal`

`applied_terminal` signifie « champs approuvés renseignés ». Il ne signifie
jamais « candidature envoyée » et ne transitionne pas le pipeline de
candidature. Seul un événement utilisateur séparé peut déclarer une candidature
comme envoyée.

## 8. Coordination entre machines

```text
catalogue serveur
      │
      ▼
checkout intent ─► webhook signé ─► entitlement versionné
                                          │
                     ┌────────────────────┴───────────────────┐
                     ▼                                        ▼
           multi-compte plateforme                 assistance formulaire
                     │                                        │
                     └──────────► données/appareils ◄──────────┘
                                      scindés par accountId
                                      et bindingId
```

1. `premiumCheckout` ne publie jamais directement un entitlement.
2. `billingWebhookEvent` émet un signal normalisé après vérification et
   déduplication.
3. Le reducer d'entitlement décide la nouvelle projection.
4. L'extension et le dashboard consomment la même projection et les mêmes
   gardes pures.
5. Les machines multi-compte et assistance lisent l'entitlement au début de
   chaque effet important et juste avant le commit.
6. Une révocation concurrente avant le commit produit une erreur d'accès. Une
   révocation après le début de l'effet DOM laisse l'effet finir puis bloque la
   prochaine tentative.

## 9. Permissions

| Acteur                    | Autorisé                                                        | Interdit                                                               |
| ------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| visiteur anonyme          | utiliser le socle local gratuit                                 | checkout Premium, sync compte, multi-compte, assistance                |
| utilisateur Pulse actif   | lire sa projection, démarrer checkout, utiliser gratuit         | écrire son entitlement, traiter un webhook                             |
| utilisateur Premium actif | utiliser les deux features si permission d'origine accordée     | dépasser quotas, lire un autre compte                                  |
| UI extension              | demander une permission optionnelle depuis un geste utilisateur | demander une permission depuis le service worker                       |
| service worker            | orchestrer bridge, stockage et scripts autorisés                | héberger le LLM du nouveau workflow, décider sur texte libre           |
| AI Worker                 | proposer des `FieldSuggestion` validables                       | appliquer au DOM, soumettre, accorder Premium, changer une candidature |
| backend authentifié       | créer intent pour le compte courant                             | accepter prix/variant/accountId arbitraires du client                  |
| handler webhook           | vérifier, réserver et réduire un événement signé                | identifier l'autorité par email seul                                   |
| service role              | écrire ledger et projections via use case borné                 | exposer la clé au client                                               |

## 10. Effets de bord autorisés

- Backend : créer intent, appeler le fournisseur, vérifier signature, écrire
  ledger/projection dans une transaction, publier une révision.
- Extension shell : lire une projection authentifiée, demander une permission
  optionnelle, détecter une session sans conserver de secrets, ouvrir/fermer un
  contexte cible, écrire les stores locaux scindés.
- AI Worker : créer/détruire une session de modèle et retourner une sortie
  structurée.
- Assistance DOM : capturer des champs autorisés et écrire les valeurs
  approuvées après préflight ; ne jamais cliquer sur Submit.
- UI : émettre uniquement des événements typés et afficher l'état du modèle.

Tout effet possède un `requestId` ou `eventId`, un timeout borné, un
`AbortSignal` quand l'API le permet, une erreur typée et une politique de retry
explicite.

## 11. Invariants globaux

1. Un LLM ne décide aucune transition, aucun entitlement et aucune application
   de champ.
2. Un client ne peut pas écrire son statut Premium.
3. Seul un événement fournisseur signé, lié à un intent serveur, peut
   provisionner Premium.
4. Le retour checkout n'accorde aucun droit.
5. Tout événement fournisseur est idempotent et ordonné déterministement.
6. `validUntil === null` n'accorde jamais un accès Premium sans durée.
7. Un compte Pulse non `active` ne peut démarrer aucun nouvel effet Premium.
8. Un connecteur possède au plus un binding actif par compte Pulse.
9. Le socle gratuit possède au plus un binding utilisable par connecteur.
10. Un déclassement ne supprime ni bindings ni historique.
11. Toutes les données issues d'un scan associé à un compte Pulse connecté et
    à un binding actif portent `accountId` et `bindingId`. Un scan local
    anonyme peut rester non lié ; il ne peut pas devenir implicitement la donnée
    d'un binding ultérieur.
12. Aucune donnée d'un binding ne peut être affichée ou synchronisée sous un
    autre compte Pulse.
13. Aucun cookie, mot de passe ou jeton de plateforme n'est persisté par le
    multi-compte.
14. Une permission optionnelle est demandée pour une origine exacte et depuis
    un geste utilisateur.
15. L'assistance ne capture pas les champs interdits et ne soumet jamais le
    formulaire.
16. Un champ n'est écrit que sur approbation utilisateur explicite et après
    validation d'une empreinte fraîche.
17. Une sortie LLM invalide est une erreur typée, jamais une permission de
    continuer.
18. Les états terminaux ignorent les réponses async tardives de leur tentative.
19. Les retries réutilisent la même clé d'idempotence et sont bornés.
20. L'UI, les routes API et les handlers ne contiennent aucune transition
    métier parallèle au modèle partagé.

## 12. Forme d'implémentation exigée

L'implémentation doit conserver les propriétés suivantes :

- `packages/domain` portera le catalogue, les types, reducers d'entitlement,
  gardes pures et tables de transition communs ;
- les workflows importants seront des machines XState v5 :
  `premiumCheckoutMachine`, `billingWebhookEventMachine`,
  `extensionAccountLinkMachine`, `addPlatformAccountMachine`,
  `switchPlatformAccountMachine` et
  `applicationFormAssistMachine` ;
- les machines n'effectueront pas directement l'I/O : elles invoqueront des
  acteurs shell injectés ;
- le backend persistera l'état distribué des intents et événements ; il ne
  dépendra pas de la mémoire d'un process ;
- l'extension consommera les modèles via ses facades/bridge, jamais par accès
  direct depuis un composant ;
- les schémas Zod valideront messages, événements fournisseur, snapshots
  d'entitlement, captures et suggestions ;
- le temps, les IDs et les limites seront injectés ;
- les AI Workers resteront des producteurs de données, sans accès aux machines
  d'autorité.
