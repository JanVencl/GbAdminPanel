import { QueryResult } from "./api";

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ResultTable({ result }: { result: QueryResult }) {
  if (result.rows.length === 0) return <p className="muted">No rows.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {result.columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i}>
              {result.columns.map((c) => (
                <td key={c}>{cell(row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{result.rows.length} rows</p>
    </div>
  );
}
