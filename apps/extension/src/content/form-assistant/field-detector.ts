/**
 * Content script — DOM → RawFieldInput → FieldDescriptor (sanitisé + classifié).
 *
 * Lit uniquement des métadonnées (label/placeholder/type/required), jamais la
 * valeur courante du champ. Délègue la sanitisation + classification au Core
 * (sanitizeFieldDescriptor). Aucune logique métier ici.
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
 * Mappe un élément DOM vers un FieldInputType connu, ou `null` si le champ
 * n'est pas éligible (mot de passe, checkbox, hidden, date, range, …).
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
 * Résout le libellé humain d'un champ, par ordre de fiabilité décroissante.
 * Ne lève jamais ; retourne une chaîne vide si rien n'est trouvé.
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
    const labeller = document.getElementById(labelledBy);
    if (labeller?.textContent) {
      return trimText(labeller.textContent);
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
 * Construit le FieldDescriptor sanit-isé pour un élément focalisé, ou `null`
 * si le champ n'est pas éligible au Form Assistant.
 */
export function detectFieldDescriptor(target: HTMLElement): FieldDescriptor | null {
  const inputType = resolveInputType(target);
  if (!inputType) {
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
