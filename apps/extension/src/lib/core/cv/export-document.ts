import type { Experience, UserProfile } from '../types/profile';
import type { Mission } from '../types/mission';
import { formatExperienceDateRange } from './experience-helpers';

export interface CvDocument {
  name: string;
  title: string;
  location: string;
  applicationContext: string;
  introduction: string;
  skills: string[];
  experiences: Experience[];
}

export function experienceSkills(experiences: readonly Experience[]): string[] {
  const unique = new Map<string, string>();
  for (const exp of experiences) {
    for (const skill of exp.skills) {
      if (skill.trim()) {
        unique.set(skill.trim().toLowerCase(), skill.trim());
      }
    }
  }
  return [...unique.values()];
}

/** Reorders existing facts only; targeting keywords are never claimed as skills. */
export function suggestCvOrder(
  experiences: readonly Experience[],
  mission: Mission | null
): Experience[] {
  const wanted = new Set((mission?.stack ?? []).map((skill) => skill.trim().toLowerCase()));
  const score = (exp: Experience) =>
    exp.skills.filter((skill) => wanted.has(skill.trim().toLowerCase())).length;
  return [...experiences].sort((a, b) => score(b) - score(a));
}

export function suggestCvSkills(
  experiences: readonly Experience[],
  mission: Mission | null
): string[] {
  const wanted = new Set((mission?.stack ?? []).map((skill) => skill.trim().toLowerCase()));
  return experienceSkills(experiences).sort(
    (a, b) => Number(wanted.has(b.toLowerCase())) - Number(wanted.has(a.toLowerCase()))
  );
}

export function buildCvDocument(
  profile: UserProfile,
  mission: Mission | null,
  experienceIds: readonly string[],
  skills: readonly string[],
  introduction: string
): CvDocument {
  const selectedSkills = new Set(skills.map((skill) => skill.toLowerCase()));
  const experiences = [...new Set(experienceIds)].flatMap((id) => {
    const exp = profile.experiences.find((item) => item.id === id);
    return exp
      ? [
          {
            ...exp,
            skills: exp.skills.filter((skill) => selectedSkills.has(skill.trim().toLowerCase())),
          },
        ]
      : [];
  });
  const allowed = new Set(experienceSkills(profile.experiences));
  return {
    name: profile.firstName,
    title: profile.jobTitle,
    location: profile.location,
    applicationContext: mission
      ? `${mission.title}${mission.client ? ` · ${mission.client}` : ''}`
      : '',
    introduction,
    skills: [...new Set(skills)].filter((skill) => allowed.has(skill)),
    experiences,
  };
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char
  );
}

/** All user data is text, never markup or a resource URL. No scripts or remote resources. */
export function renderCvHtml(doc: CvDocument): string {
  const e = escapeHtml;
  const experienceHtml = doc.experiences
    .map(
      (exp) =>
        `<section><h2>${e(exp.title)}</h2><p>${e([exp.company, exp.location, formatExperienceDateRange(exp)].filter(Boolean).join(' · '))}</p><p class="text">${e(exp.description)}</p><p>${e(exp.skills.filter((skill) => doc.skills.some((selected) => selected.toLowerCase() === skill.trim().toLowerCase())).join(' · '))}</p></section>`
    )
    .join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>CV — ${e(doc.name)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;color:#171717}h1{margin-bottom:0}h2{font-size:20px}section{break-inside:avoid;border-top:1px solid #ddd;margin-top:24px}.text{white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{margin:0;padding:0}.help{display:none}}</style></head><body><p class="help">Imprimer ce document (Ctrl+P ou ⌘P) puis choisir « Enregistrer en PDF ».</p><h1>${e(doc.name)}</h1><h2>${e(doc.title)}</h2><p>${e(doc.location)}</p>${doc.applicationContext ? `<p>Candidature : ${e(doc.applicationContext)}</p>` : ''}<p class="text">${e(doc.introduction)}</p><h2>Compétences</h2><p>${e(doc.skills.join(' · '))}</p>${experienceHtml}</body></html>`;
}
