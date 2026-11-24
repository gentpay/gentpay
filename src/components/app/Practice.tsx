"use client";

import { useEffect, useMemo, useState } from "react";
import { keccak256, stringToHex } from "viem";
import { check, createTask, pay, setBudget, setStatus, type PState, type PTask } from "@/lib/gentpay/engine";
import { explainMask } from "@/lib/gentpay/reasons";
import { PRACTICE_AGENT, PRACTICE_OWNER, PRACTICE_TOKEN, practiceState } from "@/lib/gentpay/sample";
import { parseUnits, units as fmt } from "@/lib/format";
import { storageKey } from "@/config/storage";

/*
 * Practice mode: the contract's rules (src/lib/gentpay/engine.ts, parity-tested against the Solidity tests) on sample data, in the
 * browser. No wallet, no chain, no token. Everything on this panel is sample data.
 */

const DEC = 6;
const KEY = storageKey("practice", "v1");
const u = (v: bigint) => fmt(v, DEC, 4);


function revive(raw: string | null): PState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw, (_, v) => (typeof v === "string" && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v)) as PState;
  } catch {
    return null;
  }
}
const freeze = (s: PState) => JSON.stringify(s, (_, v) => (typeof v === "bigint" ? `${v}n` : v));

export function Practice() {
  const [s, setS] = useState<PState>(() => practiceState());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = revive(localStorage.getItem(KEY));
        if (saved) setS({ ...saved, now: Math.floor(Date.now() / 1000) });
      } catch {
        // storage blocked: start fresh
      }
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, freeze(s));
    } catch {
      // storage blocked: keep in memory only
    }
  }, [s, loaded]);

  const [taskId, setTaskId] = useState(1);
  const task = s.tasks.find((t) => t.id === taskId) ?? s.tasks[0];
  const totalSpent = s.tasks.reduce((a, t) => a + t.spent, 0n);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_1fr]" data-testid="practice">
      <aside className="grid content-start gap-3">
        <div className="card" data-noauto="">
          <div className="flex items-center justify-between gap-2">
            <p className="t-small muted">Owner wallet (sample)</p>
            <span className="badge sample">Sample data</span>
          </div>
          <p className="t-num mt-2 text-[26px]" data-testid="practice-balance">
            {u(s.wallets[PRACTICE_OWNER]?.[PRACTICE_TOKEN]?.balance ?? 0n)} <span className="text-[14px] muted">USDG</span>
          </p>
          <p className="t-small muted mt-1">
            allowance to the contract {u(s.wallets[PRACTICE_OWNER]?.[PRACTICE_TOKEN]?.allowance ?? 0n)} · spent on all tasks {u(totalSpent)}
          </p>
          <button
            type="button"
            className="rq-btn mt-4 w-full"
            onClick={() => {
              setS(practiceState());
              setTaskId(1);
            }}
            data-testid="practice-reset"
          >
            Reset sample data
          </button>
        </div>
        <div className="grid gap-2" role="list" aria-label="Tasks">
          {s.tasks.map((t) => (
            <button
              key={t.id}
              type="button"
              role="listitem"
              onClick={() => setTaskId(t.id)}
              className={`card text-left transition-colors ${t.id === task?.id ? "!bg-[var(--card-2)] ring-1 ring-[var(--line-2)]" : "hover:!bg-[var(--card-2)]"}`}
              data-testid={`practice-task-${t.id}`}
              data-noauto=""
            >
              <div className="flex items-center justify-between gap-2">
                <span className="t-small muted">Task #{t.id}</span>
                <StatusTag status={t.status} expired={s.now > t.deadline} />
              </div>
              <p className="mt-1 text-[18px] leading-tight">{t.title}</p>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="t-num text-[15px]">{u(t.spent)}</span>
                <span className="t-small muted">of {u(t.budget)} USDG</span>
              </div>
              <div className={`meter mt-2 ${t.spent * 10n >= t.budget * 9n ? "hot" : ""}`}>
                <i style={{ width: `${Number((t.spent * 1000n) / (t.budget || 1n)) / 10}%` }} />
              </div>
            </button>
          ))}
        </div>
        <NewTask state={s} onCreate={(n) => setS(n)} />
      </aside>
      {task ? <TaskPanel s={s} setS={setS} task={task} /> : null}
    </div>
  );
}

function StatusTag({ status, expired }: { status: PTask["status"]; expired: boolean }) {
  if (status === "closed") return <span className="tag grey"><i /> Closed</span>;
  if (status === "paused") return <span className="tag orange"><i /> Paused</span>;
  if (expired) return <span className="tag yellow"><i /> Expired</span>;
  return <span className="tag"><i /> Open</span>;
}

function TaskPanel({ s, setS, task }: { s: PState; setS: (s: PState) => void; task: PTask }) {
  const [providerId, setProviderId] = useState(Number(Object.keys(task.providers)[0] ?? 1));
  const [unitsText, setUnits] = useState("10");
  const [caller, setCaller] = useState<"agent" | "stranger">("agent");
  const [maxPrice, setMaxPrice] = useState("");
  const [log, setLog] = useState<{ kind: "ok" | "no" | "wait"; text: string }[]>([]);
  const [budgetText, setBudgetText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const p = s.providers.find((x) => x.id === providerId);
  const price = p?.prices[PRACTICE_TOKEN] ?? 0n;
  const n = Number.parseInt(unitsText, 10);
  const q = useMemo(
    () => ({
      taskId: task.id,
      providerId,
      units: Number.isFinite(n) && n >= 0 ? n : 0,
      requestHash: keccak256(stringToHex(`practice|${task.id}|${providerId}|${s.receipts.length}|${log.length}`)),
      maxPricePerUnit: maxPrice ? (parseUnits(maxPrice, DEC) ?? 0n) : price,
      caller: caller === "agent" ? (task.agent ?? PRACTICE_AGENT) : "0x000000000000000000000000000000000000bad1",
    }),
    [task, providerId, n, s.receipts.length, log.length, maxPrice, price, caller],
  );
  const preview = check(s, q);
  const receipts = s.receipts.filter((r) => r.taskId === task.id);
  const refusals = s.refusals.filter((r) => r.taskId === task.id);

  function run() {
    const steps: { kind: "ok" | "no" | "wait"; text: string }[] = [];
    steps.push({ kind: "wait", text: `GET provider #${providerId} → 402 · price ${u(price)} USDG per unit` });
    const r = pay(s, q);
    if (r.mask !== 0n) {
      steps.push({ kind: "no", text: `checkPay → refused (mask 0x${r.mask.toString(16)}): ${explainMask(r.mask).map((x) => x.key).join(", ")}` });
      steps.push({ kind: "no", text: "Nothing signed, nothing moved. Refusal recorded below." });
    } else {
      steps.push({ kind: "ok", text: `checkPay → 0 · cost ${u(r.receipt!.amount)} USDG` });
      steps.push({ kind: "ok", text: `pay() → transferFrom owner → provider · receipt #${r.receipt!.id}` });
      steps.push({ kind: "ok", text: "retry with receipt → 200 OK (sample)" });
    }
    setS(r.state);
    setLog(steps);
  }

  return (
    <section className="grid min-w-0 content-start gap-4" data-testid="practice-task">
      <div className="card" data-noauto="">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="t-small muted">Task #{task.id} · sample data</p>
            <h2 className="t-h3 mt-1">{task.title}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {task.status === "open" ? (
              <button type="button" className="rq-btn" onClick={() => setS(setStatus(s, task.id, "paused"))} data-testid="practice-pause">
                Pause
              </button>
            ) : task.status === "paused" ? (
              <button type="button" className="rq-btn" onClick={() => setS(setStatus(s, task.id, "open"))} data-testid="practice-resume">
                Resume
              </button>
            ) : null}
            {task.status !== "closed" ? (
              <button type="button" className="rq-btn text-[var(--bad)]" onClick={() => setS(setStatus(s, task.id, "closed"))} data-testid="practice-close">
                Close for good
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact k="Spent" v={`${u(task.spent)} USDG`} testid="practice-spent" />
          <Fact k="Budget" v={`${u(task.budget)} USDG`} />
          <Fact k="Per-call cap" v={task.perCallCap ? `${u(task.perCallCap)} USDG` : "none"} />
          <Fact k="Payments" v={String(task.payments)} />
        </div>
        <div className="rows mt-5">
          {Object.entries(task.providers).map(([id, a]) => {
            const prov = s.providers.find((x) => x.id === Number(id));
            return (
              <div key={id} className="kv">
                <span>
                  #{id} {prov?.name}
                </span>
                <span className="t-num">
                  {u(a.spent)} / {u(a.cap)} USDG
                </span>
              </div>
            );
          })}
        </div>
        {task.status !== "closed" ? (
          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = parseUnits(budgetText, DEC);
              const r = v === null ? "Enter a number." : setBudget(s, task.id, v);
              if (typeof r === "string") setMsg(r);
              else {
                setS(r);
                setMsg(null);
                setBudgetText("");
              }
            }}
          >
            <label className="field w-[180px]">
              <span>New budget (USDG)</span>
              <input className="input" inputMode="decimal" value={budgetText} onChange={(e) => setBudgetText(e.target.value)} placeholder={u(task.budget)} data-testid="practice-budget" />
            </label>
            <button type="submit" className="rq-btn h-[44px]">
              Set budget
            </button>
            {msg ? <p className="rq-alert w-full">{msg}</p> : null}
          </form>
        ) : null}
      </div>

      <div className="card" data-noauto="">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[21px]">The agent asks for a paid call</h3>
          <span className="badge sample">Sample data</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="field">
            <span>Provider</span>
            <select className="input" value={providerId} onChange={(e) => setProviderId(Number(e.target.value))} data-testid="practice-provider">
              {s.providers.map((x) => (
                <option key={x.id} value={x.id}>
                  #{x.id} {x.name.replace(" (sample)", "")}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Units</span>
            <input className="input" inputMode="numeric" value={unitsText} onChange={(e) => setUnits(e.target.value.replace(/\D/g, ""))} data-testid="practice-units" />
          </label>
          <label className="field">
            <span>Max price / unit</span>
            <input className="input" inputMode="decimal" value={maxPrice} placeholder={u(price)} onChange={(e) => setMaxPrice(e.target.value)} />
          </label>
          <label className="field">
            <span>Sent by</span>
            <select className="input" value={caller} onChange={(e) => setCaller(e.target.value as "agent" | "stranger")}>
              <option value="agent">the task&apos;s agent</option>
              <option value="stranger">another address</option>
            </select>
          </label>
        </div>
        <div className="mt-4 rounded-[14px] border border-[var(--line)] p-4" data-testid="practice-preview">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="t-small muted">Check before signing (same rules as checkPay)</span>
            <span className={`badge ${preview.mask === 0n ? "proto" : "bad"}`}>{preview.mask === 0n ? "Would pass" : "Would be refused"}</span>
          </div>
          <p className="t-num mt-2 text-[14px]">
            cost {u(preview.amount)} USDG · left {u(preview.budgetLeft)} USDG
          </p>
          {preview.mask !== 0n ? (
            <ul className="mt-2 grid gap-1 text-[13.5px] text-[var(--bad)]">
              {explainMask(preview.mask).map((r) => (
                <li key={r.key}>{r.words}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <button type="button" className="pill mt-4" onClick={run} data-testid="practice-run">
          Run the request
        </button>
        {log.length ? (
          <div className="flow mt-4" data-testid="practice-log">
            {log.map((l, i) => (
              <div key={`${i}-${l.text}`} style={{ animationDelay: `${i * 110}ms` }}>
                <span className={l.kind}>{l.kind === "ok" ? "✓" : l.kind === "no" ? "×" : "…"}</span>
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card" data-noauto="">
          <h3 className="text-[21px]">Receipts</h3>
          <p className="t-small muted">Cost per call, linked to this task. Sample data: no chain, no explorer link.</p>
          <div className="rows mt-3" data-testid="practice-receipts">
            {receipts.length === 0 ? <p className="t-small dim py-3">No payments yet.</p> : null}
            {receipts.slice(0, 12).map((r) => (
              <div key={r.id} className="kv">
                <span>
                  #{r.id} · provider {r.providerId} · {r.units} unit{r.units === 1 ? "" : "s"}
                </span>
                <span className="t-num">{u(r.amount)} USDG</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" data-noauto="">
          <h3 className="text-[21px]">Refused</h3>
          <p className="t-small muted">Recorded here, because a refused payment never reaches the chain.</p>
          <div className="rows mt-3" data-testid="practice-refusals">
            {refusals.length === 0 ? <p className="t-small dim py-3">Nothing refused yet.</p> : null}
            {refusals.slice(0, 12).map((r, i) => (
              <div key={i} className="kv">
                <span>
                  provider {r.providerId} · {r.units} units
                </span>
                <span className="text-[12.5px] text-[var(--bad)]">{explainMask(r.mask).map((x) => x.key).join(", ")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Fact({ k, v, testid }: { k: string; v: string; testid?: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--line)] p-3">
      <p className="t-small muted">{k}</p>
      <p className="t-num mt-1 text-[15px]" data-testid={testid}>
        {v}
      </p>
    </div>
  );
}

function NewTask({ state, onCreate }: { state: PState; onCreate: (s: PState) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("New research task");
  const [budget, setBudgetT] = useState("1");
  const [cap, setCap] = useState("0.1");
  const [days, setDays] = useState("2");
  const [picked, setPicked] = useState<number[]>([1]);
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" className="pill dark w-full" onClick={() => setOpen(true)} data-testid="practice-new">
        New practice task
      </button>
    );
  return (
    <form
      className="card grid gap-3"
      data-noauto=""
      onSubmit={(e) => {
        e.preventDefault();
        const b = parseUnits(budget, DEC);
        const c = parseUnits(cap || "0", DEC);
        const d = Number(days);
        if (b === null || c === null || !(d > 0)) return setErr("Check the numbers.");
        const providers = Object.fromEntries(picked.map((id) => [id, { cap: b, spent: 0n }]));
        const r = createTask(state, { title: title.slice(0, 60) || "Task", owner: PRACTICE_OWNER, agent: PRACTICE_AGENT, token: PRACTICE_TOKEN, budget: b, perCallCap: c, deadline: state.now + Math.round(d * 86400), providers });
        if (typeof r === "string") return setErr(r);
        onCreate(r);
        setOpen(false);
      }}
    >
      <label className="field">
        <span>Title</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="field">
          <span>Budget</span>
          <input className="input" value={budget} onChange={(e) => setBudgetT(e.target.value)} />
        </label>
        <label className="field">
          <span>Per call</span>
          <input className="input" value={cap} onChange={(e) => setCap(e.target.value)} />
        </label>
        <label className="field">
          <span>Days</span>
          <input className="input" value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
      </div>
      <fieldset className="grid gap-1 text-[14px]">
        <legend className="t-small muted mb-1">Approved providers (cap = budget)</legend>
        {state.providers.map((p) => (
          <label key={p.id} className="flex items-center gap-2">
            <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked((v) => (e.target.checked ? [...v, p.id] : v.filter((x) => x !== p.id)))} />
            #{p.id} {p.name}
          </label>
        ))}
      </fieldset>
      {err ? <p className="rq-alert">{err}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="pill sm">
          Create
        </button>
        <button type="button" className="rq-btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

