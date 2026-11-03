import { PDFDocument } from "pdf-lib";
import { baseName, kindOf } from "@/lib/format";
import { canvasToBlob, decodeImage, makeCanvas } from "./image-utils";
import { checkAbort, type Converter } from "./types";

const isImage = (f: File) => kindOf(f.name, f.type) === "image";

function toFormat(target: "png" | "jpeg" | "webp"): Converter {
  const label = target === "jpeg" ? "JPG" : target.toUpperCase();
  const mime = `image/${target}`;
  return {
    id: `image-to-${target}`,
    group: "Images",
    label: `Image → ${label}`,
    description: `Convert PNG, JPG, WebP, GIF, BMP, AVIF or SVG images to ${label}.`,
    from: "Images",
    to: label,
    mode: "each",
    runtime: "browser",
    accepts: isImage,
    note:
      target === "jpeg"
        ? "Transparency becomes a solid background. Animated GIFs convert their first frame."
        : "Animated GIFs convert their first frame.",
    options:
      target === "png"
        ? [{ key: "scale", label: "Scale", type: "select", default: "1", choices: [{ value: "0.5", label: "50%" }, { value: "1", label: "100%" }, { value: "2", label: "200%" }] }]
        : [
            { key: "quality", label: "Quality", type: "number", default: 90, min: 10, max: 100, step: 5, hint: "10–100" },
            { key: "scale", label: "Scale", type: "select", default: "1", choices: [{ value: "0.5", label: "50%" }, { value: "1", label: "100%" }, { value: "2", label: "200%" }] },
          ],
    available: (env) =>
      target === "webp" && !env.features.webpEncode ? { ok: false, reason: "This browser can't encode WebP." } : { ok: true },
    async run(files, ctx) {
      const out = [];
      for (let i = 0; i < files.length; i++) {
        checkAbort(ctx.signal);
        const f = files[i];
        ctx.onProgress((i / files.length) * 100, `Converting ${f.name}`);
        const d = await decodeImage(f, f.name);
        try {
          const s = Number(ctx.options.scale ?? 1);
          const c = makeCanvas(d.width * s, d.height * s);
          const g = c.getContext("2d")!;
          if (target === "jpeg") {
            g.fillStyle = "#fff";
            g.fillRect(0, 0, c.width, c.height);
          }
          g.drawImage(d.source, 0, 0, c.width, c.height);
          const blob = await canvasToBlob(c, mime, target === "png" ? undefined : Number(ctx.options.quality ?? 90) / 100);
          out.push({ name: `${baseName(f.name)}.${target === "jpeg" ? "jpg" : target}`, blob });
        } finally {
          d.close();
        }
      }
      ctx.onProgress(100);
      return out;
    },
  };
}

const A4 = { w: 595.28, h: 841.89 };

export const imagesToPdf: Converter = {
  id: "images-to-pdf",
  group: "PDF",
  label: "Images → PDF",
  description: "Combine one or many images into a PDF, one image per page.",
  from: "Images",
  to: "PDF",
  mode: "merge",
  runtime: "browser",
  accepts: isImage,
  options: [
    {
      key: "page",
      label: "Page size",
      type: "select",
      default: "fit",
      choices: [
        { value: "fit", label: "Match each image" },
        { value: "a4", label: "A4 (image scaled to fit)" },
      ],
    },
    { key: "separate", label: "One PDF per image", type: "toggle", default: false },
  ],
  async run(files, ctx) {
    const separate = Boolean(ctx.options.separate);
    const build = async (list: File[], offset: number) => {
      const pdf = await PDFDocument.create();
      for (let i = 0; i < list.length; i++) {
        checkAbort(ctx.signal);
        const f = list[i];
        ctx.onProgress(((offset + i) / files.length) * 100, `Adding ${f.name}`);
        const d = await decodeImage(f, f.name);
        let img;
        try {
          if (f.type === "image/jpeg") img = await pdf.embedJpg(new Uint8Array(await f.arrayBuffer()));
          else {
            const c = makeCanvas(d.width, d.height);
            c.getContext("2d")!.drawImage(d.source, 0, 0);
            img = await pdf.embedPng(new Uint8Array(await (await canvasToBlob(c, "image/png")).arrayBuffer()));
          }
        } finally {
          d.close();
        }
        if (ctx.options.page === "a4") {
          const page = pdf.addPage([A4.w, A4.h]);
          const m = 24;
          const s = Math.min((A4.w - m * 2) / img.width, (A4.h - m * 2) / img.height);
          page.drawImage(img, { x: (A4.w - img.width * s) / 2, y: (A4.h - img.height * s) / 2, width: img.width * s, height: img.height * s });
        } else {
          const page = pdf.addPage([img.width * 0.75, img.height * 0.75]);
          page.drawImage(img, { x: 0, y: 0, width: img.width * 0.75, height: img.height * 0.75 });
        }
      }
      return new Blob([(await pdf.save()) as BlobPart], { type: "application/pdf" });
    };
    if (separate) {
      const out = [];
      for (let i = 0; i < files.length; i++) out.push({ name: `${baseName(files[i].name)}.pdf`, blob: await build([files[i]], i) });
      ctx.onProgress(100);
      return out;
    }
    const blob = await build(files, 0);
    ctx.onProgress(100);
    return [{ name: files.length === 1 ? `${baseName(files[0].name)}.pdf` : "images.pdf", blob }];
  },
};

export const imageConverters: Converter[] = [toFormat("png"), toFormat("jpeg"), toFormat("webp"), imagesToPdf];
