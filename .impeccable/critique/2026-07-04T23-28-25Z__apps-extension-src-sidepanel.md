---
target: apps/extension/src/sidepanel
total_score: 25
p0_count: 1
p1_count: 2
timestamp: 2026-07-04T23-28-25Z
slug: apps-extension-src-sidepanel
---

# MissionPulse Side Panel — Critique UI (registre product)

## Verdict AI slop (product register)

**Note : 7.5/10 — solide fonctionnellement, mais hésitation architecturale.**

Évite les pires tells (pas de glassmorphism, pas de gradient text, pas de décor gratuit). Tokens propres, layout lisible sous densité. **Mais :** surreprésentation du pattern `OperationalStoryCard` (eyebrow + titre + description + evidence grid + 2 CTA) répété sur FeedPage, ProfilePage, TJMPage, ApplicationsPage. Pas du bruit — de la **répétition-confort** : une solution générique appliquée partout plutôt qu'une résolution spécifique par surface. Un terminal Bloomberg n'aurait pas ces cartes d'annonce ; il afficherait le signal directement.

Penche plus **Notion-lite** que **Bloomberg**. Sentiment : un dashboard SaaS B2B nettoyé, pas un outil taillé pour le workflow. La personnalité « calme, précis, fiable » est présente dans le copy mais diluée par le chrome répété.

## Nielsen heuristics (0–4)

| #         | Heuristic                   | Score     | Key Issue                                                                                                                                |
| --------- | --------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Visibility of system status | 3         | ScanProgress excellent (breakdown par connecteur), mais aucun feedback immédiat sur FilterBar state changes                              |
| 2         | Match system / real world   | 3         | Terminologie cohérente, mais statuts de tracking (« À postuler » / « En cours » / « Relancé ») ne montrent pas les transitions possibles |
| 3         | User control & freedom      | 2         | Pas d'undo pour hide mission / delete saved view. Aucune affordance pour « unhide »                                                      |
| 4         | Consistency & standards     | 3         | Badge/Chip/Icon cohérents, mais deux patterns de formulaire coexistent (inline edit vs step wizard)                                      |
| 5         | Error prevention            | 2         | TJM inversion détectée mais traitée comme error state au lieu d'être prévenue par validation input                                       |
| 6         | Recognition > recall        | 3         | Saved views n'affichent que le nom — pas de preview du contenu                                                                           |
| 7         | Flexibility & efficiency    | 2         | Raccourcis clavier existent mais hidden par défaut. Pas de bulk actions. Tri codé en dur                                                 |
| 8         | Aesthetic & minimalist      | 2         | OperationalStoryCard surreprésentée (4+ instances). Empty states bavards. Icon overuse sans hiérarchie                                   |
| 9         | Error recovery              | 3         | Messages clairs, mais aucune affordance pour diagnostiquer _pourquoi_ un connecteur est cassé                                            |
| 10        | Help & documentation        | 2         | KeyboardShortcutsHelp buried. Pas de help contextuel sur « score sémantique », « TJM delta négatif »                                     |
| **Total** |                             | **25/40** | **Average — fondations solides, polish opérationnel manquant**                                                                           |

## Cognitive load checklist (8 items)

| Item                   | Pass/Fail | Evidence                                                                                                                               |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Single focus           | FAIL      | FeedPage présente simultanément 6 zones : OperationalStoryCard + ScanProgress + SearchInput + FilterBar + VirtualMissionFeed + drawers |
| Chunking               | PASS      | MissionCard groupe logiquement (header → titre/client → tags → score → actions)                                                        |
| Grouping               | PASS      | FilterBar groupe bien (Vues / Source / Mode / Séniorité / Tech)                                                                        |
| Visual hierarchy       | FAIL      | Score badge et chevron expand ont la même taille/position — confusion au scan rapide                                                   |
| One thing at a time    | FAIL      | OnboardingWizard expose 5 steps dans la progress bar + le step courant + CTA « Voir le feed »                                          |
| Minimal choices        | PASS      | MissionCard : 4 actions max visibles                                                                                                   |
| Working memory         | FAIL      | SavedViews n'affichent que le nom. Comparison mode sans summary en haut                                                                |
| Progressive disclosure | PASS      | MissionCard expand/collapse, lazy-load par batch de 20, drawer à la demande                                                            |

**4/8 échecs → cognitive load critique.** Trop de surfaces simultanées sans priorisation visuelle claire.

## Emotional journey

- **Peak attendu** : trouver 3 missions 85+, les comparer, en mettre une en suivi. **Réalité** : non célébré. Badge gris qui apparaît, aucun micro-feedback de progrès.
- **End (sortie)** : pas de summary (« Vous avez qualifié 10 missions, 2 favorites, 1 en suivi »). Exit neutre.
- **Valleys** :
  - Scan qui échoue : CTA « Réessayer » mais aucune explication du _pourquoi_ (connecteur cassé ? session expirée ?).
  - Connecteur cassé : badge rouge, aucun contexte (temporaire ? reconnexion nécessaire ?).
  - 0 mission après scan : OperationalEmptyState dit « Lancez un premier scan » mais l'utilisateur vient de scanner. Ne différencie pas « jamais scanné » vs « 0 résultat ».
  - Score bas sur toutes les missions : aucun message explicatif. L'utilisateur doute de l'outil.

## Strengths

1. **ScanProgress est impeccable** — breakdown real-time par connecteur (pending/fetching/done/error), count partiel, statuts visuels différenciés. La pièce la plus « terminal-grade » de l'UI.
2. **MissionCard information density bien calibrée** — en collapsed : source, badges, titre, client, 3 stacks, score + grade (A/B/C). Dense sans chaos.
3. **Tokens design system propres** — une seule palette, shadows nommés, aucun hex hardcodé dans les composants. Travail architectural solide.

## Priority issues

### [P0] Hiérarchie visuelle cassée sur le score MissionCard

- **Pourquoi** : le score est _la donnée clé_ de décision. Score badge et chevron expand ont même taille (h-7 w-7) et même position. Confusion au scan rapide → ralentit la décision, casse le workflow en une passe.
- **Fix** : score badge `h-9 w-auto px-3` + subtle glow ring sur scores 80+ (`ring-1 ring-accent-green/20`) ; chevron réduit à `h-6 w-6` décalé.
- **Commande** : `/impeccable typeset`

### [P1] Cognitive overload FeedPage : 4 niveaux de chrome avant le signal

- **Pourquoi** : un freelance en « mode décision rapide » parse OperationalStoryCard (60px) → ScanProgress (100px) → FilterBar (200px) → SearchInput (40px) → enfin le feed. 400px de chrome avant le signal. Principe #3 violé.
- **Fix** : fusionner OperationalStoryCard + ScanProgress actif ; FilterBar collapsed by default avec summary chip (« 3 filtres actifs ») ; SearchInput dans le header sticky.
- **Commande** : `/impeccable layout`

### [P1] Pas d'undo/recovery pour actions destructives

- **Pourquoi** : hide mission et delete saved view sont immédiats et irréversibles. Un clic accidentel = donnée perdue. Crée de l'anxiété, l'utilisateur hésite avant d'agir. Viole Nielsen #3.
- **Fix** : toast « Annuler » 5s (pattern Gmail/Linear) ; vue « Hidden missions » accessible depuis FilterBar ; confirmation modal pour suppression de saved view.
- **Commande** : `/impeccable harden`

### [P2] OperationalStoryCard overuse → fatigue pattern

- **Pourquoi** : 4+ instances identiques (eyebrow + titre + description + evidence grid + CTA). Cécité pattern après 2 occurrences : l'utilisateur skip parce que ça ressemble à du chrome explicatif, pas du signal.
- **Fix** : réserver aux états critiques/incidents ; remplacer les success/neutral par inline messaging (1 ligne + icône) ; varier la structure (metric row plutôt que story card).
- **Commande** : `/impeccable quieter`

### [P3] Raccourcis clavier hidden, pas de progressive hint

- **Pourquoi** : le produit clame « navigation clavier-first » (PRODUCT.md) mais aucun hint visible. KeyboardShortcutsHelp est un modal séparé. Un power user ne découvrira jamais `j/k`, `f`, `o` sans chercher.
- **Fix** : hints subtils sur hover (1s) ; footer sticky avec badge `?` (« Appuyez sur ? pour les raccourcis ») ; step onboarding présentant 3 shortcuts essentiels.
- **Commande** : `/impeccable onboard`

## Persona red flags

### Alex (Power User freelance, keyboard-first, 50 missions/sem)

Aucun bulk action (cliquer × 20). FilterBar prend 200px. Saved views sans preview contenu. Investigation drawer obstrue tout l'écran (attendu : split view 40%). **Verdict :** adoptera pour le scoring, retournera aux plateformes sources pour le workflow bulk.

### Jordan (First-Timer, 0 mission scannée)

OnboardingWizard expose 5 steps d'un coup (overwhelm). Step « alert » force à configurer une alerte avant d'avoir vu le feed (inversion du learning path). Pas de sample data — premier scan = 0 résultat décourageant. CTA « Voir le feed » toujours visible (tentation de skip → feed vide). **Taux de conversion onboarding estimé : <40%.**

### Sam (Overwhelmed, 5 connecteurs en erreur, 200 missions non qualifiées)

ConnectorStatus « error » sans détail (session ? DOM ? rate-limit ?). OperationalStoryCard « 3 sources à corriger » ne dit pas laquelle est critique. Pas de quick toggle « unseen only » ou « 80+ only ». Pas de « batch mark as seen ». **Verdict : rage-quit après 5 min, l'outil devient anxiogène.**

## Minor observations

- `uppercase tracking-[0.15em]` utilisé 32 fois — crée une hiérarchie plate. Réserver aux section headers critiques.
- CircuitBadge utilise `shadow-[0_0_6px_theme(...)]` pour glow — tell « subtly AI generated » (les vraies UI utilisent des pseudo-elements ou SVG, pas box-shadow pour glow).
- Tooltip : vérifier accessible via focus (pas seulement hover).
- `prefers-reduced-motion` force `0.01ms` sur _tout_ — un peu brutal ; expand/collapse pourraient rester à 100ms.
- TrendBadge : si arrow-up vert + arrow-down rouge seul → a11y fail (couleur = seul sens). Ajouter texte redondant (« ↑ Hausse »).
- Skeletons implémentés sur MissionFeed et TJMDashboard, mais **aucun sur FilterBar ni SourceHealthPanel**. Incohérence.

## Provocative questions

1. OperationalStoryCard est-il intentional (narrator-driven UI) ou commodité ? Si intentional, ça contredit le registre « terminal calme ». Si commodité, smell architectural.
2. Le feed est-il vraiment l'écran principal, ou le scan ? Un utilisateur scanne 0–2×/jour max. Pourquoi ScanProgress toujours présent au lieu d'un overlay qui apparaît _uniquement_ pendant le scan ?
3. La metric de succès de l'onboarding est-elle « % qui complètent les 5 steps » ? Un user qui skip mais qualifie 5 missions en 3 min est _plus successful_. Le design actuel punit le skip.
4. Pourquoi les saved views ne sont-elles pas l'affordance primaire ? Un user qui revient 3×/sem devrait avoir « React senior remote 600+ » comme vue par défaut, pas un feed brut à refiltrer.
5. Le score est-il trop opaque ? MissionCard affiche « B » mais le critère bloquant est buried. Devrait-on afficher inline (« B : TJM -15% ») ?
