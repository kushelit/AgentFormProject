import fs from "fs";
import path from "path";
import { ref as storageRef, uploadBytes } from "firebase/storage";

function guessContentType(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".csv")) return "text/csv";
  return "application/octet-stream";
}

export async function uploadLocalFileToStorageClient(params: {
  storage: any;
  localPath: string;
  agentId: string;
  runId: string;
}) {
  const { storage, localPath, agentId, runId } = params;

  if (!fs.existsSync(localPath)) throw new Error(`File not found: ${localPath}`);
  const filename = path.basename(localPath);
  const bytes = fs.readFileSync(localPath);

  const storagePath = `portalRuns/${agentId}/${runId}/${filename}`;
  const r = storageRef(storage, storagePath);

  await uploadBytes(r, bytes, { contentType: guessContentType(filename) });

  return { storagePath, filename };
}
