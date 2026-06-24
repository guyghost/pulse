<script lang="ts">
  import { goto } from '$app/navigation';
  import { passkeyErrorMessage, registerCurrentUserPasskey } from '$lib/auth/passkey';

  let formError = $state<string | undefined>(undefined);
  let submitting = $state(false);

  async function handlePasskeyRegistration() {
    submitting = true;
    formError = undefined;

    try {
      await registerCurrentUserPasskey();
      await goto('/dashboard');
    } catch (error) {
      formError = passkeyErrorMessage(error);
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Passkey — MissionPulse</title>
  <meta name="description" content="Finalisez votre compte MissionPulse avec un passkey." />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

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
  </div>
</nav>

<main class="auth-page">
  <div class="container">
    <div class="auth-card glass-card">
      <div class="auth-card__header">
        <h1>Créer votre passkey</h1>
        <p>Dernière étape avant votre dashboard MissionPulse</p>
      </div>

      <div class="auth-form">
        {#if formError}
          <div class="form-error" role="alert" data-testid="register-passkey-final-error">
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

        <button
          type="button"
          class="btn btn--primary auth-submit"
          disabled={submitting}
          onclick={handlePasskeyRegistration}
          data-testid="register-passkey-final-submit"
        >
          {#if submitting}
            Création du passkey...
          {:else}
            Finaliser avec un passkey
          {/if}
        </button>

        <p class="auth-note">
          Votre navigateur va ouvrir Touch ID, Windows Hello, une clé de sécurité ou votre
          gestionnaire de mots de passe.
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

  .auth-note {
    margin: 0;
    color: var(--color-text-subtle);
    font-size: 0.875rem;
    line-height: 1.6;
    text-align: center;
  }
</style>
