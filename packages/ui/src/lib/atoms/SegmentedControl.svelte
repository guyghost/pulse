<script lang="ts" module>
  // Exclusive select (single value) rendered as a pill-shaped segmented control.
  // iOS-style: rounded-full container, active segment fills with blueprint-blue,
  // tap feedback scales to 0.98. Use for small option sets (2–4 items).
  // Implements the WAI-ARIA radiogroup pattern: roving tabindex (only the
  // checked option is tabbable) + ArrowLeft/Right/Home/End keyboard nav.
  export type SegmentedControlOption<T extends string = string> = {
    value: T;
    label: string;
    disabled?: boolean;
  };
</script>

<script lang="ts" generics="T extends string">
  type SegmentedControlProps = {
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

  function select(opt: SegmentedControlOption<T>) {
    if (disabled || opt.disabled) return;
    onchange?.(opt.value);
  }

  // Enabled options, in order — the universe the keyboard can traverse.
  const enabledIndices = $derived(
    options
      .map((opt, index) => (disabled || opt.disabled ? -1 : index))
      .filter((index): index is number => index >= 0)
  );

  // Roving tabindex: the checked option (or the first enabled one if none is
  // checked) is tabbable; all others are removed from the tab order.
  function tabIndexFor(optValue: T): 0 | -1 {
    const enabled = enabledIndices.length > 0;
    if (!enabled) return -1;
    const checkedEnabled =
      value !== undefined && options.some((o) => o.value === value && !(disabled || o.disabled));
    if (checkedEnabled) return optValue === value ? 0 : -1;
    const firstEnabledValue = options[enabledIndices[0]].value;
    return optValue === firstEnabledValue ? 0 : -1;
  }

  function onKeydown(event: KeyboardEvent & { currentTarget: EventTarget & HTMLElement }) {
    if (enabledIndices.length === 0) return;
    const current = enabledIndices.indexOf(options.findIndex((o) => o.value === value));
    const fallback = current === -1 ? 0 : current;
    const last = enabledIndices.length - 1;
    let next = fallback;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (fallback + 1) % enabledIndices.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (fallback - 1 + enabledIndices.length) % enabledIndices.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }

    event.preventDefault();
    const targetIndex = enabledIndices[next];
    const opt = options[targetIndex];
    const button = event.currentTarget.querySelector<HTMLElement>(
      `[data-segment="${CSS.escape(String(opt.value))}"]`
    );
    button?.focus();
    select(opt);
  }
</script>

<div
  {...rest}
  role="radiogroup"
  onkeydown={onKeydown}
  class="inline-flex items-center gap-0.5 rounded-full border border-border-light bg-subtle-gray p-0.5 {className}"
>
  {#each options as opt (opt.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === opt.value}
      tabindex={tabIndexFor(opt.value)}
      disabled={disabled || opt.disabled}
      data-segment={opt.value}
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
