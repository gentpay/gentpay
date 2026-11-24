"use client";

import { useEffect, useState } from "react";
import { keccak256, stringToHex } from "viem";
import { CHAIN, explorerTx } from "@/config/brand";
import { CONTRACTS, contractLive } from "@/config/contracts";
import { DEFAULT_STABLE, STABLES, stableByAddress } from "@/config/tokens";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { enc, loadProvider, priceOf, providersOf, send, type LiveProvider } from "@/lib/gentpay/live";
import { explain } from "@/lib/client";
import { parseUnits, units as fmt } from "@/lib/format";

/* The sample provider's live 402 answer, and on-chain provider registration for the connected wallet. */

export function Live402() {
  const [res, setRes] = useState<{ status: number; body: unknown } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/provider/sample?topic=chain", { cache: "no-store" })
      .then(async (r) => setRes({ status: r.status, body: await r.json().catch(() => null) }))
      .catch(() => setErr("The route could not be reached."));
  }, []);
  return (
    <div className="card" data-noauto="" data-testid="live-402">
      <div className="flex items-center justify-between gap-2">
        <p className="t-small muted">GET /api/provider/sample?topic=chain (no receipt)</p>
        <span className="badge live">Live answer</span>
      </div>
      {err ? <p className="rq-alert mt-3">{err}</p> : null}
      {res ? (
        <>
          <p className="t-num mt-3 text-[22px]">HTTP {res.status}</p>
          <pre className="t-num mt-3 max-h-[340px] overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-black/40 p-4 text-[12px] leading-[1.5]">{JSON.stringify(res.body, null, 2)}</pre>
          {res.status === 503 ? <p className="t-small muted mt-2">503 = the contract or the sample provider is not deployed/registered yet. After deployment this answers 402 with the on-chain price.</p> : null}
        </>
      ) : !err ? (
        <p className="t-small muted mt-3">Asking…</p>
      ) : null}
    </div>
  );
}

export function RegisterProvider() {
  const { address, sendTransaction } = useWallet();
  const { open } = useWalletModal();
  const [mine, setMine] = useState<(LiveProvider & { prices: { symbol: string; price: bigint; d: number }[] })[]>([]);
  const [payout, setPayout] = useState("");
  const [maxUnits, setMaxUnits] = useState("100");
  const [terms, setTerms] = useState("https://example.com/api terms");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [priceFor, setPriceFor] = useState<{ id: number; token: string; text: string }>({ id: 0, token: DEFAULT_STABLE.address, text: "0.002" });

  useEffect(() => {
    if (!address || !contractLive()) return;
    let dead = false;
    (async () => {
      const ids = await providersOf(address);
      const out: (LiveProvider & { prices: { symbol: string; price: bigint; d: number }[] })[] = [];
      for (const id of ids.slice(-20)) {
        const p = await loadProvider(id);
        if (!p || p.controller.toLowerCase() !== address.toLowerCase()) continue;
        const prices = [];
        for (const s of STABLES) prices.push({ symbol: s.symbol, price: await priceOf(id, s.address), d: s.decimals });
        out.push({ ...p, prices });
      }
      if (!dead) {
        setMine(out);
        if (out[0]) setPriceFor((v) => (v.id ? v : { ...v, id: out[0].id }));
      }
    })().catch((e) => !dead && setMsg({ ok: false, text: explain(e) }));
    return () => {
      dead = true;
    };
  }, [address, tick]);

  async function act(label: string, data: string) {
    if (!address) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await send(address, CONTRACTS.contract, data, sendTransaction);
      setMsg({ ok: true, text: `${label}: confirmed.`, tx: r.hash });
      setTick((t) => t + 1);
    } catch (e) {
      setMsg({ ok: false, text: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!contractLive())
    return (
      <div className="card" data-noauto="">
        <h3 className="text-[21px]">Register as a provider</h3>
        <p className="muted mt-2">Opens once GentpayTaskBudgets is deployed on {CHAIN.name}. Registration costs gas only; the contract takes no fee.</p>
      </div>
    );
  if (!address)
    return (
      <div className="card" data-noauto="">
        <h3 className="text-[21px]">Register as a provider</h3>
        <button type="button" className="pill mt-4" onClick={open}>
          Connect wallet
        </button>
      </div>
    );
  const tok = stableByAddress(priceFor.token) ?? DEFAULT_STABLE;
  return (
    <div className="card" data-noauto="" data-testid="provider-tools">
      <h3 className="text-[21px]">Your providers</h3>
      <div className="rows mt-3">
        {mine.length === 0 ? <p className="t-small dim py-3">None registered from this wallet.</p> : null}
        {mine.map((p) => (
          <div key={p.id} className="kv" data-testid={`my-provider-${p.id}`}>
            <span>
              #{p.id} · {p.active ? "active" : "paused"} · max {p.maxUnitsPerCall || "∞"} units/call
            </span>
            <span className="t-num">{p.prices.map((x) => `${x.price ? fmt(x.price, x.d, 6) : "—"} ${x.symbol}`).join(" · ")}</span>
          </div>
        ))}
      </div>
      <form
        className="mt-5 grid gap-3 sm:grid-cols-[1fr_120px_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const to = payout || address;
          if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return setMsg({ ok: false, text: "Payout must be an address." });
          act("Register", enc.register(to, Number(maxUnits) || 0, keccak256(stringToHex(terms))));
        }}
      >
        <label className="field">
          <span>Payout address (empty = this wallet)</span>
          <input className="input t-num text-[13px]" value={payout} onChange={(e) => setPayout(e.target.value.trim())} placeholder="0x…" />
        </label>
        <label className="field">
          <span>Max units / call</span>
          <input className="input" value={maxUnits} onChange={(e) => setMaxUnits(e.target.value.replace(/\D/g, ""))} />
        </label>
        <button type="submit" className="pill sm self-end" disabled={busy} data-testid="provider-register">
          Register
        </button>
        <label className="field sm:col-span-3">
          <span>Terms or endpoint (only its hash goes on chain)</span>
          <input className="input" value={terms} onChange={(e) => setTerms(e.target.value)} />
        </label>
      </form>
      {mine.length ? (
        <form
          className="mt-5 grid gap-3 sm:grid-cols-[110px_1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            const v = parseUnits(priceFor.text, tok.decimals);
            if (v === null) return setMsg({ ok: false, text: "Enter a price." });
            act("Set price", enc.setPrice(priceFor.id, priceFor.token, v));
          }}
        >
          <label className="field">
            <span>Provider</span>
            <select className="input" value={priceFor.id} onChange={(e) => setPriceFor({ ...priceFor, id: Number(e.target.value) })}>
              {mine.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.id}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Token</span>
            <select className="input" value={priceFor.token} onChange={(e) => setPriceFor({ ...priceFor, token: e.target.value })}>
              {STABLES.map((s) => (
                <option key={s.address} value={s.address}>
                  {s.symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Price per unit ({tok.symbol})</span>
            <input className="input" value={priceFor.text} onChange={(e) => setPriceFor({ ...priceFor, text: e.target.value })} data-testid="provider-price" />
          </label>
          <button type="submit" className="pill sm self-end" disabled={busy} data-testid="provider-set-price">
            Set price
          </button>
        </form>
      ) : null}
      {msg ? (
        <p className={`mt-3 text-[13.5px] ${msg.ok ? "text-[var(--good)]" : "rq-alert"}`} role="status">
          {msg.text}{" "}
          {msg.tx ? (
            <a className="ulink" href={explorerTx(msg.tx)} target="_blank" rel="noreferrer">
              tx
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
