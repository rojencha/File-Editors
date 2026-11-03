import { PDFDocument } from "pdf-lib";
import { baseName, extOf } from "@/lib/format";
import { destroyPdf, openPdf, renderPage } from "@/lib/pdfjs";
import { canvasToBlob } from "./image-utils";
import { checkAbort, ConversionError, type Converter } from "./types";

const isPdf = (f: File) => extOf(f.name) === "pdf" || f.type === "application/pdf";
const MAX_PAGES = 300;

/** "1-3, 5, 8-" → [1,2,3,5,8,…,total]. Empty string = all pages. */
export function parsePageRange(spec: string, total: number): number[] {
  const s = spec.trim();
  if (!s) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>();
  for (const part of s.split(",")) {
    const m = /^\s*(\d*)\s*(-)?\s*(\d*)\s*$/.exec(part);
    if (!m || (!m[1] && !m[3])) throw new ConversionError(`"${part.trim()}" isn't a valid page range. Use something like 1-3, 5.`);
    const a = m[1] ? Number(m[1]) : 1;
    const b = m[2] ? (m[3] ? Number(m[3]) : total) : a;
    if (a < 1 || b < a || a > total) throw new ConversionError(`Page range "${part.trim()}" is outside this document (${total} pages).`);
    for (let p = a; p <= Math.min(b, total); p++) set.add(p);
  }
  return [...set].sort((x, y) => x - y);
}

async function loadLib(file: File) {
  try {
    return await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
  } catch {
    throw new ConversionError(`"${file.name}" couldn't be read. It may be encrypted or damaged.`);
  }
}

export const pdfToImages = (fmt: "png" | "jpeg"): Converter => ({
  id: `pdf-to-${fmt}`,
  group: "PDF",
  label: `PDF → ${fmt === "png" ? "PNG" : "JPG"} images`,
  description: "Render each page of a PDF as an image.",
  from: "PDF",
  to: `${fmt === "png" ? "PNG" : "JPG"} (one per page)`,
  mode: "each",
  runtime: "browser",
  accepts: isPdf,
  note: `Up to ${MAX_PAGES} pages per file. Rendering happens in your browser.`,
  options: [
    { key: "scale", label: "Resolution", type: "select", default: "2", choices: [{ value: "1", label: "Standard (72 dpi)" }, { value: "2", label: "High (144 dpi)" }, { value: "3", label: "Very high (216 dpi)" }] },
    { key: "pages", label: "Pages", type: "text", default: "", placeholder: "All pages, or e.g. 1-3, 5", hint: "Leave blank for all pages" },
  ],
  async run(files, ctx) {
    const out = [];
    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi];
      const doc = await openPdf(await f.arrayBuffer());
      try {
        const pages = parsePageRange(String(ctx.options.pages ?? ""), doc.numPages);
        if (pages.length > MAX_PAGES) throw new ConversionError(`Too many pages (${pages.length}). Choose at most ${MAX_PAGES} at a time.`);
        for (let i = 0; i < pages.length; i++) {
          checkAbort(ctx.signal);
          ctx.onProgress(((fi + i / pages.length) / files.length) * 100, `${f.name} · page ${pages[i]}`);
          const canvas = await renderPage(doc, pages[i], Number(ctx.options.scale ?? 2));
          const blob = await canvasToBlob(canvas, `image/${fmt}`, fmt === "jpeg" ? 0.92 : undefined);
          canvas.width = canvas.height = 0;
          const pad = String(pages[i]).padStart(String(doc.numPages).length, "0");
          out.push({ name: `${baseName(f.name)}-p${pad}.${fmt === "jpeg" ? "jpg" : "png"}`, blob });
        }
      } finally {
        await destroyPdf(doc);
      }
    }
    ctx.onProgress(100);
    return out;
  },
});

export const pdfMerge: Converter = {
  id: "pdf-merge",
  group: "PDF",
  label: "Merge PDFs",
  description: "Join several PDFs into one, in the order you listed them.",
  from: "PDFs",
  to: "PDF",
  mode: "merge",
  minFiles: 2,
  runtime: "browser",
  accepts: isPdf,
  async run(files, ctx) {
    const out = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      checkAbort(ctx.signal);
      ctx.onProgress((i / files.length) * 100, `Adding ${files[i].name}`);
      const src = await loadLib(files[i]);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    ctx.onProgress(100);
    return [{ name: "merged.pdf", blob: new Blob([(await out.save()) as BlobPart], { type: "application/pdf" }) }];
  },
};

export const pdfSplit: Converter = {
  id: "pdf-split",
  group: "PDF",
  label: "Split PDF into pages",
  description: "Save every page of a PDF as its own single-page PDF.",
  from: "PDF",
  to: "PDF (one per page)",
  mode: "each",
  runtime: "browser",
  accepts: isPdf,
  note: `Up to ${MAX_PAGES} pages per file.`,
  async run(files, ctx) {
    const out = [];
    for (const f of files) {
      const src = await loadLib(f);
      const n = src.getPageCount();
      if (n > MAX_PAGES) throw new ConversionError(`"${f.name}" has ${n} pages. Splitting is limited to ${MAX_PAGES}.`);
      for (let i = 0; i < n; i++) {
        checkAbort(ctx.signal);
        ctx.onProgress((i / n) * 100, `${f.name} · page ${i + 1}`);
        const d = await PDFDocument.create();
        const [p] = await d.copyPages(src, [i]);
        d.addPage(p);
        out.push({ name: `${baseName(f.name)}-p${String(i + 1).padStart(String(n).length, "0")}.pdf`, blob: new Blob([(await d.save()) as BlobPart], { type: "application/pdf" }) });
      }
    }
    ctx.onProgress(100);
    return out;
  },
};

export const pdfConverters: Converter[] = [pdfToImages("png"), pdfToImages("jpeg"), pdfMerge, pdfSplit];
