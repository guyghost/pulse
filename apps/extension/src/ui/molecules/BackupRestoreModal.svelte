<script lang="ts">
  import type { BackupData, ValidationError } from '$lib/core/backup/backup';
  import { Button } from '@pulse/ui';
  import { Icon } from '@pulse/ui';

  interface Props {
    backup: BackupData | null;
    error: ValidationError | null;
    onConfirm: () => void;
    onCancel: () => void;
  }

  const { backup, error, onConfirm, onCancel }: Props = $props();

  let isRestoring = $state(false);
  let confirmationText = $state('');
  const canConfirmRestore = $derived(Boolean(backup) && confirmationText === 'RESTAURER');

  function handleConfirm() {
    if (!canConfirmRestore) {
      return;
    }
    isRestoring = true;
    onConfirm();
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getErrorMessage(err: ValidationError): string {
    switch (err.type) {
      case 'INVALID_JSON':
        return "Le fichier n'est pas un JSON valide.";
      case 'SCHEMA_ERROR':
        return `Le format du backup est invalide. ${err.issues.length} erreur(s) trouvée(s).`;
      case 'VERSION_UNSUPPORTED':
        return `Version ${err.version} non supportée. Mettez à jour l'extension.`;
      default:
        return 'Erreur inconnue lors de la validation.';
    }
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
  <div
    class="w-full max-w-md rounded-3xl border border-border-light bg-surface-white p-6 shadow-2xl"
    role="dialog"
    aria-modal="true"
    aria-labelledby="backup-restore-title"
  >
    <!-- Header -->
    <div class="mb-5 flex items-center gap-3">
      {#if error}
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-status-red/10">
          <Icon name="alert-circle" size={20} class="text-status-red" />
        </div>
        <div>
          <h3 id="backup-restore-title" class="text-lg font-semibold text-text-primary">
            Backup invalide
          </h3>
          <p class="text-sm text-text-secondary">Aucune donnée ne sera écrasée</p>
        </div>
      {:else if backup}
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blueprint-blue/20">
          <Icon name="database" size={20} class="text-blueprint-blue" />
        </div>
        <div>
          <h3 id="backup-restore-title" class="text-lg font-semibold text-text-primary">
            Restaurer ce point local
          </h3>
          <p class="text-sm text-text-secondary">
            Vérifiez l’impact avant de remplacer l’état actuel
          </p>
        </div>
      {:else}
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blueprint-blue/20">
          <Icon name="loader-2" size={20} class="animate-spin text-blueprint-blue" />
        </div>
        <div>
          <h3 id="backup-restore-title" class="text-lg font-semibold text-text-primary">
            Analyse du backup
          </h3>
          <p class="text-sm text-text-secondary">Validation du format et des données</p>
        </div>
      {/if}
    </div>

    <!-- Content -->
    {#if error}
      <div class="mb-5 rounded-2xl border border-status-red/20 bg-status-red/8 p-4">
        <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-status-red">
          Restauration bloquée
        </p>
        <p class="mt-2 text-sm leading-5 text-text-primary">{getErrorMessage(error)}</p>
        <p class="mt-2 text-xs leading-5 text-text-subtle">
          Choisissez un autre fichier ou recréez une sauvegarde depuis cet appareil.
        </p>
      </div>

      <div class="flex justify-end">
        <Button variant="secondary" onclick={onCancel}>
          {#snippet children()}Fermer{/snippet}
        </Button>
      </div>
    {:else if backup}
      {@const stats = {
        profileName: backup.profile.firstName,
        jobTitle: backup.profile.jobTitle,
        favoritesCount: Object.keys(backup.favorites).length,
        hiddenCount: Object.keys(backup.hidden).length,
        date: new Date(backup.timestamp),
        version: backup.version,
      }}

      <div class="mb-5 grid grid-cols-2 gap-2">
        <div class="rounded-xl border border-border-light bg-page-canvas px-3 py-2.5">
          <span class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">
            Profil
          </span>
          <span class="mt-1 block truncate text-sm font-medium text-text-primary">
            {stats.profileName || 'Non renseigné'}
            {#if stats.jobTitle}
              <span class="block truncate text-xs text-text-muted">{stats.jobTitle}</span>
            {/if}
          </span>
        </div>

        <div class="rounded-xl border border-border-light bg-page-canvas px-3 py-2.5">
          <span class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">
            Favoris
          </span>
          <span class="mt-1 block font-mono text-sm font-semibold tabular-nums text-blueprint-blue"
            >{stats.favoritesCount} mission(s)</span
          >
        </div>

        <div class="rounded-xl border border-border-light bg-page-canvas px-3 py-2.5">
          <span class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">
            Masquées
          </span>
          <span class="mt-1 block font-mono text-sm font-semibold tabular-nums text-text-primary">
            {stats.hiddenCount}
          </span>
        </div>

        <div class="rounded-xl border border-border-light bg-page-canvas px-3 py-2.5">
          <span class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">
            Version
          </span>
          <span class="mt-1 block font-mono text-sm font-semibold text-text-primary">
            v{stats.version}
          </span>
        </div>
      </div>

      <div class="mb-4 rounded-2xl border border-status-orange/25 bg-status-orange/8 p-4">
        <p
          class="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-status-orange"
        >
          <Icon name="alert-triangle" size={13} class="shrink-0" />
          Décision requise
        </p>
        <p class="mt-2 text-sm leading-5 text-text-primary">
          Impact : l’état actuel sera remplacé par le backup du {formatDate(backup.timestamp)}.
        </p>
        <p class="mt-1 text-xs leading-5 text-text-subtle">
          Après restauration : vérifiez le feed, le profil et les favoris avant de reprendre les
          scans.
        </p>
      </div>

      <label for="backup-restore-confirm" class="mb-1 block text-xs font-medium text-text-primary">
        Tapez RESTAURER pour confirmer
      </label>
      <input
        id="backup-restore-confirm"
        class="mb-5 w-full rounded-lg border border-status-orange/25 bg-surface-white px-3 py-2 text-sm font-medium text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-status-orange/50"
        placeholder="RESTAURER"
        bind:value={confirmationText}
        autocomplete="off"
      />

      <div class="flex gap-3">
        <Button variant="ghost" onclick={onCancel}>
          {#snippet children()}Annuler{/snippet}
        </Button>
        <Button
          variant="primary"
          onclick={handleConfirm}
          disabled={isRestoring || !canConfirmRestore}
        >
          {#snippet children()}
            {#if isRestoring}
              <Icon name="loader-2" size={16} class="animate-spin mr-1" />
              Restauration...
            {:else}
              <Icon name="refresh-cw" size={16} class="mr-1" />
              Restaurer ce point
            {/if}
          {/snippet}
        </Button>
      </div>
    {:else}
      <div class="mb-5 flex items-center justify-center py-8">
        <div
          class="h-8 w-8 animate-spin rounded-full border-2 border-blueprint-blue/30 border-t-blueprint-blue"
        ></div>
      </div>

      <div class="flex justify-end">
        <Button variant="ghost" onclick={onCancel}>
          {#snippet children()}Annuler{/snippet}
        </Button>
      </div>
    {/if}
  </div>
</div>
