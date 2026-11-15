# Modèle de confiance de parsing & file de révision

## Périmètre

Source de vérité pour la file de révision « À vérifier » : quelles missions
scrapées sont signalées comme ayant une faible confiance d'extraction, comment
leur confiance est calculée, et comment les décisions de révision de
l'utilisateur (garder / ignorer) sont enregistrées.

Couvre : signaux de confiance, formule de confiance, seuil de signalement, états
et transitions de révision, dérivation pure de la liste signalée et propriété de
la persistance.

Ne couvre **pas** : l'ordre du feed, la planification des connecteurs ni le
scoring sémantique. Une décision de révision ne modifie jamais le score d'une
mission ni sa présence dans le feed principal (décision de périmètre explicite —
la file est une surface de qualité d'extraction, pas un filtre de feed).

Aucune sortie LLM ne peut décider du signalement, de la confiance ou d'une
transition de révision. Le LLM produit des signaux ; le modèle décide.

## Entrées

- `Mission[]` : le catalogue de missions courant (entrée du feed après
  déduplication).
- Signaux externes, injectés par l'appelant :
  - relations de quasi-doublon issues de `core/scoring/dedup.ts`
    (`deduplicateMissionsDetailed`).
  - `ConnectorHealthRecord[]` issu de `core/connectors/parser-health-logic.ts`
    marquant les parsers suspects.
- `ReviewDecisionMap` : décisions utilisateur persistées (`kept` / `dismissed`),
  chargées par le Shell.

## Signaux de faible confiance

| Id du signal        | Se déclenche quand                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tjm_missing`       | `tjm === null` **et** aucune fourchette annoncée (`tjmMin == null && tjmMax == null`).                                                                  |
| `date_ambiguous`    | `startDate` ou `publishedAt` présent mais malformé / non parsable, **ou** les deux absents (aucune information de date).                                |
| `incomplete_fields` | `title` nettoyé plus court que `MIN_TITLE_LENGTH` (8) **ou** `description` nettoyée plus courte que `MIN_DESCRIPTION_LENGTH` (40).                      |
| `near_duplicate`    | la mission apparaît comme `duplicateMissionId` dans une relation de déduplication au seuil canonique (0.8).                                             |
| `parser_suspect`    | le connecteur source de la mission possède un enregistrement de santé pour lequel `deriveParserHealthAlert` renvoie une alerte (zéro résultat anormal). |

`tjm_missing`, `date_ambiguous` et `incomplete_fields` sont dérivés purement de
la mission. `near_duplicate` et `parser_suspect` sont des signaux de contexte
fournis par l'appelant (la déduplication et la santé des parsers sont calculées
une fois par scan, pas par mission).

## Formule de confiance

```
confidence = clamp01(1 − Σ weights(active signals))
```

| Signal              | Poids |
| ------------------- | ----- |
| `tjm_missing`       | 0.30  |
| `date_ambiguous`    | 0.20  |
| `incomplete_fields` | 0.20  |
| `near_duplicate`    | 0.30  |
| `parser_suspect`    | 0.15  |

Le résultat est borné dans `[0, 1]` et arrondi à 2 décimales.

## Seuil de signalement

`FLAG_THRESHOLD = 0.75`. Une mission est **signalée** ssi `confidence < 0.75`.

Une mission sans signal a une confiance de `1` et n'est jamais signalée. Une
mission signalée possède toujours au moins un signal actif.

## États de révision

| État        | Signification                                     | Terminal |
| ----------- | ------------------------------------------------- | -------- |
| `unflagged` | Confiance ≥ seuil ; non affichée dans la file.    | Oui      |
| `flagged`   | Confiance < seuil et aucune décision enregistrée. | Non      |
| `kept`      | L'utilisateur a validé l'extraction (« Garder »). | Oui      |
| `dismissed` | L'utilisateur a rejeté la mission (« Ignorer »).  | Oui      |

## Événements et transitions

| Événement         | De          | Garde                                             | Vers        | Effet                                                                |
| ----------------- | ----------- | ------------------------------------------------- | ----------- | -------------------------------------------------------------------- |
| `flag`            | `unflagged` | confiance calculée < `FLAG_THRESHOLD`             | `flagged`   | la mission apparaît dans la file dérivée                             |
| `recompute`       | `flagged`   | mission ou signaux modifiés                       | `flagged`   | confiance, raisons et ordre recalculés (dérivation pure)             |
| `recompute_clear` | `flagged`   | confiance recalculée ≥ `FLAG_THRESHOLD`           | `unflagged` | la mission quitte la file                                            |
| `keep`            | `flagged`   | action utilisateur, mission actuellement signalée | `kept`      | décision `{ status: 'kept', decidedAt }` persistée par le Shell      |
| `dismiss`         | `flagged`   | action utilisateur, mission actuellement signalée | `dismissed` | décision `{ status: 'dismissed', decidedAt }` persistée par le Shell |

### Transitions interdites

- `kept` / `dismissed` → `flagged` : une mission décidée ne réintègre jamais la
  file (sa décision l'emporte sur tout recalcul, même si la confiance change).
- `unflagged` → `kept` / `dismissed` : les décisions ne s'appliquent qu'aux
  missions actuellement signalées ; la dérivation ignore les décisions pour des
  missions absentes ou non signalées (les décisions périmées sont inertes,
  jamais ressuscitées).
- Toute transition pilotée par du texte libre, une sortie LLM ou une raison
  sémantique. Seuls le calcul pur de confiance et les actions utilisateur
  explicites décident.

## Dérivation (pure)

`deriveReviewQueue(missions, decisions, duplicateMissionIds, suspectConnectorIds)`
renvoie les entrées signalées :

- exclut les missions ayant une décision enregistrée (`kept` ou `dismissed`) ;
- exclut les missions dont la confiance est ≥ `FLAG_THRESHOLD` ;
- trie par confiance croissante (pire extraction en premier) ;
- attache par entrée : mission, confiance, identifiants des signaux actifs,
  libellé de raison principale.

Libellé de raison principale (premier signal actif dans cet ordre fixe) :
`tjm_missing` → « TJM manquant », `date_ambiguous` → « Date ambiguë »,
`near_duplicate` → « Doublon potentiel », `incomplete_fields` → « Champs
incomplets ». `parser_suspect` n'a pas de libellé de raison ; il bascule l'icône
de l'élément vers la variante alerte.

## Invariants

1. `confidence ∈ [0, 1]` pour chaque mission.
2. Une mission `dismissed` ne réapparaît jamais dans la file.
3. Une mission `kept` ne réapparaît jamais dans la file.
4. La file est une fonction pure de
   `(missions, decisions, dedup relations, parser health, FLAG_THRESHOLD)` —
   aucun état caché, zéro I/O dans la dérivation.
5. Chaque entrée signalée a ≥ 1 signal actif ; la confiance de chaque entrée
   est < `FLAG_THRESHOLD`.
6. Les décisions sont immuables une fois enregistrées (pas d'annulation de
   décision en v1 ; le re-signalement après un nouveau scan est géré par les
   règles de transitions interdites ci-dessus).
7. Les décisions de révision ne mutent jamais les missions, les scores ni le
   feed principal.

## Persistance (Shell)

- Stockage : `chrome.storage.local`, clé `reviewQueueDecisions`, forme
  `Record<missionId, { status, decidedAt }>`, plafonné aux
  `MAX_REVIEW_DECISIONS` (2000) entrées les plus récentes.
- Propriétaire : `shell/storage/review-decisions.ts`, exposé à l'UI via
  `shell/facades/review-queue.facade.ts`. Le side panel ne touche jamais
  `chrome.*` directement.
- Les écritures sont sans attente (_fire-and-forget_) du point de vue de l'UI :
  une décision en mémoire s'applique immédiatement ; une écriture échouée est
  journalisée par le Shell et ne doit pas annuler la transition (recharger la
  page redérive depuis la dernière table persistée — au pire la mission est
  signalée à nouveau, ce qui est sûr).

## Checklist de revue

- Nominal : mission avec TJM manquant uniquement → confiance 0.70 → signalée
  avec « TJM manquant ».
- Erreurs : dates / champs malformés tolérés (signaux, pas d'exceptions) ; les
  identifiants de connecteurs inconnus dans les enregistrements de santé sont
  ignorés.
- Annulations / relances : non applicable — la dérivation est sans état ; la
  persistance suit la règle du dernier écrit gagnant par décision.
- Permissions : non applicable — les décisions vivent dans le stockage local,
  aucun accès hôte.
- États terminaux : chaque mission se termine en `unflagged`, `kept` ou
  `dismissed` dans la vue de file ; `flagged` est toujours transitoire.
- Interdit : transitions pilotées par LLM / texte libre (voir ci-dessus) ;
  mutation du feed depuis la file.
