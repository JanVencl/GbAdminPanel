import { useCallback, useEffect, useState } from "react";
import { api, QueryResult, ServerInfo } from "./api";
import ResultTable from "./ResultTable";

type Tab = "server" | "databases" | "users" | "transactions" | "query";

const TABS: { id: Tab; label: string }[] = [
  { id: "server", label: "Server" },
  { id: "databases", label: "Databases" },
  { id: "users", label: "Users" },
  { id: "transactions", label: "Transactions" },
  { id: "query", label: "Query" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("server");

  return (
    <div className="app">
      <header>
        <h1>GraphBuff Admin</h1>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={t.id === tab ? "active" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === "server" && <ServerPanel />}
        {tab === "databases" && <ListPanel load={api.databases} />}
        {tab === "users" && <ListPanel load={api.users} />}
        {tab === "transactions" && <ListPanel load={api.transactions} />}
        {tab === "query" && <QueryPanel />}
      </main>
    </div>
  );
}

function ServerPanel() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.server().then(setInfo, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!info) return <p>Connecting…</p>;
  return (
    <dl className="info">
      {Object.entries(info).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ListPanel({ load }: { load: () => Promise<QueryResult> }) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setError(null);
    load().then(setResult, (e: Error) => setError(e.message));
  }, [load]);

  useEffect(refresh, [refresh]);

  return (
    <section>
      <button onClick={refresh}>Refresh</button>
      {error && <p className="error">{error}</p>}
      {result && <ResultTable result={result} />}
    </section>
  );
}

function QueryPanel() {
  const [database, setDatabase] = useState("");
  const [query, setQuery] = useState("MATCH (n) RETURN n LIMIT 25");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    setError(null);
    api
      .cypher(query, database || undefined)
      .then(setResult, (e: Error) => setError(e.message))
      .finally(() => setRunning(false));
  };

  return (
    <section>
      <div className="query-bar">
        <input placeholder="database (default)" value={database} onChange={(e) => setDatabase(e.target.value)} />
        <button onClick={run} disabled={running || !query.trim()}>
          {running ? "Running…" : "Run"}
        </button>
      </div>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run();
        }}
        rows={6}
        spellCheck={false}
      />
      {error && <p className="error">{error}</p>}
      {result && <ResultTable result={result} />}
    </section>
  );
}
