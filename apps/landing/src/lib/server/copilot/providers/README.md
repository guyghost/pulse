# Frontière fournisseur Eve

Ce fournisseur utilise Eve 0.37.1 uniquement via son client serveur public. `start()` consomme
`sessions.create()/attach().send().result()` et retourne un résultat final validé par schéma ;
aucun flux d'événements ne traverse le port du fournisseur. Chaque tour a une échéance validée
(60 secondes par défaut, 1–120 secondes autorisées). Un timeout est un résultat fournisseur
incertain et doit être réconcilié avant tout retry ou mutation de crédit.

La réponse d'annulation d'Eve confirme seulement qu'une annulation coopérative a été acceptée. Le
fournisseur retourne donc `running`, jamais un état terminal `cancelled` fabriqué.

Eve 0.37.1 n'expose ni API publique de lookup de job durable ni API publique de suppression de
session. `get()` et `deleteSession()` échouent donc avec des erreurs typées unsupported au lieu
d'inventer un succès. La réconciliation durable et un mécanisme de rétention/suppression révisé
restent des gates de production pour le pilote.

Le plugin SvelteKit d'Eve ne mute plus la topologie de déploiement (son option `configureVercelJson`
a été retirée en 0.37). La topologie révisée est commitée explicitement dans
`apps/landing/vercel.json` : SvelteKit et Eve sont des services frères et `/eve/v1/**` est réécrit
vers le préfixe de service privé d'Eve. `MISSIONPULSE_EVE_BASE_URL` reste un override de production
explicite ; le développement local accepte aussi le `EVE_BASE_URL` injecté par le plugin SvelteKit
officiel.

L'API exposée à l'extension utilise le domaine personnalisé sans cookie `copilot.missionpulse.app`
tandis que le lien de compte reste sur `missionpulse.app`. Les deux domaines doivent cibler ce
projet SvelteKit dans Vercel. Le DNS et l'attachement des domaines personnalisés sont des
prérequis de déploiement et ne peuvent pas être établis depuis ce dépôt.

Le canal HTTP canonique d'Eve n'accepte en déploiement que l'identité de service Vercel OIDC et,
en loopback, l'identité de développement local du framework. Il n'active pas le CORS navigateur :
l'extension Chrome ne peut donc pas appeler Eve directement.
