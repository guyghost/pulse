# Landing Feature Positioning Model

Source de vérité pour la barrière d'alignement entre les fonctionnalités
réellement livrées par l'extension MissionPulse et ce que la landing page
(`apps/landing/src/routes/+page.svelte`) déclare comme gratuit ou Premium.

Ce modèle complète `apps/extension/src/models/release-surface-alignment.model.md` (qui gouverne
l'égalité du catalogue connecteurs / permissions / cache) en fixant la
frontière **gratuit vs Premium** sur la surface marketing. Il ne modifie ni
le catalogue connecteurs, ni les prix, ni la politique de confidentialité.

## Principes

1. **L'extension est la preuve.** Une capacité livrée dans l'extension au
   lancement et accessible sans compte est `free`. La landing ne peut pas
   l'étiqueter `premium`.
2. **Premium est une couche connectée, pas un verrouillage de l'extension.**
   Au lancement, `PREMIUM_FEATURE_ENABLED = false` (dormant par design —
   voir `apps/extension/src/models/premium-feature-flag.model.md`). Le gating extension est inactif :
   toutes les pages de l'extension sont accessibles à tous.
3. **Le compte Premium vit sur le web.** Sa valeur est la synchronisation
   multi-appareil via le dashboard connecté et les générations IA distantes
   consommées via des crédits serveur.
4. **Le LLM ne décide jamais du positionnement.** Ce modèle décide à partir
   de preuves structurées (flag de feature, pages de navigation extension,
   routes web, catalogue de crédits). Un LLM peut signaler une divergence,
   pas la classer.

## États de lancement

```text
PREMIUM_FEATURE_ENABLED = false
  → extension gating dormant
  → toutes les pages extension (feed, profil, cv, applications, tjm, settings) libres
  → compte web optionnel, n'ouvre rien dans l'extension
```

## Frontière des fonctionnalités

### `free` — livré par l'extension, local-first

| Capacité                                | Preuve extension                                                   |
| --------------------------------------- | ------------------------------------------------------------------ |
| Feed unique, 4 plateformes dédupliquées | `apps/extension/src/lib/core/connectors/*-parser.ts`, nav `feed`   |
| Score stack, TJM, remote, séniorité     | `apps/extension/src/lib/core/scoring/relevance.ts`                 |
| Score sémantique (IA locale Chrome)     | `apps/extension/src/lib/shell/ai/semantic-scorer.ts` (Gemini Nano) |
| Comparateur et shortlist quotidienne    | `apps/extension/src/lib/state/feed-page.svelte.ts`                 |
| Assistant profil et CV                  | nav `profile`, `cv`                                                |
| Suivi de candidatures (pipeline)        | nav `applications`                                                 |
| Radar TJM par stack (local)             | nav `tjm`                                                          |

### `premium` — couche connectée (compte web)

| Capacité                                 | Preuve web                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Dashboard connecté (sync multi-appareil) | `apps/landing/src/routes/dashboard/+page.svelte`, Supabase                   |
| Génération pitch/message/résumé distante | `/api/checkout/credits`, `apps/landing/src/lib/credits.ts` (crédits serveur) |

## Invariants

1. **Non-étiquetage.** Pour toute ligne de `featureMatrix` dans
   `apps/landing/src/routes/+page.svelte`, si la capacité est listée dans le bloc `free` ci-dessus,
   `tier` doit valoir `'free'`.
2. **Non-gating rhétorique.** Aucune copie de la landing (`showcase-caption`,
   sous-titres, `plan-card`, CTA) ne peut affirmer qu'une capacité `free` est
   déverrouillée par Premium.
3. **Prix unique.** Le prix mensuel (`12€`) et les packs de crédits doivent
   refléter `apps/landing/src/lib/credits.ts` (`PREMIUM_MONTHLY_CREDITS`, `CREDIT_PACKS`).
4. **Connexion vs extension.** Le mot "dashboard" qualifie la surface web
   connectée (`/dashboard`). Les pages de l'extension ne sont jamais
   "Premium".

## Transitions de surface (revue)

```text
[visiteur anonyme]
  └─ lit landing → featureMatrix + plans déclarent extension 100% gratuite
       └─ installe extension → toutes les pages accessibles (gating dormant)
            └─ (optionnel) crée un compte → /dashboard
                 ├─ sans premium → sync dashboard désactivée, générations distantes bloquées
                 └─ avec premium (12€/mois) → sync activée, 20 générations/mois + packs crédits
```

États terminaux couverts :

- visiteur anonyme (pas de compte) — l'extension reste entièrement fonctionnelle ;
- compte sans premium — le scan local n'est jamais bloqué ;
- compte premium — la valeur ajoutée est strictement connectée (sync + crédits) ;
- génération distante bloquée par crédit épuisé — `getAccountDecision` du
  dashboard gère l'erreur de manière typée, l'extension n'est pas affectée.

## Preuves attendues pour valider la landing

- `PREMIUM_FEATURE_ENABLED === false` dans `apps/extension/src/lib/core/features/flags.ts` ;
- la liste de navigation extension (`apps/extension/src/lib/state/app-navigation.svelte.ts`) ne contient
  aucune route conditionnée au premium ;
- `apps/landing/src/routes/+page.svelte` ne contient aucun `tier: 'premium'` pour une capacité
  listée `free` dans le tableau ci-dessus ;
- `apps/landing/src/lib/credits.ts` est la seule source pour le prix mensuel et les packs.
