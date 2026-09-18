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
    <article class="privacy-content glass-card">
      <h1>Politique de confidentialité</h1>

      <p class="last-updated">
        Dernière mise à jour : <time datetime="2026-07-30">30 juillet 2026</time>
        (<span>2026-07-30</span>)
      </p>

      <p>
        MissionPulse collecte et traite les données suivantes pour faire fonctionner l'extension
        locale et, si vous connectez un compte MissionPulse, le dashboard connecté optionnel.
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
          <strong>Données synchronisées du dashboard</strong> — snapshots normalisés de missions, scores,
          pipeline de candidature, assets générés, profil CV canonique, historique d'import et état de
          synchronisation.
        </li>
        <li>
          <strong>Liaisons multi-compte</strong> — plateforme, libellé choisi, compte actif et hash pseudonymisé
          de la session détectée. Aucun cookie brut n'est synchronisé.
        </li>
        <li>
          <strong>Assistance de formulaire</strong> — après consentement explicite, les champs autorisés
          et suggestions restent dans une session éphémère locale le temps de la revue. Ils ne sont pas
          envoyés au dashboard.
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
          local et autres données légères.
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
          <strong>Supabase</strong> — si vous connectez un compte MissionPulse, le dashboard peut synchroniser
          des snapshots normalisés via Supabase pour vos missions, candidatures, assets générés, CV canonique,
          conflits et statuts de synchronisation.
        </li>
      </ul>

      <p>
        La suppression de l'extension entraîne la suppression des données associées à son stockage
        local. Le dashboard fournit aussi des contrôles d'export et de suppression des données
        connectées.
      </p>

      <h2>3. IA locale</h2>

      <p>
        MissionPulse peut utiliser les capacités d'IA locales au navigateur, notamment
        <strong>Gemini Nano</strong> via la Prompt API de Chrome, pour enrichir le scoring sémantique
        des missions et proposer des valeurs pour les champs autorisés d'un formulaire de candidature.
      </p>

      <ul>
        <li>Aucune clé API externe n'est requise dans l'expérience actuelle de l'application.</li>
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
        MissionPulse ne modifie, ne crée et ne supprime aucun cookie utilisateur. Ces accès servent
        uniquement au fonctionnement local de l'extension.
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
      </dl>

      <h2>6. Services externes contactés</h2>

      <p>
        MissionPulse peut communiquer directement depuis votre navigateur avec les domaines des
        plateformes supportées pour récupérer les missions, ainsi qu'avec les services strictement
        nécessaires à leur fonctionnement selon les permissions déclarées.
      </p>

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
