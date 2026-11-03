import { emptyMeta, type FileRecord, type Group, type WorkspaceMeta } from "@/lib/types";
import { uid } from "@/lib/format";
import type { NewFile, StorageDriver } from "./types";

const DB = "fileforge";
const META = "meta";
const BLOBS = "blobs";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META);
      req.result.createObjectStore(BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB is unavailable."));
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const r = fn(t.objectStore(store));
        t.oncomplete = () => {
          db.close();
          resolve(r.result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error ?? new Error("Local storage error."));
        };
        t.onabort = () => {
          db.close();
          reject(t.error ?? new Error("Local storage is full or was blocked by the browser."));
        };
      }),
  );
}

/** Browser-only storage. Files never leave this device and can be cleared by the browser. */
export class LocalDriver implements StorageDriver {
  readonly kind = "local" as const;
  private meta: WorkspaceMeta = emptyMeta();

  async load() {
    const m = await tx<WorkspaceMeta | undefined>(META, "readonly", (s) => s.get("meta"));
    this.meta = m?.v === 1 ? m : emptyMeta();
    return this.snapshot();
  }

  private snapshot(): WorkspaceMeta {
    return { v: 1, files: [...this.meta.files], groups: [...this.meta.groups] };
  }

  private save() {
    return tx(META, "readwrite", (s) => s.put(this.meta, "meta"));
  }

  async addFile(blob: Blob, info: NewFile, onProgress?: (p: number) => void): Promise<FileRecord> {
    const id = uid();
    await tx(BLOBS, "readwrite", (s) => s.put(blob, id));
    onProgress?.(100);
    const rec: FileRecord = {
      id,
      name: info.name,
      mime: info.mime,
      size: blob.size,
      groupId: info.groupId,
      createdAt: Date.now(),
      origin: info.origin,
      expiresAt: null,
    };
    this.meta.files.push(rec);
    await this.save();
    return rec;
  }

  async replaceFile(id: string, blob: Blob, onProgress?: (p: number) => void): Promise<FileRecord> {
    const f = this.meta.files.find((x) => x.id === id);
    if (!f) throw new Error("File not found.");
    await tx(BLOBS, "readwrite", (s) => s.put(blob, id));
    onProgress?.(100);
    f.size = blob.size;
    await this.save();
    return f;
  }

  async getBlob(id: string): Promise<Blob> {
    const b = await tx<Blob | undefined>(BLOBS, "readonly", (s) => s.get(id));
    if (!b) throw new Error("File data is missing from this browser.");
    const f = this.meta.files.find((x) => x.id === id);
    return f && b.type !== f.mime ? new Blob([b], { type: f.mime }) : b;
  }

  async updateFile(id: string, patch: { name?: string; groupId?: string | null }) {
    const f = this.meta.files.find((x) => x.id === id);
    if (!f) throw new Error("File not found.");
    if (patch.name !== undefined) f.name = patch.name;
    if (patch.groupId !== undefined) f.groupId = patch.groupId;
    await this.save();
  }

  async deleteFiles(ids: string[]) {
    const set = new Set(ids);
    for (const id of ids) await tx(BLOBS, "readwrite", (s) => s.delete(id));
    this.meta.files = this.meta.files.filter((f) => !set.has(f.id));
    await this.save();
  }

  async createGroup(name: string): Promise<Group> {
    const g: Group = { id: uid(), name, createdAt: Date.now() };
    this.meta.groups.push(g);
    await this.save();
    return g;
  }

  async renameGroup(id: string, name: string) {
    const g = this.meta.groups.find((x) => x.id === id);
    if (!g) throw new Error("Group not found.");
    g.name = name;
    await this.save();
  }

  async deleteGroup(id: string, deleteFiles: boolean) {
    const inGroup = this.meta.files.filter((f) => f.groupId === id).map((f) => f.id);
    if (deleteFiles) await this.deleteFiles(inGroup);
    else this.meta.files.forEach((f) => f.groupId === id && (f.groupId = null));
    this.meta.groups = this.meta.groups.filter((g) => g.id !== id);
    await this.save();
  }
}
