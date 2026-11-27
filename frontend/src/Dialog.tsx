import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { api, QueryResult } from "./api";
import { cypherLanguage } from "./cypher";
import ResultTable from "./ResultTable";

type Base = { name: string; label: string; help?: string; when?: (v: Values) => boolean };

export type Field =
  | (Base & { kind: "text"; required?: boolean; placeholder?: string; suggestions?: string[] })
  | (Base & { kind: "password"; required?: boolean })
  | (Base & { kind: "number"; required?: boolean; min?: number; max?: number })
  | (Base & { kind: "select"; options: { value: string; label: string }[] })
  | (Base & { kind: "checkbox" })
  | (Base & { kind: "checkboxes"; options: string[] });

export type Values = Record<string, string | number | boolean | string[]>;

export type Statement = { query: string; params?: Record<string, unknown> };

export type Built = { database: string | null; statements: Statement[] } | { error: string };

export type DialogSpec = {
  title: string;
  /** One line about what the command does. */
  description?: string;
  fields: Field[];
  initial?: Values;
  build: (v: Values) => Built;
  danger?: boolean | ((v: Values) => boolean);
  /** The user must type this (an object's name) before a destructive command runs. */
  confirm?: string;
  executeLabel?: string;
  /** Keep the dialog open to show what the command returned (CREATE TOKEN). */
  showResult?: boolean;
  /** Called after every statement ran. */
  onDone?: (results: QueryResult[]) => void;
};

type Props = {
  spec: DialogSpec;
  dark: boolean;
  onClose: () => void;
  onOpenEditor: (title: string, database: string | null, query: string) => void;
  onNotify: (message: string, kind?: "ok" | "error") => void;
};

function initialValues(spec: DialogSpec): Values {
  const v: Values = {};
  for (const f of spec.fields) {
    if (f.kind === "checkbox") v[f.name] = false;
    else if (f.kind === "checkboxes") v[f.name] = [];
    else if (f.kind === "select") v[f.name] = f.options[0]?.value ?? "";
    else v[f.name] = "";
  }
  return { ...v, ...spec.initial };
}

/** Shows the Cypher a form makes, with $parameters masked. */
function preview(built: Built): string {
  if ("error" in built) return `// ${built.error}`;
  return built.statements
    .map((s) => {
      const params = Object.keys(s.params ?? {});
      const note = params.length ? `// with ${params.map((p) => `$${p}`).join(", ")} (sent as parameters)\n` : "";
      return `${note}${s.query};`;
    })
    .join("\n\n");
}

export default function Dialog({ spec, dark, onClose, onOpenEditor, onNotify }: Props) {
  const [values, setValues] = useState<Values>(() => initialValues(spec));
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<QueryResult[] | null>(null);
  const firstField = useRef<HTMLElement | null>(null);

  const built = useMemo(() => spec.build(values), [spec, values]);
  const danger = typeof spec.danger === "function" ? spec.danger(values) : !!spec.danger;
  const missing = spec.fields.some(
    (f) => (f.when?.(values) ?? true) && "required" in f && f.required && String(values[f.name] ?? "").trim() === "",
  );
  const hasParams = !("error" in built) && built.statements.some((s) => s.params && Object.keys(s.params).length);
  const confirmed = !spec.confirm || confirmText === spec.confirm;
  const canRun = !running && !missing && !("error" in built) && confirmed && !results;

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose, running]);

  const set = (name: string, value: Values[string]) => setValues((v) => ({ ...v, [name]: value }));

  const execute = async () => {
    if (!canRun || "error" in built) return;
    setRunning(true);
    setError(null);
    const out: QueryResult[] = [];
    try {
      for (const s of built.statements) {
        out.push(await api.cypher(s.query, built.database, 1000, s.params ?? {}));
      }
      spec.onDone?.(out);
      if (spec.showResult) {
        setResults(out);
      } else {
        const counters = out.flatMap((r) => Object.entries(r.summary.counters).map(([k, v]) => `${k} ${v}`));
        onNotify(`${spec.title}: done${counters.length ? ` · ${counters.join(" · ")}` : ""}`);
        onClose();
      }
    } catch (e) {
      // Statements that ran before the failure stay done; say so.
      const done = out.length ? ` (${out.length} of ${built.statements.length} statements ran)` : "";
      setError(`${(e as Error).message}${done}`);
      if (out.length) spec.onDone?.(out);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={spec.title}>
        <div className="dialog-head">
          <h2>{spec.title}</h2>
          <button className="icon" aria-label="Close" onClick={onClose} disabled={running}>
            ×
          </button>
        </div>
        <form
          className="dialog-body"
          onSubmit={(e) => {
            e.preventDefault();
            execute();
          }}
        >
          {spec.description && <p className="muted desc">{spec.description}</p>}
          {!results && (
            <div className="fields">
              {spec.fields
                .filter((f) => f.when?.(values) ?? true)
                .map((f, i) => (
                  <FieldInput
                    key={f.name}
                    field={f}
                    value={values[f.name]}
                    onChange={(v) => set(f.name, v)}
                    inputRef={
                      i === 0 && !spec.confirm
                        ? (el) => {
                            firstField.current = el;
                          }
                        : undefined
                    }
                  />
                ))}
              {spec.confirm && (
                <label className="field">
                  <span>
                    Type <b>{spec.confirm}</b> to confirm
                  </span>
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    ref={(el) => {
                      // Destructive dialogs start in the confirmation box.
                      firstField.current = el;
                    }}
                    autoComplete="off"
                  />
                </label>
              )}
            </div>
          )}
          {results ? (
            <div className="dialog-result">
              {results
                .flatMap((r) => r.rows)
                .filter((row) => typeof row.token === "string")
                .map((row, i) => (
                  <Secret key={i} value={String(row.token)} />
                ))}
              <p className="warn">Copy it now: it is not shown again.</p>
              {results.map((r, i) => (
                <ResultTable key={i} result={{ ...r, columns: r.columns.filter((c) => c !== "token") }} />
              ))}
            </div>
          ) : (
            <div className="dialog-preview">
              <div className="preview-label">Cypher</div>
              <CodeMirror
                value={preview(built)}
                editable={false}
                theme={dark ? "dark" : "light"}
                extensions={[cypherLanguage]}
                basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
              />
            </div>
          )}
          {error && <pre className="error dialog-error">{error}</pre>}
          <div className="dialog-foot">
            {!results && (
              <button
                type="button"
                disabled={"error" in built || hasParams}
                title={hasParams ? "Contains parameters such as a password; run it from here" : "Open in a query editor without running"}
                onClick={() => {
                  if ("error" in built) return;
                  onOpenEditor(spec.title, built.database, preview(built));
                  onClose();
                }}
              >
                Open in editor
              </button>
            )}
            <span className="spacer" />
            <button type="button" onClick={onClose} disabled={running}>
              {results ? "Close" : "Cancel"}
            </button>
            {!results && (
              <button type="submit" className={danger ? "danger-btn" : "primary"} disabled={!canRun}>
                {running ? "Running…" : (spec.executeLabel ?? "Execute")}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Secret({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="secret">
      <code>{value}</code>
      <button
        type="button"
        onClick={() =>
          navigator.clipboard.writeText(value).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function FieldInput({
  field: f,
  value,
  onChange,
  inputRef,
}: {
  field: Field;
  value: Values[string];
  onChange: (v: Values[string]) => void;
  inputRef?: (el: HTMLElement | null) => void;
}) {
  const id = `f-${f.name}`;
  const help = f.help && <small className="muted">{f.help}</small>;
  if (f.kind === "checkbox") {
    return (
      <label className="field check">
        <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} ref={inputRef} />
        <span>{f.label}</span>
        {help}
      </label>
    );
  }
  if (f.kind === "checkboxes") {
    const list = (value as string[]) ?? [];
    return (
      <fieldset className="field">
        <legend>{f.label}</legend>
        <div className="checks">
          {f.options.map((o) => (
            <label key={o} className="check">
              <input
                type="checkbox"
                checked={list.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...list, o] : list.filter((x) => x !== o))}
              />
              {o}
            </label>
          ))}
        </div>
        {help}
      </fieldset>
    );
  }
  return (
    <label className="field" htmlFor={id}>
      <span>
        {f.label}
        {"required" in f && f.required && <span className="req"> *</span>}
      </span>
      {f.kind === "select" ? (
        <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)} ref={inputRef}>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            id={id}
            type={f.kind}
            value={String(value ?? "")}
            min={f.kind === "number" ? f.min : undefined}
            max={f.kind === "number" ? f.max : undefined}
            placeholder={f.kind === "text" ? f.placeholder : undefined}
            list={f.kind === "text" && f.suggestions ? `${id}-list` : undefined}
            autoComplete={f.kind === "password" ? "new-password" : "off"}
            onWheel={f.kind === "number" ? (e) => e.currentTarget.blur() : undefined}
            onChange={(e) => onChange(e.target.value)}
            ref={inputRef}
          />
          {f.kind === "text" && f.suggestions && (
            <datalist id={`${id}-list`}>
              {f.suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </>
      )}
      {help}
    </label>
  );
}
