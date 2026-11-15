# Modèle du harnais packagé MV3

Statut : **proposé — révision 26 du bail CDP à session persistante**.
Pending behaviour SHA-256: `da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`.

Convention de hachage : calculer le SHA-256 sur l'ensemble des octets UTF-8/LF bruts de ce fichier après
avoir remplacé uniquement la valeur entre les accents graves sur la ligne `Pending behaviour SHA-256`
par le littéral `__PENDING_BEHAVIOUR_SHA256__` ; les accents graves environnants,
le point et tout autre octet demeurent inchangés. Le réviseur doit reproduire cette
substitution avant de comparer le condensat, de sorte que l'enregistrement du condensat ne crée
aucun cycle autoréférentiel.

La révision 25 a été rejetée de manière indépendante au hachage de comportement normalisé UTF-8/LF
`84bc0ce47cb24d9fd998970daca04fbe6553931ede2b1be272348a16e665255f` :
deux libellés de tests hostiles antérieurs désignaient toujours la révision 24. La révision 26 remplace
tous les libellés de preuve actuels par des références stables à cette révision en attente ; seul
le registre historique conserve les numéros explicites des révisions remplacées.

La révision 24 a été rejetée de manière indépendante au hachage de comportement normalisé UTF-8/LF
`494464489184b4c7075fece27d581c71ee9d75b0bb989858abff9f790603842a` :
trois libellés d'obligations finales désignaient toujours la révision 23 malgré les octets d'autorité
corrigés de la révision 24. La révision 25 corrige uniquement ces libellés restants.

La révision 23 a été rejetée de manière indépendante au hachage de comportement normalisé UTF-8/LF
`96f913a4ce21c0c07c20499d3ec4d966fe375baf1a49cfa56e7992f2b2f3b917` :
deux libellés de tests hostiles désignaient toujours la révision 22 et un invariant exigeait
incorrectement une fermeture de transport en échec de connexion avant le bail qui en détenait
nécessairement la propriété. La révision 24 corrige ces libellés normatifs sans modifier
le comportement d'autorité lié à la source.

La révision 22 a été rejetée de manière indépendante au hachage de comportement normalisé UTF-8/LF
`942ea53ff3c0960ba7d029174c1ec47d2797e335f1e45fd5dc26115ce39fb2cf` :
son DTO/hachage d'événement n'était pas comparé à l'autorité brute conservée, de sorte qu'un
DTO étranger cohérent en interne pouvait réserver le bail Playwright. Son obligation finale
confondait également la matrice hostile avec les répétitions nominales de Chrome.
La révision 23 résout ces deux conclusions ci-dessous.

La révision 21 a été rejetée de manière indépendante au hachage de comportement normalisé UTF-8/LF
`0694b990c2c8c8329697c05e6711fa53520b1071bf4e6e931bd6553ba60e6a88` :
son événement de succès omettait le DTO, son reçu sans propriétaire (no-owner) n'était pas fermé, des
exceptions de réflexion hostiles s'échappaient de l'union typée d'erreurs, et une obligation finale
désignait toujours la révision 19. La révision 22 résout ces quatre conclusions ci-dessous.

La révision 20 a été rejetée de manière indépendante au hachage de comportement normalisé UTF-8/LF
`c1131e755549170e09f747fd06b09ced7f2f7778087bcb39a50d72a80f442222` :
la projection d'autorité n'était pas représentée dans la machine externe, son nettoyage
de rejet était ambigu après l'allocation du transport, et sa matrice d'erreurs/tests n'était
pas fermée. La révision 21 résout ces trois conclusions ci-dessous. Aucune approbation ne se
transfère depuis une quelconque révision antérieure.

La révision 19 a été approuvée de manière indépendante au hachage de comportement brut UTF-8/LF
`ba1e91ea1af5fc802c2d9f026a1ce97fa16750e244c71677ed9cebcfaf67b458`,
puis vérifiée par quatre exécutions réelles de redémarrage dans la même session sous Chrome-for-Testing 149. Le
scénario d'exécution packagé canonique a ultérieurement falsifié sa frontière de transfert
Playwright comme décrit ci-dessous. Aucune approbation ne se transfère à la révision 20, et
l'implémentation est interdite jusqu'à ce qu'une revue indépendante approuve le hachage de
comportement brut UTF-8/LF exact en attente ci-dessus.

La révision 18 a été approuvée de manière indépendante au hachage de comportement brut UTF-8/LF
`a0f201a6273feb1edd51b024330f54534eed9b1890c2587690a81ab011e0521d`,
puis falsifiée par l'ordonnancement réel des commandes d'amorçage en pause dans la même session
décrit ci-dessous. Aucune approbation ne se transfère à la révision 19, et l'implémentation est
interdite jusqu'à ce qu'une revue indépendante approuve le hachage de comportement brut UTF-8/LF
exact en attente ci-dessus.

La révision 16 a été approuvée de manière indépendante au hachage de comportement brut UTF-8/LF
`f374bdaa20cedbea1be9abccfe53c39f6ede7c47a1df8126c64623f71cc96927`,
puis falsifiée par le premier ordonnancement réel de sondes d'amorçage en pause décrit
ci-dessous.

La révision 17 a été rejetée de manière indépendante au SHA-256 brut UTF-8/LF
`142b65a82c492f895a31bcb697c16f34e24c2bb87780d9c422f90a7c9a53025f`
car une mise à jour exacte `running` de la version sélectionnée pouvait arriver pendant
le lot (batch) sonde/reprise mais n'était définie que dans `resuming`. Les révisions 18 et 19
conservent cette preuve native de manière idempotente dans chaque état du lot d'amorçage comme
spécifié ci-dessous.

La révision 14 a été approuvée de manière indépendante pour le hachage de comportement brut UTF-8/LF
`69caaba95c035ce51d6d549252884c3a2893a8146d15355eac0df57b17866fba`,
puis falsifiée par l'ordonnancement réel de Runtime post-rechargement décrit ci-dessous.
La révision 15 a été rejetée de manière indépendante au SHA-256 brut UTF-8/LF
`0e701a15bef6b9ddef15ac26b1232c976404d9a08dee8ee1783087b8675b15cc`
car un identifiant `executionContextDestroyed` post-crash était comptabilisé mais non
consigné dans la table d'exclusion (tombstoned), permettant à une création ultérieure de contexte de restaurer une autorité détruite.

La révision 9 a été approuvée de manière indépendante au SHA-256 brut UTF-8/LF en attente
`3cfeb1d001cc1ae98d9a79139ed01f8eebfba5cbc724b4a410e2a4d0c47e7dc1`,
puis falsifiée par l'ensemble des trois répétitions réelles sous Chrome packagé. La révision 10 a été
rejetée lors de la revue indépendante avant l'implémentation car elle attendait toujours un nouvel
attachement de cible pour un redémarrage avec la même version. Aucune approbation ne se transfère
à la révision 11. La révision 12 a remplacé le hachage rejeté en attente de la révision 11
`956e31105c1c6f33b916f8bc161de0ff357f07464eb040b8214ec1082d29d2e8`
et est restée en attente au SHA-256 brut UTF-8/LF
`c1a66bdb5341b6118d9eda5d17de478b83abe98ecebc9ded7cbd9019f6e85617`.
Des traces répétées sous Chrome 149 réel falsifient désormais la révision 12 comme décrit ci-dessous ;
la révision 12 ne peut être approuvée ni implémentée telle qu'écrite. La révision 13
l'a remplacée et a été approuvée de manière indépendante au SHA-256 brut UTF-8/LF
`23fa088bca21bf9ad191adb7f6fbdb469112b762bdb3a624c992bbbac1fcfa1d`.
Un smoke réel sous Chrome packagé a ensuite rejeté une mise à jour valide et répétée de version de remplacement
parce que l'implémentation traitait incorrectement la preuve comme étant à usage unique.
La révision 14 a rendu explicite la sémantique de métadonnées idempotente déjà visée
et a été approuvée au hachage consigné ci-dessus avant sa falsification ultérieure d'ordonnancement natif.

Date de révision : 2026-07-17

## Portée

Ce modèle détient uniquement la vérification du package exact et scellé
`apps/extension/dist` dans un véritable processus Chromium Manifest V3. Il ne
modifie pas le comportement du produit ni l'état de l'application. Le point d'entrée
canonique demeure `pnpm --filter @pulse/extension test:mv3`.

Le modèle sépare deux revendications qui ne doivent jamais être confondues :

1. **amorçage instrumenté (instrumented bootstrap)** : un propriétaire CDP brut installe Runtime et des
   observateurs de diagnostic avant qu'un worker redémarré ne soit repris ;
2. **redémarrage fonctionnel (functional restart)** : après que Playwright a exercé l'extension, le
   même processus et profil Chromium sont restitués au propriétaire brut, redémarrés,
   reconnectés à Playwright, et vérifiés quant à la persistance des réglages, d'IndexedDB et
   des alarmes.

Un redémarrage effectué pendant que Playwright détient toujours une connexion CDP ne peut prouver
qu'un comportement fonctionnel, jamais l'instrumentation préalable à l'amorçage. La révision 13 interdit
donc cette topologie plutôt que d'affaiblir la preuve native de pause.

## Preuves de falsification de la révision 9

La commande ci-dessous a échoué trois fois avant toute interaction avec l'UI :

```text
playwright test --config=playwright.mv3.config.ts
  tests/e2e-extension/navigation.test.ts
  --grep "cold boot shows the packaged onboarding without DEV stubs"
  --repeat-each=3
```

Les traces établissent deux modes indépendants :

1. l'exécution de base et la répétition 1 ont échoué lors de l'acquisition initiale de l'autorité, avant
   tout `stopWorker` ou `startWorker` ; la révision 9 traitait soit une version transitoire chevauchante
   non redondante, soit le passage de la version provisoire à `redundant` comme immédiatement terminal ;
2. la répétition 2 a figé l'enregistrement `0`, la version `0` et la cible
   `6E5F00D02842631CE14197B441F1B3D7`, l'a arrêtée et détachée, puis Chrome
   a redémarré la même version avec le même identifiant de cible mais n'a émis aucun
   `Target.attachedToTarget` ou `Runtime.executionContextCreated` de remplacement vers la seconde
   connexion brute.

Le second résultat s'explique par la topologie réelle des propriétaires. Playwright 1.61.1
arme son propre `Target.setAutoAttach` racine lors de la connexion
(`playwright-core/lib/coreBundle.js:37742-37773`). Son `CRServiceWorker`
envoie immédiatement `Runtime.enable` et `Runtime.runIfWaitingForDebugger`, et
le fait à nouveau après un rechargement de worker (`coreBundle.js:37591-37633`). L'observateur
brut n'était donc pas la seule autorité de pause/reprise.

Les hypothèses de la révision 11 sont délibérément falsifiables :

- **H11.1** : lorsque la connexion brute est le seul transport CDP racine créé par le harnais et que sa
  session exacte de service worker demeure attachée à travers
  `stopWorker`/`startWorker`, Chromium réutilise cet hôte agent, émet
  `Inspector.targetCrashed` puis `Inspector.targetReloadedAfterCrash`, et met en pause
  le remplaçant avant l'amorçage parce que l'hôte était attaché lors de la création du worker ;
- **H11.2** : l'installation initiale peut exposer transitoirement plusieurs versions
  liées, mais converge sous une échéance unique vers une version activée non redondante
  tandis que toutes les versions liées plus anciennes deviennent redondantes ;
- **H11.3** : `browser.close()` sur un Browser issu de `connectOverCDP` ferme uniquement ce
  transport Playwright, si bien que le même processus et profil Chromium détenus manuellement
  peuvent être prêtés en retour au CDP brut et reconnectés ultérieurement.

Si une quelconque hypothèse échoue dans les tests déterministes ou dans l'une quelconque des trois répétitions réelles,
l'implémentation s'arrête et retourne en revue de modèle. Il n'existe aucun repli vers une
ancienne session de worker détachée, un attachement de nouvelle cible deviné, un démarrage d'échauffement
non prouvé, un nouveau processus de navigateur ou un nouveau profil.

## Preuves de falsification de la révision 12 et décision de la révision 13

Des traces réelles répétées avec le build épinglé de Chrome for Testing 149 falsifient la
preuve d'arrêt de la révision 12. Sur la cible et session sélectionnées conservées, chaque trace
a observé l'ensemble des trois faits d'arrêt natifs :

1. la réponse corrélée à `ServiceWorker.stopWorker` a réussi ;
2. la même version sélectionnée est passée en `status:activated` et
   `runningStatus:stopped` ;
3. la session sélectionnée a émis `Inspector.targetCrashed` pour la même cible.

Aucune trace n'a émis `Runtime.executionContextDestroyed` ou
`Runtime.executionContextsCleared`, y compris lors de fenêtres d'observation répétées de
8 à 30 secondes après le crash. Attendre plus longtemps ajoute donc du temps écoulé,
et non des preuves. La révision 12 faisait dépendre la progression d'un événement de cycle de vie
Runtime que cet arrêt natif dans la même session n'émet pas, et est donc falsifiée.

Les mêmes traces sous Chrome 149 établissent un second contrat natif pour le
remplaçant : `Runtime.executionContextCreated.context.origin` est égal au `scriptURL`
complet et figé du worker (`chrome-extension://<extensionId>/service-worker-loader.js`),
et non à la portée (scope) racine avec sa barre oblique finale supprimée. La révision 12 ne faisait pas de
l'`origin` une preuve d'arrêt, donc ceci ne remplace pas la falsification de crash ci-dessus ; cela
rejette en revanche une garde de contexte dérivée de la portée.

La révision 13 traite l'événement `Inspector.targetCrashed` courant exact comme la
frontière native de génération de contexte. Une action XState atomique sur cet événement :

1. fige le hachage de l'événement de crash par rapport à la cible et à la session sélectionnées ;
2. incrémente le `contextGeneration` monotone de la session sélectionnée exactement une fois ;
3. déplace chaque `uniqueContextId` admis dans la génération pré-crash, qu'il soit
   encore actif ou déjà inactif, dans l'ensemble de tombstones borné à ajout seul
   `revokedUniqueContextIds` et fige son hachage d'ensemble canonique ;
4. vide la carte d'autorité de contexte actif pour cette session ; et
5. marque la preuve de crash/révocation comme achevée dans la même transition.

Aucun contexte pré-crash ne demeure actuel après cette action. Un `uniqueContextId` révoqué
ne peut jamais satisfaire `isCurrentContext`, autoriser une sonde ou être
transmis à `Runtime.evaluate`, même si Chromium répète ultérieurement ses octets. Un
`Runtime.executionContextDestroyed` ou `Runtime.executionContextsCleared` tardif
réduit pendant que l'acteur demeure dans `controlled_stop` est normalisé comme une preuve
retirée uniquement ; il ne crée ni n'achève aucune preuve d'arrêt et ne peut sélectionner une
transition. Après le crash, chaque `uniqueContextId` détruit valide qui ne se trouve pas
déjà dans cet ensemble de crash est conservé dans un ensemble de tombstones post-crash borné distinct.
En dehors de `controlled_stop`, la révision 16 n'autorise que l'étroite fenêtre post-rechargement et
pré-contexte définie ci-dessous ; tout autre événement de ce type est terminal car il
ne transporte aucun discriminateur fiable de génération de contexte.

La preuve de remplacement demeure hermétique en échec (fail-closed). Elle exige
`Inspector.targetReloadedAfterCrash` sur la même cible/session pendant que la même
version figée reste sélectionnée avant d'admettre le moindre contexte remplaçant,
suivi d'exactement un nouveau `Runtime.executionContextCreated` sur cette session conservée.
Son `uniqueContextId` non vide doit appartenir à la génération incrémentée et ne doit apparaître
ni dans `revokedUniqueContextIds` ni dans `postCrashDestroyedUniqueContextIds`,
et son `origin` doit être égal au `scriptURL` figé exact. Un contexte avant le rechargement, une
origine dérivée de la portée ou discordante, un identifiant ancien ou détruit réutilisé après le rechargement,
un second contexte remplaçant, un nouvel attachement sélectionné, un détachement ou toute
dérive de cible/session/version est terminal.
Aucune absence, aucun délai ni aucun booléen effacé localement ne se substitue à ces preuves
positives natives.

Après approbation indépendante de la révision 13, toute implémentation dérivée de
la révision 12 doit remplacer une garde d'origine de contexte dérivée de `scopeURL` par la règle
du `scriptURL` figé exact. Cette modification du modèle n'autorise pas ce changement d'implémentation
avant approbation.

## Falsification d'implémentation de la révision 13 et décision de la révision 14

Le premier smoke réel sous Chrome packagé de l'implémentation de la révision 13 a atteint
la preuve d'arrêt native complète, puis a émis cette séquence de remplacement avec la même version
sur l'enregistrement, la cible et la session conservés :

1. `activated/starting` sans `targetId` ;
2. `activated/starting` à nouveau avec le `targetId` figé exact.

La première mise à jour a complété la preuve booléenne de version de remplacement de l'implémentation.
Sa garde à usage unique a alors envoyé la seconde mise à jour valide en échec uniquement
parce que cette preuve était déjà vraie. Cela contredit l'exigence de la table de transition
de conserver les mises à jour starting/running actuelles avec la même version et transforme un
enrichissement normal de métadonnées de Chrome en échec terminal.

La révision 14 sépare l'admission de l'identité de l'observation répétée des métadonnées.
La première mise à jour actuelle avec une identité exacte d'enregistrement/version/script,
`status='activated'`, `runningStatus in {'starting','running'}` et soit aucun
`targetId`, soit la cible figée, complète la preuve de version de remplacement. Toute
mise à jour ultérieure satisfaisant la même garde demeure admissible. Un enregistrement
exactement répété est une absence d'opération (no-op) exacte. Un changement valide `starting -> running`
ou l'ajout du `targetId` figé exact peut rafraîchir des métadonnées actuelles ne faisant pas autorité,
mais n'alloue pas de seconde preuve, ne modifie pas la génération de redémarrage/contexte,
ne remplace pas l'identité figée et n'autorise pas la progression par lui-même. Un enregistrement,
une version, un script, un statut, une cible différents, ou tout autre statut d'exécution demeure terminal.

## Preuves de falsification de la révision 14, rejet de la révision 15 et décision de la révision 16

Après avoir recompilé et vérifié le `dist` de production exact, le smoke réel suivant sous
Chrome packagé a complété l'arrêt et a émis cet ordre sur la session conservée :

1. `Inspector.targetReloadedAfterCrash` ;
2. `Runtime.executionContextsCleared` ;
3. `Runtime.executionContextCreated` avec un `uniqueId` frais non révoqué et une
   origine exacte de script complet.

La révision 14 rendait l'étape 2 terminale au seul motif que la machine avait quitté
`controlled_stop`. Cela rejette l'initialisation native de rechargement de Chrome avant
qu'une quelconque autorité de contexte remplaçant n'existe.

La première proposition de révision 15 comptabilisait les deux événements de cycle de vie sans conserver
l'identifiant unique détruit natif. La revue indépendante l'a rejetée : un
`executionContextCreated` ultérieur pouvait réutiliser cet identifiant non consigné et restaurer
une autorité que Chrome avait déjà détruite. La révision 16 comble cette lacune comme suit.

La révision 16 n'admet un événement de cycle de vie Runtime de génération retirée et borné que
lorsque chaque garde ci-dessous est vérifiée :

- la génération de processus, l'époque de bail et la session sélectionnée sont actuelles ;
- la preuve exacte `targetReloadedAfterCrash` sur la même session est déjà conservée ;
- aucun contexte remplaçant n'a encore été observé ou figé ;
- l'événement est `executionContextsCleared` ou `executionContextDestroyed`.

`Runtime.executionContextsCleared` met à jour uniquement le compteur borné de preuves retirées.
`Runtime.executionContextDestroyed` doit en outre transporter son entier sûr non négatif
`executionContextId` natif, un `executionContextUniqueId` normalisé non vide d'au plus 512 octets
UTF-8 sans NUL, CR ou LF, et le SHA-256 des paramètres complets validés selon le schéma. Si cet identifiant unique
ne se trouve pas déjà dans `revokedUniqueContextIds`, la même transition l'ajoute à
`postCrashDestroyedUniqueContextIds` et recalcule
`postCrashDestroyedUniqueContextIdsSha256` sur le JCS RFC 8785 de l'ensemble trié.
L'ensemble commence vide lors de l'action atomique de crash. Ses identifiants partagent le budget unique
d'autorité de contexte d'exécution de 4 096 entrées avec les tombstones de crash et le contexte
remplaçant frais. Un identifiant détruit dupliqué est idempotent mais son événement consomme
toujours l'une des 4 096 observations bornées de preuves retirées. Une destruction ou un vidage
malformé ou hors budget est terminal et ne peut jamais autoriser la progression.

Aucun des deux événements ne peut compléter la preuve de démarrage, de Runtime, de version,
de contexte ou d'identité ; incrémenter `contextGeneration` ; muter l'ensemble/hachage d'identifiants
révoqués au moment du crash ; effacer la preuve de rechargement ; ou autoriser une sonde ou transition.
Le premier contexte frais admissible ferme la fenêtre de manière atomique et doit être absent des
deux ensembles de tombstones. Une fois que `replacement_starting` commence, le même événement de cycle
de vie avant le rechargement, après un contexte frais, sur une autre session, ou dans tout état ultérieur
de sonde/reprise est terminal. Ainsi, Chrome peut annoncer que le Runtime rechargé a nettoyé son ancien
monde d'exécution, tandis qu'une création ultérieure de contexte ne pourra jamais restaurer une autorité
que Chrome a déjà détruite.

## Preuves de falsification de la révision 16 et décisions des révisions 17-18

Après que la suite déterministe de la révision 16 a réussi, une exécution réelle de Chrome avec le package
de production a atteint la séquence exacte sur la même session exigée par cette révision :

1. `Inspector.targetReloadedAfterCrash` ;
2. `Runtime.executionContextsCleared` ;
3. un `Runtime.executionContextCreated` frais avec l'origine exacte du script.

Le propriétaire a alors envoyé le `Runtime.evaluate` d'identité fixe et a attendu sa réponse
avant d'envoyer `Runtime.runIfWaitingForDebugger`. Cette évaluation ne s'est jamais résolue
au cours du délai limite absolu brut de 30 secondes. La trace de remplacement n'a émis aucun
`Inspector.workerScriptLoaded` avant l'attente et est retournée ultérieurement à
`targetCrashed/stopped`. La preuve positive est que le contexte remplaçant existe alors
que le worker est encore en pause au démarrage ; l'évaluation de globales d'amorçage ne peut
pas être attendue jusqu'à son terme avant la seule commande qui libère cette pause. La révision 16
encode donc un interblocage causal (deadlock) bien que sa preuve d'autorité de contexte soit correcte.

La révision 17 a proposé de modifier l'effet de la commande d'amorçage fixe. La révision 18
a conservé chaque règle d'identité et de tombstone de la révision 16 et, après avoir comblé l'écart
de métadonnées de la version sélectionnée de la révision 17, a distribué un lot synchrone de client
suivi dans cet ordre exact sans attendre de réponse entre les envois :

1. le `Runtime.evaluate` d'identité fixe ;
2. le `Runtime.evaluate` de test explicite facultatif, uniquement lorsque l'entrée
   `testProbeConfigured` figée de la machine est vraie ;
3. exactement un `Runtime.runIfWaitingForDebugger`.

Toutes les commandes ciblent la session sélectionnée conservée. Les deux évaluations utilisent le
même `uniqueContextId` frais figé et les paramètres exacts définis ci-dessous. Le client suivi
envoie chaque commande de manière synchrone avant de renvoyer sa promesse, de sorte que les octets
de commande d'évaluation sont mis en file d'attente avant les octets de reprise même si les
réponses d'évaluation nécessitent la reprise. En l'absence d'autre producteur de commandes dans cet
état, les reçus réussis doivent porter des identifiants monotones strictement consécutifs dans l'ordre
de distribution ci-dessus. Le lot consomme deux emplacements opérationnels sans sonde de test et
trois avec une sonde, dans la limite du budget existant de commandes en attente.

Le shell attend sous l'échéance absolue inchangée chaque promesse distribuée, valide les schémas exacts
de méthode/session/résultat et les identifiants consécutifs, puis réduit les événements de réponse typés
dans l'ordre canonique : identité, test facultatif, reprise. Les événements natifs de version, d'Inspector
et de Runtime continuent de parvenir à XState pendant que les promesses sont en attente. L'ordre
d'achèvement des promesses ne sélectionne jamais une transition. Tout rejet de commande, reçu manquant,
écart/croisement d'identifiant, discordance de session, discordance d'identité ou échec de protocole/schéma
entre dans la release en échec ; le fait que le worker ait été repris ne peut transformer l'échec en autorité.
Une exception ou un rejet du test facultatif demeure un diagnostic applicatif et ne peut bloquer la reprise
ni choisir un état. Seules la preuve exacte d'identité, l'achèvement du test facultatif lorsqu'il est configuré,
le reçu exact de reprise et le statut `running` de la version sélectionnée peuvent compléter l'amorçage.

La révision 18 a également rendu la preuve de version sélectionnée persistante (sticky) sur l'ensemble du
lot. Dans `identity_probing`, `test_probe_deciding`, `test_probing` et `resuming`, chaque
`VERSION_UPDATED` courant avec l'enregistrement, la version, le script figés exacts,
`status='activated'`, la cible figée ou absente et un `runningStatus` de `starting` ou
`running` est conservé de manière idempotente. `running` peut affiner `starting` une fois et ne peut régresser.
Un doublon exact est sans effet (no-op). Toute dérive d'enregistrement/version/script/statut/cible,
`stopping`, `stopped`, `redundant`, ou une mise à jour `starting` après `running` est terminale.
Ainsi, un événement natif unique `running` demeure disponible qu'il arrive avant la réduction d'identité,
entre l'identité et la réduction du test facultatif, entre le test facultatif et la réduction de reprise,
ou après le reçu de reprise.

## Preuves de falsification de la révision 18 et décision de la révision 19

Une exécution réelle sous Chrome-for-Testing 149 sur le package de production recompilé exact
a falsifié la révision 18 après qu'elle avait déjà prouvé l'autorité de remplacement complète de la révision 16.
La cible/session conservée a émis, dans l'ordre :

1. `Inspector.targetReloadedAfterCrash` ;
2. `Runtime.executionContextsCleared` ;
3. un `Runtime.executionContextCreated` frais avec l'origine exacte du script complet.

Le propriétaire de la révision 18 a alors envoyé de manière synchrone le `Runtime.evaluate` d'identité
avant `Runtime.runIfWaitingForDebugger`. La trace n'a émis aucun `Inspector.workerScriptLoaded` ;
la commande d'identité est restée non résolue pendant toute l'échéance absolue de sonde de 30 secondes,
après quoi le même remplaçant est retourné à `Inspector.targetCrashed` et `stopped`. Le contexte frais
a donc prouvé l'autorité mais n'a pas prouvé que le worker en pause pouvait exécuter une évaluation.

Il ne s'agit pas d'un envoi JavaScript ou WebSocket différé. Le client CDP brut suivi appelle
`socket.send(serialized)` avant de renvoyer chaque promesse de commande. Ses 17 tests déterministes
réussissent, y compris l'observation immédiate d'envois multiples et la corrélation de réponses désordonnées.
Tous les octets de commande de la révision 18 étaient sur le câble sans await intermédiaire. La falsification
montre que Chrome traite les commandes en série sur cette session de service worker conservée : un premier
`Runtime.evaluate` qui requiert le worker en pause empêche la commande de reprise ultérieure sur la même session
d'être traitée. Mettre en file d'attente les octets de reprise plus tard ne peut pas rompre ce cycle causal
au niveau du protocole.

La révision 19 conserve l'ensemble des garanties de crash, rechargement, génération de contexte,
tombstones, origine et session persistante de la révision 16 et conserve la sémantique de métadonnées
persistante de version sélectionnée de la révision 18. Elle modifie uniquement l'ordre du lot d'amorçage
et la réduction de ses preuves. Sur la transition gardée quittant `replacement_starting`, un effet
synchrone de client suivi distribue des octets vers la session conservée exacte dans cet ordre exact,
sans attendre de réponse entre les envois :

1. exactement un `Runtime.runIfWaitingForDebugger` avec `{}` ;
2. le `Runtime.evaluate` d'identité fixe sur le `uniqueContextId` frais figé ;
3. le `Runtime.evaluate` de test explicite facultatif sur ce même contexte, uniquement lorsque
   `testProbeConfigured` figé est vrai.

L'identifiant de la commande de reprise est un entier sûr positif `n` ; l'identifiant de la commande
d'identité est exactement `n + 1` ; lorsqu'il est configuré, l'identifiant de la commande de test est
exactement `n + 2`. Sans sonde de test, les deux champs de reçu de test sont `null` et aucun troisième
identifiant de commande n'est consommé. Le lot consomme deux emplacements opérationnels de commande
sans la sonde de test et trois avec elle, dans la limite du budget existant de commandes en attente.
Aucun autre producteur ne peut émettre de commande sur la session sélectionnée entre ces envois.
Avant le premier envoi, l'acteur réserve de manière atomique le nombre complet d'emplacements et la
plage complète d'identifiants entiers sûrs consécutifs. Un nombre d'emplacements insuffisant ou un
dépassement de plage d'identifiants échoue avant qu'aucun octet du lot ne soit émis ; un échec d'envoi
synchrone après cette réservation conserve le préfixe exact envoyé, entre dans la release en échec et
ne peut jamais relancer le lot d'amorçage.

Le shell attend chaque promesse distribuée sous l'échéance brute absolue inchangée, valide chaque session
exacte, méthode, paramètres, identifiant positif de commande, schéma de résultat et hachage de résultat,
et émet seulement alors des événements de machine typés dans l'ordre canonique de distribution : reprise,
identité, test facultatif. L'ordre d'achèvement des promesses ne sélectionne jamais une transition. Les
événements natifs de version, d'Inspector et de Runtime continuent de parvenir à l'acteur pendant que
l'attente de promesse est en cours. Un rejet de reprise ou un reçu malformé signifie que la pause n'a pas
été libérée et est terminal. Un rejet d'identité, une exception ou une discordance signifie que l'autorité
n'a pas été prouvée et est terminal même si la reprise a réussi. Une exception de test facultatif ou un
résultat applicatif attendu rejeté constitue un diagnostic applicatif bloquant mais complète néanmoins
cet état opérationnel ; un échec de commande/transport/schéma est terminal. Une promesse manquante, un
écart/croisement/doublon d'identifiant, une discordance de session ou de méthode, une dérive de paramètres,
un résultat malformé ou l'expiration de l'échéance entre dans la release en échec et ne peut jamais publier
d'autorité d'amorçage.

La preuve de version sélectionnée demeure persistante pendant que le lot est en attente et que ses reçus
sont réduits. Dans `resuming`, `identity_probing`, `test_probe_deciding` et `test_probing`, chaque
`VERSION_UPDATED` courant avec l'enregistrement, la version, le script figés exacts, `status='activated'`,
la cible figée ou absente et un `runningStatus` de `starting` ou `running` est conservé de manière
idempotente. `running` peut affiner `starting` une fois et est persistant. Un doublon exact est sans effet (no-op).
Une dérive d'enregistrement/version/script/statut/cible, `stopping`, `stopped`, `redundant`, ou
`running -> starting` est terminale dans chaque état. Ainsi, l'unique preuve native `running` survit
qu'elle arrive avant la réduction de reprise, entre reprise et identité, entre identité et test facultatif,
ou après la réduction finale de commande. L'amorçage ne se termine qu'après que le reçu exact de reprise,
la preuve d'identité, l'achèvement du test facultatif lorsqu'il est configuré, le statut `running` de la
version sélectionnée et tous les hachages de corrélation du lot sont conservés.

## Falsification du transfert de la révision 19 et décision de la révision 20

Quatre exécutions réelles sous Chrome-for-Testing 149 ont prouvé le redémarrage brut et la libération
exacte de la révision 19. La première exécution canonique de `runtime.service-worker-reload` a ensuite échoué
avant `connectOverCDP` : le contrôleur a transmis l'objet complet `RawWorkerAuthority` au propriétaire
Playwright plus étroit. TypeScript a autorisé ce sur-ensemble structurel, tandis que le validateur
d'exécution a itéré chaque valeur énumérable comme une chaîne. L'`attachmentGeneration` numérique a donc
atteint `String.prototype.includes` et a levé `TypeError: value.includes is not a function`. Le transfert
ne disposait d'aucun contrat explicite de projection à l'exécution.

La révision 20 conserve l'ensemble des comportements de la révision 19 et ajoute exactement un contrat
de frontière. Après la libération brute exacte et avant l'acquisition Playwright, le contrôleur construit
un objet `PlaywrightAuthorityV1` frais avec exactement ces six champs énumérables propres et aucune opération
de décomposition (spread) :

```text
PlaywrightAuthorityV1 = {
  extensionId: string,
  registrationId: string,
  versionId: string,
  scopeURL: string,
  scriptURL: string,
  targetId: string
}
```

Chaque valeur est copiée depuis le `RawWorkerAuthority` figé de l'époque actuelle de processus/bail/redémarrage.
`sessionId`, `uniqueContextId`, `attachmentGeneration` et `attachmentOrigin` sont délibérément exclus :
la libération brute a révoqué cette capacité de session/contexte, tandis que le propriétaire Playwright
doit établir sa propre session et son propre contexte de diagnostic imbriqués sur la même cible figée.
La projection ne peut altérer l'état ni autoriser d'effets.

La frontière de projection pré-réservation valide ce DTO selon le schéma. Elle rejette tout élément
qui n'est pas un enregistrement, toute clé manquante ou inconnue, toute valeur non chaîne, tout identifiant
vide ou hors limites, tout NUL/CR/LF, tout identifiant d'extension non canonique, toute portée discordante,
tout script en dehors de la portée ou toute identité de cible malformée avec une erreur de harnais typée.
Elle copie ensuite les six valeurs dans un nouvel objet profondément figé ; le propriétaire Playwright n'énumère
ni ne conserve jamais un sur-ensemble structurel détenu par l'appelant. Un rejet de validation ne peut
pas atteindre `connectOverCDP`, exposer des capacités de fixture ou créer un succès.

Les tests de contrat de la révision 20 doivent prouver la projection brute vers Playwright exacte,
rejeter chaque champ manquant, supplémentaire et non chaîne sans `TypeError` JavaScript, et conserver
toutes les vérifications existantes d'URL/portée d'autorité. Le scénario d'exécution packagé canonique
doit ensuite réussir trois répétitions consécutives réelles sous Chrome ; un smoke brut seul ne peut pas
satisfaire cette preuve de transfert.

La revue indépendante a rejeté la révision 20 car cette projection demeurait une précondition de shell
non modélisée et ne décidait pas de la propriété lors du rejet. La révision 21 a ajouté une étape d'acteur
pré-réservation, mais la revue indépendante a rejeté son DTO d'événement omis, son reçu sans propriétaire
ouvert, ses pièges de réflexion qui s'échappaient et son obligation finale obsolète. La révision 22 a fermé
ces frontières mais n'a pas lié un DTO d'événement cohérent en interne à sa source brute. La révision 23
conserve le DTO et l'étape d'acteur et ferme cette arête d'autorité finale ci-dessous.

L'époque brute invoquée renvoie `RAW_RELEASE_PROVED` de manière atomique avec son reçu privé exact
de libération et le `RawWorkerAuthority` actuel profondément figé issu de la même sortie d'acteur.
La transition externe conserve les deux dans le contexte de la machine ; aucune reconstruction de shell
ni référence mutable ultérieure ne peut les remplacer. Depuis `owner_none`, et uniquement avec le reçu
de libération brute exact actuel, la machine externe accepte `PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED`
et entre dans `playwright_authority_projecting`. Cet état ne détient aucun transport racine, ne réserve
aucun bail et n'expose aucune capacité. Son unique effet invoqué pur sélectionne les six champs bruts
nommés dans un nouvel objet, l'analyse, le fige et calcule
`authorityProjectionSha256 = SHA-256(JCS(PlaywrightAuthorityV1))`.

L'invocation renvoie exactement un événement fermé :

```text
PLAYWRIGHT_AUTHORITY_PROJECTED {
  processGeneration, playwrightEpoch, rawReceiptSha256,
  authority: PlaywrightAuthorityV1,
  authorityProjectionSha256
}

PLAYWRIGHT_AUTHORITY_REJECTED {
  processGeneration, playwrightEpoch, rawReceiptSha256,
  error: PlaywrightAuthorityProjectionErrorV1
}

PlaywrightAuthorityProjectionErrorV1 = {
  schemaVersion: 1,
  code:
    | 'SOURCE_NOT_RECORD'
    | 'SOURCE_INTROSPECTION_FAILED'
    | 'KEY_SET_INVALID'
    | 'FIELD_TYPE_INVALID'
    | 'FIELD_EMPTY'
    | 'FIELD_UTF8_LIMIT_EXCEEDED'
    | 'FIELD_CONTROL_CHARACTER'
    | 'EXTENSION_ID_INVALID'
    | 'SCOPE_URL_INVALID'
    | 'SCRIPT_URL_INVALID',
  field: 'extensionId' | 'registrationId' | 'versionId' |
         'scopeURL' | 'scriptURL' | 'targetId' | null
}
```

Les champs exacts acceptés de la projection utilisent `MAX_ID_BYTES = 4_096` ; l'ensemble des six valeurs
doivent être des chaînes non vides sans NUL, CR ou LF. `extensionId` doit correspondre à
`^[a-p]{32}$` ; `scopeURL` doit être égal à
`chrome-extension://<extensionId>/` ; `scriptURL` doit commencer par cette portée exacte ;
`targetId` ne comporte aucune syntaxe supplémentaire au-delà des règles communes d'identifiants bornés.
L'analyseur utilise `Reflect.ownKeys` et les descripteurs de données propres à l'intérieur d'une
frontière d'inspection fermée unique : les symboles, les accesseurs, les champs non énumérables et un ensemble
de clés autre que les six exacts constituent `KEY_SET_INVALID`. Tout piège levé par `ownKeys`,
`getOwnPropertyDescriptor`, prototype ou lecture de propriété, y compris un Proxy révoqué, est intercepté
avant de franchir la frontière et normalisé en `SOURCE_INTROSPECTION_FAILED` avec `field:null`.
Il ne lit aucun accesseur et n'expose jamais d'erreur de réflexion native ni de `TypeError`.

`PLAYWRIGHT_AUTHORITY_PROJECTED` avec la génération exacte, l'époque, le hachage du reçu brut actuel,
un DTO à six champs valide selon le schéma et un hachage recalculé à partir de ce DTO d'événement exact
entre dans `playwright_authority_ready` uniquement lorsque les six valeurs du DTO sont égales à la projection
canonique pure de `context.currentRawAuthority` et
`event.authorityProjectionSha256 === SHA-256(JCS(project(context.currentRawAuthority)))`.
L'action de transition copie et fige profondément `event.authority` dans le contexte privé de la machine ;
aucun canal latéral d'acteur invoqué ou de shell ne peut le peupler. Cet état ne détient toujours aucun
transport. `PLAYWRIGHT_RESERVE_REQUESTED` n'est admissible que là et doit répéter le hachage exact de projection ;
seule sa transition réserve le bail suivant et ouvre le transport suivi. `PLAYWRIGHT_AUTHORITY_REJECTED`
entre directement dans `failed_shutdown_connecting` externe. Son action de transition fige ce reçu privé
avant qu'aucun effet d'arrêt ne s'exécute :

```text
NoOwnerReleaseReceiptV1 = {
  schemaVersion: 1,
  processGeneration,
  playwrightEpoch,
  rawReceiptSha256,
  ownerKind: 'none',
  leaseReserved: false,
  transportOpened: false,
  authorityProjectionSha256: null,
  receiptSha256
}
```

`receiptSha256` est le SHA-256 sur le JCS RFC 8785 des huit champs précédents, en s'excluant lui-même.
La garde de transition exige la génération actuelle, l'époque Playwright en attente et le hachage exact
du reçu brut actuel ; l'état lui-même prouve qu'aucun compteur de bail n'a été incrémenté et qu'aucune
identité de transport n'existe. Il n'y a aucun événement `OWNER_RELEASE_PROVED` dans cette branche
car il n'y a aucun propriétaire à libérer. L'arrêt en échec/la suppression du profil se poursuit à partir
du reçu sans propriétaire figé. Les événements de projection périmés, dupliqués, malformés ou divergents
en hachage ne peuvent pas réserver de bail, se connecter ou fabriquer ce reçu.

Le contrôleur transmet uniquement le DTO conservé en privé, analysé et figé au propriétaire Playwright.
Le propriétaire accepte cette valeur typée marquée (branded) ; il n'accepte ni n'énumère jamais le sur-ensemble
structurel brut. Ainsi, aucun rejet de validation d'autorité post-réservation n'existe dans le chemin
canonique. Un test direct d'analyseur de frontière peut fournir des valeurs `unknown` hostiles, mais
`connectOverCDP`, `transport.open` et chaque effet de fixture doivent rester non appelés lors du rejet.

Les tests hostiles de cette révision en attente couvrent chaque code d'erreur et champ, les entrées non-records,
chaque cas de clé manquante/supplémentaire/symbole/accesseur/non énumérable, chaque valeur non chaîne,
vide, de 4 097 octets et avec NUL/CR/LF, l'identifiant d'extension non canonique, la dérive de portée/script,
les pièges levant des exceptions dans `ownKeys`/descripteur/propriété, un Proxy révoqué, et l'exclusion
exacte de `sessionId`, `uniqueContextId`, `attachmentGeneration` et `attachmentOrigin`. Les tests de machine
prouvent le succès, le rejet, la génération/époque/reçu brut périmé, le résultat dupliqué et la dérive de
hachage de projection. Ils mutent également chacun des six champs d'autorité de manière indépendante,
recalculent un hachage d'événement cohérent en interne et conservent le reçu brut correct ; chaque DTO
étranger de ce type doit laisser la machine en dehors de `playwright_authority_ready` avec zéro réservation
et zéro transport. Les tests de contrôleur prouvent zéro bail, zéro transport et zéro `connectOverCDP` avant
acceptation. Le scénario d'exécution canonique doit toujours réussir trois répétitions consécutives réelles
sous Chrome contre cette révision en attente.

## Topologie XState faisant autorité

L'implémentation utilise deux machines XState v5 privées :

- `mv3HarnessMachine` détient l'artefact, le processus, le bail CDP exclusif, les époques Playwright,
  le verdict et le nettoyage global ;
- une `rawWorkerRestartMachine` invoquée détient une époque brute depuis l'armement de l'auto-attachement
  jusqu'à la libération exacte.

Le shell n'effectue les I/O de processus, fichier, WebSocket, CDP et Playwright qu'en tant qu'acteurs invoqués.
Les résultats d'acteurs sont des événements typés validés selon le schéma. Aucun `phase`, indicateur booléen
de propriété, statut en texte libre, ordre d'arrivée de promesses, texte de diagnostic ou sortie de LLM
ne peut décider d'une transition. Les nœuds d'état XState constituent la seule autorité de phase et de
propriété.

La fixture publique reçoit des DTO détachés et figés et une façade étroitement typée dont les seules opérations
sont `openSidePanel`, `seedStorage`, `restartServiceWorkerForProbe`, `evaluateInRestartedServiceWorker`
et l'accès en lecture seule aux diagnostics/manifeste. Elle ne reçoit jamais d'acteur XState, d'instantané natif,
de Browser, de BrowserContext, de Worker, de CDPSession, de capacité privée, de point de terminaison (endpoint)
ou de reçu mutable. `Page` n'est renvoyé que par `openSidePanel` pour l'époque Playwright actuelle et est
invalidé par un redémarrage.

### Machine externe

La région du cycle de vie comporte ces transitions explicites ; chaque entrée d'état n'invoque que
l'effet nommé dans la colonne finale :

| État                                                          | Événement / garde                                                        | État suivant                       | Effet                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `absent`                                                      | `HARNESS_STARTED`                                                        | `artifact_sealing`                 | inspecter et hacher le `dist` exact                                                                |
| `artifact_sealing`                                            | `ARTIFACT_SEALED`                                                        | `profile_creating`                 | créer un profil vierge après avoir prouvé l'absence de fichier d'endpoint                          |
| `profile_creating`                                            | `PROFILE_CREATED`                                                        | `process_spawning`                 | engendrer l'enfant exact une fois                                                                  |
| `process_spawning`                                            | `PROCESS_SPAWNED`                                                        | `endpoint_waiting`                 | attendre l'analyse stricte du fichier en concurrence avec la sortie de l'enfant                    |
| `endpoint_waiting`                                            | `ENDPOINT_PARSED`                                                        | `owner_none`                       | conserver la capacité privée analysée ; n'ouvrir aucun socket                                      |
| `owner_none`                                                  | `RAW_ACQUIRE_REQUESTED(initial_bootstrap)` et aucune réservation         | `raw_connecting.initial_bootstrap` | réserver l'époque, puis ouvrir le socket brut suivi                                                |
| `raw_connecting.initial_bootstrap`                            | `RAW_TRANSPORT_OPENED` actuel                                            | `raw_connecting.initial_bootstrap` | conserver l'identifiant exact de transport ; envoyer `Browser.getVersion`                          |
| `raw_connecting.initial_bootstrap`                            | `ENDPOINT_VERIFIED` actuel                                               | `raw_owned.initial_bootstrap`      | invoquer l'acteur de redémarrage brut                                                              |
| `raw_owned.initial_bootstrap`                                 | `RAW_BOOTSTRAP_PROVED`                                                   | `raw_releasing.initial_bootstrap`  | invoquer la libération brute exacte                                                                |
| `raw_releasing.initial_bootstrap`                             | `RAW_RELEASE_PROVED` de l'acteur brut invoqué actuel                     | `owner_none`                       | conserver de façon atomique le reçu brut privé et le `RawWorkerAuthority` figé                     |
| `owner_none`                                                  | `PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED` et reçu brut actuel          | `playwright_authority_projecting`  | invoquer la projection pure à six champs ; ne détenir aucun bail ni transport                      |
| `playwright_authority_projecting`                             | `PLAYWRIGHT_AUTHORITY_PROJECTED` exact actuel                            | `playwright_authority_ready`       | conserver le DTO figé et le hachage de projection en privé                                         |
| `playwright_authority_projecting`                             | `PLAYWRIGHT_AUTHORITY_REJECTED` exact actuel                             | `failed_shutdown_connecting`       | figer l'erreur typée et le reçu exact sans propriétaire ; n'ouvrir aucun nettoyage de propriétaire |
| `playwright_authority_ready`                                  | `PLAYWRIGHT_RESERVE_REQUESTED` avec le hachage de projection exact       | `playwright_connecting`            | réserver l'époque, ouvrir le transport public suivi, se connecter                                  |
| `playwright_connecting`                                       | `PLAYWRIGHT_TRANSPORT_OPENED` actuel                                     | `playwright_connecting`            | conserver l'identifiant de transport ; appeler `connectOverCDP` une fois                           |
| `playwright_connecting`                                       | `PLAYWRIGHT_HANDOFF_PROVED`                                              | `playwright_owned.exercising`      | exposer la façade détachée de fixture                                                              |
| `playwright_connecting`                                       | `PLAYWRIGHT_CONNECT_FAILED_CLOSED`                                       | `failed_releasing`                 | conserver le reçu fermé d'échec de connexion                                                       |
| `playwright_owned.exercising`                                 | `RESTART_REQUESTED` et le compteur de redémarrage à l'exécution est `0`  | `playwright_releasing.restart`     | réserver atomiquement le compteur `1` ; fermer les pages de fixture ; déconnecter                  |
| `playwright_owned.exercising`                                 | `RESTART_REQUESTED` et le compteur de redémarrage à l'exécution est `1`  | `failed_releasing`                 | conserver la violation de limite de redémarrage ; libérer le propriétaire actuel                   |
| `playwright_releasing.restart`                                | `PLAYWRIGHT_RELEASE_PROVED`                                              | `owner_none`                       | invalider chaque ancien descripteur (handle) Playwright                                            |
| `owner_none`                                                  | `RAW_ACQUIRE_REQUESTED(runtime_restart)` et redémarrage en attente       | `raw_connecting.runtime_restart`   | réserver une époque supérieure, puis ouvrir le socket brut suivi                                   |
| `raw_connecting.runtime_restart`                              | `RAW_TRANSPORT_OPENED` actuel                                            | `raw_connecting.runtime_restart`   | conserver l'identifiant de transport ; envoyer `Browser.getVersion`                                |
| `raw_connecting.runtime_restart`                              | `ENDPOINT_VERIFIED` actuel                                               | `raw_owned.runtime_restart`        | invoquer l'acteur de redémarrage brut                                                              |
| `raw_owned.runtime_restart`                                   | `RAW_BOOTSTRAP_PROVED`                                                   | `raw_releasing.runtime_restart`    | invoquer la libération brute exacte                                                                |
| `raw_releasing.runtime_restart`                               | `RAW_RELEASE_PROVED` de l'acteur brut invoqué actuel                     | `owner_none`                       | conserver de façon atomique le reçu brut privé et le `RawWorkerAuthority` figé                     |
| `owner_none`                                                  | `PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED` et reçu brut actuel          | `playwright_authority_projecting`  | invoquer la projection pure à six champs ; ne détenir aucun bail ni transport                      |
| `playwright_authority_ready`                                  | `PLAYWRIGHT_RESERVE_REQUESTED` avec le hachage de projection exact       | `playwright_connecting`            | réserver l'époque, ouvrir le transport public suivi, reconnecter                                   |
| `playwright_owned.exercising`                                 | `USE_COMPLETED`                                                          | `diagnostics_settling`             | attendre l'échéance de stabilisation des diagnostics                                               |
| `playwright_owned.exercising`                                 | `USE_FAILED`                                                             | `failed_releasing`                 | conserver l'erreur de fixture ; libérer le propriétaire actuel                                     |
| `diagnostics_settling`                                        | fin d'échéance de stabilisation et verdict `eligible`                    | `diagnostics_evaluating`           | inspecter l'accumulateur d'événements                                                              |
| `diagnostics_settling`                                        | fin d'échéance de stabilisation et verdict `blocked`                     | `diagnostics_evaluating`           | inspecter l'accumulateur d'événements                                                              |
| `diagnostics_evaluating`                                      | `DIAGNOSTICS_ACCEPTED` et verdict `eligible`                             | `artifact_reverifying`             | réinspecter le `dist` scellé                                                                       |
| `diagnostics_evaluating`                                      | `DIAGNOSTICS_REJECTED` ou verdict `blocked`                              | `failed_releasing`                 | figer le reçu de rejet ; libérer le propriétaire Playwright                                        |
| `artifact_reverifying`                                        | `ARTIFACT_MATCHED` et verdict `eligible`                                 | `playwright_releasing.final`       | fermer les pages de fixture sauf la sentinelle ; déconnecter                                       |
| `playwright_releasing.final`                                  | `PLAYWRIGHT_RELEASE_PROVED` et verdict `eligible`                        | `shutdown_connecting`              | réserver l'époque d'arrêt ; ouvrir le socket brut suivi                                            |
| `playwright_releasing.final`                                  | `PLAYWRIGHT_RELEASE_PROVED` et verdict `blocked`                         | `failed_shutdown_connecting`       | préserver la preuve de libération ; exécuter l'arrêt en échec uniquement                           |
| `shutdown_connecting`                                         | `SHUTDOWN_TRANSPORT_OPENED` actuel                                       | `shutdown_connecting`              | conserver l'identifiant de transport ; envoyer `Browser.getVersion`                                |
| `shutdown_connecting`                                         | `SHUTDOWN_ENDPOINT_VERIFIED` correspondant actuel                        | `shutdown_owned`                   | envoyer le `Browser.close` exact                                                                   |
| `shutdown_owned`                                              | réponse de fermeture actuelle ou reçu causal de fermeture de socket      | `shutdown_owned`                   | conserver la preuve exacte de fermeture                                                            |
| `shutdown_owned`                                              | `PROCESS_EXITED` exact actuel et une preuve de fermeture conservée       | `profile_removing`                 | supprimer le profil après la preuve d'arrêt causal                                                 |
| `shutdown_owned`                                              | `PROCESS_EXITED` exact actuel sans preuve de fermeture conservée         | `failed_profile_removing`          | conserver l'échec de sortie non causale ; supprimer le profil ; ne jamais passer en succès         |
| `profile_removing`                                            | diagnostic bloquant tardif, échec de protocole ou dépassement de preuves | `profile_removing`                 | révoquer l'éligibilité ; poursuivre la suppression bornée du profil                                |
| `profile_removing`                                            | `PROFILE_REMOVED` et chaque invariant de succès et verdict `eligible`    | `passed`                           | figer les preuves de succès                                                                        |
| `profile_removing`                                            | `PROFILE_REMOVED` et verdict `blocked`                                   | `archived`                         | archiver les preuves en échec ; ne jamais entrer dans passed                                       |
| `passed`                                                      | diagnostic bloquant tardif, échec de protocole ou dépassement de preuves | `passed_blocked`                   | révoquer le succès provisoire ; conserver les preuves tardives                                     |
| `passed`                                                      | `VERDICT_ARCHIVED` et verdict `eligible`                                 | `archived`                         | archiver atomiquement les preuves de succès                                                        |
| `passed_blocked`                                              | `VERDICT_ARCHIVED`                                                       | `archived`                         | archiver les preuves en échec ; ne jamais archiver un succès                                       |
| tout état opérationnel actif sauf arrêt/suppression de profil | `PROCESS_EXITED` inattendu actuel                                        | `failed_process_exited_releasing`  | conserver l'échec initial ; fermer les propriétaires/écouteurs locaux uniquement                   |
| `failed_process_exited_releasing`                             | `EXITED_OWNER_CLOSED` actuel                                             | `failed_profile_removing`          | supprimer le profil exact ayant quitté ; ne jamais reconnecter ni signaler le PID                  |

Tout échec de garde/effet/protocole/identité fait transiter la région de cycle de vie vers
`failed_releasing`, sauf le rejet de projection d'autorité explicitement préalable à la réservation,
qui fige `NoOwnerReleaseReceiptV1` et entre directement dans `failed_shutdown_connecting`.
`failed_releasing` invoque la libération spécifique au propriétaire. Il n'accepte
`OWNER_RELEASE_PROVED` qu'après soit une libération normale complète, soit un reçu exact sans propriétaire,
puis entre dans `failed_shutdown_connecting`. Si un reçu exact `PROCESS_EXITED` actuel existe déjà,
`failed_releasing` ferme d'abord tout objet de transport local restant sans ouvrir de socket ni signaler
le PID éteint, puis transite directement vers `failed_profile_removing`. Sinon, l'acquisition exacte du transport
d'arrêt entre dans `failed_shutdown` ; la sortie exacte de l'enfant entre dans `failed_profile_removing` ;
`PROFILE_REMOVED` entre dans `archived`. `CLEANUP_FAILED` conserve le cycle de vie et les preuves en échec
et ne peut jamais atteindre `passed`.

La région de verdict parallèle comporte uniquement :

```text
eligible -- APPLICATION_DIAGNOSTIC_RECORDED | EVIDENCE_OVERFLOW_RECORDED |
            OBSERVER_PROTOCOL_FAILED --> blocked
blocked -- any later event --> blocked
```

L'acteur externe est parallèle : la région de cycle de vie suit le chemin opérationnel
ci-dessus tandis que la région de verdict est exactement `eligible | blocked`. Avant la stabilisation
du diagnostic, les diagnostics applicatifs n'interrompent pas la reprise/libération brute ni le
transfert Playwright nécessaire pour inspecter les preuves. `DIAGNOSTICS_ACCEPTED` ne peut avancer
vers le succès que pendant que le verdict est `eligible` ; tout diagnostic ultérieur oriente le cycle
de vie restant vers la libération du propriétaire et l'échec archivé, avec les branches gardées de libération
finale/suppression de profil ci-dessus.

`archived` est l'unique état final. `passed` est inaccessible tant que tous les transports racines
ne sont pas fermés, que le processus enfant exact n'a pas quitté et que le profil vierge n'a pas été supprimé.
Un verdict en échec ne devient jamais passant ; le nettoyage rend seulement le verdict en échec archivable.

### Événements fermés

La machine externe n'admet que des événements validés selon le schéma transportant le
`processGeneration` actuel et, le cas échéant, le `leaseEpoch` :

```text
HARNESS_STARTED
ARTIFACT_SEALED
PROFILE_CREATED
PROCESS_SPAWNED
ENDPOINT_PARSED
ENDPOINT_VERIFIED
RAW_ACQUIRE_REQUESTED | RAW_TRANSPORT_OPENED | RAW_ACQUIRE_REJECTED
RAW_BOOTSTRAP_PROVED | RAW_RELEASE_PROVED | RAW_FAILED
PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED
PLAYWRIGHT_AUTHORITY_PROJECTED | PLAYWRIGHT_AUTHORITY_REJECTED
PLAYWRIGHT_RESERVE_REQUESTED
PLAYWRIGHT_TRANSPORT_OPENED | PLAYWRIGHT_HANDOFF_PROVED
PLAYWRIGHT_RELEASE_PROVED | PLAYWRIGHT_CONNECT_FAILED_CLOSED | PLAYWRIGHT_FAILED
RESTART_REQUESTED
USE_COMPLETED | USE_FAILED
APPLICATION_DIAGNOSTIC_RECORDED | EVIDENCE_OVERFLOW_RECORDED
OBSERVER_PROTOCOL_FAILED
DIAGNOSTICS_ACCEPTED | DIAGNOSTICS_REJECTED
ARTIFACT_MATCHED | ARTIFACT_CHANGED
SHUTDOWN_TRANSPORT_OPENED | SHUTDOWN_ENDPOINT_VERIFIED
SHUTDOWN_BROWSER_CLOSE_RESOLVED | SHUTDOWN_SOCKET_CLOSED_AFTER_COMMAND
OWNER_RELEASE_PROVED | PROCESS_EXITED | PROFILE_REMOVED
EXITED_OWNER_CLOSED
VERDICT_ARCHIVED | CLEANUP_FAILED
```

Les événements inconnus ou malformés sont rejetés par la frontière de schéma avant XState.
Les événements bien formés d'une génération périmée, d'une époque périmée et terminaux dupliqués entrent
dans la machine et sont rejetés ou ignorés par des gardes nommées explicites. Ils sont conservés en tant
que diagnostics mais ne peuvent pas muter un état plus récent.

## Artefact scellé et diagnostics

Le condensat de l'arbre est le SHA-256 sur le chemin POSIX relatif trié, la longueur en octets et le SHA-256 par fichier, y compris `manifest.json`. Les condensats avant le lancement et après l'utilisation doivent correspondre. Tout octet packagé identifiant `src/dev`, des stubs Chrome, DevPanel, l'enregistreur de pont (bridge logger), des globales DEV ou des clés de stockage DEV constitue un échec terminal.

Les diagnostics bloquants incluent chaque `pageerror` de page, `console.error` de page, avertissement avec vocabulaire d'échec, avertissement d'erreur/échec du service worker, `Runtime.exceptionThrown` brut ou Playwright, rejet non géré, sortie inattendue de processus et enregistrement correspondant de stabilisation tardive. La fixture détient un accumulateur de preuves borné indexé par époque sur l'ensemble des époques brutes et Playwright et n'expose que des copies figées.

Chaque message CDP entrant contrôlé par le harnais (client d'époque brute et session imbriquée de service worker) est rejeté au-delà de `MAX_CDP_MESSAGE_BYTES = 1_048_576`. Le transport de socket de navigateur Playwright suivi utilise en revanche `PLAYWRIGHT_MAX_INBOUND_MESSAGE_BYTES = 16_777_216`, car il multiplexe le trafic de protocole propre à Playwright — instantanés DOM de trace avec feuilles de style intégrées, corps de ressources capturées et captures d'écran en cas d'échec — dont les trames individuelles dépassent légitimement 1 Mio.
Chaque élément de preuve valide selon le schéma possède une forme canonique JCS plafonnée à 65 536 octets. Les accumulateurs de diagnostics, de commandes de protocole et de CDP imbriqué conservent chacun au plus 4 096 éléments et 4 Mio.

Les cartes d'autorité ne conservent jamais les `params` CDP bruts, les descriptions, les traces de pile ou les charges utiles (payloads) d'objets distants. Leurs schémas normalisent uniquement les identifiants bornés, l'identité d'URL, les énumérations, les booléens, les entiers sûrs et les hachages d'événements. Chaque chaîne conservée est d'abord bornée par des octets UTF-8 : les identifiants à 512 octets et les URL canoniques à 4 096 octets. La longueur en octets JCS canonique est vérifiée avant toute mutation de carte ou d'inventaire. Les budgets fermés par structure sont :

| Structure                      | Entrées | Octets JCS par entrée | Total d'octets JCS |
| ------------------------------ | ------: | --------------------: | -----------------: |
| carte d'enregistrements        |      64 |                 4 096 |            262 144 |
| carte de versions              |     256 |                 4 096 |          1 048 576 |
| carte de cibles                |   1 024 |                 4 096 |          4 194 304 |
| carte de sessions              |   1 024 |                 4 096 |          4 194 304 |
| carte de contextes d'exécution |   4 096 |                 2 048 |          8 388 608 |
| inventaire d'attachements      |   1 024 |                 8 192 |          8 388 608 |

Les enregistrements de contexte actif, les tombstones de contextes révoqués au moment du crash et les tombstones de contextes détruits post-crash partagent le budget unique de contextes d'exécution ci-dessus. La transition de crash modifie la classification d'autorité pré-crash de manière atomique sans dupliquer les charges utiles conservées. Une destruction post-crash ne conserve que son identifiant unique normalisé dans l'ensemble de tombstones distinct, jamais le payload CDP brut. Le `retiredContextEvidenceCount` par redémarrage est plafonné strictement à 4 096 pour les observations de destruction/vidage ; l'événement 4 097 enregistre un dépassement typé et entre dans la release en échec. Les événements de contexte ultérieurs ne peuvent donc pas créer un second historique non borné même lorsque les identifiants se répètent.

Le registre des écouteurs est plafonné à 64 entrées normalisées et 65 536 octets JCS au total. Les commandes en attente ont un plafond total strict de 256 divisé en 224 emplacements opérationnels et 32 emplacements réservés exclusivement au nettoyage ; leurs métadonnées normalisées sont plafonnées à 2 048 octets par entrée et 524 288 octets au total. Le code opérationnel ne peut pas consommer la réserve ; après un dépassement, les commandes de nettoyage sont strictement sérialisées et réutilisent au plus un emplacement réservé à la fois. Chaque accumulateur et structure bornée maintient une chaîne de hachage en O(1) `H_n=SHA-256(H_(n-1)||u64(length)||SHA-256(item))`, le nombre/octets totaux, le nombre/octets conservés et le nombre de dépassements sans conserver les charges utiles de dépassement.

La première violation de plafond émet le message typé `EVIDENCE_OVERFLOW_RECORDED`, fait passer le verdict à `blocked`, remplace les enregistrements rendus ultérieurs par des compteurs de métadonnées uniquement et poursuit la libération obligatoire. Tout dépassement de carte d'autorité, d'inventaire d'attachements ou de commande opérationnelle en attente entre dans `failed_releasing`, cesse de muter cette carte bornée, désarme l'auto-attachement en utilisant l'emplacement de nettoyage réservé et ne peut prouver qu'un arrêt en échec, jamais une libération brute normale complète. Un succès exige zéro dépassement dans chaque accumulateur/carte, afin que ses preuves conservées soient complètes. Une saturation (flooding) peut donc rendre la porte rouge mais ne peut pas faire croître la mémoire sans borne ni consommer la capacité de commande de nettoyage.

Chaque session remplaçante brute installe `Runtime.enable`, les observateurs de console, d'exceptions et de contexte d'exécution avant toute sonde fixe et avant `Runtime.runIfWaitingForDebugger`. La source de la sonde est une entrée de test explicite, jamais un signal de transition. Le succès de la sonde ne peut pas autoriser l'amorçage. Un avertissement de console, un rejet ou une exception produit par le code applicatif ou de sonde émet l'événement typé `APPLICATION_DIAGNOSTIC_RECORDED`, ajoute au registre et déplace la région de verdict parallèle à `blocked`, mais la machine brute poursuit à travers la reprise, la libération exacte et le transfert afin que les tests contradictoires puissent inspecter les preuves. `DIAGNOSTICS_REJECTED` rend ultérieurement le succès impossible. Une réponse d'identité fixe avec des valeurs erronées ou `exceptionDetails` émet également `IDENTITY_PROOF_FAILED` et entre en libération car l'autorité n'a pas été prouvée ; une exception de sonde de test facultative demeure un simple diagnostic. L'incapacité à installer un observateur, à analyser un événement de protocole, à transporter la commande de sonde, à corréler l'identité ou à préserver la propriété émet `OBSERVER_PROTOCOL_FAILED` et interrompt immédiatement. Une expression de sonde qui renvoie `exceptionDetails` ou rejette constitue un diagnostic applicatif ; un échec de commande/transport/schéma CDP constitue un échec de protocole d'observateur. Le texte de diagnostic ne sélectionne jamais l'une ou l'autre catégorie ; le canal typé émetteur le fait.

## Processus Chromium détenu manuellement

Playwright peut résoudre `chromium.executablePath()` avant le lancement, mais aucune API de lancement de navigateur ou de connexion de Playwright ne peut s'exécuter avant la première preuve brute. L'acteur de processus utilise `node:child_process.spawn` avec `shell:false`, l'exécutable Chrome for Testing exact fourni dans le bundle, et une liste blanche d'arguments immuable et auditée pour la version Playwright/Chromium épinglée. Il n'importe jamais de modules privés `playwright-core/lib`.

La liste blanche ordonnée commune est exacte ; `<profile>` et `<dist>` sont des chemins absolus validés et chaque autre octet est littéral :

```text
--disable-field-trial-config
--disable-background-networking
--disable-background-timer-throttling
--disable-backgrounding-occluded-windows
--disable-back-forward-cache
--disable-breakpad
--disable-client-side-phishing-detection
--disable-component-extensions-with-background-pages
--disable-component-update
--no-default-browser-check
--disable-default-apps
--disable-dev-shm-usage
--disable-edgeupdater
--disable-extensions
--disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion
--enable-features=CDPScreenshotNewSurface
--allow-pre-commit-input
--disable-hang-monitor
--disable-ipc-flooding-protection
--disable-popup-blocking
--disable-prompt-on-repost
--disable-renderer-backgrounding
--force-color-profile=srgb
--metrics-recording-only
--no-first-run
--password-store=basic
--use-mock-keychain
--no-service-autorun
--export-tagged-pdf
--disable-search-engine-choice-screen
--unsafely-disable-devtools-self-xss-warnings
--edge-skip-compat-layer-relaunch
--disable-infobars
--disable-sync
--enable-unsafe-swiftshader
--no-sandbox
--remote-debugging-address=127.0.0.1
--remote-debugging-port=0
--user-data-dir=<profile>
--disable-extensions-except=<dist>
--load-extension=<dist>
--window-size=420,900
```

Le mode headless ajoute ensuite exactement :

```text
--headless
--hide-scrollbars
--mute-audio
--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4
```

Le mode headed n'ajoute aucun de ces quatre éléments. Les deux modes revus ajoutent un unique `about:blank` positionnel final et aucun autre argument. L'implémentation vérifie la version épinglée de `@playwright/test` `1.61.1` et refuse toute dérive de version avant le spawn ; une future mise à niveau devra revoir cette liste blanche.

L'admission de Chromium est également fermée. Avant le spawn, le `playwright-core/package.json` résolu doit être en version `1.61.1` ; son propre `browsers.json` doit contenir exactement l'uplet `chromium` installé `{revision:"1228",browserVersion:"149.0.7827.55",title:"Chrome for Testing"}`. `chromium.executablePath()` doit pointer vers un exécutable régulier qui n'est pas un lien symbolique sous le répertoire de cache Playwright de cette révision, son SHA-256 est figé, et une vérification préalable (preflight) `--version` avec argument uniquement doit se réduire exactement à `Google Chrome for Testing 149.0.7827.55`. L'enfant lancé admet plus tard uniquement un `Browser.getVersion` avec `protocolVersion:"1.3"`, `product:"Chrome/149.0.7827.55"`, `revision:"@3188f8a607ae7e067593be8aab7f02d2451fec07"` et `jsVersion:"14.9.207.21"`. Les octets de l'agent utilisateur (user-agent) spécifiques à la plateforme sont figés mais n'affaiblissent pas ces champs exacts. Toute dérive de package, de métadonnées, de chemin réel (realpath), de mode, de prévérification ou de version CDP est terminale avant l'autorité d'extension.

La liste blanche inclut donc exactement une valeur pour chaque capacité de lancement :

- nouveau `--user-data-dir=<profile>` ;
- `--remote-debugging-address=127.0.0.1` et `--remote-debugging-port=0` ;
- `--disable-extensions-except=<sealed dist>` et `--load-extension=<sealed dist>` ;
- drapeaux headless/fenêtre déterministes ou leur équivalent headed revu ;
- les drapeaux de stabilité Playwright audités, `--no-sandbox` pour le test runner, `--no-default-browser-check`, `--no-first-run`, puis un final `about:blank`.

Il n'y a aucun relais fourni par l'utilisateur, aucune expansion de shell, aucun profil utilisateur par défaut, aucune liaison d'hôte distant, aucun serveur Vite, backend ou chemin d'extension non scellé. Le reçu de spawn fige :

```text
(processGeneration, pid, executablePath, executableSha256,
 browserRevision, browserVersion, argvSha256,
 userDataDir, sealedTreeSha256, spawnedAt)
```

Stdout/stderr sont drainés via un décodeur de lignes UTF-8 en flux avec un plafond de ligne de 16 Kio et un plafond total de 1 Mio par flux. Les octets bruts de processus n'entrent jamais dans les logs, les erreurs, les registres ou les attachements. Avant la conservation, une ligne structurellement analysée correspondant à la forme de Chrome `DevTools listening on ws://127.0.0.1:<port><path>` est intégralement remplacée par `[redacted-devtools-endpoint processGeneration=<n>]` ; le port et le chemin du navigateur ne sont jamais conservés. Toute autre ligne contenant un endpoint `ws://`/`wss://` est caviardée dans son intégralité et bloque le verdict. Les lignes UTF-8 invalides et trop longues sont remplacées par des enregistrements bornés contenant uniquement des métadonnées, jamais par du contenu brut tronqué. `error` et `exit` sont en concurrence avec chaque attente de démarrage, d'endpoint, brute, Playwright et de nettoyage.

### Capacité DevToolsActivePort

Le fichier ne doit pas exister avant le spawn. L'admission exige, sous une échéance unique de démarrage :

1. que `lstat` prouve un fichier régulier qui n'est pas un lien symbolique à l'intérieur du profil vierge exact ;
2. que les octets correspondent exactement à `<port>\n<browser-path>` avec un `\n` final facultatif, sans CR et sans troisième enregistrement ;
3. que le premier enregistrement soit un port de boucle locale décimal canonique dans `1..65535` ;
4. que le second enregistrement corresponde à la forme UUID canonique minuscule complète `^/devtools/browser/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` ;
5. que l'endpoint dérivé soit exactement `ws://127.0.0.1:<port><browser-path>`.

Lors de l'attente active sous cette échéance, l'absence (`ENOENT`) et un fichier régulier de zéro octet constituent le même état d'admission transitoire : l'enfant n'a pas encore écrit les octets canoniques. Un fichier de zéro octet est réessayé exactement comme une absence et n'est jamais analysé. Un fichier non vide dont les octets ne satisfont pas la forme canonique (sur une/trois lignes, port/chemin invalide, CR/NUL) est terminal. L'échéance elle-même est terminale : un fichier qui n'est jamais admis dans ce délai échoue de façon hermétique.

Cette analyse émet `ENDPOINT_PARSED` ; elle n'ouvre aucun socket et ne prétend pas que l'endpoint appartienne à l'enfant. L'endpoint ne devient vérifié qu'après que la machine a réservé un bail brut, est entrée dans `raw_connecting`, a ouvert son unique socket suivi, et a reçu `Browser.getVersion` avant la sortie de l'enfant. Cette réponse valide les champs épinglés ci-dessus et fige `(protocolVersion, product, revision, userAgent, jsVersion, browserVersionResponseSha256)` dans le reçu de processus/endpoint utilisé à chaque transfert.

L'endpoint analysé est une capacité privée liée à la génération du processus. Il n'est jamais attaché aux preuves de test, aux DTO de fixture, aux logs ou aux erreurs. Un fichier périmé, une mauvaise génération, un lien symbolique, un port/chemin malformé, un timeout, un échec de connexion, un échec de version ou une sortie de l'enfant est terminal.

## Bail CDP exclusif

`CdpLease` est une capacité privée avec des états de propriété XState fermés :

```text
owner_none
raw_connecting(processGeneration, leaseEpoch, transportId, purpose)
raw_owned(processGeneration, leaseEpoch, transportId, purpose)
playwright_connecting(processGeneration, leaseEpoch)
playwright_owned(processGeneration, leaseEpoch, browserId)
shutdown_connecting(processGeneration, leaseEpoch, transportId)
shutdown_owned(processGeneration, leaseEpoch, transportId)
```

`purpose` est uniquement `initial_bootstrap` ou `runtime_restart`. La machine réserve l'époque de bail suivante avant d'ouvrir un transport. L'ouvreur d'endpoint est privé à l'acteur de bail, de sorte que le code du harnais ne peut pas créer un second socket racine.

Pour le test runner isolé, ces invariants sont obligatoires :

```text
rootLeaseReservations in {0, 1}
openHarnessRootTransports <= 1
openHarnessRootTransports <= rootLeaseReservations
owner_none => reservation == 0 and open == 0
raw_owned/playwright_owned/shutdown_owned => reservation == 1 and open == 1
raw_connecting/playwright_connecting/shutdown_connecting
  => reservation == 1 and open in {0, 1}
raw and Playwright ownership are mutually exclusive
```

Avant chaque armement brut, une réponse fraîche et exacte de `Target.getTargets` doit montrer qu'aucune cible de service worker n'est à `attached:true`. Avant l'acquisition brute après Playwright, la promesse exacte `browser.close()`, l'événement `disconnected` de Playwright et le reçu de fermeture du transport doivent tous exister. Avant la connexion Playwright, le reçu complet de libération brute doit exister. Aucun booléen local ou événement manquant ne constitue une preuve de libération.

Le bail brut initial n'est réservé qu'après `ENDPOINT_PARSED`. Son acteur `raw_connecting` ouvre l'unique socket suivi et envoie `Browser.getVersion` ; seule la réponse actuelle exacte émet `ENDPOINT_VERIFIED` et entre dans `raw_owned`. Un échec de connexion ou de version doit fermer le socket suivi et produire un reçu de fermeture avant `owner_none`, l'arrêt en échec ou toute nouvelle acquisition.

### Constantes de délais limites

Tous les budgets de temps utilisent le temps monotone et sont des constantes de configuration, et non des entrées de l'appelant :

```text
ARTIFACT_IO_TIMEOUT_MS = 5_000
PROFILE_CREATE_TIMEOUT_MS = 5_000
PROCESS_STARTUP_TIMEOUT_MS = 15_000
RAW_OPERATION_TIMEOUT_MS = 20_000
RAW_RELEASE_TIMEOUT_MS = 5_000
PLAYWRIGHT_HANDOFF_TIMEOUT_MS = 15_000
PLAYWRIGHT_RELEASE_TIMEOUT_MS = 5_000
TEST_EFFECT_TIMEOUT_MS = 60_000
DIAGNOSTIC_SETTLE_MS = 100
SHUTDOWN_TIMEOUT_MS = 10_000
TERM_GRACE_MS = 2_000
KILL_GRACE_MS = 2_000
PROFILE_REMOVE_TIMEOUT_MS = 5_000
FAILURE_OWNER_RELEASE_TIMEOUT_MS = 5_000
MAX_RUNTIME_RESTARTS = 1
HARNESS_GLOBAL_DEADLINE_MS = 210_000
MV3_TEST_TIMEOUT_MS = 240_000
```

Une échéance d'opération absolue unique est créée avant chaque phase et n'est jamais réinitialisée en son sein. Une échéance de libération/nettoyage distincte peut libérer des ressources après un timeout d'opération, mais ne peut jamais transformer cette opération échouée en succès. Exactement un redémarrage à l'exécution peut être demandé et tous les effets de test partagent l'unique budget `TEST_EFFECT_TIMEOUT_MS`. La somme fermée du pire des cas pour deux lectures d'artefacts, la création de profil, le démarrage de processus, deux opérations/libérations brutes, deux transferts/libérations Playwright, les effets de test, la stabilisation du diagnostic, une libération de propriétaire en échec, l'arrêt y compris TERM/KILL, et la suppression de profil est de 204 100 ms. L'échéance globale monotone de 210 000 ms du contrôleur englobe ce travail et refuse de démarrer une phase à moins que sa limite complète plus le nettoyage obligatoire restant ne s'y insèrent. La configuration Playwright et chaque test doivent utiliser exactement le `MV3_TEST_TIMEOUT_MS` plus large ; sa marge de 30 000 ms empêche le timeout du framework d'interrompre prématurément le nettoyage borné.

L'endpoint de boucle locale ne peut pas exclure cryptographiquement un processus local hostile. La garantie absolue couvre les clients créés par ce harnais dans son exécuteur de CI isolé. Un modèle de menace contenant un processus hostile sur la même machine nécessite une revue séparée pour `--remote-debugging-pipe` ; cela sort du cadre de la révision 13.

## Plan de contrôle brut

Un WebSocket brut unique multiplexe chaque commande. Les événements Target racines sont souscrits de manière synchrone avant la première commande. Le propriétaire brut effectue ensuite :

1. fige l'unique sentinelle de lancement en tant que seule cible complète `type:"page"`, `url:"about:blank"` issue d'une réponse explicite exacte réservée aux pages de `Target.getTargets` ; le même `sentinelTargetId` survit à chaque époque de bail ;
2. prouve par une réponse exacte réservée aux services workers de `Target.getTargets` qu'aucune cible de worker n'est déjà attachée avant que cette époque brute n'arme l'auto-attachement ;
3. acquitte le `Target.setDiscoverTargets` exact réservé aux services workers ;
4. acquitte `Target.setAutoAttach` à la racine du navigateur avant tout arrêt/démarrage ;
5. s'attache à la sentinelle figée avec `flatten:true` et acquitte `ServiceWorker.enable` sur cette session de contrôle enfant ;
6. fait converger les métadonnées d'installation et obtient une session de worker sélectionnée exacte ;
7. maintient cette session sélectionnée attachée à travers l'arrêt/démarrage contrôlé, prouve le cycle de vie natif de crash/rechargement, reprend le remplaçant en pause puis le sonde via le même lot distribué de façon synchrone ;
8. libère chaque autorité brute avant que Playwright ne puisse se connecter.

La sentinelle n'est créée que par le dernier argument de lancement, jamais par une commande CDP. Elle n'est pas exposée via la fixture, n'est jamais utilisée pour les assertions de produit et demeure ouverte jusqu'à l'arrêt global du navigateur. La libération Playwright ferme chaque page créée par la fixture mais préserve cette sentinelle exacte afin que Chromium ne puisse pas disparaître entre les époques de bail.

La requête de sentinelle réservée aux pages est envoyée sans `sessionId` et correspond exactement à :

```json
{
  "filter": [{ "type": "page", "exclude": false }, { "exclude": true }]
}
```

Aucun post-filtre côté implémentation ne peut transformer des cibles multiples/malformées en une sentinelle unique. La découverte utilise exactement le même filtre séquentiel de service worker que la barrière pré-armement et la commande d'armement. Une réponse de pré-armement contenant une cible quelconque de `type:"service_worker"` avec `attached:true` est terminale avant la découverte ou l'auto-attachement. L'armement est envoyé sans `sessionId` et correspond exactement à :

```json
{
  "autoAttach": true,
  "waitForDebuggerOnStart": true,
  "flatten": true,
  "filter": [{ "type": "service_worker", "exclude": false }, { "exclude": true }]
}
```

La révision 13 n'appelle jamais `Target.autoAttachRelated`. Un armement rejeté/muté, une perte de socket ou tout démarrage avant sa réponse de commande actuelle réussie est terminal.

## Convergence de l'installation et autorité à chaud

Le chemin exact du service worker d'arrière-plan du manifeste est connu avant le lancement. L'identifiant d'extension est dérivé uniquement d'une cible de worker ou d'une URL de version complète en `chrome-extension:` comportant ce chemin exact. La portée racine est alors exactement `chrome-extension://<extensionId>/`.

`ServiceWorker.workerRegistrationUpdated` et `ServiceWorker.workerVersionUpdated` sont des mises à jour partielles. L'observateur maintient le membre complet le plus récent par identité ; il ne traite jamais un tableau d'événements comme un instantané complet. Les transitions d'installation/mise à jour et les versions liées chevauchantes ne sont pas terminales jusqu'à l'expiration de l'échéance unique. La convergence exige :

1. exactement un enregistrement non supprimé possède la portée racine exacte ;
2. exactement une version liée est non `redundant`, avec l'URL de script exacte et `status:activated` ; chaque autre version liée est `redundant` ;
3. un aller-retour frais de `Target.getTargets` avec filtre exact s'achève et les conditions 1-2 sont toujours vérifiées ;
4. chaque session liée plus ancienne est classée, observée et reprise si elle est en pause ; aucune session liée plus ancienne ne demeure active lorsque l'autorité se fige ;
5. tout attachement actif étranger/en collision est absent.

L'aller-retour constitue la barrière de convergence ; aucun sleep n'autorise le gel. Un candidat qui devient redondant avant la barrière est rejeté. Une suppression, un enregistrement racine dupliqué, une collision de portée/script, des métadonnées malformées ou une non-convergence est terminal.

Chaque attachement lié entre dans un inventaire à ajout seul. Avant toute reprise, le propriétaire brut active `Inspector` et `Runtime`, installe les observateurs validés selon le schéma de `Inspector.targetCrashed`, `Inspector.targetReloadedAfterCrash`, `Runtime.exceptionThrown`, `Runtime.consoleAPICalled` et de contexte, et attend les réponses de commande corrélées. Les sessions liées plus anciennes sont reprises si elles sont en pause et doivent se détacher après être devenues redondantes. Aucune session plus ancienne ne peut satisfaire une preuve de redémarrage ultérieure.

Le gel de l'autorité capture :

```text
(processGeneration, leaseEpoch, restartGeneration,
 registrationId, versionId, scopeURL, scriptURL,
 targetId?, sessionId?, attachmentGeneration?)
```

La machine doit ensuite établir **l'autorité à chaud** : la version activée sélectionnée est `running`, possède exactement une session brute actuelle observée, toutes les activations d'observateurs sont acquittées, et cette session n'attend pas une reprise préalable du débogueur. Si la version sélectionnée est déjà `running` ou `starting` et possède une session auto-attachée exacte, cette session est utilisée ; une session en pause `starting` est observée et reprise, puis doit passer à `running`. Si une version activée `running` ou `starting` expose un identifiant de cible actif mais n'a pas de session brute, le propriétaire brut utilise la barrière de cible exacte et, si toujours nécessaire, un attachement manuel. Cette branche sans session n'effectue aucun démarrage d'échauffement. Seule une version activée `stopped`, que sa cible/session DevTools conservée soit déjà visible ou non, reçoit un `ServiceWorker.startWorker({scopeURL})` en guise d'échauffement. Après sa réponse réussie et qu'une mise à jour de version activée `starting` ou `running` expose l'identifiant exact de cible, une barrière exacte filtrée de `Target.getTargets` fige son unique cible. La branche `starting` est nécessaire car l'auto-attachement racine a pu déjà mettre en pause l'échauffement avant qu'il ne puisse signaler `running`. Si l'auto-attachement racine a fourni une session exacte, cette session est utilisée ; sinon, le propriétaire brut envoie un `Target.attachToTarget({targetId,flatten:true})` explicite, conserve la réponse de session manuelle corrélée et installe les mêmes observateurs. Pendant que cette commande est en attente, au plus un événement provisoire sélectionné `TARGET_ATTACHED` peut être conservé ; il est classé comme session manuelle uniquement lorsque la réponse renvoie le même identifiant de session. Un attachement sélectionné différent ou secondaire prouve une situation de concurrence auto/manuelle et est terminal. L'échauffement est repris si nécessaire et ne peut jamais être rapporté comme preuve d'amorçage. `warm_authority_ready` est inaccessible tant que les réponses d'activation d'Inspector/Runtime n'existent pas, que chaque démarrage d'échauffement émis possède son `WARMUP_START_RESOLVED` réussi, et que chaque reprise d'échauffement émise possède son `WARMUP_RESUME_RESOLVED` réussi, conjointement avec la version sélectionnée en exécution et une session exacte.

Pour la révision 13, la réponse `Runtime.enable` acquittée de la session sélectionnée est également une barrière d'ordonnancement pour chaque événement de contexte antérieur sur le socket brut. Le réducteur séquentiel conserve chaque identité de contexte pré-crash ultérieure dans le même registre de génération borné à travers `controlled_stop` ; la transition de crash exacte révoque alors cette génération complète et efface son sous-ensemble actif de façon atomique. Le registre pré-crash constitue une autorité de diagnostic, et non un accusé de réception d'arrêt supplémentaire.

Chaque membre de l'inventaire enregistre `attachmentOrigin:auto|manual` ; l'origine est immuable et contrôle sa preuve de libération. Après l'autorité à chaud, la suppression, la redondance, le remplacement de cible/session, la mutation de portée/script, l'identité croisée ou un `TARGET_DETACHED` sélectionné avant l'entrée dans `release_resuming` est terminal. La session sélectionnée est intentionnellement conservée à travers l'arrêt contrôlé et le démarrage final avec la même version.

## Machine de redémarrage brut avec la même version

Chromium conserve un `ServiceWorkerDevToolsAgentHost` pour le même contexte de navigateur et la même version. À l'arrêt, il conserve les sessions DevTools attachées et émet `Inspector.targetCrashed` ; au redémarrage, il réutilise ces sessions, définit la pause au démarrage parce que l'hôte est attaché, et émet `Inspector.targetReloadedAfterCrash`. La révision 13 utilise l'événement de crash exact comme une frontière atomique de génération de contexte et l'événement de rechargement comme la condition préalable pour un contexte remplaçant frais. Elle n'exige ni ne permet jamais un nouvel attachement sélectionné `Target.attachedToTarget` entre l'arrêt et le démarrage.

Une `rawOperationDeadline` absolue débute avant la découverte/l'admission des métadonnées et borne l'armement, la convergence, l'échauffement facultatif, l'arrêt, le démarrage, la corrélation, les sondes et la reprise. Les phases attendues ne la réinitialisent pas. La libération exacte normale consomme une échéance distincte `RAW_RELEASE_TIMEOUT_MS`.

La machine brute n'admet que ces événements validés selon le schéma avec les identités actuelles de processus, bail, redémarrage, commande et session :

```text
INITIAL_SENTINEL_FENCE_RESOLVED | PREARM_ATTACH_FENCE_RESOLVED
DISCOVERY_ACKED | AUTO_ATTACH_ACKED | CONTROL_ATTACH_RESOLVED
SERVICE_WORKER_ENABLED
REGISTRATION_UPDATED | VERSION_UPDATED
TARGET_ATTACHED | TARGET_DETACHED | TARGET_DESTROYED
CONVERGENCE_FENCE_RESOLVED | CONVERGENCE_RESUME_RESOLVED
INSPECTOR_ENABLED | RUNTIME_ENABLED
WARMUP_START_RESOLVED | WARMUP_RESUME_RESOLVED
WARMUP_TARGET_FENCE_RESOLVED | WARMUP_ATTACH_RESOLVED
STOP_RESOLVED | START_RESOLVED
INSPECTOR_TARGET_CRASHED | INSPECTOR_TARGET_RELOADED
EXECUTION_CONTEXT_CREATED | EXECUTION_CONTEXT_DESTROYED
EXECUTION_CONTEXTS_CLEARED
RESUME_RESOLVED | IDENTITY_PROBE_RESOLVED | TEST_PROBE_RESOLVED
IDENTITY_PROOF_FAILED
APPLICATION_DIAGNOSTIC_RECORDED | OBSERVER_PROTOCOL_FAILED
EVIDENCE_OVERFLOW_RECORDED
OPERATION_TIMED_OUT
RELEASE_RESUME_RESOLVED | AUTO_ATTACH_DISARMED
RELEASE_ATTACH_FENCE_RESOLVED
RELEASE_MANUAL_DETACH_RESOLVED
RELEASE_ZERO_ATTACHED_FENCE_RESOLVED
SERVICE_WORKER_DISABLED | CONTROL_DETACH_RESOLVED
SENTINEL_FENCE_RESOLVED | DISCOVERY_DISABLED | RAW_SOCKET_CLOSED
```

Les charges utiles des deux événements de contexte retiré sont exactes :

```text
EXECUTION_CONTEXT_DESTROYED = {
  sessionId,
  executionContextId: non-negative safe integer,
  executionContextUniqueId: bounded normalized ID,
  eventSha256
}
EXECUTION_CONTEXTS_CLEARED = { sessionId, eventSha256 }
```

Les trois événements de commande d'amorçage ne sont émis qu'après que le lot complet distribué de manière synchrone a été stabilisé et que ses enregistrements de commandes en attente ont été corrélés. Leurs charges utiles normalisées sont exactes :

```text
RESUME_RESOLVED = {
  processGeneration, leaseEpoch, restartGeneration, sessionId,
  commandId: positive safe integer,
  method: "Runtime.runIfWaitingForDebugger",
  paramsSha256: SHA-256(JCS({})),
  resultSha256: SHA-256(JCS(schema-validated result))
}

IDENTITY_PROBE_RESOLVED = {
  processGeneration, leaseEpoch, restartGeneration, sessionId,
  commandId: positive safe integer,
  method: "Runtime.evaluate",
  paramsSha256: SHA-256(JCS(exact frozen identity params)),
  resultSha256: SHA-256(JCS(schema-validated result)),
  uniqueContextId, workerUrl, registrationScope
}

TEST_PROBE_RESOLVED = {
  processGeneration, leaseEpoch, restartGeneration, sessionId,
  commandId: positive safe integer,
  method: "Runtime.evaluate",
  paramsSha256: SHA-256(JCS(exact frozen test params)),
  resultSha256: SHA-256(JCS(schema-validated result)),
  uniqueContextId,
  diagnosticDisposition: "clean" | "application_exception"
}
```

Le schéma de résultat de reprise est le résultat CDP vide réussi exact. Le schéma de résultat d'identité admet uniquement l'objet de retour par valeur attendu et aucun `exceptionDetails` ; ses `workerUrl` et `registrationScope` sont normalisés et doivent être égaux à l'autorité figée, et le `uniqueContextId` de l'événement doit être égal au contexte frais figé. L'événement de test facultatif doit transporter ce même contexte. Sa réponse peut contenir des `exceptionDetails` valides selon le schéma, représentés uniquement par la disposition de diagnostic typée fermée et son hachage complet de résultat. Les charges utiles brutes de RemoteObject, le texte d'exception et les chaînes de l'appelant n'entrent jamais dans le contexte d'autorité. Une réponse dont l'enregistrement en attente corrélé possède un autre processus, époque, redémarrage, session, méthode ou hachage de paramètre ne peut pas instancier l'un de ces événements.

Pour une destruction avant la transition de crash, les identifiants numériques et uniques doivent correspondre à l'enregistrement de contexte de session sélectionnée connu. Après la transition de crash, l'identifiant unique constitue l'autorité : l'identifiant numérique demeure une preuve de diagnostic native requise mais ne peut se substituer à l'identifiant unique, en dériver ou l'écraser. Un identifiant unique natif manquant, un repli numérique ou une paire connue discordante constitue un échec de protocole.

Les événements d'enregistrement/version/cible/contexte mettent à jour les cartes les plus récentes immuables uniquement via des actions XState. Les gardes nommées `isCurrentProcess`, `isCurrentLease`, `isCurrentRestart`, `isCurrentCommand`, `isExactAuthority`, `isSelectedPersistentSession`, `isCurrentContextGeneration` et `isFreshPostReloadContext` rejettent les preuves périmées, révoquées ou croisées. Les transitions `always` gardées évaluent les preuves partielles conservées ; l'achèvement de promesse lui-même ne fait jamais transiter l'acteur.

`sentinel_fencing` est l'unique nœud initial de l'acteur brut. Son entrée envoie la requête initiale de sentinelle réservée aux pages. Chaque commande d'initialisation ultérieure n'est émise que par la transition acquittée précédente ci-dessous ; aucune boucle de shell ni chaîne de promesses ne peut sauter, réordonner ou dupliquer ces états.

| État XState                                                           | Événement / garde                                                                                         | État suivant               | Effet                                                                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `sentinel_fencing`                                                    | `INITIAL_SENTINEL_FENCE_RESOLVED` actuel avec exactement une sentinelle valide                            | `prearm_attach_fencing`    | figer la sentinelle ; envoyer la barrière exacte de cibles réservée aux services workers                     |
| `prearm_attach_fencing`                                               | `PREARM_ATTACH_FENCE_RESOLVED` actuel avec zéro worker attaché                                            | `discovery_enabling`       | conserver la preuve de zéro attachement ; envoyer l'activation filtrée exacte de la découverte               |
| `prearm_attach_fencing`                                               | la barrière actuelle contient un worker attaché quelconque                                                | `failed_releasing`         | conserver l'échec de contamination du profil ; ne jamais armer l'auto-attachement                            |
| `discovery_enabling`                                                  | `DISCOVERY_ACKED` actuel                                                                                  | `auto_attach_arming`       | conserver la réponse ; envoyer l'armement exact de l'auto-attachement racine                                 |
| `auto_attach_arming`                                                  | événement actuel de cible/attachement de worker avant la réponse d'armement                               | `auto_attach_arming`       | normaliser et conserver l'inventaire borné ; installer des observateurs sur chaque worker attaché            |
| `auto_attach_arming`                                                  | `AUTO_ATTACH_ACKED` actuel                                                                                | `control_attaching`        | conserver la réponse d'armement ; envoyer un attachement aplati vers la sentinelle figée                     |
| `control_attaching`                                                   | attachement actuel de worker ou réponse d'activation d'observateur                                        | `control_attaching`        | conserver la preuve partielle d'observateur liée à l'identité                                                |
| `control_attaching`                                                   | `CONTROL_ATTACH_RESOLVED` actuel pour la sentinelle                                                       | `service_worker_enabling`  | figer la session de contrôle ; envoyer `ServiceWorker.enable` dessus                                         |
| `service_worker_enabling`                                             | événement actuel de métadonnées, cible, attachement ou activation d'observateur                           | `service_worker_enabling`  | conserver les cartes/inventaire bornés et les preuves d'observateurs corrélées                               |
| `service_worker_enabling`                                             | `SERVICE_WORKER_ENABLED` actuel                                                                           | `converging`               | conserver la réponse d'activation ; envoyer la barrière de convergence exacte                                |
| tout état d'initialisation                                            | acquittement dupliqué/hors-ordre, identité malformée ou attachement sélectionné inattendu                 | `failed_releasing`         | conserver l'échec de protocole ; effectuer la libération exacte                                              |
| `converging`                                                          | métadonnées/cible/attachement actuel, activation d'observateur, détachement ou réponse de reprise         | `converging`               | mettre à jour cartes/inventaire ; observer chaque session liée ; reprendre les anciennes sessions en pause   |
| `converging`                                                          | barrière actuelle et convergence exacte                                                                   | `warm_authority_acquiring` | figer l'autorité sélectionnée et préserver ses preuves d'observateur pré-barrière                            |
| `warm_authority_acquiring`                                            | attachement sélectionné, version ou réponse d'activation d'observateur actuel                             | `warm_authority_acquiring` | conserver uniquement la preuve partielle gardée d'autorité à chaud                                           |
| `warm_authority_acquiring`                                            | sélectionné en exécution avec session observée non en pause exacte et les deux réponses d'observateurs    | `warm_authority_ready`     | figer cible/session/origine persistantes ; n'envoyer aucune commande                                         |
| `warm_authority_acquiring`                                            | sélectionné en démarrage ou exécution avec session observée en pause exacte et les deux réponses          | `warm_existing_resuming`   | envoyer une reprise d'échauffement corrélée                                                                  |
| `warm_existing_resuming`                                              | réponse actuelle de reprise d'échauffement ou version sélectionnée starting/running                       | `warm_existing_resuming`   | conserver uniquement la preuve partielle exacte                                                              |
| `warm_existing_resuming`                                              | `always` gardé : réponse de reprise, sélectionné en exécution et réponses d'observateurs                  | `warm_authority_ready`     | figer cible/session/origine persistantes                                                                     |
| `warm_authority_acquiring`                                            | sélectionné en démarrage ou exécution avec identifiant exact de cible mais sans session exacte            | `warmup_target_fencing`    | marquer `warmupStarted=false` ; envoyer la barrière de cibles filtrée exacte                                 |
| `warm_authority_acquiring`                                            | sélectionné à l'arrêt                                                                                     | `warmup_starting`          | marquer `warmupStarted=true` ; envoyer exactement un `startWorker` d'échauffement                            |
| `warmup_starting`                                                     | `WARMUP_START_RESOLVED` actuel, événement d'auto-attachement ou de version                                | `warmup_starting`          | conserver uniquement les preuves partielles d'échauffement                                                   |
| `warmup_starting`                                                     | `always` gardé : réponse de démarrage réussie, sélectionné starting ou running, et identifiant de cible   | `warmup_target_fencing`    | envoyer la barrière de cibles filtrée exacte                                                                 |
| `warmup_target_fencing`                                               | événement actuel d'auto-attachement ou de version avant la réponse de barrière                            | `warmup_target_fencing`    | conserver la preuve gardée de concurrence                                                                    |
| `warmup_target_fencing`                                               | `WARMUP_TARGET_FENCE_RESOLVED` actuel et la session auto exacte existe                                    | `warmup_observing`         | figer cette session auto ; envoyer uniquement les activations d'observateurs manquantes                      |
| `warmup_target_fencing`                                               | barrière actuelle et aucune session exacte                                                                | `warmup_manual_attaching`  | envoyer un attachement aplati exact vers la cible figée                                                      |
| `warmup_manual_attaching`                                             | premier `TARGET_ATTACHED` sélectionné actuel pendant que la commande manuelle est en attente              | `warmup_manual_attaching`  | conserver une session provisoire sans assigner d'origine                                                     |
| `warmup_manual_attaching`                                             | `TARGET_ATTACHED` sélectionné actuel différent ou secondaire                                              | `failed_releasing`         | conserver la concurrence auto/manuelle ; libérer chaque session connue                                       |
| `warmup_manual_attaching`                                             | `WARMUP_ATTACH_RESOLVED` actuel correspondant à zéro/une session provisoire et aucun concurrent           | `warmup_observing`         | figer la session manuelle ; envoyer les activations d'observateurs                                           |
| `warmup_manual_attaching`                                             | la réponse d'attachement actuelle entre en conflit avec la session provisoire                             | `failed_releasing`         | conserver la concurrence auto/manuelle ; libérer chaque session connue                                       |
| `warmup_observing`                                                    | réponse d'observateur actuelle, attachement correspondant ou événement de version sélectionnée            | `warmup_observing`         | conserver uniquement les preuves partielles exactes                                                          |
| `warmup_observing`                                                    | `always` gardé : deux réponses, session non en pause, sélectionné en exécution et réponse requise         | `warm_authority_ready`     | figer cible/session/origine persistantes ; écarter l'échauffement comme preuve                               |
| `warmup_observing`                                                    | `always` gardé : deux réponses et session sélectionnée en pause                                           | `warmup_resuming`          | envoyer une reprise d'échauffement corrélée                                                                  |
| `warmup_resuming`                                                     | `WARMUP_RESUME_RESOLVED` actuel ou version sélectionnée en exécution                                      | `warmup_resuming`          | conserver uniquement la preuve partielle exacte                                                              |
| `warmup_resuming`                                                     | `always` gardé : réponse de reprise, sélectionné running, deux réponses et réponse de démarrage           | `warm_authority_ready`     | figer cible/session/origine persistantes ; écarter l'échauffement comme preuve                               |
| `warm_authority_ready`                                                | entrée gardée                                                                                             | `controlled_stop`          | envoyer un `stopWorker({versionId})` ; ne jamais détacher la session sélectionnée                            |
| `controlled_stop`                                                     | réponse d'arrêt actuelle ou mise à jour de même version activated/stopped, dans un ordre quelconque       | `controlled_stop`          | conserver uniquement les preuves partielles exactes                                                          |
| `controlled_stop`                                                     | contexte sélectionné actuel créé avant la preuve de crash                                                 | `controlled_stop`          | ajouter son identifiant unique au registre borné pré-crash ; ne compléter aucune preuve d'arrêt              |
| `controlled_stop`                                                     | `Inspector.targetCrashed` exact actuel sur la cible/session sélectionnée                                  | `controlled_stop`          | figer atomiquement le crash, incrémenter la génération, révoquer tout contexte pré-crash et vider l'autorité |
| `controlled_stop`                                                     | destruction actuelle avant révocation atomique avec identité numérique/unique connue exacte               | `controlled_stop`          | retirer l'autorité active mais conserver son enregistrement pré-crash pour le tombstone de crash atomique    |
| `controlled_stop`                                                     | destruction actuelle après révocation atomique avec identifiant unique borné valide                       | `controlled_stop`          | mettre à jour les preuves retirées bornées ; ajouter un identifiant inconnu aux tombstones post-crash        |
| `controlled_stop`                                                     | vidage de contextes actuel avant ou après révocation atomique                                             | `controlled_stop`          | mettre à jour les preuves retirées bornées uniquement ; ne compléter aucune preuve ni transition             |
| `controlled_stop`                                                     | contexte créé après révocation atomique ou crash dupliqué                                                 | `failed_releasing`         | conserver l'échec de continuité ; préserver l'autorité révoquée                                              |
| `controlled_stop`                                                     | `always` gardé : réponse d'arrêt, version arrêtée, preuve crash/révocation et même session sélectionnée   | `replacement_starting`     | incrémenter la génération de redémarrage ; envoyer un `startWorker({scopeURL})`                              |
| `replacement_starting`                                                | réponse de démarrage actuelle, rechargement même session ou première mise à jour starting/running         | `replacement_starting`     | conserver preuves partielles ; après rechargement réactiver Runtime ; première mise à jour valide complète   |
| `replacement_starting`                                                | mise à jour ultérieure starting/running exacte avec même version, avec cible absente ou figée             | `replacement_starting`     | le doublon exact est sans effet ; sinon rafraîchir métadonnées uniquement, ne jamais allouer d'autre preuve  |
| `replacement_starting`                                                | réponse Runtime actuelle et premier contexte frais avec origine script exacte après rechargement          | `replacement_starting`     | exiger l'absence des deux ensembles de tombstones ; le lier à la génération incrémentée et le figer          |
| `replacement_starting`                                                | contexte avant rechargement, origine dérivée/erronée, identifiant réutilisé ou second contexte remplaçant | `failed_releasing`         | conserver l'échec de continuité ; ne publier aucun reçu d'amorçage                                           |
| `replacement_starting`                                                | vidage de contextes sélectionné actuel après rechargement exact et avant tout contexte frais              | `replacement_starting`     | mettre à jour preuves retirées bornées uniquement ; préserver la fenêtre ouverte d'admission de contexte     |
| `replacement_starting`                                                | destruction sélectionnée actuelle avec identifiant unique borné valide dans cette même fenêtre            | `replacement_starting`     | mettre à jour preuves ; ajouter/hacher tombstone post-crash si nouveau ; préserver la fenêtre d'admission    |
| `replacement_starting`                                                | destruction/vidage avant rechargement, après contexte frais ou sur une autre session                      | `failed_releasing`         | révoquer l'autorité remplaçante ; hors de la fenêtre étroite l'événement n'a pas de discriminateur fiable    |
| `replacement_starting`                                                | `always` gardé : réponse start, reload, starting/running même version, réponse Runtime et contexte frais  | `resuming`                 | distribuer de façon synchrone reprise, identité puis commandes de test facultatif sans attendre de réponses  |
| `resuming`                                                            | `RESUME_RESOLVED` exact canonique issu du lot validé                                                      | `identity_probing`         | conserver le reçu de reprise faisant autorité, l'identifiant de commande et le hachage de résultat           |
| `resuming`                                                            | rejet de reprise, mauvaise méthode/session/paramètres, résultat malformé ou identifiant croisé            | `failed_releasing`         | conserver l'échec de protocole ; ne pas accepter les reçus d'évaluation ultérieurs comme autorité            |
| `identity_probing`                                                    | `IDENTITY_PROBE_RESOLVED` exact canonique issu du lot validé                                              | `test_probe_deciding`      | conserver la preuve d'identité et les hachages exacts commande/résultat ; calculer le hachage de lot         |
| `identity_probing`                                                    | la réponse actuelle présente une discordance, un rejet ou `exceptionDetails`                              | `failed_releasing`         | enregistrer le diagnostic applicatif le cas échéant ; émettre `IDENTITY_PROOF_FAILED` ; libérer le worker    |
| `test_probe_deciding`                                                 | `always` gardé : aucun test configuré et toutes les preuves de reprise/identité/running/hachage acquises  | `bootstrap_proved`         | figer le reçu privé de redémarrage avec les champs de test exactement à null                                 |
| `test_probe_deciding`                                                 | `always` gardé : sonde de test configurée                                                                 | `test_probing`             | attendre la réduction canonique du reçu de test facultatif déjà stabilisé par lot                            |
| `test_probing`                                                        | `TEST_PROBE_RESOLVED` actuel sans échec de protocole                                                      | `test_probing`             | conserver hachage complétion/résultat, calculer hachage lot ; émettre diagnostic pour exception/rejet        |
| `test_probing`                                                        | `always` gardé : preuves de reprise, identité, test, exécution et hachage de lot acquises                 | `bootstrap_proved`         | figer le reçu privé de redémarrage                                                                           |
| `resuming`, `identity_probing`, `test_probe_deciding`, `test_probing` | métadonnées actuelles exactes de la version sélectionnée `starting`/`running`                             | même état                  | conserver de manière idempotente ; autoriser uniquement le passage monotone `starting -> running`            |
| l'un quelconque de ces quatre états de lot                            | dérive d'identité/statut/cible de la version sélectionnée ou `running -> starting`                        | `failed_releasing`         | conserver l'échec de continuité ; ne jamais attendre un autre événement de métadonnées                       |
| l'un quelconque de ces quatre états de lot                            | événement de réponse de reprise/identité/test dupliqué ou hors ordre canonique                            | `failed_releasing`         | conserver l'échec de protocole ; l'ordre d'arrivée des réponses ne peut jamais sélectionner une transition   |
| tout état opérationnel                                                | `APPLICATION_DIAGNOSTIC_RECORDED`                                                                         | même état opérationnel     | transmettre vers le verdict bloqué externe absorbant ; n'émettre aucune commande de transition               |
| tout état opérationnel                                                | `EVIDENCE_OVERFLOW_RECORDED` de diagnostic uniquement                                                     | même état opérationnel     | transmettre le verdict bloqué ; conserver compteurs/hachage uniquement ; préserver le nettoyage              |
| tout état opérationnel                                                | dépassement de carte d'autorité, d'attachement ou de commande opérationnelle                              | `failed_releasing`         | figer les structures bornées ; désarmer via la réserve de nettoyage ; la libération normale est impossible   |
| `bootstrap_proved`                                                    | `always` gardé                                                                                            | `release_resuming`         | créer une échéance de libération et préserver l'inventaire complet d'attachements                            |
| tout état non final                                                   | échec de protocole ou timeout                                                                             | `failed_releasing`         | conserver l'échec ; effectuer la libération exacte                                                           |
| tout état d'acquisition/redémarrage/sonde en dehors de `release_*`    | détachement sélectionné ou échec de continuité                                                            | `failed_releasing`         | conserver l'échec ; effectuer la libération exacte                                                           |

La preuve d'arrêt n'exige que des faits natifs positifs : la réponse réussie à `stopWorker`, la version sélectionnée `activated/stopped` et l'`Inspector.targetCrashed` exact sur la cible/session sélectionnée conservée. La réduction de cet événement de crash révoque de façon atomique chaque contexte pré-crash et complète la preuve de crash/révocation ; aucun événement de contexte détruit ou contextes vidés de Runtime n'est exigé ni attendu. La preuve finale de démarrage exige la réponse réussie à `startWorker`, `Inspector.targetReloadedAfterCrash` sur les mêmes identifiants de cible/session, le même identifiant de version en `starting` ou `running`, et exactement un contexte frais créé après ce rechargement. Un attachement/détachement sélectionné, une modification de cible/session/version ou un contexte pré-rechargement/révoqué/secondaire est terminal ; les attachements sans rapport restent bloquants et pris en charge par le nettoyage.

La corrélation de remplacement fige :

```text
(processGeneration, leaseEpoch, restartGeneration,
 registrationId, versionId, scopeURL, scriptURL,
 targetId, sessionId, attachmentGeneration, attachmentOrigin,
 crashEventSha256, contextGeneration, revokedUniqueContextIdsSha256,
 postCrashDestroyedUniqueContextIdsSha256,
 reloadEventSha256, uniqueContextId,
 startCommandId, executionContextEventSha256,
 resumeCommandId, resumeResultSha256,
 identityCommandId, identityResultSha256,
 testCommandId, testResultSha256,
 bootstrapCommandBatchSha256)
```

`revokedUniqueContextIdsSha256` est le SHA-256 sur le JCS RFC 8785 des identifiants cumulatifs de tombstones normalisés et triés immédiatement après l'action de crash atomique. Il engage l'ensemble de révocation privé sans exposer ces identifiants dans le reçu public.

`postCrashDestroyedUniqueContextIdsSha256` est initialisé dans cette même action de crash atomique comme le SHA-256 du JCS `[]`, puis recalculé sur l'ensemble d'identifiants détruits post-crash normalisé et trié à chaque nouvel identifiant valide. Il est figé dans la corrélation de remplacement avant que le premier contexte frais ne soit admis et engage le second ensemble de tombstones privé sans exposer ses identifiants.

`Runtime.executionContextCreated.context.uniqueId` doit être de l'UTF-8 non vide d'au plus 512 octets sans NUL, CR ou LF, correspondant à la limite globale d'identifiant. Le `contextId` numérique est uniquement diagnostique. L'événement n'est admissible qu'après que le rechargement exact a été réduit, sur la session conservée, dans la `contextGeneration` incrémentée, et lorsque son `uniqueContextId` est absent à la fois de `revokedUniqueContextIds` et de `postCrashDestroyedUniqueContextIds`. Le premier contexte post-rechargement admissible doit également porter `context.origin === frozen scriptURL` ; la portée racine, avec ou sans sa barre oblique finale, n'est pas un substitut admissible. Ce champ natif corrobore l'identité de l'événement mais ne remplace jamais la sonde d'identité d'URL/portée fixe. Le contexte est à affectation unique à travers la reprise et la libération brute ; tout contexte pré-rechargement, origine discordante, identifiant révoqué réutilisé ou second événement de contexte admissible est terminal. Une destruction ou un vidage réduit alors qu'il est toujours dans `controlled_stop` après le crash ne peut mettre à jour les preuves de génération retirée que pour les contextes vidés ; une destruction valide consigne en outre son identifiant unique natif comme tombstone. Dans `replacement_starting`, les mêmes règles de fenêtre sécurisée sur la session sélectionnée s'appliquent uniquement après le rechargement exact et avant le premier contexte frais. Partout ailleurs, l'événement de cycle de vie est terminal car il ne transporte aucun discriminateur fiable de génération de contexte. Les hachages d'événements sont le SHA-256 sur le JCS RFC 8785 des paramètres complets validés selon le schéma.

La carte d'autorité de contexte conserve le `uniqueContextId` borné, la génération, l'identité de session, `originMatchesScriptURL:true` et le hachage d'événement complet ; elle ne duplique pas l'URL d'origine complète. L'égalité d'origine est vérifiée par rapport à l'URL de script figée avant la mutation, de sorte que le budget de 2 048 octets par entrée de contexte reste clos.

L'unique reprise est distribuée de façon synchrone en premier sur la session sélectionnée exacte avec la méthode `Runtime.runIfWaitingForDebugger` et les paramètres exacts `{}`. L'évaluation d'identité fixe puis l'évaluation de test facultatif sont distribuées de façon synchrone immédiatement après, sans attendre la promesse de reprise, avec `uniqueContextId:<frozen>`, `awaitPromise:true`, `returnByValue:true`, `includeCommandLineAPI:false` et `silent:false` ; `contextId` est interdit. L'expression d'identité fixe renvoie uniquement `globalThis.location.href` et `globalThis.registration.scope`, qui doivent être égaux à l'URL de script figée et à la portée racine. L'expression de test facultatif est une entrée de test explicite. Pour cette sonde facultative, une réponse de protocole valide avec `exceptionDetails` ou un résultat attendu rejeté enregistre un diagnostic applicatif et complète néanmoins son état opérationnel afin que la libération puisse s'exécuter. Une discordance ou un rejet d'identité constitue à la fois un diagnostic et un échec d'autorité ; un échec de commande/transport/schéma est `OBSERVER_PROTOCOL_FAILED`. Les identifiants de commande sont des entiers sûrs positifs et strictement consécutifs dans l'ordre reprise, identité, test facultatif. `testCommandId` et `testResultSha256` sont tous deux exactement `null` lorsqu'aucune sonde de test n'est configurée et tous deux non nuls sinon. Les hachages de résultats sont le SHA-256 sur le JCS RFC 8785 de l'objet CDP `result` complet validé selon le schéma.

`bootstrapCommandBatchSha256` est à affectation unique après que tous les événements canoniques de commande ont été réduits. Les schémas normalisés de preuve de commande sont exactement :

```text
ResumeCommandProofV1 = {
  ordinal: 0, commandId: resumeCommandId,
  method: "Runtime.runIfWaitingForDebugger",
  paramsSha256: SHA-256(JCS({})), resultSha256: resumeResultSha256
}
IdentityCommandProofV1 = {
  ordinal: 1, commandId: identityCommandId,
  method: "Runtime.evaluate", paramsSha256: identityParamsSha256,
  resultSha256: identityResultSha256
}
TestCommandProofV1 = {
  ordinal: 2, commandId: testCommandId,
  method: "Runtime.evaluate", paramsSha256: testParamsSha256,
  resultSha256: testResultSha256
}
```

Lorsque `testProbeConfigured` est faux, la préimage du hachage est exactement `{schemaVersion:1, processGeneration, leaseEpoch, restartGeneration, sessionId, testProbeConfigured:false, commands:[ResumeCommandProofV1,IdentityCommandProofV1]}`. Lorsqu'il est vrai, la préimage est le même objet fermé avec `testProbeConfigured:true` et `commands:[ResumeCommandProofV1,IdentityCommandProofV1,TestCommandProofV1]`. `bootstrapCommandBatchSha256` est le SHA-256 sur le JCS RFC 8785 de l'objet complet applicable. Il n'y a aucun champ supplémentaire ou omis.

Les deux hachages de paramètres d'évaluation engagent les paramètres CDP complets exacts validés selon le schéma, y compris l'expression et le `uniqueContextId` figé ; ce ne sont pas des hachages de résumés contrôlés par l'appelant. Le reçu brut conserve les enregistrements normalisés bornés de commandes et leurs préimages. Le reçu public n'expose que l'engagement d'amorçage englobant. Un enregistrement manquant, dupliqué, non consécutif ou ordonné différemment ne peut pas produire `bootstrapCommandBatchSha256` et est terminal même si chaque promesse individuelle s'est résolue avec succès.

Aucune valeur de sonde ni texte de diagnostic ne sélectionne une transition. Tout attachement actif de service worker étranger, dupliqué, malformé, d'une génération périmée ou sans rapport observé pendant que l'auto-attachement racine est armé est bloquant et géré par le nettoyage. Des métadonnées complètes sans collision et sans attachement actif sont inertes.

La règle de `TARGET_DETACHED` sélectionné n'est terminale qu'avant l'entrée dans `release_resuming`. À l'intérieur de la région explicite `release_*`, un détachement actuel exact pour un membre d'inventaire ou de contrôle connu est une preuve de libération attendue et n'est réduit que par les lignes spécifiques à l'état ci-dessous. Un détachement inconnu, croisé, dupliqué ou par ailleurs malformé demeure terminal.

## Libération brute exacte

La libération maintient un inventaire à ajout seul de chaque session auto-attachée. Elle reste ouverte à travers l'acquittement du désarmement et une barrière d'aller-retour de protocole exacte ; le temps écoulé n'est jamais utilisé comme barrière d'inventaire.

La libération est la région hiérarchique finale de `rawWorkerRestartMachine`, avec ces états explicites :

| État                                  | Événement / garde                                                                   | État suivant                       | Effet                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| `release_resuming`                    | entrée                                                                              | `release_resuming`                 | envoyer une reprise pour chaque membre en pause sans reprise préalable faisant autorité |
| `release_resuming`                    | `RELEASE_RESUME_RESOLVED` actuel                                                    | `release_resuming`                 | conserver la réponse exacte du membre                                                   |
| `release_resuming`                    | `TARGET_ATTACHED` actuel                                                            | `release_resuming`                 | ajouter, observer et reprendre si en pause ; marquer le verdict bloqué                  |
| `release_resuming`                    | `TARGET_DETACHED` actuel d'inventaire                                               | `release_resuming`                 | conserver le détachement exact ; supprimer le mapping actif                             |
| `release_resuming`                    | `always` gardé : chaque membre en pause est repris                                  | `release_disarming`                | envoyer le `setAutoAttach(false)` racine exact une fois                                 |
| `release_disarming`                   | `TARGET_ATTACHED` actuel avant la réponse de désarmement                            | `release_disarming`                | ajouter, observer/reprendre si en pause ; exiger détachement ; verdict bloqué           |
| `release_disarming`                   | `TARGET_DETACHED` exact pour un membre d'inventaire                                 | `release_disarming`                | conserver le détachement du membre ; supprimer le mapping actif                         |
| `release_disarming`                   | `RELEASE_RESUME_RESOLVED` actuel pour un membre tardif                              | `release_disarming`                | conserver sa réponse de reprise réservée au nettoyage                                   |
| `release_disarming`                   | `AUTO_ATTACH_DISARMED` actuel                                                       | `release_attach_fencing`           | conserver réponse désarmement ; envoyer barrière exacte `Target.getTargets`             |
| `release_attach_fencing`              | `TARGET_ATTACHED` actuel avant la réponse de barrière                               | `release_attach_fencing`           | ajouter, observer/reprendre, exiger détachement ; verdict bloqué                        |
| `release_attach_fencing`              | détachement d'inventaire / réponse de reprise actuel                                | `release_attach_fencing`           | conserver la preuve exacte de nettoyage                                                 |
| `release_attach_fencing`              | `RELEASE_ATTACH_FENCE_RESOLVED` actuel                                              | `release_attach_fencing`           | exiger que les cibles attachées égalent les membres manuels actifs connus ; clore       |
| `release_attach_fencing`              | `always` gardé : barrière acquise, membres en pause repris et membres auto détachés | `release_manual_detaching`         | envoyer un détachement pour chaque membre manuel toujours actif                         |
| `release_manual_detaching`            | `RELEASE_MANUAL_DETACH_RESOLVED` actuel                                             | `release_manual_detaching`         | conserver la réponse exacte du membre                                                   |
| `release_manual_detaching`            | `TARGET_DETACHED` de membre manuel actuel                                           | `release_manual_detaching`         | conserver l'événement exact ; supprimer le mapping actif                                |
| `release_manual_detaching`            | `always` gardé : chaque réponse/événement manuel acquis et aucun membre actif       | `release_zero_attached_fencing`    | envoyer la seconde barrière exacte de cibles de service worker                          |
| `release_zero_attached_fencing`       | `RELEASE_ZERO_ATTACHED_FENCE_RESOLVED` actuel avec zéro worker attaché              | `release_service_worker_disabling` | envoyer `ServiceWorker.disable` une fois                                                |
| `release_service_worker_disabling`    | `SERVICE_WORKER_DISABLED` actuel                                                    | `release_control_detaching`        | envoyer le détachement exact de session de contrôle une fois                            |
| `release_control_detaching`           | `CONTROL_DETACH_RESOLVED` actuel uniquement                                         | `release_control_detaching`        | conserver la réponse de commande                                                        |
| `release_control_detaching`           | `TARGET_DETACHED` de contrôle exact uniquement                                      | `release_control_detaching`        | conserver la preuve d'événement                                                         |
| `release_control_detaching`           | `always` gardé : réponse et événement                                               | `release_sentinel_fencing`         | envoyer la requête exacte de sentinelle réservée aux pages                              |
| `release_sentinel_fencing`            | `SENTINEL_FENCE_RESOLVED` exact actuel                                              | `release_discovery_disabling`      | envoyer la commande exacte de désactivation de découverte                               |
| `release_discovery_disabling`         | `DISCOVERY_DISABLED` actuel                                                         | `release_socket_closing`           | exiger zéro commande en attente ; supprimer les écouteurs ; fermer le socket            |
| `release_socket_closing`              | `RAW_SOCKET_CLOSED` actuel                                                          | `released`                         | figer le reçu de libération brute et renvoyer le bail à `owner_none`                    |
| tout état de libération après clôture | `TARGET_ATTACHED` actuel                                                            | `failed_releasing`                 | conserver l'échec de protocole ; reprendre/détacher pour le nettoyage uniquement        |

La première barrière d'attachement n'est envoyée qu'après la réponse de désarmement et utilise exactement le même filtre réservé aux services workers que l'acquisition. Les messages CDP sur l'unique WebSocket sont traités séquentiellement : tous les callbacks d'attachement antérieurs sont réduits dans l'inventaire avant que la réponse de la barrière actuelle ne puisse le fermer. Cette réponse ne peut rapporter `attached:true` que pour les membres manuels actifs connus exacts ; chaque membre automatique doit déjà être détaché. Après les détachements manuels, une seconde barrière exacte doit rapporter zéro service worker attaché. Un `TARGET_ATTACHED` après la première réponse est un échec d'invariant de protocole ; le nettoyage le reprend/détache si possible mais le verdict ne peut pas réussir. Une preuve manquante attend jusqu'à l'échéance de libération absolue et échoue.

1. chaque membre d'inventaire en pause reçoit une réponse réussie corrélée de `Runtime.runIfWaitingForDebugger` ; la reprise faisant autorité du remplaçant compte ;
2. la racine envoie un `Target.setAutoAttach` faux exact sans `sessionId` ni filtre :

   ```json
   {
     "autoAttach": false,
     "waitForDebuggerOnStart": false,
     "flatten": true
   }
   ```

3. après la réponse de désarmement, la racine envoie une barrière filtrée exacte `Target.getTargets` ; les cibles attachées sont égales uniquement aux membres manuels connus et la réponse fige l'inventaire complet ;
4. le `Target.detachedFromTarget` exact pour chaque session auto-attachée est conservé ;
5. chaque session de worker manuelle reçoit un `Target.detachFromTarget({sessionId})` explicite, avec réponse corrélée et événement de détachement ; aucune session de worker ne demeure mappée ;
6. une seconde barrière exacte de cibles de services workers prouve zéro worker attaché ;
7. la session de contrôle acquitte `ServiceWorker.disable` ;
8. la session de contrôle attachée manuellement reçoit la réponse et l'événement de détachement exacts ;
9. une réponse fraîche de `Target.getTargets` réservée aux pages prouve que la sentinelle figée existe toujours, est `about:blank`, n'est pas attachée et constitue la seule cible de page après que les pages créées par la fixture ont été fermées pour une rétrocession à l'exécution ;
10. la racine acquitte `Target.setDiscoverTargets({"discover":false})` sans filtre ;
11. le décompte des commandes en attente atteint zéro, les écouteurs sont supprimés, la poignée de main de fermeture du WebSocket brut est observée, et le bail retourne à `owner_none`.

Le rejet de désarmement/barrière, un détachement manquant, un attachement post-barrière, une commande en attente, une fuite d'écouteur, une perte de socket avant les reçus ou un timeout de fermeture rend le verdict en échec. Le nettoyage reprend/détache toujours ce qu'il peut, mais ne peut créer un succès.

Pour une époque éligible avec zéro dépassement, le reçu de libération brute inclut le registre de commandes complet et l'inventaire d'attachements plus les preuves de reprise/désarmement/barrière/détachement, la libération de la session de contrôle, le reçu de fermeture et l'échéance. Un reçu de dépassement en échec contient uniquement les enregistrements bornés, le condensat de chaîne et les compteurs et ne peut autoriser un transfert. Aucun inventaire vide, libellé d'état ou booléen local ne peut s'y substituer.

## Transfert Playwright et redémarrage multi-époques

Seul `owner_none` avec un reçu complet de libération brute peut demander la projection d'autorité pure. Seul `playwright_authority_ready` avec le reçu/hachage de projection exact actuel peut réserver une époque Playwright. La projection et la validation du schéma se terminent donc avant qu'aucun bail, WebSocket ou objet Playwright n'existe. L'acteur de bail ouvre alors un WebSocket suivi implémentant l'interface publique `ConnectOverCDPTransport` de Playwright. Il analyse les objets JSON entrants selon le schéma, sérialise les objets sortants et expose un reçu de fermeture à affectation unique. Le transport est déjà ouvert avant d'être transmis à Playwright ; aucun module privé de Playwright ni surcharge de chaîne d'endpoint n'est utilisé. La réservation se produit avant d'appeler :

```text
chromium.connectOverCDP(trackedTransport, {
  isLocal: true,
  noDefaults: true,
  timeout: remainingDeadline
})
```

L'endpoint demeure privé pour l'acteur de bail. La résolution de connexion acquitte l'auto-attachement racine interne de Playwright. Aucun transport brut, écouteur brut ou session brute en pause ne peut exister alors. Lors d'une libération normale, l'ensemble des trois preuves de l'époque actuelle sont obligatoires : `browser.close()` résolu, `disconnected` de Playwright et le reçu de fermeture WebSocket du transport suivi. Ils peuvent arriver dans n'importe quel ordre.

Si `connectOverCDP` rejette avant de renvoyer un Browser, le transport suivi est toujours détenu par `playwright_connecting`. L'acteur appelle son `close` idempotent, attend le reçu exact de fermeture du transport actuel et émet `PLAYWRIGHT_CONNECT_FAILED_CLOSED` ; ce n'est qu'alors que le nettoyage d'échec peut acquérir un autre bail. Il n'y a pas d'exigence impossible de `browser.close()`/`disconnected` lorsqu'aucun Browser n'a été renvoyé, et un rejet de connexion sans le reçu de fermeture suivi maintient le bail occupé et le verdict en échec.

Avant qu'une quelconque capacité de fixture ne soit exposée, le propriétaire Playwright installe un sous-graphe de diagnostic privé sur le même transport racine suivi en utilisant uniquement les sessions CDP publiques de Playwright :

1. il identifie la sentinelle préservée comme l'unique page `about:blank` du contexte par défaut et crée `context.newCDPSession(sentinelPage)` ;
2. cette session de sentinelle acquitte `ServiceWorker.enable` et conserve les événements exacts d'enregistrement/version/erreur pour l'autorité figée ;
3. un `browser.newBrowserCDPSession()` envoie un `Target.getTargets` filtré exact, identifie l'unique cible de worker figée, et appelle `Target.attachToTarget({targetId, flatten:false})` ;
4. la session de diagnostic imbriquée renvoyée est contrôlée uniquement par des commandes `Target.sendMessageToTarget` corrélées et des messages `Target.receivedMessageFromTarget` valides selon le schéma sur cette session CDP de navigateur ; elle acquitte `Inspector.enable` et `Runtime.enable`, capture `Inspector.targetCrashed`, `Inspector.targetReloadedAfterCrash`, `Runtime.exceptionThrown`, `Runtime.consoleAPICalled` et les événements de contexte, et fige exactement un `uniqueContextId` actuel ;
5. une évaluation d'identité fixe sur ce contexte unique correspond à l'autorité brute avant que la façade n'expose la moindre opération de page, de worker ou d'évaluation.

La session `CRServiceWorker` interne de Playwright 1.61.1 n'est jamais traitée comme un observateur de diagnostic car elle ne souscrit pas à `Runtime.exceptionThrown`. La session imbriquée explicite ci-dessus constitue la seule autorité de diagnostic d'exécution de l'époque Playwright. Un crash, rechargement, détachement ou second contexte inattendu de worker pendant une époque Playwright enregistre un diagnostic bloquant et empêche d'autres effets de fixture ; l'époque ne se poursuit que vers la libération. Le transfert du transport racine n'expose en lui-même aucune capacité de fixture et ne démarre aucun effet de test. Le modèle revendique des diagnostics complets à l'intérieur de chaque époque brute ou Playwright détenue et une instrumentation préalable aux effets, et non une télémétrie continue pendant l'intervalle au cours duquel aucun transport racine n'existe.

Le transfert exige :

1. `Browser.getVersion` correspond au reçu de processus figé ;
2. `browser.contexts()` expose exactement l'unique contexte persistant par défaut ;
3. exactement un service worker d'extension possède l'URL de script figée et l'identité native d'URL/portée ;
4. la session CDP de sentinelle observe le même enregistrement non supprimé, le même identifiant de version, la même portée et le même script que le reçu de redémarrage brut ;
5. la session de diagnostic d'exécution imbriquée est attachée à cette cible exacte, observe exactement un contexte actuel et réussit l'identité native d'URL/portée ;
6. le remplaçant est en cours d'exécution et les deux sessions de diagnostic restent attachées avant que la fixture n'expose les pages ou l'évaluation.

Zéro ou deux contextes, zéro ou deux workers, une dérive de version, une réponse d'observateur manquante, une identité manquante, un timeout de connexion ou une sortie précoce du processus est terminal.

La libération normale de Playwright ferme d'abord les pages créées par la fixture tout en préservant la sentinelle, puis effectue ce démontage de diagnostic exact avant `browser.close()` :

1. les réponses de `Runtime.disable` et `Inspector.disable` imbriqués sont corrélées ;
2. la réponse de `Target.detachFromTarget({sessionId})` et l'événement de détachement imbriqué correspondant sont tous deux conservés ;
3. le `ServiceWorker.disable` de sentinelle est acquitté ;
4. les promesses `detach()` de sentinelle et de CDP de navigateur se résolvent et aucun écouteur/commande en attente ne subsiste ;
5. c'est seulement alors que `browser.close()` peut s'exécuter, après quoi sa promesse, l'événement `disconnected` de Playwright et le reçu de fermeture du transport suivi sont tous requis.

Une session de diagnostic naturellement détachée, une preuve de désactivation/détachement manquante ou tout événement de diagnostic après suppression d'écouteur bloque le verdict et maintient le nettoyage responsable du transport.

`restartServiceWorkerForProbe(probe?)` est une transition de session, et non une mutation de Worker sur place :

```text
playwright epoch N
  -> close all fixture-owned pages
  -> browser.close() disconnect receipt
  -> owner_none
  -> raw epoch N+1 same-process restart and optional probe
  -> exact raw release
  -> owner_none
  -> Playwright epoch N+2 reconnect and correlation
  -> detached RestartReceipt DTO
```

Le PID Chromium, le profil, l'identifiant d'extension, l'enregistrement, la version et le script demeurent constants. Chaque ancien descripteur (handle) `Page`, `Worker`, `CDPSession`, Browser et context est invalide après la libération Playwright et ne peut franchir l'époque. Le harnais ne stocke que les URL des pages détachées avant la libération ; il ferme toutes les pages créées par la fixture, préserve uniquement la sentinelle privée, et les appelants rouvrent le panneau latéral pour obtenir de nouveaux descripteurs après la reconnexion.

Le résultat public du redémarrage est exactement ce DTO profondément figé et validé selon le schéma ; tous les entiers sont des entiers sûrs non négatifs et chaque hachage est hexadécimal minuscule à 64 caractères :

```text
RestartReceiptV1 = {
  schemaVersion: 1,
  processGeneration: integer,
  rawLeaseEpoch: integer,
  playwrightEpoch: integer,
  restartGeneration: integer,
  workerUrl: string,
  authoritySha256: string,
  bootstrapSha256: string,
  receiptSha256: string
}
```

`workerUrl` est égal à l'URL exacte du script packagé.
`authoritySha256 = SHA-256(JCS({extensionId, registrationId, versionId, scopeURL, scriptURL}))`.
`bootstrapSha256 = SHA-256(JCS({processGeneration, rawLeaseEpoch, restartGeneration, targetId, sessionId, attachmentGeneration, attachmentOrigin, crashEventSha256, contextGeneration, revokedUniqueContextIdsSha256, postCrashDestroyedUniqueContextIdsSha256, reloadEventSha256, uniqueContextId, startCommandId, executionContextEventSha256, resumeCommandId, resumeResultSha256, identityCommandId, identityResultSha256, testCommandId, testResultSha256, bootstrapCommandBatchSha256}))`.
`receiptSha256` est le SHA-256 JCS des huit champs publics précédents, en s'excluant lui-même. Les préimages et le reçu brut complet restent privés.

`evaluateInRestartedServiceWorker<T>(receipt, expression)` analyse d'abord la V1, puis compare chaque champ public et les trois hachages avec le reçu privé actuel unique du contrôleur. Il exige également la génération de processus actuelle, l'époque Playwright, la génération de redémarrage et le contexte de diagnostic imbriqué actuel avant d'envoyer `Runtime.evaluate` avec le `uniqueContextId` de ce contexte, `awaitPromise:true` et `returnByValue:true`. Toute mutation ou reçu plus ancien/récent rejette avant évaluation. L'expression de test arbitraire n'est qu'un effet et ne peut pas faire transiter le harnais. Cette API prouve la persistance des réglages et des alarmes sans exposer ni utiliser de descripteurs périmés.

## Arrêt global et nettoyage

Après utilisation et stabilisation du diagnostic, Playwright se libère exactement comme ci-dessus. La machine réserve un bail brut final `shutdown_connecting`, ouvre un socket suivi, et exige une réponse actuelle `Browser.getVersion` dont le hachage complet figé est égal au reçu d'endpoint de processus. Seul `SHUTDOWN_ENDPOINT_VERIFIED` entre dans `shutdown_owned` et envoie `Browser.close`. Parce que le processus peut fermer le socket avant de répondre, un reçu d'arrêt normal accepte soit :

- `SHUTDOWN_BROWSER_CLOSE_RESOLVED` actuel, transportant les identifiants exacts de processus, de bail d'arrêt, de transport et de commande, suivi de la sortie de l'enfant ; soit
- `SHUTDOWN_SOCKET_CLOSED_AFTER_COMMAND` actuel, émis uniquement lorsque le callback de fermeture du socket suivi est observé après la distribution des octets exacts de `Browser.close` et avant tout événement de sortie d'enfant, suivi de la sortie exacte de l'enfant sous la même échéance.

Le reçu de socket fige les horodatages monotones de distribution de commande et de fermeture et les identifiants actuels complets ; une fermeture de socket générique ne peut pas l'instancier. Le premier événement actuel de sortie d'enfant est réduit conjointement avec la preuve de fermeture déjà conservée. `PROCESS_EXITED` avant l'une ou l'autre preuve est une sortie inattendue non causale et entre dans la suppression de profil en échec. Une réponse ultérieure, un événement de socket ou un nettoyage ne peut rétroactivement le convertir en arrêt normal.

L'événement de `exit` de l'enfant, le PID/génération de processus figé et l'absence d'un processus remplaçant sont obligatoires. La suppression du profil ne commence qu'après la sortie. La revérification de l'artefact, la sortie du processus et la suppression du profil sont toutes requises pour le succès.

`passed` est provisoire jusqu'à l'unique transition `VERDICT_ARCHIVED`. Un `APPLICATION_DIAGNOSTIC_RECORDED` ou `EVIDENCE_OVERFLOW_RECORDED` tardif dans `profile_removing` ou `passed` révoque l'éligibilité et suit la branche explicite d'archive en échec. Archiver le succès et vérifier `eligible` constituent une transition gardée unique ; aucun intervalle d'événement ne peut archiver un verdict bloqué comme un succès.

Si l'acquisition brute d'arrêt ou `Browser.close` échoue, le nettoyage envoie `SIGTERM` puis `SIGKILL` uniquement à l'enfant actif détenu sous des échéances bornées. Si l'enfant actuel exact a déjà émis `PROCESS_EXITED`, le nettoyage ferme les objets de transport locaux, ignore toute opération de connexion/signal et transite directement vers la suppression de profil tout en préservant le verdict d'échec initial. La terminaison forcée peut archiver un verdict en échec, jamais autoriser un succès. L'incapacité à prouver la sortie ou à supprimer le profil reste en échec et est signalée avec des preuves complètes.

## Obligations de vérification hostile

L'implémentation ne peut être considérée comme complète pour revue tant que des tests déterministes n'ont pas prouvé :

1. le lancement/connexion Playwright avant la première libération brute, l'acquisition brute pendant que Playwright détient le bail, un second socket brut et une seconde connexion Playwright sont rejetés avant l'ouverture d'un transport ;
2. `DevToolsActivePort` absent, périmé, lié par un lien symbolique, non régulier, sur une/trois lignes, contenant des espaces/caractères de contrôle, un port/chemin invalide, une mauvaise génération et la sortie de l'enfant avant vérification échouent tous de façon hermétique ; l'absence et un fichier régulier de zéro octet pendant la fenêtre de polling sont réessayés jusqu'à l'échéance, puis échouent hermétiquement ;
3. la liste blanche manuelle d'arguments contient un profil exact, le débogage sur boucle locale, les chemins d'extension scellés et le mode déterministe, sans shell ni relais ; l'initialisation brute prouve la sentinelle et zéro attachement pré-armement, puis la découverte, l'auto-attachement, l'attachement de contrôle et l'activation de ServiceWorker dans cet ordre XState exact, tandis que chaque acquittement dupliqué/hors-ordre échoue ;
4. les versions chevauchantes initiales transitoires et une version redondante provisoire attendent la barrière de convergence exacte avec zéro arrêt/démarrage ; chaque attachement lié en pause est observé/repris une fois et exclu de l'autorité de remplacement, tandis que le chevauchement permanent expire par timeout ; les permutations des réponses d'activation d'Inspector et de Runtime avant/après la barrière et chaque réponse de reprise de session plus ancienne préservent la même preuve ;
5. une sélection déjà en cours d'exécution et une sélection en démarrage sans session brute n'effectuent aucun échauffement et un démarrage final unique ; une sélection en démarrage mise en pause est observée/reprise sans interblocage ; une sélection arrêtée effectue exactement un échauffement ne faisant pas autorité plus un démarrage final ; toutes effectuent un arrêt contrôlé et aucune ne détache la session sélectionnée ;
6. un auto-attachement arrivant pendant que la commande d'attachement manuel est en attente est soit la seule session provisoire corrélée à la réponse, soit terminal ; tout ordonnancement produisant deux sessions sélectionnées échoue et libère les deux ;
7. la réponse d'arrêt, les métadonnées arrêtées et `Inspector.targetCrashed` dans chaque ordre significatif ne peuvent pas démarrer le remplaçant final tant que l'ensemble des trois preuves n'existent pas sur la même cible/session ; le crash exact révoque de façon atomique chaque contexte pré-crash ; l'absence de destruction/vidage ne bloque jamais, les contextes vidés ne constituent que des preuves, et une destruction post-crash valide consigne de façon atomique son identifiant unique natif comme tombstone sans autoriser la progression ; après avoir quitté cet état, seule la fenêtre exacte même-session post-rechargement/pré-contexte est admissible et toute autre occurrence est terminale ;
8. le démarrage final n'accepte aucun nouvel attachement sélectionné : il exige `Inspector.targetReloadedAfterCrash`, les métadonnées de même version puis un contexte frais sur la session conservée dans la génération de contexte incrémentée dont l'`origin` native est égale au `scriptURL` figé complet ; un contexte pré-rechargement, une origine dérivée de la portée, la réutilisation d'un identifiant révoqué, un remplacement, un détachement, une suppression, une redondance ou une dérive de script/portée est rejeté ; la séquence native de métadonnées `starting(no targetId) -> starting(exact targetId) -> running` est idempotente après sa première preuve, tandis que toute dérive d'identité ou de cible demeure terminale ; un rechargement exact suivi de contextes vidés sur la session sélectionnée puis d'un contexte frais réussit ; un rechargement exact suivi de `destroy(X)` puis `create(X)` échoue, tandis que `destroy(X)` puis un contexte frais distinct réussit ; le même événement de cycle de vie avant rechargement ou après ce contexte est terminal ;
9. les identifiants de contexte malformés/surdimensionnés/contenant des caractères de contrôle, les identifiants uniques détruits manquants, le repli numérique, l'URL/portée native erronée, les champs d'identité supplémentaires, tout identifiant tombstoné lors du crash ou post-crash réutilisé après rechargement, l'événement de preuve retirée 4 097, l'emplacement d'autorité de contexte d'exécution 4 097 et un second contexte avant libération brute ne publient jamais un reçu valide ;
10. un client déterministe sur la même session bloque chaque `Runtime.evaluate` jusqu'à ce qu'il ait traité `Runtime.runIfWaitingForDebugger` : l'ordre de la révision 18 privilégiant l'identité doit reproduire l'interblocage à échéance finie, tandis que le lot de la révision 19 privilégiant la reprise doit exposer de façon synchrone les octets de reprise, d'identité et de test facultatif avant qu'aucune réponse ne soit attendue puis se stabiliser ; les deux sondes utilisent le `uniqueContextId` figé exact ; les identifiants sont strictement consécutifs dans l'ordre reprise/identité/test facultatif avec et sans la sonde facultative ; les réponses de promesses désordonnées se réduisent canoniquement via les états explicites reprise/identité/sonde facultative ; les écarts, croisements, doublons, mauvaises méthodes/sessions/paramètres/résultats et dérives de hachage de lot échouent hermétiquement ; le statut `running` exact de la version sélectionnée reste persistant lorsqu'il est émis avant la réduction de reprise, entre reprise et identité, entre identité et test, ou après la réduction finale ; les doublons exacts sont sans effet dans chaque état de lot, tandis que `running -> starting` et toute dérive d'autorité sont terminaux dans chaque état ; les tests de client brut continuent de prouver les envois immédiats de sockets et la corrélation réponse-par-identifiant ; les avertissements applicatifs bloquent uniquement le verdict et les échecs de protocole interrompent immédiatement ;
11. tout attachement actif étranger/dupliqué est bloquant et géré lors de la libération, tandis que les métadonnées complètes sans collision restent inertes ;
12. la libération accepte les attachements pendant `release_resuming`, désarme l'auto-attachement, ne ferme l'inventaire qu'après la barrière de protocole exacte, et traite tout attachement post-barrière comme terminal ; un sleep seul n'autorise jamais la libération ;
13. une reprise manquante, une barrière, un auto-détachement, une désactivation de ServiceWorker, une désactivation de découverte, un détachement de contrôle, un registre à zéro attente, la disposition d'écouteurs ou un reçu de fermeture brute empêche le transfert Playwright et le succès ; la sentinelle exacte est préservée, non attachée et unique page à chaque rétrocession ;
14. `connectOverCDP` avec zéro/deux contextes, zéro/deux workers exacts ou une identité brute/Playwright divergente échoue avant l'exposition de fixture ; un rejet de connexion sans Browser ferme néanmoins le transport public suivi avant de libérer son bail actuel ou de réserver tout bail ultérieur ;
15. l'observateur ServiceWorker de sentinelle et l'observateur Runtime/Inspector imbriqué non aplati sont tous deux installés avant les effets de fixture ; une exception, un crash/rechargement inattendu, une réponse d'observateur manquante ou un second contexte bloque le verdict ;
16. la libération Playwright désactive/détache les deux sessions de diagnostic avant `browser.close()`, et exige les preuves de fermeture du navigateur/déconnexion/transport ;
17. un redémarrage à l'exécution ferme les pages de fixture, prouve la déconnexion Playwright, rejette chaque ancien descripteur, effectue un redémarrage brut à session persistante sous propriétaire unique, reconnecte avec une époque supérieure et n'accepte que des reçus V1 exacts ;
18. les réglages, l'instantané d'onboarding, les données visibles dans IndexedDB et l'alarme `auto-scan` persistent à travers le redémarrage d'exécution et la reconnexion avec les mêmes processus et profil ;
19. l'acquisition brute avant le `disconnected` de Playwright, un événement tardif d'ancienne époque ou un reçu/évaluation périmé/muté/à hachage propre invalide ne peut muter la nouvelle époque ;
20. les lignes d'endpoint de sortie de processus sont caviardées avant conservation et chaque chemin d'endpoint malformé, y compris les syntaxes non canoniques d'UUID, échoue à l'admission ;
21. un redémarrage maximal, l'échéance globale interne et le timeout Playwright plus large préservent le nettoyage ; un enfant ayant déjà quitté ignore la reconnexion/les signaux et procède directement à la suppression du profil avec l'échec initial ;
22. l'arrêt final normal vérifie la version et ferme l'enfant exact avant la suppression du profil ; `PROCESS_EXITED` sans réponse exacte préalable de fermeture ou fermeture causale de socket post-commande est rejeté ; un TERM/KILL forcé nettoie un orphelin mais rend la porte rouge ;
23. les condensats d'artefacts avant/après, les diagnostics d'exécution, la sortie de processus et la suppression du profil précèdent tous le succès provisoire ; un événement de diagnostic/protocole bloquant dans chaque phase jusqu'à `profile_removing` et entre `passed` et l'archivage ne peut produire qu'un échec archivé ;
24. des tests unitaires et de machine déterministes prouvent la matrice complète de projection/erreur de cette révision en attente, y compris toutes les entrées hostiles de DTO/réflexion et les six mutations d'autorité étrangère cohérentes en interne, avec zéro réservation, transport ou connexion sur chaque rejet ;
25. les exécutions de smoke ciblées de démarrage à froid et de redémarrage sous propriétaire brut avec session conservée s'exécutent contre le package de production exact recompilé avec `--workers=1` et `--repeat-each=3` ; chaque répétition doit montrer la distribution de reprise avant les deux évaluations, les hachages exacts de lot/reçu, la preuve d'identité, la version sélectionnée `running`, la libération exacte, le DTO d'autorité liée à la source conservé de cette révision en attente et aucun diagnostic bloquant ; tout échec falsifie cette révision ;
26. l'inventaire complet des scénarios packagés s'exécute ensuite à partir du même artefact scellé canonique sans stubs DEV ni backend externe ;
27. les métadonnées de package/navigateur Playwright, la vérification préalable de l'exécutable et les versions exactes CDP produit/révision/JS rejettent toute dérive ; les flux saturants de diagnostics, commandes, messages imbriqués et attachements restent dans les limites à la fois du nombre d'entrées et des octets canoniques, émettent un dépassement typé, complètent le nettoyage et ne peuvent jamais passer en succès.

## Invariants

1. Les acteurs XState déterministes décident de chaque transition d'état ; les I/O et le texte ne produisent que des signaux.
2. Au plus un transport CDP racine créé par le harnais existe, et son type est toujours égal à l'état actuel du bail.
3. Aucune connexion Playwright ne chevauche un redémarrage brut ; aucune connexion brute ne chevauche Playwright.
4. Les mêmes processus, profil, identifiant d'extension, enregistrement, version et script sont préservés à travers les époques de redémarrage.
5. La preuve pré-amorçage exige une session sélectionnée conservée ; le `targetCrashed` exact révoque de façon atomique la génération complète de contexte pré-crash, chaque identifiant unique détruit ultérieurement est consigné séparément comme tombstone, le `targetReloadedAfterCrash` d'identité exacte précède un identifiant frais absent des deux ensembles dont l'origine native est égale à l'URL de script figée. Les seuls octets de commande de reprise précèdent les deux octets de commande de sonde ; le reçu exact de reprise, les réponses de sonde, l'engagement de lot et la preuve d'exécution se complètent après coup. Aucun événement de destruction/vidage de Runtime n'est une condition préalable à l'arrêt ni ne peut restaurer une autorité révoquée.
6. L'installation initiale peut converger ; l'autorité figée ne peut pas muter.
7. Chaque descripteur et événement est lié à une époque. Les anciens descripteurs et reçus périmés sont inutilisables après la libération.
8. Chaque session brute en pause est reprise, l'auto-attachement racine est désarmé, chaque session auto-attachée est détachée, ServiceWorker/découverte sont désactivés, la session de contrôle est détachée et le socket est fermé avant le transfert.
9. Le transfert Playwright fait l'objet d'un contrôle d'identité et d'une observation explicite Runtime/Inspector sur le même transport avant utilisation de l'UI.
10. Les capacités d'endpoint ne sont jamais conservées dans les logs ou les preuves publiques.
11. Aucun serveur Vite, stub DEV, backend externe, nouveau processus de navigateur ou mutation de produit n'est introduit par un redémarrage.
12. Un échec de nettoyage ne peut jamais conserver ni créer un succès.
13. La CI exécute la commande canonique avec Chromium épinglé et téléverse l'ensemble complet des preuves d'échec.
14. Une preuve actuelle de version de remplacement est à affectation unique mais non à observation unique : des métadonnées répétées et gardées de starting/running sont idempotentes et ne peuvent jamais échouer au seul motif que la preuve existe déjà.
15. Le vidage/destruction de Runtime post-rechargement n'est admissible qu'avant qu'une autorité de contexte frais n'existe ; le vidage ne constitue qu'une preuve, la destruction ajoute son identifiant unique borné à l'ensemble de tombstones post-crash, la fenêtre se ferme à la première admission de contexte, et les deux événements sont terminaux partout ailleurs en dehors de `controlled_stop`.
16. Un remplaçant en pause ne peut entrer dans un cycle causal de sonde-avant-reprise sur la même session : les seuls octets de reprise sont distribués de façon synchrone en premier, puis l'identité fixe et les octets de test facultatif, sans await entre les envois. Les identifiants de commande consécutifs exacts, la réduction canonique des reçus reprise/identité/test, les hachages de résultats et `bootstrapCommandBatchSha256` sont prouvés avant l'amorçage. Les métadonnées `running` exactes sont persistantes à travers chaque état de lot, tandis que toute régression ou dérive d'identité est terminale.

## Références principales

- <https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-setAutoAttach>
- <https://chromedevtools.github.io/devtools-protocol/tot/Inspector/>
- <https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-evaluate>
- <https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker/>
- <https://chromium.googlesource.com/chromium/src/+/38ad3e85e529e73d11a4cf1b03f9c28e0ef94b42/content/browser/devtools/service_worker_devtools_agent_host.cc>
- <https://chromium.googlesource.com/chromium/src/+/d661c0dd3ab2d9b38a693e74e56d4307b0290139/content/browser/devtools/service_worker_devtools_manager.cc>
- <https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp>
- <https://playwright.dev/docs/next/chrome-extensions#service-worker-idle-suspension-mv3>
- lignes sources locales épinglées de Playwright 1.61.1 citées dans la section de falsification
