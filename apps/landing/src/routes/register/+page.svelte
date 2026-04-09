<script lang="ts">
  import { enhance } from '$app/forms';

  let { data } = $props();

  const initialEmail = data.email ?? '';
  const initialSuccess = data.success ?? false;

  let formError = $state<string | undefined>(undefined);
  let email = $state(initialEmail);
  let success = $state(initialSuccess);
  let successEmail = $state(initialEmail);
  let submitting = $state(false);
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
      <a href="/" class="btn btn--ghost">← Accueil</a>
    </div>
  </div>
</nav>

<main class="auth-page">
  <div class="container">
    <div class="auth-card glass-card">
      {#if success}
        <div class="auth-success">
          <div class="auth-success__icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h1>Vérifiez votre email</h1>
          <p>
            Un email de confirmation a été envoyé à
            <strong>{successEmail}</strong>.
            Cliquez sur le lien pour activer votre compte.
          </p>
          <a href="/login" class="btn btn--primary">Aller à la connexion</a>
        </div>
      {:else}
        <div class="auth-card__header">
          <h1>Créer un compte</h1>
          <p>Commencez avec MissionPulse gratuitement</p>
        </div>

        <form
          class="auth-form"
          method="POST"
          action="?/register"
          use:enhance={() => {
            submitting = true;
            formError = undefined;
            return async ({ result, update }) => {
              submitting = false;
              if (result.type === 'failure' && result.data?.error) {
                formError = result.data.error as string;
              }
              if (result.type === 'success' && result.data?.success) {
                success = true;
                successEmail = result.data.email as string;
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
              placeholder="Minimum 8 caractères"
              required
              autocomplete="new-password"
              minlength="8"
            />
          </div>

          <div class="form-group">
            <label for="confirmPassword" class="form-label">Confirmer le mot de passe</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              class="form-input"
              placeholder="••••••••"
              required
              autocomplete="new-password"
              minlength="8"
            />
          </div>

          <button type="submit" class="btn btn--primary auth-submit" disabled={submitting}>
            {#if submitting}
              Création…
            {:else}
              Créer mon compte
            {/if}
          </button>
        </form>

        <div class="auth-footer">
          <p>
            Déjà un compte ?
            <a href="/login">Se connecter</a>
          </p>
        </div>
      {/if}
    </div>
  </div>
</main>

<style>
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: calc(68px + var(--space-2xl)) var(--space-lg) var(--space-2xl);
  }

  .auth-card {
    max-width: 440px;
    width: 100%;
    margin: 0 auto;
    padding: var(--space-2xl);
  }

  .auth-card:hover {
    transform: none;
    box-shadow: none;
  }

  .auth-card__header {
    text-align: center;
    margin-bottom: var(--space-xl);
  }

  .auth-card__header h1 {
    font-size: 1.75rem;
    font-weight: 700;
    margin-bottom: var(--space-sm);
  }

  .auth-card__header p {
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
  }

  .auth-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .form-input {
    width: 100%;
    padding: var(--space-md);
    background: var(--color-surface-dark);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
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
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.15);
  }

  .form-error {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md);
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: var(--radius-md);
    color: var(--color-accent-red);
    font-size: 0.875rem;
  }

  .auth-submit {
    width: 100%;
    margin-top: var(--space-sm);
  }

  .auth-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .auth-footer {
    text-align: center;
    margin-top: var(--space-xl);
    padding-top: var(--space-lg);
    border-top: 1px solid var(--glass-border);
  }

  .auth-footer p {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  .auth-footer a {
    color: var(--color-accent-cyan);
    font-weight: 500;
  }

  .auth-success {
    text-align: center;
    padding: var(--space-xl) 0;
  }

  .auth-success__icon {
    width: 64px;
    height: 64px;
    margin: 0 auto var(--space-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.2);
    border-radius: 50%;
    color: var(--color-accent-emerald);
  }

  .auth-success h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: var(--space-md);
  }

  .auth-success p {
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
    line-height: 1.7;
    margin-bottom: var(--space-xl);
  }

  .auth-success strong {
    color: var(--color-text-primary);
  }
</style>
