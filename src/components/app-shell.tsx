"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/app/auth/actions";
import type { Permission, Role } from "@/core/permissions";
import { can } from "@/core/permissions";
import { Icon, type IconName } from "./icons";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

interface Org {
  id: string;
  name: string;
  role: Role;
}

const NAV: { href: string; label: string; icon: IconName; perm?: Permission }[] = [
  { href: "/dashboard", label: "Overview", icon: "gauge" },
  { href: "/dashboard/receipts", label: "Receipts", icon: "receipt", perm: "receipts.read" },
  { href: "/dashboard/policies", label: "Policies", icon: "policy", perm: "policies.read" },
  { href: "/dashboard/locks", label: "Locks", icon: "lock", perm: "locks.read" },
  { href: "/dashboard/devices", label: "Devices", icon: "device", perm: "devices.read" },
  { href: "/dashboard/team", label: "Team", icon: "users", perm: "members.read" },
  { href: "/dashboard/audit-log", label: "Audit log", icon: "history", perm: "audit.read" },
  { href: "/dashboard/exports", label: "Exports", icon: "download", perm: "exports.read" },
];

export function AppShell({ orgs, current, email, children }: { orgs: Org[]; current: Org | null; email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // the menu belongs to the page it was opened on, so navigating closes it
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => setOpenAt((typeof v === "function" ? v(open) : v) ? pathname : null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenAt(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function switchOrg(id: string) {
    document.cookie = `verfy_org=${id}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    router.refresh();
  }

  const isCurrent = (href: string) => (href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

  return (
    <div className="app">
      <div className="app-topbar">
        <button type="button" className="icon-btn" aria-label="Open navigation" aria-expanded={open} aria-controls="app-sidebar" onClick={() => setOpen(true)}>
          <Icon name="menu" />
        </button>
        <Link href="/dashboard" className="brand">
          <Logo size={26} />
        </Link>
        <span style={{ marginLeft: "auto" }}>
          <ThemeToggle />
        </span>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside id="app-sidebar" className="sidebar" data-open={open} aria-label="Dashboard">
        <div className="row-between">
          <Link href="/" className="brand" aria-label="Verfy home">
            <Logo size={26} />
          </Link>
          <button type="button" className="icon-btn app-close" aria-label="Close navigation" onClick={() => setOpen(false)} style={{ display: open ? undefined : "none" }}>
            <Icon name="x" />
          </button>
        </div>
        {orgs.length > 0 && current && (
          <div className="field">
            <label htmlFor="org-switch" className="tiny muted" style={{ fontWeight: 600 }}>
              Organization
            </label>
            <select id="org-switch" className="select input" value={current.id} onChange={(e) => switchOrg(e.target.value)}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} · {o.role}
                </option>
              ))}
            </select>
          </div>
        )}
        <nav aria-label="Dashboard sections">
          {NAV.filter((n) => !n.perm || (current && can(current.role, n.perm))).map((n) => (
            <Link key={n.href} href={n.href} aria-current={isCurrent(n.href) ? "page" : undefined}>
              <Icon name={n.icon} size={17} />
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <nav aria-label="Account">
            <Link href="/settings" aria-current={pathname === "/settings" ? "page" : undefined}>
              <Icon name="settings" size={17} />
              <span>Settings</span>
            </Link>
          </nav>
          <div className="row-between small" style={{ padding: "4px 6px" }}>
            <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }} title={email}>
              {email}
            </span>
            <ThemeToggle />
          </div>
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "flex-start" }}>
              <Icon name="logout" size={16} />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </aside>
      <main id="main" className="main">
        {children}
      </main>
    </div>
  );
}
