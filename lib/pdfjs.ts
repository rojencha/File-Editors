import type { PDFDocumentProxy } from "pdfjs-dist";

let mod: Promise<typeof import("pdfjs-dist")> | null = null;

export function getPdfjs() {
  if (!mod) {
    mod = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return m;
    });
  }
  return mod;
}

export async function openPdf(data: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  // pdf.js transfers the buffer to its worker, so always hand it a copy.
  const copy = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
  try {
    return await pdfjs.getDocument({ data: copy }).promise;
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "PasswordException") throw new Error("This PDF is password-protected. Remove the password and try again.");
    throw new Error("This PDF could not be read. It may be damaged.");
  }
}

export async function renderPage(doc: PDFDocumentProxy, pageNumber: number, scale: number, rotation = 0): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

export async function destroyPdf(doc: PDFDocumentProxy | null | undefined) {
  try {
    await doc?.loadingTask.destroy();
  } catch {
    /* already destroyed */
  }
}
