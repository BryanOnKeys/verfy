import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { NotConfigured } from "@/components/states";
import { isConfigured } from "@/lib/env";
import { currentOrg, listMyOrgs, requireUser } from "@/server/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured()) {
    return (
      <main id="main" className="shell section">
        <NotConfigured />
      </main>
    );
  }
  const { user } = await requireUser();
  const [orgs, current] = await Promise.all([listMyOrgs(), currentOrg()]);
  return (
    <AppShell orgs={orgs.map(({ id, name, role }) => ({ id, name, role }))} current={current ? { id: current.id, name: current.name, role: current.role } : null} email={user.email}>
      {children}
    </AppShell>
  );
}
