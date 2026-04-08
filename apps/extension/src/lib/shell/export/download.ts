/**
 * Téléchargement de fichiers dans le navigateur
 * Shell = I/O : interaction avec le DOM
 */

/**
 * Télécharge un fichier avec le contenu, nom et type MIME spécifiés
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  // Créer un Blob avec le contenu
  const blob = new Blob([content], { type: mimeType });

  // Créer une URL objet pour le blob
  const url = URL.createObjectURL(blob);

  // Créer un élément lien temporaire
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Ajouter au DOM, cliquer, puis supprimer
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Libérer l'URL objet
  URL.revokeObjectURL(url);
}

/**
 * Télécharge des données JSON
 */
export function downloadJSON(data: unknown, filename: string): void {
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  downloadFile(content, filename, 'application/json');
}

/**
 * Télécharge un fichier CSV
 */
export function downloadCSV(csv: string, filename: string): void {
  // Ajouter BOM UTF-8 pour Excel
  const content = '\ufeff' + csv;
  downloadFile(content, filename, 'text/csv;charset=utf-8');
}

/**
 * Télécharge un fichier Markdown
 */
export function downloadMarkdown(md: string, filename: string): void {
  downloadFile(md, filename, 'text/markdown;charset=utf-8');
}

/**
 * Télécharge un fichier texte
 */
export function downloadText(text: string, filename: string): void {
  downloadFile(text, filename, 'text/plain;charset=utf-8');
}

/**
 * Type MIME par extension de fichier
 */
const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.pulse-backup': 'application/json',
};

/**
 * Télécharge un fichier en détectant le type MIME depuis l'extension
 */
export function downloadWithAutoMime(content: string, filename: string): void {
  const ext = filename.slice(filename.lastIndexOf('.'));
  const mimeType = MIME_TYPES[ext] ?? 'text/plain;charset=utf-8';
  downloadFile(content, filename, mimeType);
}
