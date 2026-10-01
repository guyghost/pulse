# Échantillon TJM local identifiable

## Données et compatibilité

`TJMHistory.records` conserve le format historique : moyennes par technologie, date,
expérience et région. Une annonce multi-stack peut contribuer à plusieurs agrégats ;
`sampleCount` ne représente donc jamais un dénominateur d’annonces uniques transversal.
Les fonctions historiques et les consommateurs Copilot continuent à lire ces agrégats.

`TJMHistory.observations`, facultatif pour lire les anciennes installations, conserve
les instantanés d’annonces avec identité, date observée, source, technologies, TJM,
catégorie métier, expérience, région et mode de travail. Les agrégats historiques ne
sont jamais convertis en annonces fictives. `addRecords` conserve les observations.
Le stockage valide chaque entrée ; les champs région/expérience historiques absents
migrent vers `null`. Les observations incorrectes sont ignorées individuellement.

L’identité est la source + URL d’annonce normalisée (fragment et paramètres de suivi
retirés, paramètres métier conservés). Sans URL valide, elle utilise l’identifiant
externe ou local. Les comptes locaux et les préfixes de scan ne multiplient pas les
annonces dont l’URL est identique. Les publications sur deux plateformes restent deux
annonces : aucune équivalence interplateforme n’est inventée.

## Observations et fraîcheur

La date observée est `mission.scrapedAt`, conservée telle quelle lors de l’extraction.
À l’ouverture, le worker lit l’historique et les missions déjà présentes en IndexedDB,
puis les combine en mémoire : le premier échantillon est disponible sans nouveau scan,
sans antidater ou rafraîchir artificiellement une observation. Cette lecture n’écrit pas
l’historique. Une publication autrefois éliminée avant sa persistance n’est pas
reconstructible à partir de la mission gagnante ou des moyennes : le bootstrap utilise
uniquement les publications réellement disponibles, avec leurs propres dimensions.
Les dates invalides et futures n’entrent pas dans les statistiques.

Après un scan, `persistPostCommitEffects` enregistre les agrégats à partir des
gagnantes du feed (`result.missions`) et les observations à partir de toutes les
annonces source éligibles (`result.sourceMissions`), y compris celles écartées par la
déduplication heuristique du feed et celles sans TJM ou technologie. La déduplication
source + URL appartient uniquement au calcul TJM et ne doit pas hériter des fusions
interplateformes du feed. Une collecte commune et des collectes séparées des mêmes
publications produisent donc la même population identifiable. Cet effet reste non bloquant pour le
commit du scan. Les écritures successives sont sérialisées pour éviter la perte d’un
lot en cas de concurrence. Deux instantanés d’une même identité/date sont remplacés,
les autres dates restent disponibles. Aucune purge automatique n’est introduite.

## Population et statistiques

1. Fenêtre glissante de 7 ou 30 jours jusqu’à `now` inclus, ou toutes les dates passées.
2. Dernier instantané dans cette fenêtre par identité d’annonce.
3. Intersection des technologies du profil (au moins une correspondance), région,
   métier, expérience et mode de travail explicitement sélectionnés.
4. Statistiques sur la population ainsi obtenue : total, tarifs renseignés, sans TJM,
   minimum/maximum et médiane véritable des valeurs `mission.tjm` positives et finies.

Pour un effectif pair, la médiane est la moyenne des deux valeurs centrales, sans
arrondi statistique. Un groupe sans tarif a une plage `null`, jamais une médiane zéro
ou une extrapolation depuis une autre population. Les groupes d’expérience gardent
leurs étiquettes réelles, sans imposer d’ordre aux médianes.

Le métier utilise seulement `mission.classification?.category` déjà renseigné ; aucune
classification cloud n’est déclenchée. Le mode utilise seulement `mission.remote`,
jamais `remoteCompatible`. L’absence d’information reste `null`, comptée et filtrable
via `unknown`, et est exclue des segments précis. La région utilise la localisation,
indépendamment du télétravail (une annonce à Lyon peut être en télétravail complet).
Une localisation absente est inconnue ; une localisation présente non reconnue est
« Autre ». L’option historique « Télétravail complet » reste proposée pour les
localisations qui nomment le télétravail sans région géographique.

## Interface et limites

Le contexte affiche période, région, métier, expérience, mode et technologies du
profil, avec fraîcheur des observations retenues. Près de la médiane figurent les
annonces uniques, avec/sans TJM, composition par source et dimensions absentes.
Le TJM observé peut être le minimum d’une fourchette annoncée ; ce n’est pas un tarif
négocié et l’échantillon local ne représente pas tout le marché.

Le détail historique est séparé, explicitement hors segmentation (toutes régions et
périodes), et nommé « agrégé ancien ». Sa série conserve les moyennes pondérées par
`sampleCount` de l’ancien format et ne nourrit aucun indicateur de l’échantillon.
Un échec de lecture produit une erreur avec nouvelle tentative ; une population vide
produit un état vide sans repli global. Les filtres sont éphémères et réinitialisés à
la réactivation de la page. Une réponse tardive ne remplace pas une sélection récente.
