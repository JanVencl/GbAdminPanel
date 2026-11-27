import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { Core, ElementDefinition } from "cytoscape";
import { api, QueryResult } from "./api";
import { addRows, caption, emptyGraph, Graph, GNode, GRel, labelColor } from "./graph";
import { formatValue } from "./ResultTable";

const MAX_NODES = 1500;

type Props = {
  result: QueryResult;
  database: string | null;
  dark: boolean;
};

type Selected = { kind: "node"; node: GNode } | { kind: "rel"; rel: GRel } | null;

function nodeElement(n: GNode): ElementDefinition {
  return {
    group: "nodes",
    data: { id: n.id, caption: caption(n), color: labelColor(n.labels[0]), stub: n.stub ? 1 : 0 },
  };
}

function relElement(r: GRel): ElementDefinition {
  return { group: "edges", data: { id: r.id, source: r.start, target: r.end, type: r.type } };
}

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function GraphView({ result, database, dark }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const graph = useRef<Graph>(emptyGraph());
  const [selected, setSelected] = useState<Selected>(null);
  const [counts, setCounts] = useState({ nodes: 0, rels: 0 });
  const [legend, setLegend] = useState<[string, number][]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const initial = useMemo(() => addRows(emptyGraph(), result.rows), [result]);

  const refreshInfo = useCallback(() => {
    const g = graph.current;
    setCounts({ nodes: g.nodes.size, rels: g.rels.size });
    const byLabel = new Map<string, number>();
    for (const n of g.nodes.values()) {
      const l = n.labels[0] ?? (n.stub ? "(not returned)" : "(no label)");
      byLabel.set(l, (byLabel.get(l) ?? 0) + 1);
    }
    setLegend([...byLabel].sort((a, b) => b[1] - a[1]));
  }, []);

  // Build the graph once per result; the theme only restyles it.
  useEffect(() => {
    if (!container.current) return;
    graph.current = { nodes: new Map(initial.nodes), rels: new Map(initial.rels) };
    let nodes = [...graph.current.nodes.values()];
    if (nodes.length > MAX_NODES) {
      setMessage(`Showing ${MAX_NODES} of ${nodes.length} nodes.`);
      nodes = nodes.slice(0, MAX_NODES);
      const keep = new Set(nodes.map((n) => n.id));
      graph.current.nodes = new Map(nodes.map((n) => [n.id, n]));
      graph.current.rels = new Map([...graph.current.rels].filter(([, r]) => keep.has(r.start) && keep.has(r.end)));
    } else {
      setMessage(null);
    }
    const instance = cytoscape({
      container: container.current,
      elements: [...graph.current.nodes.values()].map(nodeElement).concat([...graph.current.rels.values()].map(relElement)),
      wheelSensitivity: 0.3,
      minZoom: 0.05,
      maxZoom: 4,
    });
    instance.layout({ name: "cose", animate: false, nodeDimensionsIncludeLabels: true, randomize: true, padding: 30 }).run();
    instance.on("tap", "node", (e) => {
      const n = graph.current.nodes.get(e.target.id());
      if (n) setSelected({ kind: "node", node: n });
    });
    instance.on("tap", "edge", (e) => {
      const r = graph.current.rels.get(e.target.id());
      if (r) setSelected({ kind: "rel", rel: r });
    });
    instance.on("tap", (e) => {
      if (e.target === instance) setSelected(null);
    });
    cy.current = instance;
    refreshInfo();
    return () => {
      instance.destroy();
      cy.current = null;
    };
  }, [initial, refreshInfo]);

  // Colors follow the light / dark theme.
  useEffect(() => {
    const c = cy.current;
    if (!c) return;
    const fg = css("--fg") || (dark ? "#dde1e7" : "#1d2129");
    const muted = css("--muted") || "#8b93a1";
    const bg = css("--bg") || (dark ? "#1b1d22" : "#fff");
    const accent = css("--accent") || "#2563eb";
    c.style([
      {
        selector: "node",
        style: {
          "background-color": "data(color)",
          label: "data(caption)",
          width: 34,
          height: 34,
          color: fg,
          "font-size": 10,
          "text-valign": "bottom",
          "text-margin-y": 4,
          "text-max-width": "90px",
          "text-wrap": "ellipsis",
          "text-outline-color": bg,
          "text-outline-width": 2,
          "border-width": 2,
          "border-color": bg,
        },
      },
      { selector: "node[stub = 1]", style: { "background-opacity": 0.25, "border-style": "dashed", "border-color": muted } },
      {
        selector: "edge",
        style: {
          width: 1.5,
          "line-color": muted,
          "target-arrow-color": muted,
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "data(type)",
          "font-size": 8,
          color: muted,
          "text-rotation": "autorotate",
          "text-background-color": bg,
          "text-background-opacity": 1,
          "text-background-padding": "1px",
        },
      },
      { selector: ":selected", style: { "border-color": accent, "border-width": 3, "line-color": accent, "target-arrow-color": accent } },
    ]);
  }, [dark, initial]);

  /** Adds a node's neighbours (double-click or the Expand button). */
  const expand = useCallback(
    async (id: string) => {
      const c = cy.current;
      if (!c) return;
      setMessage("Expanding…");
      try {
        const r = await api.cypher(
          "MATCH (n)-[r]-(m) WHERE elementId(n) = $id RETURN n, r, m LIMIT 100",
          database,
          100,
          { id },
        );
        const before = new Set(graph.current.nodes.keys());
        const beforeRels = new Set(graph.current.rels.keys());
        // The expanded node is now known in full, not as a stub.
        addRows(graph.current, r.rows);
        const added: ElementDefinition[] = [];
        for (const n of graph.current.nodes.values()) {
          if (!before.has(n.id)) added.push(nodeElement(n));
          else if (c.getElementById(n.id).data("stub") && !n.stub) c.getElementById(n.id).data({ stub: 0, caption: caption(n), color: labelColor(n.labels[0]) });
        }
        for (const rel of graph.current.rels.values()) if (!beforeRels.has(rel.id)) added.push(relElement(rel));
        const center = c.getElementById(id).position();
        const newNodes = c.add(added.map((e) => (e.group === "nodes" ? { ...e, position: { x: center.x + (Math.random() - 0.5) * 80, y: center.y + (Math.random() - 0.5) * 80 } } : e)));
        // Only the new nodes move: everything already placed stays where the user saw it.
        const placed = c.nodes().not(newNodes.nodes());
        placed.lock();
        c.layout({ name: "cose", animate: false, randomize: false, fit: false, nodeDimensionsIncludeLabels: true }).run();
        placed.unlock();
        refreshInfo();
        setMessage(added.length ? null : "No new neighbours.");
      } catch (e) {
        setMessage((e as Error).message);
      }
    },
    [database, refreshInfo],
  );

  useEffect(() => {
    const c = cy.current;
    if (!c) return;
    const handler = (e: cytoscape.EventObject) => expand(e.target.id());
    c.on("dbltap", "node", handler);
    return () => {
      c.off("dbltap", "node", handler);
    };
  }, [expand, initial]);

  return (
    <div className="graph-view">
      <div className="graph-canvas">
        <div ref={container} className="graph-cy" />
        <div className="graph-tools">
          <button title="Fit to view (double-click a node to expand it)" onClick={() => cy.current?.fit(undefined, 30)}>
            ⤢ Fit
          </button>
          <button title="Lay out again" onClick={() => cy.current?.layout({ name: "cose", animate: false, nodeDimensionsIncludeLabels: true, padding: 30 }).run()}>
            ⟳ Layout
          </button>
          <span className="muted">
            {counts.nodes} nodes · {counts.rels} relationships
          </span>
          {message && <span className="warn">{message}</span>}
        </div>
        <div className="graph-legend">
          {legend.map(([label, n]) => (
            <span key={label} className="chip">
              <span className="dot" style={{ background: label.startsWith("(") ? "transparent" : labelColor(label), borderColor: labelColor(label.startsWith("(") ? undefined : label) }} />
              {label} <span className="muted">{n}</span>
            </span>
          ))}
        </div>
      </div>
      {selected && (
        <aside className="graph-inspector">
          {selected.kind === "node" ? (
            <>
              <div className="insp-head">
                {selected.node.labels.length ? (
                  selected.node.labels.map((l) => (
                    <span key={l} className="chip" style={{ borderColor: labelColor(l) }}>
                      <span className="dot" style={{ background: labelColor(l) }} />
                      {l}
                    </span>
                  ))
                ) : (
                  <span className="muted">{selected.node.stub ? "Not returned by the query" : "No labels"}</span>
                )}
              </div>
              <Props entries={selected.node.properties} id={selected.node.id} />
              <button onClick={() => expand(selected.node.id)}>Expand neighbours</button>
            </>
          ) : (
            <>
              <div className="insp-head">
                <span className="chip">:{selected.rel.type}</span>
              </div>
              <Props entries={selected.rel.properties} id={selected.rel.id} />
            </>
          )}
        </aside>
      )}
    </div>
  );
}

function Props({ entries, id }: { entries: Record<string, unknown>; id: string }) {
  return (
    <table className="insp-props">
      <tbody>
        <tr>
          <th>elementId</th>
          <td>{id}</td>
        </tr>
        {Object.entries(entries).map(([k, v]) => (
          <tr key={k}>
            <th>{k}</th>
            <td>{formatValue(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
