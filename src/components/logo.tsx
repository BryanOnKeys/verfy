/**
 * The Verfy mark: a "V" laid in three courses that narrow to a blue point. The courses are the records Verfy keeps,
 * each one carrying the one above it; the point is the seal where the chain is checked. The courses take the text
 * colour (ink on paper, ivory at night) and the point takes the accent, so the mark follows the theme.
 * src/app/icon.svg and public/verfy-mark.svg are the same drawing on an ink tile, for favicons and app icons.
 */
export const MARK_PATHS = {
  cap: "M32 59L39.25 44.5H24.75z",
  mid: "M21.75 38.5H42.25L47.75 27.5H16.25z",
  base: "M13.25 21.5H50.75L59 5H40.5L32 17.5 23.5 5H5z",
} as const;

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
      <path className="logo-base" d={MARK_PATHS.base} fill="currentColor" />
      <path className="logo-mid" d={MARK_PATHS.mid} fill="currentColor" />
      <path className="logo-cap" d={MARK_PATHS.cap} />
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
