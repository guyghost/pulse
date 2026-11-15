# Modèle d'unification des mots-clés

Source de vérité pour l'unification de `stack` (compétences) et `searchKeywords` (mots-clés de recherche) du profil en une seule liste `keywords`. Ce modèle constitue la spécification faisant autorité ; l'implémentation dans `core/`, `shell/`, `ui/` et les tests doit s'y conformer.

## Pourquoi

Le profil exposait historiquement deux listes de chaînes en parallèle :

- `stack: string[]` — alimentait uniquement le **scoring local** (`rawStackScore` fait correspondre `mission.stack` avec `profile.stack`).
- `searchKeywords: string[]` — alimentait uniquement les **requêtes API des connecteurs** (`buildSearchContext` les joint dans la `query` en texte libre).

Cette séparation est invisible pour un utilisateur non technique, qui ignore si un terme ("React", "SaaS", "marketplace") doit aller dans "compétences" ou "mots-clés". Il en résulte soit une saisie en double, soit un second champ vide et une expérience dégradée. Nous fusionnons les deux en une seule liste, **`keywords`**, qui alimente les deux canaux. « Il ne restera alors que les mots. »

## Décision (confirmée par le produit)

La liste unifiée `keywords` alimente **les deux** :

1. **Scoring local** — comparé à `mission.stack` (les termes techniques correspondent ; les termes métier sont neutres pour le scoring, voir Invariants).
2. **Requête API des connecteurs** — joints dans la `query` en texte libre envoyée à chaque connecteur de plateforme. `skills: []` reste vide par conception (la logique AND sur les tableaux de compétences restreint excessivement les résultats ; voir la note d'architecture dans `search-context.ts`).

Il s'agit d'une **fusion complète**, et non d'un simple champ de saisie cosmétique masquant deux champs sous-jacents.

## Structure des données

### `UserProfile` (après)

```ts
export interface UserProfile {
  firstName: string;
  keywords: string[]; // ← était : stack: string[]
  tjmMin: number;
  tjmMax: number;
  location: string;
  remote: RemoteType | 'any';
  seniority: SeniorityLevel;
  jobTitle: string;
  scoringWeights?: ScoringWeights;
  // searchKeywords: string[]  ← SUPPRIMÉ (fusionné dans keywords)
}
```

### Ce qui n'est PAS renommé (délibéré)

| Symbole                                    | Pourquoi il conserve son nom                                                                                                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Mission.stack`                            | Parsé depuis le HTML des plateformes ; représente la stack technique de la mission — un concept distinct.                                                                                                                                       |
| `ScoringWeights.stack`                     | Nom de la **dimension** de scoring (correspondance de stack), et non du champ du profil.                                                                                                                                                        |
| `DEFAULT_SCORING_WEIGHTS.stack`            | Idem — poids de la dimension.                                                                                                                                                                                                                   |
| `DeterministicBreakdown.stack`             | Décomposition du score par dimension.                                                                                                                                                                                                           |
| `ConnectedAlertPreferences.requiredStacks` | Contrat inter-applications : synchronisé avec la colonne PostgreSQL `required_stacks` de `apps/dashboard` via `connected-dashboard.ts`. Le renommer briserait la synchronisation cloud. Sémantiquement toujours « stacks de mission requises ». |
| `AlertHistoryEntry.requiredStacks`         | Historique des alertes persisté ; partage le contrat ci-dessus.                                                                                                                                                                                 |
| `SmartAlertCriteria.requiredStacks`        | Idem.                                                                                                                                                                                                                                           |

La dimension de scoring `stack` conserve son nom car elle répond à la question : « quelle part de la stack technique de la **mission** l'utilisateur couvre-t-il ? » — cette question reste inchangée. Seule la liste en entrée du **profil** est renommée `stack` → `keywords`.

## Sémantique du scoring (comportement inchangé)

`rawStackScore(missionStack, profileKeywords)` :

```
denominator = missionStack.length
numerator   = count of missionStack entries present in profileKeywords (lowercased set)
score       = numerator / denominator * 100
```

**Invariant (fusion neutre pour le scoring) :** le dénominateur est `missionStack.length` et la boucle itère sur `missionStack`, et non sur `profileKeywords`. Ajouter à `profileKeywords` des termes métier ("SaaS", "marketplace") qui n'apparaissent jamais dans le `stack` d'une mission ne modifie **pas** le score — ils ne sont tout simplement jamais validés lors de la vérification d'appartenance. Par conséquent, fusionner `searchKeywords` (termes métier) dans `keywords` est neutre pour le scoring de chaque profil existant.

Cas limites :

- `profileKeywords.length === 0` → renvoie `100` (aucune contrainte ; identique à aujourd'hui).
- `missionStack.length === 0` → renvoie `0` (identique à aujourd'hui).

## Sémantique de recherche

`buildSearchContext(profile, lastSync)` :

```
query = profile.keywords.map(trim + collapse spaces).filter(nonEmpty).join(' ')
skills = []   // inchangé : le filtrage des compétences côté serveur reste désactivé
```

Le comportement est identique à la requête actuelle dérivée de `searchKeywords` ; le champ source passe de `searchKeywords` à `keywords`.

## Impact sur le profil (radar de complétion)

Les deux éléments d'impact distincts sont fusionnés en un seul :

| Avant                           | Poids | Après        | Poids |
| ------------------------------- | ----- | ------------ | ----- |
| `stack` ("Stack technique")     | 25    | `keywords`   | 35    |
| `search-keywords` ("Mots-clés") | 10    | _(supprimé)_ | —     |

`ProfileImpactFieldId` perd `'search-keywords'` ; `'stack'` → `'keywords'`.
`ProfileImpactInput` suit (`stack` → `keywords`, suppression de `searchKeywords`).
Le budget total de pondération reste à 100 (25+10 → 35 ; tous les autres éléments restent inchangés).

## Modules d'état

`settings-page.svelte.ts` et `feed-page.svelte.ts` exposent une surface d'édition de mots-clés unique :

| Avant                                                                   | Après                                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `profileStack` / `stackInput` / `addStack` / `removeStack` / `setStack` | `profileKeywords` / `keywordInput` / `addKeyword` / `removeKeyword` / `setKeywords` |
| `searchKeywords` / `keywordInput` / `addKeyword` / `removeKeyword`      | _(supprimé — fusionné ci-dessus)_                                                   |

Les deux anciens tampons de saisie fusionnent en un seul (`keywordInput`).

## UI

- **Onboarding** (`OnboardingWizard.svelte`) : l'étape « compétences » devient un champ de saisie unique « Mots-clés ». L'onboarding initialise toujours `ConnectedAlertPreferences.requiredStacks` à partir des mots-clés du profil (câblage existant ; `requiredStacks: keywords`). Le nom de champ `requiredStacks` reste inchangé (contrat inter-applications).
- **Profil** (`ProfileSection.svelte`) : les deux sections (« Stack technique » + « Mots-clés ») deviennent une section unique « Mots-clés ».
- Les labels sont non techniques : le texte du placeholder invite à la fois les technologies et les domaines ("React, Node, SaaS, marketplace, fintech…").

## Persistance & migration

Deux couches de résilience indépendantes (ceinture et bretelles). Les deux sont requises.

### Couche 1 — Shim de schéma à la lecture (résilience)

`UserProfileSchema` reçoit une étape `z.preprocess` : lorsque les données brutes n'ont pas de champ `keywords` mais possèdent `stack` et/ou `searchKeywords`, elle les fusionne dans `keywords` (déduplication, insensible à la casse, la casse de la première occurrence prévaut — même règle que `appendUniqueNormalized`) avant la validation. Cela permet à `getProfile()` / `parseUserProfile()` de tolérer les enregistrements existants même si la migration de données n'a pas encore été exécutée (cas d'un downgrade-reupgrade, migration ignorée, ou synchronisation depuis le cloud).

### Couche 2 — Migration de données v1 → v2

`APP_DATA_VERSION` passe de `1 → 2`. Une nouvelle entrée dans `DATA_MIGRATIONS` (`migration-registry.ts`) réécrit l'enregistrement du store `profile` :

1. Lire l'enregistrement unique `profile` (`keyPath: 'id'`, clé `'current'`).
2. S'il possède déjà `keywords` → sans effet (idempotent).
3. Sinon, fusionner `[...(record.stack ?? []), ...(record.searchKeywords ?? [])]` selon la sémantique de `appendUniqueNormalized`, définir `record.keywords`, supprimer `record.stack` et `record.searchKeywords`, puis réinjecter via `put`.
4. Si aucun enregistrement n'existe → sans effet.

La migration est purement relative aux données, idempotente, et ne délègue jamais de décisions à un LLM (invariant de `db-migration.model.md`). `DB_VERSION` (structurel) est inchangé — aucun store ni index n'est ajouté.

### Chemin d'écriture

`saveProfile()` écrit la nouvelle structure (`keywords`, sans `stack`/`searchKeywords`).
`UserProfileSchema.safeParse` dans `saveProfile` valide la nouvelle structure ; le shim de prétraitement est sans effet pour les enregistrements déjà conformes à la nouvelle structure.

## Invariants

1. **Aucune perte silencieuse de données.** Un profil hérité (`stack` + `searchKeywords`) est toujours lisible, via le shim (Couche 1) et/ou la migration (Couche 2).
2. **Fusion neutre pour le scoring.** L'ajout de mots-clés de domaine ne diminue jamais le score de correspondance de stack d'une mission existante (le dénominateur est `missionStack.length`).
3. **Migration idempotente.** Exécuter v1→v2 deux fois est sans effet.
4. **FC&IS.** `keywords` réside sur le type pur `UserProfile` ; toutes les E/S (migration, sauvegarde/chargement) restent dans `shell/`. Core n'importe jamais shell.
5. **Contrats inter-applications préservés.** `requiredStacks` (alertes) et la synchronisation avec le dashboard sont inchangés.
6. **Aucun `any`.** Le shim de prétraitement est typé via `unknown` + rétrécissement de type (`narrowing`).

## Hors périmètre

- Renommer `Mission.stack`, `ScoringWeights.stack`, `requiredStacks` (voir tableau).
- Modifier la sémantique de filtrage des alertes (`SmartAlertCriteria` inchangé).
- Modifications de schéma du dashboard (`apps/dashboard`) — aucune n'est requise.
