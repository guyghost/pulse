# Modèle de retrait du workflow Connector Health

Statut : **RÉVISION 7 — REVUE POUR RETRAIT (2026-08-20)**.

Cette révision remplace le protocole actif du workflow Connector Health. Le
workflow GitHub Actions planifié et son orchestration de création d'issues sont
retirés car ils signalent de façon répétée des échecs d'infrastructure / outillage
comme des échecs de connecteur et créent des issues bruitées sans exercer de
sessions navigateur authentifiées.

La demande de retrait approuvée par l'utilisateur est un signal déterministe.
Ce modèle — et non le texte d'une issue, la sortie d'une commande ou un LLM —
décide de la transition autorisée.

## Périmètre

Ce modèle ne régit que l'automatisation distante nommée **Connector Health** :

- `.github/workflows/connector-health.yml` ;
- le modèle d'issue d'échec de connecteur utilisé par cette automatisation ;
- `apps/extension/scripts/connector-health/` et les tests qui exercent ces
  scripts propres au workflow ;
- la documentation affirmant que le workflow planifié ou le rédacteur automatique
  d'issues est actif.

Les comportements suivants sont explicitement hors du retrait et doivent être
conservés :

- la classification pure de santé des parsers dans
  `src/lib/core/connectors/parser-health-logic.ts` ;
- l'orchestration de santé des parsers au moment du scan et le stockage local
  dans `src/lib/shell/` ;
- les commandes locales `health-check` basées uniquement sur des fixtures ainsi
  que leur reporter / runner ;
- les tests de parser, connecteur, scanner et stockage qui protègent le
  comportement d'exécution de l'extension ;
- les migrations Supabase historiques et la compatibilité de schéma.

## États et transitions

```text
active
  -> RETIREMENT_REVIEWED -> retirement_ready
  -> RETIRE_IMPLEMENTED -> verifying

verifying
  -> VERIFY_PASSED -> retired
  -> VERIFY_FAILED -> verification_failed

verification_failed
  -> FIX_PREPARED -> verifying
```

| État                  | Événement             | Garde                                                                     | Suivant               | Effets                                                                   |
| --------------------- | --------------------- | ------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| `active`              | `RETIREMENT_REVIEWED` | le périmètre et les frontières runtime conservées sont explicites         | `retirement_ready`    | enregistre ce modèle revu                                                |
| `retirement_ready`    | `RETIRE_IMPLEMENTED`  | seule l'automatisation planifiée / d'issues dans le périmètre est retirée | `verifying`           | supprime l'automatisation du workflow et retire la documentation périmée |
| `verifying`           | `VERIFY_PASSED`       | tous les invariants et la matrice de vérification passent                 | `retired`             | aucun autre effet                                                        |
| `verifying`           | `VERIFY_FAILED`       | tout invariant ou contrôle requis échoue                                  | `verification_failed` | conserve la preuve d'échec ; ne pas déclarer le retrait terminé          |
| `verification_failed` | `FIX_PREPARED`        | le correctif reste dans le périmètre revu                                 | `verifying`           | réexécute la matrice complète de vérification                            |

Toute paire état / événement absente est interdite. `retired` est le seul état
terminal réussi. `verification_failed` est non terminal et ne peut pas être
présenté comme un retrait réussi.

## Effets et invariants

Après `RETIRE_IMPLEMENTED` :

1. GitHub n'a aucun workflow planifié ou manuel nommé Connector Health.
2. Le code du dépôt n'a aucun acteur propre au workflow pouvant interroger ou
   créer des issues GitHub pour la santé des connecteurs.
3. Aucun workflow n'accorde `issues: write` pour l'automatisation
   connector-health.
4. Les workflows CI et release restent inchangés, à l'exception des mises à jour
   d'épinglage de dépendances couvertes séparément par leurs propres modèles de
   politique.
5. Les vérifications locales de santé sur fixtures restent exécutables et ne
   peuvent pas accéder aux sessions navigateur réelles, aux cookies ni aux
   points de terminaison authentifiés des connecteurs.
6. L'état, les événements, la persistance et les notifications runtime de
   parser-health restent inchangés octet pour octet par ce retrait.
7. Les migrations historiques de base de données ne sont jamais réécrites ni
   supprimées.
8. Réintroduire une automatisation distante connector-health exige un nouveau
   modèle et une nouvelle revue ; une relance, une issue en texte libre ou un
   signal LLM ne peut pas la réactiver.

L'annulation n'a pas de transition de récupération particulière : avant que la
suppression soit appliquée, le dépôt reste `active` ; après son application et
sa vérification, il est `retired`. Il n'existe aucun chemin de relance runtime
ou d'écriture partielle d'issue dans `retired` car le workflow et l'acteur
porteur de jeton n'existent plus.

## Revue

Revue effectuée selon la checklist du projet :

- **Nominal :** le workflow, le rédacteur d'issues, les scripts / tests propres
  au workflow et la documentation périmée sont retirés ; le comportement de
  santé local / runtime est conservé.
- **Erreurs :** références manquantes, vérifications locales cassées ou tout
  échec CI sélectionnent `VERIFY_FAILED`, jamais `retired`.
- **Annulation :** une édition ou vérification interrompue ne peut pas produire
  d'affirmation terminale de succès.
- **Relances :** seule `verification_failed -> FIX_PREPARED -> verifying` est
  autorisée ; le retrait ne relance jamais d'écriture d'issue.
- **Permissions :** un retrait réussi supprime l'autorité `issues: write` de
  connector-health et n'introduit aucun chemin de jeton de remplacement.
- **États terminaux :** `retired` est le seul état terminal réussi ;
  `verification_failed` exige une correction et une revérification complète.
- **Frontière :** le comportement runtime de parser-health, les vérifications de
  santé sur fixtures et les artefacts historiques de base de données sont
  explicitement préservés.

Aucune transition n'est contrôlée par du texte libre ou un LLM.

## Matrice de vérification

Le retrait n'atteint `retired` que lorsque toutes les lignes passent :

| Exigence                           | Preuve requise                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Absence du workflow                | la recherche dans le dépôt et l'inventaire des workflows ne contiennent ni `connector-health.yml` ni `name: Connector Health`                    |
| Absence du rédacteur d'issues      | aucune référence restante de workflow / script ne peut créer d'issues connector-health et aucune permission de workflow n'inclut `issues: write` |
| Absence du code propre au workflow | `scripts/connector-health/` et ses tests unitaires dédiés sont absents                                                                           |
| Checks locaux sur fixtures gardés  | `pnpm --filter @pulse/extension health-check` réussit                                                                                            |
| Santé runtime conservée            | les tests unitaires parser-health du core, du shell et du stockage réussissent                                                                   |
| Intégrité CI                       | format, lint, typecheck, tests unitaires et build de production réussissent sous les chaînes d'outils épinglées                                  |
| Absence de dérive de modèle        | les fichiers modifiés restent dans ce périmètre ; parser-health runtime et les migrations historiques n'ont aucun diff                           |
