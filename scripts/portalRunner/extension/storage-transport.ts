import { getAuth } from 'firebase/auth/web-extension';

type Target = {storage: any; bucket: string; path: string};
export function ref(storage: any, path: string): Target {
  const bucket = storage.app.options.storageBucket;
  if (!bucket) throw new Error('STORAGE_BUCKET_REQUIRED');
  return {storage, bucket, path};
}
async function request(target: Target, upload?: {bytes: Uint8Array; metadata: any}) {
  const user = getAuth(target.storage.app).currentUser;
  if (!user) throw Object.assign(new Error('Authentication required'), {code:'storage/unauthenticated'});
  const headers: Record<string,string> = {Authorization:`Firebase ${await user.getIdToken()}`};
  const base = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(target.bucket)}/o`;
  let url = `${base}/${encodeURIComponent(target.path)}`, body: Blob | undefined;
  if (upload) {
    url = `${base}?name=${encodeURIComponent(target.path)}`;
    const boundary = 'portal_' + crypto.randomUUID().replace(/-/g,'');
    headers['X-Goog-Upload-Protocol'] = 'multipart';
    headers['Content-Type'] = `multipart/related; boundary=${boundary}`;
    const contentType = upload.metadata.contentType || 'application/octet-stream';
    const metadata = JSON.stringify({name:target.path,contentType,metadata:upload.metadata.customMetadata || {}});
    body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
      new Uint8Array(upload.bytes),`\r\n--${boundary}--`]);
  }
  let response: Response;
  try { response = await fetch(url,{method:upload ? 'POST':'GET',headers,body,signal:AbortSignal.timeout(120000)}); }
  catch { throw Object.assign(new Error('Storage request failed'),{code:'storage/retry-limit-exceeded'}); }
  if (!response.ok) {
    const code = response.status === 404 ? 'object-not-found' : response.status === 401 ? 'unauthenticated' :
      response.status === 403 ? 'unauthorized' : response.status === 429 || response.status >= 500 ? 'retry-limit-exceeded' : 'unknown';
    throw Object.assign(new Error('Storage request rejected'),{code:`storage/${code}`});
  }
  const metadata = await response.json();
  return {...metadata,size:Number(metadata.size),customMetadata:metadata.metadata || {}};
}
export const getMetadata = (target: Target) => request(target);
export const uploadBytes = (target: Target, bytes: Uint8Array, metadata: any) => request(target,{bytes,metadata});
