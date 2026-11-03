"use client";

import { degrees, PDFDocument } from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { baseName } from "@/lib/format";
import { destroyPdf, openPdf, renderPage } from "@/lib/pdfjs";
import type { EditorProps } from "./types";

type Pg = { src: number; rot: number; del: boolean };

export function PdfEditor({ blob, name, register, setDirty }: EditorProps) {
  const [pages, setPages] = useState<Pg[]>([]);
  const [thumbs, setThumbs] = useState<Record<number, HTMLCanvasElement>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const bigRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<Pg[]>([]);
  pagesRef.current = pages;

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const doc = await openPdf(await blob.arrayBuffer());
        if (dead) return void destroyPdf(doc);
        docRef.current = doc;
        setPages(Array.from({ length: doc.numPages }, (_, i) => ({ src: i, rot: 0, del: false })));
        setLoading(false);
        for (let i = 0; i < doc.numPages && !dead; i++) {
          const c = await renderPage(doc, i + 1, 0.35);
          if (dead) return;
          setThumbs((t) => ({ ...t, [i]: c }));
        }
      } catch (e) {
        if (!dead) {
          setErr((e as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      dead = true;
      void destroyPdf(docRef.current);
    };
  }, [blob]);

  const edit = (fn: (p: Pg[]) => Pg[]) => {
    setPages(fn);
    setDirty(true);
  };

  useEffect(() => {
    register(async () => {
      const kept = pagesRef.current.filter((p) => !p.del);
      if (!kept.length) throw new Error("A PDF needs at least one page. Restore a page before saving.");
      const src = await PDFDocument.load(await blob.arrayBuffer());
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, kept.map((p) => p.src));
      copied.forEach((pg, i) => {
        if (kept[i].rot) pg.setRotation(degrees((pg.getRotation().angle + kept[i].rot) % 360));
        out.addPage(pg);
      });
      return { blob: new Blob([(await out.save()) as BlobPart], { type: "application/pdf" }), name: `${baseName(name)}.pdf` };
    });
    return () => register(null);
  }, [blob, name, register]);

  // Large single-page view
  useEffect(() => {
    if (zoom === null || !docRef.current || !bigRef.current) return;
    const p = pages[zoom];
    if (!p) return;
    let dead = false;
    const host = bigRef.current;
    host.innerHTML = "";
    renderPage(docRef.current, p.src + 1, 1.4, p.rot).then((c) => {
      if (!dead) host.replaceChildren(c);
    });
    return () => {
      dead = true;
    };
  }, [zoom, pages]);

  const move = (i: number, to: number) =>
    edit((p) => {
      if (to < 0 || to >= p.length) return p;
      const n = [...p];
      const [x] = n.splice(i, 1);
      n.splice(to, 0, x);
      return n;
    });

  const active = pages.filter((p) => !p.del).length;

  if (err)
    return (
      <div className="studio">
        <div className="studio-main" style={{ justifyContent: "center" }}>
          <div className="alert err" role="alert">
            <Icon name="alert" /> {err}
          </div>
        </div>
        <aside className="studio-side" />
      </div>
    );

  return (
    <div className="studio">
      <div className="studio-main">
        {loading && (
          <div className="row muted">
            <span className="spinner" /> Loading pages…
          </div>
        )}
        {zoom !== null && pages[zoom] ? (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div className="row">
              <button className="btn sm" onClick={() => setZoom(null)}>
                <Icon name="left" size={15} /> All pages
              </button>
              <button className="btn sm icon" aria-label="Previous page" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}>
                <Icon name="left" size={15} />
              </button>
              <span className="small">
                Page {zoom + 1} of {pages.length} (original p.{pages[zoom].src + 1})
              </span>
              <button className="btn sm icon" aria-label="Next page" disabled={zoom === pages.length - 1} onClick={() => setZoom(zoom + 1)}>
                <Icon name="right" size={15} />
              </button>
            </div>
            <div ref={bigRef} className="canvas-wrap" style={{ background: "#fff" }} aria-label={`Page ${zoom + 1} preview`} />
          </div>
        ) : (
          <div className="pages" role="list">
            {pages.map((p, i) => (
              <div
                role="listitem"
                key={p.src}
                className={`pg${p.del ? " del" : ""}${overIdx === i && dragIdx !== i ? " over" : ""}`}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIdx(i);
                }}
                onDragEnd={() => {
                  setDragIdx(null);
                  setOverIdx(null);
                }}
                onDrop={() => {
                  if (dragIdx !== null && dragIdx !== i) move(dragIdx, i);
                  setDragIdx(null);
                  setOverIdx(null);
                }}
              >
                <div className="pv">
                  {thumbs[p.src] ? (
                    <CanvasThumb canvas={thumbs[p.src]} rot={p.rot} label={`Page ${i + 1}`} />
                  ) : (
                    <span className="spinner" />
                  )}
                </div>
                <div className="small" style={{ textAlign: "center", fontWeight: 600 }}>
                  {i + 1} {p.del && <span className="badge err">removed</span>}
                </div>
                <div className="pa">
                  <button className="btn ghost icon sm" aria-label={`Rotate page ${i + 1} left`} onClick={() => edit((a) => a.map((x, j) => (j === i ? { ...x, rot: (x.rot + 270) % 360 } : x)))}>
                    <Icon name="rotateL" size={15} />
                  </button>
                  <button className="btn ghost icon sm" aria-label={`Rotate page ${i + 1} right`} onClick={() => edit((a) => a.map((x, j) => (j === i ? { ...x, rot: (x.rot + 90) % 360 } : x)))}>
                    <Icon name="rotate" size={15} />
                  </button>
                  <button className="btn ghost icon sm" aria-label={`Move page ${i + 1} earlier`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <Icon name="left" size={15} />
                  </button>
                  <button className="btn ghost icon sm" aria-label={`Move page ${i + 1} later`} disabled={i === pages.length - 1} onClick={() => move(i, i + 1)}>
                    <Icon name="right" size={15} />
                  </button>
                  <button className="btn ghost icon sm" aria-label={`Zoom page ${i + 1}`} onClick={() => setZoom(i)}>
                    <Icon name="eye" size={15} />
                  </button>
                  <button className="btn ghost icon sm" aria-label={p.del ? `Restore page ${i + 1}` : `Remove page ${i + 1}`} onClick={() => edit((a) => a.map((x, j) => (j === i ? { ...x, del: !x.del } : x)))}>
                    <Icon name={p.del ? "plus" : "trash"} size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <aside className="studio-side">
        <div>
          <h3>What you can do</h3>
          <ul className="small muted" style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Rotate any page left or right</li>
            <li>Reorder by dragging, or with the arrow buttons</li>
            <li>Remove pages (you can restore them before saving)</li>
            <li>Zoom a page to read it</li>
          </ul>
        </div>
        <div>
          <h3>Summary</h3>
          <p className="small" style={{ marginTop: 8 }}>
            {pages.length} page{pages.length === 1 ? "" : "s"} · {active} will be kept
          </p>
        </div>
        <button className="btn sm" disabled={!pages.length} onClick={() => { setPages((p) => p.map((x, i) => ({ src: i, rot: 0, del: false }))); setDirty(false); }}>
          Reset all changes
        </button>
        <p className="hint">Editing creates a new PDF file. The original is untouched until you choose to replace it.</p>
      </aside>
    </div>
  );
}

function CanvasThumb({ canvas, rot, label }: { canvas: HTMLCanvasElement; rot: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = canvas.width;
    c.height = canvas.height;
    c.getContext("2d")!.drawImage(canvas, 0, 0);
  }, [canvas]);
  const swap = rot === 90 || rot === 270;
  return <canvas ref={ref} role="img" aria-label={label} style={{ transform: `rotate(${rot}deg) ${swap ? "scale(0.74)" : ""}` }} />;
}
