import JSZip from "jszip";
import { baseName, extOf } from "@/lib/format";
import { createOffscreenPlayer, readLottie } from "@/lib/lottie";
import { canvasToBlob } from "./image-utils";
import { checkAbort, ConversionError, type Converter, type OptionDef } from "./types";

const isLottie = (f: File) => ["json", "lottie"].includes(extOf(f.name));
const NOTE = "Lottie JSON files and dotLottie (.lottie) archives are supported. Features the lottie-web canvas renderer can't draw (some expressions and effects) may look different.";

const sizeOptions: OptionDef[] = [
  { key: "scale", label: "Size", type: "select", default: "1", choices: [{ value: "0.5", label: "Half" }, { value: "1", label: "Original" }, { value: "2", label: "2×" }] },
];

async function open(f: File, scale: number) {
  const data = await readLottie(f, f.name).catch((e: Error) => {
    throw new ConversionError(`${f.name}: ${e.message}`);
  });
  const w = Math.min(4096, data.w * scale);
  const h = Math.min(4096, data.h * scale);
  return { data, player: await createOffscreenPlayer(data, w, h) };
}

export const lottieToPng: Converter = {
  id: "lottie-to-png",
  group: "Lottie",
  label: "Lottie → PNG (still frame)",
  description: "Export a single frame of a Lottie animation as a transparent PNG.",
  from: "Lottie",
  to: "PNG",
  mode: "each",
  runtime: "browser",
  accepts: isLottie,
  note: NOTE,
  options: [
    { key: "at", label: "Frame", type: "select", default: "start", choices: [{ value: "start", label: "First" }, { value: "middle", label: "Middle" }, { value: "end", label: "Last" }] },
    ...sizeOptions,
  ],
  async run(files, ctx) {
    const out = [];
    for (const f of files) {
      checkAbort(ctx.signal);
      const { player } = await open(f, Number(ctx.options.scale ?? 1));
      try {
        const frac = ctx.options.at === "middle" ? 0.5 : ctx.options.at === "end" ? 0.999 : 0;
        player.seek(Math.floor(player.totalFrames * frac));
        out.push({ name: `${baseName(f.name)}.png`, blob: await canvasToBlob(player.canvas, "image/png") });
      } finally {
        player.destroy();
      }
    }
    ctx.onProgress(100);
    return out;
  },
};

export const lottieToSequence: Converter = {
  id: "lottie-to-png-sequence",
  group: "Lottie",
  label: "Lottie → PNG sequence (ZIP)",
  description: "Render every frame as a transparent PNG and bundle them in a ZIP.",
  from: "Lottie",
  to: "ZIP of PNGs",
  mode: "each",
  runtime: "browser",
  accepts: isLottie,
  note: `${NOTE} Limited to 600 frames per animation.`,
  options: [
    { key: "step", label: "Frame step", type: "select", default: "1", choices: [{ value: "1", label: "Every frame" }, { value: "2", label: "Every 2nd" }, { value: "4", label: "Every 4th" }] },
    ...sizeOptions,
  ],
  async run(files, ctx) {
    const out = [];
    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi];
      const { player } = await open(f, Number(ctx.options.scale ?? 1));
      try {
        const step = Number(ctx.options.step ?? 1);
        const frames: number[] = [];
        for (let i = 0; i < player.totalFrames; i += step) frames.push(i);
        if (frames.length > 600) throw new ConversionError(`${f.name} has ${frames.length} frames to render. Choose a larger frame step (max 600).`);
        const zip = new JSZip();
        for (let i = 0; i < frames.length; i++) {
          checkAbort(ctx.signal);
          ctx.onProgress(((fi + i / frames.length) / files.length) * 100, `${f.name} · frame ${i + 1}/${frames.length}`);
          player.seek(frames[i]);
          const png = await canvasToBlob(player.canvas, "image/png");
          zip.file(`${baseName(f.name)}-${String(i).padStart(4, "0")}.png`, png);
        }
        out.push({ name: `${baseName(f.name)}-frames.zip`, blob: await zip.generateAsync({ type: "blob" }) });
      } finally {
        player.destroy();
      }
    }
    ctx.onProgress(100);
    return out;
  },
};

export const lottieToWebm: Converter = {
  id: "lottie-to-webm",
  group: "Lottie",
  label: "Lottie → WebM video",
  description: "Record the animation as a WebM video.",
  from: "Lottie",
  to: "WebM",
  mode: "each",
  runtime: "browser",
  accepts: isLottie,
  note: `${NOTE} Recorded in real time, so a 5-second animation takes about 5 seconds. WebM has no transparency here, so a background colour is used. Maximum length 60 s.`,
  options: [
    { key: "bg", label: "Background", type: "select", default: "#ffffff", choices: [{ value: "#ffffff", label: "White" }, { value: "#000000", label: "Black" }, { value: "#f1f5f9", label: "Light grey" }] },
    ...sizeOptions,
  ],
  available: (env) =>
    env.features.webmRecording ? { ok: true } : { ok: false, reason: "This browser can't record WebM video (MediaRecorder with VP8/VP9 is required). Try Chrome, Edge or Firefox." },
  async run(files, ctx) {
    const out = [];
    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi];
      const { data, player } = await open(f, Number(ctx.options.scale ?? 1));
      try {
        const fps = Math.min(60, Math.max(10, Math.round(data.fr)));
        const duration = (data.op - data.ip) / data.fr;
        if (duration > 60) throw new ConversionError(`${f.name} is ${Math.round(duration)}s long. WebM export is limited to 60s.`);
        const stage = document.createElement("canvas");
        stage.width = player.canvas.width + (player.canvas.width % 2);
        stage.height = player.canvas.height + (player.canvas.height % 2);
        const sg = stage.getContext("2d")!;
        const paint = (frame: number) => {
          player.seek(frame);
          sg.fillStyle = String(ctx.options.bg ?? "#ffffff");
          sg.fillRect(0, 0, stage.width, stage.height);
          sg.drawImage(player.canvas, 0, 0);
        };
        paint(0);
        const stream = stage.captureStream(fps);
        const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m))!;
        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        const done = new Promise<void>((r) => (rec.onstop = () => r()));
        rec.start(250);
        const t0 = performance.now();
        await new Promise<void>((resolve, reject) => {
          const tick = () => {
            if (ctx.signal.aborted) return reject(new ConversionError("Cancelled."));
            const t = (performance.now() - t0) / 1000;
            if (t >= duration) return resolve();
            paint(Math.min(player.totalFrames - 1, Math.floor(t * data.fr)));
            ctx.onProgress(((fi + t / duration) / files.length) * 100, `Recording ${f.name}`);
            requestAnimationFrame(tick);
          };
          tick();
        }).catch((e) => {
          if (rec.state !== "inactive") rec.stop();
          throw e;
        });
        paint(player.totalFrames - 1);
        await new Promise((r) => setTimeout(r, 120));
        rec.stop();
        await done;
        stream.getTracks().forEach((t) => t.stop());
        out.push({ name: `${baseName(f.name)}.webm`, blob: new Blob(chunks, { type: "video/webm" }) });
      } finally {
        player.destroy();
      }
    }
    ctx.onProgress(100);
    return out;
  },
};

export const dotLottieToJson: Converter = {
  id: "dotlottie-to-json",
  group: "Lottie",
  label: ".lottie → Lottie JSON",
  description: "Extract the animation JSON from a dotLottie archive.",
  from: ".lottie",
  to: "JSON",
  mode: "each",
  runtime: "browser",
  accepts: (f) => extOf(f.name) === "lottie",
  note: "Extracts the first animation in the archive.",
  async run(files, ctx) {
    const out = [];
    for (const f of files) {
      checkAbort(ctx.signal);
      const data = await readLottie(f, f.name).catch((e: Error) => {
        throw new ConversionError(`${f.name}: ${e.message}`);
      });
      out.push({ name: `${baseName(f.name)}.json`, blob: new Blob([JSON.stringify(data)], { type: "application/json" }) });
    }
    ctx.onProgress(100);
    return out;
  },
};

export const lottieConverters: Converter[] = [lottieToPng, lottieToSequence, lottieToWebm, dotLottieToJson];
