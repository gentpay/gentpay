import { test } from "node:test";
import assert from "node:assert/strict";
import { BIT } from "./reasons";
import { check, cost, pay, setBudget, setStatus, type PState } from "./engine";
import { PRACTICE_AGENT, PRACTICE_OWNER, PRACTICE_TOKEN, practiceState } from "./sample";

/* Scenarios mirrored from contracts/test/GentpayTaskBudgets.t.sol: the same inputs give the same reason masks. */

const NOW = 1_800_000_000;
const req = (s: string) => "0x" + Buffer.from(s.padEnd(32, "_")).toString("hex").slice(0, 64);
const q = (o: Partial<Parameters<typeof check>[1]> = {}) => ({ taskId: 1, providerId: 1, units: 10, requestHash: req("a"), maxPricePerUnit: 2_000n, caller: PRACTICE_AGENT, ...o });

test("happy path: cost = price x units, receipt stored, budget and provider spend move", () => {
  const s = practiceState(NOW);
  const r = pay(s, q());
  assert.equal(r.mask, 0n);
  assert.equal(r.receipt?.amount, 20_000n);
  const t = r.state.tasks.find((x) => x.id === 1)!;
  assert.equal(t.spent, 20_000n);
  assert.equal(t.providers[1].spent, 20_000n);
  assert.equal(r.state.wallets[PRACTICE_OWNER][PRACTICE_TOKEN].balance, 40_000_000n - 20_000n);
});

test("replayed request, stranger, unapproved provider, paused, expired", () => {
  let s: PState = pay(practiceState(NOW), q()).state;
  assert.equal(check(s, q()).mask, BIT.REQUEST_USED);
  assert.equal(check(s, q({ requestHash: req("b"), caller: "0x0000000000000000000000000000000000000bad" })).mask, BIT.NOT_AGENT);
  assert.ok(check(s, q({ requestHash: req("b"), providerId: 3, maxPricePerUnit: 10n ** 9n })).mask & BIT.PROVIDER_NOT_APPROVED);
  assert.equal(check(s, q({ providerId: 99 })).mask & BIT.PROVIDER_UNKNOWN, BIT.PROVIDER_UNKNOWN);
  s = setStatus(s, 1, "paused");
  assert.ok(check(s, q({ requestHash: req("c") })).mask & BIT.TASK_PAUSED);
  s = setStatus(s, 1, "open");
  assert.equal(check({ ...s, now: NOW + 4 * 86400 }, q({ requestHash: req("c") })).mask, BIT.TASK_EXPIRED);
  s = setStatus(s, 1, "closed");
  s = setStatus(s, 1, "open");
  assert.equal(s.tasks.find((t) => t.id === 1)!.status, "closed", "closed is final");
});

test("caps: per call, provider cap, budget, allowance, balance, price above max, units", () => {
  const s = practiceState(NOW);
  // provider 2 costs 0.05 per unit, per-call cap 0.25 => 6 units = 0.30 refused
  assert.ok(check(s, q({ providerId: 2, units: 6, maxPricePerUnit: 50_000n })).mask & BIT.OVER_CALL_CAP);
  assert.equal(check(s, q({ providerId: 2, units: 5, maxPricePerUnit: 50_000n })).mask, 0n);
  assert.ok(check(s, q({ maxPricePerUnit: 1_999n })).mask & BIT.PRICE_ABOVE_MAX);
  assert.ok(check(s, q({ units: 0 })).mask & BIT.UNITS_INVALID);
  assert.ok(check(s, q({ units: 101 })).mask & BIT.UNITS_INVALID);
  const poor: PState = { ...s, wallets: { [PRACTICE_OWNER]: { [PRACTICE_TOKEN]: { balance: 1n, allowance: 1n } } } };
  assert.equal(check(poor, q()).mask, BIT.ALLOWANCE_LOW | BIT.BALANCE_LOW);
  // task 2: budget 0.5 at 0.01/unit; 20 units per call max => spend 0.40 then 0.20 is over budget
  let t2 = pay(s, q({ taskId: 2, providerId: 3, units: 20, maxPricePerUnit: 10_000n })).state;
  t2 = pay(t2, q({ taskId: 2, providerId: 3, units: 20, maxPricePerUnit: 10_000n, requestHash: req("2") })).state;
  const over = check(t2, q({ taskId: 2, providerId: 3, units: 20, maxPricePerUnit: 10_000n, requestHash: req("3") }));
  assert.ok(over.mask & BIT.OVER_BUDGET);
  assert.ok(over.mask & BIT.OVER_PROVIDER_CAP);
  assert.equal(over.budgetLeft, 100_000n);
});

test("refusals are recorded locally, budgets never drop below spent", () => {
  const s = pay(practiceState(NOW), q()).state;
  const r = pay(s, q());
  assert.equal(r.receipt, null);
  assert.equal(r.state.refusals[0].mask, BIT.REQUEST_USED);
  assert.equal(typeof setBudget(s, 1, 19_999n), "string");
  assert.notEqual(typeof setBudget(s, 1, 20_000n), "string");
});

test("cost overflow mirrors uint128", () => {
  const max = (1n << 128n) - 1n;
  assert.deepEqual(cost(max, 2n), { amount: 0n, ok: false });
  assert.deepEqual(cost(max, 1n), { amount: max, ok: true });
  assert.deepEqual(cost(0n, 5n), { amount: 0n, ok: true });
});
