import type { SVGChild } from './paths';

const SELF_CLOSING_TAGS = new Set([
  'circle',
  'ellipse',
  'line',
  'path',
  'polygon',
  'polyline',
  'rect',
]);

/**
 * Serialize SVG child tuples to an SVG innerHTML string.
 * Children are variadic rest elements of each tuple ([tag, attrs, ...children]),
 * so they are passed through as-is — never flattened.
 */
export function serializeSvgChildren(nodes: readonly SVGChild[]): string {
  return nodes
    .map(([tag, attrs, ...nested]) => {
      const attrStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      const innerNodes = nested as SVGChild[];
      const innerContent = innerNodes.length > 0 ? serializeSvgChildren(innerNodes) : '';
      if (SELF_CLOSING_TAGS.has(tag)) {
        return `<${tag} ${attrStr} />`;
      }
      return `<${tag} ${attrStr}>${innerContent}</${tag}>`;
    })
    .join('');
}
