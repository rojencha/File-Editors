import { createHash } from "node:crypto";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * The workspace token lives only in the browser. The server derives an opaque id by hashing it,
 * so storage paths never contain the token itself.
 */
export function workspaceIdFromToken(token: string | null | undefined): string {
  if (!token || !TOKEN_RE.test(token)) throw new HttpError(401, "Missing or invalid workspace token.");
  return createHash("sha256").update(token).digest("hex").slice(0, 40);
}

export function workspaceIdFromRequest(req: Request): string {
  return workspaceIdFromToken(req.headers.get("x-workspace-token"));
}

export const ID_RE = /^[a-f0-9]{24}$/;

export function assertId(id: unknown): string {
  if (typeof id !== "string" || !ID_RE.test(id)) throw new HttpError(400, "Invalid id.");
  return id;
}

export const filePath = (ws: string, id: string) => `ws/${ws}/files/${id}`;
export const tmpPath = (ws: string, id: string) => `ws/${ws}/tmp/${id}`;
export const metaPath = (ws: string) => `ws/${ws}/meta.json`;

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Unexpected server error." }, { status: 500 });
}
