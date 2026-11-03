import { get } from "@vercel/blob";
import { serverConfig } from "@/lib/server/config";
import { readMeta } from "@/lib/server/meta";
import { assertId, errorResponse, filePath, HttpError, tmpPath, workspaceIdFromRequest } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

/** Streams a private blob to its owner. Access is gated by the workspace token header. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    if (!serverConfig.cloud) throw new HttpError(503, "Cloud storage is not configured.");
    const ws = workspaceIdFromRequest(req);
    const { id } = await ctx.params;
    assertId(id);
    const isTmp = new URL(req.url).searchParams.get("tmp") === "1";
    if (!isTmp) {
      const meta = await readMeta(ws);
      if (!meta.files.some((f) => f.id === id)) throw new HttpError(404, "File not found.");
    }
    const res = await get(isTmp ? tmpPath(ws, id) : filePath(ws, id), { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) throw new HttpError(404, "File not found.");
    return new Response(res.stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
