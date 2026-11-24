"use client";

export function BackToTop() {
  return (
    <button type="button" className="gbtn glass" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
