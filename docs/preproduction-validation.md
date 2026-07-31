# Validation préproduction — freemium Pulse

Ce protocole valide uniquement des environnements locaux ou de test. Il ne
doit jamais recevoir une clé live, une URL de production, une donnée client ou
une URL Chrome Web Store inventée.

Sources de vérité :

- `models/freemium-entitlement-provisioning.model.md`
- `models/preproduction-validation-hardening.model.md`
- `models/preproduction-validation-hardening.review.md`

## 1. Vérifications locales terminées

### Base Supabase vide

Sur une stack Supabase locale :

```bash
supabase start --workdir apps/landing
supabase db reset --workdir apps/landing
supabase test db --workdir apps/landing
supabase db lint --local --workdir apps/landing
```

Attendu :

- toutes les migrations s'appliquent depuis une base vide ;
- les 21 assertions pgTAP passent ;
- le lint du schéma ne remonte aucune erreur ;
- les politiques RLS, privilèges service-only, limites atomiques et purges
  restent conformes au modèle.

### Extension Chrome MV3

Construire l'extension, puis lancer :

```bash
cd apps/extension
pnpm build
pnpm verify-manifest -- dist/manifest.json --post-build
node scripts/validate-mv3-runtime.mjs
```

Le validateur charge `dist` comme extension non empaquetée dans un profil
Chromium temporaire. Il vérifie :

- Manifest V3 et service worker effectivement chargés ;
- panneau latéral chargé sans erreur console ;
- absence de permission `<all_urls>` ;
- LinkedIn conservé en permission hôte optionnelle ;
- Worker d'assistance réellement construit et exécutable ;
- sortie de suggestion validée, ou état sûr `AI_UNAVAILABLE`.

`AI_UNAVAILABLE` valide le repli local sans cloud, mais ne prouve pas une
génération matérielle. Cette dernière exige une version de Chrome compatible
avec Prompt API dont le modèle local est téléchargé et disponible.

## 2. Validation Lemon Squeezy en sandbox

### Minimum à fournir

Utiliser exclusivement des valeurs test mode :

- `LEMON_SQUEEZY_API_KEY`
- `LEMON_SQUEEZY_STORE_ID`
- `LEMON_SQUEEZY_PREMIUM_YEARLY_VARIANT_ID`
- `LEMON_SQUEEZY_WEBHOOK_SECRET`
- `LEMON_SQUEEZY_EXPECTED_TEST_MODE=true`
- une callback HTTPS non-production ;
- un compte Pulse de test dans une base Supabase sandbox vide.

Ne jamais copier ces valeurs dans un fichier suivi par Git, une URL, un log ou
une preuve de validation.

### Validation du catalogue

```bash
cd apps/landing
node scripts/validate-lemon-sandbox.mjs
```

Le script refuse toute configuration live et valide auprès de l'API Lemon
Squeezy :

- variant rattaché au store attendu et en mode test ;
- abonnement standard de 10,00 € par an ;
- cadence annuelle de quantité 1 ;
- aucun essai implicite et aucun prix libre.

### Recette manuelle du flux signé

1. Créer un checkout Premium depuis un compte Pulse de test.
2. Vérifier que la page de paiement affiche 10 € TTC par an et reste en mode
   test.
3. Finaliser un paiement de test.
4. Vérifier que seul un webhook signé canonique provisionne Premium.
5. Rejouer exactement le même webhook et vérifier l'idempotence.
6. Vérifier que dashboard et extension projettent le même entitlement.
7. Tester successivement annulation, reprise, expiration, pause et impayé.
8. Vérifier qu'un remboursement partiel ne révoque pas Premium.
9. Vérifier qu'un remboursement intégral signé révoque Premium.
10. Tester signature invalide, mauvais store, mauvais variant, mauvais
    `test_mode`, événement header/corps incohérent et événement ancien.

Les événements de facture de paiement restent auxiliaires : ils ne décident
jamais seuls d'un entitlement.

## 3. Exploitation et rétention

La fonction `purge_freemium_operational_data` est déterministe, serveur
uniquement et idempotente. Sa planification quotidienne reste une décision de
déploiement. Valeurs par défaut :

- buckets de rate limiting expirés : 24 h ;
- demandes de liaison terminales : 24 h ;
- checkout terminaux sans abonnement : 90 jours ;
- événements techniques de facturation traités : 395 jours.

Avant suppression, une demande de liaison `pending` arrivée à échéance passe
explicitement à `expired`.

Les quotas et durées sont configurables côté serveur. Toute modification doit
mettre à jour le modèle avant le comportement.

## 4. Critères de sortie

La préproduction complète est validée seulement si :

- migrations, pgTAP, tests, types et builds passent ;
- le runtime MV3 atteint `passed_terminal` ou, pour le seul repli Prompt API,
  `unavailable_safe_terminal` ;
- le flux Lemon réel en test mode atteint `passed_terminal` ;
- aucune donnée live ni aucun secret ne figure dans les preuves ;
- extension et dashboard reflètent le même entitlement après chaque événement
  canonique.

Une validation bloquée ou non exécutée n'est jamais assimilée à un succès.
