# Audit technique impeccable — baseline MissionPulse

Date : 2026-09-18
Commande : `$impeccable audit` (audit technique code-level, 5 dimensions, score /20)
Captures : `output/playwright/pulse-impeccable-audit-2/` (6 surfaces, 0 erreur console, 0 overflow)

## Contexte

Cet audit établit le **nouveau score de départ** après les séries d'amélioration
`pulse-quality`, `pulse-quality-2` et `pulse-perf-design`. Il succède à l'audit
holistique du 2026-06-24 (`pulse-apple-design-audit.md`, 70/100) dont les quick
wins P1 ont majoritairement atterri depuis (DAO #197, #198, #199, #175-#184).

Surfaces auditées : extension (side panel 390px/500px), landing (hero desktop,
login desktop + mobile), dashboard (redirigé vers login sans compte — l'état
authentifié reste hors périmètre, comme à l'audit précédent).

---

## Audit Health Score

| #   | Dimension                  | Score     | Constat principal                                                      |
| --- | -------------------------- | --------- | ---------------------------------------------------------------------- |
| 1   | Accessibilité              | 3         | Kill global `prefers-reduced-motion` à 0.01ms détruit le feedback      |
| 2   | Performance                | 4         | Virtualisation, zéro animation layout, zéro blur décoratif, 0 erreur   |
| 3   | Theming                    | 4         | Zéro couleur codée en dur côté extension, tokens AA consommés partout  |
| 4   | Responsive                 | 4         | 0px d'overflow sur 6 surfaces testées, touch targets 44px (DAO #180)   |
| 5   | Intégrité d'implémentation | 4         | Dérive liquid-glass résolue, système cohérent et documenté (DESIGN.md) |
|     | **Total**                  | **19/20** | **Excellent (polish mineur)**                                          |

## Verdict — Intégrité d'implémentation

**PASS.** L'implémentation exprime un système produit cohérent et spécifique :

- Le détecteur impeccable ne remonte que **2 findings** sur tout le monorepo, tous
  deux vérifiés comme intentionnels : la fonte Geist (épinglée dans `DESIGN.md`
  comme identité de marque — faux positif assumé) et le fond grille du dashboard
  (`apps/dashboard/src/app.css` — signature de marque « Analytical Blueprint »).
- Zéro couleur hex codée en dur dans `apps/extension/src/ui` (grep strict : 0).
- Les statuts consomment les variantes texte AA (`text-status-*-text`, DAO #198).
- La dérive liquid-glass a été résolue (DAO #197) : plus aucun `backdrop-blur`
  décoratif ; le seul `blur()` restant (landing) est le menu mobile (fonctionnel).
- Les quick wins de l'audit précédent sont vérifiés en code et visuellement
  (voir « Suivi des quick wins » plus bas).

## Findings par sévérité

### [P2] Kill global reduced-motion qui détruit le feedback

- **Localisation** : `apps/extension/src/ui/design-tokens.css:41`
- **Catégorie** : Accessibilité (WCAG 2.1 — mouvement)
- **Impact** : la règle globale `transition-duration: 0.01ms !important` coupe
  tout feedback de transition pour les utilisateurs `prefers-reduced-motion`.
  Le changement d'état est préservé (instantané), mais les retours visuels
  (expansion de carte, confirmation d'action, drawer) deviennent des sauts secs
  qui dégradent la compréhension de la hiérarchie.
- **Recommandation** : remplacer le kill global par une stratégie tokenisée
  (durées réduites mais non nulles, opacité/fade conservés). Plusieurs
  composants implémentent déjà des alternatives `matchMedia` intentionnelles
  (`ScanSummary`, `FeedFilterSheet`, `MissionComparison`, `MissionArrivalStack`,
  `FeedPage`) — généraliser ce pattern et retirer le kill global.
- **Commande suggérée** : `$impeccable animate` (ou `$impeccable polish`).

### [P3] Contraste graphique status-orange sous 3:1

- **Localisation** : token `--color-status-orange: #f97006` (2.86:1 sur blanc),
  utilisé pour dots/badges (`CircuitBadge`, jauges).
- **Catégorie** : Accessibilité (WCAG 1.4.11 — non-text contrast ≥ 3:1)
- **Impact** : les points d'état orange portent du sens seuls dans certains
  circuits ; ils passent sous le seuil graphique 3:1.
- **Recommandation** : introduire une variante graphique plus foncée (ex.
  `#c2410c` déjà présent en `status-orange-text`) ou ajouter un anneau bordé.
- **Commande suggérée** : `$impeccable polish`.

### [P3] Classe morte `.glass-card` dans le login

- **Localisation** : `apps/landing/src/routes/login/+page.svelte:127`
- **Catégorie** : Intégrité d'implémentation
- **Impact** : aucun : la classe n'a plus de définition CSS depuis le nettoyage
  liquid-glass. Reste un reliquat de nommage qui contredit la règle
  anti-glassmorphism de `PRODUCT.md`.
- **Recommandation** : supprimer la classe du markup.
- **Commande suggérée** : `$impeccable distill`.

### [P3] Valeurs rgba brutes dans le fond grille dashboard

- **Localisation** : `apps/dashboard/src/app.css:10-13`
- **Catégorie** : Theming
- **Impact** : deux `rgba(12, 10, 9, 0.035)` hors système de tokens (le reste de
  la base de code utilise `color-mix` sur tokens, cf. DAO #199).
- **Recommandation** : exprimer la grille via `color-mix(in srgb, var(--color-text-primary) 3.5%, transparent)`.
- **Commande suggérée** : `$impeccable document` (puis micro-fix).

### [P3] Hero landing : le titre consomme encore la majorité du viewport

- **Localisation** : `apps/landing/src/app.css` `.hero__title` (clamp jusqu'à 5.5rem)
- **Catégorie** : Responsive / Persuade
- **Impact** : corrigé en partie depuis l'audit précédent — description + CTA
  primaire (« Installer l'extension gratuite ») + CTA secondaire (« Voir la
  shortlist quotidienne ») sont désormais visibles dans le premier viewport.
  La preuve produit (strip plateformes, démo) reste sous le pli — acceptable
  pour un hero typographique assumé.
- **Recommandation** : ne rien faire maintenant ; re-vérifier avec un test
  utilisateur si la conversion install manque.
- **Commande suggérée** : néant (surveillance).

## Findings vérifiés non-actionables (faux positifs ou intentionnels)

- **`overused-font` (Geist)** : choice documenté dans `DESIGN.md` (`--font-geist`),
  épinglé par le design system. Ajouter une ignore-rule projet si le bruit gêne.
- **`codex-grid-background` (dashboard)** : signature de marque « Analytical
  Blueprint » assumée. À rescoper uniquement si elle est perçue comme bruit sur
  les surfaces de travail denses.

## Suivi des quick wins de l'audit précédent (2026-06-24)

| #   | Quick win                                       | Statut                                            |
| --- | ----------------------------------------------- | ------------------------------------------------- |
| 1   | Corriger le formulaire login (pattern register) | ✅ Vérifié code + captures desktop/mobile         |
| 2   | Statut dashboard « Extension Chrome » trompeur  | ✅ 3 états : Connectée / À relier / Compte requis |
| 3   | Un seul CTA principal par viewport              | ✅ Hero bottom-bar, presets feed                  |
| 4   | Undo (masquer, favoris, statut)                 | ✅ « Annuler » présent (Feed, Applications)       |
| 5   | Renommer « CV synchronisé » → « CV canonique »  | ✅ Naming corrigé                                 |
| 6   | « Pourquoi ce score ? » sur cartes + drawer     | ✅ « Pourquoi cette note ? » (carte + drawer)     |
| 7   | Checklist de setup dashboard                    | ✅ `dashboardSetupSteps` + redirection login      |
| 8   | Standardiser confirmations destructrices        | ⚠️ Non re-vérifié cette passe (P3 suivi)          |
| 9   | Aperçu de volume des alertes                    | ✅ `previewMissions` (AlertBuilderCard)           |
| 10  | Microcopies / mention fournisseur auth          | ✅ Note privacy complète, plus de Supabase        |

## Points forts (à préserver)

- **Discipline tokens exemplaire** : zéro couleur codée en dur, variantes AA
  consommées, tokens DTCG documentés (`packages/design`).
- **Focus clavier visible partout** : outline 2-3px vérifié par Tab sur les 6
  surfaces ; skip-link sur la landing ; aide raccourcis clavier dédiée.
- **Perf saine par construction** : virtualisation du feed, aucune animation de
  propriétés layout, aucun `will-change`, images dimensionnées (zéro CLS).
- **Presets décisionnels** dans le feed (« Prioritaires », « Remote compatible »)
  : la boîte à outils filtres est devenue une aide à la décision.
- **Explication du score** accessible en un clic sur chaque carte mission.
- **Zéro erreur console** sur les six surfaces testées.

## Actions recommandées (ordre de priorité)

1. **[P2] `$impeccable animate`** : stratégie reduced-motion tokenisée qui
   préserve le feedback ; supprimer le kill global 0.01ms de `design-tokens.css`.
2. **[P3] `$impeccable polish`** : contraste graphique status-orange (≥ 3:1) +
   suppression `.glass-card` + tokenisation rgba grille dashboard.
3. **[P3] `$impeccable document`** : consigner les deux findings détecteur
   assumés (Geist, grille blueprint) en ignore-rules projet documentées.
4. **Phase 2 (refactors profonds, hors audit technique)** : restructuration
   Settings (Sources / Alertes / Données / Compte-IA), journal d'historique
   unifié, transparence IA (faits / hypothèses / confiance), audit a11y dédié
   (zoom 200%, lecteur d'écran, dark mode visuel).

> Ces commandes peuvent être lancées une par une, toutes à la suite, ou dans
> l'ordre préféré. Relancer `$impeccable audit` après les fixes pour suivre le score.

## Limites

- Dashboard authentifié non audité (aucune session de compte disponible) ;
  l'URL publique redirige vers `/login`.
- Dark mode vérifié structurellement (tokens `.dark`, ThemeSelector light/dark/
  system) mais pas visuellement sur capture.
- Zoom 200 %, lecteur d'écran et contrastes dynamiques non testés — réservés à
  l'audit a11y dédié (recommandation 4).
