# Modèle de synchronisation d'entitlement Premium

## Autorité

Le profil serveur fait autorité. L'extension ne stocke qu'un instantané
d'affichage ainsi qu'un bearer de session éphémère. Ni `premium_enabled` ni aucun
drapeau local ou de dev ne peut autoriser l'API Copilot.

## États

```text
unlinked -- LINK_REQUESTED --> linking
linking -- LINK_SUCCEEDED --> checking
linking -- LINK_CANCELLED --> unlinked
linking -- LINK_FAILED --> error

free|active|expired|revoked|error -- SYNC_REQUESTED --> checking
checking -- ENTITLEMENT_FREE --> free
checking -- ENTITLEMENT_ACTIVE --> active
checking -- ENTITLEMENT_EXPIRED --> expired
checking -- ENTITLEMENT_REVOKED --> revoked
checking -- SESSION_REJECTED --> unlinked
checking -- SYNC_FAILED --> error

active -- LOCAL_EXPIRY_OBSERVED --> expired
free|active|expired|revoked|error -- UNLINK_REQUESTED --> unlinked
```

`LOCAL_EXPIRY_OBSERVED` ne fait que retirer l'accès de manière anticipée. Il ne
peut ni créer ni prolonger un accès. Il n'existe aucune transition de relance
automatique ; le Shell planifie et émet un `SYNC_REQUESTED` explicite.

## Invariants

1. Seul l'état `active` autorise l'admission vers le Copilot distant.
2. `active` exige un instantané émis par le serveur contenant `subject`,
   `issuedAt` et un `expiresAt` dans le futur.
3. Chaque réponse est corrélée au `requestId` actif ; les réponses périmées sont
   ignorées.
4. La révocation et l'expiration retirent l'autorité de création Copilot mais
   conservent un bearer valide pour la récupération limitée au propriétaire
   (consultation, annulation, révision, suppression). Seule une dissociation
   explicite ou un rejet de session par le serveur efface l'identité.
5. Les erreurs échouent de manière fermée (_fail closed_) et ne réutilisent
   jamais l'ancien booléen Premium.
6. Les surcharges de dev peuvent afficher une UI synthétique mais ne peuvent
   jamais atteindre une API de production.

## Couverture de revue

- Liaison nominale et rafraîchissement.
- Popup annulée, connexion refusée et callback invalide.
- Plan gratuit, expiration pendant l'ouverture, révocation serveur et réponse
  malformée.
- Hors ligne / erreur puis nouvelle tentative explicite.
- Ancienne réponse arrivant après une dissociation ou une synchronisation plus
  récente.
- Redémarrage du worker MV3 avec et sans état dans `chrome.storage.session`.
