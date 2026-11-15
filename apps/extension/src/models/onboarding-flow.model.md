# Flux d'onboarding — Modèle d'état

> Modèle en prose faisant autorité pour le flux UI d'onboarding de bout en bout.
> La machine dans `onboarding-flow.machine.ts` (+ `.contract.ts`, `.logic.ts`)
> est la forme exécutable de ce document. Si les deux divergent, **c'est le
> modèle qui a tort**.

## Objectif

Amener un utilisateur de première installation de « extension installée » à
« premier scan en cours » sans jamais bloquer la délivrance de la première
valeur. Le flux collecte le signal de profil minimal nécessaire pour scorer les
missions, demande une source connectée et lance un scan — même si l'utilisateur
passe chaque question.

## Périmètre

- **Dans le périmètre :** orchestration des phases UI (welcome → connect →
  wizard → notify → persist → scan → done), gardes de validité d'étape,
  protocole `pendingEffect` que le shell consomme pour exécuter la persistance /
  le scan.
- **Hors périmètre :** consentement durable aux sources + permissions + détection
  de session (détenus par `onboarding-source.machine.ts`, réutilisé tel quel),
  stockage d'identifiants (aucun — _local-first_), OTP / conformité (aucun —
  sessions par cookies).

## Phases (états)

```
welcome ──START──▶ connecting ──NEXT(hasSource)──▶ wizard ──NEXT(lastStep)──▶ notifying
   │                   │                              │                            │
   │                BACK                             BACK                         NEXT
   │                   ▼                              │                            ▼
   │                welcome ◀─────────── BACK(first)──┘                        persisting
   │                                                                              │
   └──────────SKIP──────────────────────────────────────────┬─SKIP───────────────┤
                           │                                │                   │
                           ▼                                ▼                   ▼
                         scanning ◀──PERSISTED/PERSIST_FAILED──── persisting ◀──┘
                           │
                      SCAN_DONE / SCAN_FAILED
                           ▼
                       completed (final)
```

`wizard` est un état **plat** :
`context.wizardStep ∈ {identity, preferences, skills}` est la source de vérité
unique. La **phase de haut niveau est dérivée de la valeur d'état de l'acteur**
(`phaseFromStateValue`), afin que le contexte et l'état actif ne puissent jamais
se désynchroniser.

## Invariants (contraignants)

1. **Ne jamais bloquer la première valeur.** Un scan s'exécute toujours. `SKIP`
   avance directement vers `scanning` avec un profil par défaut partiel ; les
   transitions `_FAILED` avancent tout de même vers la phase suivante. Il n'y a
   aucune impasse avortée et aucun état terminal avant `completed`.
2. **Terminal idempotent.** `completed` est l'unique état `final` XState. Aucun
   événement n'est admis après qu'il est atteint.
3. **Une action principale par écran.** Chaque phase possède au plus une action
   avant (`NEXT`) et une action arrière (`BACK`) ; `SKIP` est l'unique porte de
   sortie.
4. **Les gardes décident, pas les composants.** `canAdvanceStep` (pur, dans le
   contrat) est l'unique arbitre indiquant si `NEXT` est activé sur une étape du
   wizard. L'UI n'invente jamais une transition.
5. **Les effets sont des descripteurs, pas des exécutions.** La machine écrit un
   `OnboardingFlowEffect` pur dans `pendingEffect` ; le shell le lit, exécute
   l'I/O et renvoie le résultat via `SCAN_DONE` / `SCAN_FAILED` / `PERSISTED` /
   `PERSIST_FAILED`. La machine n'appelle jamais `fetch` / `storage` /
   `chrome.*`.
6. **Événements admis uniquement.** Les événements créés par le contrôleur sont
   marqués via un `WeakSet` détenu par le **module de la machine** (pas
   `logic.ts`) ; le contrôleur appelle `admitFlowEvent(event)` avant d'envoyer,
   et la garde `admittedEvent` lit le même ensemble via la fermeture passée à
   `createOnboardingFlowSetup`. Séparer l'écrivain et le lecteur sur deux
   modules (deux ensembles disjoints) rejette silencieusement chaque événement —
   c'est un invariant structurel : **un ensemble, un module**.

## Validité des étapes du wizard (`canAdvanceStep`)

| Étape       | Garde                                                 |
| ----------- | ----------------------------------------------------- |
| identity    | `firstName` et `jobTitle` sont non vides (après trim) |
| preferences | `tjmMin > 0` et `tjmMax >= tjmMin`                    |
| skills      | au moins un mot-clé                                   |

## Protocole d'effets (machine → shell)

| Quand (transition)     | `pendingEffect` écrit          | Retour du shell                |
| ---------------------- | ------------------------------ | ------------------------------ |
| notifying → persisting | `PERSIST_PROFILE`              | `PERSISTED` / `PERSIST_FAILED` |
| persisting → scanning  | `START_SCAN`                   | `SCAN_DONE` / `SCAN_FAILED`    |
| *_SKIP → scanning      | `START_SCAN { partial: true }` | `SCAN_DONE` / `SCAN_FAILED`    |

Sur `PERSIST_FAILED`, la machine écrit tout de même `START_SCAN` et passe à
`scanning` (ne bloque jamais la première valeur) ; l'erreur typée est remontée
dans `context.error` pour l'UI.

## Garde de ré-entrée

`completed` est `final`. L'extension filtre sur `hasCompletedOnboarding`
(drapeau de stockage défini par le shell une fois `completed` atteint), donc le
flux n'est jamais ré-entré. Le contrôleur est recréé à neuf à chaque exécution
d'onboarding.

## Progression utilisateur (projection)

La progression visible décrit uniquement les **cinq décisions de configuration**
et ne compte jamais les états techniques transitoires :

| Écran / phase              | Progression visible |
| -------------------------- | ------------------- |
| `welcome`                  | aucune              |
| `connecting`               | 1 / 5               |
| `wizard(identity)`         | 2 / 5               |
| `wizard(preferences)`      | 3 / 5               |
| `wizard(skills)`           | 4 / 5               |
| `notifying`                | 5 / 5               |
| `persisting/scanning/done` | 5 / 5               |

Invariants de présentation :

1. La progression est monotone sur le chemin nominal.
2. `BACK` peut la décrémenter d'une seule décision utilisateur.
3. Un état technique (`persisting`, `scanning`, `completed`) ne crée jamais une
   nouvelle étape visible.
4. Le libellé `Terminer` est réservé à la dernière décision. La sortie de
   `wizard(skills)` reste libellée `Continuer`.
5. Un seul `h1` est rendu par écran. L'introduction de layout est masquée sur
   `welcome`, qui possède son propre titre principal.
6. Les contrôles sans texte visible exposent un nom accessible stable :
   `Ajouter la compétence`, `Retirer <compétence>` et
   `Activer/Désactiver les notifications`.

## Instantané (projection)

`projectOnboardingFlow(ctx, phase)` expose un `OnboardingFlowSnapshot` stable :
`phase`, `wizardStep`, `profile`, `connectedSources`, `notifyEnabled`,
`progress {current,total}`, `pendingEffect`, `error`, `terminal`, `canAdvance`.
L'UI ne consomme que cette forme ; elle ne touche jamais le contexte
directement.

## Cycle de vie de l'acteur

`controller.subscribe()` retourne une `Subscription` XState. Le shell enregistre
toujours un cleanup fonctionnel qui appelle `subscription.unsubscribe()`.
L'identité d'un effet ne doit pas être comparée à un proxy Svelte : le shell
déduplique les effets avec une clé stable `attemptId:kind`.

Invariants :

- démonter l'onboarding n'émet aucune erreur ;
- un même effet n'est exécuté qu'une fois ;
- un retry produit une nouvelle décision de la machine, jamais une transition
  pilotée par le texte de l'erreur.
