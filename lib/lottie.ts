import JSZip from "jszip";
import { extOf } from "@/lib/format";

export type LottieData = {
  v: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  layers: unknown[];
  [k: string]: unknown;
};

export function validateLottie(data: unknown): LottieData {
  const d = data as Partial<LottieData> | null;
  if (!d || typeof d !== "object") throw new Error("Not a Lottie animation: expected a JSON object.");
  for (const k of ["fr", "ip", "op", "w", "h"] as const) {
    if (typeof d[k] !== "number" || !Number.isFinite(d[k] as number)) throw new Error(`Missing or invalid "${k}" (a Lottie file needs fr, ip, op, w and h).`);
  }
  if (!Array.isArray(d.layers)) throw new Error('Missing "layers" array.');
  if ((d.w as number) <= 0 || (d.h as number) <= 0 || (d.fr as number) <= 0 || (d.op as number) <= (d.ip as number))
    throw new Error("Animation size, frame rate and frame range must be positive.");
  if ((d.w as number) > 4096 || (d.h as number) > 4096) throw new Error("Animations larger than 4096px are not supported in the browser.");
  return d as LottieData;
}

export function isLottieJsonText(text: string): boolean {
  try {
    validateLottie(JSON.parse(text));
    return true;
  } catch {
    return false;
  }
}

/** Reads a Lottie JSON or a dotLottie (.lottie) archive and returns the first animation. */
export async function readLottie(file: Blob, name: string): Promise<LottieData> {
  if (extOf(name) === "lottie") {
    const zip = await JSZip.loadAsync(await file.arrayBuffer()).catch(() => {
      throw new Error("This .lottie file is not a valid archive.");
    });
    let path: string | undefined;
    const manifest = zip.file("manifest.json");
    if (manifest) {
      try {
        const m = JSON.parse(await manifest.async("string")) as { animations?: { id: string }[] };
        const id = m.animations?.[0]?.id;
        if (id) path = [`animations/${id}.json`, `a/${id}.json`].find((p) => zip.file(p));
      } catch {
        /* use fallback */
      }
    }
    path ??= Object.keys(zip.files).find((p) => /^(animations|a)\/.+\.json$/.test(p));
    if (!path) throw new Error("No animation found inside this .lottie file.");
    return validateLottie(JSON.parse(await zip.file(path)!.async("string")));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  return validateLottie(parsed);
}

type LottiePlayer = {
  goToAndStop(v: number, isFrame?: boolean): void;
  destroy(): void;
  totalFrames: number;
};

/** Frame-accurate offscreen player used by the exporters. */
export async function createOffscreenPlayer(data: LottieData, width: number, height: number) {
  const lottie = (await import("lottie-web")).default;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d")!;
  const host = document.createElement("div");
  const anim = lottie.loadAnimation({
    container: host,
    renderer: "canvas",
    loop: false,
    autoplay: false,
    animationData: structuredClone(data),
    rendererSettings: { context: ctx, clearCanvas: true, preserveAspectRatio: "xMidYMid meet" },
  }) as unknown as LottiePlayer;
  await new Promise((r) => setTimeout(r, 30));
  return {
    canvas,
    ctx,
    totalFrames: Math.max(1, Math.floor(data.op - data.ip)),
    /** frame is relative to the animation start (0 … totalFrames). */
    seek(frame: number) {
      anim.goToAndStop(frame, true);
    },
    destroy() {
      anim.destroy();
    },
  };
}
