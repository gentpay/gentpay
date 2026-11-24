import Link from "next/link";
import { BRAND, CHAIN } from "@/config/brand";
import { contractLive } from "@/config/contracts";
import { FAQ } from "@/lib/faq";
import { appLd, faqLd, pageMeta, HOME_DESCRIPTION, HOME_TITLE } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { Preloader } from "@/components/site/Preloader";
import { DragRow, Lines, Tabs } from "@/components/site/Fx";
import { Status } from "@/components/site/PageHead";
import { Star } from "@/components/home/Star";
import { HeroChainCard, StableStat } from "@/components/home/HomeLive";
import { CheckVisual, ReceiptVisual, SampleBadge, TaskCardVisual, UseCase } from "@/components/home/Visuals";

export const metadata = pageMeta({ path: "/", title: HOME_TITLE, description: HOME_DESCRIPTION });

const STEPS = [
  {
    title: "Create a task",
    text: "Pick a stablecoin, a budget, a deadline, a per-call cap and the providers the agent may pay, each with its own cap.",
    code: ["createTask(USDG, agent, 5.00, +3 days, 0.25,", "           providers [1, 2], caps [1.00, 3.00])", "→ task #1 · owner = you · nothing leaves your wallet yet"],
  },
  {
    title: "The agent asks",
    text: "The agent calls a provider's API. The provider answers 402 with its price, read from the contract.",
    code: ["GET /api/provider/sample?topic=chain", "← 402 Payment Required", "  price 0.002 USDG per unit · provider #1 · pay via task"],
  },
  {
    title: "The contract checks",
    text: "checkPay reads the price and what is left: budget, provider cap, per-call cap, deadline, pause, allowance. Every failing reason at once.",
    code: ["checkPay(task 1, provider 1, 1 unit, requestHash, max 0.002)", "→ reasons 0 · cost 0.002 · left 4.998", "  (a non-zero mask stops here: nothing is signed)"],
  },
  {
    title: "It pays",
    text: "pay() moves exactly the cost from the owner's wallet to the provider's payout address, in the same transaction. Fee-on-transfer tokens are refused.",
    code: ["pay(task 1, provider 1, 1, requestHash, 0.002)", "transferFrom(owner → provider payout, 0.002 USDG)", "→ Paid(receipt #1, task 1, provider 1)"],
  },
  {
    title: "Receipt, then data",
    text: "The agent retries with its receipt. The provider checks it on chain, serves the data once, and the dashboard adds the cost to the task.",
    code: ["GET … x-gentpay-receipt: 1:0x9c…", "← 200 OK · receipt #1 verified on chain", "task #1 spent 0.002 of 5.00 USDG"],
  },
];

const BENTO = [
  { t: "Cost per task", d: "Every receipt names its task, so the dashboard shows what each job cost, per provider, with explorer links.", s: "prototype" as const, light: true },
  { t: "Sample paid provider", d: "A real HTTP route on this site: 402 with an on-chain price, then live chain data once a receipt is verified.", s: "prototype" as const },
  { t: "Example agent", d: "examples/agent.mjs (viem): reads the price, checks the budget, pays, retries with the receipt.", s: "prototype" as const },
  { t: "Refusal log", d: "Refused requests are recorded with their reasons in the dashboard, because a reverted transaction leaves no log.", s: "prototype" as const },
  { t: "Provider directory", d: "Browsable list of registered providers with terms and uptime. Providers register on chain today; the directory is planned.", s: "concept" as const },
  { t: `${BRAND.symbol} utility`, d: "Planned only. Gentpay works without the token; nothing here needs it.", s: "concept" as const },
];

export default function Home() {
  return (
    <>
      <JsonLd data={[appLd, faqLd(FAQ)]} />
      <Preloader />

      {/* 1 — hero: huge light headline with a spark glyph, beam behind, intro + pill bottom-left, glass cards bottom-right */}
      <section className="relative flex min-h-[100svh] flex-col justify-between overflow-hidden pt-28 pb-24 sm:pt-32" data-testid="hero">
        <div className="beam" aria-hidden="true" />
        <div className="wrap relative">
          <div className="mb-6 flex flex-wrap gap-2" data-reveal="">
            <Status kind="prototype" />
            <span className="badge">{contractLive() ? "Contract live on Robinhood Chain" : "Contract not deployed yet"}</span>
            <span className="badge">Non-custodial</span>
          </div>
          <Lines
            as="h1"
            className="t-display max-w-[1250px]"
            lines={[
              "Agent payments with",
              <>
                task budgets <Star /> and
              </>,
              "clear receipts.",
            ]}
          />
        </div>
        <div className="wrap relative mt-14 grid grid-cols-1 items-end gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div data-reveal="" style={{ "--delay": "250ms" } as React.CSSProperties}>
            <p className="t-body max-w-[400px]">{BRAND.tagline} Your agent pays approved data and API providers per call, inside the budget you set, and every payment leaves a receipt that names its task.</p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Link href="/app" className="pill" data-testid="hero-cta">
                <span className="roll">
                  <span>Try practice mode</span>
                  <span aria-hidden="true">Try practice mode</span>
                </span>
              </Link>
              <a href="#how" className="gbtn glass" aria-label="How it works">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 3v10M4 9l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
            <p className="t-small dim mt-3">* No wallet and no token needed for practice mode.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end" data-reveal="" style={{ "--delay": "400ms" } as React.CSSProperties}>
            <div className="glass flex w-full flex-col justify-between p-4 sm:w-[240px]">
              <p className="t-small muted">A receipt for every call: task, provider, units, amount, request hash, block.</p>
              <Link href="/receipts" className="mt-4 inline-flex items-center gap-2 text-[13px]">
                Look up a receipt <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <HeroChainCard />
          </div>
        </div>
      </section>

      {/* 2 — sticky heading A */}
      <section className="stick relative overflow-hidden py-24 sm:py-32" id="how">
        <div className="beam opacity-60" aria-hidden="true" />
        <div className="wrap relative grid grid-cols-1 gap-12 lg:grid-cols-[1fr_minmax(0,460px)]">
          <div>
            <div className="stick-h">
              <Lines className="t-display" lines={["Budget every", "single task"]} />
              <p className="t-body mt-8 max-w-[420px] muted" data-reveal="">
                Not a wallet with a daily limit: a budget for one job. One stablecoin, one deadline, a per-call cap, and the providers this job may pay, each with
                its own cap. Raise it, pause it, close it; the agent can never raise its own limits.
              </p>
              <div className="mt-6 flex gap-2" data-reveal="">
                <Status kind="prototype" />
                <Link href="/app" className="pill sm dark">
                  Open tasks
                </Link>
              </div>
            </div>
          </div>
          <div className="pt-10 lg:pt-[40vh]" data-scale="">
            <TaskCardVisual />
          </div>
        </div>
      </section>

      {/* 3 — sticky heading B */}
      <section className="stick relative py-24 sm:py-32">
        <div className="wrap relative grid grid-cols-1 gap-12 lg:grid-cols-[1fr_minmax(0,460px)]">
          <div>
            <div className="stick-h">
              <Lines className="t-display" lines={["Stop at the", "limit, not after"]} />
              <p className="t-body mt-8 max-w-[420px] muted" data-reveal="">
                Every limit is enforced by the contract, not only by this page. Before anything is signed, one view call returns every reason a payment would fail,
                in plain words, and the dashboard keeps the refusal.
              </p>
            </div>
          </div>
          <div className="pt-10 lg:pt-[40vh]" data-scale="">
            <CheckVisual />
          </div>
        </div>
      </section>

      {/* 4 — scale-up media: inline card grows, heading blurs */}
      <section className="grow-sec" data-grow="" data-testid="grow">
        <div className="grow-pin">
          <h2 className="grow-h t-mega px-[var(--gutter)]">
            Every call,
            <br />a receipt
          </h2>
          <div className="grow-card card violet">
            <div className="inner h-full">
              <ReceiptVisual big />
            </div>
          </div>
        </div>
      </section>

      {/* 5 — counter stat (live) */}
      <section className="relative overflow-hidden py-28 sm:py-36">
        <div className="beam opacity-70" aria-hidden="true" />
        <div className="wrap relative">
          <StableStat />
        </div>
      </section>

      {/* 6 — two-tone paragraph + drag row */}
      <section className="py-20 sm:py-28">
        <div className="wrap">
          <div className="hair pt-16" />
          <p className="t-h3 max-w-[900px] sm:text-[36px]" data-words="">
            <span className="dim">Research data, filings, chain reads, inference by the call —</span> give your agent a task with a price tag, not a blank cheque, and
            see what every job cost.
          </p>
        </div>
        <div className="wrap mt-12">
          <DragRow testid="usecases">
            <UseCase title="Research agents" dot="" tone="linear-gradient(160deg,#2a1d5c,#0f0f14 70%)" line1="/v1/filings?q=..." line2="Buy filings per search inside a weekly research task." price="0.05 USDG" />
            <UseCase title="Chain data" dot="teal" tone="linear-gradient(160deg,#0b3a40,#0f0f14 70%)" line1="/api/provider/sample" line2="This site's own sample provider: live Robinhood Chain reads per call." price="0.002 USDG" />
            <UseCase title="Inference APIs" dot="yellow" tone="linear-gradient(160deg,#3a3a10,#0f0f14 70%)" line1="/v1/caption" line2="Caption 40 product photos with a 0.50 budget and a hard stop." price="0.01 USDG" />
            <UseCase title="Unvetted hosts" dot="orange" tone="linear-gradient(160deg,#4a2108,#0f0f14 70%)" line1="unknown-host/data" line2="Not approved for the task: refused before anything is signed." price="2 USDG" />
          </DragRow>
          <p className="t-small dim mt-4">Examples. Provider names and prices are sample data, except the sample provider, which runs on this site.</p>
        </div>
      </section>

      {/* 7 — tabs with progress */}
      <section className="py-20 sm:py-28">
        <div className="wrap">
          <Lines className="t-display mb-14" lines={["From task", "to receipt"]} />
          <Tabs
            items={STEPS.map((s) => ({
              title: s.title,
              text: s.text,
              panel: (
                <div className="card violet min-h-[360px] p-6 sm:p-10">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tag">
                      <i /> {s.title}
                    </span>
                    <SampleBadge />
                  </div>
                  <div className="flow mt-8 max-w-[620px]">
                    {s.code.map((c, i) => (
                      <div key={c} style={{ animationDelay: `${i * 120}ms` }} className="!border-white/15 !bg-black/30">
                        <span className="text-white/50">{i === 0 ? "→" : "·"}</span>
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ),
            }))}
          />
        </div>
      </section>

      {/* 8 — bento */}
      <section className="py-20 sm:py-28">
        <div className="wrap">
          <div className="grid grid-cols-1 items-end gap-6 lg:grid-cols-[1fr_minmax(0,340px)]">
            <Lines className="t-display" lines={["Get more", `with ${BRAND.name}`]} />
            <p className="t-small muted" data-reveal="">
              What runs today is marked Prototype; what is planned is marked Concept. Nothing on this page is promised beyond that.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {BENTO.map((b) => (
              <div key={b.t} className={`card ${b.light ? "light" : "lined"} flex min-h-[230px] flex-col justify-between`}>
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[28.5px] leading-[1.1] tracking-[-0.02em]">{b.t}</h3>
                    <Status kind={b.s} />
                  </div>
                  <p className={`mt-3 text-[15px] ${b.light ? "text-[#3a3c44]" : "muted"}`}>{b.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9 — marquee + FAQ */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <div className="pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="marquee t-mega dim blur-[3px]">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i}>
                Questions? <Star />
              </span>
            ))}
          </div>
        </div>
        <div className="wrap mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,360px)_1fr]">
          <div data-reveal="">
            <p className="t-small muted max-w-[300px]">
              The short answers. The long ones, with the contract&apos;s exact rules, are on{" "}
              <Link href="/how" className="ulink">
                how it works
              </Link>
              .
            </p>
            <Link href="/how" className="pill sm mt-5">
              How it works
            </Link>
          </div>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 10 — final CTA */}
      <section className="relative overflow-hidden py-24 text-center sm:py-32">
        <div className="wrap relative">
          <Lines className="t-display" lines={["Give your agent", "a budget today"]} />
          <p className="t-lead mx-auto mt-6 max-w-[520px] text-[var(--ink)]" data-reveal="">
            Practice on sample data now, or{" "}
            <Link href="/app" className="ulink">
              create a real task
            </Link>{" "}
            once the contract is live. Gas is paid in {CHAIN.nativeSymbol}.
          </p>
          <div className="mt-8 flex justify-center" data-reveal="">
            <Link href="/app" className="pill">
              <span className="roll">
                <span>Open the app</span>
                <span aria-hidden="true">Open the app</span>
              </span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
