"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile, shown only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. The widget adds a hidden
 * `cf-turnstile-response` field to the form it sits in; the Server Action passes that token to Supabase Auth, which
 * verifies it. A token can be used once, so the widget resets whenever the form returns a new result.
 */

interface Turnstile {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile_unavailable"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export const CAPTCHA_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export function Captcha({ resetOn }: { resetOn?: unknown }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    load()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action: "auth",
          theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
          size: "flexible",
        });
      })
      .catch(() => {
        if (box.current) box.current.textContent = "The security check could not load. Check your connection or disable content blockers, then reload.";
      });
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (widget.current) window.turnstile?.reset(widget.current);
  }, [resetOn]);

  if (!siteKey) return null;
  return <div ref={box} className="captcha" aria-label="Security check" />;
}
