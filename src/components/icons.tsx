import type { SVGProps } from "react";

/** A small, consistent icon set (24px grid, 1.75 stroke). Decorative by default. */
const PATHS = {
  shield: "M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z",
  shieldCheck: "M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z M9 12l2 2 4-4",
  scan: "M4 8V6a2 2 0 012-2h2 M16 4h2a2 2 0 012 2v2 M20 16v2a2 2 0 01-2 2h-2 M8 20H6a2 2 0 01-2-2v-2 M7 12h10",
  lock: "M6 11h12v9H6z M8 11V8a4 4 0 118 0v3",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1 M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  arrowRight: "M5 12h14 M13 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12 M18 6L6 18",
  alert: "M12 4l9 16H3z M12 10v4 M12 17.5v.01",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18z M12 11v5 M12 8v.01",
  terminal: "M4 5h16v14H4z M7 9l3 3-3 3 M12 15h5",
  users: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5 M16 4.5a3.5 3.5 0 010 6.5 M18 14.5c1.8.6 3 2.5 3.3 5.5",
  device: "M4 5h16v11H4z M2 19h20 M9 16v3 M15 16v3",
  file: "M7 3h7l5 5v13H7z M14 3v5h5",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18z M12 7v5l3 2",
  sun: "M12 17a5 5 0 100-10 5 5 0 000 10z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z",
  menu: "M4 7h16 M4 12h16 M4 17h16",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6",
  gauge: "M4 18a8 8 0 1116 0 M12 18l4-6",
  policy: "M5 4h14v16H5z M9 9h6 M9 13h6 M9 17h3",
  download: "M12 4v12 M7 11l5 5 5-5 M5 20h14",
  history: "M3 12a9 9 0 103-6.7 M3 4v5h5 M12 8v4l3 2",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18z M3 12h18 M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z",
  key: "M15 9a3 3 0 11-6 0 3 3 0 016 0z M12 12v9 M12 17h3 M12 20h2",
  logout: "M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14z M20 20l-4-4",
  github: "M9 19c-4 1.5-4-2-6-2.5m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.3 4.3 0 00-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 00-6 0C6.8 2.3 5.8 2.6 5.8 2.6a4.3 4.3 0 00-.1 3.2A4.6 4.6 0 004.4 9c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  mail: "M4 6h16v12H4z M4 7l8 6 8-6",
  arrowUpRight: "M7 17L17 7 M8 7h9v9",
  eye: "M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z M12 15a3 3 0 100-6 3 3 0 000 6z",
  bolt: "M13 3L5 13.5h6L10 21l8-10.5h-6z",
  cpu: "M7 7h10v10H7z M10 3v4 M14 3v4 M10 17v4 M14 17v4 M3 10h4 M3 14h4 M17 10h4 M17 14h4",
  hand: "M8 13V6.5a1.5 1.5 0 013 0V12 M11 11.5V5a1.5 1.5 0 013 0v6.5 M14 11.5V6.5a1.5 1.5 0 013 0V14c0 4-2.5 7-6.5 7S5 18.5 4 16l-1.6-3.3a1.4 1.4 0 012.4-1.4L8 15",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, label, ...rest }: { name: IconName; size?: number; label?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

