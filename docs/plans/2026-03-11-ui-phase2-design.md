# Design — UI Phase 2 : Favoris, Actions, Scan, Pull-to-refresh

**Date:** 2026-03-11
**Statut:** Approuve
**Approche:** chrome.storage.local avec timestamps (Record<string, number>), Svelte actions, logique pure FC&IS

## Objectif

Ajouter favoris/masques, actions rapides sur les cards, pull-to-refresh gestuel, et animation de scan amelioree.

## 1. Favoris & Masques : stockage et logique pure

### Stockage (shell)

- `src/lib/shell/storage/favorites.ts`
- `getFavorites(): Record<string, number>`, `saveFavorites(...)`
- `getHidden(): Record<string, number>`, `saveHidden(...)`
- Cles chrome.storage.local : `favoriteMissions`, `hiddenMissions`
- Cap a 500 entrees chacun, purge des plus anciens au-dela

### Logique pure (core)

- `src/lib/core/favorites/favorites.ts`
- `toggleFavorite(favorites: Record<string, number>, id: string): Record<string, number>` -- ajoute avec Date.now() ou supprime
- `toggleHidden(hidden: Record<string, number>, id: string): Record<string, number>` -- idem
- `filterHidden(missions: Mission[], hidden: Record<string, number>): Mission[]` -- retire les masquees
- `filterFavoritesOnly(missions: Mission[], favorites: Record<string, number>): Mission[]` -- garde que les favoris

## 2. Actions rapides sur les cards

4 boutons icones en bas de chaque MissionCard (toujours visibles) :

- **Etoile** (`star`) -- toggle favori, remplie quand actif (`text-accent-amber fill-accent-amber`)
- **Masquer** (`x-circle`) -- masque la mission, `text-text-muted hover:text-accent-red`
- **Copier le lien** (`link`) -- copie mission.url, feedback check pendant 1.5s
- **Ouvrir** (`external-link`) -- ouvre mission.url dans un nouvel onglet

Layout : rangee `flex justify-end gap-1` entre les badges stack et la zone expand. Boutons `p-1 rounded-md` avec ripple, `text-text-muted hover:text-text-primary`.

Props MissionCard supplementaires :
- `isFavorite: boolean`
- `onToggleFavorite: () => void`
- `onHide: () => void`
- `onCopyLink: () => void`

Ouverture du lien geree dans le composant (`window.open`).

## 3. Toggle favoris dans le feed header

### Bouton etoile header

- A cote du bouton refresh existant
- Meme style (`p-1.5 rounded-lg text-text-muted hover:text-white`)
- Actif : `text-accent-amber fill-accent-amber` + leger glow
- Bascule entre toutes les missions et favoris seulement

### Toggle masques

- Lien texte discret sous le compteur de missions : "Voir les X masquees"
- Clic : affiche les masquees en `opacity-50` avec bouton "Restaurer"
- Re-clic : re-masque

### State FeedPage

- `showFavoritesOnly = $state(false)`
- `showHidden = $state(false)`
- `favorites = $state<Record<string, number>>({})`
- `hidden = $state<Record<string, number>>({})`
- Charges au mount via `$effect`

## 4. Pull-to-refresh

### Mecanisme

- Svelte action `use:pullToRefresh` dans `src/ui/actions/pull-to-refresh.ts`
- Appliquee sur le conteneur scrollable du feed
- Detecte scrollTop === 0 + pull vers le bas (touch/pointer events)
- Seuil : 60px
- Callback `onRefresh` au relache

### Indicateur visuel

- Cercle `w-8 h-8` avec icone `refresh-cw` qui tourne
- `bg-white/10 backdrop-blur-md rounded-full` -- glass style
- Positionne au-dessus du feed, translate-Y suit le doigt
- Animation retour : `transition: transform 200ms`

### Integration

- `FeedLayout.svelte` recoit prop `onRefresh`
- `FeedPage.svelte` passe `startScan` comme callback
- Desktop : fonctionne avec trackpad/souris (pointer events)

## 5. Scan ameliore

### Icone refresh animee

- Quand `isLoading` : `animate-spin` sur l'icone (1.5s), `text-accent-blue`

### Compteur temps reel

- Sous la barre 2px : "X missions trouvees..."
- `text-[10px] text-text-muted px-3 py-1`
- Se met a jour via missions.length du feed actor
- Disparait apres scan (fade out `transition-opacity duration-300`)

### Integration

- `ScanProgress.svelte` recoit `missionsFound: number`
- Affiche compteur quand `isScanning && missionsFound > 0`

## Fichiers impactes

### Nouveaux fichiers
- `src/lib/core/favorites/favorites.ts` -- fonctions pures toggle/filter
- `src/lib/shell/storage/favorites.ts` -- chrome.storage wrapper
- `src/ui/actions/pull-to-refresh.ts` -- Svelte action pull gesture

### Fichiers modifies
- `src/ui/molecules/MissionCard.svelte` -- boutons actions rapides
- `src/ui/organisms/MissionFeed.svelte` -- forwarding des callbacks
- `src/ui/pages/FeedPage.svelte` -- state favoris/masques, toggle header, pull-to-refresh
- `src/ui/templates/FeedLayout.svelte` -- prop onRefresh, pull-to-refresh action
- `src/ui/organisms/ScanProgress.svelte` -- compteur missions + spinner
