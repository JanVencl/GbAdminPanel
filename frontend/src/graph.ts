/** Finds the nodes and relationships in query results, for the graph view. */

export type GNode = {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
  /** Only known as a relationship's end: not returned by the query. */
  stub?: boolean;
};

export type GRel = {
  id: string;
  type: string;
  start: string;
  end: string;
  properties: Record<string, unknown>;
};

export type Graph = { nodes: Map<string, GNode>; rels: Map<string, GRel> };

type Obj = Record<string, unknown>;

function isNode(v: unknown): v is Obj {
  return !!v && typeof v === "object" && "elementId" in v && "labels" in v && "properties" in v;
}

function isRel(v: unknown): v is Obj {
  return !!v && typeof v === "object" && "elementId" in v && "type" in v && "start" in v && "end" in v;
}

function isPath(v: unknown): v is { nodes: unknown[]; relationships: unknown[] } {
  return !!v && typeof v === "object" && Array.isArray((v as Obj).nodes) && Array.isArray((v as Obj).relationships);
}

export function emptyGraph(): Graph {
  return { nodes: new Map(), rels: new Map() };
}

/** Adds every node, relationship and path found in the rows (at any depth) to the graph. */
export function addRows(graph: Graph, rows: Record<string, unknown>[]): Graph {
  const visit = (v: unknown) => {
    if (v === null || typeof v !== "object") return;
    if (isNode(v)) {
      graph.nodes.set(String(v.elementId), {
        id: String(v.elementId),
        labels: (v.labels as string[]) ?? [],
        properties: (v.properties as Obj) ?? {},
      });
    } else if (isRel(v)) {
      graph.rels.set(String(v.elementId), {
        id: String(v.elementId),
        type: String(v.type),
        start: String(v.start),
        end: String(v.end),
        properties: (v.properties as Obj) ?? {},
      });
    } else if (isPath(v)) {
      v.nodes.forEach(visit);
      v.relationships.forEach(visit);
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else {
      Object.values(v).forEach(visit);
    }
  };
  rows.forEach((row) => Object.values(row).forEach(visit));
  // A relationship whose end the query did not return still needs a node to point at.
  for (const r of graph.rels.values()) {
    for (const id of [r.start, r.end]) {
      if (!graph.nodes.has(id)) graph.nodes.set(id, { id, labels: [], properties: {}, stub: true });
    }
  }
  return graph;
}

export function hasGraph(rows: Record<string, unknown>[]): boolean {
  return addRows(emptyGraph(), rows).nodes.size > 0;
}

/** The text shown on a node: its name, title or first short string property, else its label. */
export function caption(n: GNode): string {
  const p = n.properties;
  for (const key of ["name", "title", "caption", "label", "id"]) {
    const v = p[key];
    if (typeof v === "string" || typeof v === "number") return String(v);
  }
  const first = Object.values(p).find((v) => typeof v === "string" && v.length <= 40);
  if (typeof first === "string") return first;
  return n.labels[0] ?? (n.stub ? "…" : n.id);
}

// Distinct hues that read on both light and dark backgrounds.
const PALETTE = ["#4C8EDA", "#E07A3F", "#3FAE7A", "#C85A9E", "#D8B13A", "#7A6FD0", "#3AA6B9", "#B5674D", "#8DAA3C", "#D05A5A"];

/** One color per label, the same every time. */
export function labelColor(label: string | undefined): string {
  if (!label) return "#8B93A1";
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
