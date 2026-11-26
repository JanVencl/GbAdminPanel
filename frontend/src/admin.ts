import { createContext, useContext } from "react";
import type { DialogSpec } from "./Dialog";
import type { OpenRequest } from "./ObjectTree";

/** What tree menus and dialogs may do to the rest of the app. */
export type Admin = {
  openEditor: (req: OpenRequest) => void;
  openDialog: (spec: DialogSpec) => void;
  notify: (message: string, kind?: "ok" | "error") => void;
  /** Reload the given tree folders (by item key), if they are loaded. */
  refresh: (...keys: string[]) => void;
  /** Reload the database list the editor's database picker uses. */
  reloadDatabases: () => void;
  databases: string[];
  currentUser: string | null;
};

export const AdminContext = createContext<Admin | null>(null);

export function useAdmin(): Admin {
  const admin = useContext(AdminContext);
  if (!admin) throw new Error("AdminContext missing");
  return admin;
}

/** A Cypher string literal. */
export function str(s: string): string {
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
