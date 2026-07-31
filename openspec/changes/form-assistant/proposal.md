# form-assistant

## Why

Sur les plateformes de missions, l'utilisateur doit remplir à la main des
formulaires de candidature (prénom, email, lien LinkedIn, message de motivation,
disponibilité, TJM…). On veut un assistant **type Grammarly** : au focus sur un
champ, l'extension propose une valeur issue du profil, générée par **Gemini Nano
local (gratuit)** par défaut, ou par **Eve Copilot distant (payant, Vercel)** si
l'entitlement serveur et le consentement le permettent. Le remplissage est une
**proposition** que l'utilisateur accepte explicitement — jamais une transition
automatique pilotée par le LLM.

## What changes

- **New core module** `core/form-assistant/` (**pur**, sans I/O) :
  `classify-field.ts` (`classifyField`), `sanitize-field-descriptor.ts`
  (`sanitizeFieldDescriptor`), `select-engine.ts`
  (`selectFormAssistEngine` — table de vérité), `build-field-prompt.ts`,
  `parse-field-proposal.ts`, `redact-for-remote.ts`. Types dans
  `core/form-assistant/types.ts` (`FieldDescriptor`, `FieldKind`,
  `RemoteFieldRequest`).
- **New content script** `src/content/form-assistant/` (monde isolé, widget
  **Shadow DOM**) : détection conservatrice des champs focusables, rendu du
  widget, envoi des requêtes au SW, application via setter natif + événement
  `input` natif. Machine A (widget par champ).
- **Service worker** : handler bridge `FORM_ASSIST_*` ; orchestration Machine B
  (requête par `requestId`) ; réutilise `capabilities.ts` (Gemini Nano) et
  `shell/copilot/` (auth/entitlement/transport) pour un **endpoint léger dédié**
  `POST https://copilot.missionpulse.app/api/copilot/field-fill`. Consentement
  Machine C session-scoped dans `chrome.storage.session`.
- **Bridge messages** (+ schémas Zod `.strict()`) : `FORM_ASSIST_ENABLE`,
  `FORM_ASSIST_STATUS`, `FORM_ASSIST_REQUEST`, `FORM_ASSIST_PROPOSAL`,
  `FORM_ASSIST_ERROR`, `FORM_ASSIST_CONSENT_REQUIRED`,
  `FORM_ASSIST_CONSENT_RESPONSE`, `FORM_ASSIST_APPLIED`.
- **Side panel** : page/section réglages (activation, préférence moteur,
  révocation consentement) + prompt de consentement Eve. State module
  `src/lib/state/form-assistant.svelte.ts`.
- **Catalogue connecteurs** `shell/connectors/meta.ts` : ajouter
  `formAssist?: boolean` sur les connecteurs opt-in.
- **Manifest** : `content_scripts.matches` **dérivés** des connecteurs inclus
  opt-in (build-time, via `vite.config.ts`, cohérent avec
  `connector-build-config.model.md`). Aucune nouvelle permission large.
- **Dev stubs** `dev/chrome-stubs.ts` : widget vérifiable sur fixture DOM.
- **Tests** : core pur sans mocks ; machine B transitions autorisées/interdites ;
  machine C pas d'appel Eve sans consentement ; redaction ; fixtures DOM.

## Non-goals

- Pas de soumission auto / automatisation multi-étapes.
- Pas de lecture du contexte de page au-delà du champ focalisé (pas de JD, pas
  d'autres champs, pas d'URL source).
- Pas d'uploads / parsing CV côté page.
- Pas de sites hors connecteurs (différé ; pourra utiliser
  `optional_host_permissions` comme l'import LinkedIn).
- Pas de streaming Eve en v1.
- Pas de coupling avec `copilotDossierMachine` (job/checkpoint/crédits) — flux
  synchrone, éphémère, révocable, sans artefact serveur persistant.
- Pas de télémétrie distante (compteurs locaux uniquement).

## Model

Authoritative : `apps/extension/src/models/form-assistant.model.md`.

Trois machines :

- **A — Widget** (content script, par champ) :
  `idle · armed · requesting · ready · applying · filled · disabled`.
- **B — Requête de génération** (SW, par `requestId`) :
  `received · consent · entitlement · generating-local · generating-remote ·
fallback-local · done · failed`.
- **C — Consentement Eve** (session-scoped) :
  `unknown · prompting · granted · denied`.

Invariants clés : (1) `ACCEPT` est l'unique transition vers `applying` ; le LLM
produit un signal, le modèle décide. (2) Le SW est l'unique frontière réseau ; le
content script ne fetch/cookies jamais. (3) Zéro fuite de contenu de page vers
Eve (seuls `FieldDescriptor` assaini + champs profil allowlistés sortent). (4)
Sélection du moteur **pure**. (5) Consentement explicite/révocable ; un refus
dégrade vers local, jamais d'appel Eve silencieux. (6) Premium dormant ne clôt
pas Eve ; l'entitlement décide ; Gemini Nano toujours gratuit.

## Impact

- **Build** : `content_scripts` injectés selon connecteurs inclus opt-in ;
  `verify-manifest` étendu pour couvrir les matches.
- **Privacy/permissions** : aucune permission large ajoutée ; réutilise
  `host_permissions` + `scripting` + `storage`. Eve cookieless,
  `credentials: 'omit'`.
- **Backend Vercel** : doit exposer
  `POST https://copilot.missionpulse.app/api/copilot/field-fill` avant ouverture
  du rollout (même garde que le Copilot dossier).
- **Tests** : extension de la couverture core (portée par le gate 70/70/60/70 sur
  `src/lib/core/**`).

## Open questions

- Format exact de l'endpoint field-fill côté serveur (Zod entrée/sortie) — à
  verrouiller avec le backend Vercel avant implémentation distante. Le chemin
  local (Gemini Nano) peut être livré indépendamment et en premier.
