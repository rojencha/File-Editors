export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return "–";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function baseName(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? name : name.slice(0, i);
}

/** Strips path separators, control chars and reserved characters; keeps names short. */
export function safeFileName(name: string, fallback = "file"): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

export function uid(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type Kind = "pdf" | "image" | "lottie" | "document" | "text" | "video" | "audio" | "archive" | "data" | "other";

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "svg"];
const DOC_EXT = ["docx", "doc", "rtf", "odt", "pptx", "ppt", "xlsx", "xls", "ods", "odp"];

export function kindOf(name: string, mime = ""): Kind {
  const e = extOf(name);
  if (e === "pdf" || mime === "application/pdf") return "pdf";
  if (e === "lottie") return "lottie";
  if (e === "json") return "data"; // refined by content in the previewer
  if (mime.startsWith("image/") || IMAGE_EXT.includes(e)) return "image";
  if (mime.startsWith("video/") || ["webm", "mp4", "mov"].includes(e)) return "video";
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a"].includes(e)) return "audio";
  if (DOC_EXT.includes(e)) return "document";
  if (["txt", "md", "markdown", "html", "htm", "csv"].includes(e)) return "text";
  if (["zip"].includes(e)) return "archive";
  return "other";
}

export function kindLabel(k: Kind): string {
  return {
    pdf: "PDF",
    image: "Image",
    lottie: "Lottie",
    document: "Document",
    text: "Text",
    video: "Video",
    audio: "Audio",
    archive: "Archive",
    data: "Data",
    other: "File",
  }[k];
}

export function mimeFromName(name: string): string {
  const m: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    avif: "image/avif",
    bmp: "image/bmp",
    json: "application/json",
    lottie: "application/zip",
    zip: "application/zip",
    txt: "text/plain",
    md: "text/markdown",
    html: "text/html",
    htm: "text/html",
    csv: "text/csv",
    webm: "video/webm",
    mp4: "video/mp4",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return m[extOf(name)] ?? "application/octet-stream";
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
