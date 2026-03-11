# Design — UI Polish & UX améliorée (Phase 1)

**Date:** 2026-03-11
**Statut:** Approuvé
**Approche:** Svelte transitions natives (transition:, animate:, actions)

## Objectif

Ajouter du polish visuel et des fonctionnalités UX manquantes à MissionPulse pour une expérience premium. Phase 1 couvre : transitions de pages, animations de cards, micro-interactions, indicateur vu/pas vu, badge notifications.

Phase 2 (hors scope) : favoris, actions rapides sur cards, scan amélioré, pull-to-refresh.

## 1. Transitions entre pages

Dans `App.svelte`, wrapper le contenu principal dans un `{#key currentPage}` avec `transition:fly`. La direction du slide dépend de l'index de la page dans la nav :

- Navigation vers la droite (feed -> tjm -> settings) : `in:fly={{ x: 30, duration: 200 }}`
- Navigation vers la gauche (settings -> tjm -> feed) : `in:fly={{ x: -30, duration: 200 }}`
- Sortie : `out:fade={{ duration: 100 }}`
- Easing : `cubicOut`
- Variable `previousPage` pour calculer la direction
- Wrapper `overflow: hidden` pour éviter le flash de scroll

## 2. Animations d'apparition des cards (stagger)

- `transition:fly={{ y: 15, duration: 250, delay: index * 50 }}` sur chaque card dans le `{#each}`
- Cap le delay à 300ms max (6 cards) pour ne pas ralentir les longues listes
- Au retour sur la page feed, les cards rejouent l'animation (via le `{#key}`)

### Expand/collapse fluide

- Remplacer le `{#if expanded}` par `transition:slide={{ duration: 200 }}` sur le bloc description
- Chevron animé : rotation 0 -> 180 via `rotate-180` conditionnel + `transition-transform duration-200`

## 3. Micro-interactions

### Ripple

- Svelte action `use:ripple` dans `src/ui/actions/ripple.ts` (~15 lignes)
- Au `pointerdown`, crée un `<span>` positionné au point de clic
- Cercle `bg-white/20`, expand + fade, durée `400ms`, easing `ease-out`
- Appliqué sur : boutons de nav, bouton refresh, bouton "C'est parti", MissionCard

### Pressed states

- Boutons : `active:scale-[0.97]` via Tailwind
- MissionCards : `active:scale-[0.99]` (plus subtil)

### Nav dot indicator glissant

- Element `<div>` absolu dont la position `left` est calculée en % selon l'index du tab actif
- `transition: left 200ms ease-out` pour glisser d'un tab à l'autre

## 4. Indicateur vu/pas vu

### Stockage

- Set d'IDs vus dans `chrome.storage.local` sous la clé `seenMissionIds`
- Chargé au mount de `FeedPage`, mis à jour quand de nouvelles missions entrent dans le viewport
- Fonction pure `markAsSeen(currentIds: string[], missionIds: string[]): string[]` dans le core
- Shell : lecture/écriture dans `src/lib/shell/storage/seen-missions.ts`
- Cap à 500 IDs max, les plus anciens purgés au-delà

### Detection viewport

- `IntersectionObserver` via une Svelte action `use:onVisible` dans `src/ui/actions/on-visible.ts`
- Threshold `0.5`, fire once par card (observer se déconnecte après)

### Rendu visuel

- Mission non vue : `border-l-2 border-accent-blue` + léger glow bleu
- Mission vue : style actuel (pas de bordure gauche)
- Transition du passage vue : `transition-all duration-500`

## 5. Badge notifications extension

### Mécanisme

- Après chaque scan, le Service Worker compare les missions avec `seenMissionIds`
- `chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })`
- `chrome.action.setBadgeBackgroundColor({ color: '#3B82F6' })`

### Mise à jour

- Après scan complété : Service Worker calcule et set le badge
- Quand missions deviennent vues dans le side panel : message `MISSIONS_SEEN` envoyé au SW via bridge
- Badge à `''` quand tout est vu
- Skip silencieux en mode dev (pas de `chrome.action`)

## Fichiers impactés

### Nouveaux fichiers
- `src/ui/actions/ripple.ts` — Svelte action ripple
- `src/ui/actions/on-visible.ts` — Svelte action IntersectionObserver
- `src/lib/shell/storage/seen-missions.ts` — lecture/écriture IDs vus
- `src/lib/core/seen/mark-seen.ts` — fonction pure markAsSeen

### Fichiers modifiés
- `src/sidepanel/App.svelte` — transitions pages, nav dot glissant, ripple
- `src/ui/organisms/MissionFeed.svelte` — stagger animation, onVisible
- `src/ui/molecules/MissionCard.svelte` — expand/collapse fluide, pressed state, bordure vu/pas vu
- `src/ui/organisms/OnboardingWizard.svelte` — ripple sur bouton
- `src/ui/pages/FeedPage.svelte` — chargement seenIds, gestion MISSIONS_SEEN
- Service Worker — badge logic
