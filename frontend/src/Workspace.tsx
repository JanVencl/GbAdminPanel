import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { EditorView, keymap, Prec } from "@uiw/react-codemirror";
import { autocompletion } from "@codemirror/autocomplete";
import { Group, Panel, Separator } from "react-resizable-panels";
import { api, QueryResult, Schema } from "./api";
import { cypherCompletions, cypherLanguage } from "./cypher";
import ResultTable from "./ResultTable";
import PlanView from "./PlanView";
import { hasGraph } from "./graph";

// Cytoscape is large; load it only when a graph is shown.
const GraphView = lazy(() => import("./GraphView"));

export type ResultView = "table" | "graph" | "json" | "plan";

export type QueryTab = {
  id: number;
  title: string;
  database: string | null;
  query: string;
  result?: QueryResult;
  error?: string;
  running?: boolean;
  view: ResultView;
  /** Run once when the tab first shows (tree items that list things). */
  autorun?: boolean;
};

type Props = {
  tabs: QueryTab[];
  activeId: number | null;
  databases: string[];
  schemas: Record<string, Schema>;
  dark: boolean;
  onActivate: (id: number) => void;
  onClose: (id: number) => void;
  onNew: () => void;
  onChange: (id: number, patch: Partial<QueryTab>) => void;
  onNeedSchema: (database: string) => void;
};

const MAX_ROWS = [100, 1000, 10000];

export default function Workspace(props: Props) {
  const { tabs, activeId, onActivate, onClose, onNew } = props;
  const active = tabs.find((t) => t.id === activeId) ?? null;

  return (
    <div className="workspace">
      <div className="tabbar" role="tablist">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === activeId}
            className={`tab${t.id === activeId ? " active" : ""}`}
            onClick={() => onActivate(t.id)}
            onAuxClick={(e) => e.button === 1 && onClose(t.id)}
            title={t.database ? `${t.title} — ${t.database}` : t.title}
          >
            {t.running && <span className="spinner" />}
            <span className="tab-title">{t.title}</span>
            <button
              className="tab-close"
              aria-label={`Close ${t.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="tab-new" title="New query (Ctrl+T)" onClick={onNew}>
          +
        </button>
      </div>
      {active ? <Editor key={active.id} tab={active} {...props} /> : <Empty onNew={onNew} />}
    </div>
  );
}

function Empty({ onNew }: { onNew: () => void }) {
  return (
    <div className="empty">
      <p>Double-click an object in the tree, or</p>
      <button onClick={onNew}>Open a query editor</button>
    </div>
  );
}

function Editor({ tab, databases, schemas, dark, onChange, onNeedSchema }: Props & { tab: QueryTab }) {
  const viewRef = useRef<EditorView | null>(null);
  const [maxRows, setMaxRows] = useState(1000);
  const schemaKey = tab.database ?? databases[0];

  useEffect(() => {
    if (schemaKey && schemaKey !== "system" && !schemas[schemaKey]) onNeedSchema(schemaKey);
  }, [schemaKey, schemas, onNeedSchema]);

  const schemaRef = useRef<Schema | undefined>(undefined);
  schemaRef.current = schemaKey ? schemas[schemaKey] : undefined;

  /** Runs the selection, or the whole script; prefix is EXPLAIN or PROFILE. */
  const run = useCallback(
    (prefix?: "EXPLAIN" | "PROFILE") => {
      const view = viewRef.current;
      const sel = view?.state.selection.main;
      let text = sel && !sel.empty ? view!.state.sliceDoc(sel.from, sel.to) : tab.query;
      if (!text.trim() || tab.running) return;
      if (prefix) text = `${prefix} ${text.trim().replace(/^(EXPLAIN|PROFILE)\s+/i, "")}`;
      onChange(tab.id, { running: true, error: undefined });
      api.cypher(text, tab.database, maxRows).then(
        // Like Neo4j Browser: plans show as plans, nodes as a graph, the rest as a table.
        (result) =>
          onChange(tab.id, {
            result,
            running: false,
            view: result.summary.plan ? "plan" : hasGraph(result.rows) ? "graph" : "table",
          }),
        (e: Error) => onChange(tab.id, { error: e.message, result: undefined, running: false }),
      );
    },
    [tab, maxRows, onChange],
  );

  const runRef = useRef(run);
  runRef.current = run;

  const extensions = useMemo(
    () => [
      cypherLanguage,
      autocompletion({ override: [cypherCompletions(() => schemaRef.current)] }),
      Prec.highest(
        keymap.of([
          { key: "Mod-Enter", run: () => (runRef.current(), true) },
          { key: "F5", run: () => (runRef.current(), true) },
          { key: "Mod-Shift-e", run: () => (runRef.current("EXPLAIN"), true) },
          { key: "Mod-Shift-p", run: () => (runRef.current("PROFILE"), true) },
        ]),
      ),
      EditorView.lineWrapping,
    ],
    [],
  );

  // Run what a tree item asked to run, once, when its tab opens.
  useEffect(() => {
    if (tab.autorun) {
      onChange(tab.id, { autorun: false });
      run();
    }
  }, [tab.autorun, tab.id, run, onChange]);

  return (
    <Group orientation="vertical" className="editor-split">
      <Panel defaultSize="45%" minSize="15%">
        <div className="editor-pane">
          <div className="toolbar">
            <button className="primary" onClick={() => run()} disabled={tab.running} title="Run (Ctrl+Enter / F5); runs the selection if there is one">
              ▶ Run
            </button>
            <button onClick={() => run("EXPLAIN")} disabled={tab.running} title="Show the plan without running (Ctrl+Shift+E)">
              Explain
            </button>
            <button onClick={() => run("PROFILE")} disabled={tab.running} title="Run and show the plan with rows and times (Ctrl+Shift+P); PROFILE runs updates too">
              Profile
            </button>
            <label>
              Database
              <select
                value={tab.database ?? ""}
                onChange={(e) => onChange(tab.id, { database: e.target.value || null })}
              >
                <option value="">(default)</option>
                {databases.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                <option value="system">system</option>
              </select>
            </label>
            <label>
              Max rows
              <select value={maxRows} onChange={(e) => setMaxRows(Number(e.target.value))}>
                {MAX_ROWS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <CodeMirror
            className="editor"
            value={tab.query}
            height="100%"
            theme={dark ? "dark" : "light"}
            extensions={extensions}
            autoFocus
            onCreateEditor={(view) => (viewRef.current = view)}
            onChange={(query) => onChange(tab.id, { query })}
            basicSetup={{ foldGutter: false, highlightActiveLine: true }}
          />
        </div>
      </Panel>
      <Separator className="resize-h" />
      <Panel minSize="15%">
        <Results tab={tab} dark={dark} onView={(view) => onChange(tab.id, { view })} />
      </Panel>
    </Group>
  );
}

function Results({ tab, dark, onView }: { tab: QueryTab; dark: boolean; onView: (v: ResultView) => void }) {
  const r = tab.result;
  const graphable = useMemo(() => (r ? hasGraph(r.rows) : false), [r]);
  const views: { id: ResultView; label: string; enabled: boolean }[] = [
    { id: "graph", label: "Graph", enabled: graphable },
    { id: "table", label: "Table", enabled: true },
    { id: "json", label: "JSON", enabled: true },
    { id: "plan", label: "Plan", enabled: !!r?.summary.plan },
  ];
  const view = views.find((v) => v.id === tab.view)?.enabled ? tab.view : "table";
  return (
    <div className="results">
      <div className="results-bar">
        <div className="seg">
          {views.map((v) => (
            <button key={v.id} className={view === v.id ? "on" : ""} disabled={!v.enabled} onClick={() => onView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        <span className="status">
          {tab.running
            ? "Running…"
            : r
              ? [
                  `${r.rows.length}${r.truncated ? "+" : ""} row${r.rows.length === 1 ? "" : "s"}`,
                  `${r.summary.elapsedMs} ms`,
                  r.summary.database,
                  ...Object.entries(r.summary.counters).map(([k, v]) => `${k} ${v}`),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : ""}
          {r?.truncated && <span className="warn"> · truncated at max rows</span>}
        </span>
      </div>
      <div className={`results-body${view === "graph" ? " fill" : ""}`}>
        {tab.error && <pre className="error pad">{tab.error}</pre>}
        {r && !tab.error && view === "json" && <pre className="json pad">{JSON.stringify(r.rows, null, 2)}</pre>}
        {r && !tab.error && view === "table" && <ResultTable result={r} />}
        {r && !tab.error && view === "plan" && r.summary.plan && <PlanView plan={r.summary.plan} profiled={!!r.summary.profiled} />}
        {r && !tab.error && view === "graph" && (
          <Suspense fallback={<p className="muted pad">Loading graph…</p>}>
            <GraphView result={r} database={r.summary.database ?? tab.database} dark={dark} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
