<script lang="ts">
  import { Button } from '@pulse/ui';
  import { createCvExportStore } from '$lib/state/cv-export.svelte';
  import { createCvExportDeps } from '$lib/shell/facades/cv-export.facade';
  import { formatExperienceDateRange } from '$lib/core/cv/experience-helpers';
  const store = createCvExportStore(createCvExportDeps());
</script>

<section class="section-card min-w-0 space-y-3 rounded-xl p-4" aria-label="Exporter un CV">
  <h2 class="text-body-lg font-semibold">Exporter un CV</h2>
  <p class="text-meta text-text-subtle">
    Un document local imprimable en PDF, général ou adapté à une mission avec vos expériences
    existantes.
  </p>
  {#if !store.isOpen}
    <Button variant="secondary" onclick={() => store.open()}>Préparer mon CV</Button>
  {:else}
    {#if store.loading}<p role="status">Préparation du CV…</p>{/if}
    {#if store.error}<p role="alert" class="text-meta text-status-red">{store.error}</p>{/if}
    {#if store.document && !store.loading}
      <label class="block text-meta" for="cv-mission">Contexte de candidature</label>
      <select
        id="cv-mission"
        class="w-full min-w-0 rounded-lg border border-border-light p-2 text-meta"
        value={store.missionId}
        onchange={(event) => store.selectMission(event.currentTarget.value)}
      >
        <option value="">CV général</option>
        {#each store.missions as mission (mission.id)}<option value={mission.id}
            >{mission.title}</option
          >{/each}
      </select>
      <p class="text-caption text-text-subtle">
        La mission propose un ordre par compétences communes. Votre métier reste celui du profil.
        Les mots-clés de ciblage ne sont pas ajoutés aux compétences.
      </p>
      <fieldset class="space-y-2">
        <legend class="text-meta font-semibold">Expériences à inclure</legend>
        {#each store.experiences as exp (exp.id)}
          <label class="flex items-start gap-2 text-meta"
            ><input
              type="checkbox"
              checked={store.ids.includes(exp.id)}
              onchange={() => store.toggleExperience(exp.id)}
            /><span>{exp.title} · {exp.company ?? 'Entreprise non renseignée'}</span></label
          >
        {/each}
      </fieldset>
      <fieldset class="space-y-2">
        <legend class="text-meta font-semibold">Compétences issues de vos expériences</legend>
        <div class="flex flex-wrap gap-3">
          {#each store.availableSkills as skill (skill)}<label
              class="flex items-center gap-1 text-meta"
              ><input
                type="checkbox"
                checked={store.skills.includes(skill)}
                onchange={() => store.toggleSkill(skill)}
              />{skill}</label
            >{/each}
        </div>
      </fieldset>
      <label class="block text-meta" for="cv-introduction"
        >Introduction personnelle (facultative)</label
      >
      <textarea
        id="cv-introduction"
        class="w-full rounded-lg border border-border-light p-2 text-meta"
        rows="3"
        value={store.introduction}
        oninput={(event) => store.setIntroduction(event.currentTarget.value)}
        placeholder="Présentez votre parcours avec vos propres mots."></textarea>
      <article
        aria-label="Aperçu du CV"
        class="space-y-3 break-words rounded-lg border border-border-light bg-surface-white p-3"
      >
        <h3 class="text-body-lg font-semibold">
          {store.document.name || 'Votre nom à renseigner dans Profil'}
        </h3>
        <p>{store.document.title}</p>
        <p class="text-meta">{store.document.location}</p>
        {#if store.document.applicationContext}<p class="text-meta">
            Candidature : {store.document.applicationContext}
          </p>{/if}
        <p class="whitespace-pre-wrap text-meta">{store.document.introduction}</p>
        <h4 class="text-meta font-semibold">Compétences — ordre d’affichage</h4>
        {#each store.skills as skill, index (skill)}
          <div class="flex items-center justify-between gap-2 text-meta">
            <span>{skill}</span>
            <div class="flex shrink-0 gap-1">
              <button
                class="rounded border p-2"
                aria-label={`Monter la compétence ${skill}`}
                disabled={index === 0}
                onclick={() => store.moveSkill(skill, -1)}>↑</button
              ><button
                class="rounded border p-2"
                aria-label={`Descendre la compétence ${skill}`}
                disabled={index === store.skills.length - 1}
                onclick={() => store.moveSkill(skill, 1)}>↓</button
              >
            </div>
          </div>
        {/each}
        {#each store.document.experiences as exp, index (exp.id)}
          <section class="border-t border-border-light pt-3">
            <div class="flex items-start justify-between gap-2">
              <h4 class="min-w-0 text-meta font-semibold">{exp.title} · {exp.company ?? ''}</h4>
              <div class="flex shrink-0 gap-1">
                <button
                  class="rounded border p-2"
                  aria-label={`Monter ${exp.title}`}
                  disabled={index === 0}
                  onclick={() => store.moveExperience(exp.id, -1)}>↑</button
                ><button
                  class="rounded border p-2"
                  aria-label={`Descendre ${exp.title}`}
                  disabled={index === store.ids.length - 1}
                  onclick={() => store.moveExperience(exp.id, 1)}>↓</button
                >
              </div>
            </div>
            <p class="text-caption">{exp.location} · {formatExperienceDateRange(exp)}</p>
            <p class="whitespace-pre-wrap text-meta">{exp.description}</p>
            <p class="text-meta">{exp.skills.join(' · ')}</p>
          </section>
        {/each}
      </article>
      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" onclick={() => store.validate()} disabled={store.validated}
          >Valider cet aperçu</Button
        ><Button onclick={() => store.download()} disabled={!store.validated}
          >Télécharger le CV HTML</Button
        >
      </div>
      <p class="text-caption text-text-subtle">
        Ouvrez le fichier téléchargé, puis utilisez Imprimer → Enregistrer en PDF.
      </p>
    {/if}
    <Button variant="secondary" onclick={() => store.close()}>Fermer l’export</Button>
  {/if}
  {#if store.status}<p role="status" class="text-meta">{store.status}</p>{/if}
</section>
