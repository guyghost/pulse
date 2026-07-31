<script lang="ts" module>
  // Shared boolean switch (role="switch").
  // Pass `aria-label` (or `aria-labelledby`) so the control is announced to AT.
  export type ToggleSize = 'sm' | 'md';
</script>

<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type ToggleProps = Omit<
    HTMLButtonAttributes,
    'class' | 'disabled' | 'onclick' | 'role' | 'aria-checked'
  > & {
    /** Current on/off state. */
    checked: boolean;
    /** `md` for settings rows, `sm` for dense lists. Defaults to `md`. */
    size?: ToggleSize;
    disabled?: boolean;
    class?: string;
    onclick?: HTMLButtonAttributes['onclick'];
  };

  let {
    checked,
    size = 'md',
    disabled = false,
    class: className = '',
    onclick,
    type = 'button',
    ...rest
  }: ToggleProps = $props();

  const track = $derived(size === 'sm' ? 'h-5 w-9' : 'h-6 w-11');
  const thumb = $derived(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4');
  // Symmetric 2px insets: off sits 2px from the left, on sits 2px from the right.
  const onTravel = $derived(size === 'sm' ? 'translate-x-5' : 'translate-x-6.5');
</script>

<button
  {...rest}
  {type}
  role="switch"
  aria-checked={checked}
  {disabled}
  {onclick}
  class="relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint-blue disabled:cursor-not-allowed disabled:opacity-50 {track} {checked
    ? 'border-accent-green/30 bg-accent-green/15'
    : 'border-border-light bg-surface-white'} {className}"
>
  <span
    aria-hidden="true"
    class="inline-block rounded-full transition-transform duration-200 ease-out {thumb} {checked
      ? `${onTravel} bg-accent-green`
      : 'translate-x-0.5 bg-text-muted'}"
  ></span>
</button>
