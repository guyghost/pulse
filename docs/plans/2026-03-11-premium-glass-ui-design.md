# Design — Premium Glass UI avec UX minimale

**Date:** 2026-03-11
**Statut:** Approuvé

## Objectif

Transformer MissionPulse en une expérience premium glass morphism avec le minimum d'interactions utilisateur : onboarding single-screen, auto-scan, tri par score, pas de filtres manuels.

## 1. Glass morphism design system

Evolution du design-tokens existant :
- **Surfaces** : `backdrop-blur-xl` + `bg-white/5` au lieu de `bg-navy-800` opaque. Bordures `border-white/10`.
- **Cards** : `bg-white/[0.07]` avec `backdrop-blur-md`, bordure supérieure `border-t border-white/10` pour l'effet lumière.
- **Nav bar** : `bg-navy-900/80 backdrop-blur-xl` fixée, séparateur `border-white/5`.
- **Inputs** : `bg-white/5 border-white/10 focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20`.
- **Score glow** : missions score >=80 -> `shadow-[0_0_12px_rgba(16,185,129,0.15)]` (emerald glow subtil).
- **Transitions globales** : `transition-all duration-200 ease-out` sur tous les composants interactifs.
- **Scrollbar** : custom thin scrollbar (`scrollbar-thin scrollbar-thumb-white/10`).

## 2. Onboarding single-screen

Un seul ecran remplace le wizard 4 etapes :
- Titre "MissionPulse" + sous-titre "Configurez en 30 secondes"
- 3 champs : Titre/Poste (text), Stack (chips input), TJM cible (single number)
- Bouton "C'est parti" -> sauvegarde profil + lance premier scan -> feed
- Localisation, remote, seniorite accessibles dans Settings (optionnel)

## 3. Feed automatique

- Auto-scan : FeedPage envoie SCAN_START automatiquement au mount
- Refresh : bouton icon-only `refresh-cw` discret dans le header
- Scan progress : fine barre 2px en haut, animee, pas de texte
- Tri automatique par score decroissant
- Pas de filtres chips, SearchInput seul pour recherche libre

## 4. MissionCard premium

- Glass card : `bg-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl`
- Score badge en haut a droite avec glow colore (emerald >=80, amber >=50, red <50)
- TJM en gras monospace bien visible
- Stack badges max 3, style glass (`bg-white/10`)
- Hover : `bg-white/[0.12]` + leger scale `hover:scale-[1.01]`

## 5. Navigation

- 3 tabs (Feed, TJM, Settings) style glass sur nav bar
- Tab actif : `text-white` + dot indicator sous l'icone
- Tab inactif : `text-white/40`

## 6. Composants impactes

| Composant | Action |
|-----------|--------|
| `design-tokens.css` | Ajouter variables glass |
| `Button.svelte` | Variants glass |
| `Badge.svelte` | Style glass |
| `MissionCard.svelte` | Refonte glass + score badge |
| `SearchInput.svelte` | Style glass |
| `OnboardingWizard.svelte` | Remplacer par single-screen |
| `OnboardingPage.svelte` | Adapter au single-screen |
| `OnboardingLayout.svelte` | Simplifier |
| `FeedPage.svelte` | Auto-scan, retirer FilterBar, progress bar fine |
| `ScanProgress.svelte` | Remplacer par barre fine 2px |
| `App.svelte` | Nav glass + dot indicator |
| `FeedLayout.svelte` | Retirer zone filters |
| `FilterBar.svelte` | Supprimer |
| `Chip.svelte` | Garder pour stack input onboarding |
