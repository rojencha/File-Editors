"use client";

import JSZip from "jszip";
import { useMemo, useState } from "react";
import { downloadBlob, formatBytes, formatDate, kindLabel, kindOf, safeFileName, type Kind } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { FileRecord } from "@/lib/types";
import { Icon } from "./Icon";
import { ConfirmDialog, EmptyState, FileIcon, Modal, PromptDialog } from "./ui";

type SortKey = "name" | "kind" | "size" | "createdAt";
const ALL = "__all";
const NONE = "__none";

export function LibraryView() {
  const { meta, mode, config, createGroup, renameGroup, deleteGroup, renameFile, moveFiles, deleteFiles, getBlob, toast, openStudio, sendToConvert, setView } = useApp();
  const [group, setGroup] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "createdAt", dir: -1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [dlg, setDlg] = useState<
    | { t: "newGroup" }
    | { t: "renameGroup"; id: string; name: string }
    | { t: "deleteGroup"; id: string; name: string; count: number }
    | { t: "renameFile"; f: FileRecord }
    | { t: "delete"; ids: string[] }
    | { t: "move"; ids: string[] }
    | null
  >(null);

  const groupName = (id: string | null) => (id ? meta.groups.find((g) => g.id === id)?.name ?? "—" : "No group");

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    meta.files.forEach((f) => c.set(f.groupId ?? NONE, (c.get(f.groupId ?? NONE) ?? 0) + 1));
    return c;
  }, [meta.files]);

  const kinds = useMemo(() => [...new Set(meta.files.map((f) => kindOf(f.name, f.mime)))], [meta.files]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = meta.files.filter((f) => {
      if (group === NONE ? f.groupId : group !== ALL && f.groupId !== group) return false;
      if (kind !== "all" && kindOf(f.name, f.mime) !== kind) return false;
      if (needle && !f.name.toLowerCase().includes(needle) && !groupName(f.groupId).toLowerCase().includes(needle)) return false;
      return true;
    });
    return list.sort((a, b) => {
      const k = sort.key;
      const av = k === "kind" ? kindLabel(kindOf(a.name, a.mime)) : a[k];
      const bv = k === "kind" ? kindLabel(kindOf(b.name, b.mime)) : b[k];
      const cmp = typeof av === "string" ? (av as string).localeCompare(bv as string, undefined, { numeric: true }) : (av as number) - (bv as number);
      return cmp * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.files, meta.groups, group, q, kind, sort]);

  const visibleSel = rows.filter((r) => sel.has(r.id));
  const allChecked = rows.length > 0 && visibleSel.length === rows.length;
  const toggle = (id: string) => setSel((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "createdAt" || key === "size" ? -1 : 1 }));

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const downloadOne = (f: FileRecord) =>
    run("download", async () => {
      downloadBlob(await getBlob(f.id), f.name);
    });

  const downloadMany = (ids: string[]) =>
    run("download", async () => {
      const files = meta.files.filter((f) => ids.includes(f.id));
      if (files.length === 1) return downloadBlob(await getBlob(files[0].id), files[0].name);
      const zip = new JSZip();
      const used = new Map<string, number>();
      for (const f of files) {
        const n = used.get(f.name) ?? 0;
        used.set(f.name, n + 1);
        zip.file(n ? f.name.replace(/(\.[^.]+)?$/, ` (${n + 1})$1`) : f.name, await getBlob(f.id));
      }
      downloadBlob(await zip.generateAsync({ type: "blob" }), "fileforge-files.zip");
      toast(`Downloaded ${files.length} files as a ZIP.`, "success");
    });

  const convertAgain = (ids: string[]) =>
    run("send", async () => {
      const out: File[] = [];
      for (const f of meta.files.filter((x) => ids.includes(x.id))) {
        const b = await getBlob(f.id);
        out.push(new File([b], f.name, { type: f.mime }));
      }
      sendToConvert(out);
    });

  const currentTitle = group === ALL ? "All files" : group === NONE ? "No group" : groupName(group);

  return (
    <div className="lib">
      <aside className="card side" aria-label="Groups">
        <div className="row" style={{ padding: "4px 6px 10px" }}>
          <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)" }}>Groups</h2>
          <span className="spacer" />
          <button className="btn ghost icon sm" onClick={() => setDlg({ t: "newGroup" })} aria-label="Create group">
            <Icon name="plus" size={16} />
          </button>
        </div>
        <nav>
          <button className="navitem" aria-current={group === ALL} onClick={() => setGroup(ALL)}>
            <Icon name="all" size={17} /> All files <span className="n">{meta.files.length}</span>
          </button>
          <button className="navitem" aria-current={group === NONE} onClick={() => setGroup(NONE)}>
            <Icon name="file" size={17} /> No group <span className="n">{counts.get(NONE) ?? 0}</span>
          </button>
          {meta.groups.map((g) => (
            <div key={g.id} className="row" style={{ gap: 0 }}>
              <button className="navitem" aria-current={group === g.id} onClick={() => setGroup(g.id)} style={{ flex: 1, minWidth: 0 }}>
                <Icon name="folder" size={17} /> <span className="truncate">{g.name}</span> <span className="n">{counts.get(g.id) ?? 0}</span>
              </button>
              <button className="btn ghost icon sm dd" aria-label={`Rename group ${g.name}`} onClick={() => setDlg({ t: "renameGroup", id: g.id, name: g.name })}>
                <Icon name="edit" size={14} />
              </button>
              <button className="btn ghost icon sm dd" aria-label={`Delete group ${g.name}`} onClick={() => setDlg({ t: "deleteGroup", id: g.id, name: g.name, count: counts.get(g.id) ?? 0 })}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </nav>
        {meta.groups.length === 0 && <p className="hint" style={{ padding: "8px 8px 2px" }}>Create groups to keep related files together.</p>}
      </aside>

      <div className="stack" style={{ minWidth: 0 }}>
        <section className="card" aria-label={currentTitle}>
          <div className="toolbar">
            <h2 style={{ fontSize: 17, marginRight: 6 }}>{currentTitle}</h2>
            <span className="badge">{rows.length}</span>
            <span className="spacer" />
            <div className="input-icon" style={{ width: 230 }}>
              <Icon name="search" size={16} />
              <input className="input" type="search" placeholder="Search files…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search files" style={{ height: 36 }} />
            </div>
            <select className="select" style={{ width: 130, height: 36 }} value={kind} onChange={(e) => setKind(e.target.value as Kind | "all")} aria-label="Filter by type">
              <option value="all">All types</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
            <select
              className="select"
              style={{ width: 160, height: 36 }}
              value={`${sort.key}:${sort.dir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(":");
                setSort({ key: key as SortKey, dir: Number(dir) as 1 | -1 });
              }}
              aria-label="Sort files"
            >
              <option value="createdAt:-1">Newest first</option>
              <option value="createdAt:1">Oldest first</option>
              <option value="name:1">Name A–Z</option>
              <option value="name:-1">Name Z–A</option>
              <option value="size:-1">Largest first</option>
              <option value="size:1">Smallest first</option>
            </select>
          </div>

          {sel.size > 0 && (
            <div className="bulkbar" role="toolbar" aria-label="Bulk actions">
              <strong className="small">{sel.size} selected</strong>
              <button className="btn sm" disabled={!!busy} onClick={() => downloadMany([...sel])}>
                {busy === "download" ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icon name="download" size={15} />} Download{sel.size > 1 ? " ZIP" : ""}
              </button>
              <button className="btn sm" onClick={() => setDlg({ t: "move", ids: [...sel] })}>
                <Icon name="move" size={15} /> Move
              </button>
              <button className="btn sm" disabled={!!busy} onClick={() => convertAgain([...sel])}>
                <Icon name="bolt" size={15} /> Convert
              </button>
              <button className="btn sm danger" onClick={() => setDlg({ t: "delete", ids: [...sel] })}>
                <Icon name="trash" size={15} /> Delete
              </button>
              <span className="spacer" />
              <button className="btn sm ghost" onClick={() => setSel(new Set())}>
                Clear selection
              </button>
            </div>
          )}

          {rows.length === 0 ? (
            meta.files.length === 0 ? (
              <EmptyState
                icon="folder"
                title="Your library is empty"
                action={
                  <button className="btn primary" onClick={() => setView("convert")}>
                    <Icon name="upload" size={16} /> Convert a file
                  </button>
                }
              >
                Converted files you save will appear here so you can download them later, no account needed.
              </EmptyState>
            ) : (
              <EmptyState
                icon="search"
                title="No files match"
                action={
                  <button
                    className="btn"
                    onClick={() => {
                      setQ("");
                      setKind("all");
                      setGroup(ALL);
                    }}
                  >
                    Clear filters
                  </button>
                }
              >
                Try a different search, type or group.
              </EmptyState>
            )
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      className="check"
                      checked={allChecked}
                      onChange={() => setSel(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
                      aria-label="Select all visible files"
                    />
                  </th>
                  <th aria-sort={sort.key === "name" ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                    <button onClick={() => sortBy("name")}>Name {sort.key === "name" && <Icon name={sort.dir === 1 ? "up" : "down"} size={12} />}</button>
                  </th>
                  <th>
                    <button onClick={() => sortBy("kind")}>Type {sort.key === "kind" && <Icon name={sort.dir === 1 ? "up" : "down"} size={12} />}</button>
                  </th>
                  <th>
                    <button onClick={() => sortBy("size")}>Size {sort.key === "size" && <Icon name={sort.dir === 1 ? "up" : "down"} size={12} />}</button>
                  </th>
                  <th>
                    <button onClick={() => sortBy("createdAt")}>Converted {sort.key === "createdAt" && <Icon name={sort.dir === 1 ? "up" : "down"} size={12} />}</button>
                  </th>
                  <th>Group</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const k = kindOf(f.name, f.mime);
                  return (
                    <tr key={f.id} aria-selected={sel.has(f.id)}>
                      <td className="c-sel">
                        <input type="checkbox" className="check" checked={sel.has(f.id)} onChange={() => toggle(f.id)} aria-label={`Select ${f.name}`} />
                      </td>
                      <td className="c-name">
                        <div className="row">
                          <FileIcon name={f.name} mime={f.mime} />
                          <div style={{ minWidth: 0 }}>
                            <button className="btn ghost sm truncate" style={{ height: "auto", padding: 0, fontWeight: 600, maxWidth: 320, display: "block" }} onClick={() => openStudio({ source: "library", id: f.id })}>
                              {f.name}
                            </button>
                            {f.origin && <div className="small muted truncate">{f.origin}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="c-meta">
                        <span className="badge">{kindLabel(k)}</span>
                      </td>
                      <td className="c-meta">{formatBytes(f.size)}</td>
                      <td className="c-meta">{formatDate(f.createdAt)}</td>
                      <td className="c-meta">
                        <span className="row small" style={{ gap: 6 }}>
                          <Icon name="folder" size={14} /> {groupName(f.groupId)}
                        </span>
                      </td>
                      <td className="c-acts">
                        <div className="acts">
                          <button className="btn ghost icon sm" onClick={() => openStudio({ source: "library", id: f.id })} aria-label={`Preview or edit ${f.name}`} title="Preview / edit">
                            <Icon name="eye" size={16} />
                          </button>
                          <button className="btn ghost icon sm" onClick={() => setDlg({ t: "renameFile", f })} aria-label={`Rename ${f.name}`} title="Rename">
                            <Icon name="edit" size={16} />
                          </button>
                          <button className="btn ghost icon sm" onClick={() => setDlg({ t: "move", ids: [f.id] })} aria-label={`Move ${f.name} to a group`} title="Move to group">
                            <Icon name="move" size={16} />
                          </button>
                          <button className="btn ghost icon sm" onClick={() => downloadOne(f)} aria-label={`Download ${f.name}`} title="Download">
                            <Icon name="download" size={16} />
                          </button>
                          <button className="btn ghost icon sm" onClick={() => setDlg({ t: "delete", ids: [f.id] })} aria-label={`Delete ${f.name}`} title="Delete">
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <StorageNotice mode={mode} retentionDays={config?.retentionDays ?? 30} maxWorkspaceMB={config?.maxWorkspaceMB ?? 500} used={meta.files.reduce((s, f) => s + f.size, 0)} />
      </div>

      <PromptDialog open={dlg?.t === "newGroup"} title="New group" label="Group name" confirmLabel="Create" onClose={() => setDlg(null)} onSubmit={async (n) => void (await createGroup(n))} />
      <PromptDialog
        open={dlg?.t === "renameGroup"}
        title="Rename group"
        label="Group name"
        initial={dlg?.t === "renameGroup" ? dlg.name : ""}
        onClose={() => setDlg(null)}
        onSubmit={async (n) => {
          if (dlg?.t === "renameGroup") await renameGroup(dlg.id, n);
        }}
      />
      <PromptDialog
        open={dlg?.t === "renameFile"}
        title="Rename file"
        label="File name"
        initial={dlg?.t === "renameFile" ? dlg.f.name : ""}
        onClose={() => setDlg(null)}
        onSubmit={async (n) => {
          if (dlg?.t === "renameFile") await renameFile(dlg.f.id, safeFileName(n, dlg.f.name));
        }}
      />
      <ConfirmDialog
        open={dlg?.t === "delete"}
        danger
        title={dlg?.t === "delete" && dlg.ids.length > 1 ? `Delete ${dlg.ids.length} files?` : "Delete file?"}
        confirmLabel="Delete"
        onClose={() => setDlg(null)}
        onConfirm={async () => {
          if (dlg?.t !== "delete") return;
          try {
            await deleteFiles(dlg.ids);
            setSel((s) => new Set([...s].filter((x) => !dlg.ids.includes(x))));
            toast("Deleted.", "success");
          } catch (e) {
            toast((e as Error).message, "error");
          }
        }}
      >
        This permanently removes {dlg?.t === "delete" && dlg.ids.length > 1 ? "these files" : "this file"} from your library. It can&apos;t be undone.
      </ConfirmDialog>
      <DeleteGroupDialog
        dlg={dlg?.t === "deleteGroup" ? dlg : null}
        onClose={() => setDlg(null)}
        onDone={(id) => {
          if (group === id) setGroup(ALL);
        }}
        onDelete={deleteGroup}
      />
      <MoveDialog
        open={dlg?.t === "move"}
        count={dlg?.t === "move" ? dlg.ids.length : 0}
        onClose={() => setDlg(null)}
        onMove={async (gid) => {
          if (dlg?.t !== "move") return;
          try {
            await moveFiles(dlg.ids, gid);
            toast(`Moved to ${groupName(gid)}.`, "success");
          } catch (e) {
            toast((e as Error).message, "error");
          }
        }}
        onNewGroup={createGroup}
      />
    </div>
  );
}

function DeleteGroupDialog({
  dlg,
  onClose,
  onDone,
  onDelete,
}: {
  dlg: { id: string; name: string; count: number } | null;
  onClose: () => void;
  onDone: (id: string) => void;
  onDelete: (id: string, files: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();
  const go = async (files: boolean) => {
    if (!dlg) return;
    setBusy(true);
    try {
      await onDelete(dlg.id, files);
      onDone(dlg.id);
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!dlg}
      onClose={onClose}
      title={`Delete group "${dlg?.name ?? ""}"?`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          {dlg && dlg.count > 0 ? (
            <>
              <button className="btn" disabled={busy} onClick={() => go(false)}>
                Delete group, keep files
              </button>
              <button className="btn danger solid" disabled={busy} onClick={() => go(true)}>
                Delete group and {dlg.count} file{dlg.count > 1 ? "s" : ""}
              </button>
            </>
          ) : (
            <button className="btn danger solid" disabled={busy} onClick={() => go(false)}>
              Delete group
            </button>
          )}
        </>
      }
    >
      <p className="muted">
        {dlg && dlg.count > 0
          ? `This group contains ${dlg.count} file${dlg.count > 1 ? "s" : ""}. You can keep them (they move to “No group”) or delete them with the group.`
          : "This group is empty."}
      </p>
    </Modal>
  );
}

function MoveDialog({
  open,
  count,
  onClose,
  onMove,
  onNewGroup,
}: {
  open: boolean;
  count: number;
  onClose: () => void;
  onMove: (groupId: string | null) => Promise<void>;
  onNewGroup: (name: string) => Promise<{ id: string }>;
}) {
  const { meta } = useApp();
  const [target, setTarget] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Move ${count} file${count > 1 ? "s" : ""}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                let gid: string | null = target || null;
                if (target === "__new") {
                  if (!newName.trim()) return;
                  gid = (await onNewGroup(newName.trim())).id;
                }
                await onMove(gid);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Move
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="move-target">Destination</label>
          <select id="move-target" className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">No group</option>
            {meta.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
            <option value="__new">＋ New group…</option>
          </select>
        </div>
        {target === "__new" && (
          <div className="field">
            <label htmlFor="move-new">New group name</label>
            <input id="move-new" className="input" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus maxLength={60} />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function StorageNotice({ mode, retentionDays, maxWorkspaceMB, used }: { mode: "cloud" | "local" | null; retentionDays: number; maxWorkspaceMB: number; used: number }) {
  return (
    <div className={`alert ${mode === "cloud" ? "info" : "warn"}`}>
      <Icon name={mode === "cloud" ? "cloud" : "device"} size={20} />
      <div className="small">
        {mode === "cloud" ? (
          <>
            <strong>How your files are stored.</strong> Saved files are kept in private cloud storage linked to an anonymous token held in this browser. Anyone with this browser profile can reach them; nobody else can. Files are deleted automatically{" "}
            <strong>{retentionDays} days after they were saved</strong>, so download anything you want to keep. If you clear this browser&apos;s site data, you lose access to the workspace. Using {formatBytes(used)} of {maxWorkspaceMB} MB.
          </>
        ) : (
          <>
            <strong>Stored in this browser only.</strong> Cloud storage isn&apos;t configured, so saved files live in your browser&apos;s IndexedDB on this device. They aren&apos;t uploaded anywhere, aren&apos;t available on other devices, and can disappear if you clear site data or the browser needs space. Download anything important. Using {formatBytes(used)}.
          </>
        )}
      </div>
    </div>
  );
}
