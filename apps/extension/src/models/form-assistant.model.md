# Form Assistant (type Grammarly) — Modèle d'états (source of truth)

Assistant de remplissage de formulaires de candidature sur les **plateformes
connecteurs**. Au focus sur un champ de saisie, l'extension propose une valeur
issue du profil utilisateur, générée par **Gemini Nano local (gratuit)** par
défaut, ou par **Eve Copilot distant (payant, Vercel — `copilot.missionpulse.app`)**
si l'entitlement serveur et le consentement le permettent.

Règle courte : _« Le LLM produit des signaux ; le modèle décide. »_ Aucune
sortie IA n'est jamais injectée sans un **ACCEPT** explicite de l'utilisateur.
Le remplissage est une **proposition**, jamais une transition automatique.

## Pourquoi un modèle

Le feature introduit un **nouveau contexte d'exécution** (content script) sur
des pages tierces, lit le DOM de formulaire, et peut appeler une IA distante.
Cela touche à la vie privée et au modèle de consentement strict d'Eve. Tout
comportement non modélisé ici est hors périmètre jusqu'à modification de ce
fichier.

## Autorités

- Le **service worker** est l'**unique frontière réseau**. Le content script
  n'appelle jamais `fetch`, Eve, ou `chrome.cookies`. Il ne fait que détecter
  les champs, afficher le widget, et dialoguer avec le SW via le bridge typé.
- Le **profil utilisateur** reste dans le SW (IndexedDB / canonique). Il
  n'est **jamais** transmis au content script.
- **Eve** réutilise l'authentification existante : bearer en
  `chrome.storage.session`, origine cookieless `copilot.missionpulse.app`,
  `credentials: 'omit'`, rollout `VITE_COPILOT_ROLLOUT_ENABLED`. **Aucun**
  booléen Premium local ne donne accès à Eve ; seule l'entitlement serveur
  fraîche y autorise.
- Le **flag premium dormant par défaut** ne clôt **pas** Eve (l'entitlement
  décide). Gemini Nano local reste **toujours gratuit**.
- Le **LLM ne décide aucune transition**. Il produit un texte proposé ; le
  modèle décide du routage moteur, du consentement, et de l'application.

## Portée (décisions produit)

1. **Sites** : plateformes connecteurs **connues** uniquement (Free-Work,
   LeHibou, Malt, Cherry-Pick, Hiway, Collective.work). Pas de permission
   large ; on réutilise les `host_permissions` existants + `scripting`.
2. **Données** : profil local + **métadonnées du champ ciblé**
   (label/placeholder/type/`required`) uniquement. **Zéro** contenu de page
   (pas de valeurs d'autres champs, pas d'URL source, pas de HTML, pas de
   cookies) envoyé à l'IA.
3. **Moteurs** : Gemini Nano local (gratuit) par défaut ; Eve distant (payant)
   si entitlement serveur **+** consentement explicite session.

## Contextes

- **Content script** (`src/content/form-assistant/` — nouveau) — monde isolé,
  widget rendu en **Shadow DOM** (zéro fuite de style, comme Grammarly).
  Possède : détection conservatrice des champs, rendu du widget, envoi des
  requêtes au SW, application des propositions acceptées.
- **Service worker** (`src/background/`) — routage moteur, entitlement,
  consentement Eve, génération locale Gemini, appel distant Eve, retour d'une
  proposition.
- **Side panel** (`src/ui/`) — réglages (activation, préférence moteur,
  révocation du consentement), prompt de consentement Eve.
- **Bridge** (`src/lib/shell/messaging/bridge.ts`) — messages typés ci-dessous.
- **Core** (`src/lib/core/form-assistant/` — nouveau, **pur**) — classification
  de champ, assainissement, sélection du moteur, prompt, parsing, rédaction
  pour l' distant.

## Décisions pures (core, sans I/O)

- `classifyField(rawLabel, placeholder, inputType, required): FieldDescriptor`
  — mappe le champ vers un `FieldKind` (`first-name`, `last-name`, `email`,
  `phone`, `linkedin`, `cover-letter`, `availability`, `tjm`, `skill`,
  `address`, `free-text`…). Table de vérité testable sans mocks.
- `sanitizeFieldDescriptor(raw): FieldDescriptor` — plafonne les longueurs,
  supprime URL/email/téléphone parasites du label, rédige tout identifiant.
- `selectFormAssistEngine(prefs, entitlement, availability, consent)` →
  `'local' | 'remote' | 'none'`. Pure, déterministe.

  | `availability` | `entitlement` | `consent` | `prefs.engine` | sortie             |
  | -------------- | ------------- | --------- | -------------- | ------------------ |
  | `no`           | —             | —         | —              | `none`             |
  | `ok`           | —             | —         | `local`        | `local`            |
  | `ok`           | `active`      | `granted` | `remote`       | `remote`           |
  | `ok`           | autre         | —         | `remote`       | `local` (fallback) |
  | `ok`           | `active`      | autre     | `remote`       | `local` (fallback) |

- `buildFieldPrompt(descriptor, profile): string` — prompt Gemini local, pur.
- `parseFieldProposal(raw): { text: string } | null` — parsing défensif.
- `redactForRemote(descriptor, profile): RemoteFieldRequest` — ne projette que
  les champs allowlistés du profil + le `FieldDescriptor` assaini. Réutilise
  le principe `COPILOT_PROFILE_FIELD_ALLOWLIST`.

### `FieldDescriptor` (type core)

```ts
interface FieldDescriptor {
  kind: FieldKind;
  label: string; // assaini, ≤ 120 chars
  placeholder: string; // assaini, ≤ 200 chars
  inputType: 'text' | 'textarea' | 'email' | 'tel' | 'url' | 'search' | 'contenteditable';
  required: boolean;
}
// JAMAIS : id/name du champ, valeurs d'autres champs, URL, HTML voisin.
```

## Machine D — Activation côté panel (side panel ↔ SW)

Le toggle d'activation vit dans la page **Settings**. Il reflète l'état persisté
dans le SW (`formAssist.enabled`, `chrome.storage.local`) et émet
`FORM_ASSIST_ENABLE` sur action utilisateur explicite. **Aucun LLM dans cette
machine** : la décision est purement un booléen user-owned persisté côté SW.

```text
unknown ──INIT──► loading
loading ──STATUS_RESULT(enabled)──► on | off
loading ──SW_UNREACHABLE──► error
off      ──TOGGLE(on)──► loading        (optimiste, garde anti-double-clic)
on       ──TOGGLE(off)──► loading
on|off   ──ENABLED(enabled)──► on | off (raccolement via diffusion SW)
error    ──RETRY──► loading
```

- `loading` après `TOGGLE` est **optimiste** : l'UI désactive le toggle
  (`disabled`) jusqu'au `FORM_ASSIST_ENABLED` de confirmation pour interdire
  tout double-envoi. L'échec (`SW_UNREACHABLE`) ramène à l'état précédent **et**
  affiche un toast typé (jamais silencieux).
- Le `FORM_ASSIST_ENABLED` diffusé par le SW (qui notifie aussi le content
- script) racolette le toggle : le panel est une **source de vérité miroir**, pas
  primaire. La source primaire reste le `chrome.storage.local` du SW.
- Le moteur distant (Eve) reste **hors périmètre du toggle** : ce dernier
  n'expose que le booléen `enabled`. La préférence `engine` et le consentement
  (Machine C) sont gérés séparément.
- Invariant : le toggle **n'écrit jamais** dans `chrome.storage` depuis le
  panel — tout passe par le bridge typé vers le SW (règle « le panel n'appelle
  jamais IndexedDB / chrome.storage directement »).

## Machine A — Widget (content script, par champ focalisé)

```text
idle ──FOCUS(field)─────────► armed
armed ──BLUR────────────────► idle
armed ──REQUEST_FILL─────────► requesting
armed ──DISABLE──────────────► disabled
requesting ──PROPOSAL────────► ready
requesting ──ERROR(code)──────► armed   (toast typé)
requesting ──CANCEL──────────► armed
ready ──ACCEPT───────────────► applying
ready ──REJECT────────────────► armed
ready ──EDIT(user)────────────► ready
applying ──APPLIED────────────► filled
applying ──ERROR──────────────► ready   (toast)
filled ──CLEAR(user)──────────► armed
disabled ──ENABLE─────────────► idle
```

- `applying` écrit via le **setter natif** + événement `input` natif (sécurité
  frameworks contrôlés React/Vue/Svelte). **Jamais** de soumission auto.
- `ACCEPT` est la **seule** transition vers `applying`. Le LLM ne l déclenche pas.

## Machine B — Requête de génération (service worker, par `requestId`)

```text
received ─engine=local──► generating-local
received ─engine=remote─► consent
received ─engine=none───► failed(unavailable)

consent ─GRANTED──► entitlement
consent ─DENIED───► fallback-local      (dégradation explicite vers local)

entitlement ─ENTITLED────► generating-remote
entitlement ─NOT_ENTITLED─► fallback-local

generating-local  ─OK──► done(proposal)
generating-local  ─ERR─► failed(local-error)
generating-remote ─OK──► done(proposal)
generating-remote ─ERR─► failed(remote-error)
fallback-local    ─OK──► done(proposal)
fallback-local    ─ERR─► failed(local-error)

done   ─► terminal   (proposition renvoyée au content script)
failed ─► terminal   (erreur typée renvoyée)
```

- `fallback-local` est **déterministe** et tracé ; il n'appelle jamais Eve en
  silence. Si Gemini Nano est indisponible (`availability === 'no'`), on va
  directement à `failed(unavailable)`.

## Machine C — Consentement Eve (session-scoped)

```text
unknown ─PROMPT──► prompting
prompting ─GRANT─► granted
prompting ─DENY──► denied
granted ─REVOKE──► denied
denied ─PROMPT───► prompting
```

- `granted` est **session-scoped** (`chrome.storage.session`), effacé au
  redémarrage du navigateur. Révocable depuis le side panel à tout moment.
- Première demande distante en `consent` → le SW émet
  `FORM_ASSIST_CONSENT_REQUIRED` vers le side panel (geste utilisateur requis
  pour `chrome.permissions`/UI). La requête en cours attend ou bascule en
  `fallback-local` selon préférence.

## Messages bridge (nouveaux)

- `FORM_ASSIST_ENABLE` (panel → SW) — `{ enabled }` (booléen user-owned ;
  `enginePref`/`perSite` restent HORS périmètre du toggle v1, gérés par défaut).
  Le SW persiste, puis **diffuse** `FORM_ASSIST_ENABLED` vers le panel (racolement)
  ET vers le content script (arm/disarm).
- `FORM_ASSIST_STATUS` (panel/content → SW) — lecture de l'état persisté.
- `FORM_ASSIST_STATUS_RESULT` (SW → panel/content) — `{ enabled, engine }`.
- `FORM_ASSIST_REQUEST` (content → SW) — `{ requestId, field: FieldDescriptor }`
  (le SW relit le profil canonique lui-même ; **pas de profil côté contenu**).
- `FORM_ASSIST_PROPOSAL` (SW → content) — `{ requestId, proposal: { text, engine } }`.
- `FORM_ASSIST_ERROR` (SW → content) — `{ requestId, code, message }`.
- `FORM_ASSIST_CONSENT_REQUIRED` (SW → panel) — `{ requestId }`.
- `FORM_ASSIST_CONSENT_RESPONSE` (panel → SW) — `{ requestId, granted }`.
- `FORM_ASSIST_APPLIED` (content → SW) — télémétrie **locale** only
  (`{ requestId, engine, kind }`, aucun contenu). Optionnel.

## Eve — adaptation

Réutilise l'**auth existante** (bearer `chrome.storage.session`, origine
cookieless, `credentials: 'omit'`). **N'utilise pas** la machine de job/dossier
`copilotDossierMachine` (trop lourde : checkpoint, idempotence, crédits Eve
0.26.2). À la place, un **endpoint léger dédié**
`POST https://copilot.missionpulse.app/api/copilot/field-fill` :

- entrée : `RemoteFieldRequest` (FieldDescriptor assaini + champs profil
  allowlistés) + `requestId`.
- sortie validée Zod `.strict()` : `{ text: string }`.
- même garde de rollout `VITE_COPILOT_ROLLOUT_ENABLED` + entitlement fraîche.
- pas de checkpoint durable (la requête est synchrone et révocable ; aucun
  artefact persisté côté serveur au-delà du traitement éphémère).

Le domaine custom doit être déployé sur le backend Vercel avant ouverture du
rollout (même exigence que le Copilot dossier).

## Build / manifest

- Les `matches` du `content_scripts` sont **dérivés** des connecteurs **inclus**
  qui déclarent `formAssist: true` dans le catalogue (`meta.ts`). Un connecteur
  exclu au build (cf. `connector-build-config.model.md`) exclut aussi
  l'assistant — cohérence de moindre privilège.
- **Tous les connecteurs du catalogue** déclarent `formAssist: true` par défaut
  (Free-Work, LeHibou, Hiway, Collective, Cherry Pick, Malt) — conformément à
  la portée produit ci-dessus. Le content script étant **générique**
  (détection de champ conservatrice, aucun parsing spécifique à une plateforme),
  l'activation ne dépend que du flag catalogue, pas d'une logique par site.
- Aucune nouvelle permission large : on réutilise `host_permissions` +
  `scripting` + `storage`.
- En **dev**, le content script se charge mais les `chrome.*` sont stubés
  comme ailleurs ; le widget est vérifiable sur le side panel de dev via un
  fixture DOM.

## Invariants

1. **Le LLM produit des signaux ; le modèle décide.** `ACCEPT` est l'unique
   transition vers `applying`. Pas de soumission auto, pas de remplissage auto.
2. **Le service worker est l'unique frontière réseau.** Le content script ne
   fait aucun `fetch`/Eve/`chrome.cookies`.
3. **Zéro fuite de contenu de page vers Eve.** Seuls `FieldDescriptor` assaini
   - champs profil allowlistés quittent l'appareil.
4. **Eve** : origine cookieless, `credentials: 'omit'`, bearer en session,
   rollout + entitlement + consentement. **Jamais** clôturé par un booléen
   Premium local.
5. **Le profil ne quitte jamais le SW** vers le content script.
6. **Sélection du moteur pure**, jamais décidée par un LLM.
7. **Consentement** explicite, session-scoped, révocable. Un refus **dégrade**
   vers local (Eve n'est jamais appelé en silence).
8. **Premium dormant par défaut** ne clôt pas Eve ; l'entitlement décide.
   Gemini Nano local est toujours gratuit.
9. **Content script** : Shadow DOM, monde isolé, détection conservatrice,
   jamais bloquant, jamais de soumission auto.
10. **Moindre privilège** : `matches` dérivés des connecteurs inclus opt-in ;
    aucune permission large ajoutée.
11. **Aucun identifiant stocké** (credentials, cookies, tokens, sessions) dans
    les commits ; aucun telemetry distant (compteurs locaux only).

## Cas nominaux / erreurs / annulation / permissions / terminaux

- **Nominal local** : FOCUS → REQUEST → `engine=local` → done → ACCEPT → APPLIED.
- **Nominal distant** : FOCUS → REQUEST → `consent` → GRANT → entitlement OK →
  done → ACCEPT → APPLIED.
- **Erreur local** : `generating-local ERR` → `failed(local-error)` → toast ;
  widget retourne à `armed`.
- **Erreur distant** : `generating-remote ERR` → `failed(remote-error)` → toast
  typé ; pas de retry automatique aveugle.
- **Annulation** : `requesting CANCEL` ou fermeture widget → `armed` ; la
  requête SW en cours est annulée via `AbortSignal` (cohérent avec
  `semantic-scorer`).
- **Permissions** : portée limitée aux connecteurs ; pas de demande de
  permission large. Eve n'exige pas de permission Chrome nouvelle (cookieless).
- **Terminaux** : `done`, `failed`, `idle`, `disabled`. Aucun job Eve persistant
  ouvert par ce flux.

## Vérification (Verify)

- **Core pur** (sans mocks) : tables de vérité `classifyField`,
  `selectFormAssistEngine`, `sanitizeFieldDescriptor` (réduction URL/email,
  plafond longueur), `parseFieldProposal`, `redactForRemote` (aucune clé hors
  allowlist ne sort).
- **Machine B** : transitions autorisées/interdites (interdit `generating-remote`
  sans `consent=granted` **et** `entitlement=entitled` ; interdit d'appliquer
  sans `ACCEPT`).
- **Machine C** : refus de consentement → `fallback-local` ou `failed` ; Eve
  jamais appelé ; révocable.
- **Content script** : détection sur fixtures HTML ; widget Shadow DOM rendu ;
  ACCEPT applique via événement natif ; REJECT/EDIT n'appliquent pas.
- **Bridge** : schémas Zod `.strict()` sur `FORM_ASSIST_REQUEST` et réponse ;
  le profil n'apparaît jamais dans un message content→SW.

## Hors périmètre (v1, différé)

- Soumission auto / automatisation multi-étapes.
- Lecture du contexte de page au-delà du champ focalisé.
- Uploads de fichiers / parsing CV côté page.
- Sites hors connecteurs (pourrait être activé plus tard via
  `optional_host_permissions`, comme l'import LinkedIn).
- Streaming Eve (une réponse complète par requête en v1).
