import type { UserProfile } from '$lib/core/types/profile';
import type { Mission } from '$lib/core/types/mission';
import {
  buildCvDocument,
  experienceSkills,
  renderCvHtml,
  suggestCvOrder,
  suggestCvSkills,
} from '$lib/core/cv/export-document';

export interface CvExportDeps {
  getProfile(): Promise<UserProfile | null>;
  getMissions(): Promise<Mission[]>;
  download(html: string): void;
}

export function createCvExportStore(deps: CvExportDeps) {
  let profile = $state<UserProfile | null>(null);
  let missions = $state<Mission[]>([]);
  let missionId = $state('');
  let ids = $state<string[]>([]);
  let skills = $state<string[]>([]);
  let introduction = $state('');
  let isOpen = $state(false);
  let loading = $state(false);
  let validated = $state(false);
  let error = $state('');
  let status = $state('');
  const mission = $derived(missions.find((item) => item.id === missionId) ?? null);
  const document = $derived(
    profile ? buildCvDocument(profile, mission, ids, skills, introduction) : null
  );
  function changed() {
    validated = false;
    status = '';
  }
  return {
    get isOpen() {
      return isOpen;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get status() {
      return status;
    },
    get missions() {
      return missions;
    },
    get missionId() {
      return missionId;
    },
    get document() {
      return document;
    },
    get experiences() {
      return profile?.experiences ?? [];
    },
    get skills() {
      return skills;
    },
    get availableSkills() {
      return experienceSkills(profile?.experiences ?? []);
    },
    get ids() {
      return ids;
    },
    get introduction() {
      return introduction;
    },
    get validated() {
      return validated;
    },
    async open() {
      isOpen = true;
      loading = true;
      error = '';
      changed();
      profile = null;
      missions = [];
      ids = [];
      skills = [];
      try {
        const [profileResult, missionsResult] = await Promise.allSettled([
          deps.getProfile(),
          deps.getMissions(),
        ]);
        if (profileResult.status === 'rejected') {
          throw profileResult.reason;
        }
        const loadedProfile = profileResult.value;
        if (!loadedProfile) {
          throw new Error('Enregistrez votre profil avant de préparer un CV.');
        }
        profile = loadedProfile;
        missions = missionsResult.status === 'fulfilled' ? missionsResult.value : [];
        if (missionsResult.status === 'rejected') {
          status = 'Les missions sont indisponibles. Vous pouvez préparer un CV général.';
        }
        missionId = '';
        introduction = '';
        ids = profile.experiences.map((exp) => exp.id);
        skills = experienceSkills(profile.experiences);
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'Impossible de préparer le CV.';
      } finally {
        loading = false;
      }
    },
    close() {
      isOpen = false;
    },
    selectMission(id: string) {
      missionId = id;
      changed();
      const ordered = suggestCvOrder(
        profile?.experiences ?? [],
        missions.find((item) => item.id === id) ?? null
      );
      ids = ordered.map((exp) => exp.id);
      skills = suggestCvSkills(ordered, mission);
    },
    toggleExperience(id: string) {
      ids = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
      changed();
    },
    toggleSkill(skill: string) {
      skills = skills.includes(skill)
        ? skills.filter((item) => item !== skill)
        : [...skills, skill];
      changed();
    },
    moveExperience(id: string, offset: number) {
      const index = ids.indexOf(id);
      const next = index + offset;
      if (index < 0 || next < 0 || next >= ids.length) {
        return;
      }
      const copy = [...ids];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      ids = copy;
      changed();
    },
    moveSkill(skill: string, offset: number) {
      const index = skills.indexOf(skill);
      const next = index + offset;
      if (index < 0 || next < 0 || next >= skills.length) {
        return;
      }
      const copy = [...skills];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      skills = copy;
      changed();
    },
    setIntroduction(value: string) {
      introduction = value;
      changed();
    },
    validate() {
      if (document) {
        validated = true;
        status = 'Aperçu validé. Votre CV est prêt à télécharger.';
      }
    },
    download() {
      if (!validated || !document) {
        return;
      }
      error = '';
      try {
        deps.download(renderCvHtml(document));
        status = 'CV téléchargé. Ouvrez le fichier HTML puis imprimez-le pour enregistrer un PDF.';
      } catch {
        status = '';
        error = 'Impossible de télécharger le CV. Réessayez.';
      }
    },
  };
}
