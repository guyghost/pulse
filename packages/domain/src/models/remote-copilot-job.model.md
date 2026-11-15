# Modèle de job Copilot distant

## Objectif

Coordonner une opération Copilot gérée par le serveur. L'analyse coûte zéro
crédit ; `pitch`, `cover-message`, `cv-summary` et `tjm-coach` coûtent un
crédit.

## États

```text
idle -> authorizing -> reserving? -> queued -> running -> validating -> review
review -- USER_ACCEPTED --> accepted
review -- USER_REJECTED --> rejected

authorizing -> failed                 refus auth / entitlement / propriété
reserving -> failed                   crédit insuffisant ou échec de réservation
queued|running|validating -> failed   échec fournisseur / schéma (job gratuit)
queued|running|validating -> refunding -> failed   échec payant
queued|running -> cancelling -> cancelled          annulation gratuite
queued|running -> cancelling -> refunding -> cancelled  annulation payante
```

Une tentative échouée est terminale. Une nouvelle tentative explicite de
l'utilisateur démarre un nouveau job logique depuis l'état `ready` du dossier avec
un nouvel identifiant `jobId`, `attemptId`, une nouvelle clé d'idempotence et
une nouvelle clé de facturation. Elle reçoit donc un nouveau créneau de quota et,
pour le contenu payant, une nouvelle réservation de crédit. La reprise de
transport du job initial est limitée à ses RPC idempotentes canoniques et ne
constitue pas une nouvelle tentative utilisateur.

## Événements et preuves

Tous les événements fournisseur / paiement répètent `jobId`, `userId` et
`attemptId`. Les événements de réservation / remboursement répètent également la
clé déterministe `idempotencyKey`. Le contenu fournisseur n'est jamais un type
d'événement.

## Invariants

1. L'autorisation et la vérification de propriété précèdent toute mutation de
   crédit ou appel à Eve.
2. Une tentative payante possède au plus une réservation réussie et un
   remboursement réussi ; un résultat révisé avec succès n'est jamais remboursé.
3. `review` exige un résultat valide selon le schéma. Une sortie invalide est une
   tentative échouée. Les résultats d'artefacts ne contiennent aucun brouillon
   libre : chaque segment ordonné du brouillon est ancré par des références
   sources typées et autorisées (_allowlisted_), et le serveur n'assemble le
   texte de révision / copie qu'après validation.
4. `accepted` et `rejected` enregistrent uniquement la révision utilisateur ; ils
   ne mutent pas le pipeline de candidature.
5. L'annulation est explicite. Un timeout de transport produit `uncertain`
   jusqu'à la réconciliation du job durable ; il n'est pas relancé à l'aveugle.
6. Un `CREATE_JOB` dupliqué avec la même clé d'idempotence renvoie le job
   canonique et ne peut pas démarrer une seconde exécution Eve.
7. Une nouvelle tentative utilisateur ne rouvre jamais un job terminal ni ne
   réutilise son identité de facturation. Elle crée un nouveau job logique après
   une nouvelle confirmation de consentement. Cela empêche qu'une réservation
   remboursée autorise gratuitement une exécution fournisseur ultérieure.
8. L'admission au pilote est une garde atomique pré-job : 10 jobs d'analyse et
   20 jobs au total par utilisateur et par jour UTC. Une relance de transport
   canonique avec la même clé d'idempotence est vérifiée avant cette garde et ne
   peut pas consommer un autre créneau de quota ; un nouveau job demandé par
   l'utilisateur en consomme un.
9. La reprise durable est spécifique à la phase : `reserving` rejoue uniquement
   la RPC idempotente de réservation ; `queued` ne peut être envoyé que s'il
   n'existe aucun horodatage d'envoi fournisseur ; `refunding` rejoue uniquement
   la RPC idempotente de remboursement. Un job `running` ou tout job avec un
   envoi fournisseur possible sans résultat durable passe à `uncertain`, car Eve
   0.26.2 n'offre aucune autorité de consultation.
10. Une session de dossier ne devient éligible à la continuation qu'après
    `USER_ACCEPTED`. Le job suivant réclame et désactive cette éligibilité avant
    l'envoi. Les tours rejetés, annulés, invalides ou échoués ne peuvent pas
    alimenter les prompts suivants.
11. L'enregistrement d'un handle fournisseur et la preuve de
    `provider_disposition_known` forment une seule transition en base de données.
    Aucun crash ne peut laisser un handle durable sans la preuve de son job, ni
    une preuve sans le handle correspondant.
12. Une transition terminale qui ne nécessite pas de mutation de crédit valide
    l'état terminal du job et le retour du dossier à `ready` en une seule
    transaction. Cela couvre le refus d'admission entitlement / crédit avant
    réservation, l'échec d'analyse gratuit, l'annulation gratuite et la
    réparation terminale idempotente.
13. Un `activeJob` de session fournisseur n'est valide que lorsque
    `jobId + userId + dossierId` identifient le même job durable. Les liaisons
    inter-dossiers sont structurellement impossibles, et pas seulement rejetées
    par le code applicatif.
14. Le dossier persiste le `jobId` actuellement actif depuis l'admission jusqu'à
    la révision / remboursement. L'étape, la révision, le règlement sans crédit
    et le remboursement doivent correspondre à cet identifiant exact avant de
    l'effacer. Une tentative terminale tardive d'un ancien job ne peut pas
    ramener à `ready` un dossier occupé par un job plus récent.
15. Une ligne de session fournisseur existante ne peut pas être réassociée par
    enregistrement / étape. Seule la réclamation explicite de continuation
    acceptée peut déplacer son `activeJobId` ; chaque enregistrement / étape
    ultérieur doit observer cet identifiant déjà corrélé.
16. L'admission d'un job consomme un compteur durable par jour UTC indépendant de
    la suppression en cascade dossier / job. Un reçu de suppression sans payload
    non expiré pour le même utilisateur / clé d'idempotence renvoie `GONE` avant
    tout effet sur le quota, le crédit ou le fournisseur.
17. Une clé d'idempotence n'est canonique que pour le même hash d'entrée,
    dossier et type d'opération. Toute discordance est un conflit et ne produit
    aucun effet sur le dossier, le quota, le crédit ou le fournisseur.
18. Chaque chemin de lecture / duplication d'API capable de reprendre une
    réservation, un remboursement ou un travail fournisseur revalide d'abord le
    déploiement (_rollout_) et l'entitlement actif. Les lectures de dossier par
    auth seule, l'annulation, la révision utilisateur terminale et la suppression
    peuvent récupérer ou régler des données contrôlées par le propriétaire après
    expiration / révocation, mais n'envoient jamais de nouveau travail
    fournisseur ni ne mutent les crédits. Une continuation ultérieure exige
    toujours un nouveau job autorisé.
19. Le règlement multi-lignes suit un ordre de verrouillage unique : ligne de
    sérialisation du dossier, puis ligne du job corrélé, puis lignes du registre
    / profil. Les relances de remboursement et sans crédit n'inversent jamais
    cet ordre face à une suppression.
20. Un point de contrôle durable `cancelling` est reprenable après une perte de
    processus. Le service rejoue uniquement une obligation d'annulation
    prouvable : l'absence de handle fournisseur signifie l'absence d'effet
    distant ; un handle connu utilise le chemin idempotent d'annulation /
    réconciliation fournisseur. La terminalisation utilise toujours la
    transaction correspondante de remboursement ou sans crédit.
21. Un reçu de job supprimé est sans payload et bloque le rejeu uniquement
    jusqu'à son expiration en base de données. Les reçus expirés sont supprimés
    physiquement par une purge bornée réservée au `service-role`. Les
    vérifications d'admission / rejeu purgent un lot de façon opportuniste,
    tandis qu'une tâche de maintenance quotidienne authentifiée vide tous les
    lots expirés. L'objectif opérationnel de suppression est au plus tard
    25 heures après `expiresAt` ; une tâche de maintenance manquée déclenche une
    alerte de production et empêche une promesse publique de rétention plus
    stricte.

## Couverture de revue

- Analyse incluse et chaque type de contenu à un crédit.
- Refus d'entitlement, crédits insuffisants et mauvais propriétaire de dossier.
- Requêtes dupliquées avant / après réservation et après achèvement.
- Timeout fournisseur, schéma invalide, annulation et échec de remboursement.
- Crash après réservation, achèvement fournisseur ou remboursement ; la
  réconciliation doit régler exactement une fois.
- Crash lors de l'enregistrement d'un handle fournisseur ou d'une transition
  terminale sans crédit ; les observateurs doivent voir soit l'état complet
  avant, soit l'état complet après.
- Une session ne peut pas se lier à un job d'un autre propriétaire ou dossier, y
  compris via SQL direct en `service-role`.
- Un remboursement / règlement tardif pour le job A après le démarrage du job B
  doit être rejeté sans modifier le job B ni le dossier ; un enregistrement /
  étape ne peut pas réassocier la session du job A.
- Résultats fournisseur / remboursement périmés d'une tentative antérieure.
- Rejeu d'un job supprimé après une réponse `DELETE` perdue, et tentatives de
  réinitialisation du quota en supprimant un dossier.
- Redémarrage depuis `cancelling` avant l'annulation fournisseur, après
  annulation confirmée et avant terminalisation par remboursement / sans crédit.
- Échec terminal relançable suivi d'un nouveau job créé par l'utilisateur avec
  des identités de job, tentative, idempotence et facturation distinctes.
- Suppression physique des reçus expirés, incluant plus d'un lot borné, des
  appels de maintenance non autorisés et la limite d'alerte de tâche manquée.
