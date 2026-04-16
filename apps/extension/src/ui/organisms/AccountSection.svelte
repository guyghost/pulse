<script lang="ts">
  import Icon from '../atoms/Icon.svelte';
  import Button from '../atoms/Button.svelte';
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

  // Local form state
  let formEmail = $state('');
  let formPassword = $state('');
  let showPassword = $state(false);

  // Form validation
  let canSubmit = $derived(formEmail.length > 0 && formPassword.length >= 6);

  // Premium expiry formatting
  let formattedExpiry = $derived(
    premiumExpiresAt
      ? new Intl.DateTimeFormat('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(new Date(premiumExpiresAt))
      : null
  );

  // Premium badge config
  let badgeConfig = $derived.by(() => {
    switch (premiumStatus) {
      case 'premium':
        return {
          text: 'Premium ✦',
          classes:
            'border border-accent-emerald/25 bg-accent-emerald/14 text-accent-emerald shadow-[0_0_8px_rgba(16,185,129,0.15)]',
        };
      case 'expired':
        return {
          text: 'Expiré',
          classes: 'border border-accent-red/25 bg-accent-red/14 text-accent-red',
        };
      default:
        return {
          text: 'Gratuit',
          classes: 'border border-white/10 bg-white/[0.06] text-text-secondary',
        };
    }
  });

  function handleLogin() {
    if (!canSubmit || isLoading) return;
    onLogin(formEmail, formPassword);
  }

  function handleSignup() {
    if (!canSubmit || isLoading) return;
    onSignup(formEmail, formPassword);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && canSubmit && !isLoading) {
      handleLogin();
    }
  }
</script>

<div class="section-card-strong rounded-[1.5rem] p-4 space-y-4">
  <!-- Header -->
  <div class="flex items-center gap-2">
    <Icon name="user" size={12} class="text-accent-blue/60" />
    <div>
      <h3 class="text-sm font-semibold text-text-primary">Compte</h3>
      {#if !isAuthenticated}
        <p class="mt-1 text-xs leading-relaxed text-text-secondary">
          Connectez-vous pour débloquer les fonctionnalités premium.
        </p>
      {/if}
    </div>
  </div>

  {#if isAuthenticated}
    <!-- Logged in state -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5"
          >
            <Icon name="user" size={14} class="text-text-secondary" />
          </div>
          <span class="text-sm text-text-primary">{email}</span>
        </div>
        <span
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium {badgeConfig.classes}"
        >
          {#if premiumStatus === 'premium'}
            <Icon name="crown" size={11} />
          {/if}
          {badgeConfig.text}
        </span>
      </div>

      {#if premiumStatus === 'premium' && formattedExpiry}
        <div class="rounded-xl border border-accent-emerald/10 bg-accent-emerald/5 px-3 py-2.5">
          <p class="text-xs leading-relaxed text-accent-emerald">
            Votre abonnement est actif jusqu'au {formattedExpiry}
          </p>
        </div>
      {:else if premiumStatus === 'free'}
        <div class="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
          <p class="text-xs leading-relaxed text-text-secondary">
            Passez à Premium pour une IA de génération améliorée.
            {#if onOpenDashboard}
              <button
                class="inline-flex items-center gap-1 text-accent-blue transition-colors hover:text-accent-blue/80"
                onclick={onOpenDashboard}
              >
                En savoir plus
                <Icon name="external-link" size={10} />
              </button>
            {/if}
          </p>
        </div>
      {:else if premiumStatus === 'expired'}
        <div class="rounded-xl border border-accent-red/10 bg-accent-red/5 px-3 py-2.5">
          <p class="text-xs leading-relaxed text-accent-red">
            Votre abonnement a expiré.
            {#if onOpenDashboard}
              <button
                class="inline-flex items-center gap-1 text-accent-blue transition-colors hover:text-accent-blue/80"
                onclick={onOpenDashboard}
              >
                Renouveler
                <Icon name="external-link" size={10} />
              </button>
            {/if}
          </p>
        </div>
      {/if}

      <div class="pt-1">
        <button
          class="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
          onclick={onLogout}
          disabled={isLoading}
        >
          <Icon name="log-out" size={13} />
          Se déconnecter
        </button>
      </div>
    </div>
  {:else}
    <!-- Not logged in state -->
    <form class="space-y-3" onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
      <div class="space-y-2">
        <!-- Email input -->
        <div class="relative">
          <div class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Icon name="mail" size={14} class="text-text-muted" />
          </div>
          <input
            type="email"
            placeholder="Email"
            class="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20"
            bind:value={formEmail}
            autocomplete="email"
          />
        </div>

        <!-- Password input -->
        <div class="relative">
          <div class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Icon name="lock" size={14} class="text-text-muted" />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Mot de passe"
            class="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-10 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20"
            bind:value={formPassword}
            autocomplete="current-password"
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-secondary"
            onclick={() => (showPassword = !showPassword)}
            tabindex={-1}
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            <Icon name={showPassword ? 'eye-off' : 'eye'} size={14} />
          </button>
        </div>
      </div>

      {#if error}
        <div class="rounded-xl border border-accent-red/15 bg-accent-red/5 px-3 py-2">
          <p class="text-xs text-accent-red">{error}</p>
        </div>
      {/if}

      <div class="flex gap-2 pt-1">
        <Button variant="primary" onclick={handleLogin} disabled={!canSubmit || isLoading}>
          {#snippet children()}
            {#if isLoading}
              <Icon name="loader" size={14} class="animate-spin" />
            {/if}
            Se connecter
          {/snippet}
        </Button>
        <Button variant="ghost" onclick={handleSignup} disabled={!canSubmit || isLoading}>
          {#snippet children()}
            Créer un compte
          {/snippet}
        </Button>
      </div>
    </form>
  {/if}
</div>
