import { extOf } from "@/lib/format";
import { isLottieJsonText } from "@/lib/lottie";
import { dataConverters } from "./data";
import { documentConverters } from "./documents";
import { imageConverters } from "./images";
import { lottieConverters } from "./lottie";
import { pdfConverters } from "./pdf";
import type { Converter, ConverterGroup, Env } from "./types";

export * from "./types";

/** Add or replace conversions here. Each module exports plain `Converter` objects. */
export const ALL_CONVERTERS: Converter[] = [...pdfConverters, ...imageConverters, ...documentConverters, ...lottieConverters, ...dataConverters];

// De-duplicate by id (images-to-pdf is exported from both groups' perspective).
export const CONVERTERS: Converter[] = [...new Map(ALL_CONVERTERS.map((c) => [c.id, c])).values()];

export const GROUP_ORDER: ConverterGroup[] = ["PDF", "Images", "Documents", "Lottie", "Data"];

export type Applicability =
  | { state: "ready"; converter: Converter }
  | { state: "locked"; converter: Converter; reason: string };

/** JSON files are only Lottie converters' input when they actually contain a Lottie animation. */
export async function annotateFiles(files: File[]): Promise<Map<File, { lottie: boolean }>> {
  const map = new Map<File, { lottie: boolean }>();
  for (const f of files) {
    let lottie = extOf(f.name) === "lottie";
    if (extOf(f.name) === "json" && f.size < 20 * 1024 * 1024) lottie = isLottieJsonText(await f.text());
    map.set(f, { lottie });
  }
  return map;
}

export function applicableConverters(files: File[], lottieMap: Map<File, { lottie: boolean }>, env: Env): Applicability[] {
  if (!files.length) return [];
  const res: Applicability[] = [];
  for (const c of CONVERTERS) {
    const okFiles = files.every((f) => {
      if (c.group === "Lottie") return c.accepts(f) && lottieMap.get(f)?.lottie;
      if (c.id === "json-to-csv") return c.accepts(f) && !lottieMap.get(f)?.lottie;
      return c.accepts(f);
    });
    if (!okFiles) continue;
    if (c.minFiles && files.length < c.minFiles) continue;
    const a = c.available?.(env) ?? { ok: true as const };
    res.push(a.ok ? { state: "ready", converter: c } : { state: "locked", converter: c, reason: a.reason });
  }
  return res;
}
