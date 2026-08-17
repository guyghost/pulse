# Eve Session Lifecycle Model

Source de vérité pour le cycle de vie des sessions Eve côté landing, depuis
l'upgrade vers Eve 0.37 (sessions durables adressées par ID, suppression des
continuation tokens).

## Contexte

Eve 0.37 remplace l'API `client.session()` par une collection
`client.sessions` :

- `create(input)` : crée la session ET envoie le premier tour ; retourne
  `{response, session}`.
- `attach(sessionId, {streamIndex})` : rattache un handle à une session
  existante **sans I/O** ; les follow-ups sont adressés par `sessionId` seul.
- `MessageResponse.result()` expose `{status, data, sessionId}` — il n'existe
  plus de `continuationToken` côté SDK.
- `preserveCompletedSessions` et `configureVercelJson` ont été supprimés.

Le champ `continuationToken` du contrat applicatif
(`EveTurnTransportResult`, enregistrements persistés, événements dossier) est
conservé pour compatibilité de stockage mais devient **vestigial : toujours
`null`**. Il ne participe à aucune décision.

## États de la session (vue transport)

```
[absente] --create--> [active] --send(follow-up)--> [active]
    [active] --cancel--> [active]            (annulation du tour en cours)
    [active] --result(completed|failed)--> [terminale observable]
    [terminale observable] --attach+send--> [active]   (nouvelle session si ID inconnu)
```

- Une session est identifiée par son `sessionId`, assigné par le serveur,
  toujours non-nul après un tour (`MessageResult.sessionId`).
- Le serveur Eve est autoritaire : un `attach` sur un ID inconnu est rejeté
  (ClientError), jamais deviné côté client.

## Événements / transitions

| Événement        | Premier tour                                | Follow-up                                        |
| ---------------- | ------------------------------------------- | ------------------------------------------------ |
| `run(session=null)` | `client.sessions.create({message, …})`  | —                                                |
| `run(session)`   | —                                           | `client.sessions.attach(sessionId, {streamIndex: 0}).send(message, …)` |
| `cancel(sessionId)` | `client.sessions.attach(sessionId, {streamIndex: 0}).cancel()` | — |

## Effets de bord

- `create` / `send` consomment le flux d'événements via `response.result()`
  (une seule consommation par réponse).
- `AbortSignal.timeout(timeoutMs)` borne chaque tour ; un timeout abort
  devient `EVE_OUTCOME_UNCERTAIN` (`remoteEffectPossible: true`) — l'état
  distant doit être réconcilié, jamais supposé.
- Mapping `ClientError` inchangé : 401/403 → `EVE_AUTH_REJECTED` ;
  408/429/5xx → `EVE_TRANSPORT_FAILED` (retryable) ; sinon
  `EVE_PROTOCOL_REJECTED`.

## Invariants

1. `continuationToken` est toujours `null` dans `EveTurnTransportResult` ;
   aucune transition ni garde ne dépend de sa valeur.
2. Un follow-up exige uniquement un `sessionId` non vide ; l'ancienne garde
   `EVE_INVALID_REQUEST` « continuation token requis » est supprimée.
3. La validation service (`service.ts`) accepte `continuationToken` `null`
   ou `string` — inchangée.
4. La réécriture idempotente
   (`recordProviderSessionWithRecovery`) compare `durable.continuationToken
   === session.continuationToken` : `null === null` reste vrai.
5. Les transitions métier restent possédées par la machine à états XState
   (`remoteCopilotJobMachine`) ; le transport ne fait que signaler
   `{status, data, sessionId}`. Le LLM produit du contenu, jamais une
   décision d'état.

## Références

- `apps/landing/src/lib/server/copilot/providers/eve-client-transport.ts`
- `apps/landing/src/lib/server/copilot/providers/eve-transport.ts`
- `apps/landing/src/lib/server/copilot/providers/eve-provider.ts`
- `apps/landing/src/lib/server/copilot/service.ts`
- `apps/landing/tests/eve/eve-surface.test.ts`
