import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BIT, REASONS, explainMask } from "./reasons";

const SOL = readFileSync(new URL("../../../contracts/src/GentpayReceiptMath.sol", import.meta.url), "utf8");

test("every reason bit equals the Solidity library's constant", () => {
  const found = [...SOL.matchAll(/uint256 internal constant (\w+) = 1 << (\d+);/g)].map((m) => [m[1], Number(m[2])] as const);
  assert.equal(found.length, REASONS.length);
  for (const [key, bit] of found) assert.equal(REASONS.find((r) => r.key === key)?.bit, bit, key);
  assert.match(SOL, new RegExp(`REASON_COUNT = ${REASONS.length};`));
});

test("explainMask keeps order and reports unknown bits", () => {
  const m = BIT.TASK_PAUSED | BIT.OVER_BUDGET | (1n << 40n);
  const e = explainMask(m);
  assert.deepEqual(e.map((x) => x.key), ["TASK_PAUSED", "OVER_BUDGET", "UNKNOWN"]);
  assert.deepEqual(explainMask(0n), []);
});
