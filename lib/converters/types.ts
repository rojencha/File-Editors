import type { PublicConfig } from "@/lib/types";

export type OptionValue = string | number | boolean;

export type OptionDef = {
  key: string;
  label: string;
  hint?: string;
  type: "select" | "number" | "toggle" | "text";
  choices?: { value: string; label: string }[];
  default: OptionValue;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
};

export type Output = { name: string; blob: Blob };

export type RunCtx = {
  onProgress: (pct: number, label?: string) => void;
  signal: AbortSignal;
  options: Record<string, OptionValue>;
};

export type Env = {
  config: PublicConfig | null;
  /** Detected browser capabilities. */
  features: { webmRecording: boolean; webpEncode: boolean };
};

export type ConverterGroup = "PDF" | "Images" | "Documents" | "Lottie" | "Data";

export type Converter = {
  id: string;
  group: ConverterGroup;
  label: string;
  description: string;
  /** Short input description, e.g. "PDF". */
  from: string;
  /** Short output description, e.g. "PNG images". */
  to: string;
  /** "each": every input is converted on its own. "merge": all inputs produce one result set. */
  mode: "each" | "merge";
  minFiles?: number;
  accepts: (file: File) => boolean;
  options?: OptionDef[];
  /** Where the work happens. "provider" conversions need an external service. */
  runtime: "browser" | "provider";
  /** Honest limitation shown to the user before they start. */
  note?: string;
  available?: (env: Env) => { ok: true } | { ok: false; reason: string };
  run: (files: File[], ctx: RunCtx) => Promise<Output[]>;
};

export class ConversionError extends Error {}

export function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new ConversionError("Cancelled.");
}

export function defaultOptions(c: Converter): Record<string, OptionValue> {
  return Object.fromEntries((c.options ?? []).map((o) => [o.key, o.default]));
}
