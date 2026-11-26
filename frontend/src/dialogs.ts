/** The create / alter / drop dialogs of the object explorer. Each builds the Cypher it runs. */
import type { Built, DialogSpec, Values } from "./Dialog";
import { ident as q } from "./ddl";
import { str } from "./admin";

const ROLES = ["reader", "editor", "admin"];
const SYSTEM = "system";

function sys(...queries: (string | { query: string; params?: Record<string, unknown> })[]): Built {
  return { database: SYSTEM, statements: queries.map((s) => (typeof s === "string" ? { query: s } : s)) };
}

function on(database: string, query: string): Built {
  return { database, statements: [{ query }] };
}

function list(v: Values[string]): string[] {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function dbOptions(databases: string[], any?: string) {
  return [...(any ? [{ value: "", label: any }] : []), ...databases.map((d) => ({ value: d, label: d }))];
}

// Databases

export function createDatabase(onDone: () => void): DialogSpec {
  return {
    title: "Create database",
    fields: [
      { kind: "text", name: "name", label: "Name", required: true, placeholder: "movies" },
      {
        kind: "select",
        name: "storage",
        label: "Storage",
        options: [
          { value: "", label: "Server default" },
          { value: "memory", label: "memory — lost on restart" },
          { value: "hybrid", label: "hybrid" },
          { value: "persistent", label: "persistent" },
        ],
      },
      { kind: "checkbox", name: "ifNotExists", label: "IF NOT EXISTS — leave an existing database alone" },
      { kind: "checkbox", name: "orReplace", label: "OR REPLACE — drop an existing database and its data first" },
    ],
    danger: (v) => !!v.orReplace,
    build: (v) => {
      if (v.ifNotExists && v.orReplace) return { error: "OR REPLACE and IF NOT EXISTS cannot be combined" };
      const name = String(v.name).trim();
      if (!name) return { error: "enter a name" };
      return sys(
        `CREATE ${v.orReplace ? "OR REPLACE " : ""}DATABASE ${q(name)}${v.ifNotExists ? " IF NOT EXISTS" : ""}${
          v.storage ? ` OPTIONS {storage: ${str(String(v.storage))}}` : ""
        }`,
      );
    },
    onDone,
  };
}

export function dropDatabase(name: string, onDone: () => void): DialogSpec {
  return {
    title: `Drop database ${name}`,
    description: "Deletes the database and all its data.",
    fields: [{ kind: "checkbox", name: "dump", label: "DUMP DATA — back it up to data/dumps/ first" }],
    danger: true,
    confirm: name,
    executeLabel: "Drop",
    build: (v) => sys(`DROP DATABASE ${q(name)}${v.dump ? " DUMP DATA" : ""}`),
    onDone,
  };
}

export function setAccess(name: string, readOnly: boolean, onDone: () => void): DialogSpec {
  return {
    title: `Make ${name} ${readOnly ? "read-only" : "read-write"}`,
    description: readOnly ? "Writes to the database are refused until it is made read-write again." : undefined,
    fields: [],
    build: () => sys(`ALTER DATABASE ${q(name)} SET ACCESS ${readOnly ? "READ ONLY" : "READ WRITE"}`),
    onDone,
  };
}

// Aliases

export function createAlias(databases: string[], target: string | undefined, onDone: () => void): DialogSpec {
  return {
    title: "Create alias",
    description: "Another name for a database.",
    fields: [
      { kind: "text", name: "alias", label: "Alias", required: true },
      { kind: "select", name: "target", label: "For database", options: dbOptions(databases) },
      { kind: "checkbox", name: "orReplace", label: "OR REPLACE — repoint an existing alias" },
    ],
    initial: target ? { target } : undefined,
    build: (v) =>
      String(v.alias).trim()
        ? sys(`CREATE ${v.orReplace ? "OR REPLACE " : ""}ALIAS ${q(String(v.alias).trim())} FOR DATABASE ${q(String(v.target))}`)
        : { error: "enter an alias" },
    onDone,
  };
}

export function retargetAlias(alias: string, current: string, databases: string[], onDone: () => void): DialogSpec {
  return {
    title: `Retarget alias ${alias}`,
    fields: [{ kind: "select", name: "target", label: "Database", options: dbOptions(databases) }],
    initial: { target: current },
    build: (v) => sys(`ALTER ALIAS ${q(alias)} SET DATABASE TARGET ${q(String(v.target))}`),
    onDone,
  };
}

export function dropAlias(alias: string, onDone: () => void): DialogSpec {
  return {
    title: `Drop alias ${alias}`,
    description: "The database it names stays.",
    fields: [],
    danger: true,
    executeLabel: "Drop",
    build: () => sys(`DROP ALIAS ${q(alias)} FOR DATABASE`),
    onDone,
  };
}

// Indexes and constraints

function target(v: Values, labelsOrTypes: string): { pattern: string; v: string } | { error: string } {
  const lt = labelsOrTypes.trim();
  if (!lt) return { error: v.entity === "RELATIONSHIP" ? "enter a relationship type" : "enter a label" };
  const name = lt
    .split("|")
    .map((s) => q(s.trim()))
    .join("|");
  return v.entity === "RELATIONSHIP" ? { pattern: `()-[r:${name}]-()`, v: "r" } : { pattern: `(n:${name})`, v: "n" };
}

type SchemaHints = { labels: string[]; relationshipTypes: string[]; propertyKeys: string[] };

export function createIndex(db: string, hints: SchemaHints, preset: { entity?: string; labelOrType?: string }, onDone: () => void): DialogSpec {
  return {
    title: `Create index on ${db}`,
    fields: [
      {
        kind: "select",
        name: "type",
        label: "Type",
        options: [
          { value: "RANGE", label: "Range — equality, ranges, prefixes" },
          { value: "FULLTEXT", label: "Full-text — word search" },
          { value: "VECTOR", label: "Vector — nearest neighbours" },
        ],
      },
      { kind: "text", name: "name", label: "Name", help: "Needed for full-text and vector indexes", placeholder: "movie_title" },
      {
        kind: "select",
        name: "entity",
        label: "On",
        options: [
          { value: "NODE", label: "Nodes" },
          { value: "RELATIONSHIP", label: "Relationships" },
        ],
      },
      {
        kind: "text",
        name: "labelOrType",
        label: "Label / relationship type",
        required: true,
        suggestions: [...hints.labels, ...hints.relationshipTypes],
        help: "Full-text indexes take several: A|B",
      },
      {
        kind: "text",
        name: "properties",
        label: "Properties",
        required: true,
        suggestions: hints.propertyKeys,
        help: "Comma-separated; a vector index takes one",
      },
      { kind: "number", name: "dimensions", label: "Dimensions", min: 1, max: 4096, when: (v) => v.type === "VECTOR", required: true },
      {
        kind: "select",
        name: "similarity",
        label: "Similarity",
        when: (v) => v.type === "VECTOR",
        options: [
          { value: "cosine", label: "cosine" },
          { value: "euclidean", label: "euclidean" },
        ],
      },
      { kind: "checkbox", name: "ifNotExists", label: "IF NOT EXISTS" },
    ],
    initial: { entity: preset.entity ?? "NODE", labelOrType: preset.labelOrType ?? "" },
    build: (v) => {
      const t = target(v, String(v.labelOrType));
      if ("error" in t) return t;
      const props = list(v.properties).map((p) => `${t.v}.${q(p)}`);
      if (props.length === 0) return { error: "enter at least one property" };
      const name = String(v.name).trim();
      const head = (kind: string) => `CREATE ${kind}INDEX${name ? ` ${q(name)}` : ""}${v.ifNotExists ? " IF NOT EXISTS" : ""} FOR ${t.pattern}`;
      if (v.type === "FULLTEXT") {
        if (!name) return { error: "a full-text index needs a name" };
        return on(db, `${head("FULLTEXT ")} ON EACH [${props.join(", ")}]`);
      }
      if (v.type === "VECTOR") {
        if (!name) return { error: "a vector index needs a name" };
        if (props.length !== 1) return { error: "a vector index takes one property" };
        const dims = Number(v.dimensions);
        if (!Number.isInteger(dims) || dims < 1 || dims > 4096) return { error: "dimensions: 1 to 4096" };
        return on(
          db,
          `${head("VECTOR ")} ON ${props[0]}\nOPTIONS {indexConfig: {\`vector.dimensions\`: ${dims}, \`vector.similarity_function\`: ${str(String(v.similarity))}}}`,
        );
      }
      if (t.pattern.includes("|")) return { error: "only full-text indexes take several labels" };
      return on(db, `${head("")} ON (${props.join(", ")})`);
    },
    onDone,
  };
}

export function dropIndex(db: string, name: string, onDone: () => void): DialogSpec {
  return {
    title: `Drop index ${name}`,
    fields: [],
    danger: true,
    executeLabel: "Drop",
    build: () => on(db, `DROP INDEX ${q(name)}`),
    onDone,
  };
}

const PROPERTY_TYPES = ["STRING", "INTEGER", "FLOAT", "BOOLEAN", "DATE", "LOCAL TIME", "ZONED TIME", "LOCAL DATETIME", "ZONED DATETIME", "DURATION", "POINT"];

export function createConstraint(db: string, hints: SchemaHints, preset: { entity?: string; labelOrType?: string }, onDone: () => void): DialogSpec {
  return {
    title: `Create constraint on ${db}`,
    fields: [
      {
        kind: "select",
        name: "kind",
        label: "Constraint",
        options: [
          { value: "UNIQUE", label: "Unique" },
          { value: "NOT NULL", label: "Exists (not null)" },
          { value: "KEY", label: "Key — unique and exists" },
          { value: "TYPE", label: "Property type" },
        ],
      },
      { kind: "text", name: "name", label: "Name", placeholder: "person_name" },
      {
        kind: "select",
        name: "entity",
        label: "On",
        options: [
          { value: "NODE", label: "Nodes" },
          { value: "RELATIONSHIP", label: "Relationships" },
        ],
      },
      {
        kind: "text",
        name: "labelOrType",
        label: "Label / relationship type",
        required: true,
        suggestions: [...hints.labels, ...hints.relationshipTypes],
      },
      { kind: "text", name: "properties", label: "Properties", required: true, suggestions: hints.propertyKeys, help: "Comma-separated for unique and key" },
      {
        kind: "select",
        name: "propertyType",
        label: "Type",
        when: (v) => v.kind === "TYPE",
        options: PROPERTY_TYPES.map((t) => ({ value: t, label: t })),
      },
      { kind: "checkbox", name: "ifNotExists", label: "IF NOT EXISTS" },
    ],
    initial: { entity: preset.entity ?? "NODE", labelOrType: preset.labelOrType ?? "" },
    build: (v) => {
      const t = target(v, String(v.labelOrType));
      if ("error" in t) return t;
      if (t.pattern.includes("|")) return { error: "a constraint takes one label or type" };
      const props = list(v.properties).map((p) => `${t.v}.${q(p)}`);
      if (props.length === 0) return { error: "enter at least one property" };
      const one = props.length === 1 ? props[0] : `(${props.join(", ")})`;
      if ((v.kind === "NOT NULL" || v.kind === "TYPE") && props.length !== 1) return { error: "this constraint takes one property" };
      const rule =
        v.kind === "UNIQUE"
          ? `${one} IS UNIQUE`
          : v.kind === "KEY"
            ? `${one} IS ${v.entity === "RELATIONSHIP" ? "RELATIONSHIP" : "NODE"} KEY`
            : v.kind === "NOT NULL"
              ? `${one} IS NOT NULL`
              : `${one} IS :: ${v.propertyType}`;
      const name = String(v.name).trim();
      return on(db, `CREATE CONSTRAINT${name ? ` ${q(name)}` : ""}${v.ifNotExists ? " IF NOT EXISTS" : ""} FOR ${t.pattern} REQUIRE ${rule}`);
    },
    onDone,
  };
}

export function dropConstraint(db: string, name: string, onDone: () => void): DialogSpec {
  return {
    title: `Drop constraint ${name}`,
    fields: [],
    danger: true,
    executeLabel: "Drop",
    build: () => on(db, `DROP CONSTRAINT ${q(name)}`),
    onDone,
  };
}

// Users

const passwordFields = [
  { kind: "password" as const, name: "password", label: "Password", required: true },
  { kind: "password" as const, name: "password2", label: "Repeat password", required: true },
];

function checkPassword(v: Values): string | null {
  if (!v.password) return "enter a password";
  if (v.password !== v.password2) return "the passwords differ";
  return null;
}

export function createUser(databases: string[], onDone: () => void): DialogSpec {
  return {
    title: "Create user",
    fields: [
      { kind: "text", name: "name", label: "User name", required: true },
      ...passwordFields,
      { kind: "checkboxes", name: "roles", label: "Roles on every database", options: ROLES },
      { kind: "select", name: "dbRole", label: "Role on one database", options: [{ value: "", label: "none" }, ...ROLES.filter((r) => r !== "admin").map((r) => ({ value: r, label: r }))] },
      { kind: "select", name: "db", label: "On database", options: dbOptions(databases), when: (v) => !!v.dbRole },
    ],
    build: (v) => {
      const name = String(v.name).trim();
      if (!name) return { error: "enter a user name" };
      const bad = checkPassword(v);
      if (bad) return { error: bad };
      const u = q(name);
      const roles = v.roles as string[];
      return sys(
        { query: `CREATE USER ${u} SET PASSWORD $password CHANGE NOT REQUIRED`, params: { password: v.password } },
        ...(roles.length ? [`GRANT ROLE ${roles.join(", ")} TO ${u}`] : []),
        ...(v.dbRole && v.db ? [`GRANT ROLE ${v.dbRole} ON DATABASE ${q(String(v.db))} TO ${u}`] : []),
      );
    },
    onDone,
  };
}

export function setPassword(user: string, onDone: () => void): DialogSpec {
  return {
    title: `Set password of ${user}`,
    fields: passwordFields,
    build: (v) => {
      const bad = checkPassword(v);
      return bad ? { error: bad } : sys({ query: `ALTER USER ${q(user)} SET PASSWORD $password`, params: { password: v.password } });
    },
    onDone,
  };
}

export function renameUser(user: string, onDone: () => void): DialogSpec {
  return {
    title: `Rename user ${user}`,
    fields: [{ kind: "text", name: "to", label: "New name", required: true }],
    build: (v) => (String(v.to).trim() ? sys(`RENAME USER ${q(user)} TO ${q(String(v.to).trim())}`) : { error: "enter a name" }),
    onDone,
  };
}

function roleScope(databases: string[]) {
  return [
    { kind: "select" as const, name: "role", label: "Role", options: ROLES.map((r) => ({ value: r, label: r })) },
    {
      kind: "select" as const,
      name: "db",
      label: "Scope",
      options: dbOptions(databases, "Every database"),
      when: (v: Values) => v.role !== "admin",
    },
  ];
}

function scoped(v: Values) {
  return v.db && v.role !== "admin" ? ` ON DATABASE ${q(String(v.db))}` : "";
}

export function grantRole(user: string, databases: string[], onDone: () => void): DialogSpec {
  return {
    title: `Grant role to ${user}`,
    fields: roleScope(databases),
    build: (v) => sys(`GRANT ROLE ${v.role}${scoped(v)} TO ${q(user)}`),
    onDone,
  };
}

export function revokeRole(user: string, databases: string[], onDone: () => void): DialogSpec {
  return {
    title: `Revoke role from ${user}`,
    fields: roleScope(databases),
    danger: true,
    build: (v) => sys(`REVOKE ROLE ${v.role}${scoped(v)} FROM ${q(user)}`),
    onDone,
  };
}

export function dropUser(user: string, onDone: () => void): DialogSpec {
  return {
    title: `Drop user ${user}`,
    description: "Also drops the user's API tokens.",
    fields: [],
    danger: true,
    confirm: user,
    executeLabel: "Drop",
    build: () => sys(`DROP USER ${q(user)}`),
    onDone,
  };
}

// Tokens

export function createToken(databases: string[], forUser: string | null, currentUser: string | null, onDone: () => void): DialogSpec {
  return {
    title: forUser ? `Create token for ${forUser}` : "Create token",
    description: "An API token logs a program in without a password. It is shown once.",
    fields: [
      { kind: "text", name: "name", label: "Name", required: true, placeholder: "laptop" },
      { kind: "text", name: "user", label: "For user", help: "Empty: yourself. Others: administrators only", suggestions: forUser ? [forUser] : undefined },
      {
        kind: "select",
        name: "access",
        label: "Access",
        options: [
          { value: "READ", label: "Read" },
          { value: "WRITE", label: "Write — data, indexes, constraints" },
        ],
      },
      { kind: "checkboxes", name: "dbs", label: "Databases (none ticked: every one the user may use)", options: databases },
      {
        kind: "select",
        name: "expires",
        label: "Expires",
        options: [
          { value: "", label: "in 90 days (default)" },
          { value: "DAYS", label: "in … days" },
          { value: "HOURS", label: "in … hours" },
          { value: "NEVER", label: "never" },
        ],
      },
      { kind: "number", name: "n", label: "Number", min: 1, max: 87600, when: (v) => v.expires === "DAYS" || v.expires === "HOURS", required: true },
    ],
    initial: { user: forUser && forUser !== currentUser ? forUser : "" },
    showResult: true,
    build: (v) => {
      const name = String(v.name).trim();
      if (!name) return { error: "enter a name" };
      const dbs = v.dbs as string[];
      const user = String(v.user).trim();
      let expires = "";
      if (v.expires === "NEVER") expires = " EXPIRES NEVER";
      else if (v.expires) {
        const n = Number(v.n);
        if (!Number.isInteger(n) || n < 1) return { error: "enter how many" };
        expires = ` EXPIRES IN ${n} ${v.expires}`;
      }
      return sys(
        `CREATE TOKEN ${q(name)}${user ? ` FOR USER ${q(user)}` : ""}${v.access === "WRITE" ? " ACCESS WRITE" : ""}${
          dbs.length ? ` ON DATABASE ${dbs.map(q).join(", ")}` : ""
        }${expires}`,
      );
    },
    onDone,
  };
}

export function dropToken(name: string, user: string, currentUser: string | null, onDone: () => void): DialogSpec {
  return {
    title: `Drop token ${name}`,
    description: "Programs using it can no longer log in.",
    fields: [],
    danger: true,
    executeLabel: "Drop",
    build: () => sys(`DROP TOKEN ${q(name)}${user && user !== currentUser ? ` FOR USER ${q(user)}` : ""}`),
    onDone,
  };
}

// Transactions

export function terminateTransaction(id: string, query: string, onDone: () => void): DialogSpec {
  return {
    title: `Terminate ${id}`,
    description: query ? `Running: ${query}` : undefined,
    fields: [],
    danger: true,
    executeLabel: "Terminate",
    build: () => sys(`TERMINATE TRANSACTIONS ${str(id)}`),
    onDone,
  };
}
