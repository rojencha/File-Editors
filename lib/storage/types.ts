import type { FileRecord, Group, WorkspaceMeta } from "@/lib/types";

export type NewFile = {
  name: string;
  mime: string;
  groupId: string | null;
  origin?: string;
};

/**
 * Storage drivers are interchangeable. `cloud` keeps files in Vercel Blob behind an anonymous
 * workspace token; `local` keeps everything in this browser's IndexedDB.
 * To add another backend (S3, R2, …) implement this interface and register it in ./index.ts.
 */
export interface StorageDriver {
  readonly kind: "cloud" | "local";
  load(): Promise<WorkspaceMeta>;
  addFile(blob: Blob, info: NewFile, onProgress?: (pct: number) => void): Promise<FileRecord>;
  /** Overwrites the bytes of an existing file (used when saving edits in place). */
  replaceFile(id: string, blob: Blob, onProgress?: (pct: number) => void): Promise<FileRecord>;
  getBlob(id: string): Promise<Blob>;
  updateFile(id: string, patch: { name?: string; groupId?: string | null }): Promise<void>;
  deleteFiles(ids: string[]): Promise<void>;
  createGroup(name: string): Promise<Group>;
  renameGroup(id: string, name: string): Promise<void>;
  deleteGroup(id: string, deleteFiles: boolean): Promise<void>;
}
