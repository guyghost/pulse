# Modèle de scénarios d'onglets packagés

Statut : **RÉVISION 11 DU MODÈLE — EN ATTENTE DE REVUE INDÉPENDANTE ; IMPLÉMENTATION INTERDITE**.

SHA-256 du comportement en attente : `30b628046132da3222a7affb19044ed92d46ea71bf31192509f10a98e400ddb9`.

Le hachage normalisé du comportement en attente est le SHA-256 de l'intégralité des
octets bruts UTF-8/LF de ce fichier après remplacement exclusif de la valeur entre
accents graves sur la ligne `Pending behavior SHA-256` par le littéral
`__PENDING_BEHAVIOR_SHA256__`. Les accents graves environnants, le point et tout
autre octet demeurent inchangés. L'entrée doit déjà être en UTF-8 sans BOM et
utiliser des fins de ligne LF ; il n'y a aucune normalisation supplémentaire d'espaces,
Unicode, Markdown ou JSON.

La révision 1 a été rejetée de manière indépendante au SHA-256 UTF-8/LF brut exact
`92d62124130a2dc41a39288903cd2b8663f0daea958f8f2297dab10c4c1a05ed`.
La révision 2 a été rejetée de manière indépendante au hachage de comportement normalisé UTF-8/LF
`f01ad85c80e22e412080598c7bab66f97c3439e2f255994dc11b784bf137c541` :
sa dépendance parente MV3 désignait toujours le lignage obsolète des révisions 19/20, et
ses lignes d'échec d'état actif génériques correspondaient également à `failed_cleaning`,
autorisant un échec de nettoyage, une annulation ou un timeout à allouer un autre effet de nettoyage.

La révision 3 a conservé l'ensemble des cinq corrections de la révision 1 issues de la révision 2 : les
événements explicites de capture/réaffirmation de points de contrôle (checkpoints) et leurs corrélations ; une machine
enfant hors-ligne explicite ; les autorités distinctes et immuables du blob d'inventaire V2 et de la matrice
de scénarios ; une dépendance parente MV3 avec bascule en échec hermétique (fail-closed) ; et une action d'expansion
de CV fermée protégée par un contrat d'ancrage accessible revu séparément. Elle lie désormais cette dépendance parente
uniquement à la révision 26 du harnais MV3 en attente et à son hachage de comportement normalisé
`da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`,
sans traiter ce hachage candidat comme une approbation, une implémentation ou
une vérification. Elle supprime également `failed_cleaning` de chaque transition générique
et attribue à cet état exactement deux sorties terminales. Aucune approbation n'est transférée depuis
la révision 1, la révision 2 ou une quelconque révision du harnais MV3.

La révision 3 a été rejetée de manière indépendante au hachage de comportement normalisé UTF-8/LF
`e378d64435e7a3e255d6b8a744a43d1988b8b36da22ca190ccc44b4fc7dc097f`.
Elle dépendait toujours de la clarification 5 de préparation à la release qui avait été rejetée, représentait
l'approbation de release et l'implémentation via un condensat (digest) ambigu unique, et créait
un cycle d'implémentation : cet enfant interdisait les tests RED jusqu'à ce que le parent soit
vérifié, alors que le parent exigeait l'exécution des quatre scénarios enfants avant que
sa propre vérification ne puisse se terminer. La révision 4 remplace ce cycle par une
phase conjointe fermée d'implémentation suivie d'une activation atomique de l'autorité.
Elle consomme des reçus distincts de revue, d'implémentation et de vérification pour
la clarification 7 de préparation à la release, la révision 26 du harnais MV3 et cette révision 4 ;
aucun de ces condensats de reçu n'est édité dans ce fichier source. Aucune approbation ne se
transfère depuis la révision 3.

La révision 4 a été rejetée de manière indépendante au hachage de comportement normalisé UTF-8/LF
`24dd339609de659497eb6e958319fe244149184137360c2dc9ca464d049486b0`.
Son bac à sable (sandbox) de pré-activation consommait un uplet déjà
`ReviewedImplementedVerifiedModelAuthorityV1`, alors même que ce bac à sable
était censé produire les preuves à partir desquelles les reçus de vérification étaient
émis. Il ne nommait pas non plus d'ensembles ordonnés et typés de revue, d'implémentation et de vérification
ni leurs préimages exactes de condensat JCS, et le contrat partagé Git/activation
ne prouvait que deux blobs de modèle au lieu de l'ensemble d'autorité à six modèles. La révision 5
consomme une autorité de revue seule pour l'implémentation, une autorité de revue plus implémentation
pour la vérification, et l'autorité vérifiée complète uniquement après acceptation des
preuves et émission des reçus. Aucune approbation ne se transfère
depuis la révision 4.

La révision 5 a été rejetée de manière indépendante au hachage de comportement normalisé UTF-8/LF
`2e8e56fd119d8fccf08f1463cc12aca7dd9ff21af3d18118212ccbad6d911cc5`.
Elle ne vérifiait les octets suivis qu'avant et après les commandes, si bien qu'un enfant pouvait
temporairement muter ou masquer un octet source/test/configuration/module, builder `dist`, et
restaurer l'arbre d'origine avant la recapture. La révision 6 exige que chaque commande
de scénario packagé et ses descendants s'exécutent avec le point de montage source Git complet
et ses parents en lecture seule au niveau de l'OS (OS-read-only), sans capacité de montage (mount capability), et avec des écritures
limitées à des points de montage de sortie distincts et fermés qui ne peuvent pas masquer l'autorité suivie. Aucune approbation
ne se transfère depuis la révision 5.

La révision 6 a été retirée au hachage de comportement normalisé UTF-8/LF
`9b73affd0e6096ec8b2b60a1e5cffaa93633c0a5fea4cbf4d2ba91ae2c56b044`.
Son autorité à six emplacements épinglait toujours le modèle d'ancrage accessible du CV à
la révision 1 obsolète alors que le comportement revu avait progressé jusqu'à la révision 3, de sorte que l'activation
conjointe ne pouvait pas prouver la sémantique exacte du CV exercée par le checkpoint A3.
La révision 7 préserve la frontière de source immuable et exige la révision 3 du CV
à son hachage de comportement figé exact. Elle ferme également la projection d'upload
de diagnostic `test:mv3` non-candidate afin que l'inspection des flux de travail (workflows) ne puisse pas confondre
les preuves de diagnostic avec le transport de candidats. Aucune approbation ne se transfère depuis la révision 6.

La révision 7 a été retirée au hachage de comportement normalisé UTF-8/LF
`f5fc3235a2c73988f1bfcdb11247cba1deae7a33fc5d8e64e3440cff19930962`.
Sa dépendance de CV épinglait la révision 3, qui a été rejetée car la disponibilité
du callback était absente du décodeur et la sauvegarde n'avait ni payload validé
ni règle de fusion immuable de formulaire vers brouillon. Elle laissait également les ancres
packagées de MissionCard, des résultats TJM et du contrôle de thème sous forme de choix
d'implémentation alors que le repli positionnel est interdit. La révision 8 lie la
révision 4 corrigée du CV à son hachage de comportement figé exact et ferme les trois
contrats d'UI packagés : un article de mission nommé non interactif avec une divulgation
contrôlée explicite ; une hiérarchie nommée région/liste/élément pour le TJM ; et un groupe
de thèmes nommé à trois boutons dont l'état pressé suit uniquement les réglages confirmés.
Elle préserve la source immuable de la révision 7 et les frontières d'upload de diagnostic
projetées séparément. Aucune approbation ne se transfère depuis la révision 7.

La révision 8 a été retirée au hachage de comportement normalisé UTF-8/LF
`4933b559dc9fca2977d7f3d7371eed69a4f72ca8f687979cb1ebee8716693155`.
Sa dépendance de CV épinglait la révision 4, dont la machine active n'avait aucune ligne de transition
pour les règlements de callbacks périmés, inconnus ou discordants : les seules lignes génériques
étaient restreintes aux intentions d'UI. Un résultat de callback tardif ou divergent pouvait
donc rester en dehors de la table de transition fermée. Aucune approbation ne se transfère
depuis la révision 8.

Le premier candidat de la révision 9 a été retiré avant la revue indépendante au
hachage de comportement normalisé UTF-8/LF
`eaa67f36ff21210e7b4a0910d0556d5643bf0fd969091bf8a3191f88a7647c1e`.
Il liait la révision 5 du CV, dont l'approbation provisoire avait été révoquée après que l'audit
de sortie de focus du modèle a exposé une sortie fantôme `FOCUS_EXIT_REQUESTED` sans port de
callback Svelte explicite ni nettoyage terminal inconditionnel. Ce candidat de package
ne pouvait donc pas prouver le checkpoint A3 même s'il avait fermé les ancres
de MissionCard, du TJM et de l'apparence.

La révision 9 a été rejetée de manière indépendante au hachage de comportement normalisé UTF-8/LF
`9b910299cf2d77d277503610f4996a3465eb9a21d35a9d3cce296472f907238a`.
Son état `dependency_admitting` allouait `ADMIT_REQUIRED_AUTHORITIES` mais ne comportait
aucune transition corrélée pour les événements de transport fermés `EFFECT_FAILED`, `TIMEOUT` ou
`CANCELLED`. Un échec de transport lors de l'admission pouvait donc laisser un état actif sans chemin
terminal. La révision 10 ajoute des transitions exactes d'échec d'admission courante directement vers `failed`,
avant qu'aucun navigateur n'existe et sans allouer de nettoyage. Aucune approbation ne se transfère depuis la révision 9.

Ce candidat de révision 10 lie la révision 6 d'ancrage accessible du CV
approuvée de manière indépendante au hachage de comportement normalisé
`d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98`.
La révision 6 préserve le contrat exact d'article/bascule/région packagé A3,
consomme chaque règlement de callback actif, expose un port synchrone décodé
`onFocusExitRequest` et garantit le confinement du focus, la libération du bail
d'identifiant de détails et la suppression terminale via des effets `finally` imbriqués. Cette révision
retient également les ancres fermées de la révision 8 pour MissionCard, la région TJM et le groupe
d'apparence, les obligations RED/preuves, la frontière d'exécution à source immuable et le
téléverseur MV3 `diagnostic_only` exactement projeté séparément. Le parent conjoint est
la clarification 11 de préparation à la release à venir, qui doit figer ce
hachage candidat exact avant sa propre revue. Aucune approbation ne se transfère depuis la révision
8, aucun des deux candidats de révision 9 ou un quelconque prédécesseur du CV.

La révision 10 a été rejetée de manière indépendante au hachage de comportement normalisé UTF-8/LF
`2c18f03f8ff287ae65c6142552af0b60d7707dae994bb337719553c1f12d0cc8`.
Bien que ses chemins de transport d'admission des dépendances aient été fermés, l'uplet d'identité
normatif requis exigeait toujours `modelRevision = 9` pour les onglets packagés, de sorte que
ni l'uplet de révision 10 ni l'uplet obsolète de révision 9 ne pouvaient satisfaire
le décodeur d'autorité. La révision 11 préserve le correctif d'admission de la révision 10 et
met à jour chaque identité, invariant, plan et référence d'activation actuelle des onglets packagés
vers la révision 11. Aucune approbation ne se transfère depuis la révision 10 ; ces octets exacts
de révision 11 nécessitent toujours une revue indépendante.

Aucune implémentation de test, harnais, UI, service worker, stockage, inventaire ou porte de release
(release gate) n'est autorisée à partir de ce document jusqu'à ce qu'un réviseur indépendant
approuve ses octets exacts.

Le seul cycle de vie légal est
`Model -> Review -> Implement -> Verify -> Joint activation`. La revue peut admettre
la phase d'implémentation délimitée orientée RED d'abord ; elle ne peut pas ignorer les reçus
d'implémentation, les preuves de vérification, les reçus de vérification distincts ou l'activation
atomique finale. Une invite (prompt), un code de sortie vert, un diff de copie de travail (worktree) ou une déclaration de LLM
ne constitue pas une transition de cycle de vie.

L'auteur consigne le condensat candidat calculé en 64 caractères hexadécimaux minuscules uniquement sur la ligne
`Pending behavior SHA-256`. Le réviseur le reproduit de façon indépendante
en dehors de ce fichier. La normalisation rétablit le texte de remplacement (placeholder) littéral avant
le hachage, de sorte que cette unique substitution de condensat ne modifie pas les octets du
comportement revu. Toute autre modification d'octet invalide l'approbation et renvoie le
modèle à l'état de revue en attente. Les condensats de reçus de modèles constituent l'autorité d'activation
à l'exécution, et non des espaces réservés de source ; consigner ou remplacer l'un d'eux à l'intérieur
de ce fichier est interdit et nécessiterait une nouvelle révision et une nouvelle revue.

## Décision et objectif

La revendication de production détenue par ce modèle est délibérément étroite :

> Dans un véritable processus Chromium/Chrome Manifest V3 chargeant le package scellé exact
> `apps/extension/dist`, chacun des six onglets de navigation peut exécuter
> son flux de travail utilisateur représentatif, l'état local confirmé survit à un rechargement
> de page à chaud (warm reload), l'achèvement de l'onboarding survit à un rechargement,
> et les flux de travail locaux mis en cache restent conformes à la réalité à travers les transitions hors-ligne et de récupération.

Les six onglets sont `Missions` (la page de feed), `Profil`, `CV`, `Suivi` (la page Candidatures), `TJM`
et `Réglages`. L'onboarding est un flux de travail d'itinéraire initial séparé, et non un septième
onglet.

Ce modèle ajoute la persistance et la preuve de flux de travail à la couverture existante
portant uniquement sur le rendu dans `tests/e2e-extension/navigation.test.ts`. Il ne prétend pas que :

- un connecteur peut se connecter à, scraper ou muter une plateforme externe ;
- une candidature externe est soumise ;
- la synchronisation de CV, les assets générés, Gemini Nano ou les notifications fonctionnent ;
- le wire v2 dormant de suivi des candidatures ou la bascule vers Réglages V2 est actif ;
- la sélection d'une source d'onboarding est actuellement durable ;
- le service worker survit à un redémarrage de processus dans ces nouveaux scénarios. Cette
  revendication distincte reste détenue par `runtime.service-worker-reload` et le modèle
  du harnais MV3.

La commande canonique demeure :

```text
pnpm --filter @pulse/extension test:mv3
```

L'étape de CI peut être suivie d'exactement un téléversement de diagnostic projeté séparément. Son contrat fermé est, octet par octet :

```text
schema             = missionpulse.mv3-diagnostic-artifact-policy
version            = 1
purpose            = diagnostic_only
jobId              = test-mv3
job permissions    = { contents: read }
jobProjectionSha256 = SHA-256(JCS(complete exact committed test-mv3 job projection))
stepId             = upload-mv3-evidence
if                  = always()
uses                = actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
name                = missionpulse-mv3-evidence-${{ github.run_id }}-${{ github.run_attempt }}
path                = output/playwright/
if-no-files-found   = error
overwrite           = false
retention-days      = 14
candidateAuthority  = false
```

`jobProjectionSha256` est recalculé à partir de la projection de job `test-mv3` validée exacte et complète ci-dessus ; il n'est jamais fourni par l'appelant. L'étape constitue l'unique publication de preuve de ce job et aucun autre job non privilégié ne peut téléverser d'artefact. `output/playwright/` contient uniquement des diagnostics bruts Playwright/runtime délimités. Ni son chemin d'accès, ni son résultat de téléversement, ni son reçu ne peuvent entrer dans le verdict des treize scénarios, le candidat scellé à sept composants, le plan de commandes privilégiées, l'inventaire des candidats, le sceau, le sujet d'attestation, le condensat de transport, l'activation du catalogue ou toute préimage de transition de release. Il n'est jamais nommé `missionpulse-sealed-candidate`, ne transporte jamais d'octets de `dist`, de source, de modèle, de sceau, de transfert (handoff) ou de contrôleur exécutable, et ne définit jamais `archive:false`.

Le décodeur et l'inspecteur de politique de workflow acceptent exactement cette projection unique épinglée par SHA et rejettent un téléverseur manquant ou secondaire, une autre permission de job, une épingle mutable ou raccourcie, une entrée modifiée pour condition/nom/chemin/erreur/écrasement/rétention, une entrée supplémentaire, un artefact de forme candidate ou tout reçu de diagnostic présenté comme autorité de release. Les fichiers de diagnostic manquants font échouer le job de CI `test-mv3` car `if-no-files-found=error` ; le succès ou l'échec du téléversement ne modifie jamais l'état d'un candidat. Le rejet général actuel par l'inspecteur de ce téléverseur par ailleurs exact constitue un bloqueur d'implémentation, et non une preuve que l'étape de diagnostic devrait être supprimée, élargie ou réétiquetée.

## Autorité et frontière actuelle de release

L'implémentation doit suivre le runtime actuel, et non une cible future revue. Les sources suivantes font autorité normative pour cette preuve :

| Domaine / Préoccupation                                              | Autorité actuelle utilisée par ces scénarios                                                                                                                                                                         |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Processus packagé, artefact scellé, diagnostics et propriété à chaud | `src/models/mv3-packaged-harness.model.md`, `tests/e2e-extension/fixtures.ts`, `tests/mv3/harness/mv3-harness-controller.ts`                                                                                         |
| Six routes, libellés et comportement d'amorçage                      | `src/models/app-shell.model.md`, `src/lib/state/app-navigation.svelte.ts`, `tests/e2e-extension/navigation.test.ts`                                                                                                  |
| UI de favori et de suivi du feed                                     | `src/ui/pages/FeedPage.svelte`, `src/ui/molecules/MissionCard.svelte`, `src/lib/state/feed-page.svelte.ts`, `src/lib/state/tracking.svelte.ts`                                                                       |
| Cycle de vie du profil                                               | `src/models/profile-state.model.md`, `src/ui/pages/ProfilePage.svelte`, `src/ui/organisms/ProfileSection.svelte`                                                                                                     |
| Cycle de vie des expériences de CV                                   | `src/models/cv-experience-sync.model.md`, `src/ui/pages/CvPage.svelte`, `src/ui/organisms/ExperienceFeed.svelte`, `src/ui/molecules/ExperienceEditForm.svelte`                                                       |
| Transition et détails de candidature                                 | Frontière actuelle Task 5 / wire v1 dans `src/models/application-tracking.model.md`, gestionnaires de pont actuels dans `src/background/index.ts`, `src/ui/pages/ApplicationsPage.svelte`                            |
| Analyse locale du TJM                                                | `src/lib/core/tjm-history/`, `src/lib/shell/storage/tjm-history.ts`, `src/ui/pages/TJMPage.svelte`, `src/ui/organisms/TJMDashboard.svelte`                                                                           |
| Mutation des réglages                                                | Enveloppe de release actuelle dans `src/lib/shell/settings-release/settings-release.contract.ts` et coordinateur ; `src/ui/pages/SettingsPage.svelte`                                                                |
| Achèvement de l'onboarding                                           | `src/ui/pages/OnboardingPage.svelte` actuel, `src/ui/organisms/OnboardingFlow.svelte`, `src/lib/state/app-navigation.svelte.ts` ; la cible non connectée est documentée dans `src/models/onboarding-source.model.md` |
| Projection hors-ligne                                                | `src/models/app-shell.model.md`, `src/lib/state/connection.svelte.ts`, `src/lib/shell/utils/connection-monitor.ts`, `src/sidepanel/App.svelte`                                                                       |
| Schémas persistés                                                    | `src/lib/shell/storage/db.ts`, `src/lib/shell/storage/migration-registry.ts`, `src/lib/shell/storage/favorites.ts`, `src/lib/shell/storage/tracking.ts`                                                              |
| Scénarios validés existants                                          | `tests/mv3/scenarios.v1.json`                                                                                                                                                                                        |

Les distinctions suivantes sont obligatoires :

1. Le suivi des candidatures utilise le wire v1 implémenté. L'enveloppe, le registre (ledger), le CAS, la révision de mutation et la réconciliation au redémarrage proposés pour le wire v2 ne sont ni requis ni affirmés par ces scénarios.
2. La preuve des réglages utilise l'enveloppe `missionpulse_settings_release_v1` implémentée et le protocole public `GET_SETTINGS_RELEASE` / `MUTATE_SETTINGS_RELEASE`. Elle ne prétend pas que la bascule plus vaste de cloisonnement des écritures (writer-fence) de Réglages V2 est terminée.
3. L'historique du TJM est en réalité stocké dans `chrome.storage.local['tjm_history']`, bien que le commentaire d'introduction du module de stockage mentionne IndexedDB. Les tests suivent le comportement à l'exécution, et non ce commentaire obsolète.
4. L'indicateur de fonctionnalité (feature flag) de production premium est dormant et les six onglets sont déverrouillés. Un amorçage (seed) de `premium_enabled` ne fait pas autorité et n'est pas utilisé.
5. `OnboardingWizard` avance actuellement après un choix de source sans persister cette source. Le scénario d'onboarding prouve uniquement la persistance du profil, de l'alerte et de l'achèvement. Il ne doit pas fabriquer une prétention de persistance de source.

## Autorités parentes et d'UI bloquantes

La révision 11 ne constitue pas une autorité autonome d'implémentation, de vérification ou de release. Elle consomme les contrats d'autorité échelonnée détenus par le parent de clarification 11 :

- `ReviewedModelAuthorityV1` transporte uniquement l'identité exacte du modèle et le condensat du reçu de revue ;
- `ReviewedImplementedModelAuthorityV1` étend cette valeur exacte avec un condensat de reçu d'implémentation ;
- `ReviewedImplementedVerifiedModelAuthorityV1` n'étend cette valeur exacte qu'après l'émission d'un reçu de vérification à partir de preuves acceptées ; et
- les ensembles correspondants `OrderedReviewedModelAuthoritySetV1`, `OrderedReviewedImplementedModelAuthoritySetV1` et `OrderedReviewedImplementedVerifiedModelAuthoritySetV1` contiennent exactement six entrées dans l'ordre défini par le parent.

L'uplet vérifié complet comporte exactement ces champs :

```text
modelPath
modelRevision
behaviorSha256
reviewReceiptSha256
implementationReceiptSha256
verificationReceiptSha256
```

Les trois octets de reçus sont chargés de façon indépendante depuis les magasins de reçus immuables de revue, d'implémentation et de vérification. Leurs décodeurs stricts exigent le même chemin, la même révision et le même hachage de comportement ; le reçu d'implémentation lie également un commit/arbre d'implémentation propre et un condensat d'implémentation, et le reçu de vérification lie ce condensat de reçu d'implémentation, un condensat de matrice de test fermée et un résultat passant. Un condensat de reçu n'est jamais un condensat de comportement, un reçu ne peut pas satisfaire un autre rôle, et aucun champ d'uplet ne peut être déduit d'un texte, d'un code de sortie de test, d'une variable d'environnement ou d'un nom de fichier de modèle.

Les identités exactes requises sont :

```text
MV3 harness:
  modelPath = apps/extension/src/models/mv3-packaged-harness.model.md
  modelRevision = 26
  behaviorSha256 = da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b

Packaged tabs:
  modelPath = apps/extension/src/models/packaged-tab-scenarios.model.md
  modelRevision = 11
  behaviorSha256 = the independently recomputed value recorded on this file's
    Pending behavior SHA-256 line

Release readiness:
  modelPath = apps/extension/src/models/release-readiness.model.md
  modelRevision = 11
  behaviorSha256 = the independently recomputed value recorded on that file's
    Pending behavior SHA-256 line

CV accessible anchor:
  modelPath = apps/extension/src/models/cv-experience-card-accessibility.model.md
  modelRevision = 6
  behaviorSha256 = d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98
```

Le condensat de comportement connu de la révision 26 de MV3 identifie uniquement le candidat en attente ; il ne constitue pas un reçu d'approbation, d'implémentation ou de vérification. Les valeurs de comportement de la release et des onglets packagés sont de même recalculées à partir des blobs de modèles validés exacts plutôt que copiées depuis une copie de travail ou fournies par un appelant. La dépendance de release n'est admise que lorsque la clarification 11 a approuvé de façon indépendante les octets exacts et que ses reçus exacts d'implémentation et de vérification prouvent l'implémentation conjointe V2 décrite ci-dessous. Le parent dérive à la fois les condensats du blob d'inventaire et du tableau de scénarios à partir du blob Git validé. Un modèle enfant, une copie de travail, une variable d'environnement ou un rapport d'exécution ne peut fabriquer ou écraser aucune de ces deux valeurs.

La dépendance de CV n'est admise qu'après que le chemin de modèle, la révision et le hachage de comportement exacts nommés ci-dessus ont autorisé de façon indépendante l'ancre accessible de carte d'expérience et le contrôle d'expansion, et que des reçus d'implémentation et de vérification correspondants prouvent ce contrat sur l'arbre propre conjoint. Le contrat minimal requis par ce scénario est :

```text
role=article, accessible name="Expérience Lead Packaged UI chez MissionPulse QA"
toggle accessible name="Afficher les détails de l’expérience Lead Packaged UI"
toggle aria-expanded=false -> true after one click
toggle aria-controls=<stable bounded details id>
controlled role=region, accessible name="Détails de l’expérience Lead Packaged UI"
```

Le modèle d'UI distinct peut renforcer ces sémantiques mais ne peut pas les remplacer par l'index de carte, l'ascendance DOM, la classe CSS, la position en pixels ou une estimation du texte visible. Un composant dans la copie de travail ou un succès de test unitaire ciblé sans les reçus d'implémentation/vérification correspondants ne fait pas autorité, si bien que le checkpoint A3 reste bloqué jusqu'à l'admission conjointe.

`DEPENDENCIES_ADMITTED` est un événement typé, et non un booléen de configuration. Son payload strict contient un `JointReleaseModelActivationV1` dont le `verifiedModelAuthoritySet` est l'ensemble complet vérifié à six entrées ordonnées détenu par le parent. La machine de scénarios packagés ne l'accepte que lorsque chaque reçu est validé de manière indépendante, que le condensat de l'ensemble et chaque projection ordonnée sont validés, que chaque uplet correspond à l'identité exacte ci-dessus, et que l'activation lie de manière atomique ce même ensemble à un commit/arbre source, à une paire blob/tableau d'inventaire V2 et à une révision de catalogue activée. Une autorité manquante, en attente, obsolète, hachée différemment, de rôle croisé ou non vérifiée produit `DEPENDENCY_ADMISSION_FAILED` et aucun effet de scénario.

La vérification conjointe de pré-activation utilise un événement privé distinct `VERIFICATION_DEPENDENCIES_ADMITTED` transportant la capacité `JointImplementationVerificationSandboxV1` détenue par le parent **et** l'exact `OrderedReviewedImplementedModelAuthoritySetV1`. Cet ensemble contient uniquement des condensats de reçus de revue et d'implémentation ; un condensat de reçu de vérification dans cet événement est invalide sur le plan du schéma. Le bac à sable répète son condensat d'ensemble, son identifiant de phase, ses condensats de commit/arbre figé et d'inventaire, mais possède `authorityMode:'verification_only'`, aucun condensat d'activation et aucune capacité d'écriture dans le catalogue. Seule la façade de vérification conjointe peut l'émettre. Elle autorise exactement les mêmes effets de scénario et assertions afin que l'implémentation revue puisse être vérifiée sans autorité circulaire. Son état terminal réussi est `verified_only` et émet un `JointModelVerificationEvidenceV1` délimité pour l'emplacement des onglets packagés. Le constructeur d'ensemble de preuves parent valide ces preuves avant que le vérificateur indépendant n'émette un `ModelVerificationReceiptV1` ; c'est seulement alors que l'ensemble vérifié complet peut être construit. Les preuves de vérification seule ne peuvent jamais satisfaire un `PackagedMv3GateReceiptV1` de release, un candidat, un audit, un sceau ou une garde `DEPENDENCIES_ADMITTED` de production. Après l'activation, les scénarios de release s'exécutent à nouveau sous `authorityMode:'activated_release'` ; les preuves de vérification seule ne sont pas promues ou réétiquetées.

Les deux modes exigent également l'`ImmutableGitSourceExecutionAuthorityV1` détenu par le parent. Avant qu'un enfant de scénario ne soit engendré, son reçu de montage/capacité Linux doit prouver :

- l'arbre Git validé complet constitue la source sous-jacente et la vue d'exécution est un montage lié (bind mount) récursif avec `ro,nodev,nosuid,noexec` ;
- la racine d'exécution, le montage source et chaque ancêtre source sont en lecture seule pour l'enfant et chaque descendant pendant toute leur durée de vie ;
- la vue source n'est pas un overlayfs et ne contient aucun montage lié/overlay sur un chemin suivi ou sous un quelconque chemin suivi de source, modèle, module, test, fixture, harnais, configuration Playwright, script, manifeste, verrou ou configuration ;
- les dépendances, caches, `dist`, profils de navigateur et rapports accessibles en écriture sont des racines de montage distinctes sur liste blanche. Un montage à l'intérieur de la vue d'exécution n'est légal qu'à un chemin fixe prouvé absent de l'arbre Git, créé vide par le contrôleur, et toujours vide immédiatement avant que le montage de sortie distinct ne soit attaché ;
- `CAP_SYS_ADMIN` et l'ensemble de limitation de capacités complet sont absents, `no_new_privs` est positionné, les appels système d'échappement d'espace de noms (namespace) par mount/remount/pivot/chroot sont refusés et ces restrictions sont héritées par l'arbre de processus complet ;
- les sockets Docker/containerd/buildkit/systemd, FUSE, les gains par sudo/setuid/capacités de fichier et tout intermédiaire de mutation assisté sont absents des enfants de scénario ;
- les tentatives d'écriture, chmod, link, symlink, renommage, montage ou remontage ciblant la source échouent à la frontière de l'OS avant qu'un octet ne change ; et
- chaque commande a son `cwd` dans la vue source en lecture seule, nomme ses sorties accessibles en écriture de façon explicite, et produit des reçus concordants de montage, capacités, descripteurs et arbre de processus pré-exécution et post-sortie.

Ce sont des gardes de prévention, et non des heuristiques de dérive avant/après. Restaurer des octets après une mutation transitoire ne peut pas les satisfaire, car la commande ne reçoit jamais de capacité d'écriture ou de montage sur la source. Les preuves de `dist` sont invalides à moins que le reçu de build qui les produit ne lie la même autorité de source immuable et le même montage de sortie fermé. Tout overlay, masquage de chemin suivi, ancêtre source accessible en écriture, montage inattendu, changement d'identifiant/drapeaux de montage, nouvel espace de noms, lien symbolique d'échappement ou rupture de reçu produit `DEPENDENCY_ADMISSION_FAILED` avant le lancement du navigateur.

## Admission en mode packagé uniquement

Chaque scénario n'est admis qu'après que l'uplet exact révision 26/hachage du harnais MV3 approuvé, implémenté et vérifié de manière indépendante nommé ci-dessus a prouvé tout ce qui suit :

1. l'arbre `dist` exact a été scellé avant le lancement du navigateur ;
2. `manifest.json` est en MV3 et son contrat de permissions packagées est valide ;
3. un répertoire de données utilisateur Chromium temporaire et vierge et l'extension packagée s'exécutent dans un contexte de navigateur persistant réel unique ;
4. l'identité du service worker appartient à l'extension packagée ;
5. les diagnostics de page et de worker ont été installés avant les effets de scénario ;
6. aucun artefact de `src/dev`, stub Chrome, DevPanel, enregistreur de pont (bridge logger), globale DEV ou stockage DEV n'est présent ;
7. aucun serveur Vite, backend applicatif, serveur mock ou plateforme externe n'est démarré.

Toutes les données de scénario sont locales. Les tests ne cliquent jamais sur une URL de mission externe. Une invite de permission, un mur d'authentification, une page externe, une requête backend utilisée comme fixture ou un repli DEV constitue un échec terminal plutôt qu'une raison d'affaiblir une assertion.

## Inventaire proposé des scénarios v2

Une phase d'implémentation conjointe autorisée ultérieurement entre parent et enfant crée `tests/mv3/scenarios.v2.json` et bascule de manière atomique chaque consommateur d'inventaire de la v1 vers la v2. L'ancien fichier v1 ne doit pas rester l'autorité de release après cette bascule.

Les octets JCS/UTF-8 exacts de l'inventaire v2 proposé, sans BOM ni LF final, sont :

```text
{"scenarioIds":["harness.bootstrap-diagnostics","harness.late-diagnostic","harness.page-console","harness.page-error","harness.worker-rejection","navigation.all-tabs","navigation.cold-onboarding","navigation.shortcuts-focus","packaged-tabs.applications-tjm-settings-persistence","packaged-tabs.feed-profile-cv-persistence","packaged-tabs.offline-recovery","packaged-tabs.onboarding-completion","runtime.service-worker-reload"],"schema":"missionpulse.packaged-mv3-scenario-inventory","version":2}
```

Deux hachages lient différentes autorités d'octets et ne doivent jamais être confondus :

```text
inventoryBlobSha256 = b386a936abad72ccd4fe2b0dd5cdf2390a6762e3d2ce3e0b0e07635f16f6a1ef
scenarioMatrixSha256 = 2a9c9f67e0c19a0dae126f7db15c25a0c1411b0753e63ecad6eaa0824720f79a
```

`inventoryBlobSha256` est le SHA-256 de l'objet d'inventaire JCS complet sur une seule ligne ci-dessus, y compris `schema`, `version` et `scenarioIds`.
`scenarioMatrixSha256` est le SHA-256 du JCS du tableau `scenarioIds` ordonné exact uniquement, là encore sans BOM ni LF final :

```text
["harness.bootstrap-diagnostics","harness.late-diagnostic","harness.page-console","harness.page-error","harness.worker-rejection","navigation.all-tabs","navigation.cold-onboarding","navigation.shortcuts-focus","packaged-tabs.applications-tjm-settings-persistence","packaged-tabs.feed-profile-cv-persistence","packaged-tabs.offline-recovery","packaged-tabs.onboarding-completion","runtime.service-worker-reload"]
```

Le premier condensat prouve le blob validé exact. Le second prouve la matrice exacte de scénarios attendue et exécutée par la porte packagée. L'égalité entre les deux n'est ni attendue ni autorisée en tant que raccourci.

Dans la clarification 11, le champ parent `PACKAGED_MV3_SCENARIO_INVENTORY_V2.blobSha256` et le candidat `mv3ScenarioInventoryBlobSha256` correspondent uniquement à `inventoryBlobSha256`. Le champ parent `scenarioIdsSha256` et le candidat `expectedMv3ScenarioInventorySha256` correspondent uniquement à `scenarioMatrixSha256`. Ces alias ne modifient pas le domaine d'octets et ne peuvent pas être intervertis.

`scenarioIds` est strictement croissant selon l'ordre des octets ASCII, ne contient aucun doublon et préserve chaque scénario v1. La validation de release doit prouver une correspondance exacte biunivoque entre cette liste et les annotations `scenario-id` de Playwright. Un scénario absent, supplémentaire, dupliqué, ignoré ou retenté sous un autre identifiant constitue un échec de release.

La bascule de l'inventaire est détenue conjointement avec la clarification 11 de préparation à la release. Aucun des deux modèles ne peut exiger l'implémentation achevée de l'autre comme condition préalable pour commencer l'implémentation. À la place, la clarification 11 détient une phase fermée `JointReleaseModelImplementationV1` comportant ces états et événements :

```text
states:
  review_waiting -> implementing -> verification_pending -> evidence_frozen -> verified
  verified -> activated
  review_waiting | implementing | verification_pending | evidence_frozen | verified -> blocked

events:
  JOINT_IMPLEMENTATION_STARTED
  JOINT_IMPLEMENTATION_COMPLETED
  JOINT_VERIFICATION_EVIDENCE_FROZEN
  JOINT_VERIFICATION_PASSED
  JOINT_AUTHORITY_ACTIVATED
  JOINT_PHASE_FAILED
```

`JOINT_IMPLEMENTATION_STARTED` exige un `OrderedReviewedModelAuthoritySetV1` valide contenant des reçus de revue approuvés pour la clarification 11 exacte de préparation à la release, cette révision 11 d'onglets packagés, la révision 26 du harnais MV3, le modèle d'ancrage accessible du CV et les modèles satellites producteurs/consommateurs alignés. Il alloue un identifiant de phase et un plan d'implémentation délimité. Pendant `implementing` et `verification_pending`, l'inventaire V2, les tests de scénarios, le harnais, le producteur et les consommateurs de release peuvent être implémentés et testés ensemble, mais ce ne sont que des octets candidats : aucun acteur de release ne peut les consommer, le catalogue opérationnel reste sur son autorité d'avant l'activation, et aucun consommateur V2 partiel ne fait autorité.

`JOINT_IMPLEMENTATION_COMPLETED` fige un commit/arbre propre et un `OrderedReviewedImplementedModelAuthoritySetV1` valide qui constitue l'extension ordonnée exacte de l'ensemble de revue. Le bac à sable de vérification privé consomme cet ensemble implémenté et émet un `JointModelVerificationEvidenceSetV1` ordonné à six entrées ; il ne consomme ni ne fabrique d'ensemble vérifié. Le vérificateur valide chaque matrice fermée par rapport au même arbre, puis émet six reçus de vérification distincts. `JOINT_VERIFICATION_PASSED` accepte uniquement le `OrderedReviewedImplementedVerifiedModelAuthoritySetV1` résultant dont la projection de revue et d'implémentation est identique au niveau des octets à l'ensemble implémenté. Seul `JOINT_AUTHORITY_ACTIVATED` peut alors effectuer un CAS durable de catalogue qui enregistre `JointReleaseModelActivationV1` et bascule de manière atomique chaque consommateur d'inventaire de la V1 vers la V2. Un conflit, un uplet manquant, une bascule partielle ou tout échec entre dans `blocked` ; cela ne publie aucune activation et ne peut être réparé en éditant les champs de reçus ou en réutilisant l'identifiant de phase.

L'implémentation conjointe et son activation atomique doivent garantir que la construction de l'acteur et le scellement :

1. lisent uniquement `apps/extension/tests/mv3/scenarios.v2.json` depuis l'arbre Git validé propre et exact ;
2. exigent le schéma V2 exact et le condensat brut de blob `inventoryBlobSha256` ci-dessus ;
3. dérivent le tableau ordonné à partir de ces octets et exigent que son condensat JCS soit égal à `scenarioMatrixSha256` ci-dessus ;
4. copient ce tableau octet par octet dans l'autorité du candidat, du rapport brut et de la porte packagée ;
5. rejettent le chemin V1, la double autorité, l'écrasement par copie de travail, l'interversion de condensat, l'annotation manquante, le réordonnancement, le doublon, l'omission, la relance ou le diagnostic ;
6. lient l'ensemble d'autorité vérifié exact à six entrées ordonnées de la clarification 11, y compris la révision 11 et la révision 26, plus le reçu d'activation conjointe, dans l'autorité du candidat, de l'audit et de la porte.

L'approbation de l'un ou l'autre modèle seul n'autorise pas une bascule. Les revues n'autorisent que l'entrée dans la phase fermée d'implémentation conjointe ; l'implémentation vérifiée n'autorise que la tentative d'activation atomique ; seul un reçu d'activation validé admet un candidat de release.

## Surfaces d'UI exactes

La preuve des routes réutilise les surfaces accessibles actuelles au lieu de la position CSS ou de l'ordre des icônes :

| Onglet       | Nom accessible du bouton de navigation | Surface de page requise                   | En-tête requis                               |
| ------------ | -------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| Missions     | `Missions`                             | `feed-scroll-container` et `mission-feed` | `Feed de missions` (h1 en sr-only)           |
| Profil       | `Profil`                               | `page-profile`                            | `Votre profil MissionPulse` ou `Bonjour ...` |
| CV           | `CV`                                   | `page-cv`                                 | `CV & expériences`                           |
| Candidatures | `Suivi`                                | `page-applications`                       | `Candidatures`                               |
| TJM          | `TJM`                                  | `page-tjm`                                | `Analyse TJM`                                |
| Réglages     | `Réglages`                             | `page-settings`                           | `Réglages`                                   |

À chaque checkpoint de route, `.panel-shell` doit avoir une largeur et une hauteur non nulles, un texte rendu non vide, pas de `bootstrap-error` et pas de `[data-testid^='page-load-error-']`.

## Limites fixes

La preuve est délimitée indépendamment des valeurs par défaut de Playwright :

```text
scenario count                         = 13 total, 4 new
new grouped tab workflows              = 2
new auxiliary workflows                = 2
tabs                                   = 6
business checkpoints per grouped test = 3
post-reload UI actions per checkpoint  <= 1
warm proof reloads                     <= 8 across the 4 new scenarios
missions seeded per scenario           <= 2
profiles seeded per scenario           <= 1
experiences seeded per scenario        = 0
tracking rows seeded per scenario      <= 1
TJM records seeded per scenario        <= 4
chrome.storage seed keys               <= 8
IndexedDB rows captured per store      <= 16
capture attempts per checkpoint        <= 40
capture polling interval               = 100 ms
UI action timeout                      = 15 s
checkpoint timeout                     = 45 s
scenario timeout                       = 180 s
network recovery timeout               = 10 s
service-worker restarts in new tests   = 0
```

Le premier dépassement ou timeout produit un événement d'échec typé. Il n'y a pas d'attente active (polling) non bornée, de relance récursive, de succès basé sur du sommeil (sleep), de file d'attente cachée ou de continuation au mieux (best-effort).

## Données de fixture locales canoniques

### Indicateurs d'UI partagés ne faisant pas autorité

Pour les scénarios qui contournent l'onboarding, l'adaptateur d'amorçage réservé aux tests ne peut écrire que ces clés exactes ne relevant pas de la release avant d'ouvrir la page de preuve :

```text
feed_tour_seen              = true
first_scan_done             = true
kbd_cheatsheet_tip_seen     = true
profile_banner_dismissed    = true
favoriteMissions            = {}
```

Il ne doit pas amorcer `settings`, `onboarding_completed`, `missionpulse_settings_release_v1`, `premium_enabled` ou `premium_feature_enabled`. Le consentement est établi via le véritable protocole de messages de release des réglages après l'ouverture de la page.

### Profil de base

Le profil exact de précondition est stocké sous la clé IndexedDB `current` :

```json
{
  "availability": null,
  "experiences": [],
  "firstName": "Avant",
  "jobTitle": "Consultant Frontend",
  "keywords": ["Svelte", "TypeScript"],
  "location": "Paris",
  "remote": "hybrid",
  "seniority": "senior",
  "tjmMax": 900,
  "tjmMin": 650
}
```

L'enregistrement IndexedDB physique ajoute uniquement `id: 'current'`. Les lectures publiques de profil ne doivent pas exposer cette clé de persistance.

### Fixture de mission

L'adaptateur d'amorçage du service worker construit `scrapedAt` sous la forme d'une véritable `Date` à partir de `2026-07-17T08:05:00.000Z` ; tous les autres champs correspondent à ces valeurs exactes :

```json
{
  "client": "Client Preuve",
  "description": "Mission locale de preuve pour le package MV3.",
  "duration": "6 mois",
  "id": "mv3-tab-proof-001",
  "location": "Paris",
  "publishedAt": "2026-07-17T08:00:00.000Z",
  "remote": "hybrid",
  "score": 91,
  "scoreBreakdown": null,
  "semanticReason": null,
  "semanticScore": null,
  "seniority": "senior",
  "source": "free-work",
  "stack": ["Svelte", "TypeScript"],
  "startDate": "2026-09-01",
  "title": "Architecte TypeScript Packaged",
  "tjm": 850,
  "url": "https://example.invalid/missions/mv3-tab-proof-001"
}
```

Le scénario des candidatures utilise la même forme de mission valide avec l'identifiant `mv3-application-proof-001` et le titre `Lead Svelte Candidature`.

### Fixtures de suivi

Le scénario Feed commence par cet enregistrement canonique détecté, où `T0 = 1735689600000` :

```json
{
  "currentStatus": "detected",
  "generatedAssetIds": [],
  "history": [{ "from": null, "note": null, "timestamp": 1735689600000, "to": "detected" }],
  "missionId": "mv3-tab-proof-001",
  "nextActionAt": null,
  "notes": "",
  "userRating": null
}
```

Le scénario des candidatures commence à `selected` avec deux entrées d'historique contiguës : l'enregistrement ci-dessus pour `mv3-application-proof-001`, suivi de `{from:'detected', to:'selected', timestamp:T0+1000, note:null}`.

### Fixture d'historique TJM

`chrome.storage.local['tjm_history']` contient exactement quatre enregistrements `svelte` :

| Date         | Région          | Séniorité   | Min | Max | Moyenne | Nombre d'échantillons |
| ------------ | --------------- | ----------- | --: | --: | ------: | --------------------: |
| `2026-06-01` | `ile-de-france` | `senior`    | 650 | 750 |     700 |                     4 |
| `2026-07-01` | `ile-de-france` | `senior`    | 700 | 800 |     750 |                     4 |
| `2026-06-01` | `lyon`          | `confirmed` | 550 | 650 |     600 |                     3 |
| `2026-07-01` | `lyon`          | `confirmed` | 580 | 680 |     630 |                     3 |

L'analyse non filtrée doit exposer quatre points de données ainsi qu'`Île-de-France` et `Lyon`. Le filtrage sur `ile-de-france` doit exposer deux points de données, exactement un aperçu (insight) de région et le libellé `Île-de-France`.

## Point de raccordement de données du service worker réservé aux tests

Le harnais actuel peut amorcer `chrome.storage.local` mais ne dispose d'aucun port typé de fixtures IndexedDB. L'implémentation requiert donc un `PackagedScenarioDataAdapterV1` réservé aux tests sous `tests/` ; il n'est jamais importé par `src/`, jamais intégré dans le bundle `dist`, et jamais exposé au code applicatif.

L'adaptateur est sérialisé sous la forme d'une chaîne source immuable unique, hachée au moment du build de test et exécutée uniquement via la capacité actuelle d'évaluation du service worker instrumenté. Son résultat n'est admis qu'après qu'un décodeur strict a vérifié `schemaVersion`, `scenarioId`, `operationId`, les décomptes et le condensat. Un texte d'évaluation arbitraire, de la prose renvoyée ou un texte d'exception ne sélectionne jamais une transition.

L'adaptateur comporte exactement trois opérations :

```text
WAIT_READY
SEED_EXACT_SCENARIO
CAPTURE_EXACT_SCENARIO
```

`WAIT_READY` prouve l'ensemble des points suivants avant l'amorçage :

- `missionpulse.appDataVersion === 2` ;
- le nom de base de données IndexedDB est `missionpulse` et la version est `5` ;
- les magasins `missions`, `profile`, `connector_status`, `generated_assets`, `mission_tracking` et `quarantine` existent ;
- le profil vierge ne contient aucune ligne de mission, de profil ou de suivi ;
- aucun fait de rétrogradation (downgrade), d'erreur de migration ou de mise en quarantaine n'est présent.

`SEED_EXACT_SCENARIO` n'accepte qu'une fixture fermée discriminée provenant de ce modèle. Il vérifie que les magasins cibles sont toujours vides, écrit les lignes exactes de mission/profil/suivi en une seule transaction IndexedDB délimitée, écrit uniquement les clés de stockage de scénario sur liste blanche, ferme son descripteur de base de données, relit chaque valeur écrite et renvoie un `ScenarioSeedReceiptV1`. Il n'efface ni ne réinitialise jamais les données de production, n'ouvre jamais une version de base de données différente et ne touche jamais à l'enveloppe de release des réglages.

`CAPTURE_EXACT_SCENARIO` est en lecture seule. Il ferme son descripteur de base de données avant de renvoyer un instantané (snapshot) normalisé. Les dates deviennent des chaînes ISO ; les clés d'objets et les tableaux de résultats de clés primaires sont triés avant le hachage JCS. Il capture uniquement :

- les clés de stockage sur liste blanche pertinentes pour le scénario courant ;
- l'instantané public actuel de release des réglages et la projection brute de l'enveloppe V1 ;
- au plus 16 lignes de chacun des magasins `missions`, `profile` et `mission_tracking` ;
- le nom de la base de données, la version de la base de données et les noms des magasins.

Le SHA-256 de la source de l'adaptateur, le SHA-256 JCS de la fixture, l'identifiant d'opération et le SHA-256 JCS du résultat sont inclus dans chaque reçu. Une non-concordance de hachage source, une valeur malformée, une ligne inattendue, une clé d'amorçage supplémentaire, une non-concordance à la relecture, une ouverture bloquée, une dérive de version ou un abandon de transaction échoue de façon hermétique (fail-closed).

Lorsque la machine consomme l'événement corrélé exact `PRECONDITIONS_PROVED`, `SEED_EXACT_SCENARIO` est désactivé de manière permanente. Seules les captures en lecture seule restent disponibles. Toute mutation métier après cette transition explicite provient d'une action d'UI visible.

## Configuration du consentement pour les scénarios sans onboarding

Après l'amorçage local et la première ouverture du panneau, mais avant le premier checkpoint métier, la page utilise le véritable protocole de pont :

1. envoyer `GET_SETTINGS_RELEASE` et exiger un instantané confirmé avec `onboardingCompleted:false` ;
2. envoyer une intention `MUTATE_SETTINGS_RELEASE` avec `kind:'set_consent'`, un identifiant de requête UUID vierge, la `baseRevision` exacte renvoyée et `targetConsent:true` ;
3. exiger une issue `set_consent` `settled` / `committed` dont l'instantané comporte `onboardingCompleted:true` ;
4. effectuer un rechargement de configuration (setup reload) et exiger le même consentement confirmé depuis un nouvel amorçage de l'application.

Un consentement déjà vrai dans un scénario vierge constitue une contamination de fixture et échoue. La mutation de configuration n'est pas comptabilisée comme l'une des six mutations d'onglets.

## Instantané de persistance et rechargement à chaud

Chaque checkpoint métier produit un `PersistenceCheckpointV1` :

```text
{
  schemaVersion: 1,
  scenarioId,
  checkpointId,
  playwrightEpoch,
  pageUrl,
  adapterSha256,
  projection,
  projectionSha256
}
```

La projection contient uniquement les champs nommés par ce checkpoint. Elle est capturée après accusé de réception durable, puis à nouveau après rechargement. Une égalité JCS exacte est exigée sauf pour les champs décrits explicitement comme des bornes temporelles relationnelles. Aucun champ ne peut être silencieusement omis pour faire réussir l'égalité.

Un **rechargement de preuve à chaud** (warm proof reload) correspond exactement à :

```text
même Page + même BrowserContext + même PID Chromium + même répertoire de données utilisateur
-> page.reload({ waitUntil: 'domcontentloaded' })
-> amorçage de l'application prêt
-> aucun amorçage (seed), aucune réinitialisation et aucun redémarrage du service worker
-> revenir à l'onglet du checkpoint
-> assertion d'UI + capture de persistance en lecture seule
```

La navigation actuelle étant éphémère, un rechargement peut légitimement revenir à Feed. Le test doit revenir à l'onglet cible au lieu de prétendre que l'onglet sélectionné lui-même est persisté.

## Machine de scénario packagé

Chaque nouveau scénario Playwright invoque une `packagedTabScenarioMachine` XState v5 privée. Le modèle détient les décisions ; le shell détient les I/O de navigateur, page, stockage, horloge, UUID, hachage et assertions.

### Contexte

```text
scenarioId
scenarioAttempt = 1
authorityMode = verification_only | activated_release
operationGeneration
scenarioPlanSha256
adapterSha256
fixtureSha256
dependencyAuthority | null
seedReceipt | null
currentCheckpointIndex
currentActionIndex
currentPostReloadActionIndex
checkpointPlan[]
preMutationSnapshot | null
postMutationSnapshot | null
postReloadSnapshot | null
networkMode = online | offline | restoring
pendingEffect | null
pageIdentity | null
failure | null
```

`dependencyAuthority` est l'union discriminée fermée suivante ; aucune forme commune ne peut effacer la frontière de phase :

```ts
type PackagedScenarioDependencyAuthorityV6 =
  | {
      authorityMode: 'verification_only';
      implementedModelAuthoritySetSha256: Sha256;
      sandboxSha256: Sha256;
      immutableSourceExecutionAuthoritySha256: Sha256;
      commandReceiptSetSha256: Sha256;
      activationSha256: null;
    }
  | {
      authorityMode: 'activated_release';
      verifiedModelAuthoritySetSha256: Sha256;
      activationSha256: Sha256;
      immutableSourceExecutionAuthoritySha256: Sha256;
      commandReceiptSetSha256: Sha256;
      sandboxSha256: null;
    };
```

La variante de vérification est acceptée uniquement avec le payload complet de l'événement privé contenant l'ensemble implémenté et le bac à sable. La variante activée est acceptée uniquement avec le payload complet de l'événement de production contenant l'activation conjointe et son ensemble vérifié. Dans les deux variantes, `commandReceiptSetSha256` est le condensat du tableau complet non vide ordonné `ImmutableGitSourceCommandReceiptV1` détenu par le parent. Chaque reçu lie la même `immutableSourceExecutionAuthoritySha256` et le plan de commandes de scénario exact ; l'événement achemine les reçus via son bac à sable ou son activation plutôt qu'un substitut de condensat seul fourni par le consommateur. Tout champ d'autorité inconnu ou supplémentaire provoque le rejet.

`pendingEffect` est exactement :

```text
{
  effectId,
  operationGeneration,
  effectKind,
  checkpointId | null,
  actionId | null
}
```

`scenarioAttempt` ne peut être que `1`. L'exécuteur Playwright peut relancer un test ayant échoué à des fins de diagnostic en dehors d'une commande de release, mais une preuve de release avec des tentatives supérieures à zéro est inéligible.

Chaque entrée délimitée de `checkpointPlan` contient les unions discriminées fermées `mutationActions[]` et `postReloadActions[]`. Les plans post-rechargement non vides actuels sont exactement A2 `OPEN_PROFILE_EDITOR_AFTER_RELOAD`, A3 `EXPAND_SAVED_EXPERIENCE_DETAILS` et B2 `REAPPLY_TJM_REGION_FILTER_AFTER_RELOAD` ; tous les autres checkpoints actuels ont une liste d'actions post-rechargement vide.

La machine a au plus un `pendingEffect`. Avant d'émettre une commande Shell, une action nommée `allocateEffect` incrémente `operationGeneration` exactement une fois, conserve l'uplet en attente complet et place ce même uplet dans la commande. Chaque résultat d'effet répète l'ensemble des cinq champs plus un SHA-256 de reçu strict. La garde nommée `isCurrentEffectResult` exige une égalité exacte avec l'uplet conservé et les scénario/checkpoint/action actuels. Un résultat courant efface de manière atomique l'uplet en attente avant que tout successeur ne soit alloué. Un résultat précoce, périmé, de mauvais type, de mauvais checkpoint, de mauvaise action, dupliqué ou postérieur à une annulation ne peut pas affecter le contexte ni faire avancer l'état.

Les événements de contrôle transportent `scenarioId`, un `eventId` délimité unique et l'exact `operationGeneration` actuel. Les événements de résultat d'effet transportent en outre l'uplet complet d'effet en attente et `receiptSha256`. `CHECKPOINT_STARTED` est l'unique événement de contrôle interne : la machine privée le lève de manière synchrone via l'action pure nommée `raiseCheckpointStarted` avec l'index de checkpoint exact, l'identifiant, le condensat du plan de scénario, la génération actuelle, `causeEffectId` et `causeReceiptSha256` copiés depuis le `PRECONDITIONS_PROVED` ou `CHECKPOINT_PROVED` tout juste consommé. La garde `isCurrentCheckpointStart` fait correspondre chacun de ces champs par rapport au contexte conservé. Il n'est pas exposé par la façade publique, ne peut être fourni par le shell de test et ne peut découler de la seule entrée dans l'état.

### Événements fermés

```text
START
DEPENDENCIES_ADMITTED
VERIFICATION_DEPENDENCIES_ADMITTED
DEPENDENCY_ADMISSION_FAILED
READY_PROVED
SEED_PROVED
PANEL_OPENED
CONSENT_PROVED
PRECONDITIONS_PROVED
CHECKPOINT_STARTED
CHECKPOINT_ROUTE_PROVED
PRE_MUTATION_CAPTURED
UI_ACTION_PROVED
POST_MUTATION_CAPTURED
WARM_RELOAD_PROVED
POST_RELOAD_ACTION_READY
UI_REASSERTED
POST_RELOAD_CAPTURED
CHECKPOINT_PROVED
OFFLINE_FLOW_PROVED
OFFLINE_FLOW_FAILED
DIAGNOSTICS_PROVED
SCENARIO_FINISHED
EFFECT_FAILED
TIMEOUT
CANCELLED
CLEANUP_PROVED
CLEANUP_FAILED
```

`PRE_MUTATION_CAPTURED` est un résultat d'effet pour la commande en attente `CAPTURE_PERSISTENCE/captureKind:'before'`. Il répète l'identifiant d'effet exact de cette commande, la génération d'opération, le type d'effet, l'identifiant de checkpoint, l'identifiant d'action null et le SHA-256 du reçu, ainsi que l'index de checkpoint exact et le SHA-256 de la projection avant. `UI_REASSERTED` est un résultat d'effet pour la commande en attente `REASSERT_CHECKPOINT_UI`. Il répète l'identifiant d'effet exact de cette commande, la génération d'opération, le type d'effet, l'identifiant de checkpoint, l'identifiant d'action null et le SHA-256 du reçu, ainsi que l'index de checkpoint exact, le SHA-256 de l'ensemble d'assertions d'UI post-rechargement et l'identité de page. Aucun des deux ne peut être déduit de l'entrée dans un état, de la résolution d'un sélecteur (locator), d'une prose visible ou d'une capture ultérieure. Les événements inconnus ou malformés sont rejetés à la frontière du schéma ; les événements valides selon le schéma mais périmés ou discordants sont conservés comme diagnostics et ignorés.

`POST_RELOAD_ACTION_READY` est un résultat d'effet pour la commande en attente `PREPARE_POST_RELOAD_UI_ACTION`. Il répète l'uplet d'effet complet, l'identifiant/index d'action post-rechargement, l'identifiant/hachage exact du contrat d'ancre accessible, `controlledTargetId:string|null` et le SHA-256 de l'ensemble d'assertions de précondition. Le décodeur d'action fermé n'exige un `controlledTargetId` non nul que pour A3 et exige qu'il soit égal à l'`aria-controls` de la bascule ; A2 et B2 exigent null. Un `UI_ACTION_PROVED` post-rechargement transporte en outre `actionPhase:'post_reload'` et doit correspondre à cette preuve de préparation conservée. La variante de phase de mutation transporte `actionPhase:'mutation'`. Les deux variantes ne peuvent pas satisfaire la garde de l'autre.

### États et transitions

| État                                                                                   | Événement / garde nommée                                                                                                         | Suivant                            | Effet / action nommée                                                                                                                 |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`                                                                                 | `START`, identifiant de scénario exact, génération `0`                                                                           | `dependency_admitting`             | allouer et invoquer `ADMIT_REQUIRED_AUTHORITIES`                                                                                      |
| `dependency_admitting`                                                                 | `DEPENDENCIES_ADMITTED` actuel, activation exacte, ensemble vérifié ordonné et autorité de source immuable                       | `waiting_ready`                    | consommer ; définir `authorityMode:'activated_release'` ; allouer `WAIT_FOR_STORAGE_READY`                                            |
| `dependency_admitting`                                                                 | `VERIFICATION_DEPENDENCIES_ADMITTED` privé actuel, bac à sable exact, ensemble implémenté ordonné et autorité de source immuable | `waiting_ready`                    | consommer ; définir `authorityMode:'verification_only'` ; allouer `WAIT_FOR_STORAGE_READY`                                            |
| `dependency_admitting`                                                                 | `DEPENDENCY_ADMISSION_FAILED` actuel                                                                                             | `failed`                           | consommer le résultat ; figer le bloqueur ; n'émettre aucun effet de scénario                                                         |
| `dependency_admitting`                                                                 | `EFFECT_FAILED` actuel pour l'uplet exact en attente `ADMIT_REQUIRED_AUTHORITIES`                                                | `failed`                           | consommer et cloisonner l'effet d'admission ; figer le bloqueur de transport ; n'allouer aucun nettoyage de navigateur                |
| `dependency_admitting`                                                                 | `TIMEOUT` ou `CANCELLED` actuel pour l'uplet exact en attente `ADMIT_REQUIRED_AUTHORITIES`                                       | `failed`                           | consommer et cloisonner l'effet d'admission ; figer la cause d'origine ; n'allouer aucun nettoyage de navigateur                      |
| `waiting_ready`                                                                        | `READY_PROVED` actuel                                                                                                            | `seeding`                          | consommer ; allouer l'amorçage de scénario exact ou l'assertion d'état vierge                                                         |
| `seeding`                                                                              | `SEED_PROVED` actuel                                                                                                             | `opening_panel`                    | consommer ; allouer `OPEN_SIDE_PANEL`                                                                                                 |
| `opening_panel`                                                                        | `PANEL_OPENED` actuel et `requiresConsent`                                                                                       | `consenting`                       | consommer ; allouer `SET_ONBOARDING_CONSENT`                                                                                          |
| `opening_panel`                                                                        | `PANEL_OPENED` actuel et `isOnboardingScenario`                                                                                  | `preconditions`                    | consommer ; allouer `ASSERT_PAGE_SURFACE`                                                                                             |
| `consenting`                                                                           | `CONSENT_PROVED` validé actuel                                                                                                   | `setup_reloading`                  | consommer ; allouer le `WARM_RELOAD` de configuration                                                                                 |
| `setup_reloading`                                                                      | `WARM_RELOAD_PROVED` actuel avec `reloadKind:'setup'`                                                                            | `preconditions`                    | consommer ; allouer `ASSERT_PAGE_SURFACE`                                                                                             |
| `preconditions`                                                                        | `PRECONDITIONS_PROVED` actuel et plan non hors-ligne                                                                             | `checkpoint_selecting`             | consommer ; action pure nommée `raiseCheckpointStarted`                                                                               |
| `preconditions`                                                                        | `PRECONDITIONS_PROVED` actuel et plan hors-ligne                                                                                 | `offline_running`                  | consommer ; invoquer l'enfant privé hors-ligne avec le condensat de plan exact                                                        |
| `checkpoint_selecting`                                                                 | `CHECKPOINT_STARTED` interne exact                                                                                               | `checkpoint_navigating`            | allouer `NAVIGATE_TO_TAB` pour le checkpoint exact                                                                                    |
| `checkpoint_navigating`                                                                | `CHECKPOINT_ROUTE_PROVED` actuel                                                                                                 | `checkpoint_capturing_before`      | consommer ; allouer `CAPTURE_PERSISTENCE` avec `captureKind:'before'`                                                                 |
| `checkpoint_capturing_before`                                                          | `PRE_MUTATION_CAPTURED` actuel                                                                                                   | `checkpoint_mutating`              | consommer ; conserver l'instantané avant ; allouer la première action d'UI indexée                                                    |
| `checkpoint_mutating`                                                                  | `UI_ACTION_PROVED` actuel avec `actionPhase:'mutation'` et `hasMoreActions`                                                      | `checkpoint_mutating`              | consommer ; incrémenter l'index d'action ; allouer l'action d'UI exacte suivante                                                      |
| `checkpoint_mutating`                                                                  | `UI_ACTION_PROVED` actuel avec `actionPhase:'mutation'` et `isFinalAction`                                                       | `checkpoint_capturing_after`       | consommer ; allouer le polling de `CAPTURE_PERSISTENCE` avec `captureKind:'after'`                                                    |
| `checkpoint_capturing_after`                                                           | `POST_MUTATION_CAPTURED` actuel et `mutationInvariantsHold`                                                                      | `checkpoint_reloading`             | consommer ; conserver l'instantané après ; allouer le `WARM_RELOAD` de preuve                                                         |
| `checkpoint_reloading`                                                                 | `WARM_RELOAD_PROVED` actuel avec l'identifiant exact de checkpoint et `hasNoPostReloadActions`                                   | `checkpoint_reasserting`           | consommer ; allouer `REASSERT_CHECKPOINT_UI`                                                                                          |
| `checkpoint_reloading`                                                                 | `WARM_RELOAD_PROVED` actuel avec l'identifiant exact de checkpoint et `hasPostReloadActions`                                     | `checkpoint_post_reload_preparing` | consommer ; réinitialiser l'index d'action post-rechargement ; allouer `PREPARE_POST_RELOAD_UI_ACTION`                                |
| `checkpoint_post_reload_preparing`                                                     | `POST_RELOAD_ACTION_READY` actuel pour l'action indexée exacte                                                                   | `checkpoint_post_reload_acting`    | consommer ; conserver la preuve de précondition accessible ; allouer l'action d'UI fermée exacte                                      |
| `checkpoint_post_reload_acting`                                                        | `UI_ACTION_PROVED` actuel avec `actionPhase:'post_reload'` et `hasMorePostReloadActions`                                         | `checkpoint_post_reload_preparing` | consommer ; incrémenter l'index d'action post-rechargement ; allouer la préparation suivante                                          |
| `checkpoint_post_reload_acting`                                                        | `UI_ACTION_PROVED` actuel avec `actionPhase:'post_reload'` et `isFinalPostReloadAction`                                          | `checkpoint_reasserting`           | consommer ; allouer `REASSERT_CHECKPOINT_UI`                                                                                          |
| `checkpoint_reasserting`                                                               | `UI_REASSERTED` actuel                                                                                                           | `checkpoint_recapturing`           | consommer ; conserver la preuve d'UI ; allouer `CAPTURE_PERSISTENCE` avec `captureKind:'after_reload'`                                |
| `checkpoint_recapturing`                                                               | `POST_RELOAD_CAPTURED` actuel et égalité exacte de projection                                                                    | `checkpoint_freezing`              | consommer ; conserver l'instantané de rechargement ; allouer `FREEZE_CHECKPOINT_EVIDENCE`                                             |
| `checkpoint_freezing`                                                                  | `CHECKPOINT_PROVED` actuel et `hasMoreCheckpoints`                                                                               | `checkpoint_selecting`             | consommer ; incrémenter l'index de checkpoint ; réinitialiser l'index d'action ; action pure nommée `raiseCheckpointStarted`          |
| `checkpoint_freezing`                                                                  | `CHECKPOINT_PROVED` actuel et `isFinalCheckpoint`                                                                                | `diagnostics_checking`             | consommer ; allouer `ASSERT_RUNTIME_DIAGNOSTICS`                                                                                      |
| `offline_running`                                                                      | `CANCELLED` parent actuel exact                                                                                                  | `offline_running`                  | transmettre le `OFFLINE_CANCELLED` corrélé ; l'enfant cloisonne son effet et gère son nettoyage                                       |
| `offline_running`                                                                      | `TIMEOUT` parent actuel exact pour l'échéance de l'enfant                                                                        | `offline_running`                  | transmettre le `OFFLINE_TIMEOUT` corrélé ; l'enfant cloisonne son effet et gère son nettoyage                                         |
| `offline_running`                                                                      | `OFFLINE_FLOW_PROVED` enfant actuel avec preuve terminale en ligne                                                               | `diagnostics_checking`             | conserver le reçu enfant ; allouer `ASSERT_RUNTIME_DIAGNOSTICS`                                                                       |
| `offline_running`                                                                      | `OFFLINE_FLOW_FAILED` enfant actuel                                                                                              | `failed_cleaning`                  | conserver le reçu d'échec/nettoyage enfant ; allouer un nettoyage idempotent en ligne                                                 |
| `diagnostics_checking`                                                                 | `DIAGNOSTICS_PROVED` actuel                                                                                                      | `finishing`                        | consommer ; allouer `FREEZE_SCENARIO_EVIDENCE`                                                                                        |
| `finishing`                                                                            | `SCENARIO_FINISHED` actuel et `authorityMode === 'activated_release'`                                                            | `passed`                           | consommer ; figer la preuve finale de release                                                                                         |
| `finishing`                                                                            | `SCENARIO_FINISHED` actuel et `authorityMode === 'verification_only'`                                                            | `verified_only`                    | consommer ; figer les preuves de vérification de modèle hors-release                                                                  |
| tout état actif sauf admission des dépendances, `offline_running` et `failed_cleaning` | `EFFECT_FAILED` actuel                                                                                                           | `failed_cleaning`                  | consommer/cloisonner l'effet actuel ; conserver l'échec ; allouer un nettoyage en ligne exactement une fois                           |
| tout état actif sauf admission des dépendances, `offline_running` et `failed_cleaning` | `TIMEOUT` ou `CANCELLED` actuel                                                                                                  | `failed_cleaning`                  | conserver l'événement ; cloisonner l'ancien effet avec l'unique nouvelle génération allouée au nettoyage en ligne exactement une fois |
| `failed_cleaning`                                                                      | `CLEANUP_PROVED` actuel                                                                                                          | `failed`                           | consommer ; figer l'échec d'origine plus la preuve de nettoyage                                                                       |
| `failed_cleaning`                                                                      | `CLEANUP_FAILED` actuel                                                                                                          | `failed`                           | consommer ; figer l'échec agrégé ; ne jamais passer en succès                                                                         |

`passed`, `verified_only` et `failed` sont finals. `verified_only` ne détient aucune autorité de release et ne peut pas transiter vers `passed`. Un scénario en échec ne peut pas être guéri par une capture ultérieure, un rechargement, une relance ou un succès de nettoyage. Chaque ligne de table nomme le seul événement qui peut la faire avancer ; l'entrée dans l'état, l'achèvement d'une Promise, le texte d'un locator et l'ordre d'arrivée des effets n'ont aucune autorité de transition.

Les trois lignes de transport d'admission sont fermées et exhaustives. Leur garde exige l'identifiant de scénario conservé exact, l'identifiant d'effet, la génération d'opération, le type d'effet `ADMIT_REQUIRED_AUTHORITIES`, des identifiants de checkpoint/action nuls et l'échéance d'admission actuelle le cas échéant. Un `EFFECT_FAILED`, `TIMEOUT` ou `CANCELLED` précoce, périmé, dupliqué, de mauvais type ou de mauvaise génération est une absence d'opération (no-op) exacte de diagnostic. Un échec d'admission courant efface/cloisonne l'uplet conservé, fige la cause typée et entre dans `failed` final ; comme aucun navigateur ni adaptateur de scénario n'a été alloué, il n'alloue jamais `ONLINE_CLEANUP`.

`failed_cleaning` est explicitement en dehors de toute transition générique ou `tout état actif`. Son prédécesseur alloue un effet de nettoyage et une génération de nettoyage avant l'entrée ; l'état lui-même n'alloue, ne relance ni ne remplace jamais cet effet. Ses seules transitions sortantes sont les deux lignes ci-dessus : `CLEANUP_PROVED -> failed` et `CLEANUP_FAILED -> failed`. Un rejet de transport de nettoyage, l'expiration de l'échéance de nettoyage ou un échec d'assertion de nettoyage est décodé directement comme l'unique `CLEANUP_FAILED` corrélé ; il n'est jamais réémis sous forme de `EFFECT_FAILED` ou de second `TIMEOUT`. `TIMEOUT`, `CANCELLED`, `EFFECT_FAILED`, les résultats de nettoyage dupliqués/périmés et tout autre événement n'ont aucune transition dans `failed_cleaning`, n'allouent aucune génération ni aucun effet et ne peuvent pas prolonger l'échéance de nettoyage. Ainsi, le nettoyage ne comporte aucune relance, aucune réallocation, aucun nettoyage récursif ni aucun chemin de second timeout.

### Liste blanche des effets

La machine ne peut émettre que ces commandes :

```text
ADMIT_REQUIRED_AUTHORITIES
WAIT_FOR_STORAGE_READY
SEED_SCENARIO
OPEN_SIDE_PANEL
SET_ONBOARDING_CONSENT
NAVIGATE_TO_TAB
CAPTURE_PERSISTENCE
CAPTURE_PAGE_TIMEZONE_ISO
CLICK_UI_CONTROL
FILL_UI_CONTROL
SELECT_UI_OPTION
WARM_RELOAD
PREPARE_POST_RELOAD_UI_ACTION
REASSERT_CHECKPOINT_UI
FREEZE_CHECKPOINT_EVIDENCE
FREEZE_SCENARIO_EVIDENCE
SET_BROWSER_CONTEXT_OFFLINE
SET_BROWSER_CONTEXT_ONLINE
ASSERT_PAGE_SURFACE
ASSERT_RUNTIME_DIAGNOSTICS
RESTORE_NETWORK_FOR_CLEANUP
```

Aucune commande n'accepte d'expression JavaScript libre, de sélecteur ou de statut attendu. Les plans de scénario sont des unions discriminées fermées compilées à partir de ce document. Un LLM ne peut pas générer de sélecteur, de fixture, de valeur attendue, d'événement ou de transition à l'exécution.

## Machine enfant de preuve hors-ligne

`packaged-tabs.offline-recovery` ne réutilise pas la boucle de checkpoint générique pour l'autorité réseau. `offline_running` invoque une `packagedOfflineProofMachine` privée dont l'état constitue la seule autorité pour le mode réseau, l'ordre de rechargement, la navigation et la récupération.

Son contexte conserve `scenarioId`, `scenarioPlanSha256`, `childGeneration`, `pendingOfflineEffect`, l'identité de la page, le condensat de persistance pré-hors-ligne, le condensat de favori hors-ligne, le condensat TJM hors-ligne, le condensat post-rechargement, le condensat de récupération, `networkMode` et le premier échec/annulation. L'enfant applique la même règle d'effet en attente unique : chaque résultat répète la génération enfant exacte, l'identifiant d'effet, le type, l'identité de page, l'identifiant de scénario et le SHA-256 du reçu.

Les événements fermés de l'enfant sont :

```text
OFFLINE_REQUESTED
OFFLINE_PROVED
OFFLINE_FEED_PROVED
OFFLINE_FAVORITE_PROVED
OFFLINE_TJM_NAVIGATION_PROVED
OFFLINE_TJM_PROVED
OFFLINE_RELOAD_PROVED
OFFLINE_FEED_REASSERTED
OFFLINE_TJM_RENAVIGATION_PROVED
OFFLINE_TJM_REASSERTED
ONLINE_PROVED
ONLINE_RECOVERY_PROVED
OFFLINE_EFFECT_FAILED
OFFLINE_TIMEOUT
OFFLINE_CANCELLED
ONLINE_CLEANUP_PROVED
ONLINE_CLEANUP_FAILED
```

`OFFLINE_REQUESTED` et `OFFLINE_CANCELLED` sont des événements de contrôle corrélés comportant l'identifiant d'événement exact et la génération enfant actuelle. Chaque `*_PROVED`, `OFFLINE_EFFECT_FAILED` et résultat de nettoyage est un événement de résultat d'effet courant avec l'uplet complet d'effet hors-ligne en attente. `OFFLINE_TIMEOUT` transporte l'identifiant d'échéance exact et la génération actuels. Aucun texte réseau libre ou valeur de `navigator.onLine` seule ne constitue un événement.

Lors de l'invocation, le parent transmet la surface de Feed en ligne déjà prouvée, l'identité de la page et le condensat de persistance pré-hors-ligne. L'action pure nommée `raiseOfflineRequested` lève de manière synchrone le seul événement interne `OFFLINE_REQUESTED` avec ces hachages conservés. Le simple fait d'entrer dans `online_baseline` ne peut pas faire avancer l'enfant. Un échec d'effet de shell détenu par l'enfant est décodé directement sous la forme de `OFFLINE_EFFECT_FAILED` ; il n'est jamais remonté sous la forme d'un `EFFECT_FAILED` parent générique.

| État enfant                                            | Événement / garde nommée                                                                       | Suivant                    | Effet                                                                                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `online_baseline`                                      | `OFFLINE_REQUESTED` interne exact et preuve d'UI/stockage de référence conservée               | `entering_offline`         | allouer `SET_BROWSER_CONTEXT_OFFLINE`                                                                                                                |
| `entering_offline`                                     | `OFFLINE_PROVED` actuel, navigateur hors-ligne et UI exacte de Feed hors-ligne                 | `offline_feed`             | consommer ; définir `networkMode:'offline'` ; allouer les assertions de Feed en cache fermées                                                        |
| `offline_feed`                                         | `OFFLINE_FEED_PROVED` actuel                                                                   | `offline_favoriting`       | consommer ; allouer l'action d'UI de favori exacte et le polling durable                                                                             |
| `offline_favoriting`                                   | `OFFLINE_FAVORITE_PROVED` actuel                                                               | `offline_tjm_navigating`   | consommer ; allouer la navigation `TJM` exacte                                                                                                       |
| `offline_tjm_navigating`                               | `OFFLINE_TJM_NAVIGATION_PROVED` actuel                                                         | `offline_tjm`              | consommer ; allouer les assertions de cache/filtre/capture du TJM hors-ligne                                                                         |
| `offline_tjm`                                          | `OFFLINE_TJM_PROVED` actuel                                                                    | `offline_reloading`        | consommer ; conserver le condensat du TJM ; allouer le rechargement à chaud en étant hors-ligne                                                      |
| `offline_reloading`                                    | `OFFLINE_RELOAD_PROVED` actuel, même processus/contexte/page et navigateur toujours hors-ligne | `offline_feed_reasserting` | consommer ; allouer la réaffirmation du shell packagé, des six onglets, du cache de Feed et du favori                                                |
| `offline_feed_reasserting`                             | `OFFLINE_FEED_REASSERTED` actuel                                                               | `offline_tjm_renavigating` | consommer ; allouer la navigation `TJM` exacte après rechargement                                                                                    |
| `offline_tjm_renavigating`                             | `OFFLINE_TJM_RENAVIGATION_PROVED` actuel                                                       | `offline_tjm_reasserting`  | consommer ; allouer la réaffirmation du cache/historique/filtre du TJM                                                                               |
| `offline_tjm_reasserting`                              | `OFFLINE_TJM_REASSERTED` actuel et égalité des données pré/post rechargement                   | `restoring`                | consommer ; définir `networkMode:'restoring'` ; allouer `SET_BROWSER_CONTEXT_ONLINE`                                                                 |
| `restoring`                                            | `ONLINE_PROVED` actuel, navigateur en ligne et écouteurs hors-ligne stabilisés                 | `online_reasserting`       | consommer ; définir `networkMode:'online'` ; allouer l'UI de récupération et la capture d'absence de perte de données                                |
| `online_reasserting`                                   | `ONLINE_RECOVERY_PROVED` actuel                                                                | `passed`                   | consommer ; figer le reçu de récupération en ligne et renvoyer `OFFLINE_FLOW_PROVED`                                                                 |
| tout état de `entering_offline` à `online_reasserting` | `OFFLINE_EFFECT_FAILED` ou `OFFLINE_TIMEOUT` actuel                                            | `failed_restoring`         | consommer/cloisonner l'effet actuel ; conserver le premier échec ; allouer `RESTORE_NETWORK_FOR_CLEANUP` comme unique incrément de génération enfant |
| tout état de `entering_offline` à `online_reasserting` | `OFFLINE_CANCELLED` exact                                                                      | `cancelled_restoring`      | cloisonner l'effet en attente ; conserver l'annulation ; allouer `RESTORE_NETWORK_FOR_CLEANUP` comme unique incrément de génération enfant           |
| `failed_restoring`                                     | `ONLINE_CLEANUP_PROVED` actuel                                                                 | `failed`                   | figer l'échec d'origine plus la preuve en ligne corrélée                                                                                             |
| `failed_restoring`                                     | `ONLINE_CLEANUP_FAILED` actuel                                                                 | `failed`                   | figer l'échec agrégé et l'échec de nettoyage                                                                                                         |
| `cancelled_restoring`                                  | `ONLINE_CLEANUP_PROVED` actuel                                                                 | `cancelled`                | figer l'annulation plus la preuve en ligne corrélée                                                                                                  |
| `cancelled_restoring`                                  | `ONLINE_CLEANUP_FAILED` actuel                                                                 | `cancelled`                | figer l'annulation plus l'échec de nettoyage                                                                                                         |

Les états finaux de l'enfant sont `passed`, `failed` et `cancelled`. `failed` et `cancelled` renvoient tous deux `OFFLINE_FLOW_FAILED` au parent avec le reçu terminal exact de l'enfant et l'indication si le nettoyage en ligne corrélé a réussi. Le nettoyage appelle `setOffline(false)` de manière idempotente même si l'échec est survenu après que le navigateur était déjà revenu en ligne. Un timeout de nettoyage, un résultat de nettoyage périmé ou une perte de page est décodé comme le résultat corrélé `ONLINE_CLEANUP_FAILED`, conservé et ne peut jamais produire `OFFLINE_FLOW_PROVED`. Le parent applique la même règle à son nettoyage idempotent final : son échéance de nettoyage délimitée émet `CLEANUP_FAILED`, jamais une transition de second `TIMEOUT` ni une attente non bornée.

## Scénario A — Persistance Feed, Profil et CV

Identifiant de scénario :
`packaged-tabs.feed-profile-cv-persistence`.

La configuration écrit les drapeaux partagés, le profil de base, la mission `mv3-tab-proof-001`, des favoris vides et son enregistrement de suivi détecté. Elle établit ensuite le consentement via le protocole de release actuel.

### Checkpoint A1 — Favori et suivi du Feed

1. Naviguer via le bouton exact `Missions` et résoudre exactement un `role=article` dont le nom accessible est `Mission Architecte TypeScript Packaged chez Client Preuve` à l'intérieur de `mission-feed`. La racine de l'article est non interactive : elle n'a aucune transition au clic ou au clavier, aucun `tabindex`, et ne se fait jamais passer pour un bouton.
2. Délimiter chaque contrôle suivant à cet article. Résoudre exactement un bouton de favori nommé `Ajouter la mission aux favoris` avec `aria-pressed=false`. Résoudre exactement un `role=group` nommé `Statut de la mission Architecte TypeScript Packaged` ; à l'intérieur de ce groupe, résoudre exactement un `role=status` nommé `Statut actuel : Détectée` et un bouton de transition autorisée nommé `Passer le statut à Sélectionnée`. Résoudre exactement un bouton de divulgation nommé `Afficher les détails de la mission Architecte TypeScript Packaged`. La divulgation détient `aria-expanded=false` et `aria-controls=<stable bounded mission details id>` avant son premier clic. Cet identifiant est unique dans le document, demeure identique en octets pour l'article monté, correspond à `^mission-details-[A-Za-z][A-Za-z0-9-]{0,63}$` et compte entre 17 et 80 unités de code ASCII inclusivement. Un contenu interactif imbriqué dans une racine de carte interactive, une correspondance globale à la page, un index de carte, `nth`, une classe CSS, une position en pixels ou une simple correspondance sur le titre textuel brut constitue un échec terminal d'ancre.
3. Cliquer sur la divulgation délimitée exactement une fois. Exiger que ce même bouton expose le nouveau nom accessible `Masquer les détails de la mission Architecte TypeScript Packaged`, `aria-expanded=true` et que son `role=region` visible contrôlé, avec l'identifiant conservé exact, soit nommé `Détails de la mission Architecte TypeScript Packaged`. Cette transition de divulgation en ligne est distincte de `onInvestigate`/navigation par tiroir ; aucune des deux transitions ne peut être déduite d'un clic sur la surface de l'article.
4. Enregistrer `actionStartedAt` depuis le shell de test.
5. Cliquer sur `Ajouter la mission aux favoris`. Le nom accessible et l'état pressé demeurent `Ajouter la mission aux favoris` / `false` jusqu'à ce que l'accusé de réception corrélé de persistance du favori soit consommé ; c'est seulement alors qu'ils deviennent `Retirer la mission des favoris` / `true`.
6. Cliquer sur la cible de statut autorisée `Passer le statut à Sélectionnée` depuis l'état de suivi amorcé `Détectée`. De l'allocation de l'effet jusqu'à son accusé de réception de suivi corrélé ou son échec, le groupe de statuts nommé expose `aria-busy=true`, le statut actuel demeure `Statut actuel : Détectée` et chaque contrôle de transition du groupe est désactivé. Un accusé de réception validé modifie la projection unique de statut en `Statut actuel : Sélectionnée`, efface busy et projette l'ensemble des transitions autorisées suivantes. Un échec efface busy, préserve `Détectée`, réactive uniquement les contrôles toujours autorisés et émet `EFFECT_FAILED` ; un texte optimiste ne peut pas normaliser ce chemin en succès.
7. N'enregistrer `actionSettledAt` qu'après que les lectures publiques du pont et la capture de persistance brute concordent.

La projection durable doit prouver :

- `favoriteMissions` a exactement une clé propre, `mv3-tab-proof-001` ;
- sa valeur est un entier sûr dans l'intervalle inclusif `[actionStartedAt, actionSettledAt]` ;
- la ligne brute de `mission_tracking` et la projection `GET_TRACKINGS` sont égales ;
- `currentStatus === 'selected'` ;
- l'historique a exactement deux entrées contiguës et se termine par `detected -> selected` ;
- l'horodatage de la nouvelle transition se situe dans le même intervalle d'action et n'est pas inférieur à l'horodatage amorcé ;
- la ligne de mission est toujours présente et valide.

Après rechargement de preuve à chaud, le même article nommé de manière unique doit toujours exposer le même groupe de statuts nommé, aucun état occupé (busy), l'unique `role=status[name="Statut actuel : Sélectionnée"]`, et son contrôle de favori délimité nommé `Retirer la mission des favoris` avec `aria-pressed=true`. La projection durable, y compris les deux horodatages stockés, est équivalente en octets à sa projection post-mutation.

### Checkpoint A2 — Édition, sauvegarde et rechargement du profil

1. Naviguer vers `Profil` et cliquer sur `Modifier mes critères`.
2. Remplacer les champs sélectionnés par leurs véritables textes indicatifs (placeholders) :
   - `Prénom` -> `Camille Packaged` ;
   - `Poste (ex: Développeur React Senior)` -> `Architecte Svelte` ;
   - `Localisation` -> `Lyon` ;
   - `TJM min` -> `720` ;
   - `TJM max` -> `980`.
3. Remplir `Mots-clés` avec `MV3-Proof`, cliquer sur `Ajouter le mot-clé`, et exiger la nouvelle pastille (chip) avant d'enregistrer.
4. Cliquer sur `Enregistrer le profil` ; attendre que l'acteur Profile quitte `saving` et que `GET_PROFILE` ainsi que la ligne brute `profile/current` concordent.

Le profil enregistré doit préserver `remote:'hybrid'`, `seniority:'senior'`, la liste d'expériences vide et `availability:null` ; il doit préserver les deux mots-clés amorcés et ajouter `MV3-Proof` exactement une fois. Aucun champ périmé `stack` ou `searchKeywords` ne doit apparaître.

Après rechargement de preuve à chaud et retour à Profil, le plan `OPEN_PROFILE_EDITOR_AFTER_RELOAD` n'émet d'abord `POST_RELOAD_ACTION_READY` qu'après que le récapitulatif rendu et l'unique bouton `Modifier mes critères` ont prouvé l'identité modifiée. Son `UI_ACTION_PROVED` post-rechargement corrélé ouvre l'éditeur exactement une fois. C'est seulement alors que `UI_REASSERTED` peut prouver chaque valeur de formulaire modifiée. L'enregistrement physique `id:'current'` et la projection publique du profil doivent par ailleurs correspondre à leurs valeurs post-sauvegarde.

### Checkpoint A3 — Ajout, sauvegarde et rechargement de CV

1. Naviguer vers `CV` et cliquer sur `Ajouter une expérience` depuis l'état vide.
2. Remplir exactement les champs étiquetés :
   - Titre du poste : `Lead Packaged UI` ;
   - Entreprise : `MissionPulse QA` ;
   - Type de contrat : `Freelance` ;
   - Début : `2025-01` ;
   - Poste actuel : coché ;
   - Localisation : `Lyon` ;
   - Description : `Preuve CV locale dans Chrome MV3.` ;
   - Compétences : `Svelte, TypeScript, Playwright`.
3. Cliquer sur le bouton `Enregistrer` du formulaire et attendre que l'acteur d'édition du CV quitte `saving` et que le pont de profil et l'enregistrement brut concordent.

La nouvelle expérience doit avoir un identifiant généré non vide différent de `blank`, `source:'manual'`, `sourceExternalId:null`, `positionIndex:0`, `isCurrent:true`, `endDate:null`, et un entier sûr `updatedAt` situé dans l'intervalle de sauvegarde. Chaque valeur de checkpoint du Profil doit rester inchangée.

Après rechargement de preuve à chaud et retour à CV, le checkpoint A3 exécute l'action fermée `EXPAND_SAVED_EXPERIENCE_DETAILS` ; il ne déduit pas une carte ouverte à partir du texte de compétences. L'action n'est légale qu'après que la dépendance d'ancrage accessible du CV modélisée séparément a été admise. Elle doit :

1. résoudre exactement un `article` nommé `Expérience Lead Packaged UI chez MissionPulse QA` et exiger que cet article affiche `Lead Packaged UI`, `MissionPulse QA` et `Freelance` ;
2. au sein de cet article, résoudre exactement un bouton nommé `Afficher les détails de l’expérience Lead Packaged UI` avec `aria-expanded=false` et une valeur d'`aria-controls` égale à l'identifiant stable, unique et borné de région de détails conservé par `POST_RELOAD_ACTION_READY` ;
3. cliquer sur le bouton exactement une fois et consommer uniquement son événement `UI_ACTION_PROVED` corrélé ;
4. exiger que le même bouton expose `aria-expanded=true` et que la `region` visible contrôlée portant cet identifiant conservé exact soit nommée `Détails de l’expérience Lead Packaged UI` ;
5. affirmer `Svelte`, `TypeScript` et `Playwright` en tant que badges de compétences délimités à l'intérieur de cette région contrôlée avant d'émettre `UI_REASSERTED`.

Un article, une bascule, une région contrôlée ou une compétence manquant, dupliqué ou nommé différemment constitue un échec terminal. L'index de carte, `nth`, l'ascendance DOM en dehors de l'article, la classe CSS, la position en pixels et la devinette sur le texte visible sont interdits. L'identifiant généré et `updatedAt` doivent être identiques à la capture post-sauvegarde ; le rechargement ne doit pas recréer l'expérience.

## Scénario B — Persistance Candidatures, TJM et Réglages

Identifiant de scénario :
`packaged-tabs.applications-tjm-settings-persistence`.

La configuration écrit les drapeaux partagés, le profil de base, la mission de candidatures, l'enregistrement de suivi sélectionné et l'historique TJM exact à quatre enregistrements. Elle établit le consentement via le protocole de release actuel. Elle n'amorce pas d'enveloppe de Réglages ni de valeur de thème.

### Checkpoint B1 — Transition, détails et rechargement de candidature

1. Naviguer via `Suivi` vers la page `Candidatures`.
2. Sélectionner `Lead Svelte Candidature` dans la liste des missions et exiger son statut actuel `Sélectionnée`.
3. Consigner les bornes temporelles d'action et cliquer sur la cible autorisée `Préparée`.
4. Remplir `Prochaine action` avec la date/heure locale `2035-01-15T09:30`.
5. Dans le contexte de la page, calculer l'ISO attendu en utilisant la même règle de fuseau horaire de navigateur, `new Date(localValue).toISOString()`, puis cliquer sur le bouton adjacent `Enregistrer`.
6. Attendre que `GET_TRACKINGS` et la ligne brute concordent.

La ligne doit avoir `currentStatus:'application_prepared'`, une troisième entrée d'historique contiguë `selected -> application_prepared`, un horodatage de transition à l'intérieur de l'intervalle d'action et `nextActionAt` exactement égal à l'ISO capturé. Les identifiants d'assets générés, l'évaluation et les notes demeurent inchangés.

Après rechargement de preuve à chaud et retour à Suivi, la mission sélectionnée doit afficher `Préparée`, le champ de saisie de date/heure local doit restituer fidèlement `2035-01-15T09:30`, et `Historique des décisions` doit contenir la transition préparée. La projection de persistance est inchangée.

### Checkpoint B2 — Amorçage, filtrage et rechargement du TJM

1. Naviguer vers `TJM` et exiger une analyse non filtrée avec quatre points de données et un `role=region` nommé `TJM par région`. Cette région contient exactement un `h3` natif nommé `TJM par région` et une `ul` sémantique nommée `Régions analysées` ; chaque résultat de région est exactement un `li` direct dont le `h4` natif unique constitue l'identité accessible. La liste non filtrée comporte donc exactement deux éléments de liste intitulés `Île-de-France` et `Lyon`. Un `div` générique, une étiquette visuelle, une barre de progression, une option de filtrage ou une correspondance textuelle globale à la page ne peut pas satisfaire l'ancre de région, de liste, d'élément de liste ou d'en-tête.
2. Sélectionner `ile-de-france` via le contrôle étiqueté `Filtrer les tendances TJM par région`.
3. Exiger que l'analyse filtrée expose deux points de données, exactement un aperçu de région et exactement un `li` direct avec un `h4` intitulé `Île-de-France` dans la liste `Régions analysées` ; aucun `li` intitulé `Lyon` ne doit subsister à l'intérieur de `role=region[name="TJM par région"]`. Le filtre de région persistant est intentionnellement en dehors de cette assertion : `Lyon` peut et doit rester disponible dans son catalogue d'`<option>`, si bien qu'une assertion d'absence sur l'ensemble de la page est interdite.
4. Capturer `tjm_history` et exiger une égalité exacte avec les quatre enregistrements amorcés.

La région sélectionnée constitue délibérément un état d'UI éphémère. Après rechargement de preuve à chaud, `REAPPLY_TJM_REGION_FILTER_AFTER_RELOAD` ne peut émettre `POST_RELOAD_ACTION_READY` qu'après que `Toutes les régions` est sélectionné, que l'historique brut est inchangé, que l'analyse non filtrée à quatre points est revenue et que le contrôle unique étiqueté `Filtrer les tendances TJM par région` est prêt. Son `UI_ACTION_PROVED` post-rechargement corrélé sélectionne `ile-de-france` ; seul le `UI_REASSERTED` suivant peut prouver le même résultat à deux points. Persister la sélection du menu déroulant violerait ce checkpoint au lieu de le satisfaire.

### Checkpoint B3 — Mutation des réglages et rechargement

1. Naviguer vers `Réglages` et lire l'instantané de release des réglages confirmé actuel. Résoudre exactement un `role=group` nommé `Apparence`, comportant exactement les trois boutons natifs `Clair`, `Sombre` et `Système`, aucun quatrième descendant interactif et `aria-busy=false`. Chaque bouton expose un booléen explicite `aria-pressed` ; exactement un est `true`, et il correspond au thème de l'instantané confirmé.
2. Cliquer sur `Sombre` au sein de ce groupe. De l'allocation de mutation jusqu'à la consommation de l'instantané confirmé corrélé ou de l'échec, le groupe expose `aria-busy=true` et les trois contrôles sont nativement désactivés. `aria-pressed` continue de représenter le dernier thème confirmé ; il ne doit pas se déplacer de manière optimiste lors du clic physique.
3. Attendre que l'acteur des réglages d'UI se stabilise, puis exiger un instantané de release confirmé avec `settings.theme === 'dark'`, une révision et une génération strictement supérieures, aucune transaction en attente, et une enveloppe V1 brute dont le thème confirmé est également `dark`. Ce n'est qu'après cette confirmation que `Sombre` peut exposer `aria-pressed=true` ; `Clair` et `Système` exposent `aria-pressed=false`, le groupe expose `aria-busy=false`, et les trois contrôles sont activés.
4. Exiger que `document.documentElement.classList` contienne `dark`.

Si la mutation des réglages échoue, son échec corrélé rétablit `aria-busy=false` et réactive les trois contrôles, mais le bouton précédemment confirmé demeure l'unique contrôle avec `aria-pressed=true`, l'instantané de release confirmé et l'enveloppe V1 brute restent inchangés, et aucune classe de thème non confirmée n'est conservée. Ce chemin émet `EFFECT_FAILED` pour le checkpoint B3 et ne peut jamais être normalisé en succès par un toast, un état DOM optimiste ou un instantané ultérieur non corrélé.

Après rechargement de preuve à chaud et retour à Réglages, le même groupe nommé de manière unique doit exposer exactement les trois mêmes contrôles, seul `Sombre` étant pressé, aucun n'étant occupé ou désactivé. L'instantané public, le thème confirmé brut, la révision et la génération doivent être égaux à la capture post-mutation, et le document doit toujours utiliser la classe `dark`. Ceci constitue la preuve de l'enveloppe de release actuelle uniquement ; cela n'émet aucune revendication de cloisonnement d'écrivain (writer-fence) de Réglages V2.

## Scénario C — Achèvement de l'onboarding et rechargement

Identifiant de scénario : `packaged-tabs.onboarding-completion`.

La fixture est vierge. Elle ne contient aucun profil, mission, suivi, drapeau de premier scan, clé d'onboarding legacy ou consentement confirmé. Aucune opération d'amorçage n'écrit de données métier.

1. Ouvrir le panneau packagé et exiger `page-onboarding`, l'en-tête de bienvenue (hero) `Toutes vos missions freelance, centralisées et scorées.` et aucune barre de navigation. L'en-tête hero n'est rendu que par `OnboardingWelcome` une fois que le chunk `OnboardingPage` importé tardivement est résolu ; le squelette de pré-hydratation rend un placeholder différent (`Configurez votre premier scan`), si bien que l'assertion de l'en-tête hero prouve également que le véritable onboarding est monté (et non le squelette).
2. Cliquer sur `Configurer le radar`.
3. Sélectionner le premier connecteur visible depuis le catalogue filtré au build et cliquer sur `Continuer avec <name>`. L'identifiant/nom du connecteur sélectionné est capturé comme preuve d'UI éphémère uniquement.
4. Cliquer sur `Créer une première alerte`.
5. À l'étape d'alerte, remplir :
   - Prénom : `Nora Packaged` ;
   - Poste recherché : `Consultante Svelte` ;
   - Mots-clés : `Svelte` et l'ajouter ;
   - Localisation souhaitée : `Paris` ;
   - Mode de travail : `Hybride` ;
   - TJM cible : `750`.
6. Régler la plage d'alerte à `85` et cliquer sur `Voir le premier insight`. Exiger le véritable accusé de réception `SAVE_CONNECTED_ALERT_PREFERENCES` avant d'avancer ; comme le brouillon de profil a été rempli en premier, cet accusé de réception doit lier le tarif journalier `750` et la stack requise `Svelte`.
7. À l'étape d'insight, cliquer sur `Sauvegarder mon profil`, jamais sur `Passer et voir le feed` ou `Passer l’onboarding`.
8. Attendre la persistance du profil, puis la véritable mutation de consentement, puis la route Feed.

La projection post-achèvement doit prouver :

- `profile/current` est égal au profil normalisé : `tjmMin:750`, `tjmMax:900`, `seniority:'senior'`, `experiences:[]`, `availability:null` ;
- le `GET_PROFILE` public concorde avec l'enregistrement brut ;
- `missionpulse.connectedAlertPreferences` est activé avec le seuil `85`, le tarif journalier minimal `750`, les stacks requises `['Svelte']`, le nombre maximal de résultats `5`, mute null et une révision/horodatage positif valide ;
- l'instantané de release des Réglages est confirmé avec `onboardingCompleted:true` ;
- il n'y a aucune clé legacy `onboarding_completed` après la migration de release ;
- aucune assertion de persistance de source n'est émise.

Après rechargement de preuve à chaud, le routage initial doit aller directement vers Feed, `page-onboarding` doit être absent, et le profil, les préférences d'alerte et l'instantané de release doivent être égaux à leurs projections post-achèvement. Le choix de source capturé demeure explicitement non durable jusqu'à ce que `onboarding-source.model.md` soit connecté au runtime.

## Scénario D — Hors-ligne et récupération

Identifiant de scénario : `packaged-tabs.offline-recovery`.

La configuration utilise les drapeaux partagés, le profil de base, la mission, les favoris vides et l'historique TJM à quatre enregistrements, puis établit le véritable consentement.

La preuve produit numérotée ci-dessous est une projection exacte de la machine enfant hors-ligne, et non une seconde autorité d'orchestration :

1. Dans `online_baseline`, ouvrir Feed en ligne et conserver la mission en cache, le contrôle de scan normal, l'identité de page et le condensat de persistance pré-hors-ligne. Seul l'événement interne corrélé `OFFLINE_REQUESTED` peut allouer la commande hors-ligne.
2. Dans `entering_offline`, invoquer `BrowserContext.setOffline(true)` de Playwright sur le véritable contexte actuel. L'émission d'événements DOM `online`/`offline` synthétiques est interdite. Seul le `OFFLINE_PROVED` corrélé peut définir `networkMode:'offline'` après avoir prouvé `navigator.onLine === false`, l'indicateur accessible `Hors ligne`, la bannière `Mode hors ligne — Données en cache uniquement`, la visibilité de la mission en cache et le contrôle de scan désactivé étiqueté `Scan indisponible hors ligne`.
3. Dans `offline_feed` puis `offline_favoriting`, prouver le Feed en cache et mettre la mission en favori via son contrôle visible. Seul le `OFFLINE_FAVORITE_PROVED` corrélé après accusé de réception durable peut faire avancer.
4. Dans `offline_tjm_navigating` puis `offline_tjm`, naviguer via le bouton `TJM` exact et exiger `Mode hors ligne`, `Cache local`, l'historique inchangé à quatre enregistrements et le filtre local `ile-de-france` fonctionnel. Conserver le condensat de projection corrélé `OFFLINE_TJM_PROVED`.
5. Dans `offline_reloading`, effectuer exactement un rechargement de preuve à chaud pendant que le contexte reste hors-ligne. `OFFLINE_RELOAD_PROVED` doit lier l'identité de processus, de contexte et de page inchangée et prouver que le navigateur est toujours hors-ligne.
6. Dans `offline_feed_reasserting`, exiger l'amorçage hors-ligne, l'ensemble des six boutons de navigation, la mission en cache et le favori durable sur Feed. Ensuite, `offline_tjm_renavigating` doit naviguer via le bouton `TJM` exact après rechargement, et `offline_tjm_reasserting` doit reprouver l'historique inchangé, le résultat du filtre local et l'égalité des données pré/post rechargement. Le fait que la page TJM antérieure ait été visible avant le rechargement ne peut pas se substituer à ces deux événements corrélés post-rechargement.
7. Ce n'est que depuis `restoring` que l'enfant peut invoquer `BrowserContext.setOffline(false)`. Le `ONLINE_PROVED` corrélé doit établir `navigator.onLine === true` et la stabilisation des écouteurs de connexion avant que l'enfant n'entre dans `online_reasserting`. Le `ONLINE_RECOVERY_PROVED` corrélé doit ensuite prouver le toast de récupération `Connexion restaurée`, la suppression du libellé de scan réservé au mode hors-ligne et l'absence de perte de données de profil, de mission, de favori ou de TJM avant que l'enfant ne puisse réussir (pass).

Chaque commande et résultat hors-ligne transporte l'identifiant d'effet enfant, la génération, le type d'effet, l'identité de page et le condensat de reçu définis ci-dessus. Un échec ou un timeout dans tout état hors-ligne actif entre dans `failed_restoring` ; une annulation entre dans `cancelled_restoring`. Les deux conservent la cause initiale et exigent un résultat de nettoyage en ligne idempotent et corrélé séparément. Aucun succès périmé, texte d'UI, succès de nettoyage ou déduction de la machine externe ne peut transformer l'un de ces chemins en succès.

Aucune réponse réseau n'est nécessaire au succès. La récupération prouve la conformité locale et la réactivation de l'UI, et non la joignabilité des connecteurs.

## Invariants inter-scénarios

1. Le hachage de l'arbre `dist` scellé avant le lancement est égal au hachage après tous les effets.
2. `allDependenciesExact` est faux à moins que la valeur de phase admise ne lie cette révision 11, la révision 26 approuvée/implémentée/vérifiée du harnais MV3 au hachage de comportement `da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`, la clarification 11 de préparation à la release et la révision 6 d'ancrage accessible du CV au hachage de comportement `d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98` à leurs hachages de comportement exacts plus leurs hachages de reçus distincts de revue, d'implémentation et de vérification, le tout lié par un reçu d'activation conjointe validé.
3. `inventoryBlobSha256` prouve l'objet V2 complet validé tandis que `scenarioMatrixSha256` prouve uniquement son tableau de scénarios ordonné. L'autorité parente et enfant exigent toutes deux ces valeurs exactes et ne permutent, n'aliasent ni ne dérivent jamais l'une de l'autre.
4. Chaque checkpoint non hors-ligne avance via la séquence fermée exacte `CHECKPOINT_STARTED` -> `CHECKPOINT_ROUTE_PROVED` -> `PRE_MUTATION_CAPTURED` -> événements `UI_ACTION_PROVED` indexés -> `POST_MUTATION_CAPTURED` -> `WARM_RELOAD_PROVED` -> les paires délimitées de zéro ou plusieurs `POST_RELOAD_ACTION_READY` / `UI_ACTION_PROVED` post-rechargement du checkpoint -> `UI_REASSERTED` -> `POST_RELOAD_CAPTURED` -> `CHECKPOINT_PROVED`. Aucune entrée dans un état ou preuve ultérieure n'implique un événement omis.
5. La machine et l'enfant hors-ligne conservent chacun au plus un effet en attente. Une corrélation exacte de l'identifiant d'effet, de la génération, du type, du scénario, du checkpoint/action le cas échéant et du reçu est requise avant que tout résultat ne puisse muter le contexte.
6. Toute mutation métier après les préconditions trouve son origine dans un contrôle d'UI visible exact ; l'adaptateur de test n'écrit jamais les postconditions attendues.
7. Le code du panneau latéral (sidepanel) ne lit jamais directement IndexedDB. La configuration et la capture IndexedDB réservées aux tests s'exécutent dans le contexte du service worker instrumenté.
8. Un toast d'UI, une classe CSS, un libellé rendu ou un état local optimiste ne constitue jamais une preuve de persistance suffisante ; le pont public et la persistance brute doivent concorder.
9. Une ligne de persistance brute sans la projection d'UI correspondante constitue également un échec.
10. Chaque arête de suivi autorisée provient de `APPLICATION_TRANSITIONS` ; aucun test ne patche le statut directement après la configuration.
11. La sauvegarde de profil préserve les champs sans rapport. La sauvegarde de CV préserve tous les champs du profil. Le rechargement ne crée jamais de seconde expérience ou transition de suivi.
12. Après le rechargement du CV, les compétences ne peuvent être affirmées qu'après que le contrat exact d'article/bascule/région contrôlée accessible et l'action d'expansion fermée ont réussi. La position CSS ou le texte de compétences déjà visible ne fait pas autorité.
13. Les favoris utilisent leur horodatage de premier ajout en favori stocké ; le rechargement ne peut pas le remplacer par un nouvel horodatage.
14. La sélection du filtre TJM est éphémère, tandis que `tjm_history` est durable.
15. La preuve de thème utilise l'instantané/enveloppe V1 de release actuel et ne revendique jamais le cloisonnement d'écrivain global de Réglages V2.
16. L'achèvement de l'onboarding nécessite le parcours complet de sauvegarde. L'omission (skip) ne constitue pas une preuve équivalente.
17. L'état hors-ligne provient de la véritable émulation réseau du navigateur, et non de stubs DEV ou d'événements DOM synthétiques.
18. L'enfant hors-ligne détient exclusivement l'entrée hors-ligne, la mutation du Feed hors-ligne, la navigation TJM, le rechargement hors-ligne, la réaffirmation post-rechargement de Feed/TJM, la restauration et la récupération. L'échec et l'annulation conservent toujours leur cause et se terminent par un nettoyage en ligne corrélé ou un échec de nettoyage explicite.
19. Le rechargement à chaud conserve fixes le processus, le profil, le contexte et l'époque Playwright. Un redémarrage du service worker invalide ce chemin de preuve et appartient à son scénario existant.
20. Zéro erreur de page, exception de worker, entrée de console d'erreur, avertissement de classe échec, rejet non géré et diagnostic bloquant tardif sont exigés.
21. Aucune permission d'hôte optionnelle, identifiant externe, backend ou sortie de LLM ne décide d'une transition.
22. Le premier invariant en échec bloque le verdict. Un nettoyage ultérieur ne peut pas le rendre vert.
23. `failed_cleaning` est exclu de toutes les transitions génériques. Son effet de nettoyage déjà alloué ne se termine que par un `CLEANUP_PROVED` ou `CLEANUP_FAILED` actuel ; aucune relance, réallocation, nettoyage récursif, événement d'échec générique ou second timeout n'existe.
24. La revue du modèle n'autorise que la phase fermée d'implémentation conjointe. Aucune autorité de release V2 n'existe avant un CAS atomique `JOINT_AUTHORITY_ACTIVATED` ; toute activation partielle de producteur, consommateur, harnais, scénario ou inventaire est interdite.
25. `verification_only` et `activated_release` sont des modes d'autorité disjoints. Le succès en bac à sable se termine à `verified_only`, ne constitue jamais une porte de release packagée, et ne peut être promu ; la suite de release post-activation s'exécute à nouveau à partir d'une nouvelle tentative de scénario sous l'autorité activée.
26. Chaque processus de scénario et descendant hérite d'une autorité de montage de source immuable. La source et ses ancêtres sont récursivement en lecture seule pendant toute l'exécution ; seuls les montages de sortie fermés sont accessibles en écriture, et aucun ne peut masquer un chemin suivi ou porteur d'autorité. L'égalité avant/après sans cette prévention au niveau de l'OS est insuffisante.
27. Une racine de carte de mission est un article non interactif nommé de manière unique. Seul son contrôle de divulgation délimité explicite peut développer les détails en ligne ; les contrôles de favori, de statut, de divulgation et d'investigation demeurent des actions indépendantes. Une racine de carte interactive contenant des contrôles imbriqués est invalide même si un navigateur se trouve exposer des descendants utilisables.
28. Les assertions de région TJM résolvent la région de résultats nommée de manière unique et sa liste sémantique nommée. Le filtrage peut supprimer un élément de résultat de région mais ne supprime jamais cette même région du catalogue d'options de filtrage ; les deux portées ne peuvent ni se satisfaire ni s'invalider mutuellement.
29. La sélection de thème est une projection d'état confirmé. Exactement un contrôle est pressé au repos ; pendant qu'une mutation est en attente, les trois contrôles sont désactivés, le groupe est occupé et le contrôle confirmé précédent reste pressé. Le succès ne déplace l'état pressé qu'avec la confirmation corrélée ; l'échec rétablit de façon déterministe la même projection confirmée antérieure.
30. L'unique téléverseur de diagnostics `test-mv3` correspond au contrat complet et exact `diagnostic_only` de ce fichier. Il dispose d'une permission de job en lecture seule et d'aucune autorité candidate/d'activation ; le modifier, ajouter un autre téléverseur ou présenter un quelconque reçu de diagnostic comme preuve candidate bloque avant la construction des acteurs de release.

## Obligations de revue avant implémentation

Un réviseur indépendant doit vérifier le hachage brut exact du fichier et répondre à chaque point ci-dessous avec des preuves :

### Autorité et fermeture explicite des transitions

- reproduire le hachage de comportement en attente UTF-8/LF brut en utilisant uniquement la substitution d'espace réservé spécifiée et lier le reçu de revue à ces octets exacts ;
- confirmer que les hachages de reçus de dépendance ne sont pas édités dans ce modèle et que l'autorité à l'exécution exige trois reçus immuables distincts par modèle ;
- confirmer qu'aucun verdict autorisant la release ne peut être émis tant que le hachage exact de la révision 26 du harnais `da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b` manque d'un reçu d'approbation, d'implémentation ou de vérification correspondant, ou tant que la clarification 11 de préparation à la release, la révision 11, l'activation conjointe ou l'autorité d'ancrage du CV font défaut ;
- confirmer que l'uplet d'ancrage du CV correspond exactement à la révision 6 au hachage de comportement `d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98` et qu'aucun reçu retiré de révision 5, implémentation de copie de travail ou succès de composant ciblé ne peut satisfaire ses emplacements distincts d'implémentation/vérification ;
- confirmer que la clarification parente 11 et cet enfant exigent conjointement le condensat de blob distinct `b386a936abad72ccd4fe2b0dd5cdf2390a6762e3d2ce3e0b0e07635f16f6a1ef` et le condensat de matrice de scénarios `2a9c9f67e0c19a0dae126f7db15c25a0c1411b0753e63ecad6eaa0824720f79a` ;
- retracer `review_waiting -> implementing -> verification_pending -> evidence_frozen -> verified -> activated`, prouver que l'implémentation peut se dérouler conjointement sans autorité, et prouver qu'un seul CAS de catalogue peut activer tous les consommateurs V2 ensemble ;
- prouver que le bac à sable de vérification privé ne peut atteindre que `verified_only`, ne peut pas émettre de porte de release, et que la preuve de release activée réexécute les scénarios plutôt que de promouvoir les preuves du bac à sable ;
- prouver que chaque commande et descendant entre avec le même montage source en lecture seule, un ensemble de limitation de capacités vide, `no_new_privs` et un ensemble fermé de montages de sortie accessibles en écriture ; les tentatives hostiles d'écriture/chmod/link/symlink/mount/remount/namespace échouent pendant l'exécution plutôt que d'être détectées seulement après restauration ;
- prouver qu'aucun socket de service privilégié, périphérique FUSE, gain de privilège sudo/setuid/capacité de fichier ou courtier intermédiaire ne permet à un enfant de demander à un autre processus de muter la source ;
- prouver que l'inspection des flux de travail accepte exactement le téléverseur épinglé `diagnostic_only` de `test:mv3` et rejette les octets candidats, `dist`, les chemins non bornés, une action mutable, un second téléverseur ou tout reçu de diagnostic utilisé comme autorité de release ;
- prouver que chaque cible de montage accessible en écriture était absente de l'arbre Git, vide avant d'être attachée, se situe en dehors des chemins porteurs d'autorité, et ne peut pas superposer ou masquer un octet de source, module, test, fixture, harnais, configuration Playwright, script, verrou ou configuration ;
- retracer chaque ligne de la machine depuis un événement typé vers une garde/action nommée et vérifier que `CHECKPOINT_STARTED`, `PRE_MUTATION_CAPTURED` et `UI_REASSERTED` ont une corrélation exacte d'effet/génération/checkpoint plutôt qu'une autorité implicite d'entrée ou de Promise ;
- vérifier que les variantes de `UI_ACTION_PROVED` de mutation et post-rechargement sont typées par phase et ne peuvent pas satisfaire les gardes de l'autre ;
- retracer le chemin complet en ligne -> Feed hors-ligne -> TJM hors-ligne -> rechargement hors-ligne -> réaffirmation du Feed -> re-navigation/réaffirmation du TJM -> restauration -> récupération en ligne, ainsi que le nettoyage en cas d'échec, de timeout et d'annulation ;
- vérifier que le checkpoint A3 effectue son action d'expansion fermée post-rechargement via le contrat accessible d'article/bascule/région revu séparément avant toute assertion de compétences, sans repli CSS ou positionnel.
- vérifier que le checkpoint A1 résout exactement un article nommé `Mission Architecte TypeScript Packaged chez Client Preuve`, que sa racine est non interactive, et que son état pressé de favori, son groupe de statuts nommé, son `role=status` unique, sa projection de règlement occupé/désactivé et sa divulgation stable et bornée de détails contrôlés sont délimités de manière indépendante ; rejeter les pseudo-cartes à boutons imbriqués, les clics sur la surface de l'article, le succès optimiste de statut/favori et la confusion entre transitions de tiroir et de divulgation ;
- vérifier que le checkpoint B2 résout uniquement `role=region[name="TJM par région"]` et le `h3` unique, `list[name="Régions analysées"]`, les éléments `li` directs et leurs en-têtes `h4` uniques ; prouver que la vérification d'absence de Lyon ne peut pas inspecter ni être satisfaite par les options de filtrage ;
- vérifier que le checkpoint B3 résout uniquement `role=group[name="Apparence"]`, prouve l'ensemble exact `Clair`/`Sombre`/`Système`, exactement un contrôle pressé confirmé, et des projections déterministes d'attente, de succès et d'échec sans classe de thème optimiste ni état pressé optimiste ;

### Nominal et persistance

- chacun des six onglets comporte au moins une action utilisateur réelle et une assertion d'UI ;
- Feed, Profil, CV, Candidatures et Réglages ont chacun une assertion de mutation durable, de relecture et de rechargement à chaud ;
- le TJM distingue correctement l'historique durable du filtrage éphémère ;
- l'onboarding utilise la sauvegarde, l'accusé de réception d'alerte et le consentement, et non l'omission (skip) ;
- le rechargement hors-ligne et la récupération en ligne préservent les données locales.

### Erreurs, annulation et relance

- chaque défaillance d'adaptateur, de pont, de stockage, d'UI, de rechargement et de mode réseau dispose d'un chemin terminal typé ;
- vérifier que `failed_cleaning` est exclu de chaque ligne générique/wildcard, n'accepte que `CLEANUP_PROVED` ou `CLEANUP_FAILED` actuel comme transitions sortantes et ne peut pas relancer, réallouer, récurser ou consommer un second `TIMEOUT` ;
- le timeout et l'échec hors-ligne entrent dans `failed_restoring` ; l'annulation entre dans `cancelled_restoring` ; chaque résultat de nettoyage répète l'uplet d'effet en attente exact et préserve la cause d'origine ;
- les preuves de release interdisent les relances Playwright ;
- l'état de favori optimiste ne peut pas réussir avant l'accusé de réception du stockage ;
- les échecs de sauvegarde de profil/CV/suivi ne peuvent pas être pris pour des succès ;
- aucun réamorçage, effacement, réinitialisation ou relance caché ne se produit après les préconditions.

### Permissions et frontières

- les scénarios ne demandent aucune permission d'hôte optionnelle et n'ouvrent aucune URL externe ;
- l'adaptateur est réservé aux tests et exclu de `dist` par un test d'artefact ;
- les frontières actuelles du wire v1 de suivi et de la release V1 des réglages sont explicites ;
- la non-persistance de la source d'onboarding n'est pas dissimulée ;
- le comportement dormant premium n'est pas simulé par une surcharge de stockage.

### Déterminisme et capacité

- l'ordre des octets de l'inventaire, les deux condensats non interchangeables et la parité des annotations sont exacts dans l'autorité enfant et parente ;
- les schémas et dates des fixtures sont valides sous les décodeurs d'exécution actuels ;
- la normalisation de la capture est canonique et bornée ;
- les valeurs dépendantes du temps utilisent des intervalles enregistrés ou l'ISO dérivé du navigateur, jamais des instantanés de chaînes de temps réel (wall-clock) ;
- les événements périmés/dupliqués/de mauvaise génération ne peuvent pas faire avancer la machine ;
- l'ensemble des boucles, tampons, lignes, actions, checkpoints et échéances sont bornés.

## Ordre d'implémentation conjointe et d'activation après approbation

La révision actuelle n'autorise que la revue. Son approbation indépendante, conjointement avec les approbations de la clarification 11, de la révision 26 de MV3, de l'ancre du CV et des modèles satellites alignés, permet l'entrée dans la phase d'implémentation conjointe non souveraine. L'ordre requis est :

1. réviser de manière indépendante ces octets exacts de la révision 11 et chaque modèle compagnon exact ; aucun reçu de revue seul ne constitue une autorité de release ;
2. distribuer un événement corrélé `JOINT_IMPLEMENTATION_STARTED` et figer son identifiant de phase, les uplets de modèles revus et le plan délimité ;
3. ajouter des tests de contrat unitaires/de composant/Playwright RED pour l'analyse de l'inventaire v2, l'ordre ASCII strict, le rejet d'annotations dupliquées/manquantes, les décodeurs d'adaptateur, la canonisation des instantanés, les limites, les transitions interdites de la machine, l'article nommé non interactif de MissionCard, le favori pressé, la projection de statut nommé/occupé et la divulgation contrôlée, la portée nommée région/liste/élément direct/en-tête du TJM, et la sémantique confirmée/en attente/échec du groupe d'apparence. Les reçus RED doivent prouver que l'implémentation actuelle échoue pour la raison de contrat visée avant que le code de production de l'UI ne change ;
4. implémenter ces trois contrats d'ancrage d'UI packagés, puis ajouter la machine de scénarios XState privée, l'enfant hors-ligne et les plans de scénarios purs fermés ;
5. ajouter l'adaptateur de données de service worker réservé aux tests et prouver son absence de `dist` ;
6. implémenter les quatre scénarios Playwright avec des annotations exactes et zéro relance ;
7. implémenter chaque lecteur V2 parent, producteur et consommateur derrière la phase conjointe inactive ; aucun consommateur ne fait autorité de manière indépendante ;
8. figer un commit/arbre d'implémentation propre et émettre l'ensemble ordonné d'autorité revue plus implémentation ;
9. matérialiser ce commit/arbre, installer la frontière de montage/capacités de source immuable et les montages de sortie fermés, et rejeter jusqu'à ce que son reçu d'autorité pré-exécution réussisse ;
10. construire le bac à sable de phase à partir de cet ensemble implémenté et exécuter des tests unitaires/de contrat ciblés, y compris les transitions interdites, les résultats périmés, le rejet par `failed_cleaning` des événements d'échec/annulation/timeout génériques, le nettoyage en cas d'échec/annulation hors-ligne et l'ambiguïté de l'ancre de CV ;
11. dans le même bac à sable, exécuter la commande packagée MV3 canonique sur un artefact scellé fraîchement compilé ; exiger que tous les scénarios se terminent par `verified_only`, n'émettent aucune porte de release, et exiger que chaque reçu de commande conserve l'autorité exacte de source immuable et de montage de sortie ;
12. figer l'ensemble de preuves ordonné, émettre des reçus de vérification distincts pour chaque modèle, et construire l'ensemble vérifié ordonné exact ;
13. effectuer un CAS de catalogue `JOINT_AUTHORITY_ACTIVATED` qui bascule de manière atomique chaque consommateur vers la V2 et conserve les condensats d'artefacts avant/après, les deux condensats d'autorité d'inventaire, tous les reçus de modèles, les hachages de reçus de checkpoint et zéro preuve de diagnostic ;
14. pour un candidat réel, réexécuter la suite packagée complète à partir de tentatives vierges sous `activated_release` ; seuls ces reçus peuvent entrer dans la porte de release.

## Porte de release

L'extension ne peut prétendre à cette preuve d'onglets packagés que lorsque :

- l'uplet d'autorité admis nomme ce hachage de comportement enfant exact approuvé de manière indépendante et des reçus de dépendance approuvés/implémentés/vérifiés exacts pour la révision 26 du harnais MV3 au hachage de comportement `da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`, la clarification 11 de préparation à la release, cette révision 11 et la révision 6 d'ancrage accessible du CV au hachage de comportement `d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98` ;
- un reçu d'activation conjointe validé prouve que la clarification 11, la révision 11, les raffinements producteurs/consommateurs alignés et la révision 26 de MV3 ont été implémentés et vérifiés par rapport au même blob V2 validé propre ;
- l'objet d'inventaire validé a pour hachage exact `inventoryBlobSha256=b386a936abad72ccd4fe2b0dd5cdf2390a6762e3d2ce3e0b0e07635f16f6a1ef` et son tableau ordonné dérivé a pour hachage exact `scenarioMatrixSha256=2a9c9f67e0c19a0dae126f7db15c25a0c1411b0753e63ecad6eaa0824720f79a` ;
- l'ensemble des quatre nouveaux identifiants de scénario s'exécutent exactement une fois et réussissent conjointement avec chaque scénario V1 préservé et une parité exacte des annotations sous `authorityMode:'activated_release'` ; aucun reçu `verified_only` n'est présent ;
- chaque checkpoint non hors-ligne conserve des reçus corrélés d'avant, post-mutation, d'UI post-rechargement et de persistance post-rechargement avec des projections durables égales ;
- l'enfant hors-ligne termine son parcours complet de rechargement/re-navigation/récupération et se termine en ligne ; chaque exécution en échec ou annulée dispose également de preuves corrélées fidèles de nettoyage en ligne ;
- les compétences post-rechargement du CV sont prouvées uniquement à l'intérieur de la région développée contrôlée ;
- les diagnostics sont vides et le condensat d'artefact post-test est égal au condensat d'avant lancement ;
- chaque reçu de commande de build/scénario lie la même autorité de source immuable, le montage source et ses ancêtres sont restés en lecture seule au niveau de l'OS pour l'ensemble de l'arbre de processus enfant, et seuls les montages fermés de dépendances/cache/dist/profil/rapport étaient accessibles en écriture.

Tout scénario ignoré, relance de test, consommateur d'inventaire obsolète, fuite d'adaptateur dans `dist`, preuve de vérification seule promue/réétiquetée, reçu manquant/périmé/discordant/de rôle croisé, activation conjointe absente ou partielle, substitution de condensat, discordance de hachage source, reçu de montage ou de capacité manquant/modifié, source/ancêtre accessible en écriture, masquage de chemin suivi, overlay, échappement par chmod/remount/symlink, événement de checkpoint typé omis, transition hors-ligne implicite, ancre de CV ambiguë, succès optimiste seul, divergence brut/UI, diagnostic, échec de nettoyage ou dérive d'artefact bloque la préparation à la production.

## Risques connus exposés par ce modèle

1. **Écart de point de raccordement du harnais.** La fixture publique n'a pas de méthode d'amorçage/capture IndexedDB typée aujourd'hui. L'adaptateur de service worker réservé aux tests et lié par hachage est requis avant que ces scénarios puissent être implémentés sans stubs DEV.
2. **Bloqueur de la révision 26 du harnais.** La révision 26 au hachage de comportement normalisé `da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b` n'est qu'un candidat en attente. Ses reçus distincts d'approbation, d'implémentation et de vérification sont requis ; aucune révision antérieure ou implémentation hachée différemment ne peut s'y substituer.
3. **Bloqueur d'activation conjointe.** La clarification 11 de préparation à la release et cette révision 11 n'ont aucun `JointReleaseModelActivationV1` validé. Les modèles approuvés ne peuvent entrer que dans la phase d'implémentation conjointe non souveraine ; aucun candidat de release V2 n'est admis tant que le CAS d'activation atomique n'a pas réussi.
4. **Bloqueur d'implémentation de l'ancre accessible du CV.** La révision 6 du modèle de CV au hachage de comportement `d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98` dispose d'une approbation de modèle indépendante et définit la sémantique requise d'article stable, d'expansion contrôlée, de règlement de callback, de port synchrone de sortie de focus et de nettoyage terminal imbriqué. Des reçus d'implémentation et de vérification correspondants sur l'arbre propre conjoint sont toujours requis avant que le checkpoint A3 ne puisse affirmer les compétences post-rechargement.
5. **Bloqueur de l'inspecteur de diagnostics.** L'inspecteur actuel des flux de travail de release rejette l'étape exacte `upload-artifact` de diagnostic de `test:mv3`. Il doit intégrer la projection fermée non candidate ci-dessus tout en conservant le rejet hermétique en échec de tout téléversement de forme candidate ou non modélisé.
6. **Écart d'autorité des réglages.** Le modèle étendu de Réglages V2 signale une bascule incomplète du cloisonnement global des écritures. Ce test exerce l'enveloppe de release V1 livrée ; il ne doit pas être cité comme une résolution de ce bloqueur distinct.
7. **Écart d'autorité de suivi.** Le runtime packagé reste sur le wire v1. Ces tests ne prouvent pas le registre (ledger), le CAS, la réconciliation au redémarrage ou les règles d'époque de données du wire v2.
8. **Écart de source d'onboarding.** Le choix de source est actuellement éphémère et le modèle de source d'onboarding n'est pas connecté. Si la recette produit s'attend à ce que le connecteur choisi survive au rechargement, la préparation à la production reste bloquée en dehors de la portée de ce scénario.
9. **Discordance d'omission d'onboarding.** L'achèvement actuel par omission ne prouve pas la règle transactionnelle `autoScan:false` du modèle cible. Le scénario de succès évite l'omission, mais la discordance demeure une dette distincte.
10. **Dérive de documentation du stockage TJM.** Le module de stockage revendique IndexedDB dans son en-tête tandis que le runtime utilise `chrome.storage.local`. Une migration future doit mettre à jour ce modèle et les fixtures de manière atomique.
11. **Dérive de schéma/version.** L'adaptateur est épinglé à DB5/data2 et aux chemins de clés de magasin actuels. Une migration structurelle ou de données nécessite une nouvelle révision de modèle revue avant la mise à jour des tests.
12. **Bloqueur d'implémentation des ancres d'UI packagées.** L'actuel MissionCard possède une racine interactive `role=button` contenant des boutons imbriqués et aucun groupe fermé de règlement de statut nommé ; les aperçus TJM actuels sont des éléments `div` génériques sans éléments de liste ni en-têtes ; et les contrôles actuels de thème n'exposent aucun groupe nommé, état pressé ou contrat d'occupation/désactivation en attente. Les checkpoints A1, B2 et B3 ci-dessus ferment ces sémantiques. Leurs reçus exacts d'implémentation et de vérification sont requis avant que les scénarios packagés ne puissent s'exécuter ; les identifiants de test ad-hoc, les sélecteurs positionnels et les assertions d'absence à l'échelle de la page restent interdits.
13. **Fuseau horaire local.** La conversion de `datetime-local` dépend du fuseau horaire du navigateur. La capture de l'ISO attendu dérivé de la page évite une hypothèse d'instantané Europe/Paris, mais la dérive du fuseau horaire du navigateur doit toujours être conservée dans les preuves.
14. **Point de raccordement du harnais hors-ligne.** La fixture expose la page Playwright mais aucune capacité typée de mode réseau. L'implémentation doit encapsuler l'appel actuel `BrowserContext.setOffline` dans les commandes fermées modélisées ici et prouver le nettoyage en ligne ; les événements de page synthétiques ne constituent pas un repli acceptable.
15. **Absence de modèle dédié de flux de travail TJM.** Le TJM dispose d'un code d'analyse pur et d'un adaptateur de stockage mais d'aucun modèle autonome d'état/flux de travail. Ce document ne détient que la preuve packagée de lecture/filtrage/rechargement ; un futur flux de travail de mutation TJM nécessite sa propre porte Model -> Review.
16. **Dette de concurrence CV/disponibilité.** Le checkpoint packagé d'ajout d'expérience est séquentiel et ne ferme pas la situation de concurrence signalée entre les sauvegardes de CV ou de disponibilité et les boucles de synchronisation/push actives. Cette concurrence demeure un risque distinct pour la préparation à la production.
17. **Dette de liaison des assets générés.** Les assets générés persistent indépendamment, tandis que la génération actuelle n'ajoute pas de manière fiable leurs identifiants à `MissionTracking.generatedAssetIds`. Ces scénarios n'exercent ni ne dissimulent cet écart.
