/**
 * File downloads in the browser
 * Shell = I/O: DOM interaction
 */

/**
 * Downloads a file with the given content, name and MIME type
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  // Create a Blob with the content
  const blob = new Blob([content], { type: mimeType });

  // Create an object URL for the blob
  const url = URL.createObjectURL(blob);

  // Create a temporary link element
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Append to the DOM, click, then remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoke the object URL
  URL.revokeObjectURL(url);
}

/**
 * Downloads JSON data
 */
export function downloadJSON(data: unknown, filename: string): void {
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  downloadFile(content, filename, 'application/json');
}

/**
 * Downloads a CSV file
 */
export function downloadCSV(csv: string, filename: string): void {
  // Add UTF-8 BOM for Excel
  const content = '\ufeff' + csv;
  downloadFile(content, filename, 'text/csv;charset=utf-8');
}

/**
 * Downloads a Markdown file
 */
export function downloadMarkdown(md: string, filename: string): void {
  downloadFile(md, filename, 'text/markdown;charset=utf-8');
}

/**
 * Downloads a text file
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
 * Downloads a file, detecting the MIME type from the extension
 */
export function downloadWithAutoMime(content: string, filename: string): void {
  const ext = filename.slice(filename.lastIndexOf('.'));
  const mimeType = MIME_TYPES[ext] ?? 'text/plain;charset=utf-8';
  downloadFile(content, filename, mimeType);
}
