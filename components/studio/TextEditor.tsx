"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { csvToHtml, DOC_STYLE, documentToHtml, escapeHtml, markdownToHtml, sanitizeHtml } from "@/lib/doc-html";
import { extOf, mimeFromName } from "@/lib/format";
import type { EditorProps } from "./types";

const MAX_EDIT = 2 * 1024 * 1024;

/** Preview for DOCX/TXT/MD/HTML/CSV/JSON. Plain-text formats are editable; DOCX is preview-only. */
export function TextEditor({ blob, name, register, setDirty }: EditorProps) {
  const ext = extOf(name);
  const isDocx = ext === "docx";
  const [text, setText] = useState("");
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"preview" | "edit">("preview");
  const ref = useRef("");
  ref.current = text;

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        if (isDocx) {
          const h = await documentToHtml(new File([blob], name));
          if (!dead) setHtml(h);
        } else {
          if (blob.size > MAX_EDIT * 5) throw new Error("This file is too large to preview in the browser.");
          const t = await blob.text();
          if (!dead) setText(t);
        }
      } catch (e) {
        if (!dead) setErr((e as Error).message || "Could not read this file.");
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [blob, name, isDocx]);

  useEffect(() => {
    if (isDocx) return;
    register(async () => ({ blob: new Blob([ref.current], { type: blob.type || mimeFromName(name) }) }));
    return () => register(null);
  }, [register, blob.type, name, isDocx]);

  const jsonError = useMemo(() => {
    if (ext !== "json" || loading) return null;
    try {
      JSON.parse(text);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [ext, text, loading]);

  const preview = useMemo(() => {
    if (isDocx) return html;
    if (ext === "md" || ext === "markdown") return sanitizeHtml(markdownToHtml(text));
    if (ext === "html" || ext === "htm") return sanitizeHtml(text);
    if (ext === "csv") return csvToHtml(text);
    return `<pre style="white-space:pre-wrap;word-break:break-word;background:none;padding:0;font-family:ui-monospace,Menlo,monospace;font-size:13px">${escapeHtml(text.slice(0, 400_000))}</pre>`;
  }, [isDocx, html, ext, text]);

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>${DOC_STYLE}body{margin:0;padding:28px 32px;background:#fff}</style></head><body>${preview}</body></html>`;
  const canEdit = !isDocx && text.length <= MAX_EDIT;

  return (
    <div className="studio">
      <div className="studio-main" style={{ alignItems: "stretch" }}>
        {loading && (
          <div className="row muted" style={{ justifyContent: "center" }}>
            <span className="spinner" /> Loading…
          </div>
        )}
        {err && (
          <div className="alert err" role="alert">
            <Icon name="alert" /> {err}
          </div>
        )}
        {!loading && !err && (
          <>
            {canEdit && (
              <div className="tabs" role="tablist" style={{ alignSelf: "center", marginBottom: 12, marginLeft: 0 }}>
                {(["preview", "edit"] as const).map((t) => (
                  <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                    {t === "preview" ? "Preview" : "Edit source"}
                  </button>
                ))}
              </div>
            )}
            {tab === "edit" && canEdit ? (
              <div className="editor-wrap">
                <label className="sr-only" htmlFor="src">
                  File contents
                </label>
                <textarea
                  id="src"
                  className="textarea code"
                  spellCheck={false}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setDirty(true);
                  }}
                />
                {jsonError && (
                  <p className="hint" style={{ color: "var(--err)" }} role="alert">
                    Invalid JSON: {jsonError}
                  </p>
                )}
              </div>
            ) : (
              <iframe title={`Preview of ${name}`} className="doc-frame" sandbox="" srcDoc={srcDoc} style={{ alignSelf: "center" }} />
            )}
          </>
        )}
      </div>
      <aside className="studio-side">
        <div>
          <h3>What you can do</h3>
          <ul className="small muted" style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
            {isDocx ? (
              <>
                <li>Preview the document</li>
                <li>Convert to PDF from the Convert tab</li>
                <li>Word files can&apos;t be edited here</li>
              </>
            ) : (
              <>
                <li>Preview the rendered result</li>
                <li>Edit the source text and save</li>
                {ext === "json" && <li>Invalid JSON is flagged as you type</li>}
              </>
            )}
          </ul>
        </div>
        {ext === "json" && !jsonError && !loading && (
          <button
            className="btn sm"
            onClick={() => {
              setText(JSON.stringify(JSON.parse(text), null, 2));
              setDirty(true);
            }}
          >
            Pretty-print JSON
          </button>
        )}
        <p className="hint">Previews run in an isolated frame: scripts and external resources in documents are blocked.</p>
      </aside>
    </div>
  );
}
