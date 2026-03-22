# Context: MissionPulse Design System

## Objective
Implémenter l'identité visuelle "Glass Radar" pour MissionPulse - une extension Chrome de scanning de missions freelance avec un design moderne, glassmorphism et une palette cyan/teal évoquant la technologie radar/scanner.

## Constraints
- Platform: Web (Chrome Extension Side Panel)
- Offline first: Partial (scans nécessitent connexion, UI fonctionne offline)
- Design system: Custom "Glass Radar" identity
- Tech: Svelte 5 (runes), TailwindCSS 4 (CSS-first config)

## Technical Decisions
| Decision | Justification | Agent |
|----------|---------------|-------|
| Glassmorphism style | Identité visuelle demandée avec effet verre | @designer |
| Cyan/Teal primary palette | Couleurs du logo radar | @designer |
| Radar scan animations | Thème "scanning" de l'application | @designer |

## Design Reference

### Couleurs identifiées sur le logo
- **Primary Cyan/Teal:** #0E7490 (couleur "PULSE")
- **Dark Navy:** #0F172A (fond sombre)
- **Glass Effect:** Blanc translucide avec blur (rgba(255,255,255,0.1) à 0.2)
- **Accent Blue:** #3B82F6 (radar scan)
- **Text White:** #FFFFFF sur fond sombre

### Elements visuels clés
1. **Radar/Scanner icon** - Cercles concentriques avec effet de balayage
2. **Glassmorphism** - Effet de verre frosted avec bordures subtiles
3. **Gradient cyan → teal** - Sur le texte et les éléments actifs
4. **Effet glow** - Halo cyan autour des éléments interactifs

## Assets Required
| Asset | Format | Usage |
|-------|--------|-------|
| icon-16.png | PNG | Favicon |
| icon-32.png | PNG | Favicon haute rés |
| icon-48.png | PNG | Extension toolbar |
| icon-128.png | PNG | Extension store |
| logo-vertical.svg | SVG | Logo principal side panel |
| logo-horizontal.svg | SVG | Header compact |

## Artifacts Produced
| File | Type | Description |
|------|------|-------------|
| `src/ui/design-tokens.css` | Updated | Glass Radar design tokens with cyan/teal primary, glass effects, radar animations |
| `src/ui/atoms/GlassCard.svelte` | Created | Glassmorphism container with default/elevated/glow variants |
| `src/ui/atoms/RadarIcon.svelte` | Created | Animated radar icon with idle/scanning/active states |
| `src/ui/atoms/GlowButton.svelte` | Created | Primary action button with cyan glow effect |
| `src/ui/atoms/LogoVertical.svelte` | Created | Brand logo vertical layout (icon + stacked text) |
| `src/ui/atoms/LogoHorizontal.svelte` | Created | Brand logo horizontal layout (compact header) |

## Technical Decisions
| Decision | Justification | Agent |
|----------|---------------|-------|
| Glassmorphism style | Identité visuelle demandée avec effet verre | @designer |
| Cyan/Teal primary palette | Couleurs du logo radar | @designer |
| Radar scan animations | Thème "scanning" de l'application | @designer |
| CSS-first config (TailwindCSS 4) | No tailwind.config.js per project conventions | @codegen |
| Backward compatible navy aliases | Maintain existing component compatibility | @codegen |
| Pure CSS animations | No JS dependencies for animations | @codegen |
| Unique SVG gradient IDs per atom instance | Avoid DOM ID collisions when logos or radar icons render multiple times | @integrator |
| Keyboard activation on interactive GlassCard | Preserve atom purity while keeping non-button interactions accessible | @integrator |

## Inter-Agent Notes
<!-- Format: [@source → @destination] Message -->
[@orchestrator → @designer] Analyser l'image fournie et extraire tous les tokens de design (couleurs, typos, espacements, effets glassmorphism)
[@orchestrator → @codegen] Implémenter les tokens dans `src/ui/design-tokens.css` et créer les composants radar/glass nécessaires
[@codegen → @tests] Glass components ready for unit testing: GlassCard, RadarIcon, GlowButton, LogoVertical, LogoHorizontal - all use Svelte 5 runes ($props, $derived)
[@integrator → @orchestrator] Fixed SVG gradient ID collisions with module-level counters
[@review → @orchestrator] Verdict: NEEDS_FIXES - touch target and minor a11y issues identified
[@codegen → @orchestrator] Fixed: h-11 minimum touch target, aria-busy, ariaLabel prop added

## Status
**✅ APPROVED** - All critical issues resolved. Design system ready for use.
