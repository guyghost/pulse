import { getProfile } from './settings.facade';
import { getMissions } from './feed-data.facade';
import type { CvExportDeps } from '$lib/state/cv-export.svelte';

export function createCvExportDeps(): CvExportDeps {
  return {
    getProfile,
    getMissions,
    download(html) {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'cv-missionpulse.html';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}
