<script lang="ts">
  import { Icon } from '@pulse/ui';
  import { Button } from '@pulse/ui';
  import type { PremiumStatus } from '$lib/core/types/auth';

  const {
    isAuthenticated,
    email,
    premiumStatus,
    premiumExpiresAt,
    isLoading,
    error,
    onLogin,
    onSignup,
    onLogout,
    onOpenDashboard,
  }: {
    isAuthenticated: boolean;
    email: string | null;
    premiumStatus: PremiumStatus;
    premiumExpiresAt: number | null;
    isLoading: boolean;
    error: string | null;
    onLogin: (email: string, password: string) => void;
    onSignup: (email: string, password: string) => void;
    onLogout: () => void;
    onOpenDashboard?: () => void;
  } = $props();

  let formEmail = $state('');
  let formPassword = $state('');
  let showPassword = $state(false);
  const canSubmit = $derived(formEmail.length > 0 && formPassword.length >= 6);

  const formattedExpiry = $derived(
    premiumExpiresAt
      ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(
          new Date(premiumExpiresAt)
        )
      : null
  );

  const badgeConfig = $derived.by(() => {
    switch (premiumStatus) {
      case 'premium':
        return { text: 'Premium', classes: 'bg-blueprint-blue/10 text-blueprint-blue' };
      case 'expired':
        return { text: 'Expiré', classes: 'bg-status-red/10 text-status-red' };
      default:
        return { text: 'Gratuit', classes: 'bg-subtle-gray text-text-secondary' };
    }
  });

  function handleLogin() {
    if (!canSubmit || isLoading) {
      return;
    }
    onLogin(formEmail, formPassword);
  }

  function handleSignup() {
    if (!canSubmit || isLoading) {
      return;
    }
    onSignup(formEmail, formPassword);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && canSubmit && !isLoading) {
      handleLogin();
    }
  }
</script>

<div class="section-card rounded-xl p-5">
  <!-- Header -->
  <div class="flex items-center gap-3">
    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6">
      <Icon name="user" size={14} class="text-blueprint-blue" />
    </div>
    <div>
      <h3 class="text-sm font-medium text-text-primary">Compte</h3>
      {#if !isAuthenticated}
        <p class="mt-0.5 text-xs text-text-subtle">
          Connectez-vous pour débloquer les fonctionnalités premium.
        </p>
      {/if}
    </div>
  </div>

  {#if isAuthenticated}
    <div class="mt-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-full border border-border-light bg-page-canvas"
          >
            <Icon name="user" size={13} class="text-text-subtle" />
          </div>
          <span class="text-sm text-text-primary">{email}</span>
        </div>
        <span
          class="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-medium {badgeConfig.classes}"
        >
          {#if premiumStatus === 'premium'}<Icon name="crown" size={10} />{/if}
          {badgeConfig.text}
        </span>
      </div>

      {#if premiumStatus === 'premium' && formattedExpiry}
        <div class="rounded-lg bg-blueprint-blue/5 px-3 py-2">
          <p class="text-xs text-blueprint-blue">Abonnement actif jusqu'au {formattedExpiry}</p>
        </div>
      {:else if premiumStatus === 'free'}
        <div class="rounded-lg bg-page-canvas px-3 py-2">
          <p class="text-xs text-text-subtle">
            Passez à Premium pour une IA de scoring améliorée.
            {#if onOpenDashboard}
              <button
                class="text-blueprint-blue hover:text-blueprint-blue/80"
                onclick={onOpenDashboard}
              >
                En savoir plus →
              </button>
            {/if}
          </p>
        </div>
      {:else if premiumStatus === 'expired'}
        <div class="rounded-lg bg-status-red/5 px-3 py-2">
          <p class="text-xs text-status-red">
            Abonnement expiré.
            {#if onOpenDashboard}
              <button
                class="text-blueprint-blue hover:text-blueprint-blue/80"
                onclick={onOpenDashboard}
              >
                Renouveler →
              </button>
            {/if}
          </p>
        </div>
      {/if}

      <div class="pt-1">
        <button
          class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-status-red transition-colors hover:bg-status-red/5"
          onclick={onLogout}
          disabled={isLoading}
        >
          <Icon name="log-out" size={12} />
          Se déconnecter
        </button>
      </div>
    </div>
  {:else}
    <form
      class="mt-4 space-y-2.5"
      onsubmit={(e) => {
        e.preventDefault();
        handleLogin();
      }}
    >
      <div class="relative">
        <div class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          <Icon name="mail" size={13} class="text-text-muted" />
        </div>
        <input
          type="email"
          placeholder="Email"
          class="w-full rounded-lg border border-border-light bg-page-canvas py-2.5 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-blueprint-blue/30"
          bind:value={formEmail}
          autocomplete="email"
        />
      </div>
      <div class="relative">
        <div class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          <Icon name="lock" size={13} class="text-text-muted" />
        </div>
        <input
          type={showPassword ? 'text' : 'password'}
          placeholder="Mot de passe"
          class="w-full rounded-lg border border-border-light bg-page-canvas py-2.5 pl-9 pr-10 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-blueprint-blue/30"
          bind:value={formPassword}
          autocomplete="current-password"
        />
        <button
          type="button"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-secondary"
          onclick={() => (showPassword = !showPassword)}
          tabindex={-1}
        >
          <Icon name={showPassword ? 'eye-off' : 'eye'} size={13} />
        </button>
      </div>

      {#if error}
        <div class="rounded-lg bg-status-red/5 px-3 py-2">
          <p class="text-xs text-status-red">{error}</p>
        </div>
      {/if}

      <div class="flex gap-2 pt-1">
        <Button variant="primary" onclick={handleLogin} disabled={!canSubmit || isLoading}>
          {#snippet children()}
            {#if isLoading}<Icon name="loader" size={13} class="animate-spin" />{/if}
            Se connecter
          {/snippet}
        </Button>
        <Button variant="ghost" onclick={handleSignup} disabled={!canSubmit || isLoading}>
          {#snippet children()}Créer un compte{/snippet}
        </Button>
      </div>
    </form>
  {/if}
</div>
