import { BIT } from "@/lib/gentpay/reasons";

/*
 * Practice engine: the contract's rules (GentpayTaskBudgets._check / pay) in TypeScript, so the whole flow runs in the browser on
 * sample data without a wallet. Same order of checks, same reason bits, same integer maths (bigint, uint128 overflow).
 * engine.test.ts replays the contract's unit-test scenarios against it.
 */

export type Status = "open" | "paused" | "closed";

export type PTask = {
  id: number;
  title: string;
  owner: string;
  agent: string | null;
  token: string;
  budget: bigint;
  spent: bigint;
  perCallCap: bigint;
  deadline: number;
  status: Status;
  payments: number;
  providers: Record<number, { cap: bigint; spent: bigint }>;
};

export type PProvider = { id: number; name: string; controller: string; payout: string; active: boolean; maxUnitsPerCall: number; prices: Record<string, bigint> };

export type PReceipt = {
  id: number;
  taskId: number;
  providerId: number;
  units: number;
  amount: bigint;
  pricePerUnit: bigint;
  token: string;
  payer: string;
  payee: string;
  caller: string;
  requestHash: string;
  at: number;
};

export type PWallet = { balance: bigint; allowance: bigint };

export type PState = {
  now: number;
  tasks: PTask[];
  providers: PProvider[];
  receipts: PReceipt[];
  /** Owner wallets: token balance and allowance to the contract, per token (lowercase). */
  wallets: Record<string, Record<string, PWallet>>;
  /** Refusals the dashboard records locally (a reverted transaction leaves no log). */
  refusals: { at: number; taskId: number; providerId: number; units: number; mask: bigint }[];
};

const MAX128 = (1n << 128n) - 1n;
const lc = (a: string) => a.toLowerCase();

export function cost(price: bigint, units: bigint): { amount: bigint; ok: boolean } {
  if (units === 0n || price === 0n) return { amount: 0n, ok: true };
  if (price > MAX128 / units) return { amount: 0n, ok: false };
  return { amount: price * units, ok: true };
}

const left = (cap: bigint, used: bigint) => (used >= cap ? 0n : cap - used);

export type CheckIn = { taskId: number; providerId: number; units: number; requestHash: string; maxPricePerUnit: bigint; caller: string };

/** Same as GentpayTaskBudgets.checkPay: (reasons, amount, budgetLeft). */
export function check(s: PState, q: CheckIn): { mask: bigint; amount: bigint; budgetLeft: bigint } {
  const t = s.tasks.find((x) => x.id === q.taskId);
  if (!t) return { mask: BIT.NO_TASK, amount: 0n, budgetLeft: 0n };
  let r = 0n;
  const budgetLeft = left(t.budget, t.spent);
  if (t.status === "closed") r |= BIT.TASK_CLOSED;
  if (t.status === "paused") r |= BIT.TASK_PAUSED;
  if (s.now > t.deadline) r |= BIT.TASK_EXPIRED;
  if (lc(q.caller) !== lc(t.owner) && (!t.agent || lc(q.caller) !== lc(t.agent))) r |= BIT.NOT_AGENT;
  if (/^0x0{64}$/.test(q.requestHash)) r |= BIT.REQUEST_EMPTY;
  else if (s.receipts.some((x) => x.taskId === t.id && lc(x.requestHash) === lc(q.requestHash))) r |= BIT.REQUEST_USED;

  const p = s.providers.find((x) => x.id === q.providerId);
  if (!p) return { mask: r | BIT.PROVIDER_UNKNOWN, amount: 0n, budgetLeft };
  const approval = t.providers[p.id];
  if (!approval || approval.cap === 0n) r |= BIT.PROVIDER_NOT_APPROVED;
  if (!p.active) r |= BIT.PROVIDER_PAUSED;
  if (lc(p.payout) === lc(t.owner)) r |= BIT.PAYEE_IS_PAYER;
  if (q.units === 0 || (p.maxUnitsPerCall !== 0 && q.units > p.maxUnitsPerCall)) r |= BIT.UNITS_INVALID;

  const price = p.prices[lc(t.token)] ?? 0n;
  if (price === 0n) return { mask: r | BIT.NO_PRICE, amount: 0n, budgetLeft };
  if (price > q.maxPricePerUnit) r |= BIT.PRICE_ABOVE_MAX;
  const c = cost(price, BigInt(q.units));
  if (!c.ok) return { mask: r | BIT.COST_OVERFLOW, amount: 0n, budgetLeft };
  if (q.units === 0) return { mask: r, amount: 0n, budgetLeft };

  const amount = c.amount;
  if (t.perCallCap !== 0n && amount > t.perCallCap) r |= BIT.OVER_CALL_CAP;
  if (amount > budgetLeft) r |= BIT.OVER_BUDGET;
  if (approval && approval.cap !== 0n && amount > left(approval.cap, approval.spent)) r |= BIT.OVER_PROVIDER_CAP;
  const w = s.wallets[lc(t.owner)]?.[lc(t.token)] ?? { balance: 0n, allowance: 0n };
  if (w.allowance < amount) r |= BIT.ALLOWANCE_LOW;
  if (w.balance < amount) r |= BIT.BALANCE_LOW;
  return { mask: r, amount, budgetLeft };
}

/** Same as pay(): either a new state with a receipt, or the refusal mask (recorded in `refusals`). */
export function pay(s: PState, q: CheckIn): { state: PState; receipt: PReceipt | null; mask: bigint } {
  const c = check(s, q);
  if (c.mask !== 0n) {
    return { state: { ...s, refusals: [{ at: s.now, taskId: q.taskId, providerId: q.providerId, units: q.units, mask: c.mask }, ...s.refusals].slice(0, 50) }, receipt: null, mask: c.mask };
  }
  const t = s.tasks.find((x) => x.id === q.taskId)!;
  const p = s.providers.find((x) => x.id === q.providerId)!;
  const tok = lc(t.token);
  const receipt: PReceipt = {
    id: s.receipts.length + 1,
    taskId: t.id,
    providerId: p.id,
    units: q.units,
    amount: c.amount,
    pricePerUnit: p.prices[tok],
    token: t.token,
    payer: t.owner,
    payee: p.payout,
    caller: q.caller,
    requestHash: q.requestHash,
    at: s.now,
  };
  const ow = s.wallets[lc(t.owner)][tok];
  const wallets = {
    ...s.wallets,
    [lc(t.owner)]: { ...s.wallets[lc(t.owner)], [tok]: { balance: ow.balance - c.amount, allowance: ow.allowance === MAX128 * 2n ? ow.allowance : ow.allowance - c.amount } },
  };
  const tasks = s.tasks.map((x) =>
    x.id !== t.id ? x : { ...x, spent: x.spent + c.amount, payments: x.payments + 1, providers: { ...x.providers, [p.id]: { ...x.providers[p.id], spent: x.providers[p.id].spent + c.amount } } },
  );
  return { state: { ...s, tasks, wallets, receipts: [receipt, ...s.receipts] }, receipt, mask: 0n };
}

/** Owner actions with the contract's own input rules (budget never below spent, closed is final). */
export function setStatus(s: PState, taskId: number, status: Status): PState {
  return { ...s, tasks: s.tasks.map((t) => (t.id !== taskId || t.status === "closed" ? t : { ...t, status })) };
}

export function setBudget(s: PState, taskId: number, budget: bigint): PState | string {
  const t = s.tasks.find((x) => x.id === taskId);
  if (!t || t.status === "closed") return "The task is closed.";
  if (budget === 0n || budget < t.spent) return "The budget can never go below what is already spent.";
  return { ...s, tasks: s.tasks.map((x) => (x.id === taskId ? { ...x, budget } : x)) };
}

export function createTask(s: PState, t: Omit<PTask, "id" | "spent" | "payments" | "status">): PState | string {
  if (t.budget === 0n) return "The budget must be above zero.";
  if (t.deadline <= s.now) return "The deadline must be in the future.";
  for (const id of Object.keys(t.providers)) if (!s.providers.some((p) => p.id === Number(id))) return `Provider ${id} does not exist.`;
  const id = (s.tasks.reduce((m, x) => Math.max(m, x.id), 0) || 0) + 1;
  return { ...s, tasks: [{ ...t, id, spent: 0n, payments: 0, status: "open" }, ...s.tasks] };
}
