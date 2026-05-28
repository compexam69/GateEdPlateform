import crypto from "crypto";
import { logger } from "./logger";

const B2_ACCOUNT_ID = process.env["B2_ACCOUNT_ID"] ?? "";
const B2_APPLICATION_KEY_ID = process.env["B2_APPLICATION_KEY_ID"] ?? "";
const B2_APPLICATION_KEY = process.env["B2_APPLICATION_KEY"] ?? "";
const B2_BUCKET_NAME = process.env["B2_BUCKET_NAME"] ?? "";

let authToken: string | null = null;
let authorizedAccountId: string | null = null;
let apiUrl: string | null = null;
let downloadUrl: string | null = null;
let bucketId: string | null = null;
let authExpiry = 0;

function validateCredentials(): void {
  const missing: string[] = [];
  if (!B2_ACCOUNT_ID) missing.push("B2_ACCOUNT_ID");
  if (!B2_APPLICATION_KEY_ID) missing.push("B2_APPLICATION_KEY_ID");
  if (!B2_APPLICATION_KEY) missing.push("B2_APPLICATION_KEY");
  if (!B2_BUCKET_NAME) missing.push("B2_BUCKET_NAME");
  if (missing.length > 0) {
    throw new Error(`B2 storage not configured — missing env vars: ${missing.join(", ")}`);
  }
}

async function authorizeB2(): Promise<void> {
  validateCredentials();

  if (authToken && Date.now() < authExpiry) return;

  logger.info("[b2] Authorizing with Backblaze B2...");
  const creds = Buffer.from(`${B2_APPLICATION_KEY_ID}:${B2_APPLICATION_KEY}`).toString("base64");
  const res = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    headers: { Authorization: `Basic ${creds}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error({ status: res.status, body }, "[b2] Authorization failed");
    throw new Error(`B2 auth failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    authorizationToken: string;
    accountId: string;
    apiUrl: string;
    downloadUrl: string;
  };

  authToken = data.authorizationToken;
  // Always use the accountId returned by B2 — not the raw env var.
  // With application keys, B2 may return a different accountId than the
  // master account ID, and using the wrong one causes "accountId invalid".
  authorizedAccountId = data.accountId;
  apiUrl = data.apiUrl;
  downloadUrl = data.downloadUrl;
  authExpiry = Date.now() + 23 * 60 * 60 * 1000;
  logger.info({ accountId: authorizedAccountId }, "[b2] Authorized successfully, resolving bucket...");

  const bucketRes = await fetch(`${apiUrl}/b2api/v2/b2_list_buckets`, {
    method: "POST",
    headers: { Authorization: authToken, "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: authorizedAccountId, bucketName: B2_BUCKET_NAME }),
  });

  if (!bucketRes.ok) {
    const body = await bucketRes.text().catch(() => "");
    logger.error({ status: bucketRes.status, body }, "[b2] Bucket lookup failed");
    authToken = null;
    throw new Error(`B2 bucket lookup failed (${bucketRes.status}): ${body}`);
  }

  const bucketData = (await bucketRes.json()) as { buckets: { bucketId: string }[] };
  bucketId = bucketData.buckets[0]?.bucketId ?? null;

  if (!bucketId) {
    authToken = null;
    throw new Error(`B2 bucket "${B2_BUCKET_NAME}" not found — check B2_BUCKET_NAME`);
  }

  logger.info({ bucketId }, "[b2] Bucket resolved");
}

// Force re-auth on next call (called when an upload URL returns 401)
function invalidateAuth(): void {
  authToken = null;
  authorizedAccountId = null;
  authExpiry = 0;
}

export async function getUploadPresignedUrl(
  storagePath: string
): Promise<{ uploadUrl: string; uploadAuthToken: string }> {
  await authorizeB2();
  logger.info({ storagePath }, "[b2] Requesting upload URL");

  const res = await fetch(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: authToken!, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error({ status: res.status, body, storagePath }, "[b2] get_upload_url failed");
    // 401 means our auth token expired — invalidate so next call re-auths
    if (res.status === 401) invalidateAuth();
    throw new Error(`B2 get_upload_url failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { uploadUrl: string; authorizationToken: string };
  logger.info({ storagePath }, "[b2] Upload URL generated successfully");
  return { uploadUrl: data.uploadUrl, uploadAuthToken: data.authorizationToken };
}

export async function getDownloadPresignedUrl(storagePath: string): Promise<string> {
  await authorizeB2();

  const expiresInSeconds = 15 * 60;

  // Use b2_get_download_authorization for proper signed download URLs
  const authRes = await fetch(`${apiUrl}/b2api/v2/b2_get_download_authorization`, {
    method: "POST",
    headers: { Authorization: authToken!, "Content-Type": "application/json" },
    body: JSON.stringify({
      bucketId,
      fileNamePrefix: storagePath,
      validDurationInSeconds: expiresInSeconds,
    }),
  });

  if (!authRes.ok) {
    const body = await authRes.text().catch(() => "");
    logger.error({ status: authRes.status, body, storagePath }, "[b2] get_download_authorization failed");
    if (authRes.status === 401) invalidateAuth();
    throw new Error(`B2 get_download_authorization failed (${authRes.status}): ${body}`);
  }

  const { authorizationToken } = (await authRes.json()) as { authorizationToken: string };
  const url = `${downloadUrl}/file/${B2_BUCKET_NAME}/${storagePath}?Authorization=${authorizationToken}`;
  return url;
}

export async function deleteB2File(storagePath: string, fileId: string): Promise<void> {
  await authorizeB2();
  const res = await fetch(`${apiUrl}/b2api/v2/b2_delete_file_version`, {
    method: "POST",
    headers: { Authorization: authToken!, "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: storagePath, fileId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn({ status: res.status, body, storagePath, fileId }, "[b2] delete_file_version failed (non-fatal)");
  }
}

export function generateStoragePath(userId: string, chapterId: string, filename: string): string {
  const timestamp = Date.now();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `users/${userId}/chapters/${chapterId}/notes_${timestamp}_${safe}`;
}

export function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
