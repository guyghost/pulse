# Landing Feature Positioning Model

Source de vérité pour la barrière d'alignement entre les fonctionnalités
réellement livrées par l'extension MissionPulse et ce que la landing page
(`apps/landing/src/routes/+page.svelte`) déclare comme gratuit ou Premium.

Ce modèle complète `apps/extension/src/models/release-surface-alignment.model.md` (qui gouverne
l'égalité du catalogue connecteurs / permissions / cache) en fixant la
frontière **gratuit vs Premium** sur la surface marketing. Il ne modifie ni
le catalogue connecteurs, ni les prix, ni la politique de confidentialité.

Il dépend également de `apps/extension/src/models/surface-feature-flags.model.md` : les
`EXTENSION_SURFACE_FLAGS` (définis dans `packages/domain/src/feature-flags.ts`, partagés
extension + landing) déterminent quelles capacités sont présentées comme **livrées** ou
**à venir** (`tier: 'soon'`).

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
  → toutes les pages extension libres

EXTENSION_SURFACE_FLAGS (packages/domain/src/feature-flags.ts)
  applications: false → nav `applications` masquée, non navigable
  connected: false    → carte « Compte et synchronisation » masquée, loadConnectedAccount() sauté
  autres onglets: true
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
| Radar TJM par stack (local)             | nav `tjm`                                                          |

### `soon` — construit, non activé au lancement (flag surface à `false`)

| Capacité                         | Flag surface                   | Preuve extension                                         |
| -------------------------------- | ------------------------------ | -------------------------------------------------------- |
| Suivi de candidatures (pipeline) | `applications: false`          | nav `applications` masquée par `isTabEnabled`            |
| Dashboard connecté (compte)      | `connected: false`             | carte compte masquée, `loadConnectedAccount()` désactivé |
| Génération IA distante           | `connected: false` (transitif) | l'entrée extension de la génération passe par le compte  |

Une capacité `soon` ne peut être ni étiquetée `free`, ni présentée comme
livrée dans la moindre copie de la landing. Quand le flag passe à `true`, la
ligne bascule automatiquement (`tier` est calculé depuis
`EXTENSION_SURFACE_FLAGS` dans `+page.svelte`).

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
3. **Prix cohérents.** Les compteurs de crédits (`PREMIUM_MONTHLY_CREDITS = 20`)
   et les packs (`CREDIT_PACKS`) doivent refléter `apps/landing/src/lib/credits.ts`.
   Le prix (`10€ TTC/an`) est aujourd'hui un littéral dans
   `apps/landing/src/routes/+page.svelte` et doit rester aligné avec la
   configuration Lemon Squeezy (`https://missionpulse.lemonsqueezy.com/checkout`);
   il n'est pas encore porté par `credits.ts`.
4. **Connexion vs extension.** Le mot "dashboard" qualifie la surface web
   connectée (`/dashboard`). Les pages de l'extension ne sont jamais
   "Premium".
5. **Candeur sur la synchronisation.** Toute mention de synchronisation
   multi-appareils sur la landing doit être qualifiée comme à venir
   (`à venir`, `sera disponible`), car `loadConnectedAccount()` dans
   `apps/extension/src/lib/state/settings-page.svelte.ts` n'est activé qu'en
   développement (`import.meta.env.DEV`) et le dashboard (`apps/dashboard`)
   déclare la synchronisation "à venir". À l'inverse, les générations IA
   distantes via crédits sont livrées aujourd'hui (checkout Lemon Squeezy
   actif) et peuvent être présentées sans réserve.
6. **Exécution locale, synchronisation optionnelle.** Aucune copie de la
   landing ne peut promettre un produit "100% local" ou équivalent: le
   chemin connecté rend cette affirmation inexacte (voir
   `docs/specs/dashboard-microfrontend.md`). Formulation attendue:
   exécution plateforme locale + synchronisation cloud optionnelle/à venir.
7. **Synchronisation landing ↔ flags surface.** Aucune copie de la landing
   (metas, `showcase-caption`, sous-titres, `plan-card`, CTA) ne peut
   présenter comme livrée une capacité dont le flag
   `EXTENSION_SURFACE_FLAGS` est `false`. Ces capacités sont soit omises,
   soit qualifiées « à venir » (`tier: 'soon'`, note d'activation). La copie
   pilotée par flag utilise `trackingLive` / `connectedLive` /
   `upcomingFeatures` dérivés de `EXTENSION_SURFACE_FLAGS` dans
   `apps/landing/src/routes/+page.svelte` : un flip de flag met la landing à
   jour sans édition manuelle.

## Transitions de surface (revue)

```text
[visiteur anonyme]
  └─ lit landing → featureMatrix suit EXTENSION_SURFACE_FLAGS (suivi + connecté = « à venir »)
       └─ installe extension → onglets activés uniquement (feed, profil, cv, tjm, réglages)
            └─ onglet désactivé → invisible + non navigable (garde isTabEnabled)
            └─ (optionnel) crée un compte → /dashboard
                 ├─ sans premium → sync dashboard désactivée, générations distantes bloquées
                 └─ avec premium (10€ TTC/an) → sync activée, 20 générations/mois + packs crédits
```

États terminaux couverts :

- visiteur anonyme (pas de compte) — l'extension reste entièrement fonctionnelle ;
- compte sans premium — le scan local n'est jamais bloqué ;
- compte premium — la valeur ajoutée est strictement connectée (sync + crédits) ;
- génération distante bloquée par crédit épuisé — `getAccountDecision` du
  dashboard gère l'erreur de manière typée, l'extension n'est pas affectée.

## Preuves attendues pour valider la landing

- `PREMIUM_FEATURE_ENABLED === false` dans `apps/extension/src/lib/core/features/flags.ts` ;
- `EXTENSION_SURFACE_FLAGS` (`packages/domain/src/feature-flags.ts`) : `applications === false`
  et `connected === false` au lancement ; importé par
  `apps/landing/src/routes/+page.svelte` (`trackingLive`, `connectedLive`, `upcomingFeatures`) ;
- la liste de navigation extension (`apps/extension/src/lib/state/app-navigation.svelte.ts`) ne contient
  aucune route conditionnée au premium ;
- `apps/landing/src/routes/+page.svelte` ne contient aucun `tier: 'premium'` pour une capacité
  listée `free` dans le tableau ci-dessus ;
- aucune capacité dont le flag surface est `false` n'apparaît avec `tier: 'free'` ni comme
  livrée dans une copie (metas, captions, sous-titres, plans, CTA) ;
- `apps/landing/src/lib/credits.ts` est la seule source pour le prix mensuel et les packs.
