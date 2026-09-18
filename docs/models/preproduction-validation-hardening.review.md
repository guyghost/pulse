# Préproduction — Review avant implémentation

Statut : **Review v2 — implémentation locale vérifiée, sandbox Lemon bloquée**

Source :
`models/preproduction-validation-hardening.model.md`.

## 1. Faits observés

1. Chrome 150 est installé localement et Playwright fait partie du workspace.
2. Docker et Supabase CLI sont installés ; une stack Supabase locale a été
   démarrée uniquement pour cette validation.
3. Les variables Lemon Squeezy, Supabase runtime et webhook sont absentes de
   l'environnement de cette tâche.
4. Les routes de liaison `start`, `status`, `approve` et `refuse` consomment
   désormais des buckets atomiques et échouent fermées.
5. Les réponses sensibles posent `Cache-Control: no-store`.
6. Les URL de retour checkout et d'approbation utilisent désormais une origine
   publique canonique validée avant toute création persistée.
7. La signature Lemon Squeezy est vérifiée avant le JSON.
8. Le normaliseur vérifie désormais `X-Event-Name`, `test_mode`, store, variant
   et type d'objet.
9. Les événements de paiement sont désormais auxiliaires ; l'événement
   abonnement canonique décide.
10. Seul un remboursement intégral vérifié révoque Premium.
11. Une purge opérationnelle service-only, bornée et idempotente est définie.
12. Le manifest utilise des hôtes précis, garde LinkedIn optionnel et filtre les
    connecteurs exclus au build.
13. Le Worker IA est un module séparé et le code refuse déjà le cloud lorsque
    l'API locale est indisponible.
14. La revue finale a identifié que les transitions authentifiées de la
    landing lisaient encore l'objet de session du cookie ; elles doivent
    consommer une identité vérifiée par le serveur d'authentification.

## 2. Sources fournisseur vérifiées

La documentation officielle Lemon Squeezy consultée le 30 juillet 2026 confirme :

- HMAC SHA-256 du corps brut dans `X-Signature` ;
- `X-Event-Name` et `meta.event_name` ;
- propagation de `checkout_data.custom` vers les webhooks ;
- objets abonnement pour `subscription_*` et objets facture pour
  `subscription_payment_*` ;
- `subscription_updated` envoyé après les évolutions de cycle ;
- `order_refunded` et `subscription_payment_refunded` déclenchés pour un
  remboursement total **ou partiel** ;
- séparation stricte des webhooks test et live.

## 3. Cas couverts par le modèle

| Domaine       | Nominal   | Erreur             | Annulation | Retry            | Permissions        | Terminaux |
| ------------- | --------- | ------------------ | ---------- | ---------------- | ------------------ | --------- |
| sandbox Lemon | oui       | oui                | oui        | oui              | clé test seulement | oui       |
| rate limiting | allowed   | store/config       | n/a        | nouvelle requête | service-only       | oui       |
| rétention     | purge     | DB                 | oui        | explicite        | service-only       | oui       |
| Chrome MV3    | chargé    | load/worker/output | arrêt run  | nouveau run      | manifest           | oui       |
| migrations    | base vide | apply/assertion    | arrêt      | nouveau reset    | local/sandbox      | oui       |

## 4. Écarts implémentés

1. Politique de rate limiting pure, stockage Postgres atomique
   et gardes sur `start`, `status`, `approve` et `refuse`.
2. Origine publique canonique avec refus de la configuration absente/invalide.
3. Contrat Lemon durci : environnement, store, variant, type d'objet,
   header événement et remboursement intégral.
4. Événements facture auxiliaires ignorés pour les transitions ; seul
   `subscription_updated` décide l'entitlement.
5. Fonction de purge et bornes de rétention ajoutées.
6. Tests de fixtures, rate limiting, RLS, purge et migration vide.
7. Validation Chrome unpacked ajoutée pour le chargement MV3 et le
   comportement sûr du Worker.
8. Validateur sandbox ajouté ; il s'arrête si le variant n'est pas en mode
   test ou n'est pas exactement annuel à 10 €.
9. Les décisions de liaison, checkout et projection privée utilisent une
   identité serveur vérifiée, jamais le cookie seul.
10. L'expiration déclenchée par polling est atomique et vérifie son commit ;
    une résolution concurrente est relue au lieu d'être masquée.

## 5. Questions et limites non bloquantes pour l'implémentation locale

1. La validation Lemon réelle restera bloquée sans les quatre identifiants de
   test et une callback HTTPS non-production.
2. La génération Prompt API peut rester indisponible sur la machine malgré un
   Chrome compatible ; cet état doit être rapporté séparément.
3. La purge des appareils révoqués dépend d'une décision de conservation du
   dashboard connecté et n'est donc pas automatisée ici.
4. La planification quotidienne de la fonction de purge dépendra du scheduler
   retenu au déploiement ; seule la fonction déterministe et testable est dans
   ce lot.

## 6. Décision de review

L'implémentation consomme le modèle sans transition libre ni décision LLM.
Toute évolution de quota, rétention ou décision d'accès devra d'abord mettre à
jour le modèle.

## 7. Preuves Verify du 30 juillet 2026

- base locale remise à zéro : toutes les migrations appliquées depuis vide ;
- pgTAP : 21 assertions réussies ;
- lint DB local : aucune erreur de schéma ;
- domaine, landing, extension et dashboard : 2 233 tests réussis ;
- quatre vérifications de types : zéro erreur ;
- trois builds distribuables : réussis ;
- manifeste post-build : MV3, couverture exacte des connecteurs et permission
  LinkedIn optionnelle validés ;
- runtime Chromium unpacked : service worker prêt, panneau latéral sans erreur,
  Worker chargé, terminal sûr `AI_UNAVAILABLE` ;
- Lemon sandbox : `blocked_external_terminal`, car les quatre identifiants de
  test et la callback HTTPS non-production ne sont pas disponibles.

Le terminal Chrome `AI_UNAVAILABLE` ne prouve pas la génération Prompt API. La
validation matérielle et le parcours Lemon signé restent les deux recettes
externes à exécuter avec les prérequis minimaux documentés dans
`docs/preproduction-validation.md`.
