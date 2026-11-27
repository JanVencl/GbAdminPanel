export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  summary: {
    queryType: string | null;
    elapsedMs: number;
    counters: Record<string, number>;
    database: string | null;
  };
};

export type ServerInfo = {
  uri: string;
  user: string;
  address: string;
  agent: string;
  protocolVersion: string;
};

export type Schema = {
  labels: string[];
  relationshipTypes: string[];
  propertyKeys: string[];
  indexes: QueryResult;
  constraints: QueryResult;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || `${res.status} ${res.statusText}`);
  }
  return body as T;
}

export const api = {
  server: () => request<ServerInfo>("/server"),
  databases: () => request<QueryResult>("/databases"),
  schema: (database: string) => request<Schema>(`/databases/${encodeURIComponent(database)}/schema`),
  aliases: () => request<QueryResult>("/aliases"),
  users: () => request<QueryResult>("/users"),
  roles: () => request<QueryResult>("/roles"),
  tokens: () => request<QueryResult>("/tokens"),
  transactions: () => request<QueryResult>("/transactions"),
  cypher: (query: string, database?: string | null, maxRows?: number, params: Record<string, unknown> = {}) =>
    request<QueryResult>("/cypher", {
      method: "POST",
      body: JSON.stringify({ query, database: database || undefined, params, maxRows }),
    }),
};
