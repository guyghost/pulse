<script lang="ts">
  import { enhance } from '$app/forms';
  import { env } from '$env/dynamic/public';

  let { data } = $props();

  const chromeStoreUrl = env.PUBLIC_CHROME_STORE_URL || '#install';
  const isPremium = $derived(data.profile?.subscription_status === 'premium');

  const formattedDate = $derived(
    data.profile?.subscription_period_end
      ? new Date(data.profile.subscription_period_end).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
      : null
  );
</script>

<svelte:head>
  <title>Mon compte — MissionPulse</title>
  <meta name="description" content="Gérez votre compte et votre abonnement MissionPulse." />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!-- Navigation -->
<nav class="nav" aria-label="Navigation principale">
  <div class="container nav__container">
    <a href="/" class="nav__brand" aria-label="MissionPulse - Accueil">
      <div class="nav__logo">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="36"
          height="36"
          viewBox="0 0 128 128"
        >
          <rect width="128" height="128" rx="28" fill="#0F172A" />
          <circle
            cx="64"
            cy="64"
            r="30"
            fill="none"
            stroke="#3B82F6"
            stroke-width="1.5"
            opacity="0.25"
          />
          <polyline
            points="18,64 38,64 46,44 54,84 64,38 74,78 82,52 90,64 110,64"
            fill="none"
            stroke="#22D3EE"
            stroke-width="5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      <span class="nav__title">Mission<span>Pulse</span></span>
    </a>

    <div class="nav__actions">
      <form method="POST" action="?/logout" use:enhance>
        <button type="submit" class="btn btn--ghost">Déconnexion</button>
      </form>
    </div>
  </div>
</nav>

<main class="dashboard-page">
  <div class="container">
    <div class="dashboard-card glass-card">
      <!-- Account header -->
      <div class="dashboard-section">
        <h1>Mon compte</h1>
        <p class="dashboard-email">{data.session?.user?.email ?? ''}</p>
      </div>

      <div class="dashboard-divider"></div>

      <!-- Subscription -->
      <div class="dashboard-section">
        <h2>Abonnement</h2>

        <div class="subscription-card">
          <div class="subscription-info">
            <span class="subscription-badge" class:subscription-badge--premium={isPremium}>
              {#if isPremium}
                ⚡ Premium
              {:else}
                Gratuit
              {/if}
            </span>

            {#if isPremium}
              <p class="subscription-detail">
                Votre abonnement est actif
                {#if formattedDate}
                  jusqu'au {formattedDate}
                {/if}.
              </p>
              <a
                href="https://missionpulse.lemonsqueezy.com/billing"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn--secondary btn--sm"
              >
                Gérer via Lemon Squeezy
              </a>
            {:else}
              <p class="subscription-detail">
                Passez à Premium pour débloquer la génération IA de candidatures et le scoring sémantique avancé.
              </p>
              <a
                href="https://missionpulse.lemonsqueezy.com/checkout"
                class="btn btn--primary"
                target="_blank"
                rel="noopener noreferrer"
              >
                Passer à Premium — 10€/an
              </a>
            {/if}
          </div>
        </div>
      </div>

      <div class="dashboard-divider"></div>

      <!-- Extension -->
      <div class="dashboard-section">
        <h2>Extension Chrome</h2>
        <p class="dashboard-description">
          Installez l'extension pour activer le scan automatique des missions freelance et le scoring IA.
        </p>
        <a
          href={chromeStoreUrl}
          class="btn btn--secondary"
          target="_blank"
          rel="noopener noreferrer"
        >
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Installer l'extension
        </a>
      </div>

      <div class="dashboard-divider"></div>

      <!-- Logout -->
      <div class="dashboard-section dashboard-section--footer">
        <form method="POST" action="?/logout" use:enhance>
          <button type="submit" class="btn btn--ghost">Déconnexion</button>
        </form>
      </div>
    </div>
  </div>
</main>

<style>
  .dashboard-page {
    min-height: 100vh;
    padding: calc(68px + var(--space-2xl)) var(--space-lg) var(--space-2xl);
  }

  .dashboard-card {
    max-width: 640px;
    width: 100%;
    margin: 0 auto;
    padding: var(--space-2xl);
  }

  .dashboard-card:hover {
    transform: none;
    box-shadow: none;
  }

  .dashboard-section {
    padding: var(--space-lg) 0;
  }

  .dashboard-section:first-child {
    padding-top: 0;
  }

  .dashboard-section--footer {
    padding-bottom: 0;
  }

  .dashboard-section h1 {
    font-size: 1.75rem;
    font-weight: 700;
    margin-bottom: var(--space-xs);
  }

  .dashboard-section h2 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: var(--space-md);
  }

  .dashboard-email {
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
  }

  .dashboard-description {
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
    line-height: 1.7;
    margin-bottom: var(--space-lg);
  }

  .dashboard-divider {
    height: 1px;
    background: var(--glass-border);
  }

  .subscription-card {
    padding: var(--space-lg);
    background: var(--color-surface-dark);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
  }

  .subscription-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .subscription-badge {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: var(--space-xs) var(--space-md);
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-full);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .subscription-badge--premium {
    background: rgba(16, 185, 129, 0.1);
    border-color: rgba(16, 185, 129, 0.2);
    color: var(--color-accent-emerald);
  }

  .subscription-detail {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    line-height: 1.6;
  }
</style>
