# Spécification : Dashboard connecté, synchronisation de l'extension et extracteurs de profil

## Objectif

Aligner MissionPulse avec la promesse produit affichée sur la landing page en faisant de `apps/dashboard` la surface produit connectée principale, tout en conservant `apps/extension` comme exécuteur local pour l'accès aux sessions de navigation et le scraping des plateformes.

Le succès signifie qu'un freelance connecté peut :

- Examiner toutes les missions détectées dans le dashboard, avec scores, santé des sources, déduplication, contexte TJM et état des connecteurs.
- Faire avancer une mission à travers le pipeline canonique : `detected` -> `selected` -> `application_prepared` -> `applied` -> `interview` -> `offer` -> `accepted` / `rejected` / `archived`.
- Maintenir un CV/profil canonique dans Supabase, initialement importé depuis LinkedIn par l'extension.
- Lancer des scans et l'extraction de profil depuis l'extension sans stocker d'identifiants de plateforme.
- Voir l'état du dashboard synchronisé via Supabase, et non via un backend de scraping.

## Hypothèses et décisions

- Supabase est le hub de synchronisation et la source de vérité pour les données du dashboard connecté.
- L'extension conserve IndexedDB/chrome.storage en local pour une exécution offline-first et une UX locale au mieux (best-effort).
- Le dashboard ne scrappe jamais LinkedIn ni les plateformes de missions.
- La communication directe entre le dashboard et l'extension n'est pas requise pour la v1 ; les deux surfaces convergent via Supabase.
- La v1 de LinkedIn importe uniquement les données de profil/CV : expériences, compétences, résumé, formation et liens.
- La mention existante « 100% local » sur la landing est désormais inexacte pour le parcours du dashboard connecté et doit être adaptée en « exécution locale, synchronisation cloud optionnelle ».

## Stack technique

- Monorepo : Turborepo + pnpm.
- Dashboard : SvelteKit, runes Svelte 5, TypeScript strict, TailwindCSS 4 via `@pulse/ui/app.css`, Supabase SSR.
- Extension : Chrome MV3, Svelte 5, Vite + `@crxjs/vite-plugin`, TypeScript strict, IndexedDB, chrome.storage, Supabase JS.
- Architecture core : Functional Core & Imperative Shell.
- Tests : Vitest pour les tests unitaires purs/core et shell, Playwright pour les flux dashboard/extension.

## Commandes

- Build complet : `pnpm build`
- Tests complets : `pnpm test`
- Typecheck complet : `pnpm typecheck`
- Dev dashboard : `pnpm --filter @pulse/dashboard dev`
- Check dashboard : `pnpm --filter @pulse/dashboard check`
- Test dashboard : `pnpm --filter @pulse/dashboard test`
- Dev extension : `pnpm --filter @pulse/extension dev`
- Test extension : `pnpm --filter @pulse/extension test`
- E2E extension : `pnpm --filter @pulse/extension test:e2e`
- Dev landing : `pnpm --filter @pulse/landing dev`

## Structure du projet

```text
apps/dashboard/
  src/lib/core/              Types et transformations du domaine pur du dashboard
  src/lib/server/            Shell SSR Supabase
  src/routes/                Écrans du dashboard connecté
  tests/unit/                Tests unitaires purs du dashboard

apps/extension/
  src/lib/core/              Parsers purs, scoring, tracking, normalisation du CV
  src/lib/shell/             Chrome, IndexedDB, Supabase, fetch, orchestration
  src/lib/state/             Modules d'état avec runes Svelte 5
  src/background/            Service worker et gestionnaires du bridge
  tests/unit/                Tests unitaires core/shell
  tests/e2e/                 Flux utilisateurs de l'extension

apps/landing/
  src/routes/+page.svelte    Surface de promesse publique
  supabase/                  Schéma actuel et migrations

docs/specs/
  dashboard-microfrontend.md Cette spécification de décision
```

## Style de code

Svelte 5 uniquement :

```svelte
<script lang="ts">
  let { application }: { application: MissionApplication } = $props();
  let expanded = $state(false);
  let label = $derived(application.stage === 'offer' ? 'Offre' : 'En cours');
</script>

<button onclick={() => (expanded = !expanded)}>{label}</button>
```

Le Core reste pur :

```ts
export function normalizePipelineEvent(
  currentStage: ApplicationStage,
  nextStage: ApplicationStage,
  occurredAt: Date
): PipelineEvent | null {
  if (!isAllowedApplicationTransition(currentStage, nextStage)) {
    return null;
  }

  return { fromStage: currentStage, toStage: nextStage, occurredAt: occurredAt.toISOString() };
}
```

## Stratégie de test

- Tests unitaires du core pur :
  - filtres de candidatures du dashboard, transitions d'étapes (stage transitions), résolution des conflits de synchronisation ;
  - parsers de l'extension, extracteurs de profil, scoring de mission, déduplication, adaptateurs de tracking ;
  - aucun mock pour les tests des parsers/normaliseurs purs.
- Tests unitaires du shell :
  - constructeurs de payload de synchronisation Supabase avec client Supabase mocké ;
  - schémas du bridge Chrome et réponses d'erreur typées ;
  - branches d'échec de permissions/session/DOM LinkedIn.
- Tests d'intégration :
  - résultat de scan de l'extension -> payload d'upsert Supabase ;
  - lignes Supabase du dashboard -> view models du dashboard ;
  - migration du tracking local -> événements canoniques du pipeline.
- Tests E2E :
  - scan de l'extension -> feed du dashboard ;
  - mise à jour du pipeline dans le dashboard -> pull de l'extension ;
  - mise à jour de candidature dans l'extension -> mise à jour du dashboard ;
  - happy path de l'import LinkedIn et états d'erreur typés.

## Résumé de l'audit

### Promesses de la landing

`apps/landing/src/routes/+page.svelte` promet :

- Extension Chrome, gratuite, open source.
- Scan de 5 plateformes : Free-Work, LeHibou, Hiway, Collective, Cherry Pick.
- Feed dans le side panel avec missions consolidées, scorées, dédupliquées et filtrées.
- Explication du score par stack, TJM, localisation, séniorité et scoring sémantique Gemini Nano.
- Comparaison de missions et shortlist.
- Assistant de candidature : message prêt à copier, lien source, alignement avec le CV, relance.
- Scan automatique en arrière-plan et alertes intelligentes.
- Dashboard/historique TJM par stack/source.
- Sessions de navigation existantes, aucun identifiant de plateforme stocké.
- « 100% local/privé », « aucun serveur », « aucune collecte ».
- 700+ tests, FC&IS, TypeScript strict.

### État actuel du dashboard

`apps/dashboard` dispose actuellement de :

- Package microfrontend SvelteKit `@pulse/dashboard`.
- Amorçage (bootstrap) de session SSR Supabase et redirection vers la connexion de la landing.
- Droits du compte dérivés de `profiles`.
- Feed connecté chargé depuis les tables Supabase `missions`, `mission_scores`, `mission_duplicates` et
  `connector_health_events`.
- Candidatures canoniques chargées depuis Supabase `applications` avec événements de pipeline synchronisés,
  assets de candidature générés, actions suivantes, notes, évaluations et transitions d'étapes.
- CV canonique chargé depuis Supabase `candidate_profiles` ainsi qu'expériences, formations, compétences,
  liens, historique d'import et suggestions de champs.
- État de synchronisation, santé des connecteurs, préférences d'alerte et conflits en attente chargés depuis Supabase.
- Sections d'interface pour le feed de missions, les candidatures, la comparaison/shortlist, le radar TJM, le CV, la disponibilité de synchronisation,
  la santé des connecteurs, les préférences d'alerte, l'export et la suppression des données connectées.
- Helpers purs du dashboard et tests unitaires dans `src/lib/core/dashboard.ts`.

Preuves d'implémentation du dashboard :

- `apps/dashboard/src/routes/+page.server.ts` lit et écrit dans les tables produit connectées de Supabase.
- `apps/dashboard/src/routes/+page.svelte` effectue le rendu de la surface produit connectée.
- `apps/dashboard/tests/unit/core/dashboard.test.ts` couvre les transformations des view models du dashboard.
- `apps/dashboard/tests/unit/server/*.test.ts` couvre les actions d'écriture Supabase, la résolution de conflits,
  l'état de synchronisation, l'export et la suppression des données.
- `apps/dashboard/tests/e2e/dashboard-smoke.test.ts` vérifie que les surfaces connectées s'affichent même
  sans configuration Supabase locale.

### État actuel de l'extension

`apps/extension` dispose actuellement de :

- Connecteurs pour Free-Work, LeHibou, Hiway, Collective, Cherry Pick.
- Parsers purs dans `src/lib/core/connectors/`.
- Connecteurs shell dans `src/lib/shell/connectors/`.
- Orchestration du scanner dans le service worker avec alarmes, état des connecteurs, scoring, déduplication, scoring sémantique, notifications et snapshots de santé.
- Stockage local des missions dans IndexedDB.
- Stockage local du tracking dans IndexedDB.
- Authentification via Supabase JS et persistance de session adossée à chrome.storage.
- Synchronisation Supabase pour les missions, scores de missions, relations de doublons, candidatures, événements de pipeline,
  assets générés, imports de CV canonique, état de synchronisation, préférences d'alerte, conflits et santé des
  connecteurs.
- Étapes canoniques partagées du pipeline de candidature issues de `@pulse/domain`.
- Extracteur de profil/CV LinkedIn v1 avec parser pur, connecteur shell, permission d'hôte optionnelle,
  `activeTab`, `scripting`, erreurs typées, prévisualisation et import Supabase.
- Gestionnaires de bridge pour le scan, le tracking, les assets générés, l'authentification, la compatibilité des favoris,
  la synchronisation du dashboard connecté, la prévisualisation/import LinkedIn et la santé des connecteurs.
- Pages UI pour le feed, les candidatures, le brouillon de synchronisation CV/profil, le TJM, les paramètres et la santé des connecteurs.

Preuves d'implémentation de l'extension :

- `apps/extension/src/lib/core/sync/connected-dashboard.ts` construit les payloads de synchronisation purs et
  fusionne l'état distant du dashboard.
- `apps/extension/src/lib/shell/sync/connected-dashboard.ts` orchestre les I/O Supabase.
- `apps/extension/src/lib/core/profile-extractors/linkedin-parser.ts` normalise les payloads LinkedIn
  sans I/O.
- `apps/extension/src/lib/shell/profile-extractors/linkedin.extractor.ts` gère la session Chrome
  et l'extraction DOM dans le shell.
- `apps/extension/tests/unit/sync/*.test.ts`, `apps/extension/tests/unit/profile-extractors/*.test.ts`,
  et `apps/extension/tests/e2e/linkedin-import.test.ts` couvrent la synchronisation connectée et LinkedIn v1.

### Questions ouvertes de la spec existante

Décisions remplacées :

- Protocole de synchronisation de l'extension : synchronisation de tables adossée à Supabase avec révision par entité, métadonnées d'opération et écritures provenant de l'extension. Aucun backend de scraping pour le dashboard. Aucun messaging externe direct requis pour la v1.
- Source de vérité : Supabase est la source de vérité pour les données du dashboard connecté ; les stores locaux de l'extension constituent l'état offline/cache/exécution et se réconcilient avec Supabase.

## Matrice des écarts par rapport aux promesses

| Promesse de la landing              | Implémentation actuelle                                                                                                    | Travail restant                                                                                                             | Priorité |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| 5 plateformes scannées              | L'extension a les connecteurs Free-Work, LeHibou, Hiway, Collective, Cherry Pick et les tests de parsers                   | Fait : la sortie du scan se synchronise vers `missions` dans Supabase ; la santé des connecteurs s'affiche sur le dashboard | Fait     |
| Feed de missions centralisé         | Le feed du dashboard lit les `missions`, scores, sources, doublons, filtres et fraîcheur depuis Supabase                   | Fait                                                                                                                        | Fait     |
| Scoring IA avec Gemini Nano         | Le scoring et le cache sémantique de l'extension persistent les détails des scores dans les scores de mission Supabase     | Fait : UI pour les critères de score et la justification sémantique sur le dashboard                                        | Fait     |
| Déduplication                       | La déduplication de l'extension persiste l'identité canonique de la mission et les enregistrements de sources en doublon   | Fait                                                                                                                        | Fait     |
| Alertes intelligentes               | Notifications de l'extension et synchronisation des préférences d'alerte du dashboard                                      | Fait                                                                                                                        | Fait     |
| Comparaison de missions / shortlist | La comparaison du dashboard utilise les candidatures Supabase sélectionnées/actives                                        | Fait                                                                                                                        | Fait     |
| Assistant de candidature            | Les assets générés se synchronisent vers Supabase et s'affichent dans l'historique du dashboard avec actions copier/ouvrir | Fait                                                                                                                        | Fait     |
| Suivi du pipeline                   | Pipeline canonique partagé, événements, prochaines actions, conflits, synchronisation dashboard et extension               | Fait                                                                                                                        | Fait     |
| Dashboard / historique TJM          | Le radar TJM du dashboard dérive les tendances par source et stack à partir des missions synchronisées                     | Fait                                                                                                                        | Fait     |
| Sessions de navigation existantes   | Les connecteurs de l'extension utilisent les sessions de navigation ; LinkedIn v1 extrait le profil via l'onglet actif     | Fait                                                                                                                        | Fait     |
| 100% local/privé                    | La copy publique indique désormais exécution locale plus synchronisation optionnelle avec le dashboard Supabase            | Fait                                                                                                                        | Fait     |
| Aucun identifiant de plateforme     | Identifiants/cookies/tokens de session exclus des données synchronisées et couverts par des tests/copy                     | Fait                                                                                                                        | Fait     |
| Open source / tests / FC&IS         | Frontières core/shell, tests de parsers, tests de synchronisation, E2E et typecheck strict sont en place                   | Fait                                                                                                                        | Fait     |

## Surface produit cible

### Dashboard

Le dashboard devient le cockpit connecté :

- Feed : toutes les missions synchronisées, recherche, filtres, score, source, badge de déduplication, fraîcheur, masquer/archiver.
- Candidatures : kanban/liste/tableau pour le pipeline canonique, prochaine action, notes, assets générés, lien source, chronologie d'activité.
- CV canonique : résumé du profil, expériences, compétences, formation, liens, historique d'import, confiance de la source, remplacements manuels.
- Synchronisation : statut de connexion de l'extension, date de dernière activité, décomptes d'envois/téléchargements en attente, conflits, tâches en échec.
- Santé des connecteurs : disponibilité par plateforme, dernier scan, dernier type/message d'erreur, session requise, permission requise.
- Compte : session Supabase, crédits, statut premium, contrôles de confidentialité/export/suppression.

### Extension

L'extension reste l'exécuteur local :

- Scanne les plateformes de missions via les sessions du navigateur.
- Extrait le profil/CV LinkedIn depuis le contexte du navigateur.
- Écrit les résultats local-first dans IndexedDB.
- Envoie des snapshots assainis vers Supabase une fois authentifié.
- Reçoit l'état canonique Supabase pour les candidatures/CV/paramètres en étant en ligne.
- Affiche les erreurs typées des connecteurs/extracteurs dans le side panel.

## Pipeline canonique

Étapes :

- `detected` : mission trouvée par un connecteur et visible dans le feed.
- `selected` : l'utilisateur a retenu la mission dans sa shortlist ou l'a marquée comme intéressante à poursuivre.
- `application_prepared` : le pitch / message / notes de CV sont prêts.
- `applied` : l'utilisateur a postulé sur la plateforme source ou auprès d'un recruteur.
- `interview` : processus d'entretien démarré.
- `offer` : offre reçue ou conditions commerciales en cours de négociation.
- `accepted` : mission acceptée.
- `rejected` : opportunité déclinée par le client/recruteur ou refusée par l'utilisateur.
- `archived` : n'est plus active, conservée pour l'historique.

Transitions autorisées :

```text
detected -> selected | archived
selected -> application_prepared | applied | archived
application_prepared -> applied | archived
applied -> interview | offer | rejected | archived
interview -> offer | rejected | archived
offer -> accepted | rejected | archived
accepted -> archived
rejected -> archived
archived -> detected
```

Le dashboard et l'extension peuvent exposer des raccourcis, mais l'état persisté doit être représenté sous forme d'événements de pipeline valides. Par exemple, passer directement de `selected` à `applied` crée un événement ; passer de `detected` à `applied` doit soit être rejeté par le core, soit être décomposé par le shell en `detected -> selected -> application_prepared -> applied` uniquement si l'action utilisateur demande explicitement de « marquer comme postulé ».

## Modèle de données Supabase

Toutes les tables sont protégées par RLS avec `auth.uid() = user_id`, à l'exception des tables de facturation gérées par le service déjà présentes.

### Tables Core

```sql
profiles (
  id uuid primary key references auth.users(id),
  subscription_status text not null,
  subscription_period_end timestamptz,
  credit_balance integer not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
)

mission_sources (
  id text primary key, -- free-work, lehibou, hiway, collective, cherry-pick, linkedin, other
  label text not null,
  kind text not null check (kind in ('mission', 'profile', 'both')),
  created_at timestamptz not null
)

missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null references mission_sources(id),
  external_id text not null,
  canonical_key text not null,
  title text not null,
  client text,
  description text not null,
  stack text[] not null default '{}',
  tjm integer,
  location text,
  remote text check (remote in ('full', 'hybrid', 'onsite')),
  duration text,
  start_date date,
  published_at timestamptz,
  scraped_at timestamptz not null,
  url text not null,
  raw_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, external_id)
)

mission_scores (
  mission_id uuid primary key references missions(id) on delete cascade,
  deterministic_score integer not null check (deterministic_score between 0 and 100),
  semantic_score integer check (semantic_score between 0 and 100),
  total_score integer not null check (total_score between 0 and 100),
  grade text,
  criteria jsonb not null default '{}'::jsonb,
  semantic_reason text,
  scorer_version text not null,
  scored_at timestamptz not null
)

mission_duplicates (
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_mission_id uuid not null references missions(id) on delete cascade,
  duplicate_mission_id uuid not null references missions(id) on delete cascade,
  confidence numeric not null,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (canonical_mission_id, duplicate_mission_id)
)
```

### Candidatures et pipeline

```sql
applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  stage text not null check (
    stage in (
      'detected',
      'selected',
      'application_prepared',
      'applied',
      'interview',
      'offer',
      'accepted',
      'rejected',
      'archived'
    )
  ),
  user_rating integer check (user_rating between 1 and 5),
  notes text not null default '',
  next_action_at timestamptz,
  applied_at timestamptz,
  archived_at timestamptz,
  rejected_reason text,
  accepted_terms jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_by text not null check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mission_id)
)

application_pipeline_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_by text not null check (created_by in ('dashboard', 'extension', 'system')),
  client_event_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_event_id)
)

generated_application_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  client_asset_id text,
  type text not null check (type in ('pitch', 'cover_message', 'cv_summary')),
  content text not null,
  model text not null,
  credit_transaction_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, client_asset_id)
)
```

### CV/Profil canonique

```sql
candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  summary text not null default '',
  location text,
  target_role text,
  tjm_min integer,
  tjm_max integer,
  remote_preference text,
  seniority text,
  completeness integer not null default 0 check (completeness between 0 and 100),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
)

candidate_experiences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references candidate_profiles(id) on delete cascade,
  title text not null,
  company text,
  location text,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  description text not null default '',
  skills text[] not null default '{}',
  source text not null,
  source_external_id text,
  position_index integer not null default 0
)

candidate_education (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references candidate_profiles(id) on delete cascade,
  school text not null,
  degree text,
  field text,
  start_date date,
  end_date date,
  description text not null default '',
  source text not null,
  position_index integer not null default 0
)

candidate_skills (
  profile_id uuid not null references candidate_profiles(id) on delete cascade,
  skill text not null,
  source text not null,
  confidence numeric,
  primary key (profile_id, skill)
)

candidate_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references candidate_profiles(id) on delete cascade,
  label text not null,
  url text not null,
  source text not null
)

profile_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null references mission_sources(id),
  status text not null check (status in ('success', 'partial', 'error')),
  imported_at timestamptz not null,
  extractor_version text not null,
  error_code text,
  error_message text,
  raw_hash text,
  field_counts jsonb not null default '{}'::jsonb
)
```

### Synchronisation et santé

```sql
extension_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  install_id text not null,
  browser text,
  extension_version text not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, install_id)
)

sync_status (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references extension_devices(id) on delete cascade,
  entity text not null check (entity in ('missions', 'applications', 'candidate_profile', 'connector_health', 'alert_preferences')),
  last_pull_at timestamptz,
  last_push_at timestamptz,
  pending_upload_count integer not null default 0,
  pending_download_count integer not null default 0,
  last_error_code text,
  last_error_message text,
  retry_after_at timestamptz,
  revision bigint not null default 1,
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  updated_at timestamptz not null default now(),
  primary key (device_id, entity)
)

dashboard_alert_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  score_threshold integer not null default 70 check (score_threshold between 0 and 100),
  min_daily_rate integer not null default 0 check (min_daily_rate between 0 and 5000),
  required_stacks text[] not null default '{}',
  max_results integer not null default 5 check (max_results between 1 and 20),
  revision bigint not null default 1,
  updated_by text not null default 'dashboard'
    check (updated_by in ('dashboard', 'extension', 'system')),
  updated_at timestamptz not null default now()
)

sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references extension_devices(id) on delete set null,
  entity text not null check (entity in ('applications', 'candidate_profile')),
  entity_id uuid not null,
  field text not null,
  local_value text,
  remote_value text,
  local_updated_by text not null check (local_updated_by in ('dashboard', 'extension', 'system')),
  remote_updated_by text not null check (remote_updated_by in ('dashboard', 'extension', 'system')),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  detected_at timestamptz not null,
  resolved_at timestamptz,
  revision bigint not null default 1,
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
)

connector_health_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references extension_devices(id) on delete set null,
  source text not null references mission_sources(id),
  status text not null check (status in ('ready', 'needs_permission', 'needs_session', 'blocked', 'error', 'syncing')),
  error_code text,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null
)
```

Conserver `favorite_missions` pendant la migration comme source de compatibilité. Elle devrait devenir soit une vue sur `applications(stage in selected...)`, soit être dépréciée après que le dashboard lise depuis les tables canoniques.

## Protocole de synchronisation

### Sens

- Extension -> Supabase :
  - Missions scannées et snapshots de scores.
  - Changements d'état des candidatures effectués dans le side panel.
  - Assets générés créés dans l'extension, insérés ou mis à jour (upsert) de manière idempotente avec `client_asset_id`.
  - Résultat de l'import de profil LinkedIn.
  - Événements de santé des connecteurs/extracteurs.
- Dashboard -> Supabase :
  - Changements d'état des candidatures.
  - Notes, évaluations, dates de prochaine action.
  - Modifications du CV canonique.
  - Préférences utilisateur influençant le comportement du dashboard connecté.
  - Préférences d'alerte connectées utilisées par les scans de l'extension.
- Extension <- Supabase :
  - Candidatures canoniques pour le side panel local.
  - Profil candidat / paramètres utilisés pour le scoring.
  - Résolutions de conflits et modifications apportées depuis le dashboard.

### Mécanique

- Chaque installation locale de l'extension possède un `install_id` stable généré dans le shell et enregistré dans `extension_devices`.
- Chaque table synchronisable comporte :
  - `revision bigint`.
  - `updated_at timestamptz`.
  - `updated_by`.
  - clés d'idempotence générées par le client pour les insertions d'événements.
- L'extension stocke un curseur par entité dans chrome.storage/IndexedDB :
  - dernière révision locale poussée ou id d'événement.
  - dernier `updated_at` distant récupéré (pull).
  - horodatage de la dernière synchronisation réussie.
- Le push est effectué par lots :
  - missions : upsert par `(user_id, source, external_id)`.
  - candidatures : upsert par `(user_id, mission_id)` avec vérification de révision.
  - événements de pipeline : insertion uniquement avec `client_event_id`.
  - import de profil : lot transactionnel à partir du snapshot de profil normalisé.
- Le pull utilise `updated_at > cursor` et exclut les lignes écrites en dernier par le même appareil lorsque c'est possible.
- La nouvelle tentative manuelle depuis le side panel utilise le message de bridge `RETRY_CONNECTED_SYNC` et rejoue le même chemin de réconciliation de snapshot local que la synchronisation planifiée.

### Résolution des conflits

- Les événements de pipeline sont en ajout seul (append-only). Le `applications.stage` actuel est dérivé du dernier événement valide, puis matérialisé pour des lectures rapides.
- Les notes, évaluations, dates de prochaine action et champs du CV suivent la règle du dernier écrivain qui gagne (last-writer-wins) par `updated_at` pour la v1, avec des lignes de conflit créées lorsque deux mises à jour modifient le même champ dans une fenêtre de temps rapprochée.
- Le dashboard a l'autorité finale pour les modifications manuelles du CV.
- Les imports de profil par l'extension n'écrasent jamais silencieusement les champs modifiés manuellement. Ils créent des suggestions au niveau des champs lorsqu'un champ canonique comporte déjà une modification depuis le dashboard plus récente que le curseur d'import.
- Les upserts de missions en doublon fusionnent d'abord par source/id externe, puis par clé canonique / confiance de déduplication.
- Les états de synchronisation en échec sont visibles à la fois dans le dashboard et l'extension avec l'entité, le code, le message et l'horodatage de nouvelle tentative.

## Permissions Chrome

Les permissions actuelles sont suffisantes pour le scan de missions, à l'exception de l'extraction LinkedIn.

Ajouts requis pour LinkedIn v1 :

- `host_permissions` ou `optional_host_permissions` : `https://www.linkedin.com/*`.
- `permissions` : `scripting` pour l'extraction DOM depuis un onglet de profil LinkedIn ouvert par l'utilisateur.
- `permissions` : `activeTab` pour un import déclenché par l'utilisateur sans accès permanent étendu aux scripts sur LinkedIn.
- Conserver `cookies` uniquement pour les vérifications de session/disponibilité ; ne jamais lire ni persister de valeurs d'identifiants.

UX d'extraction LinkedIn recommandée :

- L'utilisateur ouvre son profil LinkedIn dans Chrome.
- L'utilisateur clique sur « Importer depuis LinkedIn » dans l'extension.
- L'extension valide l'origine et le chemin de l'onglet actif.
- Le service worker injecte un script léger via `chrome.scripting.executeScript`.
- Le script renvoie des données assainies issues du DOM, et non le HTML brut complet de la page.
- Le shell transmet les données brutes assainies à un parser/normaliseur pur dans le core.

## Frontières de sécurité et de confidentialité

- Ne jamais stocker d'identifiants LinkedIn ou de plateformes de missions.
- Ne pas concevoir de scraping côté dashboard, d'automatisation de navigateur ou de requêtes serveur pour les sessions de plateformes.
- Ne stocker que les snapshots normalisés de missions/profils nécessaires au fonctionnement du produit.
- Ne pas synchroniser le HTML brut de LinkedIn vers Supabase. Stocker un hash et le décompte des champs dans `profile_imports`.
- Supabase RLS est obligatoire sur toutes les tables appartenant à l'utilisateur.
- Le client Supabase de l'extension utilise uniquement la clé anonyme (anon key) et le JWT utilisateur.
- Le rôle service reste limité aux flux de facturation/webhooks/admin dans le code serveur de la landing.
- Gemini Nano reste optionnel, local, mis en cache et non-bloquant. Les scores sémantiques ne peuvent être synchronisés que sous forme de snapshots de résultats.
- Fournir des contrôles d'export et de suppression pour les données connectées.

## LinkedIn v1

### Parser Core

Ajouter des modules core purs :

```text
apps/extension/src/lib/core/profile-extractors/
  types.ts
  linkedin-parser.ts
  normalize-candidate-profile.ts
```

L'entrée du core est un payload d'extracteur assaini, et non des APIs de navigateur :

```ts
export interface RawPlatformProfile {
  source: 'linkedin';
  profileUrl: string;
  capturedAt: Date;
  sections: {
    headline?: string;
    summary?: string;
    experiences: RawExperience[];
    skills: string[];
    education: RawEducation[];
    links: RawProfileLink[];
  };
}

export interface CanonicalCandidateProfileDraft {
  title: string;
  summary: string;
  experiences: CandidateExperienceDraft[];
  skills: CandidateSkillDraft[];
  education: CandidateEducationDraft[];
  links: CandidateLinkDraft[];
  source: 'linkedin';
  confidence: number;
}
```

Règles :

- Pas de `fetch`, pas de `chrome.*`, pas d'async, pas de temps ambiant.
- `capturedAt` est injecté par le shell.
- Le parser tolère les sections manquantes.
- Le parser renvoie des erreurs typées pour les payloads mal formés.
- Les tests unitaires utilisent des fixtures assainies.

### Extracteur Shell

Ajouter des modules shell :

```text
apps/extension/src/lib/shell/profile-extractors/
  platform-profile-extractor.ts
  linkedin.extractor.ts
  index.ts
  profile-extractor-errors.ts
```

Interface :

```ts
export interface PlatformProfileExtractor {
  readonly id: 'linkedin';
  readonly name: string;
  detectSession(now: number): Promise<Result<boolean, AppError>>;
  extractProfile(
    now: number,
    tabId?: number
  ): Promise<Result<CanonicalCandidateProfileDraft, AppError>>;
}
```

Erreurs typées LinkedIn :

- `permission_required` : permission d'hôte LinkedIn ou permission scripting manquante.
- `session_required` : la page active redirige vers la connexion ou les marqueurs de session sont absents.
- `profile_not_found` : l'onglet actif n'est pas une page de profil LinkedIn.
- `dom_changed` : conteneurs de profil requis absents ou confiance de parsing inférieure au seuil.
- `rate_limited_or_blocked` : LinkedIn renvoie un challenge, un point de contrôle (checkpoint) ou un DOM anormalement vide.
- `sync_failed` : le profil normalisé n'a pas pu être persisté dans Supabase.

### Mapping Dashboard

- `CanonicalCandidateProfileDraft.title` -> `candidate_profiles.title`.
- `summary` -> `candidate_profiles.summary`.
- Expériences -> `candidate_experiences`.
- Compétences -> `candidate_skills`.
- Formation -> `candidate_education`.
- Liens -> `candidate_links`.
- Métadonnées d'import -> `profile_imports`.
- Les modifications existantes sur le dashboard génèrent des suggestions au niveau des champs au lieu d'un écrasement aveugle.

## Extracteurs de profil de plateforme extensibles

LinkedIn est la première implémentation. Les futurs extracteurs suivront le même modèle :

1. Ajouter un parser/normaliseur pur dans `core/profile-extractors/{platform}-parser.ts`.
2. Ajouter un extracteur shell dans `shell/profile-extractors/{platform}.extractor.ts`.
3. Enregistrer les métadonnées dans `shell/profile-extractors/index.ts`.
4. Ajouter les permissions d'hôte/optionnelles si nécessaire.
5. Ajouter des tests unitaires avec des fixtures assainies.
6. Ajouter des tests shell pour les erreurs typées et le comportement des permissions/sessions.
7. Ajouter le mapping dashboard uniquement via les tables canoniques de CV, jamais dans des tables de dashboard spécifiques à la plateforme.

Comportement shell partagé :

- vérification des permissions ;
- vérification de la session ;
- déclenchement de l'extraction ;
- upload normalisé vers Supabase ;
- mise à jour du statut de synchronisation ;
- événement de santé du connecteur/extracteur.

## Plan d'implémentation

### Phase 1 : Audit, matrice des écarts, schéma Supabase

Tâches :

- Remplacer les décisions de cette spec dans la description de PR et les docs produit.
- Ajouter les migrations Supabase pour les missions canoniques, les candidatures, les événements de pipeline, le profil CV, le statut de synchronisation et la santé des connecteurs.
- Conserver `favorite_missions` pour la compatibilité.
- Ajouter les politiques RLS et les index.
- Ajouter les types TypeScript générés si le projet adopte la génération de types Supabase.

Critères d'acceptation :

- Le schéma prend en charge chaque promesse de la landing et chaque état du pipeline canonique.
- Le comportement existant d'auth / facturation / profil reste compatible.
- Aucun backend de scraping pour le dashboard n'est introduit.

Vérification :

- `pnpm --filter @pulse/landing test`
- Revue manuelle du SQL des RLS pour chaque table appartenant à l'utilisateur.

### Phase 2 : Modèle partagé de candidature / pipeline

Tâches :

- Ajouter les types de pipeline purs et les transitions partagés.
- Remplacer `ApplicationStage` du dashboard et `ApplicationStatus` de l'extension par les noms d'étapes canoniques.
- Corriger l'incompatibilité de schéma du bridge pour les messages de tracking.
- Ajouter des tests purs pour chaque transition valide et invalide.
- Ajouter des adaptateurs/migrations à partir des valeurs actuelles de tracking local :
  - `new` -> `detected`
  - `interested` -> `selected`
  - `applying` -> `application_prepared`
  - `applied` -> `applied`
  - `accepted` -> `accepted`
  - `rejected` -> `rejected`
  - `archived` -> `archived`

Critères d'acceptation :

- Le dashboard et l'extension utilisent la même union d'étapes.
- Les transitions invalides sont rejetées dans le core.
- Les enregistrements existants de tracking local peuvent être lus et migrés.

Vérification :

- `pnpm --filter @pulse/extension test -- tests/unit/tracking`
- `pnpm --filter @pulse/dashboard test`
- `pnpm --filter @pulse/extension typecheck`

### Phase 3 : Synchronisation robuste Supabase Extension <-> Dashboard

Tâches :

- Enregistrer les appareils de l'extension.
- Implémenter la synchronisation par upsert des missions à partir des résultats de scan de l'extension.
- Implémenter la synchronisation bidirectionnelle des candidatures et événements de pipeline.
- Implémenter les curseurs de synchronisation et la remontée d'erreurs rejouables.
- Persister les snapshots / événements de santé des connecteurs dans Supabase.
- Ajouter des messages de bridge dans le side panel pour le statut de synchronisation et la nouvelle tentative manuelle.

Critères d'acceptation :

- Le scan d'une extension connectée remplit le feed de missions du dashboard.
- Les changements d'étape du dashboard apparaissent dans l'extension après un pull.
- Les changements d'étape de l'extension apparaissent dans le dashboard après un push.
- Les modifications hors-ligne sont mises en file d'attente et rejouées sans perte de données.

Vérification :

- Tests unitaires pour les constructeurs de payload de synchronisation et la gestion des conflits.
- Tests d'intégration avec client Supabase mocké.
- Test manuel préliminaire (smoke test) avec le dashboard local et le mode dev de l'extension.

### Phase 4 : Dashboard complet conforme à la landing

Tâches :

- Remplacer les données mockées du dashboard par des lectures Supabase.
- Construire le feed du dashboard avec score de mission, source, déduplication, filtres et fraîcheur.
- Construire le pipeline des candidatures et le panneau de détail.
- Construire la vue/éditeur du profil CV canonique avec historique d'import.
- Construire l'écran de synchronisation et de santé des connecteurs.
- Ajouter l'historique des assets générés et l'UI de l'assistant de candidature.
- Ajuster la copy de la landing pour refléter le modèle de confidentialité du dashboard connecté + exécution locale.

Critères d'acceptation :

- Chaque promesse P0/P1 de la landing dispose d'une surface sur le dashboard.
- Les utilisateurs non authentifiés sont redirigés proprement.
- Le dashboard n'accède jamais aux sessions des plateformes.

Vérification :

- `pnpm --filter @pulse/dashboard check`
- `pnpm --filter @pulse/dashboard build`
- Smoke tests Playwright du dashboard pour le feed, le pipeline, le CV et la synchronisation.

### Phase 5 : Extracteur de profil/CV LinkedIn

Tâches :

- Ajouter la permission d'hôte optionnelle LinkedIn et les permissions `scripting`/`activeTab`.
- Implémenter le parser/normaliseur pur de profil LinkedIn avec fixtures.
- Implémenter l'extracteur shell utilisant l'extraction DOM de l'onglet actif.
- Implémenter l'upload Supabase vers les tables de CV canonique.
- Ajouter le flux UI dans l'extension : permission -> vérification de session/profil -> prévisualisation de l'import -> synchronisation.
- Ajouter l'historique d'import et les suggestions de champs sur le dashboard.

Critères d'acceptation :

- L'utilisateur peut importer les données de son profil LinkedIn sans saisir ses identifiants LinkedIn.
- Le parser gère les sections manquantes et les états d'échec typés.
- Les modifications existantes du CV sur le dashboard ne sont pas écrasées silencieusement.

Vérification :

- Tests unitaires du parser avec fixtures LinkedIn assainies.
- Tests shell pour les branches d'échec de permissions/session/DOM.
- Test manuel dans le navigateur sur une page de profil LinkedIn.

### Phase 6 : E2E et durcissement

Tâches :

- Ajouter le test E2E : scan -> synchronisation Supabase -> feed du dashboard.
- Ajouter le test E2E : mise à jour d'étape sur le dashboard -> pull de l'extension.
- Ajouter le test E2E : mise à jour d'étape sur l'extension -> mise à jour du dashboard.
- Ajouter le test E2E/manuel : happy path de l'import LinkedIn et erreurs typées.
- Ajouter la couverture confidentialité/export/suppression.
- Ajouter l'observabilité pour le statut de synchronisation et la santé des connecteurs.

Critères d'acceptation :

- Les flux connectés critiques sont testés de bout en bout.
- Les échecs de synchronisation sont visibles et récupérables.
- Les frontières de confidentialité sont documentées et respectées.

Vérification :

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter @pulse/extension test:e2e`

## Risques et atténuations

| Risque                                             | Impact                            | Atténuation                                                                                                           |
| -------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Le DOM de LinkedIn change fréquemment              | L'import casse                    | Garder un parser basé sur des fixtures, scoring de confiance, erreurs typées `dom_changed`                            |
| Le schéma Supabase grossit trop vite               | Instabilité des migrations        | Livrer la Phase 1 sous forme de schéma additif et maintenir la compatibilité avec `favorite_missions`                 |
| Modifications conflictuelles dashboard / extension | Perte de notes/étapes utilisateur | Événements de pipeline en ajout seul (append-only), vérifications de révision, suggestions de CV au niveau des champs |
| Décalage avec la promesse de confidentialité       | Problème de confiance utilisateur | Mettre à jour la copy de la landing avant le lancement du dashboard connecté                                          |
| Hibernation du service worker MV3                  | Synchronisation manquée           | Nouvelle tentative basée sur curseur et action explicite de synchronisation manuelle                                  |
| Incompatibilité d'étapes dans le bridge            | Messages invalides à l'exécution  | Union canonique des étapes en Phase 2 et tests de schémas                                                             |

## Frontières

- Toujours : garder le core pur, injecter le temps, écrire des tests de parsers avec fixtures, exposer des erreurs typées dans l'UI.
- Toujours : utiliser Supabase uniquement pour la synchronisation connectée et les données produit appartenant à l'utilisateur.
- Demander au préalable : ajout de nouveaux services externes, stockage de HTML brut de profil, permission d'hôte LinkedIn globale plutôt qu'un flux optionnel/activeTab.
- Jamais : stocker des identifiants de plateforme, scraper depuis le dashboard/serveur, contourner les RLS, utiliser les stores/événements legacy de Svelte, ajouter une configuration Tailwind JS, mettre des I/O dans le core.

## Questions ouvertes

Aucune bloquante pour l'implémentation. La copy produit doit être mise à jour car la promesse antérieure « aucun serveur / 100% local » entre en conflit avec la décision adoptée du hub Supabase.
