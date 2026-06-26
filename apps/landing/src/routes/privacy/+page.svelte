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

      <p class="last-updated">Dernière mise à jour : Mai 2026</p>

      <p>
        <strong>MissionPulse</strong> est une extension de navigateur conçue avec la confidentialité comme
        principe fondateur. Cette politique de confidentialité explique comment nous gérons vos données.
      </p>

      <h2>Principe fondamental</h2>

      <p>
        <strong>L'exécution plateforme reste locale dans votre navigateur.</strong>
        MissionPulse utilise vos sessions existantes pour lire les plateformes depuis l'extension, sans
        jamais stocker vos identifiants. Si vous connectez un compte MissionPulse, le dashboard peut synchroniser
        des snapshots normalisés via Supabase afin de retrouver vos missions, candidatures et profils
        CV entre appareils.
      </p>

      <h2>Données stockées localement</h2>

      <p>
        Les données suivantes restent stockées sur votre ordinateur pour le fonctionnement local de
        l'extension :
      </p>

      <ul>
        <li>
          <strong>Profil utilisateur</strong> — Vos compétences, TJM cible, localisation, préférences
          de télétravail et niveau de seniorité que vous configurez lors de l'onboarding.
        </li>
        <li>
          <strong>Missions scrapées</strong> — Les missions récupérées depuis Free-Work, LeHibou, Hiway,
          Collective et Cherry Pick sont stockées dans IndexedDB sur votre machine.
        </li>
        <li>
          <strong>États des connecteurs</strong> — Le statut de vos connexions aux différentes plateformes.
        </li>
        <li>
          <strong>Cache de scoring sémantique</strong> — Les scores de pertinence calculés par Gemini
          Nano sont mis en cache localement pour optimiser les performances.
        </li>
        <li>
          <strong>Préférences de l'extension</strong> — Vos paramètres de notification et de scan automatique.
        </li>
      </ul>

      <h2>Données synchronisées avec le dashboard</h2>

      <p>
        La synchronisation cloud est liée à votre compte MissionPulse. Elle sert uniquement à
        alimenter le dashboard connecté et peut inclure :
      </p>

      <ul>
        <li>
          <strong>Missions détectées</strong> — titre, client, source, TJM, localisation, score, lien
          public et métadonnées normalisées.
        </li>
        <li>
          <strong>Suivi de candidature</strong> — étape du pipeline, notes, dates de relance, historique
          d'événements et assets générés.
        </li>
        <li>
          <strong>Profil CV canonique</strong> — résumé, expériences, compétences, formation, liens et
          historique d'import LinkedIn.
        </li>
        <li>
          <strong>État de synchronisation</strong> — statut des connecteurs, erreurs typées et dernière
          synchronisation par appareil.
        </li>
      </ul>

      <p>
        Nous ne synchronisons pas les mots de passe, cookies, jetons de session des plateformes, ni
        le HTML brut LinkedIn. Les imports LinkedIn stockent uniquement les champs normalisés
        nécessaires au CV, un hash et des compteurs de champs.
      </p>

      <h2>Utilisation de Gemini Nano</h2>

      <p>
        MissionPulse utilise <strong>Gemini Nano</strong>, l'IA intégrée de Chrome, pour le scoring
        sémantique des missions. Cette IA fonctionne entièrement sur votre ordinateur (<em
          >on-device</em
        >). Aucune donnée n'est envoyée à Google ou à des serveurs externes pour cette
        fonctionnalité.
      </p>

      <h2>Accès aux plateformes tierces</h2>

      <p>
        MissionPulse accède aux sites Free-Work, LeHibou, Hiway, Collective et Cherry Pick pour
        scrapper les missions disponibles. Ces accès sont effectués via <strong
          >votre session navigateur existante</strong
        > — vous devez être connecté à ces plateformes. Nous ne stockons jamais vos identifiants de connexion.
      </p>

      <p>
        Les conditions d'utilisation de ces plateformes tierces s'appliquent à votre utilisation de
        leurs services. MissionPulse n'est pas affilié à ces plateformes.
      </p>

      <h2>Aucun tracking ni analytique</h2>

      <p>
        MissionPulse ne collecte pas de données publicitaires et n'intègre pas d'analytics
        comportementales. Nous n'utilisons pas :
      </p>

      <ul>
        <li>Google Analytics ou tout autre service d'analytique</li>
        <li>Cookies de tracking</li>
        <li>Fingerprinting</li>
        <li>Télémétrie</li>
        <li>Rapports d'erreur automatisés</li>
      </ul>

      <h2>Communications</h2>

      <p>
        Nous ne vous enverrons jamais d'emails marketing ou de notifications push commerciales. Les
        seules notifications que vous recevrez sont celles que vous avez explicitement configurées
        pour être alerté des nouvelles missions.
      </p>

      <h2>Code source ouvert</h2>

      <p>
        MissionPulse est un projet open source. Vous pouvez vérifier par vous-même comment
        l'extension fonctionne en consultant notre code source sur
        <a href="https://github.com/guyghost/pulse" target="_blank" rel="noopener noreferrer"
          >GitHub</a
        >. La transparence est notre meilleure garantie de respect de votre vie privée.
      </p>

      <h2>Suppression de vos données</h2>

      <p>Pour supprimer vos données locales :</p>

      <ul>
        <li>
          Désinstallez l'extension depuis Chrome (<code>chrome://extensions</code>)
        </li>
        <li>Les données IndexedDB et chrome.storage associées seront automatiquement supprimées</li>
      </ul>

      <p>
        Pour les données synchronisées avec le dashboard connecté, vous pouvez demander la
        suppression du compte et des données associées via
        <a href="mailto:privacy@missionpulse.app">privacy@missionpulse.app</a>.
      </p>

      <h2>Mises à jour de cette politique</h2>

      <p>
        Si nous modifions cette politique de confidentialité, nous en informerons les utilisateurs
        via une notification dans l'extension. Les changements significatifs nécessiteront votre
        consentement explicite.
      </p>

      <h2>Contact</h2>

      <p>
        Pour toute question concernant cette politique de confidentialité ou vos données, vous
        pouvez nous contacter à :
        <a href="mailto:privacy@missionpulse.app">privacy@missionpulse.app</a>
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
