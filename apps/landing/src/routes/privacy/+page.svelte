<script lang="ts">
  let scrolled = $state(false);

  $effect(() => {
    function onScroll() {
      scrolled = window.scrollY > 50;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });
</script>

<svelte:head>
  <title>Politique de confidentialité — MissionPulse</title>
  <meta name="title" content="Politique de confidentialité — MissionPulse" />
  <meta
    name="description"
    content="Politique de confidentialité de MissionPulse. Exécution locale dans le navigateur, synchronisation cloud optionnelle pour le dashboard connecté, sans identifiants plateforme."
  />
  <meta name="robots" content="noindex, nofollow" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://missionpulse.app/privacy" />
  <meta property="og:title" content="Politique de confidentialité — MissionPulse" />
  <meta
    property="og:description"
    content="Politique de confidentialité de MissionPulse. Exécution locale, sync dashboard optionnelle, zéro tracking publicitaire."
  />
</svelte:head>

<!-- Navigation -->
<nav class="nav" class:nav--scrolled={scrolled} aria-label="Navigation principale">
  <div class="container nav__container">
    <a href="/" class="nav__brand" aria-label="MissionPulse - Accueil">
      <div class="nav__logo">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 128 128">
          <polyline
            points="18,64 38,64 46,44 54,84 64,38 74,78 82,52 90,64 110,64"
            fill="none"
            stroke="var(--color-text-primary)"
            stroke-width="8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      <span class="nav__title">Mission<span>Pulse</span></span>
    </a>

    <ul class="nav__menu">
      <li><a href="/#features" class="nav__link">Fonctionnalités</a></li>
      <li><a href="/#how-it-works" class="nav__link">Comment ça marche</a></li>
      <li><a href="/#platforms" class="nav__link">Plateformes</a></li>
    </ul>

    <div class="nav__actions">
      <a href="/#install" class="btn btn--primary btn--sm">Installer</a>
    </div>
  </div>
</nav>

<!-- Privacy Content -->
<main class="privacy-page">
  <div class="container">
    <article class="privacy-content">
      <h1>Politique de confidentialité</h1>

      <p class="last-updated">
        Dernière mise à jour : <time datetime="2026-10-06">6 octobre 2026</time>
        (<span>2026-10-06</span>)
      </p>

      <p>
        MissionPulse collecte et traite les données suivantes pour faire fonctionner l'extension
        locale et, si vous connectez un compte MissionPulse, le dashboard connecté optionnel.
      </p>

      <p>
        <strong>Version 0.2.4 de l'extension (Chrome Web Store)</strong> : elle ne propose pas la connexion
        d'un compte MissionPulse et n'envoie aucune donnée à un serveur MissionPulse. Les éléments marqués
        « compte connecté » ci-dessous ne s'appliquent qu'au site missionpulse.app et à une future version
        de l'extension.
      </p>

      <h2>1. Données collectées</h2>

      <ul>
        <li>
          <strong>Profil utilisateur</strong> — prénom, intitulé de poste, compétences, TJM cible, préférences
          de remote et séniorité, renseignés lors de l'onboarding et dans les paramètres.
        </li>
        <li>
          <strong>Missions</strong> — titre, description, TJM, localisation, source, date de publication
          et métadonnées de scoring, extraites depuis les plateformes connectées.
        </li>
        <li>
          <strong>Préférences</strong> — intervalle de scan, connecteurs activés, seuils de notification,
          paramètres d'analyse locale.
        </li>
        <li>
          <strong>Données locales de fonctionnement</strong> — favoris, missions masquées, missions déjà
          vues, cache sémantique local, historique TJM et état des connecteurs.
        </li>
        <li>
          <strong>Données synchronisées du dashboard</strong> (compte connecté) — snapshots normalisés
          de missions, scores, pipeline de candidature, assets générés, profil CV canonique, historique
          d'import et état de synchronisation.
        </li>
        <li>
          <strong>Liaisons multi-compte</strong> (compte connecté) — plateforme, libellé choisi, compte
          actif et hash pseudonymisé de la session détectée. Aucun cookie brut n'est synchronisé.
        </li>
        <li>
          <strong>Assistance de formulaire</strong> — après consentement explicite, les champs autorisés
          et suggestions restent dans une session éphémère locale le temps de la revue. Ils ne sont pas
          envoyés au dashboard.
        </li>
        <li>
          <strong>Classification de missions (optionnelle)</strong> — uniquement si vous enregistrez
          votre propre clé Vercel AI Gateway dans les paramètres, le titre (200 caractères max), les
          technologies, le mode de travail et la description (1 500 caractères max) des missions
          enregistrées pas encore classées sont envoyés à Vercel AI Gateway pour être catégorisés,
          jusqu'à 25 missions par scan par défaut (réglable de 0 à 100) ; cela peut inclure des
          missions récupérées lors de scans précédents. Votre profil n'est pas envoyé. La clé reste
          dans
          <code>chrome.storage.local</code>.
        </li>
      </ul>

      <p>
        <strong>L'exécution plateforme reste locale dans votre navigateur.</strong>
        La synchronisation cloud est optionnelle et limitée aux données produit normalisées nécessaires
        au dashboard connecté.
      </p>

      <h2>2. Stockage</h2>

      <ul>
        <li>
          <strong>chrome.storage.local</strong> — paramètres, favoris, missions masquées, cache sémantique
          local, clé Vercel AI Gateway facultative et autres données légères.
        </li>
        <li>
          <strong>IndexedDB</strong> — profil, missions scrapées, historique TJM, états de connecteurs
          et données plus volumineuses.
        </li>
        <li>
          <strong>Stockage de session</strong> — certains états temporaires de scan ou d'interface peuvent
          être gardés localement pendant l'exécution.
        </li>
        <li>
          <strong>Supabase</strong> (compte connecté, indisponible dans l'extension 0.2.4) — si vous connectez
          un compte MissionPulse, le dashboard peut synchroniser des snapshots normalisés via Supabase
          pour vos missions, candidatures, assets générés, CV canonique, conflits et statuts de synchronisation.
        </li>
      </ul>

      <p>
        La suppression de l'extension entraîne la suppression des données associées à son stockage
        local. Le dashboard fournit aussi des contrôles d'export et de suppression des données
        connectées.
      </p>

      <h2>3. IA locale et classification optionnelle</h2>

      <p>
        MissionPulse peut utiliser les capacités d'IA locales au navigateur, notamment
        <strong>Gemini Nano</strong> via la Prompt API de Chrome, pour enrichir le scoring sémantique
        des missions et proposer des valeurs pour les champs autorisés d'un formulaire de candidature.
      </p>

      <ul>
        <li>
          Aucune clé API externe n'est requise : les fonctions d'IA actives par défaut sont locales.
        </li>
        <li>
          Exception optionnelle : si vous saisissez votre propre clé Vercel AI Gateway, la
          classification des missions envoie le contenu des annonces décrit en section 1 à Vercel AI
          Gateway, avec la conservation des données désactivée dans la requête. Sans clé, ce service
          reste inactif. Le traitement par Vercel est régi par la politique de confidentialité de
          Vercel.
        </li>
        <li>Les scores sémantiques sont mis en cache localement pour limiter les recalculs.</li>
        <li>
          Si l'IA locale n'est pas disponible, l'application continue de fonctionner avec son
          scoring de base.
        </li>
        <li>
          L'assistance de formulaire s'exécute dans un Worker local dédié, exige un consentement
          explicite et une validation champ par champ.
        </li>
        <li>
          MissionPulse ne soumet jamais le formulaire et n'utilise aucun fallback cloud sans un
          nouveau consentement explicite.
        </li>
      </ul>

      <h2>4. Cookies et sessions navigateur</h2>

      <p>
        MissionPulse peut accéder en lecture seule aux cookies ou aux sessions navigateur
        nécessaires pour détecter l'état de connexion sur les plateformes supportées et récupérer
        les missions accessibles à l'utilisateur.
      </p>

      <p>Plateformes actuellement supportées :</p>
      <ul>
        <li><strong>Free-Work</strong> (<code>www.free-work.com</code>)</li>
        <li><strong>LeHibou</strong> (<code>*.lehibou.com</code>)</li>
        <li><strong>Hiway</strong> (<code>hiway-missions.fr</code>)</li>
        <li><strong>Cherry Pick</strong> (<code>app.cherry-pick.io</code>)</li>
      </ul>

      <p>
        MissionPulse ne modifie, ne crée et ne supprime aucun cookie utilisateur. Dans la version
        0.2.4 :
      </p>

      <ul>
        <li>
          <strong>LeHibou</strong> — l'extension vérifie la présence de votre cookie de session
          LeHibou puis joint les cookies du domaine lehibou.com (tous sous-domaines confondus) aux
          seules requêtes qu'elle envoie à l'API LeHibou (<code>api.lehibou.com</code>), pour lire
          les missions qui vous sont accessibles. Pour cela, l'en-tête Cookie est placé
          temporairement dans une règle réseau dynamique (<code>declarativeNetRequest</code>)
          supprimée après la requête et au redémarrage de l'extension ; si le navigateur
          s'interrompt pendant un scan, cette règle peut subsister jusqu'au redémarrage suivant.
        </li>
        <li>
          <strong>LinkedIn</strong> (import déclenché par vous) — l'extension vérifie seulement la présence
          du cookie de session LinkedIn.
        </li>
        <li>
          <strong>Cherry Pick</strong> — l'extension ne lit pas vos cookies ; comme lors d'une visite
          normale, le navigateur peut joindre vos cookies Cherry Pick aux requêtes envoyées à Cherry Pick.
        </li>
        <li>
          <strong>Hiway</strong> — aucune session n'est requise et l'extension ne lit pas de cookies ;
          le navigateur peut joindre d'éventuels cookies existants du domaine Supabase de Hiway.
        </li>
        <li><strong>Free-Work</strong> — requêtes envoyées sans cookies.</li>
      </ul>

      <p>
        Aucun cookie n'est envoyé à MissionPulse ni à un service extérieur à la plateforme
        concernée.
      </p>

      <p>
        Nous ne synchronisons pas les mots de passe, cookies, jetons de session des plateformes, ni
        le HTML brut LinkedIn. Les imports LinkedIn stockent uniquement les champs normalisés
        nécessaires au CV, un hash et des compteurs de champs.
      </p>

      <h2>5. Permissions</h2>

      <dl>
        <dt>sidePanel</dt>
        <dd>Affiche le panneau latéral contenant le feed, le dashboard TJM et les paramètres.</dd>
        <dt>storage</dt>
        <dd>Sauvegarde locale des préférences, caches et données de fonctionnement.</dd>
        <dt>cookies</dt>
        <dd>Détection de session sur les plateformes supportées lorsque c'est nécessaire.</dd>
        <dt>scripting / activeTab</dt>
        <dd>
          Import LinkedIn et assistance de formulaire déclenchés explicitement par l'utilisateur.
        </dd>
        <dt>alarms</dt>
        <dd>Planification des cycles de scan automatiques à intervalles réguliers.</dd>
        <dt>notifications</dt>
        <dd>Alertes lors de la détection de nouvelles missions pertinentes.</dd>
        <dt>declarativeNetRequest</dt>
        <dd>Application de règles réseau temporaires nécessaires à certains connecteurs.</dd>
        <dt>identity</dt>
        <dd>
          Connexion future du Copilot au compte MissionPulse ; inutilisée dans l'extension 0.2.4.
        </dd>
      </dl>

      <h2>6. Services externes contactés</h2>

      <p>
        MissionPulse peut communiquer directement depuis votre navigateur avec les domaines des
        plateformes supportées pour récupérer les missions, ainsi qu'avec les services strictement
        nécessaires à leur fonctionnement selon les permissions déclarées. Dans la version 0.2.4 :
      </p>

      <ul>
        <li>
          <strong>Plateformes</strong> — <code>www.free-work.com</code>, <code>*.lehibou.com</code>,
          <code>hiway-missions.fr</code>, <code>app.cherry-pick.io</code>, avec vos mots-clés de
          recherche.
        </li>
        <li>
          <strong>Supabase de Hiway</strong> (<code>jhgjtlkfewuiiofxfrvh.supabase.co</code>) — API
          publique appartenant à Hiway, d'où proviennent les missions Hiway. Ce n'est pas un serveur
          MissionPulse.
        </li>
        <li>
          <strong>Vercel AI Gateway</strong> (<code>ai-gateway.vercel.sh</code>) — uniquement avec
          votre propre clé (section 3).
        </li>
        <li>
          <strong>Service de favicons Google</strong> (<code>www.google.com/s2/favicons</code>) —
          affichage des icônes des plateformes ; seul le nom de domaine de la plateforme est
          transmis.
        </li>
        <li>
          <strong>Pas de serveur MissionPulse</strong> — <code>copilot.missionpulse.app</code> est
          déclaré dans le manifest. L'interface de la version 0.2.4 n'émet aucune requête vers ce
          domaine ; le code de reprise ou de suppression du Copilot ne peut le contacter qu'avec une
          session Copilot déjà ouverte (conservée dans <code>chrome.storage.session</code>, effacée
          à la fermeture du navigateur), qui ne peut pas être créée dans la version 0.2.4. Aucun
          outil d'analytics ni de télémétrie n'est intégré.
        </li>
      </ul>

      <p>
        Aucun backend MissionPulse ne scrape les plateformes à votre place. Le dashboard connecté
        utilise Supabase uniquement pour stocker et synchroniser les données produit de votre
        compte.
      </p>

      <h2>7. Contact</h2>

      <p>
        Pour toute question relative à la confidentialité de vos données :
        <a href="mailto:privacy@missionpulse.app">privacy@missionpulse.app</a>.
      </p>

      <p>
        MissionPulse est un projet open-source. Le code est disponible pour audit sur
        <a href="https://github.com/guyghost/pulse" target="_blank" rel="noopener noreferrer"
          >GitHub</a
        >.
      </p>

      <p class="privacy-return">
        <a href="/" class="btn btn--secondary">← Retour à l'accueil</a>
      </p>
    </article>
  </div>
</main>

<!-- Footer -->
<footer class="footer">
  <div class="container">
    <div class="footer__content">
      <div class="footer__brand">
        <div class="footer__logo">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 128 128">
            <polyline
              points="18,64 38,64 46,44 54,84 64,38 74,78 82,52 90,64 110,64"
              fill="none"
              stroke="var(--color-text-primary)"
              stroke-width="8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <span class="footer__title">Mission<span>Pulse</span></span>
      </div>

      <nav class="footer__links" aria-label="Navigation footer">
        <a href="/privacy" class="footer__link" aria-current="page">Politique de confidentialité</a>
        <a
          href="https://github.com/guyghost/pulse"
          class="footer__link"
          target="_blank"
          rel="noopener noreferrer">GitHub</a
        >
        <a href="mailto:contact@missionpulse.app" class="footer__link">Contact</a>
      </nav>

      <p class="footer__copy">MissionPulse — 2026. Open source.</p>
    </div>
  </div>
</footer>
