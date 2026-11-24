"use client";

import { useCallback, useEffect, useState } from "react";
import { keccak256, stringToHex } from "viem";
import { CHAIN, explorerAddress, explorerTx, shortAddress } from "@/config/brand";
import { CONTRACTS, contractLive } from "@/config/contracts";
import { DEFAULT_STABLE, STABLES, stableByAddress } from "@/config/tokens";
import { storageKey } from "@/config/storage";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { checkPay, enc, loadTasks, send, tokenState, type LiveTask } from "@/lib/gentpay/live";
import { explainMask } from "@/lib/gentpay/reasons";
import { randomNonce } from "@/lib/gentpay/request";
import { explain } from "@/lib/client";
import { dateText, parseUnits, units as fmt } from "@/lib/format";

/*
 * Live mode: the connected wallet's tasks (as owner or agent) read from GentpayTaskBudgets, receipts from /api/receipts (log scan,
 * each confirmed against the stored receipt), refusals from the pre-check kept in this browser (a reverted tx leaves no log).
 */

type Refusal = { at: number; taskId: number; providerId: number; units: number; mask: string };
const REFUSALS = storageKey("refusals", "v1");

function loadRefusals(): Refusal[] {
  try {
    return JSON.parse(localStorage.getItem(REFUSALS) ?? "[]") as Refusal[];
  } catch {
    return [];
  }
}
function saveRefusal(r: Refusal) {
  try {
    localStorage.setItem(REFUSALS, JSON.stringify([r, ...loadRefusals()].slice(0, 100)));
  } catch {
    // storage blocked: shown once, not kept
  }
}

const STATUS = ["—", "Open", "Paused", "Closed"];

export function Live() {
  const { address, onChain, switchNetwork, sendTransaction } = useWallet();
  const { open } = useWalletModal();
  const [tasks, setTasks] = useState<LiveTask[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!address || !contractLive()) return;
    let dead = false;
    loadTasks(address)
      .then((t) => {
        if (dead) return;
        setTasks(t);
        setErr(null);
        setSel((s) => (s && t.some((x) => x.id === s) ? s : (t[0]?.id ?? null)));
      })
      .catch((e) => !dead && setErr(explain(e)));
    return () => {
      dead = true;
    };
  }, [address, tick]);

  if (!contractLive())
    return (
      <div className="card" data-testid="live-off" data-noauto="">
        <h2 className="t-h3">Not deployed yet</h2>
        <p className="muted mt-3 max-w-[620px]">
          GentpayTaskBudgets is not on {CHAIN.name} yet, so there are no real tasks to show. The contract is written and tested (unit, hostile-token, fuzz,
          invariant and fork tests) and waits for its deployment. Practice mode runs the same rules on sample data.
        </p>
      </div>
    );
  if (!address)
    return (
      <div className="card" data-noauto="">
        <h2 className="t-h3">Connect a wallet</h2>
        <p className="muted mt-3">Your tasks as owner or as agent are read from the contract for the connected address.</p>
        <button type="button" className="pill mt-5" onClick={open} data-testid="live-connect">
          Connect wallet
        </button>
      </div>
    );
  const task = tasks?.find((t) => t.id === sel) ?? null;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_1fr]" data-testid="live">
      <aside className="grid content-start gap-3">
        {!onChain ? (
          <button type="button" className="pill w-full" onClick={switchNetwork}>
            Switch to {CHAIN.name}
          </button>
        ) : null}
        {err ? <p className="rq-alert">{err}</p> : null}
        {tasks === null && !err ? <p className="t-small muted">Reading your tasks…</p> : null}
        {tasks?.length === 0 ? <p className="t-small muted">No tasks for {shortAddress(address)} yet.</p> : null}
        {tasks?.map((t) => {
          const tok = stableByAddress(t.token);
          const d = tok?.decimals ?? 18;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSel(t.id)}
              className={`card text-left ${t.id === sel ? "!bg-[var(--card-2)] ring-1 ring-[var(--line-2)]" : ""}`}
              data-testid={`live-task-${t.id}`}
              data-noauto=""
            >
              <div className="flex items-center justify-between gap-2">
                <span className="t-small muted">
                  Task #{t.id} · {t.owner.toLowerCase() === address.toLowerCase() ? "owner" : "agent"}
                </span>
                <span className="tag">
                  <i /> {STATUS[t.status]}
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="t-num text-[15px]">{fmt(t.spent, d, 4)}</span>
                <span className="t-small muted">
                  of {fmt(t.budget, d, 4)} {tok?.symbol ?? "tokens"}
                </span>
              </div>
              <div className="meter mt-2">
                <i style={{ width: `${Number((t.spent * 1000n) / (t.budget || 1n)) / 10}%` }} />
              </div>
            </button>
          );
        })}
        <CreateTask address={address} onDone={refresh} sendTransaction={sendTransaction} />
      </aside>
      {task ? <TaskDetail task={task} me={address} onDone={refresh} sendTransaction={sendTransaction} /> : <div />}
    </div>
  );
}

function useAct() {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const run = async (label: string, f: () => Promise<{ hash: string } | void>) => {
    setBusy(label);
    setMsg(null);
    try {
      const r = await f();
      setMsg({ ok: true, text: `${label}: confirmed.`, tx: r && "hash" in r ? r.hash : undefined });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: explain(e) });
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, msg, run, setMsg };
}

function Msg({ msg }: { msg: { ok: boolean; text: string; tx?: string } | null }) {
  if (!msg) return null;
  return (
    <p className={`mt-3 text-[13.5px] ${msg.ok ? "text-[var(--good)]" : "rq-alert"}`} role="status" data-testid="live-msg">
      {msg.text}{" "}
      {msg.tx ? (
        <a className="ulink" href={explorerTx(msg.tx)} target="_blank" rel="noreferrer">
          tx
        </a>
      ) : null}
    </p>
  );
}

type Send = (tx: { to?: string; data: string }) => Promise<string>;

function CreateTask({ address, onDone, sendTransaction }: { address: string; onDone: () => void; sendTransaction: Send }) {
  const [openForm, setOpen] = useState(false);
  const [token, setToken] = useState<string>(DEFAULT_STABLE.address);
  const [agent, setAgent] = useState("");
  const [budget, setBudget] = useState("1");
  const [perCall, setPerCall] = useState("0.1");
  const [days, setDays] = useState("3");
  const [prov, setProv] = useState(CONTRACTS.sampleProvider ? String(CONTRACTS.sampleProvider) : "");
  const [cap, setCap] = useState("1");
  const [title, setTitle] = useState("Research task");
  const { busy, msg, run, setMsg } = useAct();
  const tok = stableByAddress(token) ?? DEFAULT_STABLE;
  if (!openForm)
    return (
      <button type="button" className="pill dark w-full" onClick={() => setOpen(true)} data-testid="live-new">
        New task
      </button>
    );
  return (
    <form
      className="card grid gap-3"
      data-noauto=""
      data-testid="live-create"
      onSubmit={async (e) => {
        e.preventDefault();
        const b = parseUnits(budget, tok.decimals);
        const pc = parseUnits(perCall || "0", tok.decimals);
        const c = parseUnits(cap, tok.decimals);
        const ids = prov.split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0);
        if (b === null || pc === null || c === null || !/^0x[0-9a-fA-F]{40}$/.test(agent || address) || !(Number(days) > 0)) return setMsg({ ok: false, text: "Check the numbers and the agent address." });
        const deadline = Math.floor(Date.now() / 1000 + Number(days) * 86400);
        const ok = await run("Create task", async () => {
          const st = await tokenState(token, address);
          if (st.allowance < b) await send(address, token, enc.approve(CONTRACTS.contract, b), sendTransaction);
          return send(address, CONTRACTS.contract, enc.createTask(token, agent || address, b, deadline, pc, keccak256(stringToHex(title)), ids, ids.map(() => c)), sendTransaction);
        });
        if (ok) {
          setOpen(false);
          onDone();
        }
      }}
    >
      <label className="field">
        <span>Title (only its hash goes on chain)</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>Stablecoin</span>
        <select className="input" value={token} onChange={(e) => setToken(e.target.value)} data-testid="live-token">
          {STABLES.map((s) => (
            <option key={s.address} value={s.address}>
              {s.symbol} · {shortAddress(s.address)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Agent address (empty = you)</span>
        <input className="input t-num text-[13px]" value={agent} onChange={(e) => setAgent(e.target.value.trim())} placeholder="0x…" data-testid="live-agent" />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="field">
          <span>Budget</span>
          <input className="input" value={budget} onChange={(e) => setBudget(e.target.value)} data-testid="live-budget" />
        </label>
        <label className="field">
          <span>Per call</span>
          <input className="input" value={perCall} onChange={(e) => setPerCall(e.target.value)} />
        </label>
        <label className="field">
          <span>Days</span>
          <input className="input" value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="field">
          <span>Provider ids</span>
          <input className="input" value={prov} onChange={(e) => setProv(e.target.value)} placeholder="1, 2" data-testid="live-providers" />
        </label>
        <label className="field">
          <span>Cap each</span>
          <input className="input" value={cap} onChange={(e) => setCap(e.target.value)} />
        </label>
      </div>
      <p className="t-small dim">If the allowance is below the budget, the wallet first asks to approve exactly the budget for the contract. Nothing leaves your wallet until the agent pays.</p>
      <div className="flex gap-2">
        <button type="submit" className="pill sm" disabled={!!busy} data-testid="live-create-submit">
          {busy ? "Confirm in wallet…" : "Create task"}
        </button>
        <button type="button" className="rq-btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <Msg msg={msg} />
    </form>
  );
}

type Row = { id: string; providerId: string; amount: string; units: string; tx: string; block: number; confirmed: boolean; requestHash: string };

function TaskDetail({ task, me, onDone, sendTransaction }: { task: LiveTask; me: string; onDone: () => void; sendTransaction: Send }) {
  const tok = stableByAddress(task.token);
  const d = tok?.decimals ?? 18;
  const sym = tok?.symbol ?? "tokens";
  const isOwner = task.owner.toLowerCase() === me.toLowerCase();
  const { busy, msg, run } = useAct();
  const [rows, setRows] = useState<{ rows: Row[]; complete: boolean } | null>(null);
  const [rowsErr, setRowsErr] = useState<string | null>(null);
  const [refusals, setRefusals] = useState<Refusal[]>([]);
  useEffect(() => {
    let dead = false;
    queueMicrotask(() => !dead && setRefusals(loadRefusals().filter((r) => r.taskId === task.id)));
    fetch(`/api/receipts?task=${task.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { rows?: Row[]; complete?: boolean; error?: string }) => {
        if (dead) return;
        if (b.error) setRowsErr(b.error);
        else setRows({ rows: b.rows ?? [], complete: b.complete !== false });
      })
      .catch(() => !dead && setRowsErr("Receipts could not be read."));
    return () => {
      dead = true;
    };
  }, [task.id, task.payments]);

  const act = (label: string, data: string) => run(label, () => send(me, CONTRACTS.contract, data, sendTransaction)).then((ok) => ok && onDone());

  return (
    <section className="grid min-w-0 content-start gap-4" data-testid="live-task">
      <div className="card" data-noauto="">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="t-small muted">
              Task #{task.id} · {STATUS[task.status]} · ends {dateText(task.deadline)}
            </p>
            <p className="t-num mt-2 text-[34px]" data-testid="live-spent">
              {fmt(task.spent, d, 6)} <span className="text-[15px] muted">of {fmt(task.budget, d, 6)} {sym}</span>
            </p>
          </div>
          {isOwner && task.status !== 3 ? (
            <div className="flex flex-wrap gap-2">
              {task.status === 1 ? (
                <button type="button" className="rq-btn" disabled={!!busy} onClick={() => act("Pause", enc.status("pauseTask", task.id))} data-testid="live-pause">
                  Pause
                </button>
              ) : (
                <button type="button" className="rq-btn" disabled={!!busy} onClick={() => act("Resume", enc.status("resumeTask", task.id))} data-testid="live-resume">
                  Resume
                </button>
              )}
              <button type="button" className="rq-btn text-[var(--bad)]" disabled={!!busy} onClick={() => act("Close", enc.status("closeTask", task.id))} data-testid="live-close">
                Close for good
              </button>
            </div>
          ) : null}
        </div>
        <div className="meter mt-3">
          <i style={{ width: `${Number((task.spent * 1000n) / (task.budget || 1n)) / 10}%` }} />
        </div>
        <div className="rows mt-5 text-[14px]">
          <div className="kv">
            <span>Token</span>
            <a className="ulink t-num" href={explorerAddress(task.token)} target="_blank" rel="noreferrer">
              {sym} {shortAddress(task.token)}
            </a>
          </div>
          <div className="kv">
            <span>Agent</span>
            <span className="t-num">{task.agent && !/^0x0{40}$/i.test(task.agent) ? task.agent : "none (owner only)"}</span>
          </div>
          <div className="kv">
            <span>Per-call cap</span>
            <span className="t-num">{task.perCallCap ? `${fmt(task.perCallCap, d, 6)} ${sym}` : "none"}</span>
          </div>
          {task.providers.map((p) => (
            <div className="kv" key={p.id}>
              <span>
                Provider #{p.id} · {fmt(p.price, d, 6)} {sym}/unit{p.active ? "" : " · paused"}
              </span>
              <span className="t-num">
                {fmt(p.spent, d, 6)} / {p.cap ? fmt(p.cap, d, 6) : "removed"}
              </span>
            </div>
          ))}
        </div>
        <Msg msg={msg} />
      </div>

      <PayBox task={task} me={me} sym={sym} d={d} onPaid={onDone} sendTransaction={sendTransaction} onRefused={(r) => setRefusals((v) => [r, ...v])} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card" data-noauto="">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[21px]">Receipts</h3>
            <span className="badge live">Live data</span>
          </div>
          <p className="t-small muted">From the contract&apos;s Paid logs, each confirmed against the stored receipt.</p>
          {rowsErr ? <p className="rq-alert mt-3">{rowsErr}</p> : null}
          {rows && !rows.complete ? <p className="t-small rq-warn mt-2">Scan incomplete: some blocks could not be read; the list may be short.</p> : null}
          <div className="rows mt-3" data-testid="live-receipts">
            {rows?.rows.length === 0 ? <p className="t-small dim py-3">No payments yet.</p> : null}
            {rows?.rows.map((r) => (
              <div key={r.id} className="kv">
                <span>
                  #{r.id} · provider {r.providerId} · {r.units} unit{r.units === "1" ? "" : "s"} {r.confirmed ? "" : "· unconfirmed"}
                </span>
                <span className="t-num">
                  {fmt(BigInt(r.amount), d, 6)} {sym} ·{" "}
                  <a className="ulink" href={explorerTx(r.tx)} target="_blank" rel="noreferrer">
                    tx
                  </a>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" data-noauto="">
          <h3 className="text-[21px]">Refused (this browser)</h3>
          <p className="t-small muted">Pre-checks that failed. A refused payment never reaches the chain, so it is only recorded here.</p>
          <div className="rows mt-3" data-testid="live-refusals">
            {refusals.length === 0 ? <p className="t-small dim py-3">Nothing refused yet.</p> : null}
            {refusals.slice(0, 12).map((r, i) => (
              <div key={i} className="kv">
                <span>
                  provider {r.providerId} · {r.units} units
                </span>
                <span className="text-[12.5px] text-[var(--bad)]">{explainMask(BigInt(r.mask)).map((x) => x.key).join(", ")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PayBox({ task, me, sym, d, onPaid, onRefused, sendTransaction }: { task: LiveTask; me: string; sym: string; d: number; onPaid: () => void; onRefused: (r: Refusal) => void; sendTransaction: Send }) {
  const [pid, setPid] = useState(String(task.providers[0]?.id ?? ""));
  const [n, setN] = useState("1");
  const [note, setNote] = useState("GET /v1/report");
  const [check, setCheck] = useState<{ mask: bigint; amount: bigint; left: bigint; hash: string } | null>(null);
  const { busy, msg, run, setMsg } = useAct();
  const prov = task.providers.find((p) => String(p.id) === pid);
  const price = prov?.price ?? 0n;

  async function doCheck() {
    setMsg(null);
    const hash = keccak256(stringToHex(`${note}|${randomNonce()}`));
    try {
      const c = await checkPay(task.id, Number(pid), Number(n), hash, price, me);
      setCheck({ ...c, hash });
      if (c.mask !== 0n) {
        const r = { at: Math.floor(Date.now() / 1000), taskId: task.id, providerId: Number(pid), units: Number(n), mask: c.mask.toString() };
        saveRefusal(r);
        onRefused(r);
      }
    } catch (e) {
      setMsg({ ok: false, text: explain(e) });
    }
  }

  return (
    <div className="card" data-noauto="" data-testid="live-pay">
      <h3 className="text-[21px]">Pay a provider from this task</h3>
      <p className="t-small muted">As the task&apos;s agent or owner. The check runs first; the wallet opens only when it passes. Agents usually do this from code (examples/agent.mjs).</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="field">
          <span>Provider</span>
          <select className="input" value={pid} onChange={(e) => { setPid(e.target.value); setCheck(null); }} data-testid="live-pay-provider">
            {task.providers.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.id} · {fmt(p.price, d, 6)} {sym}/unit
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Units</span>
          <input className="input" value={n} onChange={(e) => { setN(e.target.value.replace(/\D/g, "")); setCheck(null); }} data-testid="live-pay-units" />
        </label>
        <label className="field">
          <span>Request (hashed with a fresh nonce)</span>
          <input className="input" value={note} onChange={(e) => { setNote(e.target.value); setCheck(null); }} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="rq-btn h-[44px]" onClick={doCheck} disabled={!pid || !n} data-testid="live-check">
          Check
        </button>
        <button
          type="button"
          className="pill"
          disabled={!check || check.mask !== 0n || !!busy}
          onClick={async () => {
            if (!check) return;
            const ok = await run("Payment", () => send(me, CONTRACTS.contract, enc.pay(task.id, Number(pid), Number(n), check.hash, price), sendTransaction));
            if (ok) {
              setCheck(null);
              onPaid();
            }
          }}
          data-testid="live-pay-submit"
        >
          {busy ? "Confirm in wallet…" : "Pay"}
        </button>
      </div>
      {check ? (
        <div className="mt-4 rounded-[14px] border border-[var(--line)] p-4" data-testid="live-check-result">
          <p className="t-num text-[14px]">
            {check.mask === 0n ? "Passes" : "Refused"} · cost {fmt(check.amount, d, 6)} {sym} · left {fmt(check.left, d, 6)} {sym}
          </p>
          {check.mask !== 0n ? (
            <ul className="mt-2 grid gap-1 text-[13.5px] text-[var(--bad)]">
              {explainMask(check.mask).map((r) => (
                <li key={r.key}>{r.words}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <Msg msg={msg} />
    </div>
  );
}
