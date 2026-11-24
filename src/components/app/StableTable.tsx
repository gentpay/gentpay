"use client";

import { CHAIN, explorerAddress } from "@/config/brand";
import { ETH_USD_FEED, STABLES } from "@/config/tokens";
import { useChain } from "@/components/home/useChain";
import { ago, dateText, fmtSupply } from "@/lib/format";

/* The proven stablecoins with their live supply and Chainlink price, plus chain facts. Every value links to its source. */
export function StableTable() {
  const { data, error } = useChain();
  return (
    <div className="card" data-noauto="" data-testid="stable-table">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[21px]">Proven on {CHAIN.name}</h2>
        <span className="badge live">Live data{data ? ` · read ${ago(data.readAt / 1000)}` : ""}</span>
      </div>
      {error && !data ? <p className="rq-alert mt-3">{error}</p> : null}
      <div className="rows mt-4">
        {STABLES.map((s) => {
          const l = data?.stables.find((x) => x.address.toLowerCase() === s.address.toLowerCase());
          return (
            <div key={s.address} className="grid gap-1 py-4 sm:grid-cols-[160px_1fr_auto] sm:items-baseline sm:gap-4">
              <span className="text-[18px]">
                {s.symbol} <span className="t-small muted">{s.name}</span>
              </span>
              <span className="t-small muted min-w-0 break-all">
                <a className="ulink t-num" href={explorerAddress(s.address)} target="_blank" rel="noreferrer">
                  {s.address}
                </a>{" "}
                · {s.decimals} decimals · {s.note}
              </span>
              <span className="t-num text-[13px] sm:text-right">
                supply {l ? fmtSupply(l.supply, l.decimals) : "—"}
                <br />
                <a className="ulink" href={explorerAddress(s.feed)} target="_blank" rel="noreferrer">
                  Chainlink {l?.price ? l.price.toFixed(4) : "—"} USD
                </a>{" "}
                {l?.updatedAt ? `(${dateText(l.updatedAt)})` : ""}
              </span>
            </div>
          );
        })}
        <div className="kv">
          <span>Latest block</span>
          <span className="t-num">{data?.block ? `#${data.block.toLocaleString("en-US")}` : "—"}</span>
        </div>
        <div className="kv">
          <span>Gas price</span>
          <span className="t-num">{data?.gasPriceWei ? `${(Number(data.gasPriceWei) / 1e9).toFixed(4)} gwei` : "—"}</span>
        </div>
        <div className="kv">
          <span>ETH / USD (Chainlink)</span>
          <a className="ulink t-num" href={explorerAddress(ETH_USD_FEED)} target="_blank" rel="noreferrer">
            {data?.ethUsd ? `$${data.ethUsd.price.toFixed(2)} · ${dateText(data.ethUsd.updatedAt)}` : "—"}
          </a>
        </div>
      </div>
    </div>
  );
}
