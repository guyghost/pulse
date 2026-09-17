# ADR-004 : Pattern Result pour la gestion d'erreurs

## Statut

Accepté

## Contexte

Les extensions Chrome communiquent entre contextes via `postMessage`, qui ne peut pas sérialiser les objets `Error` ni les stack traces. Le try/catch traditionnel perd le contexte d'erreur aux frontières de sérialisation. Nous voulions aussi que les erreurs soient des valeurs circulant de façon prévisible dans le système, et non des exceptions levées qui contournent le flux de contrôle.

## Décision

Adopter un pattern `Result<T, E>` inspiré de Rust, défini dans `src/lib/core/errors/result.ts` :

```typescript
type Result<T, E = AppError> = Ok<T> | Err<E>;
```

Avec les fonctions utilitaires : `ok()`, `err()`, `map()`, `flatMap()`, `mapErr()`, `unwrapOr()`, `match()`, `all()`, `any()`.

### Hiérarchie de types AppError

`src/lib/core/errors/app-error.ts` définit une union discriminée avec 5 types d'erreurs :

- `NetworkError` — échecs HTTP, avec champs `status`, `url`, `retryable`
- `StorageError` — échecs IndexedDB/chrome.storage, avec `operation` et `key`
- `ParsingError` — échecs de parsing HTML/JSON, avec `source` et données brutes
- `ConnectorError` — échecs au niveau connecteur, avec `connectorId` et `phase`
- `ValidationError` — échecs Zod/type-guard, avec `field`, `expected`, `received`

Toutes les erreurs sont des objets simples readonly (pas d'instances de classe), ce qui les rend sérialisables via `postMessage`. Les factory functions (`createNetworkError`, etc.) garantissent la structure correcte. Le timestamp est injecté (pas de `Date.now()`) pour garder le Core pur.

### Intégration

Chaque méthode de connecteur retourne un `Result`. Les opérations de stockage valident à la lecture. Le gestionnaire d'erreurs du Shell convertit les `AppError` en toasts destinés à l'utilisateur selon le type et la récupérabilité de l'erreur.

## Conséquences

- **Positif** : les erreurs sont des valeurs de première classe. Pas d'absorption silencieuse, pas de throw inattendu. TypeScript force la gestion des deux cas.
- **Positif** : sérialisables entre contextes Chrome sans perte de données.
- **Positif** : `isRetryable()` et `isFatal()` permettent des décisions systématiques de retry/abort.
- **Négatif** : plus verbeux que try/catch pour les cas simples. Chaque appelant doit vérifier `.ok`.
- **Négatif** : pas de stack traces dans AppError (trade-off pour la sérialisabilité).
