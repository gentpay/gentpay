"use client";

import { CHAIN, explorerAddress } from "@/config/brand";
import { CONTRACTS, contractLive } from "@/config/contracts";
import { STABLES } from "@/config/tokens";
import { Odometer } from "@/components/site/Fx";
import { useChain } from "@/components/home/useChain";
import { ago, dateText, fmtSupply } from "@/lib/format";

/* Live pieces of the home page. Every number names its source and age; a failed read shows "—", never a made-up value. */

export function HeroChainCard() {
  const { data, error } = useChain();
  const usdg = data?.stables.find((s) => s.symbol === "USDG");
  return (
    <div className="glass w-full p-4 sm:w-[260px]" data-testid="hero-live">
      <div className="flex items-center justify-between gap-2">
        <span className="t-small muted">{CHAIN.name}</span>
        <span className="badge live">Live data</span>
      </div>
      <p className="t-num mt-3 text-[22px]" data-testid="hero-block">
        {data?.block ? `#${data.block.toLocaleString("en-US")}` : error ? "—" : "…"}
      </p>
      <p className="t-small dim">latest block{data?.time ? ` · ${ago(data.time)}` : ""}</p>
      <div className="hair mt-3 pt-3">
        <p className="t-small muted">USDG on chain</p>
        <p className="t-num text-[15px]">{usdg ? fmtSupply(usdg.supply, usdg.decimals) : "—"}</p>
      </div>
    </div>
  );
}

export function StableStat() {
  const { data, error } = useChain(30_000);
  const usdg = data?.stables.find((s) => s.symbol === "USDG");
  const supply = usdg ? fmtSupply(usdg.supply, usdg.decimals) : null;
  return (
    <div className="text-center" data-testid="stable-stat">
      <p className="t-display">
        {supply ? <Odometer value={supply} /> : <span className="dim">{error ? "Not readable" : "Reading…"}</span>}
      </p>
      <p className="t-lead mx-auto mt-6 max-w-[760px] text-[var(--ink)]">
        USDG on {CHAIN.name} right now, read from its token contract. Gentpay offers only stablecoins we proved on chain:{" "}
        {STABLES.map((s, i) => (
          <span key={s.symbol}>
            <a className="ulink" href={explorerAddress(s.address)} target="_blank" rel="noreferrer">
              {s.symbol}
            </a>
            {i < STABLES.length - 1 ? " and " : "."}
          </span>
        ))}
      </p>
      <div className="mx-auto mt-6 flex max-w-[760px] flex-wrap justify-center gap-2" data-testid="stable-feeds">
        {(data?.stables ?? STABLES.map((s) => ({ symbol: s.symbol, price: null, updatedAt: null, feed: s.feed }))).map((s) => (
          <a key={s.symbol} className="tag" href={explorerAddress(s.feed)} target="_blank" rel="noreferrer" title="Chainlink price feed on Robinhood Chain">
            <i />
            {s.symbol} / USD {s.price ? s.price.toFixed(4) : "—"} {s.updatedAt ? `· ${dateText(s.updatedAt)}` : ""}
          </a>
        ))}
        <span className="badge live">Live · Chainlink feeds</span>
      </div>
      <p className="t-small dim mt-4">
        Lookalike tokens named USDG, USDC and USDT exist on this chain; we found no genuine USDC or USDT contract there, so none is offered.
        {contractLive() ? (
          <>
            {" "}
            Contract{" "}
            <a className="ulink" href={explorerAddress(CONTRACTS.contract)} target="_blank" rel="noreferrer">
              GentpayTaskBudgets
            </a>
            : {data?.contract?.tasks ?? "—"} tasks, {data?.contract?.receipts ?? "—"} receipts.
          </>
        ) : (
          " GentpayTaskBudgets is not deployed yet."
        )}
      </p>
    </div>
  );
}
