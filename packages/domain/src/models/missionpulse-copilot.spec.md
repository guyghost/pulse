# Spec : MissionPulse Copilot Premium

## Objectif

Construire un copilote Premium optionnel (_opt-in_) pour les candidatures des
freelances francophones. La première tranche verticale produit un dossier de
candidature durable et révisable pour une mission normalisée, et peut préparer
un pitch, un message recruteur, un résumé de CV ou un brief de négociation TJM.

L'extension gratuite reste _local-first_. Le scraping, le scoring déterministe
et Gemini Nano ne sont pas remplacés. Le cloud ne reçoit que les champs
explicitement sélectionnés par l'utilisateur. Un LLM peut renvoyer des signaux
structurés ou un brouillon de contenu ; il n'octroie jamais Premium, ne consomme
pas de crédits, n'approuve pas d'artefact et ne modifie pas de statut de
candidature.

Le plan produit a été approuvé par l'utilisateur le 2026-07-21. Ce document
consigne les hypothèses d'implémentation qui rendent le plan approuvé
exécutable :

1. Le chemin adossé à Eve est désactivé par défaut et constitue un pilote
   interne jusqu'à la vérification des contrôles de rétention / suppression et
   d'autorisation.
2. La session initiale de l'extension est liée via un flux d'authentification
   navigateur. Son bearer est conservé dans `chrome.storage.session`, jamais
   dans le stockage local durable.
3. L'API revalide l'utilisateur, l'entitlement Premium, la propriété de la
   requête et le solde de crédits sur chaque requête privilégiée. Un instantané
   mis en cache dans l'extension sert uniquement à l'affichage.
4. L'analyse est incluse dans Premium. Chaque brouillon ou brief TJM demandé
   consomme exactement un crédit.
5. La V1 fonctionne uniquement en mode proposition et confirmation. Elle n'envoie
   jamais de message, ne modifie pas de CV, ne change pas de statut pipeline et
   ne planifie aucune action externe.
6. Les artefacts générés sont des `draftSegments` ordonnés ; chaque segment
   porte un ou plusieurs `sourceRefs` typés. Les références d'expérience ne se
   résolvent que vers des preuves explicitement sélectionnées. Les références
   TJM ne se résolvent que vers des identifiants canoniques de faits locaux
   déterministes. Aucun brouillon libre indépendant n'est accepté d'un
   fournisseur.
7. Le serveur assemble le texte copiable à partir de segments validés. Le contrat
   fournisseur ne contient aucun résumé libre ; affirmations factuelles, écarts,
   risques, questions, faits, inférences et recommandations restent des
   projections distinctes.
8. Le consentement du dossier est une union cumulative monotone. L'utilisateur
   peut l'étendre explicitement uniquement lorsque le dossier est prêt, tandis
   que chaque job stocke et valide le sous-ensemble exact sélectionné pour cette
   opération. Le consentement historique n'autorise jamais la transmission d'un
   champ omis du job courant. Le retrait du consentement cumulatif exige la
   suppression confirmée du dossier.
9. Le pilote interne admet au plus 10 jobs d'analyse et 20 jobs au total par
   utilisateur et par jour UTC. Le créneau d'admission est sérialisé par
   utilisateur et n'est consommé que par une clé d'idempotence nouvellement
   persistée ; une nouvelle tentative canonique ne consomme aucun créneau
   supplémentaire. Le dépassement de l'une ou l'autre borne renvoie
   `RATE_LIMITED` avant tout effet sur le crédit ou le fournisseur.
10. Une session Eve n'est éligible à la continuation qu'après acceptation de son
    résultat par l'utilisateur. Sa réclamation pour le job suivant la rend
    atomiquement inéligible ; le rejet, une sortie invalide, l'annulation ou
    l'échec retirent ce contexte.

## Stack technique

- Contrats déterministes partagés et machines XState v5 : `@pulse/domain`.
- Client Chrome MV3 : Svelte 5, orchestration service worker via bridge
  uniquement.
- API MissionPulse : SvelteKit sur Vercel avec authentification / facturation
  Supabase.
- Fournisseur d'agent : Eve derrière un port fournisseur remplaçable réservé au
  serveur.
- Validation à l'exécution : Zod à chaque frontière extension / API /
  fournisseur.

## Commandes

- Modèles partagés : `pnpm --filter @pulse/domain test && pnpm --filter @pulse/domain typecheck`
- Landing : `pnpm --filter @pulse/landing test && pnpm --filter @pulse/landing typecheck`
- Extension : `pnpm --filter @pulse/extension test && pnpm --filter @pulse/extension typecheck`
- Builds : `pnpm --filter @pulse/ui build && pnpm --filter @pulse/landing build && pnpm --filter @pulse/extension build`
- Formatage : `pnpm exec prettier --check <touched files>`
- Lint extension : `pnpm --filter @pulse/extension exec eslint <touched extension files>`

## Structure du projet

- `packages/domain/src/models/` : machines à états et contrats faisant autorité.
- `apps/landing/agent/` : instructions de l'agent Eve, outils intégrés
  explicitement désactivés et contrat de sortie structurée.
- `apps/landing/src/lib/server/copilot/` : authentification, entitlement,
  orchestration, idempotence de crédit et port fournisseur.
- `apps/landing/src/routes/api/copilot/` : API exposée à l'extension uniquement.
- `apps/extension/src/lib/core/copilot/` : logique pure de consentement et de
  présentation.
- `apps/extension/src/lib/shell/copilot/` : authentification limitée à la
  session, transport API et projection locale durable.
- `apps/extension/src/lib/shell/messaging/bridge.ts` : unique frontière entre
  side panel et service worker.
- `apps/extension/src/ui/` : UI de révision et de consentement ; aucune
  transition métier.

## Style de code

Le modèle décide ; les shells asynchrones exécutent uniquement les commandes et
renvoient les faits corrélés :

```ts
const decision = decideCopilotAdmission(snapshot, request);
if (decision.kind !== 'accepted') return decision;

const providerResult = await provider.run(decision.providerInput);
actor.send({ type: 'PROVIDER_COMPLETED', jobId: request.jobId, providerResult });
```

Aucun texte libre du fournisseur n'est utilisé comme nom d'événement, statut ou
transition.

## Stratégie de test

- Les tests de modèles énumèrent les transitions autorisées et interdites, les
  corrélations périmées, les relances, l'annulation, l'expiration, la révocation
  et les états terminaux.
- Les tests de contrats purs rejettent les entrées surdimensionnées / non
  fiables et les preuves inventées.
- Les tests d'API couvrent les cas non authentifié, non Premium, mauvais
  propriétaire, crédit insuffisant, requête dupliquée, échec fournisseur et
  remboursement exactement une fois.
- Les tests Shell couvrent le redémarrage MV3 et la perte du jeton de session
  sans octroyer d'accès.
- Les tests E2E couvrent consentement -> dossier -> brouillon -> révision / copie
  -> réouverture.
- Les descriptions de mission adverses synthétiques sont traitées comme des
  données et ne peuvent ni modifier les instructions ni fabriquer d'expérience
  candidat.

## Frontières

### Toujours

- Valider l'authentification et la propriété côté serveur.
- N'exposer aucun privilège direct `anon` ou `authenticated` sur les tables de
  persistance Copilot. Les clients navigateur / extension utilisent uniquement
  l'API MissionPulse limitée au propriétaire ; les RPC `service-role` restent
  réservées au serveur et revérifient les corrélations `userId`.
- Conserver Eve et les identifiants fournisseur côté serveur uniquement.
- Persister les clés de corrélation / d'idempotence avant tout travail
  fournisseur payant.
- Ne reprendre que les phases durables antérieures à l'envoi. Dès qu'un envoi
  fournisseur a pu avoir lieu, une complétion durable manquante devient
  `uncertain` et exige une réconciliation opérateur ; elle n'est jamais rejouée
  ni remboursée à l'aveugle.
- Étiqueter chaque affirmation inférée et lier les affirmations d'expérience aux
  preuves fournies.
- Restituer la provenance exacte de chaque segment d'artefact à partir des
  références sources typées.
- Exiger un événement utilisateur explicite pour approuver / copier ou
  déclencher toute transition de candidature existante.

### Demander d'abord

- Activer publiquement le pilote.
- Modifier les tarifs ou les dotations mensuelles de crédits.
- Envoyer des e-mails / messages, modifier des CV ou ajouter des sources de
  données tierces.
- Étendre les champs de profil transmis ou la durée de rétention.

### Jamais

- Envoyer de cookies, sessions de plateforme, HTML brut ou CV complet à Eve.
- Laisser l'état Premium local de l'extension autoriser une requête payante.
- Laisser un LLM consommer / rembourser des crédits ou muter le pipeline de
  candidature.
- Envoyer automatiquement une candidature ou une relance.

## Critères de succès

1. Les trois machines faisant autorité compilent et leurs suites de transitions
   passent.
2. Un client non lié / gratuit / expiré / révoqué échoue de manière fermée
   (_fail closed_).
3. Un utilisateur Premium peut consentir aux champs, créer / rouvrir un dossier
   par mission, lancer l'analyse incluse et demander des brouillons à un crédit.
4. La sortie du fournisseur est validée par schéma avant d'atteindre la
   révision.
5. Une requête de job dupliquée ne peut pas facturer deux fois et un job payant
   échoué rembourse ni plus ni moins d'une fois.
6. La fermeture / réouverture du panneau restaure la projection locale du
   dossier ; un redémarrage du worker MV3 reprend via les handles persistés de
   job / session.
7. Le pilote reste désactivé tant que le drapeau de release et la configuration
   serveur ne sont pas tous deux présents.
8. La reprise de doublon règle `reserving` et `refunding` via des RPC de
   registre idempotentes, ne reprend `queued` qu'avant l'envoi fournisseur, et
   gèle tout tour fournisseur potentiellement envoyé en `uncertain` lorsque Eve
   ne peut pas le consulter.
9. Une nouvelle tentative utilisateur après un échec terminal crée un nouveau
   job, une nouvelle tentative, une nouvelle clé d'idempotence et une nouvelle
   clé de facturation après reconfirmation du consentement ; elle ne rouvre
   jamais un job remboursé.
10. L'historique approuvé du dossier est renvoyé intégralement jusqu'à sa borne
    explicite de 512 artefacts ; la demande d'artefact suivante est refusée
    avant facturation ou envoi fournisseur plutôt que de tronquer l'historique.

## Jalons ouverts pour la production

- Vérifier et publier le comportement de rétention / suppression des sessions
  Eve.
- Réaliser une revue de sécurité d'autorisation / isolation avec deux
  utilisateurs synthétiques.
- Mettre en cohérence la copy publique du tarif Premium dans un changement
  séparé.
- Définir les budgets opérationnels de latence et de coût avant le déploiement
  public.
- Provisionner et vérifier le domaine API sans cookie `copilot.missionpulse.app`
  sur le même projet Vercel que la topologie sœur SvelteKit / Eve revue.
