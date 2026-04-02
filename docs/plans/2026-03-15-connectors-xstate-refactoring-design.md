> **⚠️ Historical document** — Ce plan a été rédigé pendant une phase antérieure du projet. Certains choix techniques mentionnés (XState, offscreen document, API Anthropic, Malt, Comet) ne reflètent plus l'architecture actuelle. Voir `README.md` et `AGENTS.md` pour l'état courant.


# Refactoring Connecteurs + XState

Date: 2026-03-15

## Contexte

Audit des connecteurs de plateformes et des machines XState. Deux axes : nettoyage du code mort + amelioration des connecteurs existants.

## 1. Nettoyage du code mort

- Supprimer `TJMPage.svelte`, `tjm.machine.ts` et tests associes
- Supprimer `@xstate/svelte` de `package.json` (jamais importe)
- Supprimer les parsers morts `cherrypick-parser.ts`, `hiway-parser.ts`
- Supprimer les types bridge morts : `TJM_REQUEST`, `TJM_RESULT`, `SCAN_START`, `SCAN_STATUS`, `SCRAPE_URL`, `SCRAPE_RESULT`, `MISSIONS_SEEN`
- Supprimer le document offscreen (`src/offscreen/`) si plus utilise
- Supprimer de `feedMachine` : `activeFilters`, `SET_FILTERS`, `CLEAR_FILTERS`, `setFilters`, `clearFilters` — le filtrage reste en Svelte pur `$derived`

## 2. Connecteurs — IDs stables

Extraire des IDs stables depuis le DOM/API pour chaque connecteur :
- **Malt** : slug/ID depuis le `href` des liens mission
- **Hiway** : ID depuis le `href` ou `data-*` attribute
- **CherryPick** : identifiant dans le lien ou attribut
- **Comet** : IDs natifs de l'API JSON
- **LeHibou** : deja stable (UUID) — supprimer le parametre `_idPrefix` vestigial

## 3. Connecteurs — API JSON pour Comet

- Investiguer les appels reseau de `comet.co/missions` pour trouver l'endpoint API
- Reecrire `comet.connector.ts` sur le modele de `freework.connector.ts` (fetch JSON, parser type)
- Reecrire `comet-parser.ts` comme parser JSON type (plus de DOMParser)

## 4. Connecteurs — Ameliorer Malt, Hiway, CherryPick

- **Malt** : investiguer l'URL correcte pour les missions, chercher une API JSON cachee
- **Hiway / CherryPick** : valider les selecteurs CSS reels, remplacer les selecteurs speculatifs
- **LeHibou** : ajouter l'extraction de `remote`, `client`, `description` depuis le DOM

## 5. Connecteurs — Coherence structurelle

- **Registry** : uniformiser l'instanciation (tout `new` dans `index.ts` ou tout instances exportees)
- **Pagination** : ajouter si l'API/DOM le permet (Malt notamment)
- **Retry** : ajouter un retry simple (1 retry avec delai) dans `BaseConnector.fetchHTML()`

## 6. Hors scope

- Execution parallele des connecteurs (impacte le progress reporting)
- Refactoring de la dedup Jaccard (amelioree naturellement par les IDs stables)
