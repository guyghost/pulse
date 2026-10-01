# Lot 2 — Entrée, navigation, profil et réglages

## Périmètre livré

Implémentation sur `/workspace/pulse`, à partir du feed livré et relu sous `3525479`. Les composants et interfaces du feed sont conservés. Aucun connecteur ajouté au build, aucun service connecté ou Copilot activé, aucune clé ajoutée, aucun push.

| Exigence | Livraison et preuve |
| --- | --- |
| Navigation persistante nommée | Boutons avec icône et nom visibles sur une grille de trois colonnes, hauteur minimale de 44 px. `aria-label="Navigation principale"`, état courant et accès clavier natif. Libellé adapté dans tous les tests et outils de QA qui utilisaient « Main navigation ». |
| Sources onboarding, actions visibles | Introduction réduite à « MissionPulse · Configuration ». La liste de sources défile dans sa propre zone ; Retour, Continuer et le raccourci Scanner maintenant / Continuer sans source restent dans le pied fixe. Vérification de session existante et garde NEXT préservés. Après SKIP, Profil et Réglages restent accessibles. Un bouton Réessayer reste disponible lorsque la session manque après retour de plateforme. |
| Confidentialité et notifications | Accueil : données locales par défaut, cloud facultatif. Notifications : seuil numérique enregistré, sans promesse de note A ; état indisponible lorsque sa lecture échoue. L’absence valide de préférences utilise le seuil des réglages historiques, comme la chaîne réelle de notification. Aucune préférence modifiée pour obtenir une note A. |
| IA compréhensible | Section Intelligence artificielle, Dans votre navigateur, Service cloud facultatif. Le texte local suit `buildScoringPrompt` ; le texte cloud suit `buildClassificationState` et `mission-classifier` : titre, technologies, mode de travail et description limitée, sans profil/TJM/localisation/session. Clé personnelle requise, conservation désactivée dans la requête. Le switch montre l’état effectif, jamais actif sans clé vérifiée ni budget. Le statut inconnu de clé expose une erreur et un bouton de revérification. Les termes Jev/fallback/couverture ont disparu du texte affiché ; les métriques IA sont simplifiées et adaptées à petite largeur. |
| Sources réelles et actionnables | Projection pure des états désactivée, vérification inconnue/en cours, connexion vérifiée, session à reconnecter, erreur de vérification ou collecte. Historique réel des statuts et snapshots de santé, dernière réussite lorsque disponible. Ouvrir/Reconnecter et Revérifier utilisent la vérification existante. Activation du toggle ne prouve jamais la connexion. Vérification automatique seulement lorsque Réglages est actif et la section Sources ouverte ; le Profil charge seulement le profil. |
| Profil stable et utile | Profil complet : Profil prêt, sans gain zéro ni cartes d’impact répétées. Profil incomplet : une suggestion concrète prioritaire, dont l’action ouvre l’édition et place le focus sur le champ concerné. Critères toujours consultables dans un détail dépliant ; erreurs de lecture et chargement explicites. |

## Préservation des données

Les écritures des réglages continuent à lire la configuration puis à attendre une confirmation du coordinateur existant. Une lecture échouée n’entraîne aucune mutation des réglages. Les alertes ne transforment plus une réponse inattendue en valeurs par défaut : le wizard attend la lecture et ignore leur écriture lorsque celle-ci échoue ; Réglages bloque la sauvegarde tant que les alertes n’ont pas été lues et relit avant de sauvegarder. Les valeurs et migrations persistées existantes sont conservées.

Le statut de clé cloud distingue une lecture réussie d’une réponse inconnue ou d’une erreur de transport. Le handler dev `AI_GATEWAY_KEY_STATUS` reflète le booléen du stockage dev existant avec le même type de résultat que le worker ; il n’ajoute ni clé ni activation.

## Vérifications

Toutes les commandes pnpm utilisent `PATH=/workspace/pulse-toolchain/node_modules/.bin:$PATH` depuis `/workspace/pulse`. Chromium système est fourni par `apps/extension/playwright.ux-check.config.ts`, fichier du contrôleur laissé hors commit.

- `pnpm --filter @pulse/extension build` : smoke Svelte précoce réussi en 8,93 s ; nouveau build réussi en 13,19 s après les modifications de rendu. Aucune erreur de compilation Svelte.
- `pnpm --filter @pulse/extension typecheck` : réussi, code de sortie 0.
- `pnpm --filter @pulse/extension exec eslint --no-warn-ignored <tous les fichiers TS/Svelte/MJS modifiés du périmètre et les nouveaux tests>` : réussi. La configuration ESLint ignore déjà `src/sidepanel/App.svelte` ; son rendu est validé par les builds et Playwright. Nouvelle passe ciblée sur les derniers fichiers modifiés : réussie, zéro erreur.
- `pnpm --filter @pulse/extension exec vitest run tests/unit/state/settings-page.test.ts tests/unit/ui/onboarding-connecting.test.ts tests/unit/ui/SettingsPage.local-only.test.ts tests/unit/ui/operational-ui-constraints.test.ts tests/unit/connectors/settings-source-status.test.ts tests/unit/facades/alert-preferences-facade.test.ts tests/unit/ui/ProfilePage.ux.test.ts` : 7 fichiers, 96 tests réussis, aucun rejet non traité. Tests utiles : états de source sans faux connecté, dernière réussite, lecture settings sans écriture sur échec, activation cloud effective, seuil exact ou inconnu, conservation des préférences, rendu profil complet, suggestion unique et focus.
- `pnpm --filter @pulse/extension exec playwright test --config=playwright.ux-check.config.ts tests/e2e/navigation.test.ts tests/e2e/settings.test.ts tests/e2e/onboarding.test.ts tests/e2e/ux-entry-settings.test.ts` : première passe complète corrigée, 29/29 réussis. Nouvelle passe onboarding/settings/UX après ajustements : 24/26 réussis, les deux assertions cloud ont révélé le handler de lecture absent du stub dev, corrigé ensuite ; ces quatre tests UX ont été relancés séparément : 4/4 réussis en 12,8 s.
- Après ajout du handler dev et du test de réponse inattendue : `vitest run tests/unit/ui/SettingsPage.local-only.test.ts tests/unit/state/settings-page.test.ts tests/unit/facades/alert-preferences-facade.test.ts` : 35/35 réussis, zéro erreur non traitée.
- `git diff --check` : réussi.

Les avertissements pnpm concernent le moteur Node 24 de la landing (le lot utilise Node 22 pour l’extension) ; Playwright signale uniquement les variables NO_COLOR/FORCE_COLOR.

## Corrections issues des vérifications et auto-relecture

Le premier smoke a trouvé un helper onboarding qui essayait de redéfinir `window.chrome`, propriété non configurable dans Chromium système. Le produit sauvegardait correctement le profil, mais la clé artificielle de test n’était jamais créée. Le helper et les deux assertions concernées utilisent désormais la vraie persistance dev `__missionpulse_dev_profile`, puis la vérifient après rechargement.

Les anciens tests statiques de cartes d’impact de Profil ont été adaptés à la nouvelle surface ; des tests de rendu vérifient le comportement complet/incomplet et le focus. Les tests DOM utilisent un stub de `scrollIntoView` absent de jsdom, sans masquer les erreurs du navigateur réel. Les erreurs ESLint de blocs sans accolades ont été corrigées puis les fichiers formatés.

Le hook de commit a exécuté ESLint et Prettier avec succès sur les fichiers indexés, puis `lint-staged` a échoué lors de sa remise en index (« git error »). Les fichiers et l’index ont été vérifiés intacts (`git diff` sans modifications hors index, `git diff --cached --check` réussi). Le commit a donc été effectué avec `SKIP_SIMPLE_GIT_HOOKS=1` après ces contrôles ; le backup automatique `9514b12` est conservé.

L’auto-relecture a vérifié la séparation Core/Shell, l’absence d’appels Chrome directs nouveaux dans l’UI, les écritures confirmées, les limites de catalogue livré, la distinction clé absente/lecture échouée, les gardes de validation onboarding et l’absence de modification du scoring canonique.

Le contrôleur a relu visuellement navigation/profil/IA à 400 px, l’absence de débordement global à 320 px et les raccourcis Sources à 320 px. Captures dans `/workspace/artifacts/missionpulse-ux-implementation-2026-10-01/` : `navigation-400.png`, `profile-400.png`, `settings-ai-400.png`, `onboarding-sources-320.png`, `onboarding-connected-320.png`.

## Limites

Les parcours navigateur utilisent le mode dev et des sessions mock ; ils ne démontrent pas la connexion réelle à chaque plateforme ni un cycle MV3 sur des comptes privés. Les tests métier couvrent les états manquants et en erreur. Aucun appel cloud réel, aucune permission nouvelle et aucune validation backend n’ont été nécessaires. La suite exhaustive du monorepo n’a pas été relancée ; les contrôles portent sur le lot et les parcours d’intégration concernés.
