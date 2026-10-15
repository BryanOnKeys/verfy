/**
 * The Verfy mark: a shield with a V cut into its top, split down the middle. The shield is the control Verfy puts
 * around an agent; the V is the check it leaves behind. The left half takes the text colour (ink on paper, ivory at
 * night) and the right half takes the accent, so the mark follows the theme.
 * src/app/icon.svg and public/verfy-mark.svg are the same drawing on an ink tile, for favicons and app icons.
 */
export const MARK_PATHS = {
  left: "M8 10H24L31 30V58.5C17.5 52.5 8 42.5 8 28.5Z",
  right: "M33 30L40 10H56V28.5C56 42.5 46.5 52.5 33 58.5Z",
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
      <path className="logo-base" d={MARK_PATHS.left} fill="currentColor" />
      <path className="logo-cap" d={MARK_PATHS.right} />
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
