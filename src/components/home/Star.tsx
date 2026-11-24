/* The reference sets an asterisk glyph between headline words; ours is a six-point spark drawn for this site. */
export function Star() {
  return (
    <svg className="star" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1v22M2.5 6.5l19 11M21.5 6.5l-19 11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
