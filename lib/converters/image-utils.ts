import { extOf } from "@/lib/format";
import { ConversionError } from "./types";

export const MAX_PIXELS = 100_000_000;
export const MAX_SIDE = 16_384;

export type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

export async function decodeImage(file: Blob, name = ""): Promise<Decoded> {
  const isSvg = file.type === "image/svg+xml" || extOf(name) === "svg";
  try {
    if (!isSvg && typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(file);
      return check({ source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() });
    }
  } catch {
    /* fall back to <img> */
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    // SVGs without intrinsic size report 0; give them a sane default.
    const w = img.naturalWidth || 1024;
    const h = img.naturalHeight || 1024;
    return check({ source: img, width: w, height: h, close: () => URL.revokeObjectURL(url) });
  } catch {
    URL.revokeObjectURL(url);
    throw new ConversionError(
      `This browser can't decode "${name || "the image"}". It may be corrupted or use an unsupported format (for example HEIC).`,
    );
  }
}

function check(d: Decoded): Decoded {
  if (d.width > MAX_SIDE || d.height > MAX_SIDE || d.width * d.height > MAX_PIXELS) {
    d.close();
    throw new ConversionError(`Image is too large to process in the browser (${d.width}×${d.height}px). Maximum is ${MAX_SIDE}px per side.`);
  }
  return d;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (b) => {
        if (!b) return reject(new ConversionError("The browser failed to encode the image."));
        if (b.type !== type) return reject(new ConversionError(`This browser can't encode ${type.replace("image/", "").toUpperCase()}.`));
        resolve(b);
      },
      type,
      quality,
    );
  });
}

export async function canEncodeWebp(): Promise<boolean> {
  const c = makeCanvas(1, 1);
  return new Promise((r) => c.toBlob((b) => r(b?.type === "image/webp"), "image/webp"));
}
