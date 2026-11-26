import { QueryResult } from "./api";

type Entity = { elementId: string; labels?: string[]; type?: string; properties: Record<string, unknown> };

function isNode(v: unknown): v is Entity {
  return !!v && typeof v === "object" && "elementId" in v && "labels" in v;
}

function isRel(v: unknown): v is Entity {
  return !!v && typeof v === "object" && "elementId" in v && "type" in v && "start" in v;
}

function propsText(p: Record<string, unknown>): string {
  const entries = Object.entries(p);
  if (entries.length === 0) return "";
  return ` {${entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")}}`;
}

/** Shows nodes as (:Label {k: v}) and relationships as [:TYPE {k: v}], everything else as JSON. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (isNode(value)) return `(${value.labels!.map((l) => ":" + l).join("")}${propsText(value.properties)})`;
  if (isRel(value)) return `[:${value.type}${propsText(value.properties)}]`;
  if (typeof value === "object" && value && "nodes" in value && "relationships" in value) {
    const p = value as { nodes: unknown[]; relationships: unknown[] };
    return p.nodes.map((n, i) => formatValue(n) + (i < p.relationships.length ? `-${formatValue(p.relationships[i])}->` : "")).join("");
  }
  if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ResultTable({ result }: { result: QueryResult }) {
  if (result.columns.length === 0) return <p className="muted pad">No rows returned.</p>;
  return (
    <table className="grid">
      <thead>
        <tr>
          <th className="rownum">#</th>
          {result.columns.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row, i) => (
          <tr key={i}>
            <td className="rownum">{i + 1}</td>
            {result.columns.map((c) => {
              const v = row[c];
              const text = formatValue(v);
              return (
                <td key={c} className={v === null ? "null" : undefined} title={text.length > 60 ? text : undefined}>
                  {text}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
