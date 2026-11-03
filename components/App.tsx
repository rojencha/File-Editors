"use client";

import { useEffect, useState } from "react";
import { ConvertView } from "./ConvertView";
import { Icon } from "./Icon";
import { LibraryView, StorageNotice } from "./LibraryView";
import { Studio } from "./Studio";
import { Modal, ToastHost } from "./ui";
import { AppProvider, useApp } from "@/lib/store";
import { formatBytes } from "@/lib/format";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    try {
      const t = localStorage.getItem("fileforge.theme");
      if (t === "light" || t === "dark") {
        setTheme(t);
        document.documentElement.dataset.theme = t;
      }
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = () => {
    const isDark = theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("fileforge.theme", next);
    } catch {
      /* ignore */
    }
  };
  return { theme, toggle };
}

function Shell() {
  const { view, setView, meta, mode, ready, loadError, config } = useApp();
  const { toggle } = useTheme();
  const [info, setInfo] = useState(false);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="stack" size={18} />
            </span>
            Fileforge
          </div>
          <div className="tabs" role="tablist" aria-label="Main sections">
            <button className="tab" role="tab" id="tab-convert" aria-selected={view === "convert"} aria-controls="main" onClick={() => setView("convert")}>
              <Icon name="bolt" size={16} /> Convert
            </button>
            <button className="tab" role="tab" id="tab-library" aria-selected={view === "library"} aria-controls="main" onClick={() => setView("library")}>
              <Icon name="folder" size={16} /> Library {meta.files.length > 0 && <span className="count">{meta.files.length}</span>}
            </button>
          </div>
          <span className="spacer" />
          {mode && (
            <button className="storage-pill" onClick={() => setInfo(true)} aria-label="How files are stored">
              <span className={`dot${mode === "local" ? " warn" : ""}`} />
              <span className="lbl">{mode === "cloud" ? "Cloud workspace" : "This browser only"}</span>
              <Icon name="info" size={14} />
            </button>
          )}
          <button className="btn icon ghost" onClick={toggle} aria-label="Toggle dark mode">
            <Icon name="moon" />
          </button>
        </header>

        <main id="main" role="tabpanel" aria-labelledby={view === "convert" ? "tab-convert" : "tab-library"} tabIndex={-1}>
          {!ready ? (
            <div className="empty">
              <span className="spinner" style={{ width: 28, height: 28 }} />
              <p>Setting up your workspace…</p>
            </div>
          ) : loadError ? (
            <div className="alert err" style={{ marginTop: 40 }} role="alert">
              <Icon name="alert" />
              <div>
                <strong>Couldn&apos;t start the workspace.</strong>
                <div className="small">{loadError}</div>
              </div>
            </div>
          ) : view === "convert" ? (
            <ConvertView />
          ) : (
            <LibraryView />
          )}
        </main>
      </div>

      <Modal open={info} onClose={() => setInfo(false)} title="How your files are stored">
        <div className="stack">
          <StorageNotice mode={mode} retentionDays={config?.retentionDays ?? 30} maxWorkspaceMB={config?.maxWorkspaceMB ?? 500} used={meta.files.reduce((s, f) => s + f.size, 0)} />
          <p className="small muted">
            There are no accounts. A random workspace token is created in this browser and used to separate your files from everyone else&apos;s. Converting happens in your browser wherever possible, so files are only uploaded when you choose to save them
            {config?.external.enabled ? " or use an external conversion service" : ""}. Per-file limit {config?.maxFileMB ?? 100} MB ({formatBytes((config?.maxFileMB ?? 100) * 1024 * 1024)}).
          </p>
        </div>
      </Modal>
      <Studio />
      <ToastHost />
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
