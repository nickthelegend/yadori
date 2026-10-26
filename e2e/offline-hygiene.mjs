// The expected S16 response is identified by its recorded request, endpoint,
// method, group, body and observed recovery. Chrome's one resource line for
// that same wake URL is the browser's note of the 502, not another failure.
const S16_SOURCES = ['audit/browser/offline-502/events.jsonl', 'audit/browser/offline-502/network.json'];
const S16_WAKE_URL = 'https://localhost:8091/api/wake';
const S16_CHROME_502 = 'Failed to load resource: the server responded with a status of 502 ()';

function isS16Source(source) {
  return S16_SOURCES.includes(source);
}

function isS16Wake502(network) {
  return network?.method === 'POST' && network?.url === S16_WAKE_URL && network?.status === 502
    && network?.body?.gateway === 'offline'
    && network?.body?.error === 'Gateway offline: start it with pnpm gateway';
}

export function isExpectedS16Response(event, s16, source) {
  if (!isS16Source(source)) return false;
  const detail = s16?.detail, network = detail?.network, spirit = detail?.spirits?.[0];
  return s16?.id === 'S16' && event.kind === 'response' && event.group === 'S16'
    && event.method === 'POST' && event.url === S16_WAKE_URL
    && event.status === 502 && Number.isInteger(event.requestId)
    && event.requestId === network?.requestId && isS16Wake502(network)
    && detail.waking === null && detail.spirits?.length === 1
    && spirit?.id?.startsWith('local-') && spirit.faceSource === 'built-in' && !spirit.hasPersona
    && typeof detail.body === 'string' && detail.body.includes('Gateway:') && detail.body.includes('Waking with the built-in face.');
}

// Group S16, Chrome's exact resource text, the wake URL, an accepted capture
// file, and a saved proof whose wake response is that 502.
export function isExpectedS16Console(event, s16, source) {
  if (!isS16Source(source)) return false;
  const kind = event.kind ?? event.type;
  return s16?.id === 'S16' && kind === 'console' && event.group === 'S16' && event.level === 'error'
    && event.text === S16_CHROME_502 && event.location?.url === S16_WAKE_URL
    && isS16Wake502(s16?.detail?.network);
}

export function isRuntimeFailure(event, s16, source) {
  if (isExpectedS16Console(event, s16, source)) return false;
  const kind = event.kind ?? event.type;
  return kind === 'pageerror' || kind === 'requestfailed' || kind === 'runner-error'
    || kind === 'console' && event.level === 'error'
    || kind === 'response' && event.status >= 400 && !isExpectedS16Response(event, s16, source);
}
