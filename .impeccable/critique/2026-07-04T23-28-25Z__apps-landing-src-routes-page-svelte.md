---
target: apps/landing/src/routes/+page.svelte
total_score: 20
p1_count: 2
timestamp: 2026-07-04T23-28-25Z
slug: apps-landing-src-routes-page-svelte
---

# MissionPulse Landing — Critique UI (registre brand)

## Verdict AI slop (brand register)

**Note : C+ — coincée entre aspiration et template.**

Exhibe les **defaults éditoriaux AI 2026** qui sapent le positionnement « terminal Bloomberg pour freelances ». Livré : editorial landing crème avec dette SaaS UI.

**Tells détectés :**

1. **Eyebrows uppercase tracked partout** (`.daily-radar__eyebrow`, `.product-map__eyebrow`, `.proof-strip__eyebrow` — `text-transform: uppercase; letter-spacing: 0.12em`). Le tell 2026 : minuscules labels scaffoldant chaque section comme training wheels. Bloomberg n'a pas d'eyebrows.
2. **Numbered step cards avec badges** — `product-map__step` (1/2/3 pills), `experiment-card__week` (« Semaine 1 »…), `feature-card::before` auto-génère `01`, `02`. Pattern « scaffolding via numérotation » quand la structure est floue.
3. **Glass-card pattern** (`class="glass-card"` ×10) — `color-mix(... 72% ...)` translucide + `backdrop-filter: blur` sur mobile menu. Pas égreregious mais atteint la translucency trendy au lieu de la clarté stark.
4. **Hero-metric template** (`.score-flow` / `.score-card` — « Trouvées 42 / Dédupliquées 31 / À contacter 8 »). Gabarit metric 2026.
5. **Card grid sameness** — `.features__grid`, `.platforms__grid`, `.experiment-loop__grid` tous 1-2-3 colonnes identiques. **Zéro variété layout** : pas de tables denses, pas de listes tight, pas d'IA contrastantes.
6. Gradient minimal (toggle + app-preview body) — pas du gradient-text slop, mais présent.

**Category reflex check :**

- First-order (de « freelance tech tooling landing ») : navy/violet SaaS OU cream editorial → **réflexe predictable 2/5**.
- Second-order (« freelance tooling NOT SaaS-cream ») : éditorial-typographique → **réflexe 1/5, c'est EXACTEMENT le réflexe**.

**Missed opportunities :** zéro affordance terminal (pas de tables monospace, pas de layouts denses, pas de blocs high-contrast). Palette propre mais générique. Font pairing (Playfair + Geist) skew éditorial pas analytique. **14 sections** suivent toutes le même pattern card-grid + section-header → scroll exhausting, pas clarté chirurgicale.

## Nielsen heuristics (0–4)

| #         | Heuristic                   | Score     | Key Issue                                                                                              |
| --------- | --------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| 1         | Visibility of system status | 2         | Nav scroll state clair, showcase tabs actifs. Mais aucun loading, aucun progress, aucun « où suis-je » |
| 2         | Match system / real world   | 3         | FR correct, vocab freelance adapté. « Preuves opérationnelles » awkward                                |
| 3         | User control & freedom      | 3         | Smooth scroll, mobile menu, theme toggle. Mais pas de skip-to-content, pas de collapse                 |
| 4         | Consistency & standards     | 4         | Button variants cohérents, card patterns uniformes, typo scale prévisible                              |
| 5         | Error prevention            | N/A       | Pas de forms                                                                                           |
| 6         | Recognition > recall        | 2         | Pas de breadcrumb, pas de sticky nav avec section highlight. User doit recall 3 sections plus haut     |
| 7         | Flexibility & efficiency    | 1         | Zéro shortcut, pas de quick-nav, pas de « skip to pricing ». Power users (= cible) ignorés             |
| 8         | Aesthetic & minimalist      | 2         | 14 sections avec card grids répétitives = pas minimal. « Experiment Loop » = roadmap déguisée          |
| 9         | Error recovery              | N/A       | Pas d'error states                                                                                     |
| 10        | Help & documentation        | 3         | « How it works » clair mais buried ligne 1062 (après pricing)                                          |
| **Total** |                             | **20/32** | **Execution solide, IA faible**                                                                        |

## Cognitive load checklist

| Check                              | Result  | Evidence                                                                                                                                            |
| ---------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valeur en <5s ?                    | FAIL    | Hero « Les bonnes missions freelance à traiter maintenant » = générique. Le vrai diff (5 plateformes, 1 feed scoré, déduplication) est buried l.242 |
| CTA primaire obvious ?             | PASS    | « Installer l'extension gratuite » clair, répété 4×                                                                                                 |
| Réduit les choix ?                 | FAIL    | Hero a 2 CTAs. Features 6 cards. Plans 2 cards + credits strip → decision paralysis                                                                 |
| Concepts introduits avant besoin ? | FAIL    | « Scoring sémantique via Gemini Nano » apparaît après le showcase, jamais expliqué                                                                  |
| Hiérarchie visuelle claire ?       | PASS    | Typo scale forte (clamp Playfair + Geist)                                                                                                           |
| Éléments interactifs obvious ?     | PASS    | Boutons clairs (shadow, hover lift)                                                                                                                 |
| Working memory (7±2) ?             | FAIL    | Features 6 cards + Pour qui 3 personas + Product map 3 steps = 12+ concepts à juggle                                                                |
| Flow visuel clair ?                | PARTIAL | Scroll linéaire mais sections ne build pas entre elles. Experiment Loop avant How it works = dépendance inversée                                    |

**3/8 PASS — friction cognitive élevée.**

## Emotional journey

- **Peak** : Product Showcase tabs (démontre la valeur, ancre de conversion) ; Daily Radar (TJM concrets 780€/720€).
- **Valleys** : Pricing (l.951, après 9 sections ; « snapshots normalisés », « 20 crédits IA » sans unité) ; CTA `mailto:` « Voir la shortlist » (casse l'attente) ; « Experiment Loop » (roadmap founder avant « How it works » — « ils sont encore en beta ? »).
- **Reassurance** : « Local-first & privé », logos plateformes, « Open source & moderne ».
- **End** : tech stack badges génériques — pas mémorable. Better end : testimonial, metric succès, CTA urgent (« 8 missions 80+ attendaient ce matin »).

## Strengths

1. **Product Showcase tabs interactifs** — montre le produit en 4 états (Scanner, Qualifier, Comparer, Postuler) sans vidéo. Ancre de conversion.
2. **Typo system consistent et scannable** — Playfair display, Geist body, clamp responsive, letter-spacing négatif sur grand texte.
3. **Dark mode implémenté** — token swapping complet (pas juste invert), logos grayscale en dark.

## Priority issues

### [P0] Hero value prop faible et buried

- **Pourquoi** : les 5 premières secondes = bounce. « Les bonnes missions freelance à traiter maintenant » est partagé par tous les job boards. Le vrai diff (5 plateformes consolidées, scoring auto, déduplication) est en paragraphe 2.
- **Fix** : swap l'ordre — H1 = « 5 plateformes freelance, 1 feed scoré, zéro doublon » ; subheadline = « Les bonnes missions » ; outcome quantifié above the fold (« 8 missions 80+ à contacter ce matin »).
- **Commande** : `/impeccable distill`

### [P1] 14 sections épuisent l'user avant conversion

- **Pourquoi** : scroll linéaire 1318 lignes. Sections ne build pas, elles répètent (card grid + eyebrow + 3 items). Fatigue avant pricing. Le brand dit « décision en une passe » ; la landing en demande 14.
- **Fix** : merger (« Pour qui » + « Features » = 1 section ; « Product map » + « Proof strip » = 1 section) ; supprimer « Experiment Loop » ; réordonner (Hero → Showcase → How it works → Pricing → Platforms → CTA) ; passer de 14 à 6–7 sections.
- **Commande** : `/impeccable layout`

### [P1] Pricing en jargon, coût flou

- **Pourquoi** : « synchronise les snapshots normalisés », « 20 crédits IA par mois ». Architecture leakage : un freelance non-technique ne peut pas évaluer « 12€/mois » sans comprendre l'unité.
- **Fix** : remplacer par outcomes (« synchronisées entre appareils », « 20 pitchs générés/mois, 1 crédit = 1 génération ») ; cost anchor (« Moins qu'un café/sem., plus de missions ratées évitées ») ; packs crédits en modal/tooltip, pas front-load.
- **Commande** : `/impeccable clarify`

### [P2] Eyebrows uppercase partout = AI slop tell

- **Pourquoi** : `text-transform: uppercase; letter-spacing: 0.12em` sur 10+ eyebrows. Default éditorial 2026. Le brand dit « terminal calme » ; uppercase tracking dit « design blog 2024 ».
- **Fix** : retirer uppercase ; utiliser couleur + weight pour la hiérarchie (`color: blueprint-blue; font-size: 0.875rem; font-weight: 500`).
- **Commande** : `/impeccable quieter`

### [P2] « Experiment Loop » sape la confiance

- **Pourquoi** : roadmap beta 4 semaines (« Semaine 4: Corriger les blocages ») = contexte founder, pas valeur user. Signale « le produit est peut-être cassé » — opposé de « calme confiant fiable ».
- **Fix** : supprimer de la landing ; mover vers `/about` ou `/changelog` ; remplacer par testimonials ou usage stats.
- **Commande** : `/impeccable harden`

### [P2] Pas de keyboard nav / power-user affordances

- **Pourquoi** : cible = « développeurs 3+ ans » (power users). Zéro shortcut, pas de quick-nav, pas de skip. Contradit « décision en une passe ».
- **Fix** : sticky section nav avec highlight ; shortcuts (`?`, `p` pricing, `i` install) ; skip links.
- **Commande** : `/impeccable overdrive`

### [P3] Card grid sameness = monotonie

- **Pourquoi** : `.features__grid`, `.platforms__grid`, `.experiment-loop__grid` identiques. Zéro variété de densité. Pour un produit « signal sur bruit », la landing est visuellement répétitive.
- **Fix** : varier (Platforms = logo strip ; Features = table 2-col feature|benefit ; Product map = horizontal timeline). Réf : Linear changelog, pas Stripe landing.
- **Commande** : `/impeccable layout`

## Persona red flags

### Alex (Power User freelance, TJM 600–800€)

Hero générique (« every job board says this »). Pricing jargon (« snapshots ? »). How it works après pricing. **Conversion 40%** — installera pour tester, mais pricing confusion retarde Premium.

### Jordan (First-Timer, CDI dev curieux de freelance)

« TJM 450–900€ » sans onboarding (« what's TJM ? »). Daily Radar 780€ sans benchmark. « Gemini Nano » sans explication. **Conversion 15%** — bounce à la barrière TJM.

### Sam (Skeptic, brûlé par Malt/Free-Work)

« Semaine 4: Corriger les blocages » = distrust. Credits packs = « nickel-and-diming Malt model ». Logos plateformes sources sans clarifier la valeur dedup+scoring. **Conversion 25%** — a besoin de preuve.

## Minor observations

- Hero badge (l.233) : 3 labels sans priorisation (« Radar quotidien · Freelances tech France · Scan gratuit »). N'en garder qu'un.
- l.308 « Side panel » en UI FR → « Panneau latéral ».
- l.710 « Gemini Nano » sans contexte (non-technical users ignorent que c'est Chrome built-in AI).
- l.1218 GitHub link buried — mover au footer.
- l.1317 footer « 2026 » hardcodé — va pourrir.
- Dark mode : vérifier contraste WCAG AA.
- Pas de `lang="fr"` sur `<html>`.
- 5 logos plateformes : lazy-load below fold.
- « Preuves opérationnelles » (l.691) clunky → « Garanties » ou « Ce qui change ».

## Provocative questions

1. Si l'user ne voit que le hero, comprend-il le produit ? Peux-tu fit la value prop en 6 mots au-dessus du CTA ?
2. 14 sections pour un produit qui promet « décision en une passe » ? Prouver la valeur en 6 sections ?
3. À quoi ressemblerait une landing « terminal aesthetic » ? Et si la landing ÉTAIT le feed (stream scoré simulé en first load, sans hero) ?
4. « Experiment Loop » sert qui ? Si tu le supprimes ce soir, les conversions chutent-elles ? (Hypothèse : elles augmentent.)
5. Pricing matches le brand ? « Calme, précis, fiable » vs « 12€ + 20 crédits + packs à la demande » = overhead cognitif. Flat 12€/mois unlimited (rate-limited) ?
