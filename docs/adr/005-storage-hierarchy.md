# ADR-005 : Hiérarchie de stockage à 4 couches

## Statut

Accepté

## Contexte

Le side panel d'une extension Chrome s'ouvre et se ferme fréquemment. Récupérer toutes les missions depuis IndexedDB à chaque ouverture est lent. Par ailleurs, les réglages et l'état léger (favoris, IDs vus) doivent survivre aux mises à jour de l'extension, mais l'état de session (progression du scan, nombre de nouvelles missions) ne le doit pas. Il nous fallait une stratégie de stockage équilibrant vitesse, persistance et intégrité des données.

## Décision

Quatre couches de stockage, chacune avec un rôle distinct :

### 1. Cache mémoire (`db-cache.ts`)

- `Map<string, CacheEntry>` en processus avec TTL (5 s pour les missions, 30 s pour le profil).
- Compteur de version global pour invalidation manuelle.
- `db-with-cache.ts` enveloppe les lectures IndexedDB : cache d'abord, repli sur la DB en cas de miss/expiration.
- Les écritures invalident le cache immédiatement pour éviter les lectures périmées.

### 2. IndexedDB (`db.ts`)

- Persistance principale pour les missions et le profil utilisateur.
- Object stores avec index (`source`, `scrapedAt`) pour des requêtes efficaces.
- **Validation à la lecture** : `getMissions()` fait passer chaque enregistrement par `parseMission()` (Zod + type guards), en écartant silencieusement les entrées corrompues avec un log d'avertissement. Protège contre la dérive de schéma entre les mises à jour de l'extension.

### 3. chrome.storage.local (`chrome-storage.ts`, `favorites.ts`, `seen-missions.ts`)

- Réglages, connecteurs activés, favoris, missions masquées, IDs vus, cache sémantique.
- Survit aux mises à jour de l'extension. Se synchronise entre profils Chrome si le storage synchronisé est utilisé.
- Uniquement des données clé-valeur de petite taille (Chrome impose un quota).

### 4. Session Storage (`session-storage.ts`)

- État éphémère : statut du scan en cours, nombre de nouvelles missions depuis la dernière vue.
- Perdu à la fermeture du side panel — voulu. Évite les badges « 3 nouvelles missions » périmés après redémarrage.

### Stratégie de validation

Les schémas Zod (`core/types/schemas.ts`) + les type guards runtime (`core/types/type-guards.ts`) valident les données lues depuis IndexedDB et chrome.storage. Les données invalides sont loggées et écartées plutôt que de faire planter l'UI. Cela protège contre la corruption liée à des écritures concurrentes ou à des changements de schéma entre versions de l'extension.

## Conséquences

- **Positif** : le side panel s'ouvre vite (cache hit pour les missions en ~0 ms vs ~50 ms de lecture IndexedDB).
- **Positif** : la validation de schéma à la lecture évite les crashes runtime dus à des données corrompues.
- **Positif** : séparation des responsabilités claire : chaque couche a un rôle et une durée de vie.
- **Négatif** : complexité de l'invalidation de cache. Les écritures doivent invalider pour éviter les lectures périmées.
- **Négatif** : 4 couches signifient plus de code à maintenir et plus d'endroits où les données peuvent diverger.
