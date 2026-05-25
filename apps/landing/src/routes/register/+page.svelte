<script lang="ts">
  import { passkeyErrorMessage, requestPasskeyAccountSetup } from '$lib/auth/passkey';

  let formError = $state<string | undefined>(undefined);
  let email = $state('');
  let linkSent = $state(false);
  let submitting = $state(false);

  async function handlePasskeyRegistration(event: SubmitEvent) {
    event.preventDefault();
    submitting = true;
    formError = undefined;

    try {
      await requestPasskeyAccountSetup(email);
      linkSent = true;
    } catch (error) {
      formError = passkeyErrorMessage(error);
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Inscription — MissionPulse</title>
  <meta name="description" content="Créez votre compte MissionPulse." />
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
      <a href="/" class="btn btn--ghost">← Accueil</a>
    </div>
  </div>
</nav>

<main class="auth-page">
  <div class="container">
    <div class="auth-card glass-card">
      {#if linkSent}
        <div class="auth-card__header">
          <h1>Vérifiez votre email</h1>
          <p>Le lien securise ouvrira la derniere etape de creation du passkey.</p>
        </div>

        <div class="auth-message" data-testid="register-link-sent">
          <p>
            Nous avons envoye un lien a <strong>{email}</strong>. Ouvrez-le dans ce navigateur pour
            enregistrer votre passkey et acceder au dashboard.
          </p>
        </div>
      {:else}
        <div class="auth-card__header">
          <h1>Créer un compte</h1>
          <p>Demarrez sans mot de passe, puis finalisez avec un passkey</p>
        </div>

        <form class="auth-form" onsubmit={handlePasskeyRegistration}>
          {#if formError}
            <div class="form-error" role="alert" data-testid="register-passkey-error">
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
              autocomplete="email webauthn"
              data-testid="register-email"
            />
          </div>

          <button
            type="submit"
            class="btn btn--primary auth-submit"
            disabled={submitting}
            data-testid="register-passkey-submit"
          >
            {#if submitting}
              Envoi du lien...
            {:else}
              Recevoir mon lien de creation
            {/if}
          </button>

          <p class="auth-note">
            Le lien valide votre email, puis MissionPulse demandera le passkey natif de votre
            appareil avant d'ouvrir le dashboard.
          </p>
        </form>
      {/if}

      <div class="auth-footer">
        <p>
          Déjà un compte ?
          <a href="/login">Se connecter</a>
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
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
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

  .auth-message {
    padding: var(--spacing-24);
    background: color-mix(in srgb, var(--color-blueprint-blue) 8%, var(--color-surface-white));
    border: 1px solid color-mix(in srgb, var(--color-blueprint-blue) 18%, var(--color-border-light));
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    line-height: 1.7;
  }

  .auth-message p {
    margin: 0;
  }

  .auth-message strong {
    color: var(--color-text-primary);
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
