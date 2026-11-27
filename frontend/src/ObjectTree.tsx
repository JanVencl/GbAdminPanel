import { useCallback, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { api, QueryResult, Schema, ServerInfo } from "./api";
import { constraintDdl, ident, indexDdl } from "./ddl";

/** What double-clicking a tree item opens in the editor. */
export type OpenRequest = {
  title: string;
  database: string | null;
  query: string;
  run: boolean;
};

type Item = {
  key: string;
  label: string;
  icon: string;
  badge?: string;
  hint?: string;
  open?: OpenRequest;
  children?: () => Promise<Item[]>;
  /** Show the number of children as a badge (for lists, not for objects with sub-folders). */
  counted?: boolean;
};

type Props = {
  onOpen: (req: OpenRequest) => void;
  onSchema: (database: string, schema: Schema) => void;
  reloadKey: number;
};

export default function ObjectTree({ onOpen, onSchema, reloadKey }: Props) {
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api.server().then(setServer, (e: Error) => setError(e.message));
  }, [reloadKey]);

  const root = useMemo((): Item[] => {
    if (!server) return [];
    return [
      {
        key: "server",
        label: server.agent.replace(/^Neo4j\/[\d.]+-/, ""),
        hint: `${server.user}@${server.address} · Bolt ${server.protocolVersion}`,
        icon: "🖥",
        children: async () => [
          databasesFolder(onSchema),
          {
            key: "aliases",
            label: "Aliases",
      counted: true,
            icon: "🔗",
            open: { title: "Aliases", database: "system", query: "SHOW ALIASES FOR DATABASES", run: true },
            children: async () => rowsToItems(await api.aliases(), "alias", "🔗", (r) => String(r.name), (r) => `→ ${r.database}`),
          },
          securityFolder(),
          {
            key: "monitoring",
            label: "Monitoring",
            icon: "📈",
            children: async () => [
              { key: "tx", label: "Transactions", icon: "⏱", open: { title: "Transactions", database: "system", query: "SHOW TRANSACTIONS", run: true } },
              { key: "settings", label: "Settings", icon: "⚙", open: { title: "Settings", database: null, query: "SHOW SETTINGS", run: true } },
              { key: "procedures", label: "Procedures", icon: "ƒ", open: { title: "Procedures", database: null, query: "SHOW PROCEDURES", run: true } },
              { key: "functions", label: "Functions", icon: "ƒ", open: { title: "Functions", database: null, query: "SHOW FUNCTIONS", run: true } },
            ],
          },
        ],
      },
    ];
  }, [server, onSchema]);

  return (
    <div className="tree" role="tree">
      {error && <p className="error tree-error">{error}</p>}
      {!server && !error && <p className="muted tree-error">Connecting…</p>}
      {root.map((item) => (
        <TreeNode
          key={`${item.key}-${reloadKey}`}
          item={item}
          depth={0}
          defaultOpen
          selected={selected}
          onSelect={setSelected}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function TreeNode({
  item,
  depth,
  defaultOpen = false,
  selected,
  onSelect,
  onOpen,
}: {
  item: Item;
  depth: number;
  defaultOpen?: boolean;
  selected: string | null;
  onSelect: (key: string) => void;
  onOpen: (req: OpenRequest) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!item.children) return;
    setLoading(true);
    setError(null);
    item
      .children()
      .then(setChildren, (e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [item]);

  const toggle = () => {
    if (!item.children) return;
    if (!expanded && children === null) load();
    setExpanded(!expanded);
  };

  const opened = useRef(false);
  useEffect(() => {
    if (defaultOpen && !opened.current) {
      opened.current = true;
      setExpanded(true);
      load();
    }
  }, [defaultOpen, load]);

  const isSelected = selected === item.key;
  const count = item.counted && children ? String(children.length) : item.badge;

  let body: ReactNode = null;
  if (expanded) {
    // While refreshing, keep showing the old children so their expanded state survives.
    if (loading && children === null) body = <div className="tree-msg muted" style={{ paddingLeft: indent(depth + 1) }}>Loading…</div>;
    else if (error) body = <div className="tree-msg error" style={{ paddingLeft: indent(depth + 1) }}>{error}</div>;
    else if (children && children.length === 0)
      body = <div className="tree-msg muted" style={{ paddingLeft: indent(depth + 1) }}>(none)</div>;
    else
      body = children?.map((c) => (
        <TreeNode key={c.key} item={c} depth={depth + 1} selected={selected} onSelect={onSelect} onOpen={onOpen} />
      ));
  }

  return (
    <div role="treeitem" aria-expanded={item.children ? expanded : undefined}>
      <div
        className={`tree-row${isSelected ? " selected" : ""}`}
        style={{ paddingLeft: indent(depth) }}
        title={item.hint ?? (item.open ? "Double-click to open" : undefined)}
        tabIndex={0}
        onClick={(e) => {
          e.currentTarget.focus();
          onSelect(item.key);
        }}
        onDoubleClick={() => (item.open ? onOpen(item.open) : toggle())}
        onKeyDown={(e) => {
          if (e.key === "Enter" && item.open) onOpen(item.open);
          else if (e.key === "ArrowRight" && !expanded) toggle();
          else if (e.key === "ArrowLeft" && expanded) toggle();
        }}
      >
        <span
          className="tree-twisty"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          {item.children ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span className="tree-icon">{item.icon}</span>
        <span className="tree-label">{item.label}</span>
        {count && <span className="tree-badge">{count}</span>}
        {item.children && expanded && depth > 0 && (
          <button
            className="tree-refresh"
            title="Refresh"
            onClick={(e) => {
              e.stopPropagation();
              load();
            }}
          >
            ↻
          </button>
        )}
      </div>
      {body}
    </div>
  );
}

function indent(depth: number) {
  return `${depth * 14 + 4}px`;
}

function rowsToItems(
  result: QueryResult,
  kind: string,
  icon: string,
  label: (r: Record<string, unknown>) => string,
  badge?: (r: Record<string, unknown>) => string | undefined,
  open?: (r: Record<string, unknown>) => OpenRequest | undefined,
): Item[] {
  return result.rows.map((r) => ({
    key: `${kind}:${label(r)}`,
    label: label(r),
    icon,
    badge: badge?.(r),
    open: open?.(r),
  }));
}

function databasesFolder(onSchema: (database: string, schema: Schema) => void): Item {
  return {
    key: "databases",
    label: "Databases",
      counted: true,
    icon: "🗄",
    open: { title: "Databases", database: "system", query: "SHOW DATABASES", run: true },
    children: async () => {
      const dbs = await api.databases();
      return dbs.rows.map((r) => {
        const name = String(r.name);
        const tags = [r.default ? "default" : null, r.access === "read-only" ? "read-only" : null].filter(Boolean);
        return {
          key: `db:${name}`,
          label: name,
          icon: "🛢",
          badge: tags.join(", ") || undefined,
          hint: `${r.nodes} nodes · ${r.relationships} relationships · ${r.storage}`,
          open: { title: name, database: name, query: "MATCH (n) RETURN n LIMIT 25", run: false },
          children: async () => {
            const schema = await api.schema(name);
            onSchema(name, schema);
            return databaseChildren(name, schema);
          },
        } satisfies Item;
      });
    },
  };
}

function databaseChildren(db: string, schema: Schema): Item[] {
  const k = (s: string) => `db:${db}:${s}`;
  return [
    {
      key: k("labels"),
      label: "Labels",
      counted: true,
      icon: "🏷",
      children: async () =>
        schema.labels.map((l) => ({
          key: k(`label:${l}`),
          label: l,
          icon: "◯",
          open: { title: l, database: db, query: `MATCH (n:${ident(l)})\nRETURN n\nLIMIT 25`, run: true },
        })),
    },
    {
      key: k("types"),
      label: "Relationship types",
      counted: true,
      icon: "↔",
      children: async () =>
        schema.relationshipTypes.map((t) => ({
          key: k(`type:${t}`),
          label: t,
          icon: "→",
          open: { title: t, database: db, query: `MATCH (a)-[r:${ident(t)}]->(b)\nRETURN a, r, b\nLIMIT 25`, run: true },
        })),
    },
    {
      key: k("props"),
      label: "Property keys",
      counted: true,
      icon: "🔑",
      children: async () =>
        schema.propertyKeys.map((p) => ({
          key: k(`prop:${p}`),
          label: p,
          icon: "·",
          open: {
            title: p,
            database: db,
            query: `MATCH (n)\nWHERE n.${ident(p)} IS NOT NULL\nRETURN n.${ident(p)} AS ${ident(p)}, count(*) AS nodes\nORDER BY nodes DESC\nLIMIT 100`,
            run: true,
          },
        })),
    },
    {
      key: k("indexes"),
      label: "Indexes",
      counted: true,
      icon: "⚡",
      open: { title: `${db}: indexes`, database: db, query: "SHOW INDEXES", run: true },
      children: async () =>
        rowsToItems(
          schema.indexes,
          k("index"),
          "⚡",
          (r) => String(r.name),
          (r) => String(r.type ?? "").toLowerCase(),
          (r) => ({ title: String(r.name), database: db, query: indexDdl(r), run: false }),
        ),
    },
    {
      key: k("constraints"),
      label: "Constraints",
      counted: true,
      icon: "🔒",
      open: { title: `${db}: constraints`, database: db, query: "SHOW CONSTRAINTS", run: true },
      children: async () =>
        rowsToItems(
          schema.constraints,
          k("constraint"),
          "🔒",
          (r) => String(r.name),
          (r) => String(r.type ?? "").toLowerCase(),
          (r) => ({ title: String(r.name), database: db, query: constraintDdl(r), run: false }),
        ),
    },
  ];
}

function securityFolder(): Item {
  return {
    key: "security",
    label: "Security",
    icon: "🛡",
    children: async () => [
      {
        key: "users",
        label: "Users",
      counted: true,
        icon: "👤",
        open: { title: "Users", database: "system", query: "SHOW USERS", run: true },
        children: async () =>
          rowsToItems(
            await api.users(),
            "user",
            "👤",
            (r) => String(r.user),
            (r) => (Array.isArray(r.roles) ? r.roles.join(", ") : undefined),
            (r) => ({
              title: String(r.user),
              database: "system",
              query: `// User ${r.user}\nALTER USER ${ident(String(r.user))} SET PASSWORD $password;\n\n// GRANT ROLE editor TO ${ident(String(r.user))};\n// DROP USER ${ident(String(r.user))};\n`,
              run: false,
            }),
          ),
      },
      {
        key: "roles",
        label: "Roles",
      counted: true,
        icon: "🎭",
        open: { title: "Roles", database: "system", query: "SHOW ROLES", run: true },
        children: async () => rowsToItems(await api.roles(), "role", "🎭", (r) => String(r.role)),
      },
      {
        key: "tokens",
        label: "Tokens",
      counted: true,
        icon: "🎟",
        open: { title: "Tokens", database: "system", query: "SHOW TOKENS", run: true },
        children: async () =>
          rowsToItems(
            await api.tokens(),
            "token",
            "🎟",
            (r) => `${r.user}/${r.name}`,
            (r) => String(r.access ?? ""),
          ),
      },
    ],
  };
}
