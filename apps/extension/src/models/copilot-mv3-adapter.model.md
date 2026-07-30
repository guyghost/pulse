# Copilot Premium — adaptateur MV3

Ce modèle décrit uniquement l'adaptateur Chrome de MissionPulse. Les décisions
produit et les invariants métier restent définis par les machines et contrats
`@pulse/domain` (`premiumEntitlementMachine`, `remoteCopilotJobMachine` et
`copilotDossierMachine`).

## Autorités

- Le serveur MissionPulse est l'autorité de l'identité, de l'entitlement, des
  crédits et de l'état distant d'un job Eve.
- Le service worker est l'unique frontière réseau de l'extension. Le side panel
  ne contacte jamais l'API directement.
- Le Copilot est distinct de `GENERATE_ASSET` et de Gemini Nano. Aucun résultat
  Copilot ne produit de transition du pipeline de candidature.
- Le rollout est fermé par défaut. Il n'est ouvert que si
  `VITE_COPILOT_ROLLOUT_ENABLED=true` au build.

## Etats de l'adaptateur

```text
unlinked -> linking -> checking -> free | active | expired | revoked | error

none -> checkpointed -> queued -> running -> review
                         |          |          |-> accepted
                         |          |          |-> rejected
                         |          |-> uncertain -> running | review | failed
                         |          |-> cancelling -> cancelled
                         |          |-> failed
                         |-> failed
```

`uncertain` n'est pas terminal mais n'est pas auto-pollé : Eve 0.26.2 ne permet
pas de relire l'effet provider. Le checkpoint et le crédit restent figés
jusqu'à une réconciliation opérateur, sans retry ni remboursement aveugle.
`review`, `accepted`, `rejected`, `cancelled` et `failed` sont terminaux pour un
job. Un retry utilisateur est un nouveau job après reconfirmation du
consentement, avec de nouveaux `requestId`, `jobId`, `attemptId` et identité de
facturation; le job remboursé n'est jamais rouvert.

## Evenements bridge

- `COPILOT_LINK`
- `COPILOT_SYNC_ENTITLEMENT`
- `COPILOT_CREATE_JOB`
- `COPILOT_GET_DOSSIER`
- `COPILOT_GET_JOB`
- `COPILOT_CANCEL_JOB`
- `COPILOT_REVIEW_JOB`
- `COPILOT_DELETE_DOSSIER`

Chaque commande porte un UUID `requestId`. Les commandes relatives à une
mission portent `missionId`; cancel/review portent aussi le `jobId` attendu.
Toutes les entrées et sorties sont validées avec des objets Zod `.strict()`.

## Projection du dossier vivant

`COPILOT_GET_DOSSIER` est une lecture auth-only et sans effet de bord. Elle ne
synchronise pas l'entitlement, ne reprend aucun job, ne réserve ni ne rembourse
de crédit et n'appelle jamais Eve. Elle reste donc admise si Premium expire, si
l'accès est révoqué ou si le rollout est retiré. Le service worker transporte
uniquement la projection publique bornée du serveur : `missionId`, état du
dossier, identifiants de consentement cumulés, analyse explicitement approuvée,
brouillons explicitement approuvés et corrélation du job actif.

La projection ne contient jamais le payload d'entrée, un résultat non approuvé,
un handle ou token Eve, ni une erreur technique libre. Elle est conservée dans
le store Svelte uniquement pour l'affichage : elle n'autorise aucune transition.
Après une revue ou à la réouverture du panneau, le store la relit afin que
l'analyse et tous les brouillons approuvés survivent aux jobs suivants et aux
redémarrages MV3.

La suppression est proposée si la dernière projection serveur confirmée est
`ready` ou `deletionFailed`, sans job actif. Si cette lecture de récupération
est momentanément indisponible, un checkpoint local terminal validé
(`accepted`, `rejected`, `failed` ou `cancelled`) constitue le seul fallback.
Une projection serveur `processing`, `reviewing`, `deleting` ou avec job actif
interdit toujours la suppression, même si un ancien checkpoint paraît terminal.

## Consentement et projection

La création envoyée par l'UI ne contient que `missionId`, `kind`, les champs
mission/profil sélectionnés, les `evidenceIds` et `requestId`. Le service worker
relit la mission et le profil canoniques, puis projette exclusivement
`COPILOT_MISSION_FIELD_ALLOWLIST`, `COPILOT_PROFILE_FIELD_ALLOWLIST` et les
expériences explicitement sélectionnées.

Les artefacts `pitch`, `cover-message` et `cv-summary` exigent au moins une
expérience consentie. Ils ne contiennent aucun brouillon libre : chaque
`draftSegment` porte une liste non vide de références consenties et typées
(`experience`, `mission-field`, `profile-field` ou `tjm-fact`). Les trois
premiers artefacts citent au moins une expérience au total. Le `tjm-coach`
cite au moins un fait numérique déterministe présent dans son checkpoint.
Chaque référence contient un extrait exact de sa source. L'analyse ne porte
aucun segment. Si un segment ou une référence n'est pas validé, l'UI masque
tout l'artefact et interdit copie et acceptation; le rejet reste possible.

Cookies, sessions de plateformes, HTML brut, URL source et CV complet sont
hors contrat et ne peuvent pas apparaître dans le payload transmis.

## Authentification et entitlement

`chrome.identity.launchWebAuthFlow` ouvre
`https://missionpulse.app/api/copilot/link?redirect_uri=...&state=...`. Cette
origine de compte ne figure pas dans les `host_permissions` et n'est jamais
appelée avec `fetch`; elle sert uniquement à la navigation interactive Chrome
Identity. Le callback doit correspondre exactement à
`chrome.identity.getRedirectURL('copilot')` et restituer le même `state`. Le
bearer reçu dans le fragment est conservé uniquement dans
`chrome.storage.session`.

Les appels bearer utilisent exclusivement l'origine cookieless dédiée
`https://copilot.missionpulse.app`, seule origine Copilot présente dans les
`host_permissions`. Chaque `fetch` impose `credentials: 'omit'`. Ainsi la
permission Chrome `cookies`, nécessaire aux connecteurs de missions, ne donne
à l'adaptateur Copilot aucune raison ni chemin applicatif pour lire des cookies
MissionPulse. Le déploiement exige que le backend Vercel expose ce domaine
custom avant l'ouverture du rollout.

Avant toute nouvelle création, le service worker relit l'entitlement canonique
auprès du serveur. Aucun booléen Premium local ne donne accès au Copilot.

## Checkpoint et reprise MV3

Avant le premier POST, le service worker persiste dans `chrome.storage.local`
un checkpoint versionné contenant la corrélation, le consentement, l'état du
job, l'input canonique exact déjà consenti et, pour `tjm-coach`, les faits
numériques déterministes. Ce snapshot est la provenance immuable du job : une
modification ultérieure de la mission ou du profil ne peut ni changer le replay
réseau, ni changer les sources affichées pendant la revue.

L'input porte `inputHash`, le SHA-256 hexadécimal minuscule du JSON canonique de
`{ schemaVersion, missionId, kind, consent, input, tjmFacts }` (donc sans le
champ `inputHash`). La canonicalisation trie récursivement les clés d'objet,
préserve l'ordre des tableaux et encode en UTF-8. Le serveur recalcule,
conserve puis écho ce hash dans chaque réponse de job.

- checkpoint sans `jobId`: vérifier le hash du snapshot, rejouer exactement cet
  input (sans relire mission/profil), avec le même `Idempotency-Key`
  (`requestId`);
- checkpoint avec `jobId`: effectuer un GET du job;
- réponse dont `missionId`, `jobId` ou `kind` diverge: échec de protocole;
- réponse dont `inputHash` diverge du checkpoint: échec de protocole;
- `tjmFacts` distant différent structurellement du checkpoint, ou présent sur
  un autre type de job: échec de protocole;
- résultat non validé par `isReviewableCopilotResult`: échec fail-closed.

Une lecture distante peut être refusée après expiration, révocation, retrait
du rollout ou panne réseau. Dans ce cas, le checkpoint local validé reste
visible comme projection de récupération explicitement non synchronisée. Il
ne permet aucune création ni reprise d'effet provider/crédit, mais conserve les
identifiants nécessaires aux commandes auth-only d'annulation, de revue
terminale et de suppression. Une acceptation/rejet tardive ne contacte pas Eve
et ne rend une continuation utilisable qu'à travers un futur job de nouveau
autorisé. Un refus de lecture ne doit jamais effacer ou masquer ce checkpoint.

La projection bridge n'expose comme `sourceSnapshot` que le payload exact du
checkpoint et son hash. Les références de résultat `experience`,
`mission-field`, `profile-field` et `tjm-fact` sont résolues exclusivement dans
ce snapshot du job. Une source absente masque l'artefact et interdit copie ou
acceptation. Les données locales courantes servent uniquement à préparer le
consentement d'un prochain job.

Le polling appartient au store du side panel et s'arrête quand le panneau est
fermé ou quand l'état devient terminal. Le service worker ne maintient ni
stream persistant ni alarme Copilot; il peut conserver uniquement la promesse
bornée du POST courant, protégée par le checkpoint déjà durable.

Le timeout HTTP de l'adaptateur est strictement supérieur au timeout provider
maximal accepté par le serveur (120 s plus marge). Le cas nominal ne doit donc
pas abandonner le POST puis lancer une récupération concurrente pendant que le
même appel Eve est encore actif. Une vraie coupure réseau conserve le checkpoint
pré-POST et rejoue uniquement la même clé d'idempotence; si un effet provider
est possible, la récupération fail-closed en `uncertain`.

Une réponse serveur `RATE_LIMITED` (HTTP 429) échoue la commande sans créer de
job local, avec `retryable=false`. L'adaptateur n'effectue aucun retry ni
polling automatique avant la prochaine fenêtre annoncée par le serveur; l'UI
affiche le message public structuré.

## Revue et suppression

Un résultat reste une proposition. L'acceptation ou le rejet est une commande
explicite de revue et ne modifie pas `MissionTracking`. La suppression locale
n'est confirmée qu'après une disposition distante `deleted`,
`retention-confirmed` ou `not-created`. Avant d'effacer le checkpoint, le
service worker persiste un reçu local minimal `{ missionId, disposition,
confirmedAtMs }`, consultable à la réouverture du panneau. L'UI distingue les
trois issues : `deleted` confirme la suppression, `not-created` confirme
l'absence de dossier distant, et `retention-confirmed` indique explicitement
que des données peuvent rester conservées par Eve selon sa politique et sa
durée de rétention (une durée inconnue n'est jamais présentée comme une
suppression complète).

L'adaptateur ne propose et n'envoie `DELETE_DOSSIER` que lorsque le dernier
checkpoint est `accepted`, `rejected`, `failed` ou `cancelled`. En
`checkpointed`, `queued`, `running` ou `cancelling`, l'utilisateur doit d'abord
annuler; en `review`, il doit d'abord accepter ou rejeter; en `uncertain`, seule
la réconciliation opérateur peut établir une issue sûre. Le store, l'UI et les
stubs de développement appliquent la même garde.
