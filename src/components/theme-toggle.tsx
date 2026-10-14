"use client";

import type { MouseEvent } from "react";
import { THEME_COLOR, THEME_COOKIE } from "@/lib/theme";
import { Icon } from "./icons";

/**
 * Switches between light (the default) and dark. The choice is stored in a cookie, which the server reads to render
 * <html data-theme> on the next request, so a reload never flashes the wrong theme. Where the browser supports view
 * transitions, the new theme opens as a circle from the button; otherwise (or with reduced motion) it switches at once.
 */
export function ThemeToggle() {
  function toggle(e: MouseEvent<HTMLButtonElement>) {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    const apply = () => {
      root.dataset.theme = next;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[next]);
      document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    };
    if (typeof document.startViewTransition !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply();
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = document.startViewTransition(apply);
    transition.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 560, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" },
        );
      })
      .catch(() => {});
  }
  return (
    <button type="button" className="icon-btn theme-toggle" onClick={toggle} aria-label="Switch between light and dark theme" title="Switch theme">
      <Icon name="moon" className="moon" />
      <Icon name="sun" className="sun" />
    </button>
  );
}
