<script lang="ts">
  import { env } from '$env/dynamic/public';
  import { tick } from 'svelte';
  import { theme } from '$lib/theme.svelte';

  type ShowcaseStep = 'scanner' | 'qualifier' | 'comparer' | 'postuler';

  let mobileMenuOpen = $state(false);
  let scrolled = $state(false);
  let activeShowcaseStep = $state<ShowcaseStep>('scanner');
  let showDeferredContent = $state(false);
  let shortcutsOpen = $state(false);

  const chromeStoreUrl = env.PUBLIC_CHROME_STORE_URL || '#install';
  const showcaseSteps: { id: ShowcaseStep; label: string }[] = [
    { id: 'scanner', label: 'Scanner' },
    { id: 'qualifier', label: 'Qualifier' },
    { id: 'comparer', label: 'Décider' },
    { id: 'postuler', label: 'Convertir' },
  ];

  type FeatureTier = 'free' | 'premium';
  const featureMatrix: { label: string; tier: FeatureTier; note?: string }[] = [
    { label: 'Feed unique, 5 plateformes dédupliquées', tier: 'free' },
    { label: 'Score stack, TJM, remote, séniorité', tier: 'free' },
    {
      label: 'Score sémantique (IA locale Chrome)',
      tier: 'free',
      note: 'Quand Gemini Nano est disponible',
    },
    { label: 'Comparateur et shortlist quotidienne', tier: 'free' },
    { label: 'Radar TJM marché par stack', tier: 'premium' },
    { label: 'Suivi de candidatures (pipeline, notes, relances)', tier: 'premium' },
    { label: 'Assistant profil et CV', tier: 'premium' },
    {
      label: 'Génération pitch, message et résumé CV',
      tier: 'premium',
      note: '1 crédit = 1 génération',
    },
    { label: 'Dashboard connecté (synchronisation optionnelle)', tier: 'premium' },
  ];

  const platforms: { name: string; logo: string }[] = [
    { name: 'Free-Work', logo: '/logos/free-work.png' },
    { name: 'LeHibou', logo: '/logos/lehibou.png' },
    { name: 'Hiway', logo: '/logos/hiway.png' },
    { name: 'Collective', logo: '/logos/collective.png' },
    { name: 'Cherry Pick', logo: '/logos/cherry-pick.png' },
  ];

  $effect(() => {
    function onScroll() {
      scrolled = window.scrollY > 50;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });

  $effect(() => {
    const id = window.setTimeout(() => {
      showDeferredContent = true;
    }, 0);

    return () => window.clearTimeout(id);
  });

  $effect(() => {
    if (!showDeferredContent) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -50px 0px', threshold: 0.1 }
    );

    document.querySelectorAll('.fade-in').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  });

  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }

  type Shortcuts = {
    key: string;
    label: string;
    action: () => void;
  };

  const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? 'auto' : 'smooth');

  function jumpTo(id: string): void {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
  }

  function focusInstallCta(): void {
    const target = document.querySelector<HTMLElement>('#install [data-primary-cta]');
    if (target) {
      target.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
      target.focus({ preventScroll: true });
    } else {
      jumpTo('install');
    }
  }

  let lastFocused: HTMLElement | null = null;
  let shortcutsCardEl = $state<HTMLDivElement>();

  async function openShortcuts(): Promise<void> {
    lastFocused = (document.activeElement as HTMLElement) ?? null;
    shortcutsOpen = true;
    await tick();
    // Move focus into the dialog after the DOM flushes; tick() ensures the
    // card is rendered and visible before focus, avoiding a race with Svelte's
    // deferred effect scheduling.
    shortcutsCardEl?.focus({ preventScroll: true });
  }

  function closeShortcuts(): void {
    shortcutsOpen = false;
    if (lastFocused) {
      lastFocused.focus({ preventScroll: true });
      lastFocused = null;
    }
  }

  function toggleShortcuts(): void {
    if (shortcutsOpen) {
      closeShortcuts();
    } else {
      openShortcuts();
    }
  }

  function isTypingTarget(el: EventTarget | null): boolean {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  // Keep Tab focus cycling inside the dialog while it is open.
  function trapTab(event: KeyboardEvent, container: HTMLElement): void {
    const focusable = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) {
      event.preventDefault();
      container.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !container.contains(active)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
    } else if (active === last || !container.contains(active)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  const shortcuts: Shortcuts[] = [
    { key: '/', label: 'Installer MissionPulse', action: focusInstallCta },
    { key: 's', label: 'Aller au workflow', action: () => jumpTo('workflow') },
    { key: 'p', label: 'Aller aux offres', action: () => jumpTo('plans') },
    { key: '?', label: 'Afficher les raccourcis', action: toggleShortcuts },
  ];

  $effect(() => {
    function onKeydown(event: KeyboardEvent) {
      // Ignore when the user is typing somewhere, or using OS/browser modifiers.
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      // While the help overlay is open, only Esc and ? close it; Tab is trapped
      // inside the dialog. All other global shortcuts are blocked.
      if (shortcutsOpen) {
        if (event.key === 'Escape' || event.key === '?') {
          event.preventDefault();
          closeShortcuts();
        } else if (event.key === 'Tab') {
          const overlay = document.querySelector('.shortcuts-overlay');
          if (overlay instanceof HTMLElement) {
            trapTab(event, overlay);
          } else {
            event.preventDefault();
          }
        }
        return;
      }
      if (event.key === 'Escape') {
        if (mobileMenuOpen) {
          closeMobileMenu();
        }
        return;
      }
      const match = shortcuts.find((s) => s.key === event.key);
      if (match) {
        event.preventDefault();
        match.action();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });
</script>

<svelte:head>
  <title>MissionPulse — Transformez votre veille mission en pipeline</title>
  <meta name="title" content="MissionPulse — Transformez votre veille mission en pipeline" />
  <meta
    name="description"
    content="MissionPulse est le radar quotidien des freelances tech français: 5 plateformes, 1 feed scoré, les meilleures missions à traiter maintenant."
  />
  <meta
    name="keywords"
    content="missions freelance java, mission freelance spring boot, TJM développeur freelance, Free-Work LeHibou alternative, extension Chrome freelance, radar missions tech"
  />
  <meta name="author" content="MissionPulse" />
  <meta name="robots" content="index, follow" />

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://missionpulse.app/" />
  <meta property="og:title" content="MissionPulse — Transformez votre veille mission en pipeline" />
  <meta
    property="og:description"
    content="5 plateformes, 1 feed scoré, les meilleures missions à traiter maintenant. Gratuit pour scanner, Premium pour suivre, négocier et candidater."
  />
  <meta property="og:image" content="https://missionpulse.app/og-image.png" />
  <meta property="og:locale" content="fr_FR" />
  <meta property="og:site_name" content="MissionPulse" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="https://missionpulse.app/" />
  <meta
    name="twitter:title"
    content="MissionPulse — Transformez votre veille mission en pipeline"
  />
  <meta
    name="twitter:description"
    content="Le radar quotidien des freelances tech français: Free-Work, LeHibou, Hiway, Collective et Cherry Pick dans un feed scoré."
  />
  <meta name="twitter:image" content="https://missionpulse.app/og-image.png" />
</svelte:head>

<!-- Skip to content (keyboard users) -->
<a href="#hero" class="skip-link">Aller au contenu</a>

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
      <span class="nav__title">MissionPulse</span>
    </a>

    <ul class="nav__menu">
      <li><a href="#workflow" class="nav__link">Workflow</a></li>
      <li><a href="#shortlist" class="nav__link">Shortlist</a></li>
      <li><a href="#features" class="nav__link">Fonctionnalités</a></li>
      <li><a href="#plans" class="nav__link">Offres</a></li>
    </ul>

    <div class="nav__actions">
      <button
        class="theme-toggle"
        aria-label="Basculer le thème"
        title={theme.preference === 'light'
          ? 'Clair'
          : theme.preference === 'dark'
            ? 'Sombre'
            : 'Système'}
        onclick={() => theme.cycle()}
      >
        {#if theme.resolved === 'dark'}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        {:else}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" /><path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" /><path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
          </svg>
        {/if}
      </button>
      <a href={chromeStoreUrl} class="btn btn--ghost btn--sm">Installer</a>
      <button
        class="nav__mobile-toggle"
        aria-label="Menu"
        aria-expanded={mobileMenuOpen}
        aria-controls="mobile-menu"
        onclick={toggleMobileMenu}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
    </div>
  </div>

  <div
    id="mobile-menu"
    class="nav__mobile-menu"
    class:is-open={mobileMenuOpen}
    aria-hidden={!mobileMenuOpen}
  >
    <ul>
      <li><a href="#workflow" onclick={closeMobileMenu}>Workflow</a></li>
      <li><a href="#shortlist" onclick={closeMobileMenu}>Shortlist</a></li>
      <li>
        <a href="#features" onclick={closeMobileMenu}>Fonctionnalités</a>
      </li>
      <li>
        <a href="#plans" onclick={closeMobileMenu}>Offres</a>
      </li>
      <li>
        <a href={chromeStoreUrl} class="btn btn--primary" onclick={closeMobileMenu}>Installer</a>
      </li>
    </ul>
  </div>
</nav>

<!-- Hero Section -->
<section class="hero" id="hero">
  <div class="container hero__container">
    <div class="hero__content fade-in">
      <div class="hero__badge">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Radar quotidien · Scan gratuit
      </div>

      <h1 class="hero__title">
        5 plateformes.<br />1 feed scoré.<br /><span class="light-text">Zéro doublon.</span>
      </h1>

      <div class="hero__bottom-bar">
        <p class="hero__description">
          Free-Work, LeHibou, Hiway, Collective et Cherry Pick dans un seul feed, scoré selon votre
          stack, votre TJM et votre remote. Le dernier scan a remonté 42 missions, dont 8 à
          contacter maintenant.
        </p>

        <div class="hero__actions">
          <a href={chromeStoreUrl} class="btn btn--primary btn--lg"
            >Installer l'extension gratuite</a
          >
          <a href="#shortlist" class="btn btn--secondary btn--lg">Voir la shortlist quotidienne</a>
        </div>
      </div>

      <div class="hero__meta" aria-label="Positionnement MissionPulse">
        <span class="hero__meta-item">Développeurs 3+ ans</span>
        <span class="hero__meta-item">TJM 450-900€</span>
        <span class="hero__meta-item">France &amp; remote</span>
      </div>
    </div>
  </div>
</section>

{#if showDeferredContent}
  <!-- Product showcase -->
  <section class="product-showcase" id="workflow" aria-label="Aperçu de MissionPulse">
    <div class="container">
      <div class="showcase-shell fade-in">
        <div class="showcase-logos" aria-label="Plateformes scannées">
          <img src="/logos/free-work.png" alt="Free-Work" width="112" height="40" />
          <img src="/logos/lehibou.png" alt="LeHibou" width="112" height="40" />
          <img src="/logos/hiway.png" alt="Hiway" width="112" height="40" />
          <img src="/logos/collective.png" alt="Collective" width="112" height="40" />
          <img src="/logos/cherry-pick.png" alt="Cherry Pick" width="112" height="40" />
        </div>

        <p class="showcase-caption">
          Le feed gratuit prouve la valeur dès le premier scan: une mission 80+, un TJM compatible,
          une action immédiate. Premium ajoute le suivi, le radar TJM, le profil/CV et les
          générations par crédits.
        </p>

        <div class="showcase-tabs" aria-label="Étapes du workflow MissionPulse" role="tablist">
          {#each showcaseSteps as step}
            <button
              id={`showcase-tab-${step.id}`}
              class="showcase-tab"
              class:showcase-tab--active={activeShowcaseStep === step.id}
              type="button"
              role="tab"
              aria-selected={activeShowcaseStep === step.id}
              aria-controls="showcase-panel"
              onclick={() => (activeShowcaseStep = step.id)}
            >
              {step.label}
            </button>
          {/each}
        </div>

        <div
          id="showcase-panel"
          class="app-preview"
          role="tabpanel"
          aria-labelledby={`showcase-tab-${activeShowcaseStep}`}
          aria-label="Aperçu du side panel MissionPulse"
        >
          <div class="app-preview__topbar">
            <div>
              <p class="app-preview__eyebrow">Side panel</p>
              <h2 class="app-preview__title">
                {#if activeShowcaseStep === 'scanner'}
                  MissionPulse Feed
                {:else if activeShowcaseStep === 'qualifier'}
                  Pourquoi cette mission ?
                {:else if activeShowcaseStep === 'comparer'}
                  Dashboard de décision
                {:else}
                  Assistant candidature Premium
                {/if}
              </h2>
            </div>
            <div class="app-preview__actions" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>

          <div class="app-preview__toolbar">
            <span class="app-preview__tab app-preview__tab--active">
              {#if activeShowcaseStep === 'scanner'}
                Top missions
              {:else if activeShowcaseStep === 'qualifier'}
                Score détaillé
              {:else if activeShowcaseStep === 'comparer'}
                Premium
              {:else}
                Crédits IA
              {/if}
            </span>
            <span class="app-preview__pill">
              {#if activeShowcaseStep === 'scanner'}
                Scan terminé
              {:else if activeShowcaseStep === 'qualifier'}
                Grade A
              {:else if activeShowcaseStep === 'comparer'}
                Pipeline
              {:else}
                1 crédit
              {/if}
            </span>
            <span class="app-preview__toggle">Auto</span>
          </div>

          {#if activeShowcaseStep === 'scanner'}
            <div class="app-preview__body">
              <div class="score-flow" aria-label="Résumé du scan">
                <article class="score-card">
                  <span class="score-card__label">Trouvées</span>
                  <strong>42</strong>
                  <span>missions consolidées</span>
                </article>
                <article class="score-card">
                  <span class="score-card__label">Dédupliquées</span>
                  <strong>31</strong>
                  <span>opportunités uniques</span>
                </article>
                <article class="score-card score-card--highlight">
                  <span class="score-card__label">À contacter</span>
                  <strong>8</strong>
                  <span>scores supérieurs à 85</span>
                </article>
              </div>

              <div class="mission-list" aria-label="Missions recommandées">
                <div class="mission-list__header">
                  <span>Mission</span>
                  <span>Score</span>
                  <span>TJM</span>
                </div>
                <article class="mission-row">
                  <div>
                    <strong>Lead Svelte / TypeScript</strong>
                    <span>Free-Work · Remote hybride</span>
                  </div>
                  <mark>A</mark>
                  <span>720€</span>
                </article>
                <article class="mission-row">
                  <div>
                    <strong>Architecte Frontend</strong>
                    <span>LeHibou · Paris</span>
                  </div>
                  <mark>A</mark>
                  <span>780€</span>
                </article>
                <article class="mission-row">
                  <div>
                    <strong>Fullstack Platform</strong>
                    <span>Hiway · Remote</span>
                  </div>
                  <mark>A</mark>
                  <span>690€</span>
                </article>
                <article class="mission-row">
                  <div>
                    <strong>Consultant Design System</strong>
                    <span>Collective · Lyon</span>
                  </div>
                  <mark>B</mark>
                  <span>650€</span>
                </article>
              </div>
            </div>
          {:else if activeShowcaseStep === 'qualifier'}
            <div class="app-preview__body app-preview__body--detail">
              <div class="score-flow" aria-label="Facteurs de qualification">
                <article class="score-card score-card--highlight">
                  <span class="score-card__label">Stack</span>
                  <strong>A</strong>
                  <span>Svelte, TypeScript, design system</span>
                </article>
                <article class="score-card">
                  <span class="score-card__label">TJM</span>
                  <strong>+120€</strong>
                  <span>au-dessus de votre minimum</span>
                </article>
                <article class="score-card">
                  <span class="score-card__label">Contrainte</span>
                  <strong>Remote</strong>
                  <span>compatible avec vos préférences</span>
                </article>
              </div>

              <div class="insight-panel" aria-label="Explication du score">
                <h3>Pourquoi elle matche</h3>
                <p>
                  MissionPulse transforme le scoring en critères lisibles pour décider vite, sans
                  ouvrir chaque annonce une par une.
                </p>
                <div class="insight-meter">
                  <span>Compétences clés</span>
                  <strong>A</strong>
                  <div><i class="insight-meter__bar insight-meter__bar--95"></i></div>
                </div>
                <div class="insight-meter">
                  <span>TJM & durée</span>
                  <strong>A</strong>
                  <div><i class="insight-meter__bar insight-meter__bar--90"></i></div>
                </div>
                <div class="insight-meter">
                  <span>Localisation</span>
                  <strong>A</strong>
                  <div><i class="insight-meter__bar insight-meter__bar--90"></i></div>
                </div>
                <ul class="insight-list">
                  <li>Annonce senior sans signaux de régie bas niveau.</li>
                  <li>Stack alignée avec votre profil prioritaire.</li>
                  <li>Client final et durée longue détectés.</li>
                </ul>
              </div>
            </div>
          {:else if activeShowcaseStep === 'comparer'}
            <div class="app-preview__body app-preview__body--wide">
              <div class="compare-board" aria-label="Comparaison de missions">
                <article class="compare-card compare-card--selected">
                  <span class="compare-card__rank">#1</span>
                  <h3>Lead Svelte</h3>
                  <p>Free-Work · Remote hybride</p>
                  <dl>
                    <div>
                      <dt>Score</dt>
                      <dd>A</dd>
                    </div>
                    <div>
                      <dt>TJM</dt>
                      <dd>720€</dd>
                    </div>
                    <div>
                      <dt>Durée</dt>
                      <dd>12 mois</dd>
                    </div>
                  </dl>
                </article>
                <article class="compare-card">
                  <span class="compare-card__rank">#2</span>
                  <h3>Architecte Frontend</h3>
                  <p>LeHibou · Paris</p>
                  <dl>
                    <div>
                      <dt>Score</dt>
                      <dd>A</dd>
                    </div>
                    <div>
                      <dt>TJM</dt>
                      <dd>780€</dd>
                    </div>
                    <div>
                      <dt>Durée</dt>
                      <dd>6 mois</dd>
                    </div>
                  </dl>
                </article>
                <article class="compare-card">
                  <span class="compare-card__rank">#3</span>
                  <h3>Fullstack Platform</h3>
                  <p>Hiway · Remote</p>
                  <dl>
                    <div>
                      <dt>Score</dt>
                      <dd>A</dd>
                    </div>
                    <div>
                      <dt>TJM</dt>
                      <dd>690€</dd>
                    </div>
                    <div>
                      <dt>Durée</dt>
                      <dd>9 mois</dd>
                    </div>
                  </dl>
                </article>
              </div>

              <div class="decision-panel" aria-label="Aide à la décision">
                <h3>Décision assistée</h3>
                <p>
                  Premium relie shortlist, TJM, profil et suivi pour arbitrer les meilleures pistes.
                </p>
                <div class="decision-row">
                  <span>Meilleur fit profil</span><strong>Lead Svelte</strong>
                </div>
                <div class="decision-row">
                  <span>Meilleur TJM</span><strong>Architecte Frontend</strong>
                </div>
                <div class="decision-row">
                  <span>Moins de friction</span><strong>Full remote</strong>
                </div>
              </div>
            </div>
          {:else}
            <div class="app-preview__body app-preview__body--detail">
              <div class="score-flow" aria-label="Checklist candidature">
                <article class="score-card score-card--highlight">
                  <span class="score-card__label">Contact</span>
                  <strong>Prêt</strong>
                  <span>pitch généré via crédit IA</span>
                </article>
                <article class="score-card">
                  <span class="score-card__label">CV</span>
                  <strong>Aligné</strong>
                  <span>mots-clés recommandés extraits</span>
                </article>
                <article class="score-card">
                  <span class="score-card__label">Suivi</span>
                  <strong>J+2</strong>
                  <span>prochaine action dans le pipeline</span>
                </article>
              </div>

              <div class="message-panel" aria-label="Message de candidature">
                <h3>Message de candidature</h3>
                <p>
                  Bonjour, votre mission Lead Svelte / TypeScript correspond fortement à mon
                  expérience design system et plateformes front complexes.
                </p>
                <p>
                  Disponible sous 2 semaines, TJM cible 720€, remote hybride possible. Je peux vous
                  partager deux références proches.
                </p>
                <div class="message-actions">
                  <span>Copier le message</span>
                  <span>Ouvrir l’annonce</span>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </section>

  <!-- Daily radar -->
  <section class="daily-radar section" id="shortlist" aria-labelledby="daily-radar-title">
    <div class="container">
      <div class="daily-radar__layout">
        <div class="daily-radar__content fade-in">
          <p class="daily-radar__eyebrow">Shortlist quotidienne</p>
          <h2 id="daily-radar-title" class="daily-radar__title">
            Commencez par les missions Java, Spring Boot et frontend senior qui valent un message
            aujourd'hui.
          </h2>
          <p class="daily-radar__desc">
            Chaque matin, MissionPulse sert le même réflexe produit: scanner les plateformes, isoler
            les annonces au bon TJM, puis décider quoi ouvrir, sauvegarder ou relancer.
          </p>
          <div class="daily-radar__actions">
            <a href={chromeStoreUrl} class="btn btn--primary btn--lg">Scanner mes plateformes</a>
            <a
              href="mailto:contact@missionpulse.app?subject=Shortlist%20quotidienne%20Java%20Spring%20Boot"
              class="btn btn--secondary btn--lg">Recevoir la shortlist</a
            >
          </div>
        </div>

        <div class="radar-board fade-in fade-in-delay-2" aria-label="Exemple de shortlist">
          <div class="radar-board__header">
            <span>Shortlist Java / Spring Boot</span>
            <strong>Ce matin</strong>
          </div>
          <article class="radar-row radar-row--hot">
            <div>
              <strong>Tech Lead Java / Spring Boot</strong>
              <span>Client final · Remote hybride · 12 mois</span>
            </div>
            <mark>92</mark>
            <span>780€</span>
          </article>
          <article class="radar-row">
            <div>
              <strong>Backend Kotlin / Kafka</strong>
              <span>ESN sélective · Paris · Démarrage rapide</span>
            </div>
            <mark>87</mark>
            <span>720€</span>
          </article>
          <article class="radar-row">
            <div>
              <strong>Fullstack TypeScript / Java</strong>
              <span>Scale-up · Full remote · Produit B2B</span>
            </div>
            <mark>84</mark>
            <span>690€</span>
          </article>
          <div class="radar-board__footer">
            <span>Action suivante</span>
            <strong>Ouvrir #1 et générer le pitch</strong>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Fonctionnalités -->
  <section class="features section" id="features">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title fade-in">Ce que vous obtenez</h2>
        <p class="section-subtitle fade-in fade-in-delay-1">
          Le gratuit couvre le scan et le scoring. Le premium ouvre la négociation, le suivi et la
          candidature.
        </p>
      </div>

      <ul class="feature-matrix fade-in fade-in-delay-1" aria-label="Capacités et offre de départ">
        {#each featureMatrix as row (row.label)}
          <li class="feature-matrix__row">
            <span class="feature-matrix__label">
              {row.label}
              {#if row.note}<span class="feature-matrix__note">{row.note}</span>{/if}
            </span>
            <span class={`feature-matrix__tier feature-matrix__tier--${row.tier}`}>
              {row.tier === 'free' ? 'Gratuit' : 'Premium'}
            </span>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <!-- Comment ça marche -->
  <section class="how-it-works section" id="how-it-works">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title fade-in">Démarrer en 3 minutes</h2>
        <p class="section-subtitle fade-in fade-in-delay-1">
          Installez, branchez vos sessions, le feed se remplit seul.
        </p>
      </div>

      <ol class="steps">
        <li class="step fade-in fade-in-delay-1">
          <span class="step__number" aria-hidden="true">1</span>
          <div class="step__content">
            <h3 class="step__title">Installez l'extension</h3>
            <p class="step__desc">
              Un clic depuis le Chrome Web Store. Compatible Chrome, Brave, Edge, Arc et Dia.
            </p>
          </div>
        </li>
        <li class="step fade-in fade-in-delay-2">
          <span class="step__number" aria-hidden="true">2</span>
          <div class="step__content">
            <h3 class="step__title">Configurez votre profil</h3>
            <p class="step__desc">
              Stack, TJM cible, localisation, séniorité, préférences remote. Le scoring s'adapte à
              vos critères.
            </p>
          </div>
        </li>
        <li class="step fade-in fade-in-delay-3">
          <span class="step__number" aria-hidden="true">3</span>
          <div class="step__content">
            <h3 class="step__title">Connectez-vous aux plateformes</h3>
            <p class="step__desc">
              Connectez-vous normalement à Free-Work, LeHibou, etc. MissionPulse réutilise vos
              sessions existantes.
            </p>
          </div>
        </li>
        <li class="step fade-in fade-in-delay-4">
          <span class="step__number" aria-hidden="true">4</span>
          <div class="step__content">
            <h3 class="step__title">Ouvrez le side panel</h3>
            <p class="step__desc">
              Les missions arrivent classées par score. Filtrez, comparez, préparez vos
              candidatures.
            </p>
          </div>
        </li>
      </ol>
    </div>
  </section>

  <!-- Offres -->
  <section class="plans section" id="plans">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title fade-in">Gratuit ou Premium ?</h2>
        <p class="section-subtitle fade-in fade-in-delay-1">
          Commencez par scanner localement dans l'extension, puis connectez votre compte quand vous
          voulez piloter la conversion dans le dashboard connecté.
        </p>
      </div>

      <div class="plans__grid" aria-label="Comparaison gratuit et Premium">
        <article class="plan-card fade-in fade-in-delay-1">
          <div class="plan-card__header">
            <span class="plan-card__name">Gratuit</span>
            <strong class="plan-card__price">0€</strong>
            <p>Pour valider la valeur en quelques minutes depuis l'extension Chrome.</p>
          </div>
          <ul class="plan-card__list">
            <li>Scan des 5 plateformes connectées depuis vos sessions navigateur.</li>
            <li>Feed centralisé avec recherche, filtres, tri, nouveautés et favoris.</li>
            <li>Scoring de pertinence, déduplication et comparaison des meilleures missions.</li>
            <li>Paramètres de profil, alertes, exports et sauvegarde locale.</li>
            <li>
              Scoring sémantique local via l'IA intégrée à Chrome (Gemini Nano), quand Chrome le
              permet.
            </li>
          </ul>
          <a href={chromeStoreUrl} class="btn btn--primary btn--lg">Installer gratuitement</a>
        </article>

        <article class="plan-card plan-card--featured fade-in fade-in-delay-2">
          <div class="plan-card__header">
            <span class="plan-card__name">Premium</span>
            <strong class="plan-card__price">12€<small>/mois</small></strong>
            <p>Pour piloter votre prospection comme un pipeline et produire vos candidatures.</p>
            <p class="plan-card__anchor">≈ 0,40€/jour — moins qu'un café par semaine.</p>
          </div>
          <ul class="plan-card__list">
            <li>
              Le dashboard connecté optionnel synchronise votre shortlist et vos candidatures entre
              vos appareils.
            </li>
            <li>Pages Premium dans l'extension: profil, CV, suivi de candidatures et radar TJM.</li>
            <li>Pipeline de candidature avec statuts, notes, prochaine action et historique.</li>
            <li>Assistant profil/CV pour garder vos informations cohérentes entre plateformes.</li>
            <li>
              20 contenus générés par mois (pitch, message recruteur ou résumé CV). 1 crédit = 1
              contenu.
            </li>
          </ul>
          <a
            href="https://missionpulse.lemonsqueezy.com/checkout"
            class="btn btn--primary btn--lg"
            target="_blank"
            rel="noopener noreferrer"
          >
            Passer à Premium
          </a>
        </article>
      </div>

      <div class="credits-strip fade-in fade-in-delay-3">
        <div>
          <span class="credits-strip__label">Crédits IA à la demande</span>
          <p>
            Besoin de générer plus de contenus ? Packs disponibles depuis votre compte: 5 crédits à
            4,90€, 15 crédits à 12,90€ ou 40 crédits à 29,90€.
          </p>
        </div>
        <a href="/dashboard" class="btn btn--secondary">Gérer mon compte et mes crédits</a>
      </div>
    </div>
  </section>

  <!-- Plateformes -->
  <section class="platforms section" id="platforms">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title fade-in">5 plateformes connectées</h2>
        <p class="section-subtitle fade-in fade-in-delay-1">
          Les principales sources de missions freelance tech en France, dans un seul feed.
        </p>
      </div>

      <ul class="platform-strip fade-in fade-in-delay-1" aria-label="Plateformes connectées">
        {#each platforms as p (p.name)}
          <li class="platform-strip__item">
            <img
              class="platform-strip__logo"
              src={p.logo}
              alt={p.name}
              width="40"
              height="40"
              loading="lazy"
            />
            <span class="platform-strip__name">{p.name}</span>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <!-- CTA -->
  <section class="cta section" id="install">
    <div class="container">
      <div class="cta__card fade-in">
        <div class="cta__content">
          <h2 class="cta__title">Prêt à installer votre radar mission ?</h2>
          <p class="cta__desc">
            Exécution navigateur, scan gratuit et zéro tracking publicitaire. Le compte sert au
            dashboard connecté optionnel, au radar TJM, au suivi de candidature, au profil/CV et aux
            crédits de génération; l'exécution plateforme reste dans votre navigateur.
          </p>
          <p class="cta__proof">
            <span class="cta__proof-dot" aria-hidden="true"></span>
            Le même classement à chaque scan — scoring déterministe, aucune opacité, aucun tirage aléatoire.
            Vos 5 plateformes, scannées depuis vos sessions existantes.
          </p>
          <a
            href={chromeStoreUrl}
            class="btn btn--primary btn--lg"
            target="_blank"
            rel="noopener noreferrer"
            data-primary-cta
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Installer sur Chrome Web Store
          </a>
        </div>
      </div>
    </div>
  </section>

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
          <a href="/privacy" class="footer__link">Confidentialité</a>
          <a
            href="https://github.com/guyghost/pulse"
            class="footer__link"
            target="_blank"
            rel="noopener noreferrer">GitHub</a
          >
          <a href="mailto:contact@missionpulse.app" class="footer__link">Contact</a>
        </nav>

        <p class="footer__stack">
          Svelte 5 · TypeScript · Chrome MV3 · Gemini Nano · Tailwind 4 · Architecture local-first
        </p>

        <p class="footer__shortcuts">
          <kbd>/</kbd> installer · <kbd>s</kbd> workflow · <kbd>p</kbd> offres · <kbd>?</kbd> aide
        </p>

        <p class="footer__copy">MissionPulse — 2026. Open source.</p>
      </div>
    </div>
  </footer>
{/if}

<!-- Keyboard shortcuts help -->
<div
  class="shortcuts-overlay"
  class:is-open={shortcutsOpen}
  role="dialog"
  aria-modal={shortcutsOpen ? 'true' : 'false'}
  aria-label="Raccourcis clavier"
  aria-hidden={!shortcutsOpen}
>
  <div class="shortcuts-card" bind:this={shortcutsCardEl} tabindex="-1">
    <div class="shortcuts-card__header">
      <h2 class="shortcuts-card__title">Raccourcis clavier</h2>
      <button class="shortcuts-card__close" aria-label="Fermer" onclick={closeShortcuts}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
    <ul class="shortcuts-list">
      {#each shortcuts as s (s.key)}
        <li>
          <kbd>{s.key}</kbd>
          <span>{s.label}</span>
        </li>
      {/each}
      <li>
        <kbd>Esc</kbd>
        <span>Fermer ce panneau ou le menu mobile</span>
      </li>
    </ul>
  </div>
</div>
