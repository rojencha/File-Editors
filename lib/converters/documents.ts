import { baseName, extOf } from "@/lib/format";
import { DOC_STYLE, documentToHtml, markdownToHtml, sanitizeHtml } from "@/lib/doc-html";
import { htmlToPdf } from "@/lib/html-to-pdf";
import { tmpUpload } from "@/lib/storage/cloud";
import { getWorkspaceToken } from "@/lib/storage/workspace-token";
import { checkAbort, ConversionError, type Converter } from "./types";

const LOCAL_DOC_EXT = ["docx", "txt", "md", "markdown", "html", "htm", "csv"];

export const documentToPdf: Converter = {
  id: "document-to-pdf",
  group: "Documents",
  label: "Document → PDF",
  description: "Convert Word (.docx), Markdown, HTML, CSV and plain-text files to PDF.",
  from: "DOCX, MD, HTML, CSV, TXT",
  to: "PDF",
  mode: "each",
  runtime: "browser",
  accepts: (f) => LOCAL_DOC_EXT.includes(extOf(f.name)),
  note: "Converted in your browser to A4 pages. Headings, lists, tables and images are kept, but text in the PDF is an image (not selectable) and complex Word layouts (headers, footers, text boxes) are simplified.",
  async run(files, ctx) {
    const out = [];
    for (let i = 0; i < files.length; i++) {
      checkAbort(ctx.signal);
      const f = files[i];
      ctx.onProgress((i / files.length) * 100, `Rendering ${f.name}`);
      const html = await documentToHtml(f);
      const blob = await htmlToPdf(html, (p) => ctx.onProgress(((i + p / 100) / files.length) * 100, `Rendering ${f.name}`), ctx.signal);
      out.push({ name: `${baseName(f.name)}.pdf`, blob });
    }
    ctx.onProgress(100);
    return out;
  },
};

export const markdownToHtmlFile: Converter = {
  id: "markdown-to-html",
  group: "Documents",
  label: "Markdown → HTML",
  description: "Turn Markdown into a standalone, styled HTML page.",
  from: "Markdown",
  to: "HTML",
  mode: "each",
  runtime: "browser",
  accepts: (f) => ["md", "markdown"].includes(extOf(f.name)),
  note: "Supports headings, lists, links, code, quotes and emphasis. Tables inside Markdown are not converted.",
  async run(files, ctx) {
    const out = [];
    for (const f of files) {
      checkAbort(ctx.signal);
      const body = sanitizeHtml(markdownToHtml(await f.text()));
      const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${baseName(f.name)}</title><style>${DOC_STYLE}body{max-width:760px;margin:40px auto;padding:0 20px}</style></head><body>${body}</body></html>`;
      out.push({ name: `${baseName(f.name)}.html`, blob: new Blob([page], { type: "text/html" }) });
    }
    ctx.onProgress(100);
    return out;
  },
};

const DEFAULT_PROVIDER_FORMATS = ["docx", "doc", "xlsx", "xls", "pptx", "ppt", "odt", "ods", "odp", "rtf"];

/** One locked-or-unlocked converter per provider format. Replace `run` to target a different provider API. */
export function providerConverters(): Converter[] {
  return DEFAULT_PROVIDER_FORMATS.filter((e) => e !== "docx").map((ext) => ({
    id: `provider-${ext}-to-pdf`,
    group: "Documents" as const,
    label: `${ext.toUpperCase()} → PDF`,
    description: `High-fidelity ${ext.toUpperCase()} to PDF conversion using an external service.`,
    from: ext.toUpperCase(),
    to: "PDF",
    mode: "each" as const,
    runtime: "provider" as const,
    accepts: (f: File) => extOf(f.name) === ext,
    note: "Your file is sent to the configured conversion service and removed from temporary storage afterwards.",
    available: (env) => {
      const c = env.config?.external;
      if (!c?.enabled) return { ok: false as const, reason: "Needs an external conversion provider. Set CONVERT_API_URL and BLOB_READ_WRITE_TOKEN to enable it." };
      if (!c.formats.includes(ext)) return { ok: false as const, reason: `${c.label} is not configured for ${ext.toUpperCase()} files.` };
      return { ok: true as const };
    },
    async run(files, ctx) {
      const out = [];
      for (let i = 0; i < files.length; i++) {
        checkAbort(ctx.signal);
        const f = files[i];
        ctx.onProgress((i / files.length) * 100, `Uploading ${f.name}`);
        const tmpId = await tmpUpload(f, (p) => ctx.onProgress(((i + (p / 100) * 0.4) / files.length) * 100, `Uploading ${f.name}`));
        ctx.onProgress(((i + 0.5) / files.length) * 100, `Converting ${f.name}`);
        const res = await fetch("/api/convert/external", {
          method: "POST",
          headers: { "content-type": "application/json", "x-workspace-token": getWorkspaceToken() },
          body: JSON.stringify({ tmpId, name: f.name, target: "pdf" }),
          signal: ctx.signal,
        });
        if (!res.ok) {
          let msg = `The conversion service failed (${res.status}).`;
          try {
            msg = ((await res.json()) as { error?: string }).error ?? msg;
          } catch {
            /* ignore */
          }
          throw new ConversionError(msg);
        }
        const blob = new Blob([await res.arrayBuffer()], { type: "application/pdf" });
        if (blob.size < 100) throw new ConversionError("The conversion service returned an empty file.");
        out.push({ name: `${baseName(f.name)}.pdf`, blob });
      }
      ctx.onProgress(100);
      return out;
    },
  }));
}

export const documentConverters: Converter[] = [documentToPdf, markdownToHtmlFile, ...providerConverters()];
