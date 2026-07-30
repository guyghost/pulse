<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props();
</script>

<svelte:head>
  <title>Connecter l’extension — MissionPulse</title>
  <meta
    name="description"
    content="Autorisez explicitement cette installation de l’extension MissionPulse."
  />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<nav class="nav" aria-label="Navigation principale">
  <div class="container nav__container">
    <a href="/" class="nav__brand" aria-label="MissionPulse - Accueil">
      <span class="nav__title">Mission<span>Pulse</span></span>
    </a>
  </div>
</nav>

<main class="auth-page">
  <div class="container">
    <div class="auth-card glass-card">
      <div class="auth-card__header">
        <h1>Connecter cette extension</h1>
        <p>
          Cette autorisation permet à l’extension de lire votre plan et ses droits. Elle ne partage
          ni vos cookies ni vos mots de passe de plateforme.
        </p>
      </div>

      {#if form?.approved}
        <div class="auth-message" role="status">
          Connexion approuvée. Revenez dans l’extension pour terminer.
        </div>
      {:else if form?.refused}
        <div class="form-error" role="status">Connexion refusée.</div>
      {:else if data.error || !data.link}
        <div class="form-error" role="alert">{data.error ?? 'Lien invalide.'}</div>
      {:else if data.link.state !== 'pending'}
        <div class="auth-message" role="status">
          Cette demande est déjà {data.link.state === 'approved' ? 'approuvée' : 'terminée'}.
        </div>
      {:else}
        <div class="auth-message">
          <p><strong>Compte :</strong> {data.accountEmail}</p>
          <p><strong>Installation :</strong> {data.link.installId}</p>
          <p>La demande expire à {new Date(data.link.expiresAt).toLocaleTimeString('fr-FR')}.</p>
        </div>

        <div class="auth-actions">
          <form method="POST" action="?/approve" use:enhance>
            <input type="hidden" name="linkId" value={data.link.id} />
            <button type="submit" class="btn btn--primary">Autoriser cette extension</button>
          </form>
          <form method="POST" action="?/refuse" use:enhance>
            <input type="hidden" name="linkId" value={data.link.id} />
            <button type="submit" class="btn btn--secondary">Refuser</button>
          </form>
        </div>
      {/if}
    </div>
  </div>
</main>

<style>
  .auth-page {
    min-height: calc(100vh - 72px);
    padding: var(--spacing-64) 0;
  }

  .auth-card {
    width: min(100%, 640px);
    margin: 0 auto;
    padding: var(--spacing-32);
  }

  .auth-card__header h1 {
    margin: 0 0 var(--spacing-12);
  }

  .auth-card__header p,
  .auth-message p {
    color: var(--color-text-subtle);
  }

  .auth-message,
  .form-error {
    margin-top: var(--spacing-24);
    padding: var(--spacing-16);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
    background: var(--color-surface-white);
  }

  .form-error {
    color: var(--color-status-red);
    border-color: color-mix(in srgb, var(--color-status-red) 35%, transparent);
  }

  .auth-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-12);
    margin-top: var(--spacing-24);
  }
</style>
