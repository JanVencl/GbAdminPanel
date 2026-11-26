# GbAdminPanel

Web admin panel for [GraphBuff](https://github.com/JanVencl/graphbuff) — control, inspect and manage GraphBuff servers.

## Stack

- **Frontend:** React 19 + Vite + TypeScript (`frontend/`)
- **Backend:** Java 21 / Spring Boot 4 (`backend/`)
- **Connectivity:** Neo4j Java driver 6 over Bolt to GraphBuff

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
| POST   | `/api/cypher`       | `{query, database?, params?}`          |

Results are `{columns, rows}`; driver errors come back as `{code, message}`.

The panel has no login of its own yet: anyone who can reach the backend acts as the configured GraphBuff user. Keep it on localhost.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
