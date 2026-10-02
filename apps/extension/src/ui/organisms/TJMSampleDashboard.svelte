<script lang="ts">
  import type { TJMSampleAnalysis } from '$lib/core/types/tjm';
  import { formatAbsoluteDate, formatTJM, formatTJMRange } from '$lib/core/utils/format';
  const { analysis }: { analysis: TJMSampleAnalysis } = $props();
  const labels = {
    junior: 'Junior',
    confirmed: 'Confirmé',
    senior: 'Senior',
    unknown: 'Expérience non renseignée',
  };
  const dateLabel = (date: string) => formatAbsoluteDate(Date.parse(date), { style: 'medium' });
</script>

<div class="space-y-4" aria-live="polite">
  <section class="section-card rounded-xl p-4" aria-label="Échantillon d’annonces collectées">
    <h2 class="eyebrow eyebrow--strong">Annonces collectées · sélection actuelle</h2>
    {#if analysis.total === 0}
      <p class="mt-3 text-body-lg font-semibold">Aucune annonce pour ce segment</p>
      <p class="mt-2 text-caption text-text-muted">
        Élargissez les filtres ou lancez un scan depuis le feed. Aucun échantillon global n’est
        substitué à cette sélection.
      </p>
    {:else}
      <div class="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p class="text-caption text-text-muted">Médiane des TJM renseignés</p>
          <p class="mt-1 font-mono text-heading-lg" data-testid="tjm-sample-median">
            {analysis.range ? formatTJM(analysis.range.median) : '—'}
          </p>
          {#if !analysis.range}<p class="text-caption">Aucun tarif renseigné</p>{/if}
        </div>
        <div>
          <p class="text-caption text-text-muted">Annonces uniques</p>
          <p class="mt-1 font-mono text-heading-lg" data-testid="tjm-sample-total">
            {analysis.total}
          </p>
        </div>
      </div>
    {/if}
    <p class="mt-3 text-caption" data-testid="tjm-sample-coverage">
      {analysis.priced} avec TJM · {analysis.withoutTjm} sans TJM · {analysis.total} au total
    </p>
    {#if analysis.range}
      <p class="mt-1 text-caption text-text-muted">
        Valeurs observées : {formatTJMRange(analysis.range.min, analysis.range.max)}.
      </p>
    {/if}
    <p class="mt-3 text-caption leading-5 text-text-muted">
      Une annonce compte une fois, même si elle est rescannée ou cite plusieurs technologies. Le TJM
      observé peut être le minimum de la fourchette annoncée ; ce n’est pas un tarif négocié. Cet
      échantillon local ne représente pas tout le marché. L’historique conserve au maximum 90 jours
      et 5 000 observations quotidiennes, dans la limite de stockage local (2 Mo). Les plus
      anciennes observations sont retirées en premier.
    </p>
    {#if analysis.firstObservedAt && analysis.lastUpdated}
      <p class="mt-2 text-caption text-text-muted">
        Observations retenues du {dateLabel(analysis.firstObservedAt)} au {dateLabel(
          analysis.lastUpdated
        )}.
      </p>
    {/if}
  </section>

  {#if analysis.total > 0}
    <section class="section-card rounded-xl p-4" aria-label="Composition de l’échantillon">
      <h2 class="eyebrow eyebrow--strong">Composition et champs non renseignés</h2>
      <dl class="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-caption">
        <dt>Métier non renseigné</dt>
        <dd>{analysis.unknown.category}</dd>
        <dt>Expérience non renseignée</dt>
        <dd>{analysis.unknown.seniority}</dd>
        <dt>Mode de travail non renseigné</dt>
        <dd>{analysis.unknown.remote}</dd>
        <dt>Région non renseignée</dt>
        <dd>{analysis.unknown.region}</dd>
      </dl>
      <ul class="mt-3 space-y-1 text-caption">
        {#each analysis.sources as source (source.source)}
          <li>{source.source} : {source.count} annonce{source.count > 1 ? 's' : ''}</li>
        {/each}
      </ul>
      <p class="mt-2 text-caption text-text-muted">
        Les champs absents restent inconnus et sont exclus des segments précis. Le métier utilise
        uniquement la catégorie déjà renseignée.
      </p>
    </section>
    <section aria-label="TJM par expérience" class="space-y-2">
      {#each analysis.levels as level (level.seniority)}
        <div class="section-card rounded-xl p-4">
          <h3 class="font-medium text-meta">{labels[level.seniority]}</h3>
          <p class="mt-1 text-caption">
            {level.population.total} annonces · {level.population.priced} avec TJM · {level
              .population.withoutTjm} sans TJM
          </p>
          <p class="mt-2 font-mono text-meta">
            {level.population.range
              ? `Médiane : ${formatTJM(level.population.range.median)}`
              : 'Aucun tarif renseigné'}
          </p>
        </div>
      {/each}
    </section>
  {/if}

  {#if analysis.legacy.recordCount > 0}
    <details class="section-card rounded-xl p-4">
      <summary class="cursor-pointer text-meta font-medium"
        >Historique agrégé ancien · hors segmentation</summary
      >
      <p class="mt-3 text-caption leading-5 text-text-muted">
        {analysis.legacy.recordCount} agrégats par technologie et date, toutes régions et périodes. Une
        même annonce peut contribuer à plusieurs agrégats. Ces moyennes servent uniquement à la tendance
        historique ; elles n’alimentent ni la médiane ni le nombre d’annonces ci-dessus.
      </p>
      <ul class="mt-3 space-y-1 text-caption" aria-label="Moyennes historiques agrégées">
        {#each analysis.legacy.series as point (point.date)}
          <li>{dateLabel(point.date)} : moyenne agrégée {formatTJM(point.average)}</li>
        {/each}
      </ul>
    </details>
  {/if}
</div>
