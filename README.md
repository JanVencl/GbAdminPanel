# GbAdminPanel

Web admin panel for [GraphBuff](https://github.com/JanVencl/graphbuff) — control, inspect and manage GraphBuff servers.

## Stack

- **Frontend:** React 19 + Vite + TypeScript (`frontend/`)
- **Backend:** Java 21 / Spring Boot 4 (`backend/`)
- **Connectivity:** Neo4j Java driver 6 over Bolt to GraphBuff

## Features

- **Object explorer** — server › databases › labels, relationship types, property keys, indexes, constraints; aliases; security (users, roles, tokens); monitoring (transactions, settings, procedures, functions). Lazy-loaded, keyboard navigable (arrows, Enter).
- **Query editor tabs** — CodeMirror with Cypher highlighting and schema-aware autocomplete (`:` → labels/types, `.` → property keys). Per-tab database, max rows, Ctrl+Enter / F5 runs the selection or the whole script. Ctrl+T new tab, Ctrl+W close.
- **Results** — grid (nodes as `(:Label {…})`, relationships as `[:TYPE {…}]`) or JSON; row count, time, database and update counters.
- Double-clicking a label or type runs a sample query; an index, constraint or user opens its Cypher script (create / drop) without running it.
- **Context menus and dialogs** — right-click (or Shift+F10) any tree item:
  - databases: create (storage, IF NOT EXISTS / OR REPLACE), read-only / read-write, drop (optional dump)
  - aliases: create, retarget, drop
  - indexes: range, full-text and vector; constraints: unique, not null, key, property type; drop
  - users: create (with roles), set password, grant / revoke role (everywhere or on one database), rename, drop
  - tokens: create (access, databases, expiry; the token is shown once with a Copy button), drop
  - transactions: terminate
- Each dialog shows the Cypher it will run, can open it in an editor instead, and asks you to type the name before dropping a database or user. Passwords are sent as parameters, never in the query text.

## Running

Start a GraphBuff server with Bolt enabled (`bolt = "127.0.0.1:7687"` under `[server]` in `graphbuff.toml`).

Backend (port 8080):

```sh
cd backend
GRAPHBUFF_PASSWORD=... ./mvnw spring-boot:run
```

| Env var              | Default                 |
|----------------------|-------------------------|
| `GRAPHBUFF_URI`      | `bolt://localhost:7687` |
| `GRAPHBUFF_USER`     | `admin`                 |
| `GRAPHBUFF_PASSWORD` | *(empty)*               |

Frontend (port 5174, proxies `/api` to the backend):

```sh
cd frontend
npm install
npm run dev
```

## API

| Method | Path                | Runs                                   |
|--------|---------------------|----------------------------------------|
| GET    | `/api/server`       | server agent, address, Bolt version    |
| GET    | `/api/databases`    | `SHOW DATABASES`                       |
| GET    | `/api/users`        | `SHOW USERS`                           |
| GET    | `/api/transactions` | `SHOW TRANSACTIONS`                    |
| GET    | `/api/databases/{db}/schema` | labels, types, property keys, indexes, constraints |
| GET    | `/api/aliases`, `/api/roles`, `/api/tokens` | `SHOW ALIASES` / `ROLES` / `TOKENS` |
| POST   | `/api/cypher`       | `{query, database?, params?, maxRows?}` |

Results are `{columns, rows, truncated, summary}`; driver errors come back as `{code, message}`.

The panel has no login of its own yet: anyone who can reach the backend acts as the configured GraphBuff user. Keep it on localhost.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
