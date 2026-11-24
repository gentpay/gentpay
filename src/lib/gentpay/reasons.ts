/*
 * Refusal reasons of GentpayTaskBudgets.checkPay / pay, bit for bit the same as contracts/src/GentpayReceiptMath.sol
 * (reasons.test.ts reads the .sol and compares). A reverting transaction leaves no log, so the site always runs the check view
 * first and shows these words BEFORE anything is signed.
 */

export const REASONS = [
  { bit: 0, key: "NO_TASK", words: "The task does not exist." },
  { bit: 1, key: "TASK_CLOSED", words: "The owner closed this task." },
  { bit: 2, key: "TASK_PAUSED", words: "The owner paused this task." },
  { bit: 3, key: "TASK_EXPIRED", words: "The task's deadline has passed." },
  { bit: 4, key: "NOT_AGENT", words: "This address is not the task's agent (or its owner)." },
  { bit: 5, key: "PROVIDER_UNKNOWN", words: "No provider is registered under this id." },
  { bit: 6, key: "PROVIDER_NOT_APPROVED", words: "The owner has not approved this provider for the task." },
  { bit: 7, key: "PROVIDER_PAUSED", words: "The provider has switched itself off." },
  { bit: 8, key: "NO_PRICE", words: "The provider has no price for the task's token." },
  { bit: 9, key: "PRICE_ABOVE_MAX", words: "The provider's price is above the most the agent accepts." },
  { bit: 10, key: "UNITS_INVALID", words: "Zero units, or more units than the provider sells per call." },
  { bit: 11, key: "OVER_CALL_CAP", words: "The cost is above the task's per-call cap." },
  { bit: 12, key: "OVER_BUDGET", words: "The cost is above what is left of the task budget." },
  { bit: 13, key: "OVER_PROVIDER_CAP", words: "The cost is above what is left for this provider in the task." },
  { bit: 14, key: "REQUEST_USED", words: "This request already has a receipt in this task." },
  { bit: 15, key: "REQUEST_EMPTY", words: "The request hash is empty." },
  { bit: 16, key: "ALLOWANCE_LOW", words: "The owner's token allowance to the contract is below the cost." },
  { bit: 17, key: "BALANCE_LOW", words: "The owner's wallet holds less than the cost." },
  { bit: 18, key: "PAYEE_IS_PAYER", words: "The provider's payout address is the task owner itself." },
  { bit: 19, key: "COST_OVERFLOW", words: "Price times units is too large." },
] as const;

export type ReasonKey = (typeof REASONS)[number]["key"];
export const BIT = Object.fromEntries(REASONS.map((r) => [r.key, 1n << BigInt(r.bit)])) as Record<ReasonKey, bigint>;

/** The reasons set in a mask, in bit order. Unknown bits are reported too, never dropped. */
export function explainMask(mask: bigint | number | string): { key: string; words: string }[] {
  const m = BigInt(mask);
  const out: { key: string; words: string }[] = [];
  for (const r of REASONS) if (m & (1n << BigInt(r.bit))) out.push({ key: r.key, words: r.words });
  const known = REASONS.reduce((a, r) => a | (1n << BigInt(r.bit)), 0n);
  if (m & ~known) out.push({ key: "UNKNOWN", words: `Unknown reason bits 0x${(m & ~known).toString(16)}.` });
  return out;
}
