# ADR-003 : Architecture des connecteurs

## Statut

Accepté

## Contexte

MissionPulse agrège des missions freelance de 5 plateformes (Free-Work, LeHibou, Hiway, Collective, CherryPick), chacune avec des formats de données différents (API JSON, HTML). Il nous faut une interface uniforme gérant la détection d'authentification, le rate limiting et la récupération d'erreur, tout en isolant le code de chaque connecteur.

## Décision

### Imports statiques (compatibles service worker)

`src/lib/shell/connectors/index.ts` définit un `CONNECTOR_REGISTRY` associant les IDs à des factory functions via des **imports statiques** enveloppés dans `Promise.resolve()`. L'`import()` dynamique a été retiré car le polyfill `__vitePreload` de Vite utilise des API `document` qui plantent dans les service workers d'extension Chrome. Les métadonnées statiques (`ConnectorMeta`) sont disponibles sans charger le code du connecteur, permettant un rendu rapide de la liste des connecteurs dans l'UI.

### Classe de base avec Result<T,E>

`BaseConnector` fournit l'infrastructure partagée :

- **Détection de session** : `detectSession()` récupère l'URL de la plateforme avec `credentials: 'include'`, vérifie les 401/403 et les redirections vers la page de login. Retourne `Result<boolean, AppError>`.
- **Helpers HTTP** : `fetchHTML()` et `fetchJSON()` avec timeout de 15 s, abort controller et un seul retry automatique pour les erreurs retryables (5xx, 429).
- **Suivi de synchronisation** : `getLastSync()` / `setLastSync()` via `chrome.storage.local`.

Chaque connecteur concret n'implémente que `fetchMissions(now)`, en appelant les helpers de fetch de la base et en déléguant le parsing à un parser pur du Core.

### Parsers Core vs connecteurs Shell

Conformément à FC&IS (ADR-001), le parsing HTML/JSON vit dans `core/connectors/*-parser.ts` (pur, testable avec fixtures). Le connecteur Shell orchestre l'I/O et appelle le parser.

### Rate limiting

Configurable via `AppSettings.respectRateLimits` et `customDelayMs`. Les méthodes de fetch de la base incluent des timeouts avec abort. Le scanner séquence les appels aux connecteurs plutôt que de les paralléliser.

## Conséquences

- **Positif** : ajouter une nouvelle plateforme ne demande qu'un parser (Core) + un connecteur (Shell) + une entrée de registry. Aucun changement de la logique de scan.
- **Positif** : le lazy loading garde le bundle initial petit. Les connecteurs inutilisés ne sont jamais chargés.
- **Positif** : `Result<T,E>` dans chaque méthode de connecteur rend la gestion d'erreur explicite et composable.
- **Négatif** : l'héritage de classe de base est moins compositionnel que des fonctions pures. Trade-off acceptable pour la logique HTTP/session partagée.
