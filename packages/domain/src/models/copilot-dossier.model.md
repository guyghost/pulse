# Modèle de dossier Copilot

## Objectif

Représenter le cycle de vie contrôlé par l'utilisateur d'un dossier Premium par
mission. Le dossier stocke le consentement, les handles Eve durables, l'analyse
validée et les artefacts explicitement révisés. Il ne constitue pas le pipeline
de candidature.

## États

```text
empty -- CONSENT_STARTED --> consenting
consenting -- CONSENT_CONFIRMED --> ready
consenting -- CONSENT_CANCELLED --> empty
ready -- CONSENT_UPDATED (monotonic expansion) --> ready
ready -- ANALYSIS_REQUESTED --> processing
processing -- JOB_REVIEW_READY --> reviewing
processing -- JOB_FAILED --> ready
reviewing -- ANALYSIS_APPROVED --> ready
reviewing -- ANALYSIS_REJECTED --> ready
reviewing -- ARTIFACT_APPROVED --> ready
reviewing -- ARTIFACT_REJECTED --> ready
ready -- DELETE_REQUESTED --> deleting
deleting -- DELETE_CONFIRMED --> deleted
deleting -- DELETE_FAILED --> deletionFailed
deletionFailed -- DELETE_RETRIED --> deleting
```

La génération de suivi démarre depuis `ready` et ne peut réutiliser que la
session Eve dont l'utilisateur a explicitement accepté le résultat précédent. La
continuation est consommée atomiquement avant l'envoi. Un échec, une sortie
invalide ou un rejet la retire ; chaque handle connu demeure une obligation de
suppression.

La nouvelle tentative après échec suit la même admission explicite
`ready -> processing` que toute autre génération. Elle exige une nouvelle
confirmation de consentement et une nouvelle identité de job ; le job échoué et
sa réservation réglée ne sont jamais rouverts.

## Données consenties

- Mission : titre, description, client, stack, lieu, mode de travail, durée,
  date de démarrage et TJM affiché, chacun consenti individuellement.
- Profil : intitulé de poste, séniorité, localisation, mots-clés / stack, bornes
  TJM et uniquement les preuves d'expérience explicitement sélectionnées.
- Jamais : cookies, sessions de plateforme, HTML brut, données cachées de page
  ni CV complet.

## Projection de lecture publique

Le propriétaire authentifié peut lire une projection de dossier sans effet de
bord même lorsque Premium a expiré, que l'accès a été révoqué ou que le
déploiement (_rollout_) a été retiré. Cette lecture de récupération ne reprend
jamais de travail de réservation, fournisseur, remboursement ou révision. Elle
contient uniquement :

- `missionId` et l'état borné du dossier ;
- les identifiants de consentement cumulatifs nécessaires pour valider les
  références de preuves d'analyse approuvées ;
- l'analyse explicitement approuvée, le cas échéant ;
- les brouillons d'artefacts explicitement approuvés et leur type / horodatages
  bornés ;
- la corrélation du job actif (`jobId`, type et état), s'il en existe un.

Elle ne contient jamais de payloads d'entrée, de résultats non approuvés, de
handles fournisseur / session, de jetons de continuation, de détails internes de
suppression ni d'erreurs techniques libres. Le contenu approuvé reste visible
d'un job à l'autre et après un redémarrage du panneau ou du navigateur jusqu'à
la suppression confirmée du dossier. La projection est purement observationnelle
et ne peut d'elle-même autoriser une annulation, révision, suppression ou
transition de pipeline.

## Invariants

1. Aucun job distant ne démarre avant `CONSENT_CONFIRMED`.
2. Les champs transmis sont un sous-ensemble à la fois de la liste d'autorisation
   (_allowlist_) et de l'ensemble consenti. Le consentement ne peut s'étendre
   que via un événement explicite dans l'état `ready` ; tout retrait exige une
   suppression confirmée et un nouveau dossier. Chaque job persiste l'instantané
   exact de consentement utilisé pour valider son payload transmis.
3. Une affirmation d'expérience doit référencer un identifiant de preuve fourni ;
   une preuve absente est rendue comme un écart / question, jamais comme une
   expérience inventée. Chaque artefact généré est une liste ordonnée de
   segments ancrés. Un segment possède des références sources typées non vides :
   `{kind:'experience', id}`, `{kind:'mission-field', id}`,
   `{kind:'profile-field', id}` ou, pour le TJM uniquement,
   `{kind:'tjm-fact', id}`. Chaque référence est liée à une source autorisée et
   consentie ainsi qu'à un extrait justificatif exact. Les références TJM sont en
   outre restreintes aux identifiants canoniques de faits dérivés de l'objet de
   fait déterministe validé. Les artefacts pitch, message et résumé de CV doivent
   référencer au moins une expérience sélectionnée au total. Les fournisseurs ne
   peuvent pas émettre un brouillon libre séparé ; MissionPulse assemble le
   brouillon copiable uniquement à partir de segments validés.
4. Les handles et résultats Eve sont limités à un dossier `userId + missionId`.
   Au plus un handle est éligible à la continuation, et uniquement après
   acceptation.
5. Seuls les résultats valides selon le schéma entrent en `reviewing`.
6. Seuls les événements utilisateur explicites ajoutent un artefact approuvé.
7. La suppression est interdite pendant qu'un job est en cours de traitement ou
   en attente de révision. Le job doit d'abord revenir à `ready`, afin qu'aucune
   réservation ni disposition fournisseur ne puisse être effacée par une cascade.
8. La suppression n'est terminale qu'après confirmation des obligations de
   suppression / rétention à la fois des enregistrements MissionPulse et de la
   session Eve configurée.
9. Les événements de dossier ne modifient jamais directement
   `MissionTracking.currentStatus`.
10. `JOB_FAILED` / l'annulation gratuite est projetée atomiquement avec l'état
    terminal correspondant du job. Le dossier ne peut pas devenir `ready` avant
    que le job soit terminal, et un job terminal sans crédit ne peut pas laisser
    le dossier bloqué en `processing` après une réponse perdue.
11. Chaque handle Eve conservé possède une preuve atomique de disposition par
    job. Son job actif est contraint par le même `userId + dossierId` ; la
    suppression n'infère jamais une preuve à partir d'un handle actuellement
    réassocié à un autre job.
12. La persistance reflète `activeJob.jobId` sur le dossier. L'entrée en
    `processing` le définit ; `reviewing` le conserve ; seule la transaction
    correspondante de révision, remboursement ou terminal sans crédit l'efface
    tout en revenant à `ready`. Tous les états `ready` / `deleting` exigent
    qu'il soit nul.
13. L'extension du consentement valide la sélection cumulative après union, y
    compris chaque borne de collection. Une extension rejetée laisse inchangés
    le consentement persisté et le contexte modélisé ; les extensions
    concurrentes se sérialisent sur la ligne du dossier et ne peuvent pas
    dépasser conjointement une borne.
14. Chaque session Eve porte une disposition durable de suppression :
    `pending | uncertain | deleted | retention-confirmed`. La suppression prouve
    d'abord que chaque job envoyé possède un handle connu, puis réclame
    atomiquement une obligation `pending` comme `uncertain` avant d'invoquer
    Eve. Une disposition confirmée n'est jamais rejouée. `uncertain` exige une
    consultation fournisseur ou une réconciliation opérateur et n'est jamais
    relancée par une suppression à l'aveugle. La reprise peut réhydrater un
    dossier durable `deleting` après perte de processus et poursuivre uniquement
    les obligations encore marquées `pending`.
15. La suppression locale n'est validée qu'après confirmation de toutes les
    dispositions de session. Elle crée atomiquement des reçus d'idempotence sans
    payload pour chaque job retiré et supprime exactement un dossier `deleting`.
    Une suppression de zéro ligne ou tout échec de persistance après un effet
    Eve fait passer le dossier survivant en `deletionFailed` ; l'API ne signale
    jamais `deleted` sans cette validation.
16. L'admission quotidienne au pilote est comptée dans un registre utilisateur /
    jour qui ne se supprime pas en cascade avec les dossiers. Supprimer un
    dossier ne peut pas restaurer le quota. Les relances idempotentes et les
    reçus durables de jobs supprimés sont vérifiés avant l'incrément du
    registre.
17. Les reçus de jobs supprimés ne contiennent aucun payload de dossier et
    expirent après 90 jours. L'expiration est appliquée par suppression
    physique, pas seulement par filtrage de requête : une purge bornée réservée
    au `service-role` s'exécute de manière opportuniste au rejeu / admission et
    est drainée par une tâche quotidienne authentifiée de maintenance. L'objectif
    opérationnel de suppression est de 25 heures après expiration et doit être
    surveillé avant toute publication d'une garantie publique de rétention.
18. La projection de lecture publique réservée au propriétaire est sans effet de
    bord et reste disponible pour récupération sans Premium actif. Elle inclut
    chaque analyse / artefact approuvé, pas seulement le dernier point de
    contrôle de job, et n'expose aucun handle Eve ni contenu généré non
    approuvé.
19. Un échec relançable est terminal pour son job. Une nouvelle tentative
    utilisateur crée un nouveau job avec de nouvelles identités de tentative,
    d'idempotence et de facturation, et peut consommer un nouveau crédit. Le
    rejeu de transport canonique de l'ancien job reste idempotent et n'est
    jamais présenté comme une nouvelle génération.
20. Les tables Copilot et les RPC `service-role` ne constituent pas une API
    navigateur : `anon` et `authenticated` n'ont aucun privilège direct sur les
    tables. La projection publique réservée au propriétaire est servie
    exclusivement par l'API MissionPulse après vérification du bearer et
    recherche explicite sur `userId + missionId`.
21. Un dossier conserve au maximum 512 artefacts approuvés. L'admission rejette
    un nouveau job d'artefact avant tout effet sur le quota, le crédit ou le
    fournisseur lorsque cette borne est atteinte ; l'analyse reste disponible.
    La machine, la contrainte en base de données et la projection publique
    appliquent la même borne, afin que la réouverture ne tronque jamais
    silencieusement le contenu précédemment approuvé.

## Couverture de revue

- Confirmation / annulation du consentement, extension monotone, retrait
  interdit et mises à jour interdites pendant `processing` / `reviewing`.
- Instructions de mission malveillantes, descriptions surdimensionnées et champs
  inconnus.
- Analyse valide, références de preuves invalides / fabriquées et échec
  fournisseur.
- Segments d'artefact avec références sources manquantes, mixtes, inconnues ou
  fabriquées.
- Faits TJM, ancre inférée et recommandations rendus en couches distinctes.
- Approbation / rejet utilisateur, brouillons multiples et réouverture après
  redémarrage du panneau ou du worker.
- Échec / relance de suppression et isolation utilisateur / session.
- Suppression partielle Eve, disposition pré-vérification inconnue, suppression
  de relance de session confirmée, suppression locale de zéro ligne et refus
  de rejeu durable d'un job supprimé.
- Unions de consentement séquentielles et concurrentes aux bornes maximales de
  collection.
- Suppression de dossier suivie de relances de quota et d'idempotence le même
  jour.
- Échec relançable suivi d'un nouveau job consenti ; l'ancienne identité de
  facturation remboursée ne peut pas financer la nouvelle exécution fournisseur.
- Les lectures et écritures directes `anon` / `authenticated` sur les tables
  sont refusées même lorsqu'un appelant devine un identifiant valide de dossier
  ou de job.
- Admission d'artefact à 511/512 éléments conservés et tableau persisté malformé
  au-dessus de la borne.
- Expiration de reçu suivie d'une suppression physique des lignes via les chemins
  opportuniste et planifié de maintenance.
- L'analyse approuvée ainsi que plusieurs brouillons approuvés survivent à un
  job ultérieur et à un redémarrage du panneau latéral ou du navigateur via la
  projection de dossier réservée au propriétaire.
