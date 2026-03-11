<script lang="ts">
  import FeedPage from '../ui/pages/FeedPage.svelte';
  import TJMPage from '../ui/pages/TJMPage.svelte';
  import SettingsPage from '../ui/pages/SettingsPage.svelte';
  import OnboardingPage from '../ui/pages/OnboardingPage.svelte';
  import Icon from '../ui/atoms/Icon.svelte';

  type Page = 'feed' | 'tjm' | 'settings' | 'onboarding';

  let currentPage: Page = $state('onboarding');
  let hasCompletedOnboarding = $state(false);

  function navigate(page: Page) {
    currentPage = page;
  }

  function completeOnboarding() {
    hasCompletedOnboarding = true;
    currentPage = 'feed';
  }

  // Check if profile exists on mount
  $effect(() => {
    (async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_PROFILE' });
        if (response?.payload) {
          hasCompletedOnboarding = true;
          currentPage = 'feed';
        }
      } catch {
        // Outside extension context — show onboarding
      }
    })();
  });

  const navItems: { page: Page; label: string; icon: string }[] = [
    { page: 'feed', label: 'Feed', icon: 'briefcase' },
    { page: 'tjm', label: 'TJM', icon: 'trending-up' },
    { page: 'settings', label: 'Settings', icon: 'settings' },
  ];
</script>

<div class="w-[400px] h-screen flex flex-col bg-navy-900 text-text-primary font-sans">
  {#if currentPage === 'onboarding' && !hasCompletedOnboarding}
    <OnboardingPage onComplete={completeOnboarding} />
  {:else}
    <nav class="flex border-b border-navy-700">
      {#each navItems as item}
        <button
          class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors
            {currentPage === item.page
              ? 'text-accent-blue border-b-2 border-accent-blue'
              : 'text-text-secondary hover:text-text-primary'}"
          onclick={() => navigate(item.page)}
        >
          <Icon name={item.icon} size={14} />
          {item.label}
        </button>
      {/each}
    </nav>
    <main class="flex-1 overflow-hidden">
      {#if currentPage === 'feed'}
        <FeedPage />
      {:else if currentPage === 'tjm'}
        <TJMPage />
      {:else if currentPage === 'settings'}
        <SettingsPage onBack={() => navigate('feed')} />
      {/if}
    </main>
  {/if}
</div>
