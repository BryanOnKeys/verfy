"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { href: "/features", label: "Product" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/advisories", label: "Advisories" },
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
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
  const current = (href: string) => (pathname === href || pathname.startsWith(href + "/") ? "page" : undefined);

  return (
    <header className="site-header">
      <div className="shell bar">
        <Link href="/" className="brand" aria-label="Verfy home">
          <Logo />
        </Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={current(l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          {signedIn ? (
            <Link href="/dashboard" className="btn btn-primary btn-sm hide-mobile">
              <span>Dashboard</span>
              <Icon name="arrowRight" size={15} className="arrow" />
            </Link>
          ) : (
            <>
              <Link href="/auth/sign-in" className="btn btn-ghost btn-sm hide-mobile">
                <span>Sign in</span>
              </Link>
              <Link href="/auth/sign-up" className="btn btn-primary btn-sm hide-mobile">
                <span>Get started</span>
                <Icon name="arrowRight" size={15} className="arrow" />
              </Link>
            </>
          )}
          <button
            type="button"
            className="icon-btn menu-toggle"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? "x" : "menu"} />
          </button>
        </div>
      </div>
      <nav id="mobile-nav" className="mobile-nav shell" aria-label="Main (mobile)" hidden={!open}>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={current(l.href)}>
            {l.label}
          </Link>
        ))}
        {signedIn ? (
          <Link href="/dashboard" className="mobile-cta">
            Dashboard
          </Link>
        ) : (
          <>
            <Link href="/auth/sign-in">Sign in</Link>
            <Link href="/auth/sign-up" className="mobile-cta">
              Get started
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
