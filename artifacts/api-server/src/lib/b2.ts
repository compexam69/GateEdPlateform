import crypto from "crypto";

const B2_ACCOUNT_ID = process.env["B2_ACCOUNT_ID"]!;
const B2_APPLICATION_KEY_ID = process.env["B2_APPLICATION_KEY_ID"]!;
const B2_APPLICATION_KEY = process.env["B2_APPLICATION_KEY"]!;
const B2_BUCKET_NAME = process.env["B2_BUCKET_NAME"]!;

let authToken: string | null = null;
let apiUrl: string | null = null;
let downloadUrl: string | null = null;
let bucketId: string | null = null;
let authExpiry = 0;

async function authorizeB2(): Promise<void> {
  if (authToken && Date.now() < authExpiry) return;

  const creds = Buffer.from(`${B2_APPLICATION_KEY_ID}:${B2_APPLICATION_KEY}`).toString("base64");
  const res = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    headers: { Authorization: `Basic ${creds}` },
  });

  if (!res.ok) throw new Error(`B2 auth failed: ${res.status}`);
  const data = (await res.json()) as {
    authorizationToken: string;
    apiUrl: string;
    downloadUrl: string;
  };

  authToken = data.authorizationToken;
  apiUrl = data.apiUrl;
  downloadUrl = data.downloadUrl;
  authExpiry = Date.now() + 23 * 60 * 60 * 1000;

  const bucketRes = await fetch(`${apiUrl}/b2api/v2/b2_list_buckets`, {
    method: "POST",
    headers: { Authorization: authToken, "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: B2_ACCOUNT_ID, bucketName: B2_BUCKET_NAME }),
  });
  const bucketData = (await bucketRes.json()) as { buckets: { bucketId: string }[] };
  bucketId = bucketData.buckets[0]?.bucketId ?? null;
}

export async function getUploadPresignedUrl(
  storagePath: string
): Promise<{ uploadUrl: string; uploadAuthToken: string }> {
  await authorizeB2();
  const res = await fetch(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: authToken!, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId }),
  });
  if (!res.ok) throw new Error(`Failed to get upload URL: ${res.status}`);
  const data = (await res.json()) as { uploadUrl: string; authorizationToken: string };
  return { uploadUrl: data.uploadUrl, uploadAuthToken: data.authorizationToken };
}

export async function getDownloadPresignedUrl(storagePath: string): Promise<string> {
  await authorizeB2();
  const expiresInSeconds = 15 * 60;
  const url = `${downloadUrl}/file/${B2_BUCKET_NAME}/${storagePath}`;

  const validDurationInSeconds = expiresInSeconds;
  const timestamp = Math.floor(Date.now() / 1000);
  const expirationTimestamp = timestamp + validDurationInSeconds;

  const signedUrl = `${url}?Authorization=${authToken}&b2Expires=${expirationTimestamp}`;
  return signedUrl;
}

export async function deleteB2File(storagePath: string, fileId: string): Promise<void> {
  await authorizeB2();
  await fetch(`${apiUrl}/b2api/v2/b2_delete_file_version`, {
    method: "POST",
    headers: { Authorization: authToken!, "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: storagePath, fileId }),
  });
}

export async function getB2FileIdByPath(storagePath: string): Promise<string | null> {
  await authorizeB2();
  try {
    const res = await fetch(`${apiUrl}/b2api/v2/b2_list_file_versions`, {
      method: "POST",
      headers: { Authorization: authToken!, "Content-Type": "application/json" },
      body: JSON.stringify({ bucketId, prefix: storagePath, maxFileCount: 1 }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { files: { fileId: string; fileName: string }[] };
    const file = data.files?.find(f => f.fileName === storagePath);
    return file?.fileId ?? null;
  } catch {
    return null;
  }
}

export function generateStoragePath(userId: string, chapterId: string, filename: string): string {
  const timestamp = Date.now();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `users/${userId}/chapters/${chapterId}/notes_${timestamp}_${safe}`;
}

export function generateProfilePhotoPath(userId: string): string {
  return `users/${userId}/profile/photo.jpg`;
}

export function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
