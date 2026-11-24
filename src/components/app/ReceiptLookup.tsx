"use client";

import { useEffect, useRef, useState } from "react";
import { explorerAddress, explorerTx, shortAddress } from "@/config/brand";
import { contractLive } from "@/config/contracts";
import { stableByAddress } from "@/config/tokens";
import { units as fmt } from "@/lib/format";

type Row = { id: string; taskId: string; providerId: string; token: string; payee: string; caller: string; amount: string; units: string; pricePerUnit: string; requestHash: string; tx: string; block: number; confirmed: boolean };

/* Look up receipts by transaction hash or task id, from /api/receipts (chain logs confirmed against the stored receipts). */
export function ReceiptLookup() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("tx") ?? p.get("task");
    if (v)
      queueMicrotask(() => {
        setQ(v);
        void lookRef.current(v);
      });
  }, []);
  const lookRef = useRef(look);
  useEffect(() => {
    lookRef.current = look;
  });
  async function look(v = q) {
    const s = v.trim();
    const param = /^0x[0-9a-fA-F]{64}$/.test(s) ? `tx=${s}` : /^\d{1,12}$/.test(s) ? `task=${s}` : null;
    if (!param) return setNote("Enter a transaction hash (0x + 64 hex) or a task number.");
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`/api/receipts?${param}`, { cache: "no-store" });
      const b = (await r.json()) as { rows?: Row[]; error?: string; status?: string; deployed?: boolean; complete?: boolean };
      if (b.deployed === false) setNote("GentpayTaskBudgets is not deployed yet: there are no receipts on chain.");
      else if (b.error) setNote(b.error);
      else if (b.status === "missing") setNote("No such transaction.");
      else if (b.status === "failed") setNote("That transaction failed: it wrote no receipt.");
      else if (b.complete === false) setNote("The log scan could not read every block; the list may be short.");
      setRows(b.rows ?? []);
    } catch {
      setNote("The receipts could not be read.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-4">
      <form
        className="card flex flex-col gap-3 sm:flex-row sm:items-end"
        data-noauto=""
        onSubmit={(e) => {
          e.preventDefault();
          void look();
        }}
      >
        <label className="field min-w-0 flex-1">
          <span>Transaction hash or task number</span>
          <input className="input t-num text-[13px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="0x… or 12" data-testid="receipt-q" />
        </label>
        <button type="submit" className="pill" disabled={busy} data-testid="receipt-go">
          {busy ? "Reading…" : "Look up"}
        </button>
      </form>
      {!contractLive() ? <p className="t-small muted">The contract is not deployed yet; lookups answer once it is.</p> : null}
      {note ? <p className="rq-alert">{note}</p> : null}
      {rows?.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="receipt-rows">
          {rows.map((r) => {
            const t = stableByAddress(r.token);
            const d = t?.decimals ?? 18;
            return (
              <div key={r.id} className="card violet" data-noauto="">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="tag">
                    <i /> {r.confirmed ? "Confirmed on chain" : "Log only"}
                  </span>
                  <span className="badge live !text-white">Live data</span>
                </div>
                <p className="mt-4 text-[clamp(28px,3vw,40px)] leading-none tracking-[-0.02em]">Receipt #{r.id}</p>
                <p className="mt-2 text-white/80">
                  {fmt(BigInt(r.amount), d, 6)} {t?.symbol ?? "tokens"} for {r.units} unit{r.units === "1" ? "" : "s"}, task #{r.taskId}
                </p>
                <div className="rows mt-4 text-[13.5px]">
                  {[
                    ["Provider", `#${r.providerId} · payout ${shortAddress(r.payee)}`, explorerAddress(r.payee)],
                    ["Price per unit", `${fmt(BigInt(r.pricePerUnit), d, 6)} ${t?.symbol ?? ""}`],
                    ["Sent by", shortAddress(r.caller), explorerAddress(r.caller)],
                    ["Request hash", shortAddress(r.requestHash, 10, 6)],
                    ["Block", `#${r.block.toLocaleString("en-US")}`],
                    ["Transaction", shortAddress(r.tx, 10, 6), explorerTx(r.tx)],
                  ].map(([k, v, href]) => (
                    <div key={k} className="kv !border-white/15">
                      <span className="!text-white/60">{k}</span>
                      {href ? (
                        <a className="ulink t-num" href={href} target="_blank" rel="noreferrer">
                          {v}
                        </a>
                      ) : (
                        <span className="t-num">{v}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : rows && !note ? (
        <p className="t-small muted">No receipts found.</p>
      ) : null}
    </div>
  );
}
