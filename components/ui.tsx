"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { extOf, kindLabel, kindOf } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Icon } from "./Icon";

/** Native <dialog>: gives focus trapping, Esc to close and inert background for free. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  labelId,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  labelId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  if (!open) return null;
  const id = labelId ?? "dlg-title";
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => e.target === ref.current && onClose()}
      style={{ margin: "auto" }}
    >
      <div className={`modal${wide ? " wide" : ""}`}>
        <div className="modal-head">
          <h2 id={id} className="truncate">
            {title}
          </h2>
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {wide ? children : <div className="modal-body">{children}</div>}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </dialog>
  );
}

export function PromptDialog({
  open,
  title,
  label,
  initial = "",
  confirmLabel = "Save",
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setV(initial);
      setErr(null);
    }
  }, [open, initial]);
  const submit = async () => {
    if (!v.trim()) return setErr("Please enter a name.");
    setBusy(true);
    try {
      await onSubmit(v.trim());
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy && <span className="spinner" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="field"
      >
        <label htmlFor="prompt-input">{label}</label>
        <input id="prompt-input" className="input" value={v} onChange={(e) => setV(e.target.value)} autoFocus maxLength={120} aria-invalid={!!err} aria-describedby={err ? "prompt-err" : undefined} />
        {err && (
          <p id="prompt-err" className="hint" style={{ color: "var(--err)" }} role="alert">
            {err}
          </p>
        )}
      </form>
    </Modal>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? "danger solid" : "primary"}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <span className="spinner" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="muted">{children}</div>
    </Modal>
  );
}

export function FileIcon({ name, mime }: { name: string; mime?: string }) {
  const k = kindOf(name, mime);
  const ext = extOf(name).slice(0, 4).toUpperCase() || kindLabel(k).slice(0, 3).toUpperCase();
  return (
    <span className={`ficon ${k}`} aria-hidden="true">
      {ext}
    </span>
  );
}

export function ProgressBar({ value, indeterminate, label }: { value: number; indeterminate?: boolean; label?: string }) {
  return (
    <div className={`progress${indeterminate ? " indet" : ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : Math.round(value)}>
      <i style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="orb">
        <Icon name={icon} size={28} />
      </div>
      <h3>{title}</h3>
      {children && <p style={{ maxWidth: 420 }}>{children}</p>}
      {action}
    </div>
  );
}

export function ToastHost() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
          <Icon name={t.kind === "success" ? "check" : t.kind === "error" ? "alert" : "info"} />
          <div className="msg">{t.message}</div>
          <button className="btn ghost icon sm" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useObjectUrl(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
