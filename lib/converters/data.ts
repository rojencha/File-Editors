import { baseName, extOf } from "@/lib/format";
import { parseCsv } from "@/lib/doc-html";
import { checkAbort, ConversionError, type Converter } from "./types";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const jsonToCsv: Converter = {
  id: "json-to-csv",
  group: "Data",
  label: "JSON → CSV",
  description: "Convert a JSON array of objects into a spreadsheet-friendly CSV.",
  from: "JSON",
  to: "CSV",
  mode: "each",
  runtime: "browser",
  accepts: (f) => extOf(f.name) === "json",
  note: "Expects an array of objects (or an object holding one). Nested values are written as JSON text.",
  async run(files, ctx) {
    const out = [];
    for (const f of files) {
      checkAbort(ctx.signal);
      let data: unknown;
      try {
        data = JSON.parse(await f.text());
      } catch {
        throw new ConversionError(`"${f.name}" is not valid JSON.`);
      }
      if (!Array.isArray(data) && data && typeof data === "object") {
        const arr = Object.values(data).find(Array.isArray);
        if (arr) data = arr;
      }
      if (!Array.isArray(data) || !data.length || data.some((r) => r === null || typeof r !== "object" || Array.isArray(r)))
        throw new ConversionError(`"${f.name}" must contain an array of objects to become a table.`);
      const rows = data as Record<string, unknown>[];
      const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      const lines = [headers.map(csvCell).join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))];
      out.push({ name: `${baseName(f.name)}.csv`, blob: new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }) });
    }
    ctx.onProgress(100);
    return out;
  },
};

export const csvToJson: Converter = {
  id: "csv-to-json",
  group: "Data",
  label: "CSV → JSON",
  description: "Convert a CSV with a header row into a JSON array of objects.",
  from: "CSV",
  to: "JSON",
  mode: "each",
  runtime: "browser",
  accepts: (f) => extOf(f.name) === "csv",
  async run(files, ctx) {
    const out = [];
    for (const f of files) {
      checkAbort(ctx.signal);
      const rows = parseCsv(await f.text());
      if (rows.length < 1) throw new ConversionError(`"${f.name}" is empty.`);
      const [head, ...body] = rows;
      const json = body.map((r) => Object.fromEntries(head.map((h, i) => [h || `column_${i + 1}`, r[i] ?? ""])));
      out.push({ name: `${baseName(f.name)}.json`, blob: new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }) });
    }
    ctx.onProgress(100);
    return out;
  },
};

export const dataConverters = [jsonToCsv, csvToJson];
