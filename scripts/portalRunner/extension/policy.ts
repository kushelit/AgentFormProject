export const portalDomains = [
  'clalnet.co.il', 'clalbit.co.il', 'migdal.co.il', 'fnx.co.il', 'menora.co.il',
  'harel-group.co.il', 'harel.co.il', 'ayalon-ins.co.il', 'more.co.il', 'meitav.co.il',
  'analyst.co.il', 'as-invest.co.il', 'hcsra.co.il', 'yl-invest.co.il', 'malam-payroll.com',
];
export const firebaseHosts = ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com',
  'firestore.googleapis.com', 'firebasestorage.googleapis.com', '*.cloudfunctions.net'];
export function allowedPortal(url: string) {
  if (url === 'about:blank') return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && portalDomains.some(d => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch { return false; }
}
export function canClaim(run: any, agentId: string, runnerId: string) {
  return (!run?.executionMode || run.executionMode === 'extension') &&
    (run?.executionMode !== 'extension' || run.reservedRunnerId === runnerId) &&
    run?.status === 'queued' && run.agentId === agentId && !run.runner?.claimedAt &&
    (!run.reservedRunnerId || run.reservedRunnerId === runnerId);
}
export const terminal = new Set(['done', 'success', 'error', 'failed', 'skipped']);
export function storagePath(agentId: string, runId: string, subdir: string, filename: string) {
  const safe = (v: string) => v.trim().replace(/[/\\]+/g, '_').replace(/\.\.+/g, '_');
  return ['portalRuns', safe(agentId), safe(runId), ...(subdir ? [safe(subdir)] : []), safe(filename)].join('/');
}
export function exportFilename(headers: {name: string; value: string}[], url: string) {
  const disposition = headers.find(h => h.name.toLowerCase() === 'content-disposition')?.value || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let name = disposition.match(/filename="([^"]+)"|filename=([^;]+)/i)?.slice(1).find(Boolean);
  if (encoded) { try { name = decodeURIComponent(encoded); } catch {} }
  return (name || new URL(url).pathname.split('/').pop() || 'report.bin').trim().replace(/[/\\\x00-\x1f]/g, '_');
}
export function isReport(headers: {name: string; value: string}[], url: string) {
  const h = Object.fromEntries(headers.map(h => [h.name.toLowerCase(), h.value.toLowerCase()]));
  const filename = exportFilename(headers,url);
  if (/\.(ttf|otf|woff2?|eot|css|js|png|jpe?g|gif|svg|ico)(?:[?#]|$)/i.test(filename) ||
      /^(font\/|application\/(?:font|x-font)|text\/(?:css|javascript)|image\/)/i.test(h['content-type'] || '')) return false;
  return /attachment/.test(h['content-disposition'] || '') ||
    /spreadsheet|ms-excel|application\/zip|text\/csv/.test(h['content-type'] || '') ||
    /\.(xlsx?|csv|zip)(?:[?#]|$)/i.test(url);
}
