import { extOf } from "@/lib/format";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "BASE", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "SVG", "MATH", "VIDEO", "AUDIO", "SOURCE", "TRACK", "CANVAS", "TEMPLATE", "NOSCRIPT"]);

/** Strips anything active or external. Output is safe to inject into an inert, sandboxed rendering context. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (DROP.has(child.tagName.toUpperCase())) {
        child.remove();
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const n = attr.name.toLowerCase();
        const v = attr.value.trim().toLowerCase();
        if (n.startsWith("on") || n === "style" || n === "srcset" || n === "ping") child.removeAttribute(attr.name);
        else if ((n === "href" || n === "src") && !(v.startsWith("#") || v.startsWith("data:image/") || (n === "href" && /^(https?:|mailto:)/.test(v))))
          child.removeAttribute(attr.name);
        else if (n === "target") child.setAttribute("rel", "noopener noreferrer");
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export function markdownToHtml(md: string): string {
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
    } else if (/^(#{1,6})\s+/.test(line)) {
      const m = /^(#{1,6})\s+(.*)$/.exec(line)!;
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
      i++;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push("<hr/>");
      i++;
    } else if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
    } else if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ""))}</li>`);
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
    } else if (!line.trim()) {
      i++;
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*>|\s*([-*+]|\d+\.)\s)/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${inline(buf.join(" "))}</p>`);
    }
  }
  return out.join("\n");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

export function csvToHtml(text: string): string {
  const rows = parseCsv(text).slice(0, 5000);
  if (!rows.length) return "<p><em>Empty file</em></p>";
  const [head, ...body] = rows;
  return `<table><thead><tr>${head.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export const DOC_STYLE = `
  *{box-sizing:border-box}
  body,div.doc{font-family:Inter,"Segoe UI",system-ui,-apple-system,"Noto Sans","Noto Sans Devanagari",sans-serif;font-size:15px;line-height:1.55;color:#0f172a}
  h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.1em 0 .45em;font-weight:650}
  h1{font-size:1.9em}h2{font-size:1.5em}h3{font-size:1.25em}
  p{margin:0 0 .8em}ul,ol{margin:0 0 .9em 1.4em;padding:0}
  table{border-collapse:collapse;margin:.6em 0;max-width:100%;font-size:.92em}
  td,th{border:1px solid #cbd5e1;padding:5px 9px;text-align:left;vertical-align:top}
  th{background:#f1f5f9;font-weight:600}
  img{max-width:100%;height:auto}
  pre{background:#f1f5f9;padding:12px 14px;border-radius:8px;white-space:pre-wrap;word-break:break-word;font-size:.88em}
  code{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.92em}
  blockquote{margin:.8em 0;padding:.2em 1em;border-left:3px solid #94a3b8;color:#475569}
  a{color:#006dff}hr{border:0;border-top:1px solid #cbd5e1;margin:1.2em 0}
`;

/** Turns a supported document into sanitized HTML. */
export async function documentToHtml(file: File): Promise<string> {
  const ext = extOf(file.name);
  if (ext === "docx") {
    const mammoth = (await import("mammoth/mammoth.browser")).default;
    const res = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { convertImage: mammoth.images.dataUri });
    return sanitizeHtml(res.value);
  }
  const text = await file.text();
  if (ext === "md" || ext === "markdown") return sanitizeHtml(markdownToHtml(text));
  if (ext === "html" || ext === "htm") return sanitizeHtml(text);
  if (ext === "csv") return csvToHtml(text);
  return `<pre style="background:none;padding:0;font-family:inherit">${escapeHtml(text)}</pre>`;
}
