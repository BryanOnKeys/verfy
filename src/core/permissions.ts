/**
 * The role matrix. The database enforces it (RLS policies and the role checks
 * inside every SECURITY DEFINER function); this copy drives the UI (which
 * controls to show) and the API's early checks, and is tested against the
 * same expectations as supabase/tests/rls.test.ts.
 */

export const ROLES = ["owner", "admin", "member", "auditor"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  "receipts.read": ["owner", "admin", "member", "auditor"],
  "chains.verify": ["owner", "admin", "member", "auditor"],
  "policies.read": ["owner", "admin", "member", "auditor"],
  "policies.publish": ["owner", "admin"],
  "policies.simulate": ["owner", "admin", "member", "auditor"],
  "locks.read": ["owner", "admin", "member", "auditor"],
  "locks.decide": ["owner", "admin"],
  "approvals.read": ["owner", "admin", "member", "auditor"],
  "approvals.decide": ["owner", "admin"],
  "notifications.manage": ["owner", "admin"],
  "devices.read": ["owner", "admin", "member", "auditor"],
  "devices.enroll": ["owner", "admin"],
  "devices.revoke": ["owner", "admin"],
  "members.read": ["owner", "admin", "member", "auditor"],
  "members.invite": ["owner", "admin"],
  "members.manage": ["owner", "admin"],
  "audit.read": ["owner", "admin", "auditor"],
  "exports.create": ["owner", "admin", "auditor"],
  "exports.read": ["owner", "admin", "auditor"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return role != null && (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
