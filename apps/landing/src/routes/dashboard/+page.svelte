<script lang="ts">
  import { enhance } from '$app/forms';
  import { env } from '$env/dynamic/public';
  import {
    CREDIT_PACKS,
    PREMIUM_MONTHLY_CREDITS,
    formatPrice,
    type CreditPackId,
  } from '$lib/credits';

  let { data } = $props();

  type AccountTone = 'success' | 'attention' | 'incident';

  interface AccountDecision {
    tone: AccountTone;
    badge: string;
    title: string;
    impact: string;
    action: string;
    evidence: string[];
    primaryAction: 'premium' | 'credits' | 'extension';
    primaryLabel: string;
  }

  const chromeStoreUrl = env.PUBLIC_CHROME_STORE_URL || '#install';
  const isPremium = $derived(data.profile?.subscription_status === 'premium');
  const creditBalance = $derived(data.profile?.credit_balance ?? 0);
  const recommendedPackId = $derived<CreditPackId>(
    creditBalance < 3 ? 'pro' : creditBalance < 10 ? 'starter' : 'power'
  );
  const recommendedPack = $derived(CREDIT_PACKS[recommendedPackId]);
  const accountDecision = $derived(getAccountDecision(isPremium, creditBalance));
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

  function buyRecommendedPack() {
    if (!recommendedPack) {
      checkoutError = 'Aucun pack de credits disponible pour le moment.';
      return;
    }
    startCreditCheckout(recommendedPack.id);
  }

  function getAccountDecision(hasPremium: boolean, credits: number): AccountDecision {
    if (!hasPremium) {
      return {
        tone: 'attention',
        badge: 'Action utile',
        title: "Le compte est actif, Premium n'est pas encore active",
        impact:
          "Le scan reste disponible gratuitement. Le suivi pipeline, le radar TJM et les generations restent limites.",
        action:
          "Prochaine action: installer l'extension, puis passer a Premium si vous voulez piloter les candidatures ici.",
        evidence: ['Plan gratuit', `${credits} credits disponibles`, 'Extension a connecter'],
        primaryAction: 'premium',
        primaryLabel: 'Passer a Premium',
      };
    }

    if (credits === 0) {
      return {
        tone: 'incident',
        badge: 'Blocage',
        title: 'Aucun credit disponible pour generer les prochaines actions',
        impact:
          'Les pitchs, messages recruteur et resumes CV seront bloques jusqu a la prochaine recharge.',
        action: `Prochaine action: acheter le pack ${CREDIT_PACKS.pro.label} pour reprendre les generations.`,
        evidence: ['Premium actif', '0 credit disponible', 'Generation bloquee'],
        primaryAction: 'credits',
        primaryLabel: 'Recharger maintenant',
      };
    }

    if (credits < 3) {
      return {
        tone: 'attention',
        badge: 'Risque proche',
        title: 'Credits bas avant les prochaines candidatures',
        impact:
          'Votre solde peut suffire pour une action, mais pas pour traiter une serie de missions qualifiees.',
        action: `Prochaine action: ajouter le pack ${CREDIT_PACKS.pro.label} avant un scan complet.`,
        evidence: ['Premium actif', `${credits} credits disponibles`, 'Risque de friction'],
        primaryAction: 'credits',
        primaryLabel: 'Recharger',
      };
    }

    return {
      tone: 'success',
      badge: 'Normal',
      title: 'Compte pret pour les actions Premium',
      impact:
        "Les credits et l'abonnement sont disponibles. Le travail utile se passe maintenant dans l'extension.",
      action: 'Prochaine action: ouvrir l extension, scanner, qualifier puis synchroniser.',
      evidence: ['Premium actif', `${credits} credits disponibles`, 'Pipeline exploitable'],
      primaryAction: 'extension',
      primaryLabel: "Ouvrir l'extension",
    };
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

      <!-- Operational status -->
      <div class="dashboard-section">
        <div
          class="ops-card"
          class:ops-card--success={accountDecision.tone === 'success'}
          class:ops-card--attention={accountDecision.tone === 'attention'}
          class:ops-card--incident={accountDecision.tone === 'incident'}
        >
          <div class="ops-card__header">
            <div>
              <p class="ops-card__eyebrow">Etat operationnel</p>
              <h2>{accountDecision.title}</h2>
            </div>
            <span
              class="ops-badge"
              class:ops-badge--success={accountDecision.tone === 'success'}
              class:ops-badge--incident={accountDecision.tone === 'incident'}
            >
              {accountDecision.badge}
            </span>
          </div>

          <div class="ops-card__story">
            <p class="ops-card__label">Impact</p>
            <p class="ops-card__description">{accountDecision.impact}</p>
          </div>
          <div class="ops-card__story">
            <p class="ops-card__label">Action recommandee</p>
            <p class="ops-card__next">{accountDecision.action}</p>
          </div>

          <div class="ops-metrics" aria-label="Signaux operationnels du compte">
            {#each accountDecision.evidence as signal, index}
              <div>
                <span>Signal {index + 1}</span>
                <strong>{signal}</strong>
              </div>
            {/each}
          </div>

          <div class="ops-card__actions">
            {#if accountDecision.primaryAction === 'premium'}
              <a
                href="https://missionpulse.lemonsqueezy.com/checkout"
                class="btn btn--primary btn--sm"
                target="_blank"
                rel="noopener noreferrer"
              >
                {accountDecision.primaryLabel}
              </a>
            {:else if accountDecision.primaryAction === 'credits'}
              <button
                type="button"
                class="btn btn--primary btn--sm"
                disabled={checkoutLoadingPack !== null}
                onclick={buyRecommendedPack}
              >
                {checkoutLoadingPack === recommendedPack.id
                  ? 'Preparation...'
                  : accountDecision.primaryLabel}
              </button>
            {/if}
            <a
              href={chromeStoreUrl}
              class="btn btn--secondary btn--sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ouvrir l'extension
            </a>
          </div>
        </div>
      </div>

      <div class="dashboard-divider"></div>

      <!-- Plan & credits -->
      <div class="dashboard-section">
        <div class="section-heading">
          <div>
            <p class="section-heading__eyebrow">Investigation</p>
            <h2>Credits et abonnement</h2>
          </div>
          <span class="section-heading__hint">Details a ouvrir si vous devez acheter</span>
        </div>

        <div class="subscription-card">
          <div class="subscription-info">
            <div class="subscription-topline">
              <span class="subscription-badge" class:subscription-badge--premium={isPremium}>
                {#if isPremium}
                  Premium
                {:else}
                  Gratuit
                {/if}
              </span>
              <div class="credit-balance">
                <span>{creditBalance}</span>
                <p>credits disponibles</p>
              </div>
            </div>

            {#if isPremium}
              <p class="subscription-detail">
                Votre abonnement est actif
                {#if formattedDate}
                  jusqu'au {formattedDate}
                {/if}. Bonus inclus: {PREMIUM_MONTHLY_CREDITS} crédits par mois.
              </p>
              <div class="subscription-actions">
                <a
                  href="https://missionpulse.lemonsqueezy.com/billing"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn btn--secondary btn--sm"
                >
                  Gerer via Lemon Squeezy
                </a>
              </div>
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

        <details class="credit-drawer" open={!isPremium || creditBalance < 3}>
          <summary>
            <span>Choisir un pack de credits</span>
            <small>Recommandation: {recommendedPack.label}</small>
          </summary>

          <div class="credit-packs" aria-label="Packs de credits">
            {#each data.creditPacks as pack}
              <article class="credit-pack" class:credit-pack--recommended={pack.id === recommendedPackId}>
                <div>
                  <div class="credit-pack__topline">
                    <p class="credit-pack__label">{pack.label}</p>
                    {#if pack.id === recommendedPackId}
                      <span>Recommande</span>
                    {/if}
                  </div>
                  <h3>{pack.credits} credits</h3>
                  <p class="credit-pack__unit">
                    {formatPrice(Math.round(pack.priceCents / pack.credits))} / generation
                  </p>
                </div>
                <div class="credit-pack__footer">
                  <strong>{formatPrice(pack.priceCents)}</strong>
                  <button
                    type="button"
                    class="btn btn--primary btn--sm"
                    disabled={checkoutLoadingPack === pack.id}
                    title={`Acheter ${pack.credits} credits ${pack.label}`}
                    onclick={() => startCreditCheckout(pack.id)}
                  >
                    {checkoutLoadingPack === pack.id ? 'Preparation...' : 'Acheter'}
                  </button>
                </div>
              </article>
            {/each}
          </div>
        </details>
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

  .ops-card {
    padding: var(--spacing-24);
    background: var(--color-surface-white);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-large);
  }

  .ops-card--success {
    background: color-mix(in srgb, var(--color-blueprint-blue) 6%, var(--color-surface-white));
    border-color: color-mix(in srgb, var(--color-blueprint-blue) 16%, var(--color-border-light));
  }

  .ops-card--attention {
    background: color-mix(in srgb, var(--color-status-yellow) 10%, var(--color-surface-white));
    border-color: color-mix(in srgb, var(--color-status-orange) 22%, var(--color-border-light));
  }

  .ops-card--incident {
    background: color-mix(in srgb, var(--color-status-red) 8%, var(--color-surface-white));
    border-color: color-mix(in srgb, var(--color-status-red) 24%, var(--color-border-light));
  }

  .ops-card__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-16);
  }

  .ops-card__eyebrow {
    margin: 0 0 var(--spacing-4);
    color: var(--color-text-subtle);
    font-size: 0.6875rem;
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .ops-card h2 {
    margin: 0;
    font-size: 1.125rem;
    line-height: 1.3;
  }

  .ops-badge {
    flex-shrink: 0;
    padding: var(--spacing-4) var(--spacing-12);
    border: 1px solid color-mix(in srgb, var(--color-status-orange) 28%, var(--color-border-light));
    border-radius: var(--radius-md);
    color: var(--color-status-orange);
    font-size: 0.75rem;
    font-weight: var(--font-weight-medium);
  }

  .ops-badge--success {
    border-color: color-mix(in srgb, var(--color-blueprint-blue) 24%, var(--color-border-light));
    color: var(--color-blueprint-blue);
  }

  .ops-badge--incident {
    border-color: color-mix(in srgb, var(--color-status-red) 28%, var(--color-border-light));
    color: var(--color-status-red);
  }

  .ops-card__story {
    margin-top: var(--spacing-16);
  }

  .ops-card__label {
    margin: 0 0 var(--spacing-4);
    color: var(--color-text-subtle);
    font-size: 0.6875rem;
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .ops-card__description {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .ops-card__next {
    margin: 0;
    color: var(--color-text-primary);
    font-size: 0.875rem;
    font-weight: var(--font-weight-medium);
    line-height: 1.6;
  }

  .ops-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--spacing-8);
    margin-top: var(--spacing-16);
  }

  .ops-metrics div {
    padding: var(--spacing-12);
    background: var(--color-surface-white);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
  }

  .ops-metrics span {
    display: block;
    color: var(--color-text-subtle);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .ops-metrics strong {
    display: block;
    margin-top: var(--spacing-4);
    color: var(--color-text-primary);
    font-size: 0.875rem;
  }

  .ops-card__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-8);
    margin-top: var(--spacing-16);
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

  .section-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-16);
    margin-bottom: var(--spacing-16);
  }

  .section-heading h2 {
    margin: 0;
  }

  .section-heading__eyebrow {
    margin: 0 0 var(--spacing-4);
    color: var(--color-text-subtle);
    font-size: 0.6875rem;
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .section-heading__hint {
    max-width: 180px;
    color: var(--color-text-subtle);
    font-size: 0.75rem;
    line-height: 1.5;
    text-align: right;
  }

  .subscription-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
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

  .subscription-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-8);
  }

  .credit-balance {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-8);
    text-align: right;
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

  .credit-drawer {
    margin-top: var(--spacing-16);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-large);
    background: var(--color-surface-white);
  }

  .credit-drawer summary {
    display: flex;
    min-height: 56px;
    cursor: pointer;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-16);
    padding: var(--spacing-16);
    color: var(--color-text-primary);
    font-size: 0.875rem;
    font-weight: var(--font-weight-medium);
    list-style: none;
  }

  .credit-drawer summary::-webkit-details-marker {
    display: none;
  }

  .credit-drawer summary::after {
    content: '+';
    flex: 0 0 auto;
    color: var(--color-text-subtle);
    font-size: 1.25rem;
    line-height: 1;
  }

  .credit-drawer[open] summary::after {
    content: '-';
  }

  .credit-drawer small {
    color: var(--color-text-subtle);
    font-size: 0.75rem;
    font-weight: var(--font-weight-regular);
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
    padding: 0 var(--spacing-16) var(--spacing-16);
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

  .credit-pack--recommended {
    border-color: color-mix(in srgb, var(--color-blueprint-blue) 26%, var(--color-border-light));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-blueprint-blue) 10%, transparent);
  }

  .credit-pack__topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-8);
  }

  .credit-pack__topline span {
    border: 1px solid color-mix(in srgb, var(--color-blueprint-blue) 24%, var(--color-border-light));
    border-radius: var(--radius-md);
    color: var(--color-blueprint-blue);
    font-size: 0.6875rem;
    line-height: 1;
    padding: var(--spacing-4) var(--spacing-8);
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
    .dashboard-card {
      padding: var(--spacing-24);
    }

    .ops-card__header,
    .section-heading,
    .subscription-topline,
    .credit-drawer summary {
      flex-direction: column;
      align-items: flex-start;
    }

    .section-heading__hint,
    .credit-balance {
      max-width: none;
      text-align: left;
    }

    .ops-metrics {
      grid-template-columns: 1fr;
    }

    .credit-packs {
      grid-template-columns: 1fr;
    }
  }
</style>
