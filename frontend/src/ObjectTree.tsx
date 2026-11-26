import { useCallback, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { api, QueryResult, Schema, ServerInfo } from "./api";
import { constraintDdl, ident, indexDdl } from "./ddl";
import { Admin, useAdmin } from "./admin";
import ContextMenu, { MenuEntry } from "./ContextMenu";
import * as d from "./dialogs";

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
  /** Right-click menu entries of this item; Open, Refresh and Copy name are added. */
  menu?: (a: Admin) => MenuEntry[];
};

type Props = {
  onSchema: (database: string, schema: Schema) => void;
  reloadKey: number;
  /** Item key → reload, for Admin.refresh. */
  registry: Map<string, () => void>;
  onServer: (server: ServerInfo | null) => void;
};

type MenuState = { x: number; y: number; entries: MenuEntry[] } | null;

export default function ObjectTree({ onSchema, reloadKey, registry, onServer }: Props) {
  const admin = useAdmin();
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);

  useEffect(() => {
    setError(null);
    api.server().then(
      (s) => {
        setServer(s);
        onServer(s);
      },
      (e: Error) => {
        setError(e.message);
        onServer(null);
      },
    );
  }, [reloadKey, onServer]);

  const root = useMemo((): Item[] => {
    if (!server) return [];
    return [
      {
        key: "server",
        label: server.agent.replace(/^Neo4j\/[\d.]+-/, ""),
        hint: `${server.user}@${server.address} · Bolt ${server.protocolVersion}`,
        icon: "🖥",
        menu: (a) => [
          { label: "New query", icon: "✎", onClick: () => a.openEditor({ title: "Query", database: null, query: "", run: false }) },
          { label: "Create database…", icon: "＋", onClick: () => a.openDialog(d.createDatabase(() => dbChanged(a))) },
        ],
        children: async () => [databasesFolder(onSchema), aliasesFolder(), securityFolder(), monitoringFolder()],
      },
    ];
  }, [server, onSchema]);

  const openMenu = useCallback(
    (item: Item, x: number, y: number) => {
      const own = item.menu?.(admin) ?? [];
      const entries: MenuEntry[] = [];
      if (item.open) entries.push({ label: item.open.run ? "Open" : "Open in editor", icon: "▶", onClick: () => admin.openEditor(item.open!) });
      if (own.length) entries.push(...(entries.length ? ["-" as const] : []), ...own);
      entries.push("-");
      if (item.children) entries.push({ label: "Refresh", icon: "↻", onClick: () => registry.get(item.key)?.() });
      entries.push({ label: "Copy name", icon: "⧉", onClick: () => navigator.clipboard.writeText(item.label) });
      setMenu({ x, y, entries });
    },
    [admin, registry],
  );

  return (
    <div className="tree" role="tree" onContextMenu={(e) => e.preventDefault()}>
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
          onMenu={openMenu}
          registry={registry}
        />
      ))}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function TreeNode({
  item,
  depth,
  defaultOpen = false,
  selected,
  onSelect,
  onMenu,
  registry,
}: {
  item: Item;
  depth: number;
  defaultOpen?: boolean;
  selected: string | null;
  onSelect: (key: string) => void;
  onMenu: (item: Item, x: number, y: number) => void;
  registry: Map<string, () => void>;
}) {
  const admin = useAdmin();
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

  // Admin.refresh reloads a folder only if it was loaded; otherwise it loads when opened.
  const loaded = children !== null || error !== null;
  useEffect(() => {
    if (!item.children) return;
    const reload = () => loaded && load();
    registry.set(item.key, reload);
    return () => {
      if (registry.get(item.key) === reload) registry.delete(item.key);
    };
  }, [item, registry, load, loaded]);

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
        <TreeNode key={c.key} item={c} depth={depth + 1} selected={selected} onSelect={onSelect} onMenu={onMenu} registry={registry} />
      ));
  }

  return (
    <div role="treeitem" aria-expanded={item.children ? expanded : undefined}>
      <div
        className={`tree-row${isSelected ? " selected" : ""}`}
        style={{ paddingLeft: indent(depth) }}
        title={item.hint ?? (item.open ? "Double-click to open; right-click for more" : "Right-click for actions")}
        tabIndex={0}
        onClick={(e) => {
          e.currentTarget.focus();
          onSelect(item.key);
        }}
        onDoubleClick={() => (item.open ? admin.openEditor(item.open) : toggle())}
        onContextMenu={(e) => {
          e.preventDefault();
          e.currentTarget.focus();
          onSelect(item.key);
          onMenu(item, e.clientX, e.clientY);
        }}
        onKeyDown={(e) => {
          if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(item, r.left + 24, r.bottom);
          } else if (e.key === "Enter" && item.open) admin.openEditor(item.open);
          else if (e.key === "ArrowRight" && !expanded) toggle();
          else if (e.key === "ArrowLeft" && expanded) toggle();
          else return;
          e.preventDefault();
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
  more: (r: Record<string, unknown>) => Partial<Item> = () => ({}),
): Item[] {
  return result.rows.map((r) => ({ key: `${kind}:${label(r)}`, label: label(r), icon, ...more(r) }));
}

// After a database is created, dropped or changed.
function dbChanged(a: Admin) {
  a.refresh("databases", "aliases");
  a.reloadDatabases();
}

async function hints(db: string) {
  try {
    return await api.schema(db);
  } catch {
    return { labels: [], relationshipTypes: [], propertyKeys: [] };
  }
}

function databasesFolder(onSchema: (database: string, schema: Schema) => void): Item {
  return {
    key: "databases",
    label: "Databases",
    counted: true,
    icon: "🗄",
    open: { title: "Databases", database: "system", query: "SHOW DATABASES", run: true },
    menu: (a) => [{ label: "Create database…", icon: "＋", onClick: () => a.openDialog(d.createDatabase(() => dbChanged(a))) }],
    children: async () => {
      const dbs = await api.databases();
      return dbs.rows.map((r) => {
        const name = String(r.name);
        const readOnly = r.access === "read-only";
        const tags = [r.default ? "default" : null, readOnly ? "read-only" : null].filter(Boolean);
        return {
          key: `db:${name}`,
          label: name,
          icon: "🛢",
          badge: tags.join(", ") || undefined,
          hint: `${r.nodes} nodes · ${r.relationships} relationships · ${r.storage}`,
          open: { title: name, database: name, query: "MATCH (n) RETURN n LIMIT 25", run: false },
          menu: (a) => [
            { label: "Properties", icon: "ℹ", onClick: () => a.openEditor({ title: name, database: "system", query: `SHOW DATABASE ${ident(name)}`, run: true }) },
            "-",
            { label: "Create index…", icon: "⚡", onClick: async () => a.openDialog(d.createIndex(name, await hints(name), {}, () => a.refresh(`db:${name}:indexes`))) },
            {
              label: "Create constraint…",
              icon: "🔒",
              onClick: async () => a.openDialog(d.createConstraint(name, await hints(name), {}, () => a.refresh(`db:${name}:constraints`, `db:${name}:indexes`))),
            },
            { label: "Create alias…", icon: "🔗", onClick: () => a.openDialog(d.createAlias(a.databases, name, () => a.refresh("aliases"))) },
            "-",
            {
              label: readOnly ? "Make read-write…" : "Make read-only…",
              icon: readOnly ? "🔓" : "🔏",
              onClick: () => a.openDialog(d.setAccess(name, !readOnly, () => dbChanged(a))),
            },
            { label: "Drop database…", icon: "🗑", danger: true, disabled: !!r.default, onClick: () => a.openDialog(d.dropDatabase(name, () => dbChanged(a))) },
          ],
          children: async () => {
            const schema = await api.schema(name);
            onSchema(name, schema);
            return databaseChildren(name, onSchema);
          },
        } satisfies Item;
      });
    },
  };
}

function databaseChildren(db: string, onSchema: (database: string, schema: Schema) => void): Item[] {
  const k = (s: string) => `db:${db}:${s}`;
  // Each folder reads the schema afresh, so Refresh shows changes.
  const schema = async () => {
    const s = await api.schema(db);
    onSchema(db, s);
    return s;
  };
  const indexFor = (entity: string, labelOrType: string) => (a: Admin) => async () =>
    a.openDialog(d.createIndex(db, await hints(db), { entity, labelOrType }, () => a.refresh(k("indexes"))));
  const constraintFor = (entity: string, labelOrType: string) => (a: Admin) => async () =>
    a.openDialog(d.createConstraint(db, await hints(db), { entity, labelOrType }, () => a.refresh(k("constraints"), k("indexes"))));
  return [
    {
      key: k("labels"),
      label: "Labels",
      counted: true,
      icon: "🏷",
      children: async () =>
        (await schema()).labels.map((l) => ({
          key: k(`label:${l}`),
          label: l,
          icon: "◯",
          open: { title: l, database: db, query: `MATCH (n:${ident(l)})\nRETURN n\nLIMIT 25`, run: true },
          menu: (a) => [
            { label: "Count nodes", icon: "#", onClick: () => a.openEditor({ title: `count ${l}`, database: db, query: `MATCH (n:${ident(l)})\nRETURN count(n) AS nodes`, run: true }) },
            { label: "Create index…", icon: "⚡", onClick: indexFor("NODE", l)(a) },
            { label: "Create constraint…", icon: "🔒", onClick: constraintFor("NODE", l)(a) },
          ],
        })),
    },
    {
      key: k("types"),
      label: "Relationship types",
      counted: true,
      icon: "↔",
      children: async () =>
        (await schema()).relationshipTypes.map((t) => ({
          key: k(`type:${t}`),
          label: t,
          icon: "→",
          open: { title: t, database: db, query: `MATCH (a)-[r:${ident(t)}]->(b)\nRETURN a, r, b\nLIMIT 25`, run: true },
          menu: (a) => [
            {
              label: "Count relationships",
              icon: "#",
              onClick: () => a.openEditor({ title: `count ${t}`, database: db, query: `MATCH ()-[r:${ident(t)}]->()\nRETURN count(r) AS relationships`, run: true }),
            },
            { label: "Create index…", icon: "⚡", onClick: indexFor("RELATIONSHIP", t)(a) },
            { label: "Create constraint…", icon: "🔒", onClick: constraintFor("RELATIONSHIP", t)(a) },
          ],
        })),
    },
    {
      key: k("props"),
      label: "Property keys",
      counted: true,
      icon: "🔑",
      children: async () =>
        (await schema()).propertyKeys.map((p) => ({
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
      menu: (a) => [{ label: "Create index…", icon: "＋", onClick: indexFor("NODE", "")(a) }],
      children: async () =>
        rowsToItems((await schema()).indexes, k("index"), "⚡", (r) => String(r.name), (r) => ({
          badge: String(r.type ?? "").toLowerCase(),
          hint: `${r.entityType === "RELATIONSHIP" ? "[:" : "(:"}${r.labelOrType}${r.entityType === "RELATIONSHIP" ? "]" : ")"} ${Array.isArray(r.properties) ? r.properties.join(", ") : ""}`,
          open: { title: String(r.name), database: db, query: indexDdl(r), run: false },
          menu: (a) => [{ label: "Drop index…", icon: "🗑", danger: true, onClick: () => a.openDialog(d.dropIndex(db, String(r.name), () => a.refresh(k("indexes")))) }],
        })),
    },
    {
      key: k("constraints"),
      label: "Constraints",
      counted: true,
      icon: "🔒",
      open: { title: `${db}: constraints`, database: db, query: "SHOW CONSTRAINTS", run: true },
      menu: (a) => [{ label: "Create constraint…", icon: "＋", onClick: constraintFor("NODE", "")(a) }],
      children: async () =>
        rowsToItems((await schema()).constraints, k("constraint"), "🔒", (r) => String(r.name), (r) => ({
          badge: String(r.type ?? "").toLowerCase(),
          open: { title: String(r.name), database: db, query: constraintDdl(r), run: false },
          menu: (a) => [
            {
              label: "Drop constraint…",
              icon: "🗑",
              danger: true,
              onClick: () => a.openDialog(d.dropConstraint(db, String(r.name), () => a.refresh(k("constraints"), k("indexes")))),
            },
          ],
        })),
    },
  ];
}

function aliasesFolder(): Item {
  return {
    key: "aliases",
    label: "Aliases",
    counted: true,
    icon: "🔗",
    open: { title: "Aliases", database: "system", query: "SHOW ALIASES FOR DATABASES", run: true },
    menu: (a) => [{ label: "Create alias…", icon: "＋", onClick: () => a.openDialog(d.createAlias(a.databases, undefined, () => a.refresh("aliases"))) }],
    children: async () =>
      rowsToItems(await api.aliases(), "alias", "🔗", (r) => String(r.name), (r) => ({
        badge: `→ ${r.database}`,
        menu: (a) => [
          {
            label: "Retarget…",
            icon: "↪",
            onClick: () => a.openDialog(d.retargetAlias(String(r.name), String(r.database), a.databases, () => a.refresh("aliases"))),
          },
          { label: "Drop alias…", icon: "🗑", danger: true, onClick: () => a.openDialog(d.dropAlias(String(r.name), () => a.refresh("aliases"))) },
        ],
      })),
  };
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
        menu: (a) => [{ label: "Create user…", icon: "＋", onClick: () => a.openDialog(d.createUser(a.databases, () => a.refresh("users"))) }],
        children: async () =>
          rowsToItems(await api.users(), "user", "👤", (r) => String(r.user), (r) => {
            const user = String(r.user);
            const dbRoles = Object.entries((r.databaseRoles as Record<string, string[]>) ?? {}).map(([db, rs]) => `${rs.join("/")}@${db}`);
            return {
              badge: [...(Array.isArray(r.roles) ? r.roles : []), ...dbRoles].join(", ") || undefined,
              menu: (a) => [
                { label: "Set password…", icon: "🔑", onClick: () => a.openDialog(d.setPassword(user, () => undefined)) },
                { label: "Grant role…", icon: "＋", onClick: () => a.openDialog(d.grantRole(user, a.databases, () => a.refresh("users"))) },
                { label: "Revoke role…", icon: "－", onClick: () => a.openDialog(d.revokeRole(user, a.databases, () => a.refresh("users"))) },
                { label: "Create token…", icon: "🎟", onClick: () => a.openDialog(d.createToken(a.databases, user, a.currentUser, () => a.refresh("tokens"))) },
                { label: "Rename…", icon: "✎", onClick: () => a.openDialog(d.renameUser(user, () => a.refresh("users"))) },
                "-",
                {
                  label: "Drop user…",
                  icon: "🗑",
                  danger: true,
                  disabled: user === a.currentUser,
                  onClick: () => a.openDialog(d.dropUser(user, () => a.refresh("users", "tokens"))),
                },
              ],
            };
          }),
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
        menu: (a) => [{ label: "Create token…", icon: "＋", onClick: () => a.openDialog(d.createToken(a.databases, null, a.currentUser, () => a.refresh("tokens"))) }],
        children: async () =>
          rowsToItems(await api.tokens(), "token", "🎟", (r) => `${r.user}/${r.name}`, (r) => ({
            badge: [String(r.access ?? "").toLowerCase(), r.expires ? `until ${String(r.expires).slice(0, 10)}` : "no expiry"].join(", "),
            hint: `created ${r.created ?? "?"} · last used ${r.lastUsed ?? "never"}`,
            menu: (a) => [
              {
                label: "Drop token…",
                icon: "🗑",
                danger: true,
                onClick: () => a.openDialog(d.dropToken(String(r.name), String(r.user), a.currentUser, () => a.refresh("tokens"))),
              },
            ],
          })),
      },
    ],
  };
}

function monitoringFolder(): Item {
  return {
    key: "monitoring",
    label: "Monitoring",
    icon: "📈",
    children: async () => [
      {
        key: "tx",
        label: "Transactions",
        counted: true,
        icon: "⏱",
        open: { title: "Transactions", database: "system", query: "SHOW TRANSACTIONS", run: true },
        children: async () =>
          rowsToItems(await api.transactions(), "tx", "⏱", (r) => String(r.transactionId), (r) => ({
            badge: `${r.username} · ${String(r.status ?? "").toLowerCase()}`,
            hint: String(r.currentQuery || "(idle)"),
            menu: (a) => [
              {
                label: "Terminate…",
                icon: "⏹",
                danger: true,
                onClick: () => a.openDialog(d.terminateTransaction(String(r.transactionId), String(r.currentQuery ?? ""), () => a.refresh("tx"))),
              },
            ],
          })),
      },
      { key: "settings", label: "Settings", icon: "⚙", open: { title: "Settings", database: null, query: "SHOW SETTINGS", run: true } },
      { key: "procedures", label: "Procedures", icon: "ƒ", open: { title: "Procedures", database: null, query: "SHOW PROCEDURES", run: true } },
      { key: "functions", label: "Functions", icon: "ƒ", open: { title: "Functions", database: null, query: "SHOW FUNCTIONS", run: true } },
    ],
  };
}
