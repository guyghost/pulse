/**
 * Content script — DOM → RawFieldInput → FieldDescriptor (sanitized + classified).
 *
 * Only reads metadata (label/placeholder/type/required), never the current
 * field value. Delegates sanitization + classification to the Core
 * (sanitizeFieldDescriptor). No business logic here.
 */
import type {
  FieldDescriptor,
  FieldInputType,
  RawFieldInput,
} from '../../lib/core/form-assistant/types';
import { sanitizeFieldDescriptor } from '../../lib/core/form-assistant';

const MAX_TEXT_LEN = 200;

function trimText(value: string, max = MAX_TEXT_LEN): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Maps a DOM element to a known FieldInputType, or `null` when the field is
 * not eligible (password, checkbox, hidden, date, range, …).
 */
function resolveInputType(el: HTMLElement): FieldInputType | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') {
    return 'textarea';
  }
  if (el.isContentEditable) {
    return 'contenteditable';
  }
  if (tag !== 'input') {
    return null;
  }

  const rawType = (el as HTMLInputElement).type.toLowerCase();
  switch (rawType) {
    case 'email':
      return 'email';
    case 'tel':
      return 'tel';
    case 'url':
      return 'url';
    case 'search':
      return 'search';
    case 'text':
    case '':
      return 'text';
    default:
      // password, checkbox, radio, hidden, date, number, range, file, color, …
      return null;
  }
}

/**
 * Resolves the human label of a field, in decreasing order of reliability.
 * Never throws; returns an empty string when nothing is found.
 */
function resolveLabel(el: HTMLElement): string {
  if (el.id) {
    const associated = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (associated?.textContent) {
      return trimText(associated.textContent);
    }
  }
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) {
    return trimText(ariaLabel);
  }
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    // `aria-labelledby` may reference several space-separated IDs
    // (e.g. "field-label field-hint"). Concatenate each text.
    const ids = labelledBy.trim().split(/\s+/);
    const texts: string[] = [];
    for (const id of ids) {
      if (!id) {
        continue;
      }
      const labeller = document.getElementById(id);
      if (labeller?.textContent) {
        texts.push(trimText(labeller.textContent));
      }
    }
    if (texts.length > 0) {
      return trimText(texts.join(' '));
    }
  }
  const wrapping = el.closest('label');
  if (wrapping?.textContent) {
    return trimText(wrapping.textContent);
  }
  return '';
}

function resolvePlaceholder(el: HTMLElement): string {
  const ph = (el as HTMLInputElement).placeholder;
  return ph ? trimText(ph) : '';
}

function resolveRequired(el: HTMLElement): boolean {
  return el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
}

/**
 * Builds the sanitized FieldDescriptor for a focused element, or `null` when
 * the field is not eligible for the Form Assistant.
 */
export function detectFieldDescriptor(target: HTMLElement): FieldDescriptor | null {
  const inputType = resolveInputType(target);
  if (!inputType) {
    return null;
  }
  // Non-editable fields: nothing to propose.
  if (
    (target as HTMLInputElement).readOnly ||
    (target as HTMLInputElement).disabled ||
    target.getAttribute('aria-readonly') === 'true' ||
    target.getAttribute('aria-disabled') === 'true'
  ) {
    return null;
  }

  const raw: RawFieldInput = {
    label: resolveLabel(target),
    placeholder: resolvePlaceholder(target),
    inputType,
    required: resolveRequired(target),
  };

  return sanitizeFieldDescriptor(raw);
}
