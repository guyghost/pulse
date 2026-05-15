<script lang="ts">
  import { enhance } from '$app/forms';
  import { env } from '$env/dynamic/public';
  import { PREMIUM_MONTHLY_CREDITS, formatPrice, type CreditPackId } from '$lib/credits';

  let { data } = $props();

  const chromeStoreUrl = env.PUBLIC_CHROME_STORE_URL || '#install';
  const isPremium = $derived(data.profile?.subscription_status === 'premium');
  let checkoutError = $state<string | null>(null);
  let checkoutLoadingPack = $state<CreditPackId | null>(null);

  const formattedDate = $derived(
    data.profile?.subscription_period_end
      ? new Date(data.profile.subscription_period_end).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null
  );

  async function startCreditCheckout(packId: CreditPackId) {
    checkoutError = null;
    checkoutLoadingPack = packId;

    try {
      const response = await fetch('/api/checkout/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.url !== 'string') {
        checkoutError = result.error ?? 'Impossible de préparer le checkout.';
        return;
      }
      window.location.href = result.url;
    } catch {
      checkoutError = 'Impossible de préparer le checkout.';
    } finally {
      checkoutLoadingPack = null;
    }
  }
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

      <!-- Plan & credits -->
      <div class="dashboard-section">
        <h2>Plan et crédits</h2>

        <div class="subscription-card">
          <div class="subscription-info">
            <span class="subscription-badge" class:subscription-badge--premium={isPremium}>
              {#if isPremium}
                ⚡ Premium
              {:else}
                Gratuit
              {/if}
            </span>
            <div class="credit-balance">
              <span>{data.profile?.credit_balance ?? 0}</span>
              <p>crédits disponibles</p>
            </div>

            {#if isPremium}
              <p class="subscription-detail">
                Votre abonnement est actif
                {#if formattedDate}
                  jusqu'au {formattedDate}
                {/if}. Bonus inclus: {PREMIUM_MONTHLY_CREDITS} crédits par mois.
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
                Achetez des crédits pour générer des pitchs, messages recruteur et résumés CV.
                Premium ajoute {PREMIUM_MONTHLY_CREDITS} crédits par mois.
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

        {#if data.checkoutStatus === 'success'}
          <div class="checkout-status checkout-status--success">
            Paiement reçu. Le solde sera mis à jour dès confirmation Lemon Squeezy.
          </div>
        {:else if data.checkoutStatus === 'cancelled'}
          <div class="checkout-status">Checkout annulé. Aucun crédit n'a été ajouté.</div>
        {/if}

        {#if checkoutError}
          <div class="checkout-status checkout-status--error">{checkoutError}</div>
        {/if}

        <div class="credit-packs" aria-label="Packs de crédits">
          {#each data.creditPacks as pack}
            <article class="credit-pack">
              <div>
                <p class="credit-pack__label">{pack.label}</p>
                <h3>{pack.credits} crédits</h3>
                <p class="credit-pack__unit">
                  {formatPrice(Math.round(pack.priceCents / pack.credits))} / génération
                </p>
              </div>
              <div class="credit-pack__footer">
                <strong>{formatPrice(pack.priceCents)}</strong>
                <button
                  type="button"
                  class="btn btn--primary btn--sm"
                  disabled={checkoutLoadingPack === pack.id}
                  onclick={() => startCreditCheckout(pack.id)}
                >
                  {checkoutLoadingPack === pack.id ? 'Préparation...' : 'Acheter'}
                </button>
              </div>
            </article>
          {/each}
        </div>
      </div>

      <div class="dashboard-divider"></div>

      <!-- Extension -->
      <div class="dashboard-section">
        <h2>Extension Chrome</h2>
        <p class="dashboard-description">
          Installez l'extension pour activer le scan automatique des missions freelance et le
          scoring IA.
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
    padding: calc(68px + var(--spacing-40)) var(--spacing-24) var(--spacing-40);
  }

  .dashboard-card {
    max-width: 640px;
    width: 100%;
    margin: 0 auto;
    padding: var(--spacing-40);
  }

  .dashboard-card:hover {
    transform: none;
    box-shadow: none;
  }

  .dashboard-section {
    padding: var(--spacing-24) 0;
  }

  .dashboard-section:first-child {
    padding-top: 0;
  }

  .dashboard-section--footer {
    padding-bottom: 0;
  }

  .dashboard-section h1 {
    font-size: 1.75rem;
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--spacing-4);
  }

  .dashboard-section h2 {
    font-size: 1.25rem;
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--spacing-16);
  }

  .dashboard-email {
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
  }

  .dashboard-description {
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
    line-height: 1.7;
    margin-bottom: var(--spacing-24);
  }

  .dashboard-divider {
    height: 1px;
    background: var(--color-border-light);
  }

  .subscription-card {
    padding: var(--spacing-24);
    background: var(--color-surface-white);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-large);
  }

  .subscription-info {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-16);
  }

  .subscription-badge {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: var(--spacing-4) var(--spacing-16);
    background: var(--color-subtle-gray);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-full);
    font-size: 0.875rem;
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
  }

  .subscription-badge--premium {
    background: color-mix(in srgb, var(--color-blueprint-blue) 10%, var(--color-surface-white));
    border-color: color-mix(in srgb, var(--color-blueprint-blue) 20%, var(--color-border-light));
    color: var(--color-blueprint-blue);
  }

  .subscription-detail {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  .credit-balance {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-8);
  }

  .credit-balance span {
    font-size: 2rem;
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .credit-balance p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--color-text-subtle);
  }

  .checkout-status {
    margin-top: var(--spacing-16);
    padding: var(--spacing-12) var(--spacing-16);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: 0.875rem;
  }

  .checkout-status--success {
    border-color: color-mix(in srgb, var(--color-blueprint-blue) 24%, var(--color-border-light));
    color: var(--color-blueprint-blue);
  }

  .checkout-status--error {
    color: var(--color-status-red);
  }

  .credit-packs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--spacing-12);
    margin-top: var(--spacing-16);
  }

  .credit-pack {
    display: flex;
    min-height: 180px;
    flex-direction: column;
    justify-content: space-between;
    padding: var(--spacing-16);
    background: var(--color-surface-white);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-large);
  }

  .credit-pack__label,
  .credit-pack__unit {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-subtle);
  }

  .credit-pack h3 {
    margin: var(--spacing-8) 0;
    font-size: 1.25rem;
  }

  .credit-pack__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-8);
  }

  @media (max-width: 760px) {
    .credit-packs {
      grid-template-columns: 1fr;
    }
  }
</style>
