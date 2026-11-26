import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { api, Schema, ServerInfo } from "./api";
import { Admin, AdminContext } from "./admin";
import Dialog, { DialogSpec } from "./Dialog";
import ObjectTree, { OpenRequest } from "./ObjectTree";
import Workspace, { QueryTab } from "./Workspace";

function useDarkMode() {
  const query = useMemo(() => window.matchMedia("(prefers-color-scheme: dark)"), []);
  const [dark, setDark] = useState(query.matches);
  useEffect(() => {
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, [query]);
  return dark;
}

type Toast = { id: number; message: string; kind: "ok" | "error" };

export default function App() {
  const dark = useDarkMode();
  const nextId = useRef(1);
  const [tabs, setTabs] = useState<QueryTab[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<Record<string, Schema>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const registry = useRef(new Map<string, () => void>()).current;

  const reloadDatabases = useCallback(() => {
    api.databases().then(
      (r) => setDatabases(r.rows.map((row) => String(row.name))),
      () => setDatabases([]),
    );
  }, []);

  useEffect(() => {
    reloadDatabases();
    setSchemas({});
  }, [reloadKey, reloadDatabases]);

  const openTab = useCallback((req: Partial<OpenRequest> = {}) => {
    const id = nextId.current++;
    const tab: QueryTab = {
      id,
      title: req.title ?? `Query ${id}`,
      database: req.database ?? null,
      query: req.query ?? "",
      view: "table",
      autorun: req.run,
    };
    setTabs((ts) => [...ts, tab]);
    setActiveId(id);
  }, []);

  const closeTab = useCallback((id: number) => {
    setTabs((ts) => {
      const i = ts.findIndex((t) => t.id === id);
      const rest = ts.filter((t) => t.id !== id);
      setActiveId((cur) => (cur === id ? (rest[Math.min(i, rest.length - 1)]?.id ?? null) : cur));
      return rest;
    });
  }, []);

  const changeTab = useCallback((id: number, patch: Partial<QueryTab>) => {
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const onSchema = useCallback((db: string, schema: Schema) => {
    setSchemas((s) => ({ ...s, [db]: schema }));
  }, []);

  const needSchema = useCallback(
    (db: string) => {
      api.schema(db).then((schema) => onSchema(db, schema), () => undefined);
    },
    [onSchema],
  );

  const notify = useCallback((message: string, kind: "ok" | "error" = "ok") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 8000 : 4000);
  }, []);

  const admin = useMemo<Admin>(
    () => ({
      openEditor: openTab,
      openDialog: setDialog,
      notify,
      refresh: (...keys) => keys.forEach((k) => registry.get(k)?.()),
      reloadDatabases,
      databases,
      currentUser: server?.user ?? null,
    }),
    [openTab, notify, registry, reloadDatabases, databases, server],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        openTab();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w" && activeId !== null) {
        e.preventDefault();
        closeTab(activeId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTab, closeTab, activeId, dialog]);

  return (
    <AdminContext.Provider value={admin}>
      <div className="app">
        <header className="appbar">
          <span className="brand">GraphBuff Admin</span>
          {server && (
            <span className="muted conn">
              {server.user}@{server.address}
            </span>
          )}
        </header>
        <Group orientation="horizontal" className="main-split">
          <Panel defaultSize="22%" minSize="12%" maxSize="45%">
            <aside className="sidebar">
              <div className="sidebar-head">
                <span>Object explorer</span>
                <button title="Refresh all" onClick={() => setReloadKey((k) => k + 1)}>
                  ↻
                </button>
              </div>
              <ObjectTree onSchema={onSchema} reloadKey={reloadKey} registry={registry} onServer={setServer} />
            </aside>
          </Panel>
          <Separator className="resize-v" />
          <Panel>
            <Workspace
              tabs={tabs}
              activeId={activeId}
              databases={databases}
              schemas={schemas}
              dark={dark}
              onActivate={setActiveId}
              onClose={closeTab}
              onNew={() => openTab()}
              onChange={changeTab}
              onNeedSchema={needSchema}
            />
          </Panel>
        </Group>
        {dialog && (
          <Dialog
            key={dialog.title}
            spec={dialog}
            dark={dark}
            onClose={() => setDialog(null)}
            onOpenEditor={(title, database, query) => openTab({ title, database, query, run: false })}
            onNotify={notify}
          />
        )}
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              {t.message}
            </div>
          ))}
        </div>
      </div>
    </AdminContext.Provider>
  );
}
