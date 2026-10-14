import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Runs the real migrations on PGlite (Postgres compiled to WebAssembly) with a
 * small shim for the parts Supabase provides: the anon / authenticated /
 * service_role roles, auth.users, auth.uid(), auth.jwt() and storage.buckets.
 * Default privileges mirror Supabase (every role gets ALL on new public
 * objects), so the migration's own REVOKEs and RLS policies are what is tested.
 *
 * This does not replace running `supabase test db` against a real project; it
 * lets CI prove tenant isolation without Docker.
 */

const SHIM = readFileSync(path.join(__dirname, "shim.sql"), "utf8");

export const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SHIM);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

export interface Actor {
  role: "anon" | "authenticated" | "service_role";
  id?: string;
  email?: string;
  /** authenticator assurance level of the session (Supabase puts it in the JWT); defaults to aal1 */
  aal?: "aal1" | "aal2";
}

/** Run `fn` as a Supabase role, the way PostgREST would, inside a transaction. */
export async function as<T>(db: PGlite, actor: Actor, fn: (q: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`, [
      actor.id ?? "",
      JSON.stringify(actor.id ? { sub: actor.id, email: actor.email ?? "", role: actor.role, aal: actor.aal ?? "aal1" } : { role: actor.role }),
    ]);
    await tx.exec(`set local role ${actor.role}`);
    const q = async <R,>(sql: string, params: unknown[] = []) => (await tx.query<R>(sql, params)).rows;
    return fn(q);
  });
}

export async function addUser(db: PGlite, id: string, email: string): Promise<Actor> {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return { role: "authenticated", id, email };
}

export const service: Actor = { role: "service_role" };
export const anon: Actor = { role: "anon" };
