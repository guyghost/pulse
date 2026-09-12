# MissionPulse — Checklist de déploiement production

Procédure mise à jour : 2026-07-21. Un seal de candidat propre et frais reste requis avant toute revendication de production.

## Vue d'ensemble de l'architecture

| App                | Stack                       | Cible de déploiement                      | Domaine                      |
| ------------------ | --------------------------- | ----------------------------------------- | ---------------------------- |
| `@pulse/landing`   | SvelteKit + Eve             | Vercel (web + service frère Eve privé)    | `missionpulse.app`           |
| `@pulse/dashboard` | SvelteKit + adapter-vercel  | Vercel (microfrontend, `/dashboard`)      | `missionpulse.app/dashboard` |
| `@pulse/extension` | Svelte 5 + Vite + CRXJS MV3 | Chrome Web Store (ZIP via GitHub Release) | N/A                          |
| `@pulse/ui`        | Package Svelte              | Build comme dépendance                    | N/A                          |

Landing et dashboard sont reliés via `apps/landing/microfrontends.json` (microfrontends Vercel).

---

## Vérifications pré-déploiement (local / CI)

```bash
pnpm install --frozen-lockfile
pnpm deploy:preflight
```

`deploy:preflight` exécute format, lint, typecheck, test, build, vérification du manifest, checks de documentation env et scan des artefacts de dev.

La CI (`.github/workflows/ci.yml`) exécute lint, format, typecheck, test, build, vérification du manifest et gates navigateur. Son `dist/` uploadé est explicitement une preuve d'inspection non scellée, pas un package Store.

Le packaging de l'extension (`.github/workflows/release.yml`) est manuel et consomme un seal déjà archivé plus le `dist/` exact testé. Il package et re-vérifie indépendamment ces octets, puis s'arrête à `package_validated`. Il ne change ni les versions ni ne soumet au Chrome Web Store.

Les vérifications de santé des connecteurs restent disponibles localement via les fixtures et
`pnpm --filter @pulse/extension health-check`. Aucun workflow planifié ni créateur automatique
d'issues n'est actif.

---

## Variables d'environnement

### Landing (`apps/landing/.env.example`)

| Variable                                   | Périmètre | Requise              | Rôle                                        |
| ------------------------------------------ | --------- | -------------------- | ------------------------------------------- |
| `PUBLIC_SUPABASE_URL`                      | public    | oui                  | URL du projet Supabase                      |
| `PUBLIC_SUPABASE_ANON_KEY`                 | public    | oui                  | Clé anon Supabase (sûre côté client)        |
| `PUBLIC_CHROME_STORE_URL`                  | public    | recommandé           | Lien du CTA d'installation                  |
| `PUBLIC_LANDING_URL`                       | public    | recommandé           | URL canonique du site (redirections, OG)    |
| `SUPABASE_SERVICE_ROLE_KEY`                | privée    | oui (serveur)        | Client admin (webhooks, crédits)            |
| `GLM_API_KEY`                              | privée    | pour `/api/generate` | API Zhipu GLM                               |
| `GLM_MODEL`                                | privée    | optionnel            | Défaut `glm-4-flash`                        |
| `LEMON_SQUEEZY_API_KEY`                    | privée    | pour le checkout     | API Lemon Squeezy                           |
| `LEMON_SQUEEZY_STORE_ID`                   | privée    | pour le checkout     | Store ID                                    |
| `LEMON_SQUEEZY_WEBHOOK_SECRET`             | privée    | pour les webhooks    | Vérification HMAC                           |
| `LEMON_SQUEEZY_CREDITS_STARTER_VARIANT_ID` | privée    | pour le checkout     | Variant du pack de crédits                  |
| `LEMON_SQUEEZY_CREDITS_PRO_VARIANT_ID`     | privée    | pour le checkout     | Variant du pack de crédits                  |
| `LEMON_SQUEEZY_CREDITS_POWER_VARIANT_ID`   | privée    | pour le checkout     | Variant du pack de crédits                  |
| `MISSIONPULSE_PERF_CACHE_HTML`             | privée    | optionnel            | Mettre `1` pour cacher le HTML 5 min        |
| `COPILOT_SESSION_SIGNING_SECRET`           | privée    | pilote Copilot       | Signe les sessions éphémères extension      |
| `COPILOT_ROLLOUT_ENABLED`                  | privée    | pilote Copilot       | Exactement `true` ; sinon fail closed       |
| `COPILOT_ROLLOUT_USER_IDS`                 | privée    | pilote Copilot       | Allowlist explicite d'utilisateurs internes |
| `COPILOT_EXTENSION_REDIRECT_URIS`          | privée    | pilote Copilot       | Callbacks Chrome Identity exacts            |
| `CRON_SECRET`                              | privée    | pilote Copilot       | Authentifie la maintenance des reçus        |
| `MISSIONPULSE_EVE_ENABLED`                 | privée    | pilote Copilot       | Exactement `true` ; sinon fail closed       |
| `MISSIONPULSE_EVE_BASE_URL`                | privée    | pilote Copilot       | Origine du protocole Eve du même projet     |
| `MISSIONPULSE_EVE_TIMEOUT_MS`              | privée    | optionnel            | Échéance bornée des requêtes Eve            |

### Dashboard (`apps/dashboard/.env.example`)

| Variable                     | Périmètre  | Requise    | Rôle                                |
| ---------------------------- | ---------- | ---------- | ----------------------------------- |
| `PUBLIC_SUPABASE_URL`        | public     | oui        | Même projet Supabase que la landing |
| `PUBLIC_SUPABASE_ANON_KEY`   | public     | oui        | Clé anon                            |
| `PUBLIC_LANDING_URL`         | public     | oui        | Redirections auth, liens de login   |
| `PUBLIC_CHROME_STORE_URL`    | public     | recommandé | Lien d'installation de l'extension  |
| `PUBLIC_DASHBOARD_BASE_PATH` | build-time | optionnel  | Défaut `/dashboard`                 |

### Extension

Les défauts de production sont compilés au build : le lien de compte utilise
`https://missionpulse.app`, tandis que les appels Copilot bearer utilisent le domaine
sans cookie `https://copilot.missionpulse.app`. Ce dernier est la seule `host_permission`
Copilot de MissionPulse. Tout changement d'origine exige les variables de build
`VITE_COPILOT_*_ORIGIN` correspondantes, une mise à jour du manifest, une vérification et
une re-soumission au CWS.

### Cache distant Turbo

`turbo.json` `build.env` suit : `PUBLIC_CHROME_STORE_URL`, `PUBLIC_LANDING_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_SUPABASE_URL`.

---

## Déploiement Vercel

### Landing (projet racine)

1. Connecter le repo ; définir le répertoire racine à `apps/landing` (ou utiliser le monorepo avec Turborepo sur Vercel).
2. Commande de build : `pnpm build` (depuis la racine avec filter) ou `vite build` dans l'app.
3. Installation : `pnpm install --frozen-lockfile` depuis la racine du monorepo.
4. Définir toutes les variables d'env de la landing dans les réglages du projet Vercel (Production + Preview).
5. Activer les microfrontends Vercel ; `microfrontends.json` route `/dashboard` vers l'app dashboard.
6. Attacher les deux domaines personnalisés : `missionpulse.app` et le sans-cookie
   `copilot.missionpulse.app` à ce même projet.
7. Garder `configureVercelJson: false` : les services frères SvelteKit/Eve révisés et la
   réécriture `/eve/v1/**` sont commités explicitement dans `apps/landing/vercel.json`.
8. Garder le flag de rollout et l'allowlist d'utilisateurs fermés tant que la
   rétention/suppression Eve et la réconciliation des résultats incertains n'ont pas validé les
   procédures opérateur.
9. Garder les exports de KPI Copilot privés désactivés tant que la promesse de confidentialité
   publique n'a pas été révisée. Les crédits nets sont mesurables ; le coût monétaire Eve et la
   rétention Premium restent explicitement indisponibles sans facturation fournisseur ni sources
   d'historique d'abonnement vérifiées.
10. Définir un `CRON_SECRET` aléatoire d'au moins 16 caractères. Le Vercel Cron quotidien
    commité appelle `/api/internal/copilot/receipt-maintenance`, dont le RPC service-role draine
    physiquement les reçus après leur expiration de 90 jours. Alerter quand la dernière
    invocation réussie date de plus de 25 heures ; c'est la cible opérationnelle de suppression,
    pas un SLA public plus fort. Une invocation est plafonnée à 100 lots de 1 000 lignes ;
    l'épuisement de ce budget retourne un 503 et doit déclencher la même alerte.

### Dashboard (microfrontend)

1. Projet Vercel séparé ou enfant microfrontend ; package `@pulse/dashboard`.
2. `PUBLIC_DASHBOARD_BASE_PATH=/dashboard` doit correspondre à `kit.paths.base` de `svelte.config.js`.
3. Partager les clés publiques Supabase avec la landing ; définir `PUBLIC_LANDING_URL=https://missionpulse.app`.

### Headers de sécurité

`apps/landing/vercel.json` et `apps/dashboard/vercel.json` définissent :

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` (HSTS)
- Dashboard uniquement : `X-Robots-Tag: noindex, nofollow`

`hooks.server.ts` dans les deux apps n'ajoute le cache HTML optionnel que si `MISSIONPULSE_PERF_CACHE_HTML=1`.

### Cookies d'authentification

Supabase SSR (`createSupabaseServerClient`) délègue `httpOnly`, `secure` et `sameSite` des cookies à `@supabase/ssr`. Sur HTTPS (production Vercel), les cookies d'auth sont posés de façon sécurisée. Aucun override personnalisé nécessaire.

Callback OAuth : `apps/landing/src/routes/api/auth/callback/+server.ts` → redirige vers `/dashboard` par défaut.

### Supabase

1. Projet Supabase de production avec Auth (email, passkey si activé).
2. URLs de redirection : `https://missionpulse.app/api/auth/callback`, URLs de dev local pour la preview.
3. Appliquer les migrations :

```bash
# One-shot : lier la CLI au projet de production
supabase link --project-ref <your-project-ref> --workdir apps/landing

# Pousser toutes les migrations de apps/landing/supabase/migrations/
supabase db push --workdir apps/landing
```

4. Stocker `SUPABASE_SERVICE_ROLE_KEY` uniquement dans l'env serveur Vercel (jamais `PUBLIC_*`).
5. Avant un déploiement Copilot, exécuter le contrat physique de base de données après avoir
   démarré et réinitialisé Supabase local :

```bash
pnpm --filter @pulse/landing test:db
```

### Lemon Squeezy

1. Configurer l'URL de webhook : `https://missionpulse.app/api/webhooks/lemon`
2. Définir `LEMON_SQUEEZY_WEBHOOK_SECRET` dans Vercel.
3. Mapper les IDs de variants de packs de crédits dans l'env.

---

## Chrome Web Store

### Artefact de build

La version candidate doit déjà être commitée de façon cohérente dans le package racine, le package extension et le manifest source. Ne jamais la bumper dans un workflow de release. Sur le commit propre exact, exécuter la gate complète local/build/MV3-packagé et sceller ses preuves immuables :

```bash
pnpm --filter @pulse/extension release:seal-candidate -- \
  --input output/playwright/mv3-evidence/final-gate-input.json \
  --dist apps/extension/dist \
  --output output/playwright/mv3-evidence/tested-dist-seal.json
```

L'entrée doit lier le commit propre exact, la version commitée, les versions Node/pnpm, le lockfile, la configuration des connecteurs, le manifest buildé effectif, l'inventaire complet non vide de scénarios MV3 commité, le rapport agrégé, zéro skip/failure/diagnostic runtime, et des reçus d'arbre identiques avant et après l'exercice navigateur. Un fichier par test n'est pas une preuve agrégée.

Une fois le seal existant, le flux est package-only. Ne pas installer, builder, bumper, résoudre les connecteurs, supprimer ni réécrire `dist` :

```bash
pnpm --filter @pulse/extension package:sealed -- \
  --seal output/playwright/mv3-evidence/tested-dist-seal.json \
  --dist apps/extension/dist \
  --releases apps/extension/releases \
  --artifact-id artifact-0.2.2-<commit> \
  --journal-id journal-0.2.2-<commit>

pnpm --filter @pulse/extension verify:release-artifact -- \
  --bundle apps/extension/releases/v0.2.2 \
  --zip apps/extension/releases/v0.2.2/missionpulse.zip \
  --checksum apps/extension/releases/v0.2.2/missionpulse.zip.sha256 \
  --validation apps/extension/releases/v0.2.2/validation.json \
  --extract-fresh /tmp/missionpulse-0.2.2-consumer-check
```

Le bundle accepté contient exactement le marqueur d'ownership immuable, le ZIP STORE canonique, le sidecar de checksum exact et l'enregistrement de validation JCS. Recalculer le SHA-256 du ZIP après chaque upload/download et immédiatement avant tout handoff Store.

### Automatisation de release

Lancer `release.yml` manuellement avec le commit/version source et le run/artifact Actions exact qui a archivé `tested-dist-seal.json` avec son `dist/` testé. Le workflow invoque le même runner package-only et vérifie l'artifact téléchargé dans un job séparé. Son état maximal est `package_validated`.

Après le passage de `consumer-verify`, le job `release-publish` publie le résultat en GitHub Release versionnée. L'opérateur pousse d'abord le tag immuable `v<version>` au commit scellé depuis sa machine (le GITHUB_TOKEN du workflow ne peut pas pousser de tags sur des commits modifiant le workflow, et taguer une release est une décision d'opérateur). Le job ensuite :

1. vérifie que le tag distant existe et pointe exactement vers le commit scellé (fail-closed sinon) ;
2. revérifie le checksum du bundle contre le sidecar et le digest du job de packaging ;
3. crée la GitHub Release depuis ce tag (`--verify-tag`) et upload `missionpulse.zip`, `missionpulse.zip.sha256` et `validation.json` comme assets de release ;
4. refuse de muter une release existante — une release publiée est immuable.

Séquence complète pour une version :

```bash
git tag "v0.2.2" "5fd443dc1c7a" && git push origin "v0.2.2"
gh workflow run release.yml --ref main \
  -f source_commit="5fd443dc1c7a…" -f expected_version="0.2.2" -f evidence_run_id="<seal-run-id>"
```

La GitHub Release est le point de handoff durable vers le Store : télécharger `missionpulse.zip` depuis la page de release, recalculer son SHA-256, et le comparer au `missionpulse.zip.sha256` de la release avant tout upload vers le dashboard Chrome Web Store.

### Frontière Chrome Web Store

Il n'y a aucune publication fournisseur automatique. La readiness Store exige un reçu structuré et autorisé couvrant la complétude de la fiche, la déclaration de confidentialité, la justification des permissions, les quatre checks de présence d'identifiants et une cible de rollback connue et bonne. Les identifiants restent dans le secret store de l'opérateur/fournisseur et ne doivent jamais entrer dans les preuves locales :

- `CHROME_EXTENSION_ID`
- `CHROME_CLIENT_ID`
- `CHROME_CLIENT_SECRET`
- `CHROME_REFRESH_TOKEN`

La soumission, l'observation, la promotion en production et le rollback sont des transitions externes pilotées par reçus. Un package local vert ne revendique aucun d'entre eux.

### Checklist du manifest

- Version alignée avec `package.json` (actuellement `0.2.2`)
- `minimum_chrome_version` : `114`
- Permissions : sidePanel, storage, cookies, alarms, notifications, declarativeNetRequest, scripting, activeTab, identity
- Host permissions : connecteurs de missions livrés + le projet Supabase configuré +
  l'API Copilot sans cookie uniquement
- LinkedIn : `optional_host_permissions` uniquement

### Tree-shaking du code dev

Vérifié : le `dist/` de production ne contient ni `bootstrapDevMode`, ni `DevPanel`, ni `chrome-stubs`, ni `qa-seed`. Tous les imports de `src/dev/` sont derrière des imports dynamiques `import.meta.env.DEV`.

---

## DNS & domaines

| Enregistrement     | Cible                                                                |
| ------------------ | -------------------------------------------------------------------- |
| `missionpulse.app` | Projet landing Vercel                                                |
| `www`              | Redirection vers l'apex (recommandé)                                 |
| `copilot`          | Même projet landing Vercel ; aucun cookie de compte ni UI navigateur |

Les déploiements de preview utilisent `*.vercel.app` ; ajouter les URLs de redirection Supabase par preview si l'auth est testée.

---

## Smoke tests post-déploiement

- [ ] La home de la landing charge en HTTPS
- [ ] `/login`, `/register`, `/register/passkey` fonctionnent
- [ ] Le callback OAuth pose le cookie de session ; redirection vers `/dashboard`
- [ ] Le dashboard charge l'état authentifié ; non authentifié redirige vers le login de la landing
- [ ] `/api/generate` retourne 503 sans `GLM_API_KEY` (ou 200 si configurée)
- [ ] `copilot.missionpulse.app/api/copilot/entitlement` rejette les credentials bearer manquants et ne s'appuie jamais sur les cookies de compte
- [ ] La santé Eve est déployée via la réécriture commitée en services frères, tandis que les routes de session Eve rejettent les appels navigateur sans Vercel OIDC
- [ ] La maintenance des reçus rejette un bearer manquant/erroné, réussit avec le `CRON_SECRET` Vercel, et son dernier run réussi date de moins de 25 heures
- [ ] `private.copilot_job_facts` est inaccessible à `anon` et `authenticated` ; aucune route publique de métriques Copilot n'existe
- [ ] L'extension se charge dans Chrome ; le side panel s'ouvre ; un scan s'exécute sur une plateforme connectée
- [ ] L'extension se synchronise avec Supabase (host permission pour l'URL du projet)

---

## Manques connus (non bloquants pour le build)

| Priorité | Élément                                                                                                | Propriétaire |
| -------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| Haute    | Configurer les variables d'env Vercel (voir tables ci-dessus)                                          | Ops          |
| Haute    | Projet Supabase de production + migrations (`apps/landing/supabase/migrations/`)                       | Ops          |
| Haute    | URLs de redirection Supabase Auth : `https://missionpulse.app/api/auth/callback`                       | Ops          |
| Haute    | Webhook Lemon Squeezy : `https://missionpulse.app/api/webhooks/lemon`                                  | Ops          |
| Haute    | Secrets GitHub Chrome Web Store pour le workflow de release                                            | Ops          |
| Moyenne  | URL Supabase en dur dans le manifest de l'extension — changer de projet exige code + re-soumission CWS | Dev          |
| Basse    | CSP non configurée (s'appuyer sur les headers Vercel + défauts SvelteKit)                              | Dev          |

---

## Commit suggéré avant déploiement

Stager uniquement les changements pertinents pour la production (exclure `reports/performance/`) :

- Refactor auth de la landing (`hooks.server.ts`, `auth-cookie.ts`, routes login/register)
- `hooks.server.ts` du dashboard
- Changements performance/connecteurs de l'extension (si testés)
- `docs/PRODUCTION.md`, fichiers `.env.example` mis à jour

Ne **pas** committer de fichiers `.env` ni `SUPABASE_SERVICE_ROLE_KEY`.
