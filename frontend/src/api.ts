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
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // State-changing requests carry the CSRF token the server put in the XSRF-TOKEN cookie.
  if (method !== "GET" && method !== "HEAD") {
    const token = csrfToken();
    if (token) headers["X-XSRF-TOKEN"] = token;
  }
  const res = await fetch(`/api${path}`, { ...init, headers, credentials: "same-origin" });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/login") {
    onUnauthorized?.();
  }
  if (!res.ok) {
    throw new ApiError(res.status, body.message || `${res.status} ${res.statusText}`);
  }
  return body as T;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function csrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

let onUnauthorized: (() => void) | undefined;

/** Called when the server says the session is gone (expired, logged out elsewhere). */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export type SessionInfo = {
  authenticated: boolean;
  uri: string;
  user?: string;
  roles?: string[];
  token?: boolean;
  agent?: string;
  address?: string;
  protocolVersion?: string;
};

export type Login = { username: string; password: string } | { token: string };

export const auth = {
  session: () => request<SessionInfo>("/session"),
  login: (login: Login) => request<SessionInfo>("/login", { method: "POST", body: JSON.stringify(login) }),
  logout: () => request<void>("/logout", { method: "POST" }),
};

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
