/**
 * The Verfy mark: two chain links that lean together into a "V". The links are the receipts Verfy chains to each
 * other; the second one is drawn over the first, the way each receipt holds the hash of the one before it. The first
 * link takes the text colour (ink on paper, ivory at night) and the second takes the accent, so the mark follows the
 * theme. src/app/icon.svg and public/verfy-mark.svg are the same drawing on an ink tile, for favicons and app icons.
 */
const LINK = { x: -8, y: -23, width: 16, height: 46, rx: 8, strokeWidth: 6.5, fill: "none" } as const;
export const MARK_LINKS = { first: "translate(21 29) rotate(-22)", second: "translate(43 29) rotate(22)" } as const;

export function LogoMark({ size = 32, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={["logo-mark", className ?? ""].join(" ").trim()}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {/* the classes sit on groups: CSS animates their transform, which would replace a rect's own rotation */}
      <g className="logo-base" stroke="currentColor">
        <rect {...LINK} transform={MARK_LINKS.first} />
      </g>
      <g className="logo-cap">
        <rect {...LINK} transform={MARK_LINKS.second} />
      </g>
    </svg>
  );
}

/** The mark with the wordmark, as used in the header, footer and dashboard. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <>
      <LogoMark size={size} className="brand-mark" />
      <span className="brand-word">Verfy</span>
    </>
  );
}
