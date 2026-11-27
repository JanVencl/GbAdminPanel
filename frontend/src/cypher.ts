import { StreamLanguage } from "@codemirror/language";
import { cypher } from "@codemirror/legacy-modes/mode/cypher";
import { CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";
import type { Schema } from "./api";

export const cypherLanguage = StreamLanguage.define(cypher);

const KEYWORDS = [
  "MATCH", "OPTIONAL MATCH", "WHERE", "RETURN", "WITH", "UNWIND", "ORDER BY", "SKIP", "LIMIT",
  "CREATE", "MERGE", "ON CREATE SET", "ON MATCH SET", "SET", "REMOVE", "DELETE", "DETACH DELETE",
  "CALL", "YIELD", "UNION", "UNION ALL", "DISTINCT", "AS", "AND", "OR", "NOT", "XOR", "IN",
  "IS NULL", "IS NOT NULL", "STARTS WITH", "ENDS WITH", "CONTAINS", "CASE", "WHEN", "THEN",
  "ELSE", "END", "EXISTS", "COUNT", "FOREACH", "USE", "EXPLAIN", "PROFILE",
  "SHOW DATABASES", "SHOW INDEXES", "SHOW CONSTRAINTS", "SHOW USERS", "SHOW ROLES",
  "SHOW TOKENS", "SHOW TRANSACTIONS", "SHOW SETTINGS", "SHOW PROCEDURES", "SHOW FUNCTIONS",
  "CREATE DATABASE", "DROP DATABASE", "CREATE INDEX", "DROP INDEX", "CREATE CONSTRAINT",
  "DROP CONSTRAINT", "CREATE USER", "DROP USER", "GRANT ROLE", "REVOKE ROLE",
];

const FUNCTIONS = [
  "count", "collect", "sum", "avg", "min", "max", "size", "length", "labels", "type", "id",
  "elementId", "keys", "properties", "nodes", "relationships", "coalesce", "toString",
  "toInteger", "toFloat", "toLower", "toUpper", "trim", "split", "substring", "replace",
  "range", "head", "last", "tail", "exists", "date", "datetime", "duration", "timestamp",
];

/** Autocomplete from keywords, functions and the schema of the tab's database. */
export function cypherCompletions(getSchema: () => Schema | undefined) {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[\w$`]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const before = context.state.sliceDoc(Math.max(0, word.from - 1), word.from);
    const schema = getSchema();
    let options: Completion[];
    if (before === ":") {
      options = [
        ...(schema?.labels ?? []).map((l) => ({ label: l, type: "class", detail: "label" })),
        ...(schema?.relationshipTypes ?? []).map((t) => ({ label: t, type: "interface", detail: "relationship" })),
      ];
    } else if (before === ".") {
      options = (schema?.propertyKeys ?? []).map((p) => ({ label: p, type: "property" }));
    } else {
      options = [
        ...KEYWORDS.map((k) => ({ label: k, type: "keyword" })),
        ...FUNCTIONS.map((f) => ({ label: f, type: "function", apply: `${f}(` })),
        ...(schema?.propertyKeys ?? []).map((p) => ({ label: p, type: "property" })),
      ];
    }
    return { from: word.from, options, validFor: /^[\w$`]*$/ };
  };
}
