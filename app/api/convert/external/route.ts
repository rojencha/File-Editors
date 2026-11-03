import { del, get } from "@vercel/blob";
import { serverConfig } from "@/lib/server/config";
import { assertId, errorResponse, HttpError, tmpPath, workspaceIdFromRequest } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Replaceable adapter for an external conversion provider.
 * The browser first uploads the source to a temporary private blob; this route forwards it to
 * CONVERT_API_URL (multipart: file, target, filename) and streams the converted bytes back.
 * Swap providers by changing the three env vars, or edit `callProvider` below.
 */
async function callProvider(input: { stream: ReadableStream<Uint8Array>; filename: string; target: string }) {
  const ext = serverConfig.external;
  if (!ext.enabled || !ext.url) throw new HttpError(503, "No external conversion provider is configured.");
  const buf = await new Response(input.stream).arrayBuffer();
  const form = new FormData();
  form.append("file", new Blob([buf]), input.filename);
  form.append("target", input.target);
  form.append("filename", input.filename);
  const res = await fetch(ext.url, {
    method: "POST",
    body: form,
    headers: ext.key ? { Authorization: `Bearer ${ext.key}` } : undefined,
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok || !res.body) throw new HttpError(502, `The conversion provider returned ${res.status}.`);
  return res;
}

export async function POST(req: Request) {
  let ws = "";
  let tmpId = "";
  try {
    ws = workspaceIdFromRequest(req);
    if (!serverConfig.external.enabled) throw new HttpError(503, "No external conversion provider is configured.");
    const body = (await req.json()) as { tmpId?: string; name?: string; target?: string };
    tmpId = assertId(body.tmpId);
    const name = String(body.name ?? "input").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 120);
    const target = String(body.target ?? "pdf").toLowerCase();
    if (!/^[a-z0-9]{2,5}$/.test(target)) throw new HttpError(400, "Invalid target format.");

    const src = await get(tmpPath(ws, tmpId), { access: "private", useCache: false });
    if (!src || src.statusCode !== 200) throw new HttpError(404, "Temporary upload not found.");

    const res = await callProvider({ stream: src.stream, filename: name, target });
    const path = tmpPath(ws, tmpId);
    const cleanup = new TransformStream<Uint8Array, Uint8Array>({
      flush: async () => {
        await del(path).catch(() => undefined);
      },
    });
    return new Response(res.body!.pipeThrough(cleanup), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (ws && tmpId) await del(tmpPath(ws, tmpId)).catch(() => undefined);
    return errorResponse(e);
  }
}
