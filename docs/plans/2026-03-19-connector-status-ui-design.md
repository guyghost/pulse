# Design : UI Statuts Connecteurs

**Date** : 2026-03-19
**Statut** : Approuve

## Contexte

L'orchestration par actor model (scan-orchestration-design) fournit des `ConnectorStatus` en temps reel et des `PersistedConnectorStatus` persistes. Il faut maintenant les rendre visibles dans l'UI.

## Decisions

- **Position** : sous la progress bar dans le hero card de FeedPage
- **Pendant le scan** : liste verticale, chaque source sur sa ligne (icone, nom, etat, compteur)
- **Erreurs** : type d'erreur + lien "Se reconnecter" si session expiree
- **Hors scan** : visible uniquement s'il y a des sources en erreur

## Composant ConnectorStatusList (molecule)

**Fichier** : `src/ui/molecules/ConnectorStatusList.svelte`

**Props :**
- `statuses: Map<string, ConnectorStatus>` — temps reel pendant scan
- `persistedStatuses: PersistedConnectorStatus[]` — hors scan
- `isScanning: boolean`

**Logique d'affichage :**
- Si `isScanning` : affiche toutes les sources depuis `statuses`
- Si `!isScanning` : affiche uniquement les `persistedStatuses` avec `lastState === 'error'`
- Si `!isScanning` et aucune erreur : ne rend rien

**Etats visuels :**

| State | Indicateur | Couleur | Texte |
|-------|-----------|---------|-------|
| pending | cercle vide | text-text-muted | "En attente" |
| detecting | spinner | text-accent-blue | "Detection..." |
| fetching | spinner | text-accent-blue | "Scraping..." |
| retrying | spinner | text-accent-amber | "Retry N/3..." |
| done | checkmark | text-accent-emerald | "N missions" |
| error | croix | text-red-400 | message d'erreur type |

**Lien "Se reconnecter" :**
- Affiche si erreur contient "session" ou phase === 'detect' avec recoverable
- Ouvre baseUrl du connecteur via `chrome.tabs.create({ url })`
- Utilise `ConnectorMeta.url` (nouvel ajout)

**Ligne persistee en erreur (hors scan) :**
- Meme rendu que pendant le scan mais avec timestamp relatif ("il y a 2h")

## Modifications existantes

### ConnectorMeta (connectors/index.ts)
Ajouter `url: string` a `ConnectorMeta` avec le baseUrl de chaque plateforme.

### FeedPage.svelte
Ajouter `<ConnectorStatusList>` sous `<ScanProgress>` avec les props existantes.

### ScanProgress.svelte
Inchange — separation des responsabilites.

## YAGNI
- Pas de panneau "Sources" dedie
- Pas d'historique des etats
- Pas d'animation de transition entre etats (transition CSS suffit)
