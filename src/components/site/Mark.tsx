/*
 * Gentpay's mark. Since 24 Nov 2026 it is the owner's "G" (public/brand/mark.webp, trimmed by referensi/tools/apply-owner-assets.mjs),
 * drawn as a CSS mask in currentColor so it follows the text colour on the dark site. MARK_PATH (a receipt glyph) is the earlier
 * generated placeholder, kept as the fallback when OWNER_MARK is false and for referensi/tools/make-assets.mjs.
 */
export const MARK_PATH =
  "M5.5 1.5h13a1.5 1.5 0 0 1 1.5 1.5v19.2l-2.67-1.7-2.66 1.7-2.67-1.7-2.67 1.7-2.66-1.7L4 22.2V3a1.5 1.5 0 0 1 1.5-1.5zM7.5 6.5v2.2h9V6.5zm0 5v2.2h5.5v-2.2z";

/** Set by the owner-asset step: true = draw public/brand/mark.webp (the owner's logo) as a currentColor mask instead of MARK_PATH. */
const OWNER_MARK = true;
const MARK_VERSION = "a2a1d109";

export function MarkGlyph({ size = 22, className = "" }: { size?: number; className?: string }) {
  if (OWNER_MARK) {
    const url = `url(/brand/mark.webp${MARK_VERSION ? `?v=${MARK_VERSION}` : ""})`;
    return <span aria-hidden="true" className={`block shrink-0 bg-current ${className}`} style={{ width: size, height: size, WebkitMask: `${url} center / contain no-repeat`, mask: `${url} center / contain no-repeat` }} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`block shrink-0 ${className}`}>
      <path d={MARK_PATH} fillRule="evenodd" />
    </svg>
  );
}

/** Wordmark: the mark + the name in lower case, like the reference's logotype. */
export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <MarkGlyph size={Math.round(size * 0.82)} />
      <span>gentpay</span>
    </span>
  );
}
