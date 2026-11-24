import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, encodeFunctionResult, type Abi } from "viem";

/* The sample provider's receipt check against a fake chain: right receipt passes once; wrong provider, token, URL, age, or a replay fail. */

const CONTRACT = "0x00000000000000000000000000000000000c0de1";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
process.env.NEXT_PUBLIC_GENTPAY_TEST_CONTRACTS = JSON.stringify({ contract: CONTRACT, block: 1, sampleProvider: 1 });
process.env.ROBINHOOD_RPC_URL = "http://127.0.0.1:1";

const mods = Promise.all([import("../abi"), import("../gentpay/request"), import("./provider")]);

const NONCE = `0x${"11".repeat(32)}` as const;
const PATH = "/api/provider/sample?topic=chain";
const NOW = 1_800_000_000;
type R = { taskId: bigint; providerId: bigint; units: bigint; amount: bigint; token: string; timestamp: bigint };
let receipts = new Map<string, R & { id: bigint }>();

const empty = { taskId: 0n, providerId: 0n, units: 0n, chainBlock: 0n, timestamp: 0n, amount: 0n, pricePerUnit: 0n, token: "0x0000000000000000000000000000000000000000", payer: "0x0000000000000000000000000000000000000000", payee: "0x0000000000000000000000000000000000000000", caller: "0x0000000000000000000000000000000000000000", requestHash: `0x${"00".repeat(32)}` };

globalThis.fetch = (async (_url: string, init: { body: string }) => {
  const [{ GENTPAY_ABI }] = await mods;
  const body = JSON.parse(init.body);
  const one = (c: { id: number; params: [{ data: `0x${string}` }] }) => {
    const d = decodeFunctionData({ abi: GENTPAY_ABI as Abi, data: c.params[0].data });
    const [task, h] = d.args as [bigint, string];
    const r = receipts.get(`${task}:${h}`);
    const result = encodeFunctionResult({ abi: GENTPAY_ABI as Abi, functionName: "receiptFor", result: r ? [r.id, { ...empty, ...r, requestHash: h }] : [0n, empty] } as never);
    return { jsonrpc: "2.0", id: c.id, result };
  };
  const out = Array.isArray(body) ? body.map(one) : one(body);
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const Q = { providerId: 1, token: USDG, symbol: "USDG", decimals: 6, pricePerUnit: "2000", active: true, payout: "0x0000000000000000000000000000000000000b01" };
const put = async (over: Partial<R> = {}, path = PATH, nonce: string = NONCE) => {
  const [, { requestHash }] = await mods;
  const h = requestHash(1, "GET", path, nonce);
  receipts.set(`7:${h}`, { id: 5n, taskId: 7n, providerId: 1n, units: 1n, amount: 2000n, token: USDG, timestamp: BigInt(NOW - 30), ...over });
};

test("a fresh receipt for this provider, token and URL passes once, then is a replay", async () => {
  const [, , { verifyReceipt }] = await mods;
  receipts = new Map();
  await put();
  const ok = await verifyReceipt(Q, 7n, NONCE, "GET", PATH, null, NOW);
  assert.deepEqual(ok, { ok: true, receiptId: "5", amount: "2000", units: "1" });
  const again = await verifyReceipt(Q, 7n, NONCE, "GET", PATH, null, NOW);
  assert.equal(again.ok, false);
  assert.equal(!again.ok && again.status, 409);
});

test("no receipt, another provider, another token, too old, or another URL: 402", async () => {
  const [, , { verifyReceipt }] = await mods;
  const n = (k: number) => `0x${String(k).padStart(2, "0").repeat(32)}` as `0x${string}`;
  receipts = new Map();
  assert.equal((await verifyReceipt(Q, 7n, n(21), "GET", PATH, null, NOW)).ok, false);
  await put({ providerId: 2n }, PATH, n(22));
  const p = await verifyReceipt(Q, 7n, n(22), "GET", PATH, null, NOW);
  assert.ok(!p.ok && /another provider/.test(p.error));
  await put({ token: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34" }, PATH, n(23));
  const t = await verifyReceipt(Q, 7n, n(23), "GET", PATH, null, NOW);
  assert.ok(!t.ok && /another token/.test(t.error));
  await put({ timestamp: BigInt(NOW - 3600) }, PATH, n(24));
  const o = await verifyReceipt(Q, 7n, n(24), "GET", PATH, null, NOW);
  assert.ok(!o.ok && /older/.test(o.error));
  await put({}, "/api/provider/sample?topic=stablecoins", n(25));
  const u = await verifyReceipt(Q, 7n, n(25), "GET", PATH, null, NOW);
  assert.ok(!u.ok && u.status === 402);
});
