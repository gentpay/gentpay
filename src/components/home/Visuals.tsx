/* Product visuals drawn for this site (no images from the reference). Every number in them is sample data and says so. */

export function SampleBadge() {
  return <span className="badge sample">Sample data</span>;
}

export function TaskCardVisual() {
  return (
    <div className="card w-full max-w-[460px] p-5 shadow-[0_40px_80px_rgba(0,0,0,.5)]" data-noauto="">
      <div className="flex items-center justify-between gap-2">
        <span className="tag">
          <i /> Open
        </span>
        <SampleBadge />
      </div>
      <p className="mt-4 text-[24px] leading-tight">Weekly market research brief</p>
      <p className="t-small muted mt-1">Task #1 · agent 0x…a9e7 · ends in 3 days</p>
      <div className="mt-5 flex items-end justify-between">
        <span className="t-num text-[34px]">1.40</span>
        <span className="t-small muted">of 5.00 USDG</span>
      </div>
      <div className="meter mt-2">
        <i style={{ width: "28%" }} />
      </div>
      <div className="rows mt-5 text-[14px]">
        <div className="kv">
          <span>Chain snapshot API</span>
          <span className="t-num">0.40 / 1.00</span>
        </div>
        <div className="kv">
          <span>Filings search API</span>
          <span className="t-num">1.00 / 3.00</span>
        </div>
        <div className="kv">
          <span>Per-call cap</span>
          <span className="t-num">0.25</span>
        </div>
      </div>
    </div>
  );
}

export function CheckVisual() {
  return (
    <div className="card w-full max-w-[460px] p-5 shadow-[0_40px_80px_rgba(0,0,0,.5)]" data-noauto="">
      <div className="flex items-center justify-between gap-2">
        <span className="t-small muted">checkPay(task 1, provider 4, 3 units)</span>
        <SampleBadge />
      </div>
      <p className="mt-4 text-[24px] text-[var(--bad)]">Refused before signing</p>
      <ul className="mt-4 grid gap-2 text-[14px]">
        {[
          ["PROVIDER_NOT_APPROVED", "The owner has not approved this provider."],
          ["OVER_CALL_CAP", "6.00 USDG is above the 0.25 per-call cap."],
          ["OVER_BUDGET", "6.00 USDG is above the 3.60 left."],
        ].map(([k, w]) => (
          <li key={k} className="rounded-[12px] border border-[var(--line)] p-3">
            <span className="t-num text-[11.5px] text-[var(--bad)]">{k}</span>
            <span className="mt-1 block muted">{w}</span>
          </li>
        ))}
      </ul>
      <p className="t-small dim mt-4">Nothing moved. The dashboard keeps this refusal; a reverted transaction would leave no log.</p>
    </div>
  );
}

export function ReceiptVisual({ big = false }: { big?: boolean }) {
  return (
    <div className={`grid h-full w-full grid-cols-1 gap-6 p-6 ${big ? "sm:p-10 lg:grid-cols-[1.1fr_1fr]" : ""}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tag">
            <i /> Paid
          </span>
          <SampleBadge />
        </div>
        <p className={`mt-5 ${big ? "text-[clamp(36px,5vw,72px)]" : "text-[28px]"} leading-[0.95] tracking-[-0.02em]`}>Receipt #1042</p>
        <p className="t-lead mt-3 text-white/80">0.002 USDG for 1 call to the chain snapshot API, paid out of task #1.</p>
      </div>
      <div className="rows min-w-0 self-end text-[13.5px]">
        {[
          ["Task", "#1 · Weekly market research brief"],
          ["Provider", "#1 · payout 0x…b001"],
          ["Units × price", "1 × 0.002 USDG"],
          ["Request hash", "0x4f1c…9a2e"],
          ["Paid by", "owner 0x…a11ce (agent sent it)"],
          ["Block", "Robinhood Chain #122,000,000"],
        ].map(([k, v]) => (
          <div key={k} className="kv !border-white/15">
            <span className="!text-white/60">{k}</span>
            <span className="t-num">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Use-case card art: a gradient plate with a small UI fragment (no photos). */
export function UseCase({ title, dot, tone, line1, line2, price }: { title: string; dot: string; tone: string; line1: string; line2: string; price: string }) {
  return (
    <div className="relative h-[340px] w-[300px] overflow-hidden rounded-[16.5px] sm:h-[400px] sm:w-[360px]" style={{ background: tone }}>
      <div className="absolute inset-x-5 top-5 rounded-[14px] border border-white/15 bg-black/35 p-4 backdrop-blur-md">
        <p className="t-num text-[11.5px] text-white/60">GET {line1}</p>
        <p className="t-num mt-2 text-[12.5px] text-[var(--warn)]">402 · {price}</p>
        <p className="t-num mt-1 text-[12.5px] text-[var(--good)]">paid · 200 OK</p>
        <p className="t-small mt-3 text-white/70">{line2}</p>
      </div>
      <span className={`tag ${dot} absolute bottom-4 left-4`}>
        <i /> {title}
      </span>
    </div>
  );
}
