# ADR-006 : Frontière avec le fournisseur IA distant

## Statut

Accepté pour un pilote interne. L'activation publique reste bloquée tant que les
contrôles de rétention et de suppression n'ont pas été vérifiés.

## Contexte

MissionPulse est local-first : les sessions connecteurs, le HTML brut, les
missions normalisées, le CV complet et le scoring déterministe restent dans
l'extension. Le Copilot Premium nécessite des sessions d'agent durables, des
entitlements faisant foi côté serveur et un registre de crédits idempotent.
Appeler un agent hébergé depuis l'extension Chrome exposerait l'autorité du
fournisseur et laisserait un flag Premium modifiable localement protéger un
service payant.

L'application landing possède déjà l'authentification Supabase, les
abonnements, les crédits et les routes serveur. Vercel Eve est utile pour les
sessions Copilot durables mais est actuellement une dépendance bêta exigeant un
runtime Node 24. Elle ne doit devenir ni une autorité d'état applicatif, ni une
dépendance de domaine irremplaçable.

## Décision

Le Copilot Premium utilise cette frontière de confiance :

```text
Side panel -> bridge typé -> service worker MV3 -> API MissionPulse
  -> auth serveur, ownership, entitlement et admission crédit
  -> port fournisseur -> Eve
```

- L'extension n'appelle jamais une route Eve et ne reçoit jamais d'identifiant,
  de session ni de token de continuation Eve.
- Le lien de compte utilise un flux d'auth navigateur. Le bearer éphémère de
  l'extension est conservé dans `chrome.storage.session` ; l'API revalide l'état
  d'abonnement à chaque requête privilégiée.
- C'est le service worker, pas l'UI, qui lit les enregistrements locaux
  missions/profil et construit le payload allowlisté décrit par `@pulse/domain`.
- Seuls les champs de mission normalisés individuellement consentis, les champs
  de profil et les preuves d'expérience sélectionnées peuvent franchir la
  frontière. Cookies, sessions connecteurs, HTML brut et CV complet sont interdits.
- L'API possède un dossier durable par utilisateur et mission, et des jobs
  idempotents par requête utilisateur. Les handles de session Eve restent côté
  serveur, protégés par l'ACL du propriétaire du dossier.
- L'analyse coûte zéro crédit avec un entitlement Premium actif. Chaque pitch,
  message recruteur, résumé CV ou brief TJM coûte exactement un crédit réservé.
  Réservation et remboursement sont des opérations de registre indexées par la
  clé d'idempotence du job.
- La sortie du fournisseur est validée par schéma et les affirmations
  d'expérience doivent référencer des IDs de preuves fournies. Elle entre en
  état de revue humaine comme proposition. Seul un événement utilisateur
  corrélé peut l'approuver, la rejeter ou la copier ; aucune sortie fournisseur
  ne peut changer l'étape d'une candidature.
- Eve est derrière un port `CopilotProvider` remplaçable. Ses outils par défaut
  (shell, fichiers, web, délégation) sont désactivés car la V1 ne requiert
  aucun outil d'agent.
- Le runtime Eve est isolé dans l'application landing sur Node 24. L'extension
  et la toolchain de release racine restent épinglées à Node 22.
- Un flag de rollout extension ET la configuration serveur doivent être activés.
  Le défaut est indisponible, jamais implicitement gratuit.
- L'identité navigateur reste sur `missionpulse.app` ; le trafic API bearer
  utilise l'origine sans cookie `copilot.missionpulse.app` avec
  `credentials: omit`. Eve est un service frère privé, accessible uniquement par
  le serveur via l'OIDC Vercel.
- L'admission pilote-interne est plafonnée atomiquement par utilisateur et jour
  UTC (10 analyses, 20 jobs au total) avant réservation de crédit ou dispatch Eve.
- Une session fournisseur ne continue qu'après acceptation explicite. Les
  résultats post-dispatch inconnus restent `uncertain` ; l'absence d'API de
  lookup ou de suppression Eve n'est jamais traduite en succès.
- La persistance de session fournisseur et la preuve de disposition connue du
  job forment une seule transaction service-role. La base lie en outre la job
  active d'une session via la clé composite `jobId + userId + dossierId`.
- La terminalisation sans crédit est une transaction unique couvrant job et
  dossier. Un refus d'admission avant réservation, un échec fournisseur/schéma
  gratuit, une annulation gratuite et la guérison terminale ne peuvent pas
  exposer un job terminal à côté d'un dossier `processing` périmé (ou
  l'inverse) après une réponse perdue.
- La ligne du dossier est la clôture de sérialisation et stocke l'ID de sa job
  active. Chaque RPC stage/review/refund/terminal vérifie cet ID avant de le
  libérer ; les retries périmés ne peuvent pas régler une job plus récente. Les
  lignes de session existantes ne sont pas re-lierables hors la revendication
  explicite de continuation acceptée.
- La suppression côté Eve utilise un journal de disposition durable par
  session. Une obligation `pending` passe à `uncertain` avant l'appel distant,
  puis à `deleted` ou `retention-confirmed` uniquement après enregistrement
  durable du résultat. Les entrées confirmées ne sont jamais rejouées, et les
  entrées incertaines échouent fermées jusqu'à disponibilité d'un lookup Eve ou
  d'une réconciliation opérateur. La disposition inconnue du fournisseur est
  vérifiée avant tout effet de bord de suppression distant.
- La suppression locale du dossier est un RPC unique qui écrit à la fois des
  reçus d'idempotence sans payload (conservés 90 jours) et supprime exactement
  un dossier gelé. Ces reçus et le registre d'admission par jour UTC ne sont pas
  des enfants du dossier : la suppression ne peut donc pas réactiver un replay
  payant ni réinitialiser le quota pilote.
- La rétention des reçus est physiquement appliquée. Une purge bornée,
  service-role uniquement, supprime les lignes dont l'expiration en base est
  passée ; les appels replay/admission purgent opportunément un lot et un Vercel
  Cron authentifié draine les lots expirés chaque jour. La cible opérationnelle
  est une suppression sous 25 heures après expiration (planification quotidienne
  plus fenêtre de timing documentée de Vercel). Un run manqué doit alerter les
  opérateurs, et aucun SLA public de rétention plus fort n'est revendiqué tant
  que cette alerte n'est pas déployée et éprouvée.
- L'expansion de consentement valide l'union cumulative post-verrou et ses
  limites de collecte avant écriture. Les expansions rejetées ou concurrentes ne
  peuvent pas persister un ensemble de consentement surdimensionné.
- L'idempotence lie la clé au hash d'entrée, au dossier et au type d'opération.
  Les routes parsent et vérifient le hash d'entrée avant la recherche canonique
  de doublon. Chaque endpoint pouvant reprendre un travail fournisseur ou de
  facturation revalide le rollout et l'entitlement Premium actif ; les chemins
  cancel/delete auth-only ne font aucun nouveau travail.
- Les RPC de règlement acquièrent la ligne de sérialisation du dossier avant la
  ligne de la job corrélée. Les checkpoints durables `cancelling` sont
  explicitement reprenables ; la récupération ne repose jamais sur une réparation
  générique de dossier ni sur un replay non corrélé.

Le comportement de référence est défini par :

- `premium-entitlement-sync.machine.ts`
- `remote-copilot-job.machine.ts`
- `copilot-dossier.machine.ts`

## Conséquences

- **Positif** : les identifiants du fournisseur, l'autorité d'abonnement et la
  facturation restent hors de l'extension.
- **Positif** : le scan local, le scoring et le comportement Gemini Nano restent
  disponibles sans compte ni transfert cloud.
- **Positif** : le remplacement du fournisseur ne modifie ni les transitions du
  domaine ni l'API publique de l'extension.
- **Positif** : les redémarrages MV3 récupèrent via des handles de jobs durables
  et des clés d'idempotence au lieu de répéter un travail payant.
- **Négatif** : le Copilot Premium introduit un sous-traitant cloud, donc des
  obligations de consentement explicite, de suppression, d'isolation et de
  supervision opérationnelle.
- **Négatif** : la bêta d'Eve et son exigence Node 24 ajoutent une porte de
  compatibilité et de déploiement séparée.
- **Négatif** : perdre le bearer session-only impose de re-lier le compte, voulu.

## Gates de production

1. Vérifier et publier la politique effective de rétention et de suppression
   des sessions Eve.
2. Prouver l'isolation inter-utilisateurs des dossiers et le comportement
   reserve/refund exactly-once sur une vraie base Supabase.
3. Passer les tests adversariaux de descriptions de mission et les tests E2E
   synthétiques à deux utilisateurs.
4. Établir les budgets de latence et de coût avant d'activer le flag de rollout
   public.
5. Réconcilier la copy publique de tarification dans un changement produit
   séparé.
6. Configurer `CRON_SECRET`, observer le cron de purge des reçus en production
   et alerter si aucun run réussi n'est enregistré sous 25 heures.
