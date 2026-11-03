export type FileRecord = {
  id: string;
  name: string;
  mime: string;
  size: number;
  groupId: string | null;
  createdAt: number;
  /** Human-readable origin, e.g. "PDF → PNG" or "Uploaded". */
  origin?: string;
  /** Epoch ms after which the file may be purged (cloud mode only). */
  expiresAt?: number | null;
};

export type Group = { id: string; name: string; createdAt: number };

export type WorkspaceMeta = { v: 1; files: FileRecord[]; groups: Group[] };

export type PublicConfig = {
  cloud: boolean;
  retentionDays: number;
  maxFileMB: number;
  maxWorkspaceMB: number;
  external: { enabled: boolean; label: string; formats: string[] };
};

export const emptyMeta = (): WorkspaceMeta => ({ v: 1, files: [], groups: [] });
