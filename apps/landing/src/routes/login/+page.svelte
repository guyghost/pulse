<script lang="ts">
  import { enhance } from '$app/forms';
  import { env } from '$env/dynamic/public';

  let { data } = $props();

  let formError = $state<string | undefined>(undefined);
  let email = $state('');
  let submitting = $state(false);

  const chromeStoreUrl = env.PUBLIC_CHROME_STORE_URL || '#install';

  $effect(() => {
    email = data.email ?? '';
  });
</script>

<svelte:head>
  <title>Connexion — MissionPulse</title>
  <meta name="description" content="Connectez-vous à votre compte MissionPulse." />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!-- Navigation -->
<nav class="nav" aria-label="Navigation principale">
  <div class="container nav__container">
    <a href="/" class="nav__brand" aria-label="MissionPulse - Accueil">
      <div class="nav__logo">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 128 128"
        >
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
      <a href="/" class="btn btn--ghost">← Accueil</a>
    </div>
  </div>
</nav>

<main class="auth-page">
  <div class="container">
    <div class="auth-card glass-card">
      <div class="auth-card__header">
        <h1>Connexion</h1>
        <p>Accédez à votre compte MissionPulse</p>
      </div>

      <form
        class="auth-form"
        method="POST"
        action="?/login"
        use:enhance={() => {
          submitting = true;
          formError = undefined;
          return async ({ result, update }) => {
            submitting = false;
            if (result.type === 'failure' && result.data?.error) {
              formError = result.data.error as string;
            }
            await update();
          };
        }}
      >
        {#if formError}
          <div class="form-error" role="alert">
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
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {formError}
          </div>
        {/if}

        <div class="form-group">
          <label for="email" class="form-label">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            class="form-input"
            placeholder="vous@exemple.com"
            bind:value={email}
            required
            autocomplete="email"
          />
        </div>

        <div class="form-group">
          <label for="password" class="form-label">Mot de passe</label>
          <input
            id="password"
            name="password"
            type="password"
            class="form-input"
            placeholder="••••••••"
            required
            autocomplete="current-password"
          />
        </div>

        <button type="submit" class="btn btn--primary auth-submit" disabled={submitting}>
          {#if submitting}
            Connexion…
          {:else}
            Se connecter
          {/if}
        </button>
      </form>

      <div class="auth-footer">
        <p>
          Pas de compte ?
          <a href="/register">Créer un compte</a>
        </p>
      </div>
    </div>
  </div>
</main>

<style>
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: calc(68px + var(--spacing-40)) var(--spacing-24) var(--spacing-40);
  }

  .auth-card {
    max-width: 440px;
    width: 100%;
    margin: 0 auto;
    padding: var(--spacing-40);
  }

  .auth-card:hover {
    transform: none;
    box-shadow: none;
  }

  .auth-card__header {
    text-align: center;
    margin-bottom: var(--spacing-32);
  }

  .auth-card__header h1 {
    font-size: 1.75rem;
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--spacing-8);
  }

  .auth-card__header p {
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
  }

  .auth-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-24);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .form-input {
    width: 100%;
    padding: var(--spacing-16);
    background: var(--color-surface-white);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-large);
    color: var(--color-text-primary);
    font-family: var(--font-sans);
    font-size: 0.9375rem;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .form-input::placeholder {
    color: var(--color-text-muted);
  }

  .form-input:focus {
    outline: none;
    border-color: var(--color-blueprint-blue);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-blueprint-blue) 15%, transparent);
  }

  .form-error {
    display: flex;
    align-items: center;
    gap: var(--spacing-8);
    padding: var(--spacing-16);
    background: color-mix(in srgb, var(--color-status-red) 10%, var(--color-surface-white));
    border: 1px solid color-mix(in srgb, var(--color-status-red) 20%, var(--color-border-light));
    border-radius: var(--radius-md);
    color: var(--color-status-red);
    font-size: 0.875rem;
  }

  .auth-submit {
    width: 100%;
    margin-top: var(--spacing-8);
  }

  .auth-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .auth-footer {
    text-align: center;
    margin-top: var(--spacing-32);
    padding-top: var(--spacing-24);
    border-top: 1px solid var(--color-border-light);
  }

  .auth-footer p {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  .auth-footer a {
    color: var(--color-blueprint-blue);
    font-weight: 500;
  }
</style>
