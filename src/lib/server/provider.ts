import "server-only";
import { decodeFunctionResult, encodeFunctionData, type Abi } from "viem";
import { CHAIN } from "@/config/brand";
import { CONTRACTS, contractLive } from "@/config/contracts";
import { DEFAULT_STABLE } from "@/config/tokens";
import { GENTPAY_ABI } from "@/lib/abi";
import { requestHash, REQUEST_VERSION, RECEIPT_HEADER } from "@/lib/gentpay/request";
import { rpc } from "@/lib/server/chainread";
import type { Store } from "@/lib/server/store";

/*
 * The site's sample data provider: an x402-style HTTP flow (HTTP 402 with a price, the client pays, then retries with proof).
 * It is NOT the x402 protocol and claims no compatibility with it: the proof is a Gentpay receipt on Robinhood Chain, checked here
 * with eth_call before any data is served. Rules:
 *   - the receipt for (task, requestHash) must exist, be for THIS provider id and the accepted token, and cover >= 1 unit;
 *   - requestHash is recomputed from the request being served (method, path + query, the agent's nonce), so a receipt for one URL
 *     cannot unlock another;
 *   - it must be at most RECEIPT_MAX_AGE seconds old (by the block time stored in the receipt);
 *   - each receipt is redeemed once (shared store when configured, else per server instance + the age limit).
 */

export const RECEIPT_MAX_AGE = 900;
export const UNITS_PER_CALL = 1n;

const call = async (fn: string, args: readonly unknown[]) => {
  const raw = await rpc<string>("eth_call", [{ to: CONTRACTS.contract, data: encodeFunctionData({ abi: GENTPAY_ABI, functionName: fn, args } as never) }, "latest"]);
  return decodeFunctionResult({ abi: GENTPAY_ABI as Abi, functionName: fn, data: raw as `0x${string}` } as never) as unknown;
};

export type Quote = { providerId: number; token: string; symbol: string; decimals: number; pricePerUnit: string; active: boolean; payout: string };

export async function quote(): Promise<Quote | null> {
  if (!contractLive() || !CONTRACTS.sampleProvider) return null;
  const id = BigInt(CONTRACTS.sampleProvider);
  const [p, price] = await Promise.all([call("getProvider", [id]) as Promise<{ payout: string; active: boolean; controller: string }>, call("priceOf", [id, DEFAULT_STABLE.address]) as Promise<bigint>]);
  if (!p || /^0x0{40}$/i.test(p.controller)) return null;
  return { providerId: Number(id), token: DEFAULT_STABLE.address, symbol: DEFAULT_STABLE.symbol, decimals: DEFAULT_STABLE.decimals, pricePerUnit: price.toString(), active: p.active, payout: p.payout };
}

export function paymentRequired(q: Quote, pathWithQuery: string) {
  return {
    error: "Payment required",
    scheme: "gentpay-receipt-v1",
    note: "x402-style flow with a Gentpay receipt on Robinhood Chain as proof. Not the x402 protocol.",
    chainId: CHAIN.id,
    contract: CONTRACTS.contract,
    providerId: q.providerId,
    token: q.token,
    symbol: q.symbol,
    decimals: q.decimals,
    pricePerUnit: q.pricePerUnit,
    units: Number(UNITS_PER_CALL),
    request: { method: "GET", path: pathWithQuery },
    requestHash: `keccak256(utf8("${REQUEST_VERSION}|<providerId>|<METHOD>|<path?query>|<nonce>")), nonce = 32 random bytes chosen by you`,
    pay: "GentpayTaskBudgets.pay(taskId, providerId, units, requestHash, maxPricePerUnit) from the task's agent or owner",
    retryWith: `${RECEIPT_HEADER}: <taskId>:<nonce>`,
    receiptMaxAgeSeconds: RECEIPT_MAX_AGE,
  };
}

export type Verdict = { ok: true; receiptId: string; amount: string; units: string } | { ok: false; status: number; error: string };

const used = new Map<string, number>();

/** Redeem-once. With a shared store a receipt opens one response across all instances. */
async function redeem(store: Store | null, key: string): Promise<boolean> {
  if (store) {
    try {
      return await store.setNx(`redeemed:${key}`, "1", 86_400);
    } catch {
      // fall through to the instance map
    }
  }
  const now = Date.now();
  if (used.size > 5_000) for (const [k, t] of used) if (now - t > RECEIPT_MAX_AGE * 1000) used.delete(k);
  if (used.has(key)) return false;
  used.set(key, now);
  return true;
}

export async function verifyReceipt(q: Quote, taskId: bigint, nonce: `0x${string}`, method: string, pathWithQuery: string, store: Store | null, nowSec: number): Promise<Verdict> {
  const h = requestHash(q.providerId, method, pathWithQuery, nonce);
  const [id, r] = (await call("receiptFor", [taskId, h])) as [bigint, { providerId: bigint; units: bigint; amount: bigint; token: string; timestamp: bigint; taskId: bigint }];
  if (id === 0n) return { ok: false, status: 402, error: "No receipt on chain for this task and request. Pay first (the request hash covers method, path, query and your nonce)." };
  if (r.taskId !== taskId || Number(r.providerId) !== q.providerId) return { ok: false, status: 402, error: "The receipt pays another provider." };
  if (r.token.toLowerCase() !== q.token.toLowerCase()) return { ok: false, status: 402, error: `The receipt is in another token; this provider takes ${q.symbol}.` };
  if (r.units < UNITS_PER_CALL || r.amount === 0n) return { ok: false, status: 402, error: "The receipt covers fewer units than this call needs." };
  if (nowSec - Number(r.timestamp) > RECEIPT_MAX_AGE) return { ok: false, status: 402, error: `The receipt is older than ${RECEIPT_MAX_AGE / 60} minutes. Pay for a fresh request.` };
  if (!(await redeem(store, `${taskId}:${h}`))) return { ok: false, status: 409, error: "This receipt was already redeemed." };
  return { ok: true, receiptId: id.toString(), amount: r.amount.toString(), units: r.units.toString() };
}
