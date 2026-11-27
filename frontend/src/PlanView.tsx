import type { PlanNode } from "./api";
import { formatValue } from "./ResultTable";

/** An EXPLAIN or PROFILE plan as a tree, read top (result) to bottom (start). */
export default function PlanView({ plan, profiled }: { plan: PlanNode; profiled: boolean }) {
  const all: PlanNode[] = [];
  const walk = (p: PlanNode) => {
    all.push(p);
    p.children.forEach(walk);
  };
  walk(plan);
  const total = profiled ? all.reduce((s, p) => s + (p.timeNs ?? 0), 0) : 0;
  const slowest = profiled ? Math.max(...all.map((p) => p.timeNs ?? 0)) : 0;
  const noDetails = all.every((p) => Object.keys(p.arguments).length === 0);

  return (
    <div className="plan pad">
      <div className="plan-summary muted">
        {profiled ? `PROFILE · ${all.length} operators · ${ms(total)} in operators` : `EXPLAIN · ${all.length} operators · not run`}
        {noDetails && " · the server sent no operator details"}
      </div>
      <Op op={plan} profiled={profiled} total={total} slowest={slowest} />
    </div>
  );
}

function ms(ns: number): string {
  const v = ns / 1e6;
  return v >= 100 ? `${v.toFixed(0)} ms` : v >= 1 ? `${v.toFixed(1)} ms` : `${v.toFixed(3)} ms`;
}

function Op({ op, profiled, total, slowest }: { op: PlanNode; profiled: boolean; total: number; slowest: number }) {
  const { Details, EstimatedRows, Rows: _rows, Time: _time, ...rest } = op.arguments as Record<string, unknown>;
  const share = profiled && total > 0 ? (op.timeNs ?? 0) / total : 0;
  const hot = profiled && slowest > 0 && op.timeNs === slowest;
  return (
    <div className="plan-node">
      <div className={`plan-op${hot ? " hot" : ""}`}>
        <div className="plan-op-head">
          <b>{op.operator}</b>
          {Details != null && <code className="plan-details">{String(Details)}</code>}
        </div>
        <div className="plan-stats">
          {EstimatedRows != null && <span title="Estimated rows">~{Number(EstimatedRows).toFixed(1)} est.</span>}
          {profiled && <span title="Rows produced">{op.rows ?? 0} {op.rows === 1 ? "row" : "rows"}</span>}
          {profiled && <span title="Time in this operator">{ms(op.timeNs ?? 0)}</span>}
          {profiled && op.dbHits ? <span title="Database hits">{op.dbHits} db hits</span> : null}
          {op.identifiers.length > 0 && <span className="muted">{op.identifiers.join(", ")}</span>}
        </div>
        {Object.keys(rest).length > 0 && (
          <div className="plan-args muted">
            {Object.entries(rest).map(([k, v]) => (
              <span key={k}>
                {k}: {formatValue(v)}
              </span>
            ))}
          </div>
        )}
        {profiled && (
          <div className="plan-bar" title={`${(share * 100).toFixed(0)}% of operator time`}>
            <div style={{ width: `${Math.max(share * 100, 0.5)}%` }} />
          </div>
        )}
      </div>
      {op.children.length > 0 && (
        <div className="plan-children">
          {op.children.map((c, i) => (
            <Op key={i} op={c} profiled={profiled} total={total} slowest={slowest} />
          ))}
        </div>
      )}
    </div>
  );
}
