import { del, get, head, put } from "@vercel/blob";
import { emptyMeta, type WorkspaceMeta } from "@/lib/types";
import { filePath, metaPath } from "./workspace";

export async function readMeta(ws: string): Promise<WorkspaceMeta> {
  const res = await get(metaPath(ws), { access: "private", useCache: false });
  if (!res || res.statusCode !== 200) return emptyMeta();
  try {
    const parsed = JSON.parse(await new Response(res.stream).text()) as WorkspaceMeta;
    if (parsed?.v === 1 && Array.isArray(parsed.files) && Array.isArray(parsed.groups)) return parsed;
  } catch {
    /* fall through */
  }
  return emptyMeta();
}

export async function writeMeta(ws: string, meta: WorkspaceMeta): Promise<void> {
  await put(metaPath(ws), JSON.stringify(meta), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: 60,
  });
}

/** Removes expired files (and their blobs). Returns true when the metadata changed. */
export async function purgeExpired(ws: string, meta: WorkspaceMeta, now = Date.now()): Promise<boolean> {
  const expired = meta.files.filter((f) => f.expiresAt && f.expiresAt <= now);
  if (!expired.length) return false;
  await del(expired.map((f) => filePath(ws, f.id))).catch(() => undefined);
  meta.files = meta.files.filter((f) => !expired.includes(f));
  return true;
}

export async function blobSize(pathname: string): Promise<{ size: number; contentType: string } | null> {
  try {
    const h = await head(pathname);
    return { size: h.size, contentType: h.contentType };
  } catch {
    return null;
  }
}
