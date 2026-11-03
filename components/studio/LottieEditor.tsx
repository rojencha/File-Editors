"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { canvasToBlob } from "@/lib/converters/image-utils";
import { baseName, downloadBlob, extOf } from "@/lib/format";
import { createOffscreenPlayer, readLottie, validateLottie, type LottieData } from "@/lib/lottie";
import type { EditorProps } from "./types";

type Player = {
  play(): void;
  pause(): void;
  goToAndStop(v: number, isFrame?: boolean): void;
  setSpeed(s: number): void;
  destroy(): void;
  addEventListener(n: string, cb: () => void): void;
  currentFrame: number;
  isPaused: boolean;
};

const BIG = 3 * 1024 * 1024;

export function LottieEditor({ blob, name, register, setDirty }: EditorProps) {
  const [text, setText] = useState("");
  const [data, setData] = useState<LottieData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [bg, setBg] = useState("transparent");
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const textRef = useRef("");
  const isDot = extOf(name) === "lottie";

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const d = await readLottie(blob, name);
        if (dead) return;
        const t = JSON.stringify(d, null, 2);
        setText(t);
        textRef.current = t;
        setData(d);
      } catch (e) {
        if (!dead) setErr((e as Error).message);
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [blob, name]);

  // Live preview: re-parse after the user pauses typing.
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      try {
        setData(validateLottie(JSON.parse(text)));
        setErr(null);
      } catch (e) {
        setErr(e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : (e as Error).message);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [text, loading]);

  useEffect(() => {
    if (!data || !host.current) return;
    let dead = false;
    (async () => {
      const lottie = (await import("lottie-web")).default;
      if (dead || !host.current) return;
      player.current?.destroy();
      host.current.innerHTML = "";
      try {
        const p = lottie.loadAnimation({ container: host.current, renderer: "svg", loop: true, autoplay: playing, animationData: structuredClone(data) }) as unknown as Player;
        p.setSpeed(speed);
        p.addEventListener("enterFrame", () => setFrame(Math.round(p.currentFrame)));
        player.current = p;
      } catch (e) {
        setErr(`This animation could not be rendered: ${(e as Error).message}`);
      }
    })();
    return () => {
      dead = true;
      player.current?.destroy();
      player.current = null;
    };
    // playing/speed are applied through the handlers below; only data should rebuild the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    register(async () => {
      let parsed: LottieData;
      try {
        parsed = validateLottie(JSON.parse(textRef.current));
      } catch (e) {
        throw new Error(`Fix the JSON before saving: ${(e as Error).message}`);
      }
      return { blob: new Blob([JSON.stringify(parsed)], { type: "application/json" }), name: `${baseName(name)}.json` };
    });
    return () => register(null);
  }, [name, register]);

  const toggle = () => {
    const p = player.current;
    if (!p) return;
    if (p.isPaused) p.play();
    else p.pause();
    setPlaying(!p.isPaused);
  };

  const exportFrame = async () => {
    if (!data) return;
    const p = await createOffscreenPlayer(data, data.w * 2, data.h * 2);
    try {
      p.seek(Math.min(p.totalFrames - 1, frame));
      downloadBlob(await canvasToBlob(p.canvas, "image/png"), `${baseName(name)}-frame-${frame}.png`);
    } finally {
      p.destroy();
    }
  };

  const tooBig = text.length > BIG;
  const total = data ? Math.max(1, Math.floor(data.op - data.ip)) : 1;

  return (
    <div className="studio">
      <div className="studio-main">
        {loading && (
          <div className="row muted">
            <span className="spinner" /> Loading animation…
          </div>
        )}
        {!loading && (
          <>
            <div className="canvas-wrap" style={{ width: "min(480px,100%)", background: bg === "transparent" ? undefined : bg, aspectRatio: data ? `${data.w}/${data.h}` : "1" }}>
              <div ref={host} style={{ width: "100%", height: "100%" }} role="img" aria-label={`Animation preview of ${name}`} />
            </div>
            <div className="player-ctrl">
              <button className="btn icon sm" onClick={toggle} aria-label={playing ? "Pause" : "Play"} disabled={!data}>
                <Icon name={playing ? "pause" : "play"} size={15} />
              </button>
              <input
                type="range"
                min={0}
                max={total}
                value={Math.min(frame, total)}
                aria-label="Scrub animation"
                disabled={!data}
                onChange={(e) => {
                  const f = Number(e.target.value);
                  player.current?.goToAndStop(f, true);
                  setPlaying(false);
                  setFrame(f);
                }}
              />
              <span className="small mono muted" style={{ minWidth: 64, textAlign: "right" }}>
                {frame}/{total}
              </span>
            </div>
            {data && (
              <p className="hint" style={{ marginTop: 8 }}>
                {data.w}×{data.h}px · {Math.round(data.fr)} fps · {(total / data.fr).toFixed(2)}s
              </p>
            )}
          </>
        )}
      </div>
      <aside className="studio-side" style={{ minWidth: 0 }}>
        <div>
          <h3>What you can do</h3>
          <ul className="small muted" style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Play, pause and scrub the animation</li>
            <li>Edit the JSON, the preview updates as you type</li>
            <li>Export the current frame as PNG</li>
            <li>Save the edited JSON</li>
          </ul>
        </div>
        <div className="row wrap">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="speed">Speed</label>
            <select
              id="speed"
              className="select"
              value={speed}
              style={{ height: 34 }}
              onChange={(e) => {
                setSpeed(Number(e.target.value));
                player.current?.setSpeed(Number(e.target.value));
              }}
            >
              {[0.25, 0.5, 1, 1.5, 2].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="lbg">Backdrop</label>
            <select id="lbg" className="select" value={bg} style={{ height: 34 }} onChange={(e) => setBg(e.target.value)}>
              <option value="transparent">Checker</option>
              <option value="#ffffff">White</option>
              <option value="#0f172a">Dark</option>
              <option value="#006dff">Brand</option>
            </select>
          </div>
        </div>
        <button className="btn sm" onClick={exportFrame} disabled={!data}>
          <Icon name="download" size={15} /> Export frame {frame} as PNG
        </button>
        {isDot && <p className="hint">Editing a .lottie archive saves the animation as a plain .json file.</p>}
        <div className="field" style={{ flex: 1, minHeight: 200 }}>
          <label htmlFor="lj">Animation JSON</label>
          {tooBig ? (
            <div className="alert warn">
              <Icon name="info" /> <span className="small">This file is too large to edit comfortably in the browser. Preview only.</span>
            </div>
          ) : (
            <textarea
              id="lj"
              className="textarea code"
              spellCheck={false}
              value={text}
              rows={14}
              style={{ minHeight: 220, flex: 1 }}
              aria-invalid={!!err}
              onChange={(e) => {
                setText(e.target.value);
                setDirty(true);
              }}
            />
          )}
          <div className="row">
            <button
              className="btn sm ghost"
              onClick={() => {
                try {
                  setText(JSON.stringify(JSON.parse(text), null, 2));
                } catch {
                  /* error already shown */
                }
              }}
            >
              Format
            </button>
            <button
              className="btn sm ghost"
              onClick={() => {
                try {
                  setText(JSON.stringify(JSON.parse(text)));
                } catch {
                  /* error already shown */
                }
              }}
            >
              Minify
            </button>
          </div>
          {err && (
            <p className="hint" style={{ color: "var(--err)" }} role="alert">
              {err}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
