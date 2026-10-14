"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Page-wide motion, kept deliberately calm. Everything here is an enhancement: without JavaScript every element is
 * visible and still, and with prefers-reduced-motion nothing moves. The root layout sets html[data-fx] before the first
 * paint (and removes it again if this file never runs), so sections that fade in start hidden instead of flashing.
 *
 *  - `.reveal`, `.stagger`, `.steps`, `.flow`, `.section-rule`: get `.is-in` once, when they first scroll into view
 *    (fade up, cards in order, lines and rules draw, packets start).
 *  - `.site-header`: gets `.is-scrolled` (a hairline appears under it).
 *  - `details.faq-item`: opens and closes smoothly instead of jumping.
 */
export function Effects() {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.dataset.fxReady = "1";
    const motion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: (() => void)[] = [];

    const targets = Array.from(document.querySelectorAll(".reveal, .stagger, .steps, .flow, .section-rule")).filter((el) => !el.classList.contains("is-in"));
    if (!motion || !("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("is-in"));
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              e.target.classList.add("is-in");
              io.unobserve(e.target);
            }
          }
        },
        { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
      );
      targets.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    }

    if (motion) {
      document.querySelectorAll<HTMLDetailsElement>("details.faq-item").forEach((d) => {
        const summary = d.querySelector("summary");
        const body = d.querySelector<HTMLElement>(".faq-body");
        if (!summary || !body) return;
        let anim: Animation | null = null;
        const onClick = (e: Event) => {
          e.preventDefault();
          anim?.cancel();
          if (!d.open || d.classList.contains("is-closing")) {
            d.classList.remove("is-closing");
            d.open = true;
            anim = body.animate({ height: ["0px", `${body.scrollHeight}px`], opacity: [0, 1] }, { duration: 320, easing: "cubic-bezier(.2,.7,.2,1)" });
          } else {
            d.classList.add("is-closing");
            anim = body.animate({ height: [`${body.offsetHeight}px`, "0px"], opacity: [1, 0] }, { duration: 240, easing: "cubic-bezier(.65,0,.35,1)" });
            anim.onfinish = () => {
              d.open = false;
              d.classList.remove("is-closing");
            };
          }
        };
        summary.addEventListener("click", onClick);
        cleanups.push(() => summary.removeEventListener("click", onClick));
      });
    }

    return () => cleanups.forEach((f) => f());
  }, [pathname]);

  useEffect(() => {
    let pending = 0;
    const sync = () => {
      pending = 0;
      document.querySelector(".site-header")?.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    const onScroll = () => {
      if (!pending) pending = requestAnimationFrame(sync);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    sync();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(pending);
    };
  }, []);

  return null;
}
