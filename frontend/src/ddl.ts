/** Builds Cypher scripts for objects in the tree, the way SQL tools show an object's DDL. */

export function ident(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : "`" + name.replace(/`/g, "``") + "`";
}

function pattern(entityType: unknown, labelOrType: unknown): { pattern: string; v: string } {
  const name = ident(String(labelOrType ?? ""));
  return entityType === "RELATIONSHIP"
    ? { pattern: `()-[r:${name}]-()`, v: "r" }
    : { pattern: `(n:${name})`, v: "n" };
}

function props(v: string, properties: unknown): string[] {
  return Array.isArray(properties) ? properties.map((p) => `${v}.${ident(String(p))}`) : [];
}

function options(o: unknown): string {
  if (!o || typeof o !== "object" || Object.keys(o).length === 0) return "";
  return `\nOPTIONS ${JSON.stringify(o, null, 2).replace(/"([A-Za-z_][\w.]*)":/g, (_, k) => (k.includes(".") ? `\`${k}\`:` : `${k}:`))}`;
}

export function indexDdl(row: Record<string, unknown>): string {
  const name = ident(String(row.name));
  const { pattern: p, v } = pattern(row.entityType, row.labelOrType);
  const ps = props(v, row.properties);
  const type = String(row.type ?? "RANGE").toUpperCase();
  let create: string;
  if (type === "FULLTEXT") {
    create = `CREATE FULLTEXT INDEX ${name} FOR ${p} ON EACH [${ps.join(", ")}]`;
  } else if (type === "VECTOR") {
    create = `CREATE VECTOR INDEX ${name} FOR ${p} ON (${ps.join(", ")})`;
  } else {
    const kind = type === "RANGE" ? "" : `${type} `;
    create = `CREATE ${kind}INDEX ${name} FOR ${p} ON (${ps.join(", ")})`;
  }
  return `// Index ${row.name} (${type})\n${create}${options(row.options)};\n\n// DROP INDEX ${name};\n`;
}

export function constraintDdl(row: Record<string, unknown>): string {
  const name = ident(String(row.name));
  const { pattern: p, v } = pattern(row.entityType, row.label ?? row.labelOrType);
  const ps = props(v, row.properties);
  const target = ps.length === 1 ? ps[0] : `(${ps.join(", ")})`;
  const type = String(row.type ?? "").toUpperCase();
  let require: string;
  if (type.includes("UNIQUE")) require = `${target} IS UNIQUE`;
  else if (type.includes("KEY")) require = `${target} IS ${row.entityType === "RELATIONSHIP" ? "RELATIONSHIP" : "NODE"} KEY`;
  else if (type.includes("EXIST")) require = `${target} IS NOT NULL`;
  else if (type.includes("TYPE") && row.propertyType) require = `${target} IS :: ${row.propertyType}`;
  else require = `${target} /* ${type} */`;
  return `// Constraint ${row.name} (${type})\nCREATE CONSTRAINT ${name} FOR ${p} REQUIRE ${require};\n\n// DROP CONSTRAINT ${name};\n`;
}
