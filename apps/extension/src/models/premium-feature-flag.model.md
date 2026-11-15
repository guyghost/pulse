# Premium Feature Flag — modèle historique remplacé

> **Statut : remplacé.** La source de vérité du produit freemium est
> [`models/freemium-entitlement-provisioning.model.md`](../../../../models/freemium-entitlement-provisioning.model.md).

Ce document conserve uniquement le constat nécessaire à la migration. Il ne
doit plus guider une nouvelle décision d'accès, une interface ou un message
marketing.

## Comportement historique encore présent

- La constante core `PREMIUM_FEATURE_ENABLED` vaut `false`.
- Quand le flag est dormant, les surfaces anciennement restreintes sont
  déverrouillées.
- Quand le flag est actif, la garde repose sur le booléen local
  `premium_enabled`.
- Le side panel peut lire et écrire ce booléen via
  `GET_PREMIUM_STATUS` / `SET_PREMIUM`.
- Le handler `GENERATE_ASSET` consulte ce mécanisme avant d'appeler Gemini Nano.
- Le DevPanel permet de simuler les combinaisons flag / compte.

Désactiver l'ancien paywall local de pages tout en gardant son code de
navigation testable derrière un feature flag. Le kit Gemini Nano sur l'appareil
est une capacité gratuite et locale dans chaque état du flag. Le Copilot Eve
distant est une frontière produit distincte : seuls son entitlement serveur et
son déploiement au build autorisent les jobs distants ; ni `premium_enabled` ni
`premium_feature_enabled` ne font autorité pour Eve.

Ce comportement est une dette de migration. Il ne constitue pas un
entitlement : le client peut écrire la valeur et aucune autorité de paiement ne
la signe.

## Règles de migration

1. Ne pas activer ce flag en production pour lancer le nouveau Premium.
2. Construire d'abord l'autorité serveur, le registre webhook et la projection
   versionnée définis par le modèle freemium.
3. Remplacer les messages locaux par la projection authentifiée.
4. Supprimer `SET_PREMIUM` des builds de production ; conserver un override
   strictement dev pour les scénarios QA.
5. Retirer le flag historique seulement après migration de toutes les surfaces
   et tests d'expiration, révocation et changement de compte.
6. Ne jamais migrer `premium_enabled === true` vers un entitlement payé.

Le LLM ne décide aucune transition dans l'ancien mécanisme ni dans sa migration.

**La valeur par défaut est DORMANT.** Elle réside dans le core en tant que
constante pure (`PREMIUM_FEATURE_ENABLED = false`) afin de faire autorité pour
la production.

## Décision pure (core)

`shouldPremiumGate(featureActive: boolean, isPremium: boolean): boolean` située
dans `src/lib/core/features/flags.ts`.

```
shouldPremiumGate = featureActive && !isPremium
```

Table de vérité :

| `featureActive` | `isPremium` | `shouldPremiumGate` | Effet visible par l'utilisateur    |
| --------------- | ----------- | ------------------- | ---------------------------------- |
| `false`         | \_          | `false`             | Tout déverrouillé (dormant)        |
| `true`          | `true`      | `false`             | Utilisateur Premium — déverrouillé |
| `true`          | `false`     | `true`              | Utilisateur gratuit — restrictions |

Un second accesseur pur `canAccessPremium(featureActive, isPremium)` renvoie
`!shouldPremiumGate(...)` et constitue l'expression unique utilisée par chaque
surface UI pour décider si les pages / fonctionnalités premium sont accessibles.

## Surfaces affectées

| Surface                         | Emplacement                    | Comportement dormant           | Comportement actif                                     |
| ------------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------------------ |
| Indicateur de verrouillage nav  | `sidepanel/App.svelte`         | Jamais affiché                 | Affiché pour cv / applications / tjm si gratuit        |
| Écran de verrouillage de page   | `sidepanel/App.svelte`         | Jamais affiché                 | Affiché lors de la navigation vers une page restreinte |
| Pages cv / applications / tjm   | `sidepanel/App.svelte`         | Rendues (accessibles)          | Rendues uniquement si `canAccessPremium`               |
| Préchargement des pages Premium | `sidepanel/App.svelte`         | Préchargées (accessibles)      | Préchargées uniquement si `canAccessPremium`           |
| Kit local (`GENERATE_ASSET`)    | `background/index.ts`          | Autorisé, aucun envoi cloud    | Autorisé, aucun envoi cloud                            |
| Affichage « Plan » des réglages | `ui/pages/SettingsPage.svelte` | Masqué / « Premium désactivé » | Affiche « Premium local actif » / « Gratuit local »    |
| Stub de génération dev          | `dev/chrome-stubs.ts`          | Renvoie un artefact mock       | Renvoie un artefact mock                               |
| Copilot Eve distant             | `shell/copilot/`               | Entitlement serveur seul       | Entitlement serveur seul                               |

## Valeur du flag au runtime — provenance

| Contexte      | Source                                                             |
| ------------- | ------------------------------------------------------------------ |
| UI production | constante core `PREMIUM_FEATURE_ENABLED` (via le store `features`) |
| SW production | `chrome.storage.local['premium_feature_enabled']` ?? constante     |
| UI dev        | surcharge dev `localStorage['__missionpulse_dev_premium_feature']` |
| SW dev (stub) | clé de stockage dev, initialisée depuis la même clé `localStorage` |

Le store `features` (`src/lib/state/features.svelte.ts`) est le détenteur
runtime pour l'UI. Il s'initialise depuis la constante core et, en dev
uniquement, lit une surcharge depuis `localStorage`. La production ne lit jamais
la surcharge.

## Bascule dev (tout tester)

Le DevPanel expose un contrôle Premium avec trois scénarios déterministes,
appliqués au rechargement (même motif que le jeu de données QA) :

| Scénario         | `premium_feature` | `premium_enabled` | Objectif                                           |
| ---------------- | ----------------- | ----------------- | -------------------------------------------------- |
| Dormant (défaut) | `false`           | `true`            | Tout déverrouillé ; code de garde dormant          |
| Actif — Premium  | `true`            | `true`            | Utilisateur Premium ; garde active, ouvert         |
| Actif — Gratuit  | `true`            | `false`           | Utilisateur gratuit ; verrous + `PREMIUM_REQUIRED` |

Cela permet au développement d'exercer chaque état : toutes les fonctionnalités
accessibles (dormant), premium déverrouillé (actif + premium) et l'UI de
paywall / verrouillage (actif + gratuit).

## Invariants

1. Lorsque `premiumFeatureActive === false`, **aucune** surface n'est
   restreinte. `isPremium` est sans effet sur les décisions d'accès.
2. La valeur par défaut du flag est la constante core
   `PREMIUM_FEATURE_ENABLED = false`.
3. La surcharge runtime est **uniquement dev** (`import.meta.env.DEV`). La
   production utilise la constante ; la clé `chrome.storage` est absente par
   défaut.
4. La décision pure vit dans le **core** ; la valeur du flag est lue depuis le
   core (production) ou la surcharge dev (développement). Le core n'importe
   jamais le shell.
5. Aucun LLM ne décide de la restriction. Le flag est un booléen ; les
   transitions sont explicites.
6. L'infrastructure premium existante (store, façade, messages bridge, handlers
   SW) est conservée inchangée — seuls les **points de garde** consultent le
   flag. Cela garde le _feature flipping_ prêt pour une réactivation ultérieure.
7. `GENERATE_ASSET` et son stub dev ne lisent jamais aucun des deux anciens
   booléens premium ; le kit local reste gratuit et n'envoie aucun contenu
   candidat vers un backend.
8. La création de job Eve ne lit jamais aucun des deux anciens booléens premium.
   Elle exige le déploiement _fail-closed_ de Copilot ainsi qu'un entitlement
   serveur canonique frais.

## Hors périmètre (différé)

- Configuration distante / _feature flipping_ côté serveur (l'utilisateur le
  branchera plus tard).
- Une UI de production pour basculer le flag (seul le DevPanel l'expose pour
  l'instant).
- Suppression complète du code premium — il reste dormant derrière le flag.
