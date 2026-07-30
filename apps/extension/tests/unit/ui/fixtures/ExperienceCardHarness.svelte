<script lang="ts">
  import { untrack } from 'svelte';
  import type { Experience } from '../../../../src/lib/core/types/profile';
  import ExperienceCard from '../../../../src/ui/molecules/ExperienceCard.svelte';

  const {
    initialExperience,
    initialDraft,
  }: {
    initialExperience: Experience;
    initialDraft: Experience;
  } = $props();

  let experience = $state.raw(untrack(() => initialExperience));
  let draft = $state.raw(untrack(() => initialDraft));

  export function replace(nextExperience: Experience, nextDraft: Experience): void {
    experience = nextExperience;
    draft = nextDraft;
  }
</script>

<ExperienceCard {experience} isEditing {draft} onSave={() => undefined} />
