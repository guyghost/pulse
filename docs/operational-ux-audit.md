# Pulse Operational UX Audit

Date: 2026-06-22

Objectif: transformer Pulse en centre de pilotage operationnel. Chaque ecran doit aider l'utilisateur a repondre en moins de 5 secondes a quatre questions: que se passe-t-il, est-ce normal, dois-je agir, quelle est la prochaine action.

## Principes De Decision

- Action d'abord: l'alerte, l'anomalie ou la prochaine action apparait avant les donnees secondaires.
- Donnees guidees par leur forme: statut en badge, tendance en graphique, activite en feed, volumes en heatmap, details en drawer.
- Disclosure progressif: niveau 1 executive, niveau 2 investigation, niveau 3 details techniques.
- Couleurs metier uniquement: succes, attention, incident, critique.
- Pas de tableau par defaut: un tableau n'est accepte que pour comparer ou inspecter des details.

## Composants Operationnels Cibles

- `OperationalStoryCard`: resume narratif d'un etat avec impact, cause probable et action recommandee.
- `OperationalStatusBadge`: statut metier lisible, sans couleur decorative.
- `OperationalEmptyState`: etat vide avec raison, impact et action suivante.
- `AlertBuilderCard`: creation d'alerte centree sur un seuil decisionnel.
- `MissionInvestigationDrawer`: investigation de mission sans quitter le feed.
- `SourceHealthPanel`: sante des connecteurs orientee cause et correction.
- `BackupRestoreModal`: confirmation de sauvegarde/restauration avec impact explicite.
- `MetricsPanel`: diagnostic de session pour les anomalies dev, pas dashboard de compteurs.
- `ToastContainer`: notifications avec confirmation et actions d'annulation.

## 1. Feed

Audit UX:
Le feed etait le plus proche d'un dashboard: beaucoup de missions, de filtres et de compteurs, mais l'utilisateur devait deduire seul quelle mission traiter et si les sources etaient fiables.

Problemes detectes:
- Les missions etaient visibles avant le contexte operationnel.
- Les incidents de connecteur pouvaient etre percus comme des metadonnees.
- Les actions secondaires occupaient trop d'espace mental.
- L'investigation d'une mission demandait de lire toute la carte.

Proposition d'amelioration:
- Ouvrir sur une synthese: meilleur signal, anomalie source, action recommandee.
- Afficher la sante des sources avant les resultats quand elle impacte la confiance.
- Garder les filtres comme outils d'investigation, pas comme premiere information.
- Ouvrir les details dans un drawer pour conserver le contexte du feed.

Wireframe cible:

```text
[Alerte / Story Card: "3 missions urgentes, FreeWork degrade"]
[Sante sources: badges + action recheck]
[Actions rapides: scanner, configurer alertes, voir incidents]
[Feed missions priorise]
  [Mission card: score, raison, action]
  [Mission card]
[Drawer investigation mission: impact, signaux, details techniques]
```

Nouveaux composants necessaires:
- `OperationalStoryCard`
- `SourceHealthPanel`
- `MissionInvestigationDrawer`
- `OperationalEmptyState`

Etats manquants a couvrir:
- Scan en cours avec skeletons contextualises.
- Toutes les sources indisponibles.
- Source partiellement degradee.
- Aucune mission mais connecteurs sains.
- Aucune mission parce que le profil est incomplet.
- Mode offline.
- Undo apres marquage vu/favori.

Parcours optimise:
L'utilisateur ouvre Pulse, lit la story card, verifie si les sources sont fiables, traite la meilleure mission, puis descend dans le drawer uniquement si la decision n'est pas evidente.

## 2. Profil

Audit UX:
Le profil affichait des champs utiles, mais pas assez la consequence operationnelle d'un profil incomplet sur le scoring et les alertes.

Problemes detectes:
- Les champs etaient presentes comme une configuration, pas comme un levier de qualite.
- Les lacunes du profil n'etaient pas priorisees.
- L'utilisateur ne voyait pas clairement quelle modification ameliorait le feed.

Proposition d'amelioration:
- Afficher une story card de qualite du profil: complet, incomplet, risque de matching faible.
- Prioriser les champs qui influencent le score: competences, TJM, remote, localisation.
- Mettre les details secondaires dans des sections expandables.

Wireframe cible:

```text
[Story Card: "Profil exploitable a 72%, competences a completer"]
[Actions recommandees: ajouter 3 competences, fixer TJM cible]
[Formulaire priorise: criteres qui changent le scoring]
[Details avances: preferences, exclusions, notes]
```

Nouveaux composants necessaires:
- `OperationalStoryCard`
- Badges de completion par section.
- Tooltips sur chaque critere qui influence le score.

Etats manquants a couvrir:
- Profil vierge.
- Profil importe mais incomplet.
- Sauvegarde en cours.
- Erreur de validation.
- Offline avec edition locale impossible.
- Confirmation de sauvegarde.

Parcours optimise:
L'utilisateur voit d'abord pourquoi son profil bloque ou ameliore la pertinence, corrige les champs critiques, puis sauvegarde avec confirmation.

## 3. CV

Audit UX:
L'ecran CV montrait la presence ou l'absence de documents, mais ne racontait pas encore assez l'impact sur la candidature.

Problemes detectes:
- Les exports et previews etaient proches visuellement des actions critiques.
- Le chargement etait affiche comme texte brut.
- Les details LinkedIn pouvaient prendre trop de place avant la prochaine action.

Proposition d'amelioration:
- Mettre en avant le prochain blocage: importer, synchroniser, verifier ou generer.
- Afficher un skeleton pendant le bootstrap.
- Separateur clair entre action principale et details techniques.

Wireframe cible:

```text
[Story Card: "CV pret / Donnees LinkedIn a synchroniser"]
[Action principale: importer ou previsualiser]
[Etat document: date, source, fraicheur]
[Details expandables: sections CV, donnees detectees, exports]
```

Nouveaux composants necessaires:
- `OperationalStoryCard`
- `OperationalEmptyState`
- Skeleton de bootstrap.

Etats manquants a couvrir:
- Chargement initial.
- Aucun CV.
- LinkedIn connecte mais non synchronise.
- Import invalide.
- Generation echouee.
- Preview indisponible.

Parcours optimise:
L'utilisateur comprend si son CV est utilisable, lance l'action unique la plus importante, puis inspecte les sections seulement si necessaire.

## 4. Suivi Des Candidatures

Audit UX:
L'ecran suivait les candidatures, mais il devait mieux distinguer pipeline, relance, risque et historique.

Problemes detectes:
- Les statuts etaient lisibles mais manquaient de priorisation.
- Les relances etaient enfouies dans la liste.
- Les etats vides n'expliquaient pas comment creer un premier suivi utile.

Proposition d'amelioration:
- Ouvrir sur les candidatures qui demandent une action.
- Afficher le pipeline comme resume operationnel, puis la liste.
- Transformer les etats vides en action de creation.

Wireframe cible:

```text
[Story Card: "2 relances dues aujourd'hui"]
[Pipeline: A contacter | En cours | Relance | Gagne | Perdu]
[Alertes prioritaires: relance, silence, deadline]
[Liste detaillee / historique]
```

Nouveaux composants necessaires:
- `OperationalStoryCard`
- `OperationalEmptyState`
- Cartes de relance prioritaire.

Etats manquants a couvrir:
- Aucune candidature.
- Relances en retard.
- Candidature sans prochaine action.
- Erreur de sauvegarde.
- Undo apres changement de statut.

Parcours optimise:
L'utilisateur traite les relances dues, met a jour un statut, puis consulte l'historique uniquement pour comprendre une opportunite precise.

## 5. TJM

Audit UX:
Le TJM etait naturellement data-rich, mais le risque etait de montrer des graphiques sans decision claire.

Problemes detectes:
- Les tendances pouvaient etre lues comme decoration.
- Le seuil d'action n'etait pas toujours explicite.
- Les donnees secondaires de marche pouvaient masquer la recommandation.

Proposition d'amelioration:
- Afficher la recommandation de prix avant les courbes.
- Utiliser les graphiques seulement pour justifier la tendance.
- Presenter les ecarts comme opportunites ou risques.

Wireframe cible:

```text
[Story Card: "TJM recommande: 680 EUR, marche en hausse"]
[KPI cards: cible, mediane, ecart, confiance]
[Graphique tendance]
[Segments: role, region, remote]
[Details techniques expandables]
```

Nouveaux composants necessaires:
- `OperationalStoryCard`
- `OperationalEmptyState`
- KPI cards alignees numeriquement.

Etats manquants a couvrir:
- Pas assez d'historique.
- Donnees de marche stale.
- Estimation faible confiance.
- Erreur de chargement.
- Offline.

Parcours optimise:
L'utilisateur voit le TJM cible, comprend si l'ecart est normal, puis ajuste son profil ou filtre le marche.

## 6. Settings

Audit UX:
Les settings etaient une collection de reglages. Pour un centre operationnel, ils doivent expliquer quels reglages ont un impact sur la detection et les alertes.

Problemes detectes:
- Trop de controles avaient le meme poids.
- Les alertes n'etaient pas assez liees a un resultat attendu.
- Les actions dangereuses manquaient d'un impact explicite.
- Les restaurations et suppressions pouvaient etre confirmees trop vite pour des actions qui remplacent ou effacent l'etat local.

Proposition d'amelioration:
- Grouper par resultat: sources, alertes, IA, donnees locales.
- Faire de la creation d'alerte un parcours court: condition, seuil, canal.
- Confirmer restauration et reset avec consequences, prochaine action, et saisie explicite avant execution.

Wireframe cible:

```text
[Story Card: "Pulse scanne toutes les 30 min, 2 alertes actives"]
[AlertBuilder: signal, seuil, action]
[Sources et scan: intervalle, connecteurs, sante]
[IA semantique: quota, cache, disponibilite]
[Donnees locales: backup, restore, reset]
```

Nouveaux composants necessaires:
- `AlertBuilderCard`
- `OperationalStoryCard`
- `BackupRestoreModal`

Etats manquants a couvrir:
- Sauvegarde en cours.
- Restauration invalide.
- Parametre sauvegarde avec erreur.
- Alerte incomplete.
- Undo ou confirmation apres changement sensible.

Parcours optimise:
L'utilisateur comprend d'abord comment Pulse travaille pour lui, ajuste seulement les leviers qui changent le resultat, puis confirme les actions sensibles.

## 7. Diagnostic Dev

Audit UX:
Le panneau de metriques developpeur etait un dashboard brut: scans, durees moyennes, cache hit rate et historiques sans priorite d'action.

Problemes detectes:
- Le raccourci annonce dans le dev panel ne montait pas le panneau complet.
- Le dev panel lui-meme etait une liste de commandes sans expliquer le scenario teste.
- Les metriques etaient listees avant d'expliquer si la session etait normale.
- Les onglets parlaient de donnees techniques, pas d'investigation.

Proposition d'amelioration:
- Monter le panneau de diagnostic complet en dev et l'ouvrir comme niveau d'investigation dedie.
- Transformer le dev panel en centre de controle des scenarios locaux: etat feed, volume, onboarding, cache, logs.
- Ouvrir le diagnostic complet sur une synthese: incident, aucun signal, latence, cache faible ou etat normal.
- Transformer les onglets en parcours: timeline des scans, diagnostic cache, latences a prioriser, experience percue.

Wireframe cible:

```text
[Diagnostic: "Aucun signal / Incident / Normal"]
[Signaux prioritaires: incidents, scans, cache, interface]
[Onglets: Synthese | Scans | Cache | Latences | Web vitals]
[Details: timeline, cause probable, action recommandee]
[DevPanel: scenario local, impact attendu, action de test]
```

Nouveaux composants necessaires:
- Aucun composant durable supplementaire; le panneau reste dev-only.

Etats manquants a couvrir:
- Aucun scan instrumente.
- Incident de scan recent.
- Cache peu efficace.
- Operation lente a profiler.
- Web vitals degradees.

Parcours optimise:
Le developpeur ouvre `Ctrl+Shift+M`, lit si la session est normale, puis descend dans l'onglet qui correspond a l'action recommandee.

## 8. Onboarding

Audit UX:
L'onboarding devait eviter le tutoriel massif et amener rapidement a une premiere valeur observee.

Problemes detectes:
- Le setup pouvait etre percu comme une configuration longue.
- Les etapes ne montraient pas toujours le lien avec le premier insight.
- Le premier lancement devait guider vers une source et une alerte.

Proposition d'amelioration:
- Construire un onboarding progressif en cinq etapes: comprendre, connecter, observer, alerter, recevoir un insight.
- Afficher une seule decision par etape.
- Remplacer les textes generiques par des micro-resultats.

Wireframe cible:

```text
[Etape active: Comprendre Pulse]
[Micro-resultat attendu]
[Action unique]
[Progression 1/5]
[Aide contextuelle discrete]
```

Nouveaux composants necessaires:
- Stepper operationnel.
- `OperationalEmptyState` pour l'absence de source.
- Tooltips contextuels.

Etats manquants a couvrir:
- Connecteur refuse.
- Source connectee mais sans activite.
- Premiere alerte non creee.
- Gemini Nano indisponible.
- Reprise d'onboarding interrompu.

Parcours optimise:
L'utilisateur termine chaque etape avec un signal concret, pas seulement une page lue.

## 9. Landing Dashboard

Audit UX:
Le dashboard landing devait illustrer le produit sans tomber dans une vitrine de metriques statiques.

Problemes detectes:
- Les chiffres seuls pouvaient vendre une promesse vague.
- Les graphes decoratifs ne suffisent pas a expliquer la valeur operationnelle.
- Le lien entre incident, impact et action devait etre plus direct.

Proposition d'amelioration:
- Montrer un exemple d'histoire operationnelle: mission critique detectee, impact, cause probable, action.
- Utiliser les KPI comme preuves secondaires.
- Eviter les cartes inutiles et les couleurs decoratives.
- Remplacer les statistiques marketing brutes par une bande de preuves: signal, consequence, action possible.

Wireframe cible:

```text
[Hero produit: nom + promesse operationnelle]
[Demo dashboard: alerte critique + action]
[Preuves operationnelles: sources, local-first, scoring, credits]
[Workflow: connecter -> observer -> agir]
```

Nouveaux composants necessaires:
- Story card marketing synchronisee avec le produit.
- Badges de statut metier.
- Timeline courte d'activite.

Etats manquants a couvrir:
- Exemple sans donnees.
- Source deconnectee.
- Alerte resolue.
- Insight en attente.

Parcours optimise:
Le visiteur comprend que Pulse n'affiche pas seulement des missions: il detecte ce qui demande une decision.

## 10. Compte Et Credits Landing

Audit UX:
Le dashboard compte authentifie affichait les donnees d'abonnement et les packs de credits, mais l'utilisateur devait encore deduire si une action etait urgente.

Problemes detectes:
- Les credits etaient presentes comme un solde avant d'expliquer le risque de blocage.
- Les packs d'achat avaient trop de poids visuel pour une information de niveau 2.
- L'abonnement, l'extension et les credits n'etaient pas regroupes dans une histoire operationnelle unique.

Proposition d'amelioration:
- Ouvrir sur un diagnostic compte: normal, action utile, risque proche ou blocage.
- Afficher impact et action recommandee avant les details de billing.
- Recommander automatiquement un pack selon le solde et placer les choix dans un drawer.

Wireframe cible:

```text
[Etat operationnel: "Credits bas avant les prochaines candidatures"]
[Impact: generations bientot bloquees]
[Action recommandee: recharger ou ouvrir l'extension]
[Signaux: plan, credits, extension]
[Details expandables: abonnement, packs, billing]
```

Nouveaux composants necessaires:
- Pas de composant partage supplementaire; le dashboard landing reste autonome.

Etats manquants a couvrir:
- Checkout en preparation.
- Checkout annule.
- Paiement recu mais solde en attente de webhook.
- Premium actif sans credits.
- Compte gratuit sans extension connectee.

Parcours optimise:
L'utilisateur connecte comprend en moins de 5 secondes si son compte peut continuer a generer des actions ou s'il doit recharger, passer Premium ou ouvrir l'extension.

## 11. Dashboard Connecte

Audit UX:
Le cockpit web connecte consolidait missions, candidatures, TJM, CV et synchronisation, mais son ouverture commencait encore par des indicateurs. L'utilisateur devait deduire lui-meme si le vrai sujet etait une extension absente, un conflit de sync, une relance, une mission prioritaire ou un CV bloque.

Problemes detectes:
- Les KPI candidatures apparaissaient avant la decision a prendre.
- Les conflits de synchronisation etaient visibles plus bas dans la page, pas comme risque global.
- Les relances et opportunites fraiches n'etaient pas transformees en histoire priorisee.
- Le CV pouvait bloquer la synchronisation sans etre pose comme prochaine action globale.

Proposition d'amelioration:
- Ajouter une story operationnelle en premiere lecture apres le contexte compte.
- Prioriser automatiquement: connexion extension, conflit sync, relance, mission fraiche haut score, CV, puis etat normal.
- Afficher impact, action recommandee et signaux avant les KPI.
- Garder les KPI comme preuves secondaires et non comme point d'entree.

Wireframe cible:

```text
[Etat operationnel: "La synchronisation demande une decision"]
[Impact: donnees incompletes]
[Action recommandee: ouvrir sync et arbitrer]
[Signaux: conflit detecte, fiabilite partielle, action manuelle]
[KPI candidatures]
[Feed / TJM / CV / Sync]
```

Nouveaux composants necessaires:
- Carte story locale au dashboard connecte; peut devenir composant partage si d'autres apps web l'utilisent.

Etats manquants a couvrir:
- Extension non connectee.
- Sync en erreur.
- Conflit en attente.
- Relance prioritaire.
- Mission fraiche a fort score.
- CV non synchronisable.
- Etat normal sans action urgente.

Parcours optimise:
L'utilisateur ouvre le cockpit, lit la story, clique vers la section utile, puis utilise les KPI et listes pour investiguer seulement apres avoir compris l'action prioritaire.

## Parcours Global Optimise

```text
Premier lancement
  -> Onboarding etape 1: comprendre Pulse
  -> Etape 2: connecter une source
  -> Etape 3: observer une premiere activite
  -> Etape 4: creer une alerte
  -> Etape 5: recevoir un insight

Usage quotidien
  -> Feed: story card globale en moins de 5 secondes
  -> Action: traiter mission, relance, source degradee ou profil incomplet
  -> Investigation: drawer ou detail expandable
  -> Confirmation: toast, undo, sauvegarde locale
```

## Definition Of Done UX

- Chaque ecran commence par un etat narratif ou une action prioritaire.
- Les nombres sont alignes et lies a une decision.
- Les couleurs correspondent a un etat metier.
- Les details techniques sont derriere un clic.
- Les etats vides, erreurs, chargements et offline sont explicites.
- Aucune icone interactive n'est sans label accessible.
- Les actions sensibles ont confirmation ou undo.
- Le feed reste l'ecran de pilotage global et preserve son etat entre navigations.
