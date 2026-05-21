export type ProfileSyncStatus = 'match' | 'mismatch' | 'missing' | 'unknown';

export interface ProfileSyncField {
  id: string;
  label: string;
  value: string;
}

export interface ProfileFieldComparison {
  fieldId: string;
  label: string;
  expected: string;
  status: ProfileSyncStatus;
}

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function compareProfileText(
  fields: ProfileSyncField[],
  pageText: string
): ProfileFieldComparison[] {
  const normalizedText = normalize(pageText);

  return fields.map((field) => {
    const expected = field.value.trim();
    if (!expected) {
      return { fieldId: field.id, label: field.label, expected, status: 'missing' };
    }

    const normalizedExpected = normalize(expected);
    const status = normalizedText.includes(normalizedExpected) ? 'match' : 'mismatch';

    return { fieldId: field.id, label: field.label, expected, status };
  });
}

export function summarizeProfileComparison(comparisons: ProfileFieldComparison[]): {
  matches: number;
  mismatches: number;
  missing: number;
} {
  return comparisons.reduce(
    (summary, comparison) => {
      if (comparison.status === 'match') {
        summary.matches += 1;
      } else if (comparison.status === 'mismatch') {
        summary.mismatches += 1;
      } else if (comparison.status === 'missing') {
        summary.missing += 1;
      }
      return summary;
    },
    { matches: 0, mismatches: 0, missing: 0 }
  );
}
