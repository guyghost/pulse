# Audit communication Pulse

Date : 25 juin 2026  
Surface auditée : extension Chrome MissionPulse, side panel dev mode  
Destination : dossier local `audits/pulse-communication-2026-06-25/`

## Périmètre et preuves

Captures utilisées :

1. `screenshots/01-feed-scan-loading.png` - Feed chargé, haut de page
2. `screenshots/02-feed-scan-action.png` - Feed après action scan, état quasi identique
3. `screenshots/03-feed-empty-state.png` - Feed vide simulé
4. `screenshots/04-feed-error-list-state.png` - Erreur de feed plus bas dans la liste
5. `screenshots/05-feed-mission-list.png` - Liste de missions
6. `screenshots/06-mission-score-details.png` - Détail "Pourquoi ce score ?"
7. `screenshots/07-profile.png` - Profil
8. `screenshots/08-profile-edit.png` - Profil en édition
9. `screenshots/09-cv.png` - CV canonique
10. `screenshots/10-applications.png` - Suivi candidatures
11. `screenshots/11-tjm.png` - Radar TJM
12. `screenshots/12-settings.png` - Réglages, haut de page
13. `screenshots/13-settings-alerts.png` - Réglages, alertes
14. `screenshots/14-onboarding-step-1.png` - Onboarding étape 1
15. `screenshots/15-onboarding-source-step.png` - Onboarding source

Limites : l'état premium verrouillé n'a pas pu être capturé dans le mode dev, car le statut premium est réinitialisé actif au rechargement. Il a été audité à partir du code de `App.svelte`. L'état de scan en cours est trop court en dev pour être capturé de manière fiable ; le message a été audité depuis `ScanProgress.svelte` et les traces du runtime.

## Synthèse

Pulse communique déjà une intention forte : transformer une veille de missions en actions priorisées. Le pattern "situation + preuves + action" est cohérent sur la plupart des écrans et donne un bon socle.

Le problème principal est la concurrence de messages. Beaucoup d'écrans affichent simultanément une promesse produit, un état système, des métriques, une file d'actions, des filtres, des détails de confiance et des CTA. L'utilisateur comprend qu'il existe un système sophistiqué, mais pas toujours ce qu'il doit faire dans les trois prochaines secondes.

Le langage est souvent conceptuel : radar, signal, périmètre courant, insights, canonique, dashboard connecté, bruit utile. Ces termes peuvent être conservés comme vocabulaire interne, mais ils ne doivent pas porter les actions principales. Les actions principales doivent parler du résultat concret : voir les missions prioritaires, compléter les mots-clés, relancer une source, envoyer une relance.

## Recommandations transverses

1. Remplacer le modèle "situation + file + dashboard + métriques" par une hiérarchie stricte : un message principal, une action principale, un détail secondaire repliable.
2. Réserver "radar" à la marque ou aux zones descriptives. Pour les actions, utiliser "missions", "sources", "profil", "alertes", "TJM".
3. Supprimer les doublons de décision. Un écran ne doit pas afficher deux cartes qui disent toutes deux "Décision tarifaire" ou deux états qui se contredisent.
4. Utiliser un dictionnaire produit stable :
   - "Missions prioritaires" plutôt que "alerte" quand on parle du feed.
   - "Filtres rapides" plutôt que "presets métier".
   - "Filtres actuels" plutôt que "périmètre courant".
   - "Score de base" et "analyse locale" plutôt que "scoring sémantique" dans les premiers niveaux.
   - "Missions ignorées" plutôt que "masquées" ou "ignorées" selon le contexte, choisir un seul terme.
5. Corriger les fautes et accents visibles : "décisions", "n'est", "afficher", "répondre", "Prénom", "Développeur", "Sauvegarde...", "détail", "Réduire", "Priorité", "Complétude", "À gagner", "Écart".
6. Ne pas afficher les tooltips clavier en bas de l'écran dans les captures/états normaux si l'utilisateur ne les a pas demandés. Ils ajoutent du bruit visuel.

## Écran : Onboarding

### Communication actuelle

Message perçu : Pulse est un outil de radar qui transforme la veille en décisions, puis demande à la fois de comprendre le produit, choisir une source, créer une alerte et remplir un profil.

Clarté : 4/10.

### Frictions

- Le premier écran a trop d'objectifs : promesse produit, progression 1/5, explication, CTA "Configurer le radar", formulaire profil complet, CTA "Sauvegarder mon profil", CTA "Plus tard".
- Le message "Le premier scan peut tourner avec un profil vide" contredit la présence d'un formulaire complet et d'un bouton sauvegarder.
- Le CTA "Configurer le radar" mène à un choix de source, pas à une configuration complète du radar.
- Les fautes sans accents réduisent fortement la confiance sur un écran de première impression.
- Les étapes sont cliquables mais l'utilisateur ne sait pas si elles sont obligatoires, éducatives ou configurantes.

### Recommandations

À supprimer :
- La phrase philosophique "Le but n'est pas d'afficher plus de missions" du premier viewport.
- Le formulaire complet du premier écran. Le garder pour une étape "Personnaliser les résultats" ou le Profil.
- Les badges "Scan / Score / TJM" si l'espace est contraint ; ils ne changent pas l'action immédiate.

À simplifier :
- Transformer l'onboarding en une séquence d'actions, pas une explication produit.
- Première étape : "Choisissez la première plateforme à scanner."
- Deuxième étape : "Lancez un scan."
- Troisième étape : "Ajoutez 2 critères pour classer les missions."

À reformuler :
- Titre principal : "Configurez votre premier scan"
- Description : "Pulse utilise vos sessions Chrome pour récupérer les missions et afficher celles à traiter en premier."
- CTA : "Choisir une source"
- "Plus tard" : "Passer et voir le feed"
- "Sauvegarder mon profil" : "Enregistrer et voir le feed"

À réorganiser :
- Premier viewport : promesse courte + choix source + CTA.
- Profil : révélation progressive après le premier scan ou via bannière dédiée.
- Alerte : seulement après qu'il existe des missions et un seuil compréhensible.

### Impact attendu

Gain de compréhension immédiat : l'utilisateur sait que la première action est de choisir une source ou voir le feed.  
Réduction de charge cognitive : moins de décisions simultanées.  
Confiance : correction de la langue et clarification du fonctionnement local.  
Complétion : plus de chances de finir l'onboarding car la première étape devient concrète.

## Écran : Feed

### Communication actuelle

Message perçu : Pulse a trouvé des missions, certaines sont prioritaires, mais il faut interpréter plusieurs zones pour savoir par quoi commencer.

Clarté : 6/10.

### Frictions

- Le haut du feed affiche "10 missions", sources, situation, file d'actions, dashboard, distribution, insights, bannière profil, recherche, filtres et presets avant la liste.
- "10 nouvelles missions" et "Traiter 6 missions en alerte" se concurrencent.
- "Passer à la liste" est une action de navigation interne, pas une action métier.
- "Sources 0" dans la carte de situation est ambigu : 0 source cassée, 0 source active ou 0 source ?
- "Score des opportunités", "insights actionnables du périmètre courant" et "Presets métier" demandent une traduction mentale.
- La phrase "2 opportunités dépasse" a un accord incorrect.

### Recommandations

À supprimer :
- Les métriques "Visibles / Favoris / Masquées" du premier viewport quand la carte de situation existe déjà.
- Les insights secondaires dans le premier viewport ; les placer derrière "Voir les détails du tri".
- "File d'actions" si une carte de situation peut porter l'action principale.

À simplifier :
- Une seule carte prioritaire :
  - "6 missions prioritaires à examiner"
  - "Elles dépassent votre seuil 70+."
  - CTA : "Voir les missions prioritaires"
- Une ligne secondaire : "10 nouvelles missions au total · 0 source en erreur".

À reformuler :
- "Situation" -> "À faire maintenant"
- "Traiter 6 missions en alerte" -> "Voir les 6 missions prioritaires"
- "Qualifier 10 missions" -> "Voir les 10 nouvelles missions"
- "Passer à la liste" -> "Aller aux missions"
- "Presets métier" -> "Filtres rapides"
- "périmètre courant" -> "filtres actuels"
- "IA analysée : Analyse absente" -> "Analyse locale inactive"

À réorganiser :
- Premier viewport : titre "Missions à traiter", état source, CTA principal.
- Deuxième niveau : filtres rapides et recherche.
- Troisième niveau : détails de score, distribution, insights.

### Impact attendu

Gain de compréhension : l'utilisateur sait quelle mission traiter en premier.  
Charge cognitive : moins de chiffres à comparer.  
Confiance : les sources et limites deviennent explicites.  
Complétion : meilleur taux de passage vers la liste et vers la qualification.

## Écran : Feed vide et erreur

### Communication actuelle

Message perçu : en haut, le feed attend un premier scan ; plus bas, le feed ne peut pas être synchronisé. Les deux états peuvent coexister.

Clarté : 3/10.

### Frictions

- L'état vide affiche "Dernier scan à l'instant · 10 missions" alors que le feed indique 0 mission.
- L'erreur réelle est située plus bas, après des filtres et la bannière profil. Le haut donne donc une mauvaise explication.
- Le CTA principal du haut propose "Lancer le scan", alors que l'état bas propose "Réessayer".
- Le message technique `[Dev] Simulated error` serait remplacé en production, mais la structure montre que l'erreur brute peut devenir le texte principal.

### Recommandations

À supprimer :
- Les informations de dernier scan quand les missions affichées sont vides à cause d'une erreur.
- La bannière profil quand l'état principal est une erreur de synchronisation.

À simplifier :
- Un seul état prioritaire doit remonter en haut :
  - Erreur de scan > source cassée > aucun résultat > filtres vides.

À reformuler :
- "Le feed ne peut pas être synchronisé" -> "Impossible de récupérer les missions"
- Description : "Les dernières données restent disponibles. Réessayez ou vérifiez vos sources."
- CTA : "Réessayer le scan"
- Second CTA : "Vérifier les sources"

À réorganiser :
- La carte d'erreur doit remplacer la carte "Situation".
- Les filtres et presets doivent être masqués tant qu'il n'y a aucun résultat exploitable.

### Impact attendu

Gain de compréhension : l'utilisateur sait si le problème vient d'un filtre, d'une source ou du réseau.  
Charge cognitive : un seul état système.  
Confiance : pas de contradiction entre "0 mission" et "10 missions".  
Complétion : meilleure récupération après erreur.

## Écran : Liste de missions et score

### Communication actuelle

Message perçu : les missions sont triées par pertinence ; chaque carte propose un score, une recommandation et des actions.

Clarté : 7/10.

### Frictions

- La liste est assez claire, mais le mot "Investigation" au-dessus de la liste donne un ton plus lourd qu'une simple consultation.
- "Investiguer" est vague : ouvrir les détails, analyser, comparer ou préparer une candidature ?
- Les icônes d'action secondaires sont difficiles à comprendre sans tooltip.
- "Pourquoi ce score ?" est bon, mais l'explication peut se terminer par une limite technique : "Score historique conservé sans détail...".
- Les états "Action recommandée", "À comparer", "À qualifier" sont utiles, mais ils peuvent être uniformisés avec les seuils visibles du feed.

### Recommandations

À supprimer :
- "Investigation" comme eyebrow de la liste.
- Les icônes secondaires non essentielles du premier niveau si elles ne sont pas immédiatement identifiables.

À simplifier :
- Afficher trois actions textuelles maximum sur une carte développée : "Ouvrir", "Comparer", "Mettre en suivi".

À reformuler :
- "Missions proposées" -> "Missions à examiner"
- "Investiguer" -> "Voir le détail"
- "Qualifier en priorité" -> "À examiner en premier"
- "Pourquoi ce score ?" peut rester.
- Message limite score : "Le détail complet sera disponible après le prochain scan."

À réorganiser :
- Garder le score et la recommandation visibles.
- Déplacer les actions secondaires dans un menu ou dans le détail ouvert.
- Montrer le statut de candidature seulement si la mission est déjà suivie.

### Impact attendu

Gain de compréhension : le score devient une aide à la décision, pas un objet technique.  
Charge cognitive : moins d'icônes à interpréter.  
Confiance : les limites du score sont exprimées sans jargon.  
Complétion : plus de clics vers détail, suivi ou comparaison.

## Écran : Profil

### Communication actuelle

Message perçu : le profil est presque complet et un champ manquant améliore le scoring.

Clarté : 8/10.

### Frictions

- La page explique bien l'impact, mais "1 élément limite la qualité du radar" reste indirect : il s'agit de la qualité du scoring.
- "Compléter Mots-clés ferait passer le radar à 100%" est grammaticalement dur.
- "Complétude" et "À gagner" sont lisibles pour une équipe produit, moins pour un utilisateur.
- Le mode édition utilise des placeholders pour certains champs importants ; les labels visibles sont plus robustes.

### Recommandations

À supprimer :
- Le mot "radar" dans les messages d'impact profil.

À simplifier :
- Une seule promesse : "Ajoutez des mots-clés pour améliorer les missions proposées."

À reformuler :
- "1 élément limite la qualité du radar" -> "Un champ manque pour mieux classer vos missions"
- "Compléter Mots-clés ferait passer le radar à 100%" -> "Ajouter des mots-clés complète votre profil"
- "À gagner" -> "Gain estimé"
- "Modifier le profil" -> "Modifier mes critères"

À réorganiser :
- Le champ manquant doit être le premier élément actionnable sous la carte, avant les métriques.
- En édition, garder les labels visibles pour prénom, poste, localisation, TJM min/max.

### Impact attendu

Gain de compréhension : l'utilisateur sait quel champ ajouter et pourquoi.  
Charge cognitive : moins de métriques abstraites.  
Confiance : langage plus direct.  
Complétion : meilleure complétion du profil.

## Écran : CV canonique

### Communication actuelle

Message perçu : le CV est prêt à être diffusé, mais le compte est encore en attente.

Clarté : 6/10.

### Frictions

- "En attente de compte" et "Le CV canonique est prêt à être diffusé" créent un doute : puis-je diffuser maintenant ou non ?
- "Homogénéiser le profil partout" est clair comme objectif, mais "CV canonique" demande un effort si l'utilisateur ne connaît pas le concept.
- "Prévisualiser LinkedIn" ne dit pas clairement si l'action lit LinkedIn, génère un aperçu ou prépare une importation.
- "Pousser manuellement" peut inquiéter : l'utilisateur doit comprendre que Pulse copie un bloc et ouvre la plateforme.

### Recommandations

À supprimer :
- Le statut "En attente de compte" du titre si la page reste utilisable localement. Le déplacer dans l'étape dashboard.

À simplifier :
- Dire ce qui est possible maintenant : copier un profil propre vers LinkedIn et plateformes.

À reformuler :
- "CV canonique" -> "Profil de référence"
- "Homogénéiser le profil partout" -> "Préparer le même profil sur toutes vos plateformes"
- "Le CV canonique est prêt à être diffusé" -> "Votre profil de référence est prêt à copier"
- "Prévisualiser LinkedIn" -> "Lire mon profil LinkedIn" ou "Préparer la mise à jour LinkedIn"
- "Pousser" -> "Copier et ouvrir"

À réorganiser :
- Séparer deux états : local prêt / synchronisation compte indisponible.
- Mettre "Compte requis" uniquement sur l'étape dashboard connecté.

### Impact attendu

Gain de compréhension : l'utilisateur sait ce qu'il peut faire sans compte.  
Charge cognitive : moins de contradiction entre local et connecté.  
Confiance : le mode manuel est explicite.  
Complétion : meilleure utilisation de l'outil CV même avant connexion.

## Écran : Suivi candidatures

### Communication actuelle

Message perçu : une relance est due maintenant ; il faut ouvrir le dossier recommandé.

Clarté : 8/10.

### Frictions

- C'est l'écran le plus clair : un état, une échéance, un dossier recommandé.
- "Relance due" mélange anglais et français.
- "Voir la file de suivi" est moins direct que "Voir la relance".
- Beaucoup de cartes métriques apparaissent sous le dossier recommandé ; elles peuvent distraire du dossier à traiter.

### Recommandations

À supprimer :
- Les métriques secondaires du premier viewport si une relance est due. Les garder sous le dossier.

À simplifier :
- Prioriser le dossier recommandé et ses deux actions : ouvrir, reporter la relance.

À reformuler :
- "Relance due" -> "Relance à faire"
- "Voir la file de suivi" -> "Voir la relance"
- "Ouvrir" -> "Ouvrir le dossier"
- "Conversion - Pas encore mesurée" -> masquer tant qu'il n'y a pas de données.

À réorganiser :
- Après la carte prioritaire, afficher directement le dossier recommandé.
- Mettre le résumé pipeline plus bas ou repliable.

### Impact attendu

Gain de compréhension : action immédiate très claire.  
Charge cognitive : l'utilisateur ne compare pas des métriques avant de traiter la relance.  
Confiance : ton plus français et opérationnel.  
Complétion : hausse probable des relances traitées.

## Écran : Radar TJM

### Communication actuelle

Message perçu : l'analyse TJM est prête et peut guider une négociation.

Clarté : 6/10.

### Frictions

- Deux cartes successives ont le même thème "Décision tarifaire". Elles se concurrencent.
- La date ISO `2026-04-01` paraît technique.
- "Le radar TJM peut guider..." est moins utile que la recommandation chiffrée visible dans la deuxième carte.
- "Ajuster mon TJM cible" est clair, mais la page ne dit pas explicitement quelle valeur ajuster.
- "Écart -51€" peut être interprété comme mauvais sans contexte.

### Recommandations

À supprimer :
- Une des deux cartes "Décision tarifaire". Garder la plus actionnable.

À simplifier :
- Message principal : "Votre cible 500-750 €/j est au-dessus de la médiane observée."
- Sous-texte : "Pour rester compétitif, visez 498-612 €/j sur les missions confirmées."

À reformuler :
- "Mis à jour le 2026-04-01" -> "Mis à jour le 1 avr. 2026"
- "Points" -> "Missions analysées"
- "Écart -51€" -> "51 €/j sous votre cible basse" ou "Médiane : 51 €/j sous votre minimum"
- "Ajuster mon TJM cible" -> "Modifier ma fourchette TJM"

À réorganiser :
- En haut : recommandation chiffrée + action profil.
- En dessous : confiance, points, marché bas/médian/haut.
- Détails par seniorité plus bas.

### Impact attendu

Gain de compréhension : le résultat tarifaire devient une recommandation, pas une analyse à interpréter.  
Charge cognitive : moins de cartes concurrentes.  
Confiance : les chiffres sont contextualisés.  
Complétion : meilleure probabilité de modifier le profil TJM.

## Écran : Réglages

### Communication actuelle

Message perçu : la configuration est globalement disponible, mais l'IA locale est limitée.

Clarté : 6/10.

### Frictions

- Le premier message des réglages est une alerte IA, alors que l'utilisateur vient peut-être régler sources, alertes, compte ou données.
- "Le scoring sémantique ne couvre pas toutes les missions" est technique.
- Les sections sont bien regroupées, mais les titres "Radar et cadence", "Signal prioritaire", "Synchronisation" demandent une interprétation.
- Dans la zone Alertes, "bruit utile" est conceptuel.
- "Off" dans une métrique peut sembler brutal ou cassé.

### Recommandations

À supprimer :
- L'alerte IA du premier niveau si l'utilisateur n'a pas demandé l'IA ou si le score de base fonctionne.

À simplifier :
- Le haut des réglages doit dire : "Choisissez ce que Pulse scanne, quand il scanne et quand il vous alerte."

À reformuler :
- "État système" -> "À vérifier"
- "IA locale limitée" -> "Analyse locale inactive"
- "Le scoring sémantique ne couvre pas toutes les missions" -> "Pulse utilise le score de base pour l'instant"
- "Voir les réglages IA" -> "Configurer l'analyse locale"
- "Radar et cadence" -> "Sources et fréquence"
- "Signal prioritaire" -> "Alertes prioritaires"
- "Piloter le bruit utile" -> "Choisir les missions qui méritent une alerte"

À réorganiser :
- Afficher les quatre sections en premier.
- Mettre les alertes système dans chaque section concernée.
- Dans Alertes, commencer par le résultat : "Avec ce réglage, X missions auraient déclenché une alerte."

### Impact attendu

Gain de compréhension : les réglages deviennent une table des matières claire.  
Charge cognitive : moins d'alerte technique au premier regard.  
Confiance : le mode dégradé IA est expliqué sans dramatiser.  
Complétion : réglage plus facile des sources et alertes.

## État premium verrouillé

### Communication actuelle

Message perçu d'après le code : les pages CV, Suivi et TJM sont verrouillées Premium, avec une description de valeur et un CTA "Voir les réglages".

Clarté estimée : 5/10.

### Frictions

- "Premium verrouillé" est centré sur la restriction, pas sur la valeur.
- Le CTA "Voir les réglages" n'indique pas s'il permet d'activer Premium, connecter un compte ou juste consulter des paramètres.
- Les descriptions sont abstraites : "surface", "pipeline", "radar tarifaire".

### Recommandations

À reformuler :
- "CV canonique premium verrouillé" -> "Profil de référence inclus dans Premium"
- "Suivi candidatures premium verrouillé" -> "Suivi des candidatures inclus dans Premium"
- "Radar TJM premium verrouillé" -> "Analyse TJM incluse dans Premium"
- "Voir les réglages" -> "Voir les options Premium" ou "Activer Premium"
- Ajouter un second CTA : "Retour au Feed"

### Impact attendu

Gain de compréhension : l'utilisateur comprend ce qui est payant et pourquoi.  
Confiance : la restriction semble moins punitive.  
Complétion : meilleure conversion vers l'écran approprié, moins de sorties frustrées.

## Actions et libellés prioritaires à changer

| Actuel | Recommandé |
| --- | --- |
| Configurer le radar | Choisir une source |
| Plus tard | Passer et voir le feed |
| Situation | À faire maintenant |
| Voir les 10 missions proposées | Voir les 10 nouvelles missions |
| Traiter 6 missions en alerte | Voir les 6 missions prioritaires |
| Qualifier 10 missions | Voir les 10 nouvelles missions |
| Passer à la liste | Aller aux missions |
| Presets métier | Filtres rapides |
| Périmètre courant | Filtres actuels |
| Investiguer | Voir le détail |
| Modifier le profil | Modifier mes critères |
| Compléter Mots-clés ferait passer le radar à 100% | Ajouter des mots-clés complète votre profil |
| Prévisualiser LinkedIn | Lire mon profil LinkedIn |
| Pousser | Copier et ouvrir |
| Relance due | Relance à faire |
| Ajuster mon TJM cible | Modifier ma fourchette TJM |
| Voir les réglages IA | Configurer l'analyse locale |
| Piloter le bruit utile | Choisir les missions qui méritent une alerte |

## Risques d'accessibilité visibles depuis les captures

- Plusieurs textes sont très petits, notamment les eyebrows, badges, métriques et descriptions secondaires. Risque de lisibilité à 100% de zoom, plus fort en side panel.
- Les boutons icônes de navigation masquent parfois leur libellé visuel. Les aria-labels existent en partie, mais la compréhension visuelle dépend d'icônes.
- Les couleurs orange/vert/bleu portent beaucoup de sens. Il faut s'assurer que chaque état a aussi un texte clair, ce qui est globalement le cas.
- Les tooltips clavier en bas peuvent recouvrir le contenu et gêner la lecture.
- Les états d'erreur doivent être annoncés au niveau prioritaire, pas seulement plus bas dans la page.

Vérifications non couvertes : navigation clavier complète, ordre de focus, lecteurs d'écran, contrastes mesurés, zoom 200%, responsive hors largeur side panel.

## Critère de réussite final

Un nouvel utilisateur peut-il comprendre ce que Pulse fait, ce qu'il peut faire maintenant et pourquoi il devrait continuer, sans explication externe ?

Réponse : pas encore un "oui" immédiat.

Obstacles principaux :

1. L'onboarding demande trop de choses avant d'avoir prouvé la valeur.
2. Le Feed affiche trop de messages et de métriques avant la liste.
3. Les états système peuvent se contredire, notamment vide vs erreur.
4. Le vocabulaire produit est trop conceptuel pour les actions principales.
5. Les fautes visibles dégradent la confiance.
6. Les statuts local, connecté, premium et IA sont parfois mélangés dans le même message.

Pour atteindre un oui immédiat :

1. Premier lancement : "Choisissez une source, Pulse scanne, puis classe les missions à traiter."
2. Feed : une seule carte "À faire maintenant" avec un CTA métier.
3. Profil : une seule priorité de complétion, exprimée en résultat.
4. États système : un état prioritaire unique, toujours en haut.
5. Réglages : table des matières d'abord, alertes techniques dans les sections concernées.
6. Dictionnaire produit stable et correction complète des textes français.
