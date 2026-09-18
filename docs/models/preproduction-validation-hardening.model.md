# Préproduction — validation externe et durcissement

Statut : **Model v2 — source de vérité implémentée et vérifiée localement**

Portée : validation Lemon Squeezy en mode test, validation Chrome MV3,
migrations Supabase sur base vide, limitation des routes de liaison, permissions
et rétention des données opérationnelles.

Ce modèle complète
`models/freemium-entitlement-provisioning.model.md`. En cas de conflit, le
modèle freemium garde l'autorité sur les droits produit et ce document garde
l'autorité sur les contrôles préproduction.

Règle :

> Un service externe, un navigateur ou un LLM produit un signal validé. Seules
> les machines et politiques déterministes ci-dessous décident d'une
> transition.

## 1. Exécution d'une validation préproduction

Chaque exécution est indépendante et conserve une preuve non secrète :
identifiant, cible, heure, versions, résultat et codes d'erreur.

```text
unverified
  └─ START_VALIDATION ─► checking_prerequisites
checking_prerequisites
  ├─ PREREQUISITES_READY ─► running
  ├─ ACCESS_MISSING ───────► blocked_external_terminal
  └─ PREREQUISITE_FAILED ──► failed_terminal
running
  ├─ CHECK_PASSED ─────────► passed_terminal
  ├─ CHECK_FAILED_RETRYABLE ► failed_retryable
  ├─ CHECK_FAILED_TERMINAL ─► failed_terminal
  └─ CANCEL_REQUESTED ──────► cancelled_terminal
failed_retryable
  ├─ RETRY ─────────────────► checking_prerequisites
  └─ CANCEL_REQUESTED ──────► cancelled_terminal
```

États terminaux d'une exécution : `passed_terminal`,
`blocked_external_terminal`, `failed_terminal`, `cancelled_terminal`. Fournir
un accès manquant crée une **nouvelle** exécution ; cela ne réécrit pas la
preuve précédente.

Invariants :

1. Un contrôle bloqué par un accès absent n'est jamais déclaré réussi.
2. Une simulation ou un fixture local est étiqueté `local_fixture`, jamais
   `provider_sandbox`.
3. Aucun secret, cookie, jeton ou payload contenant des données personnelles
   n'entre dans la preuve.
4. Les commandes de validation ciblent uniquement Chrome local, la base locale
   ou le mode test du fournisseur.

## 2. Validation Lemon Squeezy

### 2.1 Préconditions sandbox

Une validation fournisseur exige explicitement :

- une clé API **test mode** ;
- l'identifiant du store de test ;
- l'identifiant du variant Premium annuel de test ;
- le secret du webhook de test ;
- une URL HTTPS temporaire ou de staging recevant le webhook, distincte de la
  production ;
- un compte Pulse de test dans une base Supabase vide ou sandbox.

La clé et le secret sont fournis par l'opérateur. Ils ne sont ni générés, ni
persistés, ni affichés par le validateur.

### 2.2 Contrat du variant

Le variant de test est accepté seulement si les réponses Lemon Squeezy
authentifiées prouvent toutes les propriétés suivantes :

| Propriété               | Valeur attendue |
| ----------------------- | --------------- |
| `test_mode`             | `true`          |
| store                   | store configuré |
| prix unitaire           | `1000` centimes |
| catégorie               | abonnement      |
| cadence                 | `year`          |
| quantité de cadence     | `1`             |
| pay-what-you-want       | `false`         |
| essai gratuit implicite | `false`         |
| état                    | publiable       |

Un écart produit `SANDBOX_VARIANT_MISMATCH` et interdit la création du checkout
de validation.

### 2.3 Machine de validation du flux

```text
checking_variant
  ├─ VARIANT_VALID ─────────────► creating_checkout
  └─ VARIANT_INVALID ───────────► failed_terminal
creating_checkout
  ├─ CHECKOUT_CREATED_TEST_MODE ► awaiting_test_payment
  ├─ CREATE_FAILED_RETRYABLE ───► create_failed_retryable
  └─ CREATE_FAILED_TERMINAL ────► failed_terminal
awaiting_test_payment
  ├─ TEST_PAYMENT_COMPLETED ────► awaiting_signed_webhook
  ├─ CANCEL_REQUESTED ──────────► cancelled_terminal
  └─ CHECKOUT_EXPIRED ──────────► expired_terminal
awaiting_signed_webhook
  ├─ SIGNED_EVENT_RECEIVED ─────► verifying_event
  └─ TIMEOUT ───────────────────► failed_retryable
verifying_event
  ├─ EVENT_CANONICAL ───────────► applying
  ├─ EVENT_IGNORED_AUXILIARY ───► awaiting_canonical_event
  └─ EVENT_REJECTED ────────────► failed_terminal
awaiting_canonical_event
  ├─ CANONICAL_EVENT_RECEIVED ──► verifying_event
  └─ TIMEOUT ───────────────────► failed_retryable
applying
  ├─ ENTITLEMENT_COMMITTED ─────► verifying_projection
  ├─ APPLY_FAILED_RETRYABLE ────► failed_retryable
  └─ APPLY_FAILED_TERMINAL ─────► failed_terminal
verifying_projection
  ├─ DASHBOARD_EXTENSION_MATCH ─► passed_terminal
  └─ PROJECTION_MISMATCH ───────► failed_terminal
```

`create_failed_retryable` et `failed_retryable` n'avancent que sur `RETRY`.

### 2.4 Normalisation des événements

1. La signature HMAC SHA-256 du corps brut est vérifiée avant le JSON.
2. `X-Event-Name` doit être identique à `meta.event_name`.
3. `test_mode`, store et variant doivent correspondre à la configuration de
   l'environnement.
4. `meta.custom_data.account_id`, `checkout_attempt_id` et `offer_id` doivent
   correspondre à un intent serveur existant.
5. `subscription_created`, `subscription_updated`, `subscription_cancelled`,
   `subscription_resumed`, `subscription_expired`, `subscription_paused` et
   `subscription_unpaused` transportent l'objet abonnement canonique.
6. `subscription_payment_success`, `subscription_payment_recovered` et
   `subscription_payment_failed` transportent un objet facture sans période
   d'abonnement. Ils sont enregistrables comme signaux auxiliaires mais ne
   changent pas seuls l'entitlement ; le `subscription_updated` associé décide.
7. `order_refunded` et `subscription_payment_refunded` ne produisent
   `REFUND_CONFIRMED` que si `refunded === true`, le montant remboursé couvre le
   total et le variant/abonnement appartient à l'intent Premium.
8. Un remboursement partiel est `ignored_auxiliary`, sans révocation.
9. `paused` reste un abonnement payé actif selon le contrat fournisseur ; il
   conserve l'accès jusqu'à la période vérifiée. `past_due` et `unpaid`
   produisent `PAYMENT_FAILED`.
10. Un retry au corps identique est idempotent. Un événement canonique plus
    ancien est `ignored_stale`.

## 3. Limitation des routes de liaison

### 3.1 Identité privée

L'adresse client provient uniquement de `getClientAddress()` du runtime. La base
ne reçoit jamais l'adresse brute. Le serveur calcule :

```text
subjectHash = HMAC-SHA256(RATE_LIMIT_HASH_SECRET, scope + NUL + subject)
```

Le secret est obligatoire, serveur uniquement, distinct des secrets de
paiement. Une absence de secret produit `RATE_LIMIT_NOT_CONFIGURED` et un échec
fermé sur les routes publiques.

### 3.2 Politique configurable

Les valeurs sont des défauts conservateurs bornés, remplaçables par variables
serveur :

| Scope                            | Défaut | Fenêtre |
| -------------------------------- | -----: | ------: |
| `extension_link_start_ip`        |     10 |  10 min |
| `extension_link_start_install`   |      3 |  10 min |
| `extension_link_status_ip`       |    120 |  10 min |
| `extension_link_status_link`     |     60 |  10 min |
| `extension_link_resolution_user` |     20 |  10 min |

### 3.3 Machine par requête

```text
received ── SUBJECT_DERIVED ─► checking
received ── SUBJECT_INVALID ─► failed_closed_terminal
checking ── BUCKET_ALLOWED ──► allowed_terminal
checking ── BUCKET_DENIED ───► denied_terminal
checking ── STORE_FAILED ────► failed_closed_terminal
```

- `denied_terminal` retourne `429`, `Retry-After` et `Cache-Control: no-store`.
- `failed_closed_terminal` retourne `503` sans détail interne.
- Toutes les réponses de liaison utilisent `Cache-Control: no-store`.
- La consommation d'un bucket est atomique et sérialisée par sa clé.
- Le client ne décide jamais qu'un bucket est autorisé.

## 4. Rétention opérationnelle

La fonction de purge est serveur seulement, idempotente et reçoit `now` en
paramètre. Elle ne s'exécute jamais depuis un client.

Avant toute suppression, une demande de liaison encore `pending` dont
`expires_at <= now` reçoit explicitement `LINK_EXPIRED`, passe à `expired` et
prend `resolved_at = expires_at`. Cette transition d'horloge est la seule
transition métier réalisée par la purge.

Le polling peut déclencher la même transition via une fonction serveur
atomique qui verrouille la demande. Elle retourne l'état effectivement commis.
Si une approbation ou un refus gagne la course, le polling relit et projette cet
état ; il ne répond jamais `expired` sur la base d'une écriture non vérifiée.

| Donnée                                     | Durée après état terminal | Effet                              |
| ------------------------------------------ | ------------------------: | ---------------------------------- |
| buckets de rate limiting expirés           |                      24 h | suppression                        |
| demandes de liaison résolues/expirées      |                      24 h | suppression                        |
| intents checkout terminaux sans abonnement |                  90 jours | suppression                        |
| événements de facturation traités          |                 395 jours | suppression de la preuve technique |

Les factures et obligations comptables restent chez le fournisseur de paiement ;
`billing_events` n'est pas un registre comptable. La suppression d'un compte
Pulse continue de cascader les données rattachées selon le modèle freemium.

Les appareils révoqués ont leur `token_hash` supprimé immédiatement. Leur ligne
et leur historique de synchronisation ne sont pas supprimés automatiquement
tant que la politique de conservation du dashboard connecté n'est pas décidée.

Machine :

```text
idle ── PURGE_REQUESTED ─► purging
purging ── PURGE_COMMITTED ─► completed_terminal
purging ── PURGE_FAILED_RETRYABLE ─► failed_retryable
purging ── PURGE_FAILED_TERMINAL ─► failed_terminal
failed_retryable ── RETRY ─► purging
failed_retryable ── CANCEL_REQUESTED ─► cancelled_terminal
```

## 5. Permissions Chrome MV3

1. Le build final est Manifest V3 et charge effectivement son service worker.
2. Les permissions de connecteurs exclus sont absentes du manifest construit.
3. `scripting` et `activeTab` sont requis uniquement pour les gestes explicites
   d'import LinkedIn et d'assistance formulaire.
4. LinkedIn reste dans `optional_host_permissions`.
5. Les hôtes des connecteurs livrés restent requis car le scan et les cookies
   sont le cœur explicite du produit ; aucun wildcard global n'est autorisé.
6. Les hôtes d'infrastructure sont exacts et HTTPS.
7. L'assistance ne s'exécute que sur un hôte de connecteur livré, après geste
   utilisateur et consentement.
8. Le Worker IA n'a ni `chrome.storage`, ni `chrome.scripting`, ni décision
   d'état, ni soumission de formulaire.
9. Une API Prompt absente ou indisponible produit `AI_UNAVAILABLE`, sans
   fallback cloud.

## 6. Validation Chrome réelle

```text
built ── LOAD_UNPACKED ─► loading
loading ── SERVICE_WORKER_READY ─► checking_manifest
loading ── LOAD_FAILED ──────────► failed_terminal
checking_manifest ── PERMISSIONS_VALID ─► checking_ai_worker
checking_manifest ── PERMISSIONS_INVALID ► failed_terminal
checking_ai_worker ── WORKER_LOADED ─────► checking_prompt_api
checking_ai_worker ── WORKER_FAILED ─────► failed_terminal
checking_prompt_api ── PROMPT_AVAILABLE ─► exercising_suggestions
checking_prompt_api ── PROMPT_UNAVAILABLE ► unavailable_safe_terminal
exercising_suggestions ── OUTPUT_VALID ──► passed_terminal
exercising_suggestions ── OUTPUT_INVALID ► failed_terminal
```

`unavailable_safe_terminal` est une preuve correcte du fallback local, mais pas
une validation matérielle de génération IA. La preuve complète exige un Chrome
compatible dont le modèle local est effectivement disponible.

## 7. Validation des migrations

Une base vide/sandbox suit :

```text
idle ── RESET_REQUESTED ─► applying
applying ── MIGRATIONS_APPLIED ─► checking_schema
applying ── APPLY_FAILED ───────► failed_terminal
checking_schema ── SCHEMA_VALID ─► exercising_invariants
checking_schema ── SCHEMA_INVALID ► failed_terminal
exercising_invariants ── ALL_PASSED ► passed_terminal
exercising_invariants ── CHECK_FAILED ► failed_terminal
```

Vérifications minimales :

- contraintes prix/devise/taxe et états ;
- RLS et privilèges service-only ;
- clés étrangères indexées ;
- idempotence et ordre des webhooks ;
- liaison expiration/refus/approbation ;
- rate limiting atomique et 429 ;
- purge idempotente ;
- absence de backfill historique.

## 8. Invariants globaux

1. Aucun accès Premium n'est accordé par retour navigateur, fixture, texte libre
   ou événement auxiliaire.
2. Aucun LLM ne décide une transition.
3. Aucun test ne contacte un environnement live.
4. Aucun secret n'est loggé, commité, copié dans une URL ou stocké en base.
5. Une validation non exécutée est rapportée comme bloquée, jamais inférée.
6. Les erreurs fournisseur, base et navigateur sont typées ; les retries sont
   explicites.
7. Aucun état terminal n'accepte une nouvelle transition dans la même
   exécution.
8. Le temps, les identifiants et les secrets de test sont injectés hors du cœur
   déterministe.
9. Toute transition serveur qui approuve une liaison, crée un checkout ou lit
   une projection privée utilise une identité vérifiée par le serveur
   d'authentification. Un payload de session lu depuis un cookie n'est jamais,
   à lui seul, une preuve d'autorisation.

## 9. Projection d'implémentation

| Modèle              | Consommateur                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| machine rate limit  | `packages/domain/src/preproduction-machines.ts` et `apps/landing/src/lib/server/rate-limit.ts` |
| politique de quotas | `apps/landing/src/lib/server/security-config.ts`                                               |
| buckets et purge    | migration `20260730163000_preproduction_security_hardening.sql`                                |
| contrat Lemon       | `premium-billing.ts`, routes checkout/webhook et validateur sandbox                            |
| runtime MV3         | `apps/extension/scripts/validate-mv3-runtime.mjs`                                              |

La projection n'ajoute aucune transition : elle ne fait que consommer les
événements, gardes, terminaux et invariants définis ci-dessus.
