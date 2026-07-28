<script lang="ts" module>
  // Exclusive select (single value) rendered as a pill-shaped segmented control.
  // iOS-style: rounded-full container, active segment fills with blueprint-blue,
  // tap feedback scales to 0.98. Use for small option sets (2–4 items).
  export type SegmentedControlOption<T extends string = string> = {
    value: T;
    label: string;
    disabled?: boolean;
  };
</script>

<script lang="ts">
  type SegmentedControlProps<T extends string = string> = {
    /** Currently selected value. */
    value: T;
    /** Ordered list of options. */
    options: SegmentedControlOption<T>[];
    /** Disable the whole control. */
    disabled?: boolean;
    class?: string;
    /** Accessible label for the radiogroup. */
    'aria-label'?: string;
    /** Fired with the new value when the user selects a segment. */
    onchange?: (value: T) => void;
  };

  let {
    value,
    options,
    disabled = false,
    class: className = '',
    onchange,
    ...rest
  }: SegmentedControlProps = $props();

  function select(opt: SegmentedControlOption<string>) {
    if (disabled || opt.disabled) return;
    onchange?.(opt.value as typeof value);
  }
</script>

<div
  {...rest}
  role="radiogroup"
  class="inline-flex items-center gap-0.5 rounded-full border border-border-light bg-subtle-gray p-0.5 {className}"
>
  {#each options as opt (opt.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === opt.value}
      disabled={disabled || opt.disabled}
      onclick={() => select(opt)}
      class="inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition-all duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint-blue active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 {value ===
      opt.value
        ? 'bg-surface-white text-blueprint-blue shadow-sm'
        : 'text-text-secondary hover:text-text-primary'}"
    >
      {opt.label}
    </button>
  {/each}
</div>
