import { list } from "@vercel/blob";
import { serverConfig } from "@/lib/server/config";
import { purgeExpired, readMeta, writeMeta } from "@/lib/server/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily housekeeping: deletes files past their retention window. Protected by CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!serverConfig.cloud) return Response.json({ skipped: "cloud storage not configured" });

  let cursor: string | undefined;
  let workspaces = 0;
  let changed = 0;
  do {
    const page = await list({ prefix: "ws/", limit: 500, cursor });
    for (const b of page.blobs) {
      const m = /^ws\/([a-f0-9]{40})\/meta\.json$/.exec(b.pathname);
      if (!m) continue;
      workspaces++;
      const meta = await readMeta(m[1]);
      if (await purgeExpired(m[1], meta)) {
        await writeMeta(m[1], meta);
        changed++;
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return Response.json({ workspaces, changed });
}
