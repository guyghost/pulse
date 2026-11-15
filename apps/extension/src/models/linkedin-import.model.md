## Évolution du 1er octobre 2026 — import contrôlé

Le flux livré dans `CvPage` est désormais : permission → extraction sans écriture →
prévisualisation → sélection → confirmation explicite → fusion locale. Les règles
ci-dessous remplacent la fusion immédiate décrite dans le modèle historique.

- `createCvImportStore` affiche les expériences nouvelles, modifiées et identiques ;
  la proposition provient du même calcul pur que la fusion persistée.
- L’annulation ne déclenche aucun message d’écriture. Une confirmation ne transmet
  que les expériences sélectionnées ; le worker relit le profil courant et conserve
  toutes les autres entrées.
- `SYNC_LINKEDIN_PROFILE_IMPORT` appelle la fusion avec `experiencesOnly: true`
  (quatrième argument booléen) : titre, mots-clés, localisation et autres champs
  du profil ne sont pas remplacés par l’extraction.
- Une expérience manuelle correspondante est intégralement conservée. Pour une
  expérience importée, les faits confirmés peuvent évoluer, notamment `isCurrent`
  et `endDate`. L’identité canonique, la provenance et les métadonnées existantes
  restent conservées ; `positionIndex` est recalculé.
- L’identité compare un identifiant externe hors forme positionnelle, puis
  entreprise/titre/mois normalisés. `linkedin-experience-N` n’est jamais une preuve
  d’identité. Un nouvel import identique n’ajoute aucun doublon.
- La prévisualisation affiche les valeurs proposées et rend la version actuelle
  consultable pour chaque modification ; les entrées identiques sont décochées.
- Une édition manuelle active bloque le démarrage de l’import. Le formulaire
  d’expérience est masqué pendant la récupération et la confirmation.

Le bouton bloque les appels concurrents ; les erreurs et confirmations restent
lisibles en ligne. Aucun profil LinkedIn réel n’a été extrait lors des tests locaux.

---

# Modèle d'import LinkedIn

Source de vérité pour le flux d'import de profil LinkedIn : extraction de l'onglet
de profil LinkedIn actif vers un brouillon canonique et fusion dans le profil de
l'utilisateur. Le flux traverse deux contextes Chrome (side panel → service worker)
via le bridge typé, et est conditionné par une permission d'hôte LinkedIn
**optionnelle** demandée en contexte depuis le side panel.

Pour les expériences, « import complet » désigne chaque poste exposé par la page
dédiée `/details/experience/` de LinkedIn, y compris les postes masqués derrière
l'élément « Tout afficher » / « Show all » de la page de profil. Le résultat
NE DOIT PAS dépendre de la position de défilement (scroll) de l'onglet source ni
du sous-ensemble actuellement affiché dans la carte de résumé du profil.

Le LLM ne décide jamais d'une transition. Il peut ultérieurement enrichir le contenu
extrait au sein d'un worker IA dédié ; le modèle décide du moment où l'extraction et
la fusion s'exécutent et de la manière dont les erreurs remontent. **Le LLM produit
des signaux ; le modèle décide.**

## Pourquoi un modèle

`chrome.tabs.query` ne renseigne `tab.url` que lorsque l'extension détient la
permission `tabs`, une permission d'hôte correspondante ou une autorisation
`activeTab` active. `activeTab` est révoquée dès que l'utilisateur navigue dans
l'onglet, si bien qu'un profil ouvert puis avec lequel il y a eu interaction
n'expose plus son URL. LinkedIn est déclaré dans `optional_host_permissions`
(axé sur la confidentialité : non demandé à l'installation), donc la permission
d'hôte doit être demandée depuis un contexte UI avec un geste utilisateur avant
que le service worker ne puisse lire l'URL de l'onglet, lire les cookies LinkedIn
ou injecter le script d'extraction.

Depuis la 0.2.5, le manifest ne déclare plus `activeTab` : la permission
d'hôte optionnelle LinkedIn, une fois accordée, suffit à renseigner `tab.url`,
à autoriser la vérification du cookie LinkedIn et à permettre
`chrome.scripting.executeScript` sur les onglets LinkedIn (y compris l'onglet
de détail des expériences ouvert en arrière-plan). `activeTab` n'apportait
donc aucune capacité et constituait une permission inutilisée au regard de la
revue Chrome Web Store.

`chrome.permissions.request()` ne peut être appelé que depuis un contexte UI
(popup, side panel, page d'options) lors d'un geste utilisateur — jamais depuis
le service worker. La demander depuis le SW (l'ancien flux) échoue systématiquement.

## Contextes

- **Side panel** (`src/ui/pages/CvPage.svelte`) — détient le geste utilisateur
  (clic sur « Importer LinkedIn ») et la demande de permission.
- **Service worker** (`src/background/index.ts`) — détient l'extraction
  (`LinkedInProfileExtractor`) et la persistance (fusion dans `UserProfile`).
- **Bridge** (`src/lib/shell/messaging/bridge.ts`) — messages typés entre les
  deux ; le side panel ne touche jamais directement à `chrome.cookies`,
  `chrome.scripting` ou IndexedDB.

## États (side panel, `handleLinkedInImport`)

```
idle ──CLICK─────────────────► checking-permission
checking-permission ──PERMISSION_GRANTED──► extracting
checking-permission ──PERMISSION_DENIED───► idle   (toast : "Autorisation LinkedIn refusée.")
extracting ──EXTRACT_OK(profile)──► merging
extracting ──EXTRACT_ERR(code,msg)──► idle   (toast : msg, typée par code)
merging ──MERGE_OK(addedCount, draftCount)──► idle   (toast : branche par compteur)
merging ──MERGE_ERR(msg)──► idle   (toast : msg)
```

### Branches `MERGE_OK` (fidèles, conscientes des compteurs)

Le toast d'issue de la fusion DOIT refléter le nombre d'expériences réellement
ajoutées, et pas seulement le fait que la fusion s'est exécutée. Le SW calcule
`addedCount` via le helper pur `countNewlyAddedExperiences(current, draft.experiences)`
(même clé de déduplication que `mergeExperiences`), et
`draftCount = draft.experiences.length`.

| Condition                            | Type de toast | Message                                                        |
| ------------------------------------ | ------------- | -------------------------------------------------------------- |
| `draftCount === 0`                   | info          | "Aucune expérience renseignée sur votre profil LinkedIn."      |
| `addedCount === 0 && draftCount > 0` | info          | "Vos expériences LinkedIn sont déjà présentes dans votre CV."  |
| `addedCount > 0`                     | success       | "{addedCount} expérience(s) LinkedIn importée(s) avec succès." |

Cela corrige la régression du « toast de succès mais sans données » : un profil
LinkedIn reconnu comme vide ou une fusion entièrement dédupliquée ne signale
plus un faux succès. Une page d'expériences illisible ou partielle échoue avant
la fusion.

`isImporting === true` pour `checking-permission | extracting | merging`
(bouton désactivé, réentrance bloquée).

## Événements

- `CLICK` — l'utilisateur clique sur « Importer LinkedIn ».
- `PERMISSION_GRANTED | PERMISSION_DENIED` — résultat de
  `ensureLinkedInHostPermission()` (façade).
- `EXTRACT_OK(profile) | EXTRACT_ERR(code, message)` — résultat de
  `importLinkedInProfile()` (bridge `IMPORT_LINKEDIN_PROFILE`). L'union typée
  d'erreurs inclut l'erreur récupérable `detail_page_unavailable` en plus des
  codes existants de permission, session, profil, DOM et challenge.
- `MERGE_OK(addedCount, draftCount) | MERGE_ERR(message)` — résultat de
  `syncLinkedInProfileImport(profile)` (bridge `SYNC_LINKEDIN_PROFILE_IMPORT`
  → `PROFILE_UPDATED`). `addedCount` est calculé par le helper pur
  `countNewlyAddedExperiences` ; `draftCount = profile.experiences.length`.

## Effets (shell)

- **Entrée dans `checking-permission`** : `ensureLinkedInHostPermission()`
  s'exécute dans le contexte du side panel :
  1. `chrome.permissions.contains({ origins: ['https://www.linkedin.com/*'] })`.
  2. Si faux, `chrome.permissions.request({ origins: ['https://www.linkedin.com/*'] })`
     (geste utilisateur actif). Renvoie `true`/`false`.
  - Exception UI documentée (même catégorie que l'écriture dans le presse-papiers) :
    permise car il s'agit du modèle recommandé par Chrome pour les permissions
    d'hôtes optionnelles.
- **Entrée dans `extracting`** : `importLinkedInProfile()` envoie
  `IMPORT_LINKEDIN_PROFILE` → SW `LinkedInProfileExtractor.extractProfile(now)`.
- **Entrée dans `merging`** : `syncLinkedInProfileImport(profile)` → SW
  `mergeCandidateProfileIntoUserProfile` → émet `PROFILE_UPDATED`. Une
  expérience persistée correspondante dont la source est `linkedin` rafraîchit sa
  `description` importée à partir d'une valeur de brouillon canonique non vide et
  sa `location` canonique exacte, y compris en effaçant une localisation obsolète
  lorsque LinkedIn n'en expose plus aucune. Les expériences manuelles restent
  souveraines et sont uniquement complétées.

## Extracteur (service worker) — vérifications ordonnées

```
ensureExtractionPermission()          // contains-only ; AUCUNE requête depuis le SW
  └ missing ⇒ permission_required
resolveTab(active, currentWindow)
  └ !tab?.id || !tab.url ⇒ profile_not_found   ("Ouvrez un onglet de profil LinkedIn…")
classifyLinkedInUrl(tab.url)
  └ login ⇒ session_required | checkpoint ⇒ rate_limited_or_blocked | non-/in/ ⇒ profile_not_found
detectSession(cookies li_at)
  └ absent ⇒ session_required
capturer les métadonnées du profil source (headline, summary, skills, education, links)
dériver /in/{slug}/details/experience/ à partir de l'URL de profil validée
exécuter la sous-machine d'expériences complètes (onglet temporaire inactif ; voir ci-dessous)
combiner les métadonnées sources + les expériences complètes
  └ blockedReason ⇒ rate_limited_or_blocked | unreadable ⇒ dom_changed | else ⇒ canonical draft
```

La vérification de permission s'exécute **avant** `resolveTab` : sans la
permission d'hôte LinkedIn, `tab.url` vaut `undefined` et la classification
d'URL produirait un `profile_not_found` trompeur. Avec la permission accordée
(via la barrière du side panel), `tab.url` est lisible pour les onglets LinkedIn.

La classification de l'URL s'effectue au segment exact. Les routes de session
sont `/login[/...]` et `/uas/login[/...]` ; les routes de vérification sont
`/checkpoint[/...]` et `/challenge[/...]`. Ces noms réservés ne sont classifiés
que lorsqu'ils occupent le segment de tête correspondant de la route. Ils NE
DOIVENT PAS correspondre à des sous-chaînes au sein d'un slug de profil valide
tel que `/in/login/`, `/in/checkpoint-engineer/` ou `/in/challenge-consulting/`.
La classification de la page source et de la page de détail consomme le même
classifieur de routes pur.

### Sous-machine d'expériences complètes (service worker)

La carte de résumé du profil n'est pas une source complète : LinkedIn peut ne
restituer qu'un sous-ensemble et reléguer le reste derrière « Tout afficher ».
L'extracteur détient par conséquent une sous-machine bornée qui lit la page
d'expériences dédiée sans naviguer ni modifier l'onglet de profil actif de
l'utilisateur.

```text
resolving-detail-url
  ├─ INVALID_PROFILE_URL ───────────────────────────────► detail-error(profile_not_found)
  └─ DETAIL_URL_RESOLVED(url) ──────────────────────────► opening-detail-tab

opening-detail-tab
  ├─ TAB_OPEN_FAILED ───────────────────────────────────► detail-error(detail_page_unavailable)
  └─ TAB_OPENED(tabId, active=false) ───────────────────► waiting-detail-page

waiting-detail-page
  ├─ PAGE_READY ────────────────────────────────────────► extracting-detail
  ├─ LOGIN_REDIRECT ────────────────────────────────────► detail-error(session_required)
  ├─ CHALLENGE_REDIRECT | CHALLENGE_DOM ────────────────► detail-error(rate_limited_or_blocked)
  ├─ TAB_CLOSED | TIMEOUT ──────────────────────────────► detail-error(detail_page_unavailable)
  └─ SIDE_PANEL_CLOSED ─────────────────────────────────► waiting-detail-page

extracting-detail
  ├─ LIST_STABLE(items) ────────────────────────────────► closing-detail-tab
  ├─ DOM_UNREADABLE ────────────────────────────────────► detail-error(dom_changed)
  ├─ TIMEOUT ───────────────────────────────────────────► detail-error(detail_page_unavailable)
  └─ CHALLENGE_DOM ─────────────────────────────────────► detail-error(rate_limited_or_blocked)

detail-error(error) ────────────────────────────────────► closing-detail-tab(error)
closing-detail-tab(result) ── TAB_CLOSED_OR_ABSENT ─────► detail-terminal(result)
```

`SIDE_PANEL_CLOSED` n'annule pas le nettoyage du service worker. Dès lors qu'un
onglet temporaire a été créé, le service worker termine l'opération bornée et
exécute le chemin de nettoyage. La fermeture manuelle de l'onglet temporaire est
traitée comme un échec d'extraction typé et récupérable ; l'onglet de profil
source n'est jamais fermé.

`detail_page_unavailable` est une erreur shell récupérable pour la création ou le
chargement de l'onglet, la fermeture manuelle ou le timeout de disponibilité.
`dom_changed` est réservé à une page qui a été chargée mais dont la structure
des expériences ou l'état vide ne peut pas être reconnu.

Le texte de récupération est déterminé par l'erreur terminale typée, jamais par
du texte libre :

- `session_required` : demander à l'utilisateur de se reconnecter à LinkedIn,
  puis de relancer l'import ;
- `rate_limited_or_blocked` : demander à l'utilisateur de compléter la
  vérification de sécurité / le challenge de LinkedIn, puis de relancer l'import ;
- `detail_page_unavailable` : demander à l'utilisateur de recharger LinkedIn,
  puis de relancer l'import.

#### URL de détail et cycle de vie de l'onglet

- L'URL de détail est dérivée structurellement de l'URL `/in/{slug}` déjà validée,
  et non d'un texte de lien localisé tel que « Tout afficher ».
- Le service worker ouvre exactement un onglet avec `active: false` ; il ne
  navigue ni ne donne jamais le focus à l'onglet de profil source.
- Le `tabId` créé est enregistré avant d'attendre la disponibilité de la page.
- `chrome.tabs.remove(createdTabId)` s'exécute depuis un chemin de nettoyage
  équivalent à un `finally` en cas de succès, d'erreur de parsing, de redirection,
  de timeout, d'annulation ou de challenge.
- Un échec de fermeture est consigné pour le diagnostic mais NE DOIT PAS
  remplacer un résultat d'extraction réussi ni l'erreur d'extraction d'origine.
  Le shell émet un avertissement structuré `detail_tab_cleanup_failed` contenant
  uniquement l'identifiant de l'onglet temporaire et la cause assainie.

#### Disponibilité et complétude

- Les constantes du shell sont explicites : `DETAIL_PAGE_LOAD_TIMEOUT_MS = 15_000`,
  `DETAIL_LIST_STABILIZE_TIMEOUT_MS = 10_000` et
  `DETAIL_LIST_OBSERVATION_MS = 500`.
- L'extraction ne démarre qu'après que le document de détail signale sa
  disponibilité et que l'URL finale a été classifiée à nouveau.
- La fonction injectée peut attendre de manière asynchrone la racine des
  expériences.
- Elle fait défiler la liste dédiée jusqu'à sa fin et observe le nombre de lignes
  de postes candidates. La liste n'est complète qu'après avoir atteint son terme,
  n'affiche aucun indicateur de chargement actif et maintient à la fois le nombre
  de lignes et la hauteur du document stables pendant deux cycles d'observation
  consécutifs.
- L'attente est bornée par un timeout strict. Le timeout produit
  `detail_page_unavailable` ; il ne fusionne pas les lignes partielles
  accumulées avant le timeout.
- Un état vide LinkedIn reconnu avec succès peut renvoyer zéro expérience.
  L'action générique du propriétaire `Add position` / `Ajouter un poste` n'est pas
  un signal de vide en soi : LinkedIn peut l'afficher pendant que les lignes de
  postes sont encore en cours de chargement différé (lazy loading). Un résultat
  vide canonique requiert l'ensemble de ces invariants : (1) la racine dédiée aux
  expériences est présente, (2) un conteneur structurel vide LinkedIn
  (`.artdeco-empty-state` ou un marqueur de test explicite d'état vide) est
  présent, (3) zéro ligne de poste ne subsiste après défilement/observation,
  (4) la hauteur du document et le nombre de lignes sont stables pendant les
  cycles consécutifs configurés, et (5) aucun loader actif n'est visible. Une
  page à zéro ligne sans ce signal structurel de vide correspond à `dom_changed`
  après l'observation bornée ; une page qui a exposé des lignes mais ne s'est
  jamais stabilisée est un timeout. Aucun de ces cas ne peut être fusionné en tant
  que profil vide.

#### Détention en vol unique (single-flight)

- Le shell du service worker détient une opération d'expérience complète à portée
  de module par URL de détail canonique. Les requêtes concurrentes de
  prévisualisation/import pour le même profil rejoignent la même Promise et créent,
  extraient depuis et ferment ainsi exactement un seul onglet temporaire.
- Le premier appelant est le meneur (leader). Sa valeur `now` injectée horodate
  de manière déterministe toute `AppError` partagée ; les suiveurs reçoivent
  exactement la même valeur `Result` plutôt que de reconstruire une erreur avec
  leur propre horloge.
- L'entrée en cours (in-flight) n'est libérée qu'après la fin du nettoyage
  terminal du leader (y compris un échec capturé de fermeture d'onglet). Une
  invocation explicite ultérieure démarre une nouvelle opération avec son propre
  onglet et sa propre valeur `now`.
- Les différentes URL de détail canoniques sont indépendantes. Cette mutualisation
  ne crée pas de retry implicite et n'élargit pas l'invariant d'onglet unique
  au-delà d'une opération de profil.

#### Contrat DOM des expériences

L'extracteur utilise des signaux structurels et d'accessibilité, dans cet ordre :

1. chemin d'accès dédié `/details/experience/` + contenu principal de la page ;
2. ancre stable `#experience` ou repli sur le titre Expérience / Experience ;
3. identités fortes de poste issues soit des marqueurs `profilePosition` soit des
   liens de la vue propriétaire `/details/experience/edit/forms/{id}/`, plus des
   signaux faibles de découverte de ligne
   (`data-view-name="profile-component-entity"`, `role="listitem"`, et les
   formes historiques `.pvs-list__paged-list-item` / `li.artdeco-list__item`),
   puis un élément de liste générique structurellement filtré au sein de la racine
   Expérience résolue comme dernier repli de compatibilité ;
4. nœuds textuels visibles ou d'accessibilité au sein de la ligne de poste
   résolue.

Les classes CSS générées ou spécifiques à une expérimentation ne constituent
jamais l'unique critère d'éligibilité pour un poste. Une identité imbriquée
(par exemple, un lien `profilePosition` ou un lien de formulaire d'édition
propriétaire) est normalisée vers sa ligne parente avant parsing. La vue
propriétaire actuelle de LinkedIn peut n'exposer aucun `li`, rôle listitem,
attribut d'entité sémantique ou classe de carte stable : le lien descriptif du
formulaire d'édition contient alors les champs structurels tandis que sa
description et ses compétences sont des blocs frères. Pour un marqueur
propriétaire `/details/experience/edit/forms/{id}/` sans conteneur de ligne
reconnu, le propriétaire est donc l'ancêtre le plus large strictement situé sous
la racine Expérience résolue dont les marqueurs de formulaire d'édition (propres
ou descendants) contiennent exactement cet identifiant numérique unique. La
remontée s'arrête avant la racine ou le premier ancêtre contenant un identifiant
de poste différent. Cette frontière fonctionne pour une page à carte unique (la
racine n'est jamais consommée), plusieurs cartes sœurs et des conteneurs générés
arbitrairement imbriqués sans dépendre de leurs classes. Le lien adjacent
« Modifier » porte la même identité numérique et reste à l'intérieur de ce
propriétaire ; il est traité comme une représentation dupliquée, jamais comme
une seconde expérience. Les candidats sont classifiés en `group`, `position` ou
`chrome` sans rapport : les groupes préservent le contexte de l'entreprise pour
leurs postes feuilles et ne sont jamais émis eux-mêmes ; les candidats faibles qui
ne disposent pas de la structure minimale de poste après héritage du contexte
sont ignorés en tant qu'éléments d'habillage de la page (chrome). À l'inverse, une
feuille `profilePosition` fortement identifiée à laquelle il manque encore un
champ requis après héritage du groupe rend l'ensemble du snapshot de détail
`DOM_UNREADABLE` ; l'importateur n'abandonne jamais un poste identifié malformé
pour fusionner une liste partielle. La force d'un candidat est préservée tout au
long du parsing : une feuille faible impossible à parser est ignorée, tandis
qu'une feuille forte impossible à parser invalide le snapshot. Une ligne de poste
forte domine les descendants faibles tels que les puces au sein de sa
description ; ces descendants ne peuvent pas transformer le parent en groupe ni
devenir des postes à part entière. Les représentations dupliquées masquées ou
d'accessibilité de la même identité canonique `profilePosition` forment un unique
panier de validation : la première représentation analysable l'emporte, et le
panier n'est illisible que si aucune de ses représentations n'est complète.

Les limites de lignes sont capturées **avant** la normalisation des espaces. Les
sauts de ligne doivent rester disponibles pour distinguer le titre,
l'entreprise/le type d'emploi, la plage de dates, la localisation, la
description et les compétences. Les doublons masqués d'accessibilité et les
labels d'action sont retirés avant l'affectation des champs.

##### Sources de lignes

Une ligne de poste expose du texte à travers deux familles de sources. Les lignes
structurelles viennent en premier (feuilles d'accessibilité, ou repli sur le
texte complet lorsque la ligne n'expose aucune feuille d'accessibilité), puis les
lignes de prose dans l'ordre du DOM :

1. **Feuilles d'accessibilité** : éléments `[aria-hidden="true"]` qui ne
   contiennent aucun `[aria-hidden="true"]` imbriqué, à l'exclusion de tout
   élément au sein d'un `button`, `svg`, `[hidden]`, `.visually-hidden` ou
   `.sr-only`. LinkedIn affiche les champs structurels (titre, entreprise, dates,
   localisation) de cette façon.
2. **Feuilles de blocs de prose** : éléments `p`/`li` situés en dehors de tout
   ancêtre `[aria-hidden="true"]`, à l'exclusion des boutons, svg, éléments
   masqués et blocs non terminaux. LinkedIn affiche les descriptions
   d'expériences et les puces de compétences de cette façon (blocs
   `pvs-entity__sub-components` dont le texte n'est _pas_ dupliqué dans un
   conteneur aria-hidden).

Invariants :

- Les conteneurs de prose possèdent leurs valeurs d'accessibilité imbriquées :
  une feuille aria-hidden au sein d'un bloc de prose collecté n'est jamais
  également une source autonome (il s'agit du même texte).
- Au sein des conteneurs de prose, les balises `span` `.visually-hidden` ne sont
  conservées que lorsqu'elles portent un libellé de champ (un libellé sur une ligne
  complète `Compétences` / `Skills`) ; toute autre balise `.visually-hidden`
  duplique le texte visible adjacent et est supprimée. Les descendants `button`,
  `svg`, `[hidden]` et `.sr-only` sont systématiquement retirés.
- Les limites de blocs (`p`, `li`, `br`) au sein d'une source constituent des
  limites de lignes : deux paragraphes d'une description ne fusionnent jamais en
  une seule ligne collée, indépendamment des espaces entre leurs balises.
- Les sources de prose ne suppriment jamais le repli sur le texte intégral : une
  ligne se replie sur l'extraction en texte intégral dès lors qu'elle n'expose
  aucune feuille d'accessibilité, et ce repli exclut les blocs détenus par des
  sources de prose (pas de double lecture).
- Les champs structurels (`title`, `company`, `dateRange`) ne sont affectés qu'à
  partir de lignes structurelles (accessibilité ou repli). Après la frontière de
  date, `location` correspond à la première ligne structurelle dont la valeur
  satisfait au contrat géographique strict ; ce n'est que lorsqu'aucun candidat
  structurel n'est qualifié qu'une ligne de prose satisfaisant à ce même contrat
  peut être utilisée. Le contrat accepte un lieu court en casse de titre, un lieu
  séparé par des virgules, un suffixe optionnel télétravail/hybride/sur site, le
  suffixe métropolitain localisé exact de LinkedIn `et périphérie`, ou un
  marqueur autonome de mode de travail. `et périphérie` n'est valide qu'après un
  préfixe de lieu qui satisfait indépendamment au contrat de lieu en casse de
  titre ; une prose arbitraire se terminant par ces mots reste invalide. Le contrat
  rejette la prose de type phrase même lorsqu'elle se termine par un suffixe de mode
  de travail. LinkedIn pouvant réordonner les lignes d'accessibilité de
  description et de localisation, l'ordre du DOM seul ne suffit jamais à
  classifier l'un ou l'autre champ. Chaque ligne restante ne correspondant pas à un
  champ, qu'elle appartienne à la famille structurelle ou à la prose, alimente
  `description` ou `skills`.
- Une description que LinkedIn affiche repliée conserve son texte visible
  tronqué ; le doublon d'accessibilité non tronqué à l'intérieur de
  `.visually-hidden` n'est pas fusionné (les doublons masqués sont supprimés,
  jamais privilégiés).

L'affectation des champs obéit à ces signaux déterministes :

- `title` : première ligne principale/en gras dans une ligne de poste feuille ;
- `company` + `employmentType` : la ligne d'entreprise scindée une seule fois sur
  le séparateur point médian de LinkedIn ; la valeur optionnelle de droite est
  préservée comme texte d'affichage ;
- `dateRange` : première ligne dont le début contient une année à quatre chiffres
  et dont la fin, après un séparateur d'intervalle délimité par des espaces,
  contient une autre année ou un marqueur localisé de poste actuel (`Present`,
  `aujourd’hui`, `en cours`) ;
- `location` : première ligne structurelle postérieure à la date satisfaisant au
  contrat géographique strict ; en son absence, la première ligne de prose
  postérieure à la date satisfaisant à ce même contrat. Une description peut
  apparaître avant la localisation et doit être ignorée lors de la recherche du
  candidat à la localisation ;
- `description` : chaque ligne restante, structurelle ou de prose, après
  suppression du titre, de l'entreprise/du type d'emploi, de la date, de la
  localisation reconnue, du texte d'action et du libellé/valeur de compétence ;
- `skills` : valeurs issues d'un libellé sur une ligne complète `Compétences` /
  `Skills`, soit le libellé seul, soit le libellé suivi de deux-points et de
  valeurs en ligne. La correspondance du libellé est ancrée à la ligne complète :
  une prose telle que « Compétences développées en dirigeant... » reste du texte de
  description. Lorsque le libellé se trouve seul sur sa ligne (le libellé masqué
  visuellement annote la liste de valeurs adjacente), la ligne qui suit
  immédiatement porte les valeurs ; cette ligne adjacente est consommée comme
  compétences et exclue de `description` ainsi que de l'heuristique de `location`,
  sauf s'il s'agit elle-même d'une ligne structurelle (plage de dates, durée ou
  libellé d'action).

Le contrat géographique strict est déterministe. Après suppression d'un suffixe
optionnel de mode de travail précédé d'un point médian et du suffixe
métropolitain exact optionnel `et périphérie`, le préfixe de lieu restant fait au
plus 120 caractères et correspond soit (a) à un marqueur exact de mode de
travail, soit (b) à une séquence de segments de lieux séparés par des virgules,
soit (c) à un lieu autonome d'au plus quatre tokens. Chaque token de lieu doit soit
appartenir à la liste blanche des connecteurs (`and`, `de`, `des`, `du`, `et`,
`la`, `le`, `les`, `of`, `the`), soit commencer par une lettre majuscule ou un
chiffre et ne contenir que des lettres, signes diacritiques, chiffres,
apostrophes, parenthèses, points, barres obliques ou traits d'union. Un lieu
autonome ne peut pas se terminer par une ponctuation de phrase. La ligne
d'origine, y compris `et périphérie`, est conservée comme localisation
canonique. Si un suffixe avec point médian existe et n'est pas un marqueur exact
de mode de travail, le candidat n'est pas une localisation. Ces règles acceptent
`Paris`, `Île-de-France`, `Paris, France`, `Paris · Hybride` et
`Paris et périphérie`, tout en rejetant `Led distributed teams · Remote`,
`Pilotage produit et périphérie`, et la prose ordinaire de phrase.

`employmentType` est un champ d'expérience canonique optionnel. Les expériences
historiques ou manuelles le normalisent à `null` ; l'import ne doit pas ajouter
la valeur au nom de l'entreprise ni l'écarter silencieusement.

LinkedIn peut regrouper plusieurs rôles sous une même entreprise. Un conteneur
comportant des lignes de postes imbriquées est un groupe, non un poste : son
libellé d'entreprise est hérité par chaque ligne feuille, et seules les lignes
feuilles sont émises. Dans une feuille groupée, l'affectation des champs est
structurelle : après le titre, la première ligne d'intervalle de dates fixe la
frontière de date ; seule une ligne sans date entre le titre et cette frontière
peut correspondre à l'élément optionnel `employmentType`. Lorsque la date suit
immédiatement le titre, l'entreprise héritée est conservée et `employmentType`
demeure absent. Une période, une durée ou une localisation n'est jamais concaténée
à l'entreprise héritée et n'est jamais interprétée comme un type d'emploi. Les
lignes autonomes sont émises directement.
Les lignes sont dédupliquées en utilisant la même clé métier normalisée
`(title, company, start month)` que celle utilisée par la fusion canonique de CV ;
l'ordre du DOM ne détermine que `positionIndex`.

#### Politique de retry

Il n'y a pas de retry automatique complet : ouvrir silencieusement plusieurs
pages LinkedIn peut augmenter le risque de limitation de débit (rate limit).
Après une erreur terminale, l'utilisateur peut explicitement cliquer à nouveau sur
« Importer LinkedIn ». Un nouveau clic démarre une nouvelle sous-machine
uniquement après que l'onglet temporaire précédent a atteint son état terminal de
nettoyage.

### Détection du motif de blocage (DOM)

`blockedReason` est calculé au sein de `extractLinkedInProfileFromDom` (injecté
dans la page). Il s'agit du **repli** pour les pages interstitielles de
challenge que LinkedIn délivre sur une URL `/in/` sans modifier l'URL — les
redirections de chemin d'URL vers `/checkpoint/` ou `/challenge/` étant déjà
capturées plus tôt par `classifyLinkedInUrl`.

La détection est **spécifique, corroborée et non gloutonne** :

- Les signaux de blocage sont exclusivement des expressions propres aux pages de
  challenge : « security verification », « unusual activity », « verify your
  identity », « temporarily restricted », « security check ».
- Les mots isolés « challenge » / « checkpoint » NE SONT PAS des signaux de
  blocage : ils apparaissent dans de la prose légitime de profil (par ex. « I enjoy
  new challenges », « project checkpoint ») et ont précédemment causé de fausses
  erreurs `rate_limited_or_blocked` qui bloquaient de véritables imports.
- Une phrase isolée en texte libre ne suffit jamais sur une URL de profil. Un
  challenge DOM nécessite la corroboration par l'une de ces structures
  déterministes : (1) une route réservée `/checkpoint/` ou `/challenge/` ; (2) un
  `main h1` spécifique à un challenge exact associé à une expression distincte de
  challenge en dehors de ce titre ou à un contrôle de vérification ; (3) au moins
  deux expressions distinctes spécifiques à un challenge ; ou (4) une expression
  de challenge associée à un contrôle de vérification. Les contrôles de vérification
  sont des marqueurs structurels de formulaire/champ de saisie/test, et non du
  texte de bouton générique.
- Garde-fou défensif : la corroboration par texte/titre n'est souveraine que
  lorsque la page ne comporte aucun marqueur fort de profil (section Infos,
  Expérience ou Formation reconnue, expérience/formation analysée, ou `main h1`
  ne relevant pas d'un challenge). Ces marqueurs protègent les titres et la prose
  biographique contre les faux positifs. Un sélecteur secondaire obsolète de
  headline seul n'est pas un marqueur fort car LinkedIn peut le laisser monté
  derrière un interstitiel.
- La détection de challenge est évaluée indépendamment de la sélection du titre
  (headline). Un `main h1` corroboré propre à un challenge tel que « Security
  verification » a la priorité sur un texte obsolète de
  `.pv-text-details__left-panel` ou de `[data-generated-suggestion-target]`, est
  renvoyé avec un titre vide, et interrompt le flux avant que l'onglet de détail
  ne s'ouvre. Inversement, le titre exact « Security verification » sans second
  signal de challenge, route réservée, contrôle de vérification ou autre
  corroboration demeure une donnée légitime de profil, même si les sections en
  chargement différé du profil n'ont pas encore été rendues.

## Invariants

1. `chrome.permissions.request()` est appelé **uniquement** depuis le side panel
   lors d'un geste `CLICK`, jamais depuis le service worker.
2. L'extracteur valide la permission d'hôte LinkedIn **avant** de lire
   `tab.url`.
3. Si `tab.url` vaut `undefined` après que la permission a été accordée, l'onglet
   actif n'est pas un onglet LinkedIn → `profile_not_found` est correct.
4. `isImporting` bloque la réentrance pendant toute la séquence
   `checking-permission → extracting → merging`.
5. Les erreurs de bridge sont remontées sous forme de toasts typés ; l'UI ne
   plante jamais sur des réponses null/inconnues du bridge (gestion gracieuse de la
   façade).
6. Le LLM ne décide jamais d'une transition. Il peut uniquement enrichir le
   contenu extrait au sein d'un worker IA dédié. **Le LLM produit des signaux ; le
   modèle décide.**
7. La détection de blocage DOM est spécifique : seules les expressions propres aux
   pages de challenge constituent des signaux de blocage, et seulement lorsqu'aucune
   section de profil n'est présente. Les mots isolés « challenge » / « checkpoint »
   dans le corps de texte NE DOIVENT PAS déclencher de blocage — ils apparaissent
   dans des textes légitimes de profils.
8. Le toast de fusion est conscient des compteurs : `MERGE_OK` transporte
   `addedCount` + `draftCount`, et l'UI se branche sur ceux-ci. Une fusion qui
   ajoute 0 expérience (extraction vide ou déduplication totale) NE DOIT PAS
   afficher de toast de succès.
9. Un import de CV obtient les expériences depuis la page de détail dédiée,
   jamais depuis la carte incomplète de résumé du profil. La position de
   défilement de l'onglet source est sans pertinence.
10. L'onglet de profil LinkedIn actif n'est jamais navigué, focalisé ni fermé par
    l'extraction.
11. Au plus un onglet de détail inactif existe par import, et chaque chemin
    terminal atteint après `TAB_OPENED` tente de fermer cet onglet créé exactement
    une fois.
12. Les résultats partiels d'une page de détail ne sont jamais fusionnés. Seul
    `LIST_STABLE(items)` ou un état vide reconnu peut atteindre le parser
    canonique.
13. Les limites de lignes de texte sont préservées jusqu'après l'affectation des
    champs ; la normalisation des espaces ne peut pas contracter toute une
    expérience dans son seul titre.
14. Les conteneurs d'entreprise groupés ne deviennent pas des expériences en
    double : seules les positions feuilles sont émises, avec le contexte
    d'entreprise hérité lorsque requis.
15. Un résultat à zéro expérience n'est véridique que lorsque la page dédiée de
    LinkedIn expose un état vide reconnu. Une liste absente ou illisible correspond
    à `dom_changed`.
16. Les feuilles groupées héritent de l'entreprise indépendamment de leur type
    d'emploi optionnel ; une ligne de plage de dates ne peut jamais renseigner ni
    altérer l'un ou l'autre champ.
17. Un `main h1` corroboré propre à un challenge n'est jamais accepté comme titre
    de profil et ne peut pas être masqué par un balisage obsolète de titre de
    profil. Le même texte sans corroboration reste un titre légitime et ne peut
    produire à lui seul `blockedReason`.
18. Les libellés de compétences sont des contrats sur une ligne complète. Seuls
    `Skills` / `Compétences` ou leurs valeurs en ligne délimitées par deux-points
    sont structurels ; une prose plus longue débutant par l'un de ces mots demeure
    dans la description de l'expérience.
19. La découverte de postes est invariante face aux expérimentations du DOM de
    LinkedIn : `profilePosition` est une identité forte, tandis que les rôles
    d'entité sémantique/liste et les classes historiques sont des signaux faibles
    de découverte. Des candidats faibles sans rapport ne peuvent pas invalider
    une liste valide ; une feuille malformée fortement identifiée invalide en
    revanche le snapshot complet après héritage de groupe et déduplication des
    identités.
20. Les descendants faibles d'une ligne de poste forte constituent du contenu et
    non des postes imbriqués. Une puce de liste ou une compétence comportant un
    texte semblable à une année ne peut pas remplacer le poste qui la détient ni
    fournir le contexte d'entreprise du groupe.
21. Les traits d'union au sein de la prose ou des identifiants ne sont pas des
    séparateurs de plage de dates. Les deux bornes temporelles doivent satisfaire
    au contrat de date avant qu'un candidat générique ne puisse être promu en
    poste.
22. Les liens d'édition de la vue propriétaire sont des identités de poste
    stables : le lien descriptif et son action d'édition adjacente se résolvent tous
    deux dans le même panier `/edit/forms/{id}`, et une seule représentation
    analysable suffit. Le doublon d'action seule ne peut ni invalider le panier
    ni créer une autre expérience. Lorsqu'aucune ligne sémantique ou de liste
    n'existe, tous les ancêtres de même identifiant situés sous la racine
    Expérience forment une seule carte propriétaire ; la racine et tout ancêtre
    contenant un autre identifiant sont exclus. Les blocs frères de description et
    de compétences au sein de cette carte appartiennent au même poste.
23. Une localisation LinkedIn n'est jamais persistée dans `description`, et une
    description n'est jamais consommée comme `location` : la localisation
    structurelle l'emporte ; sinon, seul le repli géographique strict peut
    consommer une ligne de prose. Les lignes postérieures à la date qui ne
    correspondent pas à ce contrat restent du contenu de description même si elles
    précèdent la localisation réelle ou si le poste ne comporte pas de
    localisation. En particulier, `Remote`, `Paris · Hybride` et
    `Paris et périphérie` sont des localisations tandis que
    `Led distributed teams · Remote` reste une description.
24. Le ré-import corrige les erreurs d'extraction précédemment persistées : après
    correspondance via la clé canonique d'expérience, une entrée
    `source: 'linkedin'` adopte la nouvelle `description` canonique non vide et la
    `location` canonique exacte (y compris `null`) tout en conservant son identité
    locale et son ordonnancement. Une entrée manuelle avec la même clé métier
    conserve ses champs rédigés localement.

## Matrice d'erreurs et de récupération

| Condition                                            | Code                      | Récupération utilisateur                                                     |
| ---------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| Permission LinkedIn manquante ou refusée             | `permission_required`     | Accorder la permission optionnelle LinkedIn et réessayer.                    |
| Redirection vers login ou session `li_at` manquante  | `session_required`        | Se connecter à LinkedIn, puis réessayer.                                     |
| L'onglet source n'est pas un profil `/in/{slug}`     | `profile_not_found`       | Ouvrir le profil LinkedIn souhaité.                                          |
| URL ou DOM de checkpoint / challenge                 | `rate_limited_or_blocked` | Compléter la vérification LinkedIn ; ne pas retenter automatiquement.        |
| L'onglet de détail ne peut charger ou est fermé      | `detail_page_unavailable` | Garder Chrome en ligne et réessayer explicitement.                           |
| La liste de détail ne se stabilise pas avant timeout | `detail_page_unavailable` | Recharger LinkedIn et réessayer ; aucune donnée partielle n'est sauvegardée. |
| Racine ou lignes d'expériences non conformes         | `dom_changed`             | Mettre à jour MissionPulse ; ne pas inviter l'utilisateur à scroller.        |
| État vide reconnu sur la page de détail              | succès avec 0 ligne       | Expliquer que LinkedIn ne contient aucune expérience à importer.             |

L'UI NE DOIT PAS utiliser l'instruction générique actuelle « défilez jusqu'à la
section Expérience » pour `dom_changed` : l'importateur complet prenant en charge
la navigation et le chargement différé, le défilement n'est plus une action de
récupération valide.

## Non-objectifs

- Ne pas ajouter la permission `tabs` (trop large ; avertissement à l'installation).
- Ne pas déplacer LinkedIn vers les `host_permissions` obligatoires (rompt la
  posture de permission minimale et de respect de la vie privée ; la demande en
  contexte est la règle).
- Ne pas demander l'origine LinkedIn depuis le service worker.
- Ne pas cliquer sur le texte localisé « Tout afficher » ni naviguer dans l'onglet
  source.
- Ne pas appeler d'API LinkedIn non documentées ni dépendre du HTML récupéré du
  shell applicatif ; l'extraction utilise la page de détail authentifiée et rendue.
- Ne pas fusionner le sous-ensemble visible de la carte de résumé en repli après un
  timeout ou un échec de parsing de la page de détail.
