"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CloudDriver } from "@/lib/storage/cloud";
import { LocalDriver } from "@/lib/storage/local";
import type { NewFile, StorageDriver } from "@/lib/storage/types";
import { emptyMeta, type FileRecord, type Group, type PublicConfig, type WorkspaceMeta } from "@/lib/types";
import { uid } from "@/lib/format";
import { canEncodeWebp } from "@/lib/converters/image-utils";
import type { Env } from "@/lib/converters/types";

export type StudioTarget =
  | { source: "library"; id: string }
  | { source: "blob"; blob: Blob; name: string; origin?: string };

export type Toast = { id: string; kind: "success" | "error" | "info"; message: string };

type Ctx = {
  config: PublicConfig | null;
  env: Env;
  mode: "cloud" | "local" | null;
  meta: WorkspaceMeta;
  ready: boolean;
  loadError: string | null;
  reload: () => Promise<void>;
  saveFile: (blob: Blob, info: NewFile, onProgress?: (p: number) => void) => Promise<FileRecord>;
  replaceFile: (id: string, blob: Blob) => Promise<void>;
  renameFile: (id: string, name: string) => Promise<void>;
  moveFiles: (ids: string[], groupId: string | null) => Promise<void>;
  deleteFiles: (ids: string[]) => Promise<void>;
  createGroup: (name: string) => Promise<Group>;
  renameGroup: (id: string, name: string) => Promise<void>;
  deleteGroup: (id: string, deleteFiles: boolean) => Promise<void>;
  getBlob: (id: string) => Promise<Blob>;
  toasts: Toast[];
  toast: (message: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;
  studio: StudioTarget | null;
  openStudio: (t: StudioTarget | null) => void;
  inbox: File[];
  sendToConvert: (files: File[]) => void;
  clearInbox: () => void;
  view: "convert" | "library";
  setView: (v: "convert" | "library") => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp must be used inside <AppProvider>");
  return c;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [mode, setMode] = useState<"cloud" | "local" | null>(null);
  const [meta, setMeta] = useState<WorkspaceMeta>(emptyMeta());
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [studio, setStudio] = useState<StudioTarget | null>(null);
  const [inbox, setInbox] = useState<File[]>([]);
  const [view, setView] = useState<"convert" | "library">("convert");
  const [features, setFeatures] = useState<Env["features"]>({ webmRecording: false, webpEncode: false });
  const driver = useRef<StorageDriver | null>(null);

  const toast = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = uid();
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 8000 : 4000);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const init = useCallback(async () => {
    setLoadError(null);
    try {
      let cfg: PublicConfig | null = null;
      try {
        const r = await fetch("/api/config", { cache: "no-store" });
        if (r.ok) cfg = (await r.json()) as PublicConfig;
      } catch {
        /* offline or static preview: fall back to local storage */
      }
      setConfig(cfg);
      let d: StorageDriver = cfg?.cloud ? new CloudDriver() : new LocalDriver();
      try {
        setMeta(await d.load());
      } catch (e) {
        if (d.kind === "cloud") {
          // Cloud unreachable: keep working locally rather than blocking the whole app.
          toast("Cloud storage is unreachable, so files will be kept in this browser only.", "error");
          d = new LocalDriver();
          setMeta(await d.load());
        } else throw e;
      }
      driver.current = d;
      setMode(d.kind);
    } catch (e) {
      setLoadError((e as Error).message || "Could not start the workspace.");
    } finally {
      setReady(true);
    }
  }, [toast]);

  useEffect(() => {
    void init();
    const webm =
      typeof MediaRecorder !== "undefined" &&
      ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].some((m) => MediaRecorder.isTypeSupported(m)) &&
      typeof HTMLCanvasElement !== "undefined" &&
      "captureStream" in HTMLCanvasElement.prototype;
    void canEncodeWebp().then((webp) => setFeatures({ webmRecording: webm, webpEncode: webp }));
  }, [init]);

  const d = () => {
    if (!driver.current) throw new Error("Storage is not ready yet.");
    return driver.current;
  };

  const value = useMemo<Ctx>(
    () => ({
      config,
      env: { config, features },
      mode,
      meta,
      ready,
      loadError,
      reload: async () => setMeta(await d().load()),
      saveFile: async (blob, info, onProgress) => {
        const rec = await d().addFile(blob, info, onProgress);
        setMeta((m) => ({ ...m, files: [...m.files.filter((f) => f.id !== rec.id), rec] }));
        return rec;
      },
      replaceFile: async (id, blob) => {
        const rec = await d().replaceFile(id, blob);
        setMeta((m) => ({ ...m, files: m.files.map((f) => (f.id === id ? { ...f, size: rec.size } : f)) }));
      },
      renameFile: async (id, name) => {
        await d().updateFile(id, { name });
        setMeta((m) => ({ ...m, files: m.files.map((f) => (f.id === id ? { ...f, name } : f)) }));
      },
      moveFiles: async (ids, groupId) => {
        for (const id of ids) await d().updateFile(id, { groupId });
        setMeta((m) => ({ ...m, files: m.files.map((f) => (ids.includes(f.id) ? { ...f, groupId } : f)) }));
      },
      deleteFiles: async (ids) => {
        await d().deleteFiles(ids);
        setMeta((m) => ({ ...m, files: m.files.filter((f) => !ids.includes(f.id)) }));
      },
      createGroup: async (name) => {
        const g = await d().createGroup(name);
        setMeta((m) => ({ ...m, groups: [...m.groups, g] }));
        return g;
      },
      renameGroup: async (id, name) => {
        await d().renameGroup(id, name);
        setMeta((m) => ({ ...m, groups: m.groups.map((g) => (g.id === id ? { ...g, name } : g)) }));
      },
      deleteGroup: async (id, del) => {
        await d().deleteGroup(id, del);
        setMeta((m) => ({
          ...m,
          groups: m.groups.filter((g) => g.id !== id),
          files: del ? m.files.filter((f) => f.groupId !== id) : m.files.map((f) => (f.groupId === id ? { ...f, groupId: null } : f)),
        }));
      },
      getBlob: (id) => d().getBlob(id),
      toasts,
      toast,
      dismissToast,
      studio,
      openStudio: setStudio,
      inbox,
      sendToConvert: (files) => {
        setInbox((i) => [...i, ...files]);
        setView("convert");
      },
      clearInbox: () => setInbox([]),
      view,
      setView,
    }),
    [config, features, mode, meta, ready, loadError, toasts, studio, inbox, view, toast, dismissToast],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
