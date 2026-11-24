/* App-page header in the reference's language: huge two-line light heading that slides up line by line, a muted lead under it. */
export function PageHead({ eyebrow, lines, children }: { eyebrow?: React.ReactNode; lines: string[]; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden pt-32 pb-12 sm:pt-40">
      <div className="beam" aria-hidden="true" />
      <div className="wrap relative">
        {eyebrow ? <div className="mb-6 flex flex-wrap items-center gap-2">{eyebrow}</div> : null}
        <h1 className="t-display" data-lines="">
          {lines.map((l, i) => (
            <span className="ln" key={l} style={{ "--i": i } as React.CSSProperties}>
              <span>{l}</span>
            </span>
          ))}
        </h1>
        {children ? (
          <div className="t-lead mt-8 max-w-[640px]" data-reveal="" style={{ "--delay": "200ms" } as React.CSSProperties}>
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Feature status chip: Prototype = really runs, Concept = planned. */
export function Status({ kind }: { kind: "prototype" | "concept" | "sample" | "live" }) {
  const map = { prototype: ["proto", "Prototype"], concept: ["concept", "Concept"], sample: ["sample", "Sample data"], live: ["live", "Live data"] } as const;
  const [c, t] = map[kind];
  return <span className={`badge ${c}`}>{t}</span>;
}
