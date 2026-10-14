import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isConfigured } from "@/lib/env";
import { getSessionUser } from "@/server/session";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // a session still waiting for its second factor is not "signed in" for navigation purposes
  const session = isConfigured() ? await getSessionUser() : null;
  const signedIn = Boolean(session?.user && !session.mfaPending);
  return (
    <>
      <SiteHeader signedIn={signedIn} />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
