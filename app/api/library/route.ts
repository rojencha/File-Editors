import { del } from "@vercel/blob";
import { serverConfig } from "@/lib/server/config";
import { blobSize, purgeExpired, readMeta, writeMeta } from "@/lib/server/meta";
import { assertId, errorResponse, filePath, HttpError, workspaceIdFromRequest } from "@/lib/server/workspace";
import type { FileRecord, Group } from "@/lib/types";

export const dynamic = "force-dynamic";

const clean = (v: unknown, max = 120): string => {
  if (typeof v !== "string") throw new HttpError(400, "Expected a string.");
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "_").trim().slice(0, max);
  if (!s) throw new HttpError(400, "Name cannot be empty.");
  return s;
};

function need() {
  if (!serverConfig.cloud) throw new HttpError(503, "Cloud storage is not configured.");
}

export async function GET(req: Request) {
  try {
    need();
    const ws = workspaceIdFromRequest(req);
    const meta = await readMeta(ws);
    if (await purgeExpired(ws, meta)) await writeMeta(ws, meta);
    return Response.json(meta);
  } catch (e) {
    return errorResponse(e);
  }
}

type Op =
  | { op: "commitFile"; id: string; name: string; mime: string; groupId: string | null; origin?: string }
  | { op: "updateFile"; id: string; name?: string; groupId?: string | null }
  | { op: "deleteFiles"; ids: string[] }
  | { op: "createGroup"; name: string }
  | { op: "renameGroup"; id: string; name: string }
  | { op: "deleteGroup"; id: string; deleteFiles: boolean };

export async function POST(req: Request) {
  try {
    need();
    const ws = workspaceIdFromRequest(req);
    const body = (await req.json()) as Op;
    const meta = await readMeta(ws);
    await purgeExpired(ws, meta);
    const groupExists = (id: string | null) => id === null || meta.groups.some((g) => g.id === id);
    let result: unknown = null;

    switch (body.op) {
      case "commitFile": {
        const id = assertId(body.id);
        const info = await blobSize(filePath(ws, id));
        if (!info) throw new HttpError(404, "Upload not found. Please try again.");
        if (info.size > serverConfig.maxFileBytes) {
          await del(filePath(ws, id)).catch(() => undefined);
          throw new HttpError(413, "File is larger than the allowed size.");
        }
        const used = meta.files.filter((f) => f.id !== id).reduce((s, f) => s + f.size, 0);
        if (used + info.size > serverConfig.maxWorkspaceBytes) {
          await del(filePath(ws, id)).catch(() => undefined);
          throw new HttpError(413, "Workspace storage limit reached.");
        }
        const groupId = body.groupId && groupExists(body.groupId) ? body.groupId : null;
        const existing = meta.files.find((f) => f.id === id);
        if (existing) {
          existing.size = info.size;
          if (body.name) existing.name = clean(body.name);
          result = existing;
        } else {
          const now = Date.now();
          const rec: FileRecord = {
            id,
            name: clean(body.name),
            mime: typeof body.mime === "string" ? body.mime.slice(0, 100) : "application/octet-stream",
            size: info.size,
            groupId,
            createdAt: now,
            origin: body.origin ? clean(body.origin, 80) : undefined,
            expiresAt: now + serverConfig.retentionDays * 86_400_000,
          };
          meta.files.push(rec);
          result = rec;
        }
        break;
      }
      case "updateFile": {
        const f = meta.files.find((x) => x.id === assertId(body.id));
        if (!f) throw new HttpError(404, "File not found.");
        if (body.name !== undefined) f.name = clean(body.name);
        if (body.groupId !== undefined) {
          if (!groupExists(body.groupId)) throw new HttpError(404, "Group not found.");
          f.groupId = body.groupId;
        }
        result = f;
        break;
      }
      case "deleteFiles": {
        const ids = (Array.isArray(body.ids) ? body.ids : []).map(assertId).slice(0, 500);
        await del(ids.map((id) => filePath(ws, id))).catch(() => undefined);
        meta.files = meta.files.filter((f) => !ids.includes(f.id));
        break;
      }
      case "createGroup": {
        if (meta.groups.length >= 100) throw new HttpError(400, "Group limit reached.");
        const g: Group = { id: crypto.randomUUID().replace(/-/g, "").slice(0, 24), name: clean(body.name, 60), createdAt: Date.now() };
        meta.groups.push(g);
        result = g;
        break;
      }
      case "renameGroup": {
        const g = meta.groups.find((x) => x.id === body.id);
        if (!g) throw new HttpError(404, "Group not found.");
        g.name = clean(body.name, 60);
        result = g;
        break;
      }
      case "deleteGroup": {
        const g = meta.groups.find((x) => x.id === body.id);
        if (!g) throw new HttpError(404, "Group not found.");
        const inGroup = meta.files.filter((f) => f.groupId === g.id);
        if (body.deleteFiles) {
          await del(inGroup.map((f) => filePath(ws, f.id))).catch(() => undefined);
          meta.files = meta.files.filter((f) => f.groupId !== g.id);
        } else {
          inGroup.forEach((f) => (f.groupId = null));
        }
        meta.groups = meta.groups.filter((x) => x.id !== g.id);
        break;
      }
      default:
        throw new HttpError(400, "Unknown operation.");
    }
    await writeMeta(ws, meta);
    return Response.json({ result, meta });
  } catch (e) {
    return errorResponse(e);
  }
}
