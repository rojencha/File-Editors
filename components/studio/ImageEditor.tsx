"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { canvasToBlob, canEncodeWebp, decodeImage, makeCanvas } from "@/lib/converters/image-utils";
import { baseName, extOf } from "@/lib/format";
import type { EditorProps } from "./types";

type Rect = { x: number; y: number; w: number; h: number };
const MAX_UNDO = 8;

export function ImageEditor({ blob, name, register, setDirty }: EditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const work = useRef<HTMLCanvasElement | null>(null);
  const undo = useRef<HTMLCanvasElement[]>([]);
  const [, bump] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [rw, setRw] = useState(0);
  const [rh, setRh] = useState(0);
  const [lock, setLock] = useState(true);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [fmt, setFmt] = useState<"png" | "jpeg" | "webp">("png");
  const [quality, setQuality] = useState(90);
  const [webp, setWebp] = useState(true);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const fmtRef = useRef({ fmt, quality });
  fmtRef.current = { fmt, quality };

  const paint = useCallback(() => {
    const w = work.current;
    const c = canvasRef.current;
    if (!w || !c) return;
    c.width = w.width;
    c.height = w.height;
    c.getContext("2d")!.drawImage(w, 0, 0);
    setSize({ w: w.width, h: w.height });
    setRw(w.width);
    setRh(w.height);
    bump((n) => n + 1);
  }, []);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        setWebp(await canEncodeWebp());
        const d = await decodeImage(blob, name);
        if (dead) return d.close();
        const w = makeCanvas(d.width, d.height);
        w.getContext("2d")!.drawImage(d.source, 0, 0);
        d.close();
        work.current = w;
        undo.current = [];
        const t = blob.type;
        setFmt(t === "image/jpeg" ? "jpeg" : t === "image/webp" ? "webp" : "png");
        setLoading(false);
        paint();
      } catch (e) {
        if (!dead) {
          setErr((e as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      dead = true;
    };
  }, [blob, name, paint]);

  useEffect(() => {
    register(async () => {
      const w = work.current;
      if (!w) throw new Error("Image not loaded.");
      const { fmt: f, quality: q } = fmtRef.current;
      let src = w;
      if (f === "jpeg") {
        src = makeCanvas(w.width, w.height);
        const g = src.getContext("2d")!;
        g.fillStyle = "#fff";
        g.fillRect(0, 0, w.width, w.height);
        g.drawImage(w, 0, 0);
      }
      const out = await canvasToBlob(src, `image/${f}`, f === "png" ? undefined : q / 100);
      return { blob: out, name: `${baseName(name)}.${f === "jpeg" ? "jpg" : f}` };
    });
    return () => register(null);
  }, [name, register]);

  const apply = (fn: (src: HTMLCanvasElement) => HTMLCanvasElement) => {
    const w = work.current;
    if (!w) return;
    undo.current = [...undo.current.slice(-(MAX_UNDO - 1)), w];
    work.current = fn(w);
    setCrop(null);
    setDirty(true);
    paint();
  };

  const rotate = (dir: 1 | -1) =>
    apply((src) => {
      const c = makeCanvas(src.height, src.width);
      const g = c.getContext("2d")!;
      g.translate(c.width / 2, c.height / 2);
      g.rotate((dir * Math.PI) / 2);
      g.drawImage(src, -src.width / 2, -src.height / 2);
      return c;
    });

  const flip = (axis: "h" | "v") =>
    apply((src) => {
      const c = makeCanvas(src.width, src.height);
      const g = c.getContext("2d")!;
      if (axis === "h") g.setTransform(-1, 0, 0, 1, c.width, 0);
      else g.setTransform(1, 0, 0, -1, 0, c.height);
      g.drawImage(src, 0, 0);
      return c;
    });

  const resize = () => {
    if (rw < 1 || rh < 1 || rw > 16384 || rh > 16384 || rw * rh > 100_000_000) return setErr("Choose a size between 1 and 16384 px per side.");
    setErr(null);
    apply((src) => {
      const c = makeCanvas(rw, rh);
      const g = c.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      g.drawImage(src, 0, 0, c.width, c.height);
      return c;
    });
  };

  const applyCrop = () => {
    if (!crop || crop.w < 1 || crop.h < 1) return;
    apply((src) => {
      const c = makeCanvas(crop.w, crop.h);
      c.getContext("2d")!.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      return c;
    });
  };

  const toImg = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const k = size.w / r.width;
    return { x: Math.min(size.w, Math.max(0, (e.clientX - r.left) * k)), y: Math.min(size.h, Math.max(0, (e.clientY - r.top) * k)) };
  };

  const clampCrop = (r: Rect): Rect => {
    const x = Math.max(0, Math.min(size.w - 1, Math.round(r.x)));
    const y = Math.max(0, Math.min(size.h - 1, Math.round(r.y)));
    return { x, y, w: Math.max(1, Math.min(size.w - x, Math.round(r.w))), h: Math.max(1, Math.min(size.h - y, Math.round(r.h))) };
  };

  const cropStyle = crop && size.w ? { left: `${(crop.x / size.w) * 100}%`, top: `${(crop.y / size.h) * 100}%`, width: `${(crop.w / size.w) * 100}%`, height: `${(crop.h / size.h) * 100}%` } : undefined;
  const ext = extOf(name);

  return (
    <div className="studio">
      <div className="studio-main">
        {loading && (
          <div className="row muted">
            <span className="spinner" /> Loading image…
          </div>
        )}
        {err && (
          <div className="alert err" role="alert" style={{ marginBottom: 12 }}>
            <Icon name="alert" /> {err}
          </div>
        )}
        <div
          ref={wrapRef}
          className="canvas-wrap"
          style={{ display: loading ? "none" : undefined, touchAction: "none", cursor: "crosshair" }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            dragStart.current = toImg(e);
            setCrop(null);
          }}
          onPointerMove={(e) => {
            const s = dragStart.current;
            if (!s) return;
            const p = toImg(e);
            setCrop(clampCrop({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }));
          }}
          onPointerUp={() => {
            dragStart.current = null;
            setCrop((c) => (c && (c.w < 4 || c.h < 4) ? null : c));
          }}
        >
          <canvas ref={canvasRef} role="img" aria-label={`Preview of ${name}`} />
          {crop && <div className="crop-box" style={cropStyle} />}
        </div>
        {!loading && (
          <p className="hint" style={{ marginTop: 10 }}>
            Drag on the image to select an area to crop · {size.w} × {size.h} px
          </p>
        )}
      </div>
      <aside className="studio-side">
        <div>
          <h3>Transform</h3>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => rotate(-1)} disabled={loading}>
              <Icon name="rotateL" size={15} /> 90°
            </button>
            <button className="btn sm" onClick={() => rotate(1)} disabled={loading}>
              <Icon name="rotate" size={15} /> 90°
            </button>
            <button className="btn sm" onClick={() => flip("h")} disabled={loading}>
              <Icon name="flip" size={15} /> Flip H
            </button>
            <button className="btn sm" onClick={() => flip("v")} disabled={loading}>
              <Icon name="flip" size={15} /> Flip V
            </button>
          </div>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <h3>Crop</h3>
          {crop ? (
            <>
              <div className="opts-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {(["x", "y", "w", "h"] as const).map((k) => (
                  <div className="field" key={k}>
                    <label htmlFor={`crop-${k}`}>{{ x: "Left", y: "Top", w: "Width", h: "Height" }[k]}</label>
                    <input id={`crop-${k}`} className="input" type="number" min={0} value={crop[k]} onChange={(e) => setCrop(clampCrop({ ...crop, [k]: Number(e.target.value) }))} style={{ height: 34 }} />
                  </div>
                ))}
              </div>
              <div className="row">
                <button className="btn primary sm" onClick={applyCrop}>
                  <Icon name="crop" size={15} /> Apply crop
                </button>
                <button className="btn sm ghost" onClick={() => setCrop(null)}>
                  Clear
                </button>
              </div>
            </>
          ) : (
            <p className="hint">Drag a rectangle on the image to start.</p>
          )}
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <h3>Resize</h3>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="rw">Width</label>
              <input
                id="rw"
                className="input"
                type="number"
                min={1}
                value={rw}
                style={{ height: 34 }}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setRw(v);
                  if (lock && size.w) setRh(Math.max(1, Math.round((v * size.h) / size.w)));
                }}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="rh">Height</label>
              <input
                id="rh"
                className="input"
                type="number"
                min={1}
                value={rh}
                style={{ height: 34 }}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setRh(v);
                  if (lock && size.h) setRw(Math.max(1, Math.round((v * size.w) / size.h)));
                }}
              />
            </div>
          </div>
          <label className="switch small">
            <input type="checkbox" className="check" checked={lock} onChange={(e) => setLock(e.target.checked)} /> Keep proportions
          </label>
          <button className="btn sm" onClick={resize} disabled={loading || (rw === size.w && rh === size.h)}>
            Apply size
          </button>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <h3>Save as</h3>
          <div className="field">
            <label htmlFor="fmt">Format</label>
            <select
              id="fmt"
              className="select"
              value={fmt}
              onChange={(e) => {
                setFmt(e.target.value as typeof fmt);
                setDirty(true);
              }}
            >
              <option value="png">PNG (lossless)</option>
              <option value="jpeg">JPG</option>
              {webp && <option value="webp">WebP</option>}
            </select>
          </div>
          {fmt !== "png" && (
            <div className="field">
              <label htmlFor="q">Quality: {quality}</label>
              <input id="q" type="range" min={10} max={100} step={5} value={quality} onChange={(e) => setQuality(Number(e.target.value))} style={{ accentColor: "var(--brand)" }} />
            </div>
          )}
          {(ext === "svg" || ext === "gif") && <p className="hint">{ext === "svg" ? "SVG is converted to a raster image when edited." : "Animated GIFs are flattened to their first frame."}</p>}
        </div>

        <div className="row">
          <button
            className="btn sm"
            disabled={!undo.current.length}
            onClick={() => {
              const prev = undo.current.pop();
              if (prev) {
                work.current = prev;
                setCrop(null);
                paint();
                setDirty(undo.current.length > 0);
              }
            }}
          >
            Undo
          </button>
          <span className="hint">{undo.current.length} step{undo.current.length === 1 ? "" : "s"} to undo</span>
        </div>
      </aside>
    </div>
  );
}
