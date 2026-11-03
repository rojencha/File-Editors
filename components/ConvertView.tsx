"use client";

import JSZip from "jszip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  annotateFiles,
  applicableConverters,
  defaultOptions,
  GROUP_ORDER,
  type Applicability,
  type Converter,
  type OptionValue,
  type Output,
} from "@/lib/converters";
import { downloadBlob, extOf, formatBytes, kindOf, mimeFromName, safeFileName, uid } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Icon } from "./Icon";
import { EmptyState, FileIcon, ProgressBar, PromptDialog, useObjectUrl } from "./ui";

type Item = { id: string; file: File };
type Result = Output & { id: string; saved: boolean };

const MAX_FILES = 50;
const EDITABLE = new Set(["pdf", "image", "lottie", "text", "data"]);
const canOpen = (f: File) => EDITABLE.has(kindOf(f.name, f.type)) || extOf(f.name) === "docx";

export function ConvertView() {
  const { config, env, meta, saveFile, createGroup, toast, openStudio, inbox, clearInbox } = useApp();
  const [items, setItems] = useState<Item[]>([]);
  const [lottieMap, setLottieMap] = useState<Map<File, { lottie: boolean }>>(new Map());
  const [converterId, setConverterId] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, OptionValue>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, label: "" });
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [resultFrom, setResultFrom] = useState<Converter | null>(null);
  const [drag, setDrag] = useState(false);
  const [targetGroup, setTargetGroup] = useState<string>("");
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const maxBytes = (config?.maxFileMB ?? 100) * 1024 * 1024;

  const files = useMemo(() => items.map((i) => i.file), [items]);

  const addFiles = useCallback(
    async (list: File[]) => {
      const accepted: File[] = [];
      for (const f of list) {
        if (f.size === 0) toast(`"${f.name}" is empty and was skipped.`, "error");
        else if (f.size > maxBytes) toast(`"${f.name}" is ${formatBytes(f.size)}. The limit is ${formatBytes(maxBytes)}.`, "error");
        else accepted.push(f);
      }
      if (!accepted.length) return;
      const room = MAX_FILES - items.length;
      if (accepted.length > room) toast(`You can queue up to ${MAX_FILES} files at once. Extra files were skipped.`, "info");
      const take = accepted.slice(0, Math.max(0, room));
      const ann = await annotateFiles(take);
      setLottieMap((m) => new Map([...m, ...ann]));
      setItems((prev) => [...prev, ...take.map((file) => ({ id: uid(), file }))]);
      setConverterId(null);
      setResults([]);
      setError(null);
    },
    [items.length, maxBytes, toast],
  );

  useEffect(() => {
    if (inbox.length) {
      void addFiles(inbox);
      clearInbox();
    }
  }, [inbox, addFiles, clearInbox]);

  const options_ = useMemo<Applicability[]>(() => applicableConverters(files, lottieMap, env), [files, lottieMap, env]);
  const converter = options_.find((a) => a.converter.id === converterId)?.converter ?? null;

  useEffect(() => {
    if (converterId && !converter) setConverterId(null);
  }, [converterId, converter]);

  const choose = (c: Converter) => {
    setConverterId(c.id);
    setOptions(defaultOptions(c));
    setResults([]);
    setError(null);
  };

  const move = (idx: number, d: -1 | 1) =>
    setItems((prev) => {
      const j = idx + d;
      if (j < 0 || j >= prev.length) return prev;
      const n = [...prev];
      [n[idx], n[j]] = [n[j], n[idx]];
      return n;
    });

  const run = async () => {
    if (!converter) return;
    setRunning(true);
    setError(null);
    setResults([]);
    setProgress({ pct: 0, label: "Starting…" });
    const ac = new AbortController();
    abort.current = ac;
    try {
      const out = await converter.run(files, {
        options,
        signal: ac.signal,
        onProgress: (pct, label) => setProgress((p) => ({ pct, label: label ?? p.label })),
      });
      if (!out.length) throw new Error("The conversion finished but produced no files.");
      const used = new Map<string, number>();
      const unique = out.map((o) => {
        const base = safeFileName(o.name);
        const n = used.get(base) ?? 0;
        used.set(base, n + 1);
        const name = n === 0 ? base : base.replace(/(\.[^.]+)?$/, ` (${n + 1})$1`);
        return { ...o, name, id: uid(), saved: false };
      });
      setResults(unique);
      setResultFrom(converter);
      toast(`Converted ${unique.length === 1 ? "1 file" : `${unique.length} files`}.`, "success");
    } catch (e) {
      const msg = (e as Error).message || "Conversion failed.";
      if (msg !== "Cancelled.") setError(msg);
      else toast("Conversion cancelled.", "info");
    } finally {
      setRunning(false);
      abort.current = null;
    }
  };

  const saveOne = async (r: Result) => {
    try {
      await saveFile(r.blob, { name: r.name, mime: r.blob.type || mimeFromName(r.name), groupId: targetGroup || null, origin: resultFrom?.label ?? "Converted" });
      setResults((rs) => rs.map((x) => (x.id === r.id ? { ...x, saved: true } : x)));
      toast(`Saved "${r.name}" to your library.`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const saveAll = async () => {
    setSavingAll(true);
    let n = 0;
    for (const r of results.filter((x) => !x.saved)) {
      try {
        await saveFile(r.blob, { name: r.name, mime: r.blob.type || mimeFromName(r.name), groupId: targetGroup || null, origin: resultFrom?.label ?? "Converted" });
        setResults((rs) => rs.map((x) => (x.id === r.id ? { ...x, saved: true } : x)));
        n++;
      } catch (e) {
        toast(`"${r.name}": ${(e as Error).message}`, "error");
        break;
      }
    }
    setSavingAll(false);
    if (n) toast(`Saved ${n} file${n > 1 ? "s" : ""} to your library.`, "success");
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    results.forEach((r) => zip.file(r.name, r.blob));
    downloadBlob(await zip.generateAsync({ type: "blob" }), "converted-files.zip");
  };

  const step = results.length ? 4 : converter ? 3 : files.length ? 2 : 1;
  const grouped = GROUP_ORDER.map((g) => ({ g, list: options_.filter((a) => a.converter.group === g) })).filter((x) => x.list.length);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <section className="hero">
        <h1>
          Convert, edit and organise <em>any file</em>, no sign-up.
        </h1>
        <p>Drop your files, pick what you need, and download the result. Most conversions run privately in your browser.</p>
      </section>

      <ol className="steps" aria-label="Progress">
        {["Upload", "Choose action", "Convert", "Save or download"].map((s, i) => (
          <li key={s} className={`step${step === i + 1 ? " active" : ""}${step > i + 1 ? " done" : ""}`} aria-current={step === i + 1 ? "step" : undefined}>
            <span className="n">{step > i + 1 ? <Icon name="check" size={13} /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {/* 1 · Upload */}
      <section className="card" aria-labelledby="h-upload">
        <div className="card-head">
          <h2 id="h-upload">1 · Your files</h2>
          <span className="sub">
            Up to {MAX_FILES} files, {config?.maxFileMB ?? 100} MB each
          </span>
          <span className="spacer" />
          {items.length > 0 && (
            <button
              className="btn sm ghost"
              onClick={() => {
                setItems([]);
                setConverterId(null);
                setResults([]);
                setError(null);
              }}
            >
              Clear all
            </button>
          )}
        </div>
        <div className="card-pad">
          <div
            className={`dropzone${drag ? " drag" : ""}${items.length ? " compact" : ""}`}
            role="button"
            tabIndex={0}
            aria-label="Upload files. Drop files here or press Enter to browse."
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), inputRef.current?.click())}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void addFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <div className="orb" style={items.length ? { width: 36, height: 36, borderRadius: 12 } : undefined}>
              <Icon name="upload" size={items.length ? 18 : 28} />
            </div>
            <div>
              <h3 style={items.length ? { fontSize: 15 } : undefined}>{items.length ? "Add more files" : "Drop files here, or click to browse"}</h3>
              {!items.length && <p className="muted small" style={{ marginTop: 4 }}>PDF · images · Word / Markdown / HTML / CSV / TXT · Lottie (.json, .lottie) · JSON</p>}
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </div>

          {items.length > 0 && (
            <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: "var(--r-m)", overflow: "hidden" }}>
              {items.map((it, idx) => (
                <div className="frow" key={it.id}>
                  <FileIcon name={it.file.name} mime={it.file.type} />
                  <div className="meta">
                    <div className="name truncate">{it.file.name}</div>
                    <div className="small muted">{formatBytes(it.file.size)}</div>
                  </div>
                  {items.length > 1 && (
                    <div className="row" style={{ gap: 2 }}>
                      <button className="btn ghost icon sm" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={`Move ${it.file.name} up`}>
                        <Icon name="up" size={16} />
                      </button>
                      <button className="btn ghost icon sm" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} aria-label={`Move ${it.file.name} down`}>
                        <Icon name="down" size={16} />
                      </button>
                    </div>
                  )}
                  {canOpen(it.file) && (
                    <button className="btn sm" onClick={() => openStudio({ source: "blob", blob: it.file, name: it.file.name })}>
                      <Icon name="eye" size={15} /> Preview / edit
                    </button>
                  )}
                  <button
                    className="btn ghost icon sm"
                    aria-label={`Remove ${it.file.name}`}
                    onClick={() => {
                      setItems((p) => p.filter((x) => x.id !== it.id));
                      setConverterId(null);
                      setResults([]);
                    }}
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 2 · Choose */}
      {files.length > 0 && (
        <section className="card" aria-labelledby="h-choose">
          <div className="card-head">
            <h2 id="h-choose">2 · Choose an action</h2>
            <span className="sub">{options_.length ? "Only conversions that fit your files are shown." : ""}</span>
          </div>
          <div className="card-pad stack">
            {options_.length === 0 ? (
              <div className="alert warn">
                <Icon name="info" />
                <div>
                  <strong>No conversion fits this selection.</strong>
                  <div className="small" style={{ marginTop: 2 }}>
                    {files.length > 1 ? "Mixed file types can't be converted together. Remove some files so they share a type (for example, only images or only PDFs). " : "This file type isn't supported for conversion yet. "}
                    You can still preview or edit supported files, or save them to your library.
                  </div>
                </div>
              </div>
            ) : (
              grouped.map(({ g, list }) => (
                <div key={g} className="cgroup" role="radiogroup" aria-label={`${g} conversions`}>
                  <h3>{g}</h3>
                  <div className="cgrid">
                    {list.map((a) => (
                      <button
                        key={a.converter.id}
                        role="radio"
                        aria-checked={converterId === a.converter.id}
                        className="copt"
                        disabled={a.state === "locked"}
                        onClick={() => choose(a.converter)}
                      >
                        <span className="t">
                          {a.converter.label}
                          {a.converter.runtime === "provider" ? <span className="badge warn">External service</span> : <span className="badge ok">In your browser</span>}
                        </span>
                        <span className="d">{a.converter.description}</span>
                        {a.state === "locked" && (
                          <span className="lock">
                            <Icon name="lock" size={14} />
                            {a.reason}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* 3 · Convert */}
      {converter && (
        <section className="card" aria-labelledby="h-run">
          <div className="card-head">
            <h2 id="h-run">3 · Convert</h2>
            <span className="sub">
              {files.length} file{files.length > 1 ? "s" : ""} → {converter.to}
            </span>
          </div>
          <div className="card-pad stack">
            {converter.note && (
              <div className="alert info">
                <Icon name="info" />
                <span className="small">{converter.note}</span>
              </div>
            )}
            {converter.options && converter.options.length > 0 && (
              <div className="opts-grid">
                {converter.options.map((o) => (
                  <div className="field" key={o.key}>
                    {o.type === "toggle" ? (
                      <label className="switch">
                        <input type="checkbox" className="check" checked={Boolean(options[o.key])} onChange={(e) => setOptions((p) => ({ ...p, [o.key]: e.target.checked }))} disabled={running} />
                        {o.label}
                      </label>
                    ) : (
                      <>
                        <label htmlFor={`opt-${o.key}`}>{o.label}</label>
                        {o.type === "select" ? (
                          <select id={`opt-${o.key}`} className="select" value={String(options[o.key])} onChange={(e) => setOptions((p) => ({ ...p, [o.key]: e.target.value }))} disabled={running}>
                            {o.choices!.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={`opt-${o.key}`}
                            className="input"
                            type={o.type === "number" ? "number" : "text"}
                            min={o.min}
                            max={o.max}
                            step={o.step}
                            placeholder={o.placeholder}
                            value={String(options[o.key] ?? "")}
                            disabled={running}
                            onChange={(e) => setOptions((p) => ({ ...p, [o.key]: o.type === "number" ? Number(e.target.value) : e.target.value }))}
                          />
                        )}
                        {o.hint && <span className="hint">{o.hint}</span>}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {running && (
              <div className="stack" style={{ gap: 8 }} aria-live="polite">
                <ProgressBar value={progress.pct} label="Conversion progress" />
                <div className="row small muted">
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  <span className="truncate">{progress.label || "Working…"}</span>
                  <span className="spacer" />
                  <span>{Math.round(progress.pct)}%</span>
                </div>
              </div>
            )}

            {error && (
              <div className="alert err" role="alert">
                <Icon name="alert" />
                <div>
                  <strong>Conversion failed</strong>
                  <div className="small" style={{ marginTop: 2 }}>
                    {error}
                  </div>
                </div>
              </div>
            )}

            <div className="row wrap">
              {!running ? (
                <button className="btn primary lg" onClick={run}>
                  <Icon name="bolt" /> {error ? "Try again" : `Convert to ${converter.to}`}
                </button>
              ) : (
                <button className="btn lg" onClick={() => abort.current?.abort()}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 4 · Results */}
      {results.length > 0 && (
        <section className="card" aria-labelledby="h-res">
          <div className="card-head wrap">
            <h2 id="h-res">4 · Your results</h2>
            <span className="badge ok">
              <Icon name="check" size={12} /> {results.length} file{results.length > 1 ? "s" : ""} ready
            </span>
            <span className="spacer" />
            <label className="row small" style={{ gap: 8 }}>
              <span className="muted">Save to</span>
              <select
                className="select"
                style={{ width: 170, height: 34 }}
                value={targetGroup}
                aria-label="Group to save into"
                onChange={(e) => (e.target.value === "__new" ? setNewGroupOpen(true) : setTargetGroup(e.target.value))}
              >
                <option value="">Library (no group)</option>
                {meta.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                <option value="__new">＋ New group…</option>
              </select>
            </label>
            <button className="btn primary sm" onClick={saveAll} disabled={savingAll || results.every((r) => r.saved)}>
              {savingAll ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icon name="save" size={15} />} Save all
            </button>
            {results.length > 1 && (
              <button className="btn sm" onClick={downloadZip}>
                <Icon name="zip" size={15} /> Download ZIP
              </button>
            )}
          </div>
          <div>
            {results.map((r) => (
              <ResultRow key={r.id} r={r} onSave={() => saveOne(r)} onOpen={() => openStudio({ source: "blob", blob: r.blob, name: r.name, origin: resultFrom?.label })} />
            ))}
          </div>
          <div className="card-pad" style={{ paddingTop: 12 }}>
            <p className="hint">
              <Icon name="info" size={13} /> Results exist only in this tab until you save them. Saved files go to your library, see how long they&apos;re kept in the Library tab.
            </p>
          </div>
        </section>
      )}

      {!files.length && (
        <EmptyState icon="bolt" title="What you can do here">
          Convert PDFs and images, turn documents into PDF, export Lottie animations, merge or split PDFs, and edit pages, images and animations, all without an account.
        </EmptyState>
      )}

      <PromptDialog
        open={newGroupOpen}
        title="New group"
        label="Group name"
        confirmLabel="Create"
        onClose={() => setNewGroupOpen(false)}
        onSubmit={async (name) => {
          const g = await createGroup(name);
          setTargetGroup(g.id);
        }}
      />
    </div>
  );
}

function ResultRow({ r, onSave, onOpen }: { r: Result; onSave: () => void; onOpen: () => void }) {
  const isImg = r.blob.type.startsWith("image/");
  const url = useObjectUrl(isImg ? r.blob : null);
  const kind = kindOf(r.name, r.blob.type);
  return (
    <div className="frow">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="thumb" src={url} alt="" />
      ) : (
        <FileIcon name={r.name} mime={r.blob.type} />
      )}
      <div className="meta">
        <div className="name truncate">{r.name}</div>
        <div className="small muted">{formatBytes(r.blob.size)}</div>
      </div>
      {r.saved && (
        <span className="badge ok">
          <Icon name="check" size={12} /> Saved
        </span>
      )}
      {kind !== "other" && (
        <button className="btn sm ghost" onClick={onOpen}>
          <Icon name="eye" size={15} /> <span className="sr-only">Preview </span>
          Preview
        </button>
      )}
      {!r.saved && (
        <button className="btn sm" onClick={onSave}>
          <Icon name="save" size={15} /> Save
        </button>
      )}
      <button className="btn sm primary" onClick={() => downloadBlob(r.blob, r.name)}>
        <Icon name="download" size={15} /> Download
      </button>
    </div>
  );
}
