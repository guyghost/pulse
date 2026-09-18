# Politique de sécurité

MissionPulse est une extension navigateur qui lit les sessions locales du navigateur pour les plateformes freelance supportées. Merci de signaler les problèmes de sécurité en privé.

## Versions supportées

Les correctifs de sécurité ciblent la branche `main` courante et la dernière release taguée.

## Signaler une vulnérabilité

Ouvrez un GitHub security advisory privé pour ce dépôt, ou contactez les mainteneurs via l'adresse indiquée sur le profil public du projet.

Merci d'inclure :

- La version ou le commit affecté.
- Des étapes de reproduction claires.
- L'impact et le périmètre d'exposition des données.
- Si des secrets, cookies ou tokens de session sont impliqués.

N'ouvrez pas d'issue publique pour une vulnérabilité non corrigée.

## Attentes de sécurité

- Aucun identifiant ni token de session plateforme n'est stocké dans le dépôt.
- Les fichiers locaux `.env` et `.env.local` sont ignorés par git.
- Les cookies navigateur ne sont utilisés que via les API d'extension Chrome pour les connecteurs supportés.
- Le cœur de l'extension doit rester pur et testable, avec l'I/O isolée dans la couche shell.
