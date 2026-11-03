"use client";

import JSZip from "jszip";
import { useCallback, useEffect, useRef, useState } from "react";
import { downloadBlob, extOf, formatBytes, kindOf, mimeFromName, safeFileName, baseName, type Kind } from "@/lib/format";
import { isLottieJsonText } from "@/lib/lottie";
import { useApp, type StudioTarget } from "@/lib/store";
import { Icon } from "./Icon";
import { ImageEditor } from "./studio/ImageEditor";
import { LottieEditor } from "./studio/LottieEditor";
import { PdfEditor } from "./studio/PdfEditor";
import { TextEditor } from "./studio/TextEditor";
import type { ExportFn } from "./studio/types";
import { Modal, PromptDialog, useObjectUrl } from "./ui";

export function Studio() {
  const { studio, openStudio } = useApp();
  if (!studio) return null;
  return <StudioInner key={studio.source === "library" ? studio.id : studio.name + studio.blob.size} target={studio} onClose={() => openStudio(null)} />;
}

function StudioInner({ target, onClose }: { target: StudioTarget; onClose: () => void }) {
  const { meta, getBlob, saveFile, replaceFile, renameFile, toast, sendToConvert } = useApp();
  const record = target.source === "library" ? meta.files.find((f) => f.id === target.id) : undefined;
  const [blob, setBlob] = useState<Blob | null>(target.source === "blob" ? target.blob : null);
  const [localName, setLocalName] = useState(target.source === "blob" ? target.name : "");
  const [kind, setKind] = useState<Kind | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [dirty, setDirtyRaw] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const setDirty = useCallback((d: boolean) => {
    setDirtyRaw(d);
    setUnsaved(d);
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const exportRef = useRef<ExportFn | null>(null);
  const register = useCallback((fn: ExportFn | null) => {
    exportRef.current = fn;
  }, []);

  const name = record?.name ?? localName;
  const mime = record?.mime ?? (blob?.type || mimeFromName(name));

  useEffect(() => {
    if (target.source !== "library") return;
    let dead = false;
    getBlob(target.id)
      .then((b) => !dead && setBlob(b))
      .catch((e: Error) => !dead && setLoadErr(e.message));
    return () => {
      dead = true;
    };
  }, [target, getBlob]);

  useEffect(() => {
    if (!blob || !name) return;
    let k = kindOf(name, mime);
    let dead = false;
    (async () => {
      if (k === "data" && blob.size < 20 * 1024 * 1024 && isLottieJsonText(await blob.text())) k = "lottie";
      if (k === "data") k = "text";
      if (!dead) setKind(k);
    })();
    return () => {
      dead = true;
    };
  }, [blob, name, mime]);

  const result = async (): Promise<{ blob: Blob; name: string }> => {
    if (!blob) throw new Error("Nothing to save.");
    if (dirty && exportRef.current) {
      const r = await exportRef.current();
      return { blob: r.blob, name: safeFileName(r.name ?? name, name) };
    }
    return { blob, name };
  };

  const wrap = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const download = () =>
    wrap("download", async () => {
      const r = await result();
      downloadBlob(r.blob, r.name);
    });

  const replace = () =>
    wrap("replace", async () => {
      if (!record) return;
      const r = await result();
      await replaceFile(record.id, r.blob);
      setBlob(r.blob);
      setDirtyRaw(false);
      setUnsaved(false);
      toast("Changes saved to the original file.", "success");
    });

  const saveCopy = () =>
    wrap("copy", async () => {
      const r = await result();
      let nm = r.name;
      if (record && nm === record.name) nm = `${baseName(nm)} (edited)${extOf(nm) ? "." + extOf(nm) : ""}`;
      await saveFile(r.blob, { name: nm, mime: r.blob.type || mimeFromName(nm), groupId: record?.groupId ?? null, origin: record ? `Edited from ${record.name}` : (target.source === "blob" && target.origin) || "Saved from preview" });
      setUnsaved(false);
      toast(`Saved "${nm}" to your library.`, "success");
      if (!record) onClose();
    });

  const renderBody = () => {
    if (loadErr)
      return (
        <div className="studio-main" style={{ justifyContent: "center" }}>
          <div className="alert err" role="alert">
            <Icon name="alert" /> {loadErr}
          </div>
        </div>
      );
    if (!blob || !kind)
      return (
        <div className="studio-main" style={{ justifyContent: "center" }}>
          <div className="row muted">
            <span className="spinner" /> Opening…
          </div>
        </div>
      );
    const props = { blob, name, register, setDirty };
    switch (kind) {
      case "pdf":
        return <PdfEditor {...props} />;
      case "image":
        return <ImageEditor {...props} />;
      case "lottie":
        return <LottieEditor {...props} />;
      case "text":
      case "document":
        return extOf(name) === "docx" || kind === "text" ? <TextEditor {...props} /> : <Unsupported name={name} blob={blob} />;
      case "video":
      case "audio":
        return <MediaPreview blob={blob} kind={kind} />;
      case "archive":
        return <ArchivePreview blob={blob} />;
      default:
        return <Unsupported name={name} blob={blob} />;
    }
  };

  const showSave = dirty && !!exportRef.current;
  return (
    <Modal
      wide
      open
      onClose={() => {
        if (unsaved && !window.confirm("Close without saving your edits?")) return;
        onClose();
      }}
      title={
        <span className="row" style={{ gap: 10 }}>
          <span className="truncate">{name || "File"}</span>
          {blob && <span className="badge">{formatBytes(blob.size)}</span>}
          {unsaved && <span className="badge warn">Unsaved edits</span>}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {renderBody()}
        </div>
        <div className="modal-foot" style={{ justifyContent: "space-between" }}>
          <div className="row wrap">
            <button className="btn sm" onClick={() => setRenaming(true)} disabled={!blob}>
              <Icon name="edit" size={15} /> Rename
            </button>
            {record && (
              <button
                className="btn sm"
                disabled={!blob}
                onClick={() => {
                  if (blob) {
                    sendToConvert([new File([blob], name, { type: mime })]);
                    onClose();
                  }
                }}
              >
                <Icon name="bolt" size={15} /> Convert…
              </button>
            )}
          </div>
          <div className="row wrap" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={download} disabled={!blob || !!busy}>
              {busy === "download" ? <span className="spinner" /> : <Icon name="download" size={16} />} Download{showSave ? " edited" : ""}
            </button>
            {record ? (
              <>
                <button className="btn" onClick={saveCopy} disabled={!blob || !!busy || !showSave}>
                  Save as copy
                </button>
                <button className="btn primary" onClick={replace} disabled={!blob || !!busy || !showSave || (showSave && !!exportRef.current && extOf(name) === "lottie")}>
                  {busy === "replace" && <span className="spinner" />} Save changes
                </button>
              </>
            ) : (
              <button className="btn primary" onClick={saveCopy} disabled={!blob || !!busy}>
                {busy === "copy" ? <span className="spinner" /> : <Icon name="save" size={16} />} Save to library
              </button>
            )}
          </div>
        </div>
      </div>
      <PromptDialog
        open={renaming}
        title="Rename file"
        label="File name"
        initial={name}
        onClose={() => setRenaming(false)}
        onSubmit={async (n) => {
          const clean = safeFileName(n, name);
          if (record) await renameFile(record.id, clean);
          else setLocalName(clean);
        }}
      />
    </Modal>
  );
}

function Unsupported({ name, blob }: { name: string; blob: Blob }) {
  return (
    <div className="studio-main" style={{ justifyContent: "center", textAlign: "center", gap: 8 }}>
      <Icon name="file" size={36} />
      <h3>No preview for this file type</h3>
      <p className="muted small" style={{ maxWidth: 420 }}>
        {name} ({formatBytes(blob.size)}) can still be renamed, organised and downloaded. Previews are available for PDF, images, Word, Markdown, HTML, CSV, JSON, text, Lottie and ZIP files.
      </p>
    </div>
  );
}

function MediaPreview({ blob, kind }: { blob: Blob; kind: "video" | "audio" }) {
  const url = useObjectUrl(blob);
  return (
    <div className="studio-main" style={{ justifyContent: "center" }}>
      {url &&
        (kind === "video" ? (
          <video src={url} controls style={{ maxWidth: "100%", maxHeight: "70dvh", borderRadius: 8, background: "#000" }} />
        ) : (
          <audio src={url} controls />
        ))}
    </div>
  );
}

function ArchivePreview({ blob }: { blob: Blob }) {
  const [entries, setEntries] = useState<{ name: string; size: number }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    JSZip.loadAsync(blob)
      .then((z) => setEntries(Object.values(z.files).filter((f) => !f.dir).map((f) => ({ name: f.name, size: (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0 }))))
      .catch(() => setErr("This archive couldn't be opened."));
  }, [blob]);
  return (
    <div className="studio-main" style={{ alignItems: "stretch" }}>
      {err && <div className="alert err">{err}</div>}
      {!entries && !err && (
        <div className="row muted" style={{ justifyContent: "center" }}>
          <span className="spinner" /> Reading archive…
        </div>
      )}
      {entries && (
        <div className="card" style={{ width: "min(640px,100%)", alignSelf: "center" }}>
          <div className="card-head">
            <h2>{entries.length} files in archive</h2>
          </div>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {entries.slice(0, 500).map((e) => (
              <div className="frow" key={e.name}>
                <div className="meta truncate mono small">{e.name}</div>
                {e.size > 0 && <span className="small muted">{formatBytes(e.size)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
