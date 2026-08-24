<script lang="ts">
  import { filledIconPaths, iconPaths, type IconName, type SVGChild } from './paths';

  const {
    name,
    size = 16,
    class: className = '',
    filled = false,
  }: {
    name: IconName;
    size?: number;
    class?: string;
    filled?: boolean;
  } = $props();

  const hasFilledVariant = $derived(filled && filledIconPaths[name] !== undefined);

  // Build innerHTML from path data (recursively, so groups/variants render)
  const inner = $derived.by(() => {
    const children: readonly SVGChild[] | undefined = hasFilledVariant
      ? filledIconPaths[name]
      : iconPaths[name];
    if (!children) return '';
    const serialize = (nodes: readonly SVGChild[]): string =>
      nodes
        .map(([tag, attrs, ...nested]) => {
          const attrStr = Object.entries(attrs)
            .map(([k, v]) => `${k}="${v}"`)
            .join(' ');
          const innerNodes = nested.flat() as SVGChild[];
          const innerContent = innerNodes.length > 0 ? serialize(innerNodes) : '';
          if (
            tag === 'circle' ||
            tag === 'ellipse' ||
            tag === 'line' ||
            tag === 'path' ||
            tag === 'polygon' ||
            tag === 'polyline' ||
            tag === 'rect'
          ) {
            return `<${tag} ${attrStr} />`;
          }
          return `<${tag} ${attrStr}>${innerContent}</${tag}>`;
        })
        .join('');
    return serialize(children);
  });
</script>

<svg
  class="inline-block {className}"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={hasFilledVariant ? 'currentColor' : 'none'}
  stroke={hasFilledVariant ? 'none' : 'currentColor'}
  stroke-width={hasFilledVariant ? undefined : 2}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  xmlns="http://www.w3.org/2000/svg"
>
  {@html inner}
</svg>
