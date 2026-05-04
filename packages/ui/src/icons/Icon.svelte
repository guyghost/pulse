<script lang="ts">
  import { iconPaths, type IconName } from './paths';

  const {
    name,
    size = 16,
    class: className = '',
  }: {
    name: IconName;
    size?: number;
    class?: string;
  } = $props();

  // Build innerHTML from path data
  const inner = $derived.by(() => {
    const children = iconPaths[name];
    if (!children) return '';
    return children.map(([tag, attrs]) => {
      const attrStr = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
      if (tag === 'circle' || tag === 'ellipse' || tag === 'line' || tag === 'path' || tag === 'polygon' || tag === 'polyline') {
        return `<${tag} ${attrStr} />`;
      }
      return `<${tag} ${attrStr}></${tag}>`;
    }).join('');
  });
</script>

<svg
  class="inline-block {className}"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  xmlns="http://www.w3.org/2000/svg"
>
  {@html inner}
</svg>
