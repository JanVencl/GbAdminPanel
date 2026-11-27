import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { api, auth, Schema, ServerInfo, SessionInfo, setUnauthorizedHandler } from "./api";
import Login from "./Login";
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

/** Before login: the login page. After: the workbench, with a login overlay if the session ends. */
export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    auth.session().then(setSession, (e: Error) => setError(e.message));
    setUnauthorizedHandler(() => setExpired(true));
  }, []);

  if (error) return <p className="error pad">Cannot reach the admin panel backend: {error}</p>;
  if (!session) return null;
  if (!session.authenticated) {
    return <Login uri={session.uri} onLogin={setSession} />;
  }
  return (
    <>
      <Workbench
        key={session.user}
        session={session}
        onLogout={() => {
          auth.logout().finally(() =>
            // A fresh session call also gets a new CSRF cookie for the next login.
            auth.session().then(setSession, () => setSession({ authenticated: false, uri: session.uri })),
          );
        }}
      />
      {expired && (
        <div className="overlay">
          <Login
            uri={session.uri}
            notice="Your session has ended. Log in again to continue; your open tabs are kept."
            user={session.token ? undefined : session.user}
            onLogin={(s) => {
              setExpired(false);
              setSession(s);
            }}
          />
        </div>
      )}
    </>
  );
}

function Workbench({ session, onLogout }: { session: SessionInfo; onLogout: () => void }) {
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
          <span className="muted conn">
            {session.user}@{session.address}
            {session.token ? " (token)" : ""}
          </span>
          {session.roles && session.roles.length > 0 && <span className="tree-badge">{session.roles.join(", ")}</span>}
          <span className="spacer" />
          <button className="logout" onClick={onLogout} title="Log out">
            Log out
          </button>
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
