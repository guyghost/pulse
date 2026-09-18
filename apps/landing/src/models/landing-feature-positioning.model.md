# Landing & Store Public Surface Model

Source de vérité pour l’alignement entre le périmètre V1 réellement activé dans
l’extension MissionPulse et les deux surfaces publiques de lancement :

- `docs/store-listing.md` ;
- `apps/landing/src/routes/+page.svelte`.

Ce modèle complète `apps/extension/src/models/release-surface-alignment.model.md`
(catalogue, permissions et preuves d’artefact) et dépend de
`apps/extension/src/models/surface-feature-flags.model.md` ainsi que de
`packages/domain/src/feature-flags.ts`. Il ne modifie ni le code des surfaces,
ni le catalogue de connecteurs, ni la politique de confidentialité, ni la
configuration de facturation.

## Décision gouvernante

Décision CEO du 12 septembre 2026 (`PLANS/PULSE_V1_SCOPE.md`, hors dépôt) :

- V1 = extension Chrome MV3 local-first ;
- surfaces activées : onboarding, feed, profil, CV, TJM, réglages ;
- connecteurs distribués : Free-Work, LeHibou, Hiway, Cherry Pick ;
- Gemini Nano est une amélioration locale optionnelle, jamais un prérequis ;
- `applications: false`, `connected: false`, Premium dormant, Copilot/Eve
  distant fail-closed.

Aucune réintroduction publique de ces capacités n’est autorisée sans une
nouvelle décision CEO explicite suivie d’une mise à jour de ce modèle.

## Principes

1. **L’extension activée est la preuve.** Une capacité peut être présentée
   comme livrée uniquement si sa surface de lancement est activée et validée
   sur l’artefact exact.
2. **Omission par défaut.** Une capacité désactivée au lancement est omise des
   surfaces publiques V1. Le statut « à venir » est une décision de
   communication séparée, pas un comportement implicite.
3. **Pas de vente anticipée.** Tant que `connected: false` et Premium sont
   dormants, la landing et la fiche Store n’affichent aucune offre ou CTA de
   compte, dashboard, synchronisation, crédits, prix ou inscription.
4. **Le modèle décide, pas le texte libre.** Les tests dérivent l’état public
   depuis les flags et des chaînes interdites explicites. Un LLM peut signaler
   une divergence ; il ne peut ni valider une promesse ni autoriser une
   publication.
5. **Séparation des lexical scopes.** « Se connecter à une plateforme source »
   décrit une session Chrome existante ; « compte MissionPulse », « dashboard »
   et « synchronisation » décrivent la couche connectée désactivée. La copie
   publique V1 évite cette ambiguïté.

## États d’une capacité publique

| État           | Signification                                                                | Valeur V1 pour `applications` / `connected` / Premium / IA distante  |
| -------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `omitted`      | Absente des surfaces publiques ; aucun bénéfice, prix, date ou CTA impliqué. | obligatoire                                                          |
| `upcoming`     | Mentionnée comme future après décision CEO explicite de communication.       | interdit sans nouvelle décision                                      |
| `offered_free` | Présentée comme livrée et accessible sans compte.                            | réservé aux surfaces activées                                        |
| `offered_paid` | Présentée avec compte, crédits, synchronisation ou prix.                     | interdit tant que la couche connectée et Premium ne sont pas activés |

Transitions autorisées :

```text
omitted --CEO_COMMUNICATION_DECISION--> upcoming
upcoming --REMOVE_PUBLIC_CLAIM--> omitted
upcoming --CEO_ENABLE_SURFACE + RELEASE_EVIDENCE--> offered_free | offered_paid
offered_free --SURFACE_DISABLED--> omitted
offered_paid --SURFACE_DISABLED--> omitted
```

Toute autre transition est interdite. Un flip de flag seul ne suffit jamais :
`CEO_ENABLE_SURFACE` exige la décision explicite, le flag partagé à `true` et
les preuves de release du modèle `release-surface-alignment.model.md`.

## Machine de barrière P0-4

```text
[draft]
  --MODEL_REVIEWED--> [implementation_allowed]
  --MODEL_GAP--> [blocked]

[implementation_allowed]
  --EDIT_PUBLIC_SURFACE--> [dirty]

[dirty]
  --VERIFY_PASSED--> [verified]
  --VERIFY_FAILED--> [blocked]

[blocked]
  --EDIT_PUBLIC_SURFACE--> [dirty]        // retry après correction
  --CEO_SCOPE_CHANGE--> [draft]           // annulation / changement de cap

[verified]
  --EDIT_PUBLIC_SURFACE--> [dirty]        // toute modification rouvre la barrière
  --RELEASE_RECEIPT--> [published]        // état terminal pour ce candidat
  --CEO_SCOPE_CHANGE--> [draft]
```

`published` est terminal pour un digest d’artefact donné. Un changement de
cap redémarre à `draft` ; il n’existe aucune transition directe
`published → verified`.

## Frontière V1

### `offered_free`

| Capacité publique                                 | Preuve extension                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| Feed unique, 4 plateformes dédupliquées           | `apps/extension/src/lib/core/connectors/*-parser.ts`, nav `feed` |
| Score stack, TJM, remote, séniorité               | `apps/extension/src/lib/core/scoring/relevance.ts`               |
| Score sémantique local optionnel (Gemini Nano)    | `apps/extension/src/lib/shell/ai/semantic-scorer.ts`             |
| Comparateur et shortlist                          | `apps/extension/src/lib/state/feed-page.svelte.ts`               |
| Profil et CV locaux                               | nav `profile`, `cv`                                              |
| Radar TJM par stack                               | nav `tjm`                                                        |
| Notifications, favoris/masquage, exports, offline | surfaces activées et tests de lancement                          |

### `omitted` — interdit en public V1

| Capacité / affirmation                      | Preuve d’interdiction                                             |
| ------------------------------------------- | ----------------------------------------------------------------- |
| Suivi de candidatures, pipeline, relances   | `EXTENSION_SURFACE_FLAGS.applications === false`                  |
| Dashboard connecté, compte, synchronisation | `EXTENSION_SURFACE_FLAGS.connected === false`                     |
| Premium, prix, multi-compte, crédits, packs | Premium dormant ; couche connectée désactivée                     |
| Assistance IA de formulaire                 | hors scope V1 ; aucune promesse publique sans activation et revue |
| Copilot / Eve distant                       | rollout fail-closed ; hors noyau local-first                      |
| Malt, Collective, cinq sources              | catalogue de production limité à quatre connecteurs               |
| Témoignages, traction, données d’usage      | absence de preuve externe mesurée                                 |

Les formulations ambiguës sont traitées comme des promesses : « bientôt »,
« optionnel », « en cours d’activation », « préparer vos candidatures » avec
génération de message, ou tout CTA vers `/register`, `/dashboard` ou un
checkout sont interdits dans l’état `omitted`.

## Invariants

1. **Dépendance aux flags.** La homepage importe
   `EXTENSION_SURFACE_FLAGS` depuis `@pulse/domain` et ne construit la ligne
   « suivi de candidatures » que si `applications === true` ; sinon elle est
   absente du rendu.
2. **Aucune surface connectée publique.** Avec `connected === false`, la
   homepage et la fiche Store ne contiennent aucune route, offre ou CTA de
   compte, dashboard, synchronisation, crédits ou prix payant.
3. **Aucune génération distante.** La copie V1 ne décrit pas de génération de
   pitch/message, d’assistance de formulaire, de Copilot ni d’Eve.
4. **Exactitude du catalogue.** Seules les quatre plateformes distribuées sont
   citées ; aucun chiffre de volume plateforme n’est présenté comme preuve de
   traction utilisateur.
5. **Preuve locale de l’IA.** Gemini Nano est toujours qualifié d’optionnel et
   local ; le scoring déterministe reste la promesse de base.
6. **Tests obligatoires.** La barrière passe seulement si les tests de copie
   V1 vérifient les chaînes interdites sur la fiche Store et la homepage, les
   flags attendus, les quatre connecteurs exacts et l’absence de CTA connecté.
7. **Échec explicite.** Un seul invariant violé place la machine dans
   `blocked` ; il n’existe pas de contournement par revue textuelle.

## Revue du modèle avant implémentation

- Cas nominaux : visiteur anonyme installe et utilise l’extension sans compte ;
  surfaces libres activées ; quatre sources exactes.
- Cas d’erreur : flag désactivé, source non distribuée, claim payant absent de
  preuve, test d’alignement échoué.
- Annulation / changement de cap : `CEO_SCOPE_CHANGE` ramène tous les états non
  publiés vers `draft` ; un candidat déjà publié reste un snapshot terminal.
- Retry : `blocked → dirty` seulement après édition de la surface publique ;
  aucune tentative de publication pendant `blocked`.
- Permissions : seul le CEO peut changer le cap ou activer une surface ; Tor
  peut rédiger et corriger ; les tests décident de `verified` ; aucun LLM ne
  décide.
- États terminaux : `published` pour un artefact donné ; `omitted` comme état
  stable d’une capacité hors V1.

Conclusion de revue : le modèle couvre le cas nominal, les erreurs, l’annulation,
le retry, les permissions et les états terminaux. L’implémentation de P0-4 est
autorisée.

## Preuves attendues pour `verified`

- `EXTENSION_SURFACE_FLAGS.applications === false` ;
- `EXTENSION_SURFACE_FLAGS.connected === false` ;
- absence des chaînes publiques interdites dans `docs/store-listing.md` et
  `apps/landing/src/routes/+page.svelte` ;
- absence de CTA `/register`, `/dashboard`, checkout ou gestion de crédits ;
- test de copie V1 et tests d’alignement landing/extension passants ;
- `pnpm --filter @pulse/landing test` et `pnpm --filter @pulse/landing typecheck`
  passants sur le commit candidat.
