export type ExportFn = () => Promise<{ blob: Blob; name?: string }>;

export type EditorProps = {
  blob: Blob;
  name: string;
  register: (fn: ExportFn | null) => void;
  setDirty: (dirty: boolean) => void;
};
