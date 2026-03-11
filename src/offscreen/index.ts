// Offscreen document for DOM scraping
// Receives SCRAPE_URL messages, fetches page, parses HTML, returns results

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SCRAPE_URL') {
    const { url, connectorId } = message.payload as { url: string; connectorId: string };
    handleScrape(url, connectorId).then(sendResponse);
    return true; // async response
  }
});

async function handleScrape(url: string, _connectorId: string): Promise<{ type: string; payload: { html: string } }> {
  try {
    const response = await fetch(url, { credentials: 'include' });
    const html = await response.text();
    return { type: 'SCRAPE_RESULT', payload: { html } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scraping error';
    return { type: 'SCRAPE_ERROR', payload: { html: '' } };
  }
}

export {};
