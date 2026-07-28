<script lang="ts" module>
  // Multi-select chip group (skills, preferences). Composes N `Chip`-style
  // toggles and reports the selected values via `onchange`. Exclusive=false.
  // iOS-style: radius 999px chips, active scale(0.98), blueprint-blue selected.
  export type ChipGroupOption<T extends string = string> = {
    value: T;
    label: string;
    disabled?: boolean;
  };
</script>

<script lang="ts">
  type ChipGroupProps<T extends string = string> = {
    /** Currently selected values. */
    values: readonly T[];
    /** Ordered list of options. */
    options: ChipGroupOption<T>[];
    /** Disable the whole group. */
    disabled?: boolean;
    class?: string;
    /** Fired with the new array when selection changes. */
    onchange?: (values: T[]) => void;
  };

  let {
    values,
    options,
    disabled = false,
    class: className = '',
    onchange,
  }: ChipGroupProps = $props();

  function toggle(opt: ChipGroupOption<string>) {
    if (disabled || opt.disabled) return;
    const current = values as readonly string[];
    const next: string[] = current.includes(opt.value)
      ? current.filter((v) => v !== opt.value)
      : [...current, opt.value];
    onchange?.(next as unknown as string[] & typeof values);
  }
</script>

<div role="group" class="flex flex-wrap gap-2 {className}">
  {#each options as opt (opt.value)}
    <button
      type="button"
      aria-pressed={values.includes(opt.value)}
      disabled={disabled || opt.disabled}
      onclick={() => toggle(opt)}
      class="inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-all duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint-blue active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 {values.includes(
        opt.value
      )
        ? 'border-blueprint-blue/30 bg-blueprint-blue/10 text-blueprint-blue'
        : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}"
    >
      {opt.label}
    </button>
  {/each}
</div>
