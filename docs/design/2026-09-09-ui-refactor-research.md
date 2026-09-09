# Recherche design & plan de refonte — UI extension MissionPulse

**Date :** 2026-09-09 · **Proposal DAO :** #176 (product-feature) · **Périmètre :** `apps/extension` uniquement
**Sources d'autorité :** `PRODUCT.md`, `packages/design/DESIGN.md` + `tokens.json` + `theme.css`, `design-qa.md`, `.impeccable/critique/2026-07-07T…feedpage-svelte.md` (28/40) et `2026-07-28T…sidepanel.md` (26/40), arbre `src/ui/` réel.

---

## 1. Cartographie du système existant

### 1.1 Palette (Analytical Blueprint — Light)

| Rôle            | Token                            | Valeur                                   | Ratio AA sur surfaces                                            |
| --------------- | -------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Canvas          | `--color-page-canvas`            | `#f5f5f4`                                | —                                                                |
| Surface         | `--color-surface-white`          | `#ffffff`                                | —                                                                |
| Carte           | `.section-card`                  | mix 82 % white / 18 % canvas ≈ `#fdfdfd` | —                                                                |
| Bleu marque     | `--color-blueprint-blue`         | `#0b64e9`                                | 5.23:1 sur blanc · **4.42:1 sur `subtle-gray` (échec AA 4.5:1)** |
| Bleu sur teinte | `--color-blueprint-blue-on-tint` | `#1d4ed8`                                | 6.70:1 sur blanc · **5.67:1 sur `subtle-gray` (passe)**          |
| Texte muted     | `--color-text-muted`             | `#6b6561`                                | 5.74:1 blanc / 5.26:1 canvas / 5.64:1 carte — **passe AA**       |
| Texte subtle    | `--color-text-subtle`            | `#57534d`                                | 7.64:1 blanc / 7.00:1 canvas — passe AAA                         |
| Gris subtil     | `--color-subtle-gray`            | `#ececea`                                | fond de chips / hovers                                           |

Ratios recalculés (WCAG 2.1) lors de cette recherche. Les deux échecs 2026-07 (labels FilterBar 4.3:1, bleu sur gris 4.4:1) ont été **partiellement corrigés depuis** : le rail de filtres (`FeedFilterSheet.svelte`, successeur de `FilterBar`) est passé à `text-text-subtle` sauf 1 occurrence ; il reste des hovers `text-blueprint-blue` sur `bg-subtle-gray` à 4.42:1.

### 1.2 Typographie

- Deux fontes déclarées en `@theme` CSS-first : **FH Total Display** (hero uniquement, bannie de l'UI data — respect vérifié par la critique du 28-07) + **Geist** (body/UI).
- Échelle utility : `text-micro` (11px), `text-caption`, `text-meta`, eyebrows uppercase trackés (`tracking-[0.13–0.15em]`). La critique juge les eyebrows « voice, pas grammar » au global, mais relève une dérive en chip-scale (« NOUVEAU », « VU », « SOURCE »).

### 1.3 Rayons — l'échelle committée vs le réel

`DESIGN.md` § Border Radius : **pill 100px · large 12px · buttons 8px · default 6px**. Le `@theme` expose `--radius-lg: 8px`, `--radius-xl: 12px`, `--radius-2xl: 16px`, `--radius-3xl: 30px`.

État réel (grep du 2026-09-09, hors `FeedPage.svelte` en cours de modification sur `develop`) :

- `MissionCard` = `rounded-xl` (12px) ✓ conforme.
- **Dérive card-layer** : `PageHeader`, `OnboardingLayout`, `VirtualMissionFeed` (squelettes), `OperationalEmptyState`, `ProfileRefinementBanner`, `ConnectorAlertBar`, `MetricsPanel` en `rounded-2xl` (16px, hors échelle éléments).
- **Modal** : `BackupRestoreModal` conteneur en `rounded-3xl` (~30px), panneaux internes en `rounded-2xl`.
- **Blocs imbriqués** : `OnboardingFlow` (options, panneaux d'étape) en `rounded-2xl`.
- Incohérence intra-fichier : `VirtualMissionFeed` L154 squelette `rounded-2xl` vs L220 barre `rounded-xl`.
- `pages/` : TJM/Settings/Profile/Applications déjà nettoyés ; **`FeedPage.svelte` conserve des `rounded-2xl` mais est couvert par un changeset en cours** (P0 empty-state `build-feed-story`) → exclu de cette passe.
- **Décision non tranchée (hors critique)** : les CTA h-12 de l'onboarding (`OnboardingFlow`, `OnboardingWelcome`) sont en `rounded-2xl` là où `DESIGN.md` spécifie boutons = 8px. Non modifié : décision d'identité visuelle à faire trancher par le design review.

### 1.4 Patterns de composants

- Atomic design respecté (atoms → molecules → organisms → templates → pages) ; molecules alimentées par props, organisms accèdent aux modules `lib/state/*.svelte.ts` (runes).
- Registre d'icônes centralisé (Lucide), registre testé.
- États opérationnels (`OperationalEmptyState` avec preuve « Résultat affiché », `OperationalStoryCard` KPI) : force reconnue par les deux critiques.
- Disclosure du score (« Pourquoi cette note ? », `aria-expanded`, icône chevron) : l'affordance P2 du 28-07 est **déjà en place**.

---

## 2. Grille d'analyse des 4 pages

Grille : hiérarchie visuelle / densité / accessibilité / cohérence tokens / conformité Svelte 5 + Tailwind 4.

### Feed (FeedPage + VirtualMissionFeed + MissionCard + FeedFilterSheet)

| Axe        | Constat                                                                                                                                                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hiérarchie | Score (pastille monospace 36px), TJM, stack, remote visibles repliés = « décision en une passe » tenue. Insight décisionnel tone-coded prime le tri sans clic.                                                                                                         |
| Densité    | Bonne, mais surcharge d'actions repliées (≤ 7 affordances, critique P1 du 07-07) et cartes internes imbriquées (detector ×71). Le wrapper `section-card` autour du feed a **déjà été retiré**.                                                                         |
| A11y       | Focus ring + `outline-offset` solides, clavier ok sur la carte. **Restent** : hovers bleu-sur-gris 4.42:1 (corrigés ici), ligne > 80ch des descriptions (×26), un chip `bg-blueprint-blue/5` en `text-blueprint-blue` non aligné sur le token `on-tint` (corrigé ici). |
| Cohérence  | Squelettes de chargement en `rounded-2xl` vs carte réelle `rounded-xl` (corrigé ici).                                                                                                                                                                                  |
| Conformité | Runes exclusives, props typées, zéro store legacy détecté dans les fichiers analysés.                                                                                                                                                                                  |

### TJM (TJMPage + TJMDashboard + MetricsPanel)

| Axe        | Constat                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| Hiérarchie | KPI et tendance TJM lisibles ; `MetricsPanel` réutilise le pattern `rounded-2xl` des sections (hors échelle, corrigé ici). |
| Densité    | Tableaux/tendances compacts ; pas de mur de cartes.                                                                        |
| A11y       | 7 usages muted/subtle, 6 attributs aria ; contrastes passant après correctifs hover.                                       |
| Cohérence  | Alignée après passage `rounded-xl`.                                                                                        |
| Conformité | OK.                                                                                                                        |

### Settings (SettingsPage + ScanSettings + DangerZone + BackupRestoreModal)

| Axe        | Constat                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| Hiérarchie | 10 `section-card` structurant les groupes ; labels muted/subtle nombreux (21) mais passants.                    |
| Densité    | Dense mais groupée ; DangerZone isolée = bon pattern de prévention d'erreur.                                    |
| A11y       | 11 attributs aria ; **`BackupRestoreModal` : rayon 30px hors échelle + panneaux internes 16px** (corrigés ici). |
| Cohérence  | Modal = principal contrevenant rayon du système.                                                                |
| Conformité | OK.                                                                                                             |

### Onboarding (OnboardingPage + OnboardingFlow + OnboardingWelcome + OnboardingLayout)

| Axe        | Constat                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Hiérarchie | Carte `section-card-strong` centrée, étapes claires ; CTA primaires dominants (volontaire).                                  |
| Densité    | Faible (approprié pour du first-run).                                                                                        |
| A11y       | Boutons ≥ 44px, focus visibles ; panneaux imbriqués en rayon 16px ≠ hiérarchie concentrique (corrigés ici).                  |
| Cohérence  | Rayons de cartes (`OnboardingLayout`) hors échelle (corrigé) ; **CTA `rounded-2xl` vs spec boutons 8px : décision ouverte**. |
| Conformité | OK.                                                                                                                          |

---

## 3. Principes de refonte adoptés

1. **Échelle de rayons concentrique** (source : DESIGN.md) : surface de niveau page/carte = `rounded-xl` (12px) ; bloc imbriqué dans une carte/modal = `rounded-lg` (8px) ; chips/pills/tags = `rounded-full` ; rayon décroissant vers l'intérieur. `rounded-2xl`/`rounded-3xl` réservés aux surfaces explicitement décidées par le design review (statut : à trancher pour les CTA onboarding).
2. **Bleu sur teinte = token `on-tint`** : tout texte/iconographie portée par une teinte bleue (`bg-blueprint-blue/*`, `hover:bg-subtle-gray`) utilise `text-blueprint-blue-on-tint` ; `text-blueprint-blue` réservé aux fonds blancs/canvas.
3. **Marges AA sur micro-texte** : `text-micro` (11px) préfère `text-text-subtle` (≥ 7:1) ; `text-text-muted` reste toléré (≥ 5.26:1 mesuré) pour les métadonnées secondaires — aucun sweep global, décision au cas par cas.
4. **Une seule couche de carte** : pas de carte dans carte ; le toner/bordure interne n'est réservé qu'aux blocs décisionnels (insight, preuve).
5. **Aucune régression possible** : FC&IS intact (zéro import shell→core, zéro chrome.* dans l'UI), runes uniquement, tokens `packages/design` comme source de vérité.

---

## 4. Changements appliqués (DAO #176)

### Passe 1 — A. Contraste & tokens AA

| Fichier                            | Changement                                                                                                    | Motif                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `molecules/MissionCard.svelte`     | hover action : `hover:text-blueprint-blue` → `hover:text-blueprint-blue-on-tint` (sur `hover:bg-subtle-gray`) | 4.42:1 → 5.67:1 (AA)                                  |
| `organisms/MetricsPanel.svelte`    | idem sur bouton icône                                                                                         | 4.42:1 → 5.67:1 (AA)                                  |
| `molecules/MissionCard.svelte`     | chip sémantique `bg-blueprint-blue/5` : `text-blueprint-blue` → `text-blueprint-blue-on-tint`                 | aligne le token dédié + marge AA sur micro-texte      |
| `organisms/FeedFilterSheet.svelte` | ligne de coverage : `text-text-muted` → `text-text-subtle`                                                    | uniformise le rail de filtres (convention du fichier) |

### Passe 1 — B. Rayons — retour à l'échelle DESIGN.md

| Fichier                                    | Avant         | Après        | Rôle                                 |
| ------------------------------------------ | ------------- | ------------ | ------------------------------------ |
| `molecules/PageHeader.svelte`              | `rounded-2xl` | `rounded-xl` | carte header                         |
| `templates/OnboardingLayout.svelte`        | `rounded-2xl` | `rounded-xl` | carte onboarding                     |
| `organisms/VirtualMissionFeed.svelte`      | `rounded-2xl` | `rounded-xl` | squelettes = rayon MissionCard       |
| `molecules/OperationalEmptyState.svelte`   | `rounded-2xl` | `rounded-xl` | bloc empty-state                     |
| `molecules/ProfileRefinementBanner.svelte` | `rounded-2xl` | `rounded-xl` | bannière canvas                      |
| `molecules/ConnectorAlertBar.svelte`       | `rounded-2xl` | `rounded-xl` | bannière canvas                      |
| `organisms/MetricsPanel.svelte`            | `rounded-2xl` | `rounded-xl` | section                              |
| `molecules/BackupRestoreModal.svelte`      | `rounded-3xl` | `rounded-xl` | conteneur modal                      |
| `molecules/BackupRestoreModal.svelte` ×3   | `rounded-2xl` | `rounded-lg` | panneaux imbriqués                   |
| `organisms/OnboardingFlow.svelte` ×3       | `rounded-2xl` | `rounded-lg` | options / panneaux d'étape imbriqués |

**Exclusions volontaires** : `FeedPage.svelte` (changeset P0 en cours sur `develop` — sweep à reporter après merge), CTA onboarding `rounded-2xl` (décision design ouverte), chip icône `FeedTourOverlay` (icône décorative, seuil 3:1 respecté).

### Passe 2 — Densité du tri (roadmap §5, items 1 & 4)

| Fichier                             | Changement                                                                                                                                                                                                                          | Motif                                                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `molecules/MissionCard.svelte`      | Barre repliée : triade de tri uniquement (masquer, comparer, favori) — ≤ 4 affordances avec le chevron d'expansion ; copier, ouvrir et le CTA « Analyser » rejoignent la barre à l'état déplié, après la triade (positions stables) | P1 07-07 : surcharge d'actions repliées (≤ 7 affordances > mémoire de travail) ; aligne la carte sur la design cible déjà documentée dans `tests/e2e/helpers.ts` (`expandMission`) |
| `molecules/MissionCard.svelte`      | Transitions de suivi : état déplié uniquement (le badge de statut d'en-tête reste l'annonce repliée)                                                                                                                                | idem                                                                                                                                                                               |
| `molecules/MissionCard.svelte`      | Description dépliée : `max-w-prose` (~65ch) en plus de `line-clamp-2`                                                                                                                                                               | P2 07-07 : ligne > 80ch (×26 au détecteur)                                                                                                                                         |
| `tests/unit/ui/MissionCard.test.ts` | 4 tests réalignés sur la nouvelle spec (actions détaillées dépliées, ordre de tabulation, transitions dépliées)                                                                                                                     | spec évolue avec le design                                                                                                                                                         |

### Items constatés déjà implémentés (vérification en code, 2026-09-09)

| Item roadmap                        | État             | Preuve                                                                                                                                                                                                                        |
| ----------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2. MissionComparison — distillation | ✅ déjà en place | `primaryFields` (Note+TJM) par défaut, 7 champs derrière « Afficher tous les détails » (`aria-expanded`), grille 2×2 remplacée par un chip inline unique, colonne recommandée surlignée `bg-blueprint-blue/5` + bordure bleue |
| 3. Undo toast masquer/favori        | ✅ déjà en place | `feed-page.svelte.ts` : `handleToggleFavorite` → toast « Annuler » ; `handleHide` → `hideUndo.request()` (« Mission masquée/restaurée », modèle `undo-window.model.md`)                                                       |
| 5. Aide visible (partie raccourcis) | ✅ déjà câblée   | `FeedPage.svelte` : `showShortcutsHelp` + import lazy `KeyboardShortcutsHelp` (déclencheur `?`). La partie « resurfacer le tour » exige d'éditer `FeedPage.svelte` → reportée avec le lot FeedPage                            |

---

## 5. Roadmap des passes suivantes (ordre recommandé)

1. ~~MissionCard — réduction des actions repliées~~ → **livré en passe 2** (§4).
2. ~~MissionComparison — distillation~~ → **déjà implémenté** (§4, preuves en code).
3. ~~Undo toast sur Masquer/Favori~~ → **déjà implémenté** (§4, preuves en code).
4. ~~Line-length `max-w-prose`~~ → **livré en passe 2** (§4).
5. Aide : **raccourcis déjà câblés** (`?`) ; resurfacer le tour → nécessite `FeedPage.svelte`, regroupé avec le lot FeedPage ci-dessous.
6. **Sweep `FeedPage.svelte`** des `rounded-2xl` restants + tout le lot dépendant de FeedPage, après merge du changeset `build-feed-story` en cours.
7. **Décision design review** : rayon des CTA (8px spec vs langage arrondi actuel) ; persistance de l'état déplié des cartes. E2E : `tests/e2e/helpers.ts` documente déjà la cible (triade repliée, `expandMission` avant copier/ouvrir/investiguer) — les specs e2e l'utilisent déjà.

Chaque item est indépendant, testable, et respecte les principes §3.

---

## 6. Vérifications de la passe

- `pnpm lint` : 0 erreur (warnings préexistants uniquement).
- `pnpm test` (unit core + ui) : vert.
- `pnpm build` : build MV3 OK.
- Audit grep post-changement : plus aucun `rounded-2xl|rounded-3xl` hors `FeedPage.svelte` (changeset en cours), boutons onboarding exclus et chip icône overlay documentés.
