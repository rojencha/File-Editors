import { PDFDocument } from "pdf-lib";
import { DOC_STYLE } from "./doc-html";

const PAGE_W = 794; // A4 @ 96dpi
const PAGE_H = 1123;
const MARGIN = 56;
const SCALE = 2;
const MAX_PAGES = 100;

function wrapXhtml(innerHtml: string): string {
  // Round-trip through the parser so the markup is well-formed XML for <foreignObject>.
  const doc = new DOMParser().parseFromString(`<div class="doc">${innerHtml}</div>`, "text/html");
  const el = doc.body.firstElementChild!;
  el.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  el.setAttribute("style", `width:${PAGE_W - MARGIN * 2}px`);
  return new XMLSerializer().serializeToString(el);
}

function measure(xhtml: string): number {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-99999px;top:0;visibility:hidden;width:${PAGE_W - MARGIN * 2}px`;
  host.innerHTML = `<style>${DOC_STYLE}</style>${xhtml.replace(/ xmlns="[^"]+"/, "")}`;
  document.body.appendChild(host);
  const h = host.scrollHeight;
  host.remove();
  return h;
}

async function loadSvg(svg: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  return img;
}

/**
 * Rasterises sanitized HTML onto A4 pages and wraps them in a PDF.
 * Text in the result is an image (not selectable); this is what lets any script, table or image render faithfully.
 */
export async function htmlToPdf(html: string, onProgress?: (pct: number) => void, signal?: AbortSignal): Promise<Blob> {
  const xhtml = wrapXhtml(html);
  const contentH = Math.max(measure(xhtml), 40);
  const innerPageH = PAGE_H - MARGIN * 2;
  const pageCount = Math.max(1, Math.ceil(contentH / innerPageH));
  if (pageCount > MAX_PAGES) throw new Error(`This document is too long to convert in the browser (${pageCount} pages; limit ${MAX_PAGES}).`);

  const pdf = await PDFDocument.create();
  for (let p = 0; p < pageCount; p++) {
    if (signal?.aborted) throw new Error("Cancelled.");
    onProgress?.((p / pageCount) * 100);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
      <rect width="100%" height="100%" fill="#fff"/>
      <svg x="${MARGIN}" y="${MARGIN}" width="${PAGE_W - MARGIN * 2}" height="${innerPageH}" viewBox="0 ${p * innerPageH} ${PAGE_W - MARGIN * 2} ${innerPageH}" overflow="hidden">
        <foreignObject x="0" y="0" width="${PAGE_W - MARGIN * 2}" height="${contentH + innerPageH}"><style xmlns="http://www.w3.org/1999/xhtml">${DOC_STYLE}</style>${xhtml}</foreignObject>
      </svg></svg>`;
    const img = await loadSvg(svg);
    const c = document.createElement("canvas");
    c.width = PAGE_W * SCALE;
    c.height = PAGE_H * SCALE;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const jpg = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
    if (!jpg) throw new Error("Your browser blocked rendering this document to an image. Try a Chromium-based browser.");
    const embedded = await pdf.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    const page = pdf.addPage([595.28, 841.89]);
    page.drawImage(embedded, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }
  onProgress?.(100);
  return new Blob([(await pdf.save()) as BlobPart], { type: "application/pdf" });
}
