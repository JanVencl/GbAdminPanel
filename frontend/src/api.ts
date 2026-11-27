export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
};

export type ServerInfo = {
  uri: string;
  user: string;
  address: string;
  agent: string;
  protocolVersion: string;
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
  users: () => request<QueryResult>("/users"),
  transactions: () => request<QueryResult>("/transactions"),
  cypher: (query: string, database?: string, params: Record<string, unknown> = {}) =>
    request<QueryResult>("/cypher", {
      method: "POST",
      body: JSON.stringify({ query, database, params }),
    }),
};
