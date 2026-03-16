<script lang="ts">
  import type { BackupData, ValidationError } from '$lib/core/backup/backup';
  import Button from '../atoms/Button.svelte';
  import Icon from '../atoms/Icon.svelte';

  interface Props {
    backup: BackupData | null;
    error: ValidationError | null;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let { backup, error, onConfirm, onCancel }: Props = $props();

  let isRestoring = $state(false);

  function handleConfirm() {
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
        return 'Le fichier n\'est pas un JSON valide.';
      case 'SCHEMA_ERROR':
        return `Le format du backup est invalide. ${err.issues.length} erreur(s) trouvée(s).`;
      case 'VERSION_UNSUPPORTED':
        return `Version ${err.version} non supportée. Mettez à jour l'extension.`;
      default:
        return 'Erreur inconnue lors de la validation.';
    }
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
  <div class="w-full max-w-md rounded-[1.5rem] border border-white/10 bg-navy-800 p-6 shadow-2xl">
    <!-- Header -->
    <div class="mb-5 flex items-center gap-3">
      {#if error}
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
          <Icon name="alert-circle" size={20} class="text-red-400" />
        </div>
        <div>
          <h3 class="text-lg font-semibold text-text-primary">Backup invalide</h3>
          <p class="text-sm text-text-secondary">Impossible de restaurer ce fichier</p>
        </div>
      {:else if backup}
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-accent-emerald/20">
          <Icon name="database" size={20} class="text-accent-emerald" />
        </div>
        <div>
          <h3 class="text-lg font-semibold text-text-primary">Confirmer la restauration</h3>
          <p class="text-sm text-text-secondary">Cela écrasera vos données actuelles</p>
        </div>
      {:else}
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-accent-amber/20">
          <Icon name="loader-2" size={20} class="animate-spin text-accent-amber" />
        </div>
        <div>
          <h3 class="text-lg font-semibold text-text-primary">Analyse...</h3>
          <p class="text-sm text-text-secondary">Vérification du fichier</p>
        </div>
      {/if}
    </div>

    <!-- Content -->
    {#if error}
      <div class="mb-5 rounded-[1rem] border border-red-500/20 bg-red-500/10 p-4">
        <p class="text-sm text-red-300">{getErrorMessage(error)}</p>
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

      <div class="mb-5 space-y-3 rounded-[1rem] border border-white/10 bg-navy-900/50 p-4">
        <div class="flex items-center justify-between">
          <span class="text-sm text-text-secondary">Profil</span>
          <span class="text-sm font-medium text-text-primary">
            {stats.profileName || 'Non renseigné'}
            {#if stats.jobTitle}
              <span class="text-text-muted">— {stats.jobTitle}</span>
            {/if}
          </span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-sm text-text-secondary">Favoris</span>
          <span class="text-sm font-medium text-accent-emerald">{stats.favoritesCount} mission(s)</span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-sm text-text-secondary">Missions masquées</span>
          <span class="text-sm font-medium text-text-primary">{stats.hiddenCount}</span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-sm text-text-secondary">Date du backup</span>
          <span class="text-sm font-medium text-text-primary">{formatDate(backup.timestamp)}</span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-sm text-text-secondary">Version</span>
          <span class="text-xs font-mono text-text-muted">v{stats.version}</span>
        </div>
      </div>

      <div class="mb-5 rounded-[1rem] border border-amber-500/20 bg-amber-500/10 p-4">
        <p class="text-sm text-amber-300">
          <Icon name="alert-triangle" size={14} class="inline mr-1" />
          Attention : vos données actuelles seront remplacées. Cette action est irréversible.
        </p>
      </div>

      <div class="flex gap-3">
        <Button variant="ghost" onclick={onCancel}>
          {#snippet children()}Annuler{/snippet}
        </Button>
        <Button variant="primary" onclick={handleConfirm} disabled={isRestoring}>
          {#snippet children()}
            {#if isRestoring}
              <Icon name="loader-2" size={16} class="animate-spin mr-1" />
              Restauration...
            {:else}
              <Icon name="refresh-cw" size={16} class="mr-1" />
              Confirmer la restauration
            {/if}
          {/snippet}
        </Button>
      </div>
    {:else}
      <div class="mb-5 flex items-center justify-center py-8">
        <div class="h-8 w-8 animate-spin rounded-full border-2 border-accent-blue/30 border-t-accent-blue"></div>
      </div>

      <div class="flex justify-end">
        <Button variant="ghost" onclick={onCancel}>
          {#snippet children()}Annuler{/snippet}
        </Button>
      </div>
    {/if}
  </div>
</div>
