import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { serverConfig } from "@/lib/server/config";
import { readMeta } from "@/lib/server/meta";
import { errorResponse, filePath, HttpError, tmpPath, workspaceIdFromToken, ID_RE } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

/**
 * Issues short-lived, path-scoped client tokens so the browser uploads straight to Vercel Blob
 * (this avoids the 4.5 MB serverless request-body limit). The storage credential never leaves the server.
 */
export async function POST(req: Request) {
  try {
    if (!serverConfig.cloud) throw new HttpError(503, "Cloud storage is not configured.");
    const body = (await req.json()) as HandleUploadBody;

    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: { token?: string; kind?: string };
        try {
          payload = JSON.parse(clientPayload ?? "{}");
        } catch {
          throw new HttpError(400, "Bad upload payload.");
        }
        const ws = workspaceIdFromToken(payload.token);
        const m = /^ws\/[a-f0-9]{40}\/(files|tmp)\/([a-f0-9]{24})$/.exec(pathname);
        if (!m || !ID_RE.test(m[2])) throw new HttpError(400, "Invalid upload path.");
        const expected = m[1] === "files" ? filePath(ws, m[2]) : tmpPath(ws, m[2]);
        if (pathname !== expected) throw new HttpError(403, "Upload path does not belong to this workspace.");

        if (m[1] === "files") {
          const meta = await readMeta(ws);
          const used = meta.files.reduce((s, f) => s + f.size, 0);
          if (used >= serverConfig.maxWorkspaceBytes)
            throw new HttpError(413, "This workspace has reached its storage limit. Delete some files first.");
        }
        return {
          maximumSizeInBytes: serverConfig.maxFileBytes,
          allowOverwrite: true,
          addRandomSuffix: false,
          cacheControlMaxAge: 60,
        };
      },
    });
    return Response.json(json);
  } catch (e) {
    return errorResponse(e);
  }
}
