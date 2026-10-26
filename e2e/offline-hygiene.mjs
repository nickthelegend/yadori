// The expected S16 response is identified by its recorded request, endpoint,
// method, group, body and observed recovery. Console/page errors never qualify.
export function isExpectedS16Response(event, s16, source) {
  if (!['audit/browser/offline-502/events.jsonl', 'audit/browser/offline-502/network.json'].includes(source)) return false;
  const detail = s16?.detail, network = detail?.network, spirit = detail?.spirits?.[0];
  return s16?.id === 'S16' && event.kind === 'response' && event.group === 'S16'
    && event.method === 'POST' && event.url === 'https://localhost:8091/api/wake'
    && event.status === 502 && Number.isInteger(event.requestId)
    && event.requestId === network?.requestId && network.status === 502
    && network.body?.gateway === 'offline'
    && network.body?.error === 'Gateway offline: start it with pnpm gateway'
    && detail.waking === null && detail.spirits?.length === 1
    && spirit?.id?.startsWith('local-') && spirit.faceSource === 'built-in' && !spirit.hasPersona
    && typeof detail.body === 'string' && detail.body.includes('Gateway:') && detail.body.includes('Waking with the built-in face.');
}

export function isRuntimeFailure(event, s16, source) {
  const kind = event.kind ?? event.type;
  return kind === 'pageerror' || kind === 'requestfailed' || kind === 'runner-error'
    || kind === 'console' && event.level === 'error'
    || kind === 'response' && event.status >= 400 && !isExpectedS16Response(event, s16, source);
}
