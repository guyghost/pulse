# Classification des missions — Jev (TypeSafe AI) via Vercel AI Gateway

Source de vérité pour la classification des missions par le modèle de
décision **Jev** de TypeSafe AI, consommé via **Vercel AI Gateway** et l'API
`experimental_evaluate` d'AI SDK 7 (>= 7.0.105).

Propositions DAO : #202 (service) et #203 (exposition feed).

## Pourquoi Jev

Jev est un modèle de décision probabiliste : au lieu de générer du texte à
parser, il évalue en parallèle les questions déclarées et renvoie des
réponses **typées** (Choice / Boolean / Score) accompagnées de probabilités.
La classification devient donc type-safe de bout en bout, rapide et peu
coûteuse — contrairement à un LLM génératif.

Le modèle est complémentaire du scoring sémantique Gemini Nano : il enrichit
chaque mission d'une classification stable, indépendante du matériel local
et du profil utilisateur.

## Architecture (Functional Core / Imperative Shell)

```text
core/types/mission-classification.ts   # MissionCategory, MissionClassification
core/classification/questions.ts       # questions typées + état d'évaluation
core/classification/parse-evaluation.ts# validation + routage par confiance
core/classification/fingerprint.ts     # hash de contenu (invalidation cache)
shell/ai/mission-classifier.ts         # appel Jev, timeout/retry, cache
shell/storage/classification-cache.ts  # chrome.storage.local, TTL 7 j
shell/scan/pipeline.ts                 # stage `classify` (après `enrich`)
background/index.ts                    # enrichissement post-scan non bloquant
```

- Le **Core** ignore le SDK : les questions sont des objets structurellement
  compatibles avec `EvaluationQuestion`, les réponses sont prises en
  `unknown` et réduites par type guards (zéro `any`).
- Le **Shell** seul parle au réseau : `createGateway({ apiKey })` +
  `gateway.evaluationModel('typesafe-ai/jev')`.

## Questions posées

| ID                 | Type    | Réponse                                                                                                      |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------ |
| `category`         | Choice  | `frontend` \| `backend` \| `fullstack` \| `mobile` \| `data` \| `devops` \| `product` \| `design` \| `other` |
| `remoteCompatible` | Boolean | complément de `remote` quand la source ne l'expose pas                                                       |

L'état évalué (`state`) est projeté depuis la mission : titre (tronqué à
200), stack, politique remote, description (tronquée à 1 500). Le champ
scrapé `remote` n'est **jamais** écrasé.

## Confiance et routage

La confiance globale est le **minimum des confiances par question** :

- `category` : probabilité du choix retenu dans sa distribution ;
- `remoteCompatible` : probabilité de l'issue retenue (distance à 0.5),
  car P(true) n'est pas une confiance dans la réponse.

Sous le seuil configuré (`classificationConfidenceThreshold`, défaut 0.7),
la classification est **jetée** : la mission reste non classée plutôt que
d'afficher une valeur douteuse. Les réponses mal formées sont rejetées par
`parse-evaluation.ts` (testé sans mocks).

## Cycle de vie

1. **Scan** — après le broadcast terminal, `enrichMissionsWithClassification`
   s'exécute de façon non bloquante (aucune erreur ne remonte au scan). La
   classification est appliquée sur les missions **relues depuis le store**
   (seules celles sans classification sont candidates) : une rescore liée à
   un changement de profil qui commite pendant l'enrichissement ne peut jamais
   être écrasée par des scores obsolètes.
2. **Cache** — clé = id de mission, entrée = classification + empreinte de
   contenu + date. TTL 7 jours, 1 000 entrées maximum, purge des expirées au
   démarrage. La classification étant **indépendante du profil**, aucune
   invalidation n'est déclenchée par un changement de profil ; seule une
   variation du contenu de la mission (titre/stack/description) invalide
   l'entrée via l'empreinte FNV-1a.
3. **Persistance** — `classification` est un champ optionnel de `Mission`,
   persisté dans IndexedDB et diffusé via `MISSIONS_UPDATED`.
4. **Pipeline composable** — `classifyStage` s'insère entre `enrich` et
   `track` ; ignoré si `ctx.classification` est absent.

## Réglages et clé

| Setting                             | Défaut | Rôle                          |
| ----------------------------------- | ------ | ----------------------------- |
| `classificationEnabled`             | `true` | interrupteur principal        |
| `maxClassificationPerScan`          | `25`   | budget d'évaluations par scan |
| `classificationConfidenceThreshold` | `0.7`  | seuil minimal de conservation |

La clé AI Gateway est stockée à part dans `chrome.storage.local`
(`aiGatewayApiKey`) via `getAiGatewayApiKey` / `setAiGatewayApiKey` — jamais
en dur. Sans clé, le classifieur est **inerte et silencieux** : le scoring
existant est utilisé tel quel.

## Schémas de réglages touchés

Trois schémas stricts décrivent les réglages ; les champs de classification y
sont ajoutés avec des valeurs par défaut (rétrocompatibilité des données
stockées par les builds antérieurs) :

- `shell/storage/chrome-storage.ts` (`SettingsSchema`) ;
- `shell/settings-release/settings-release.contract.ts` ;
- `shell/messaging/schemas.ts` (`AppSettingsSchema` du bridge).

Le digest `settings/v1` (voir `settings-persistence.model.md`) passe à 12
champs ; les digests hérités à 9 champs restent parsables.

## Manifest

`host_permissions` s'enrichit de `https://ai-gateway.vercel.sh/*` et
`https://ai-gateway.vercel.app/*` (baseURL par défaut du provider gateway).
Le filtrage build-time des permissions connecteurs n'est pas affecté.

## Vie privée

Chaque évaluation est envoyée avec
`providerOptions: { gateway: { zeroDataRetention: true } }` (Zero Data
Retention). Seules les missions scannées sont évaluées — jamais le profil.

## Tests

- `tests/unit/classification/` : questions, parsing/confiance, empreinte —
  purs, sans mocks (miroir du Core) ;
- suites settings/storage : expectations mises à jour avec les trois
  nouveaux champs ; digests hérités couverts par la rétrocompatibilité.
