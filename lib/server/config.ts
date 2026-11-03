import type { PublicConfig } from "@/lib/types";

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const serverConfig = {
  get cloud() {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  },
  get maxFileBytes() {
    return num(process.env.MAX_FILE_MB, 100) * 1024 * 1024;
  },
  get maxWorkspaceBytes() {
    return num(process.env.MAX_WORKSPACE_MB, 500) * 1024 * 1024;
  },
  get retentionDays() {
    return num(process.env.RETENTION_DAYS, 30);
  },
  get external() {
    const url = process.env.CONVERT_API_URL?.trim();
    const formats = (process.env.CONVERT_API_FORMATS ?? "docx,doc,xlsx,xls,pptx,ppt,odt,ods,odp,rtf")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return {
      enabled: Boolean(url) && this.cloud,
      url,
      key: process.env.CONVERT_API_KEY?.trim(),
      label: process.env.CONVERT_API_LABEL?.trim() || "Document converter",
      formats,
    };
  },
};

export function publicConfig(): PublicConfig {
  const ext = serverConfig.external;
  return {
    cloud: serverConfig.cloud,
    retentionDays: serverConfig.retentionDays,
    maxFileMB: Math.round(serverConfig.maxFileBytes / 1024 / 1024),
    maxWorkspaceMB: Math.round(serverConfig.maxWorkspaceBytes / 1024 / 1024),
    external: { enabled: ext.enabled, label: ext.label, formats: ext.enabled ? ext.formats : [] },
  };
}
