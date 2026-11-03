import { upload } from "@vercel/blob/client";
import { uid } from "@/lib/format";
import type { FileRecord, Group, WorkspaceMeta } from "@/lib/types";
import type { NewFile, StorageDriver } from "./types";
import { getWorkspaceToken } from "./workspace-token";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "x-workspace-token": getWorkspaceToken(), "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function uploadToPath(pathname: string, blob: Blob, kind: "files" | "tmp", onProgress?: (p: number) => void) {
  await upload(pathname, blob, {
    access: "private",
    handleUploadUrl: "/api/blob/upload",
    clientPayload: JSON.stringify({ token: getWorkspaceToken(), kind }),
    multipart: blob.size > 8 * 1024 * 1024,
    contentType: blob.type || "application/octet-stream",
    onUploadProgress: (e) => onProgress?.(Math.round(e.percentage)),
  });
}

/** Workspace id is derived server-side; the client only needs it to build upload paths. */
async function sha256Hex40(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

export async function tmpUpload(blob: Blob, onProgress?: (p: number) => void): Promise<string> {
  const id = uid();
  const ws = await sha256Hex40(getWorkspaceToken());
  await uploadToPath(`ws/${ws}/tmp/${id}`, blob, "tmp", onProgress);
  return id;
}

export class CloudDriver implements StorageDriver {
  readonly kind = "cloud" as const;

  load() {
    return api<WorkspaceMeta>("/api/library");
  }

  private async commit(id: string, blob: Blob, info: NewFile, onProgress?: (p: number) => void): Promise<FileRecord> {
    const ws = await sha256Hex40(getWorkspaceToken());
    await uploadToPath(`ws/${ws}/files/${id}`, blob, "files", onProgress);
    const { result } = await api<{ result: FileRecord }>("/api/library", {
      method: "POST",
      body: JSON.stringify({ op: "commitFile", id, name: info.name, mime: info.mime, groupId: info.groupId, origin: info.origin }),
    });
    return result;
  }

  addFile(blob: Blob, info: NewFile, onProgress?: (p: number) => void) {
    return this.commit(uid(), blob, info, onProgress);
  }

  async replaceFile(id: string, blob: Blob, onProgress?: (p: number) => void) {
    return this.commit(id, blob, { name: "", mime: blob.type, groupId: null }, onProgress);
  }

  async getBlob(id: string): Promise<Blob> {
    const res = await fetch(`/api/files/${id}`, { headers: { "x-workspace-token": getWorkspaceToken() }, cache: "no-store" });
    if (!res.ok) throw new Error("Could not download this file. It may have expired or been deleted.");
    return res.blob();
  }

  async updateFile(id: string, patch: { name?: string; groupId?: string | null }) {
    await api("/api/library", { method: "POST", body: JSON.stringify({ op: "updateFile", id, ...patch }) });
  }

  async deleteFiles(ids: string[]) {
    await api("/api/library", { method: "POST", body: JSON.stringify({ op: "deleteFiles", ids }) });
  }

  async createGroup(name: string) {
    const { result } = await api<{ result: Group }>("/api/library", { method: "POST", body: JSON.stringify({ op: "createGroup", name }) });
    return result;
  }

  async renameGroup(id: string, name: string) {
    await api("/api/library", { method: "POST", body: JSON.stringify({ op: "renameGroup", id, name }) });
  }

  async deleteGroup(id: string, deleteFiles: boolean) {
    await api("/api/library", { method: "POST", body: JSON.stringify({ op: "deleteGroup", id, deleteFiles }) });
  }
}
