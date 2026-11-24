import "server-only";
import { decodeEventLog, encodeEventTopics, decodeFunctionResult, encodeFunctionData, type Abi } from "viem";
import { CONTRACTS, contractLive } from "@/config/contracts";
import { GENTPAY_ABI } from "@/lib/abi";
import { scanBack } from "@/lib/logscan";
import { headBlock, logReader, rpc, type RawLog } from "@/lib/server/chainread";

/*
 * Receipts from chain. A payment's tx hash lives only in its Paid log, so receipts for a task come from a log scan (official RPC,
 * windows that shrink on size refusals, gaps reported, never skipped silently), and a single receipt can be looked up by its tx.
 * Every receipt is checked against the stored struct (getReceipt) before it is shown: a log alone is never trusted.
 */

export type ReceiptRow = {
  id: string;
  taskId: string;
  providerId: string;
  token: string;
  payee: string;
  caller: string;
  amount: string;
  units: string;
  pricePerUnit: string;
  requestHash: string;
  tx: string;
  block: number;
  confirmed: boolean;
};

const PAID_TOPIC = encodeEventTopics({ abi: GENTPAY_ABI, eventName: "Paid" })[0] as string;
const pad = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`;

function rowOf(l: RawLog): ReceiptRow | null {
  try {
    const d = decodeEventLog({ abi: GENTPAY_ABI, data: l.data as `0x${string}`, topics: l.topics as [`0x${string}`, ...`0x${string}`[]] });
    if (d.eventName !== "Paid") return null;
    const a = d.args as unknown as Record<string, bigint | string>;
    return {
      id: String(a.receiptId),
      taskId: String(a.taskId),
      providerId: String(a.providerId),
      token: String(a.token),
      payee: String(a.payee),
      caller: String(a.caller),
      amount: String(a.amount),
      units: String(a.units),
      pricePerUnit: String(a.pricePerUnit),
      requestHash: String(a.requestHash),
      tx: l.transactionHash,
      block: Number(BigInt(l.blockNumber)),
      confirmed: false,
    };
  } catch {
    return null;
  }
}

/** Confirms each row against the contract's stored receipt (same task, provider, amount, request hash). */
async function confirm(rows: ReceiptRow[]): Promise<ReceiptRow[]> {
  const out: ReceiptRow[] = [];
  for (const r of rows.slice(0, 200)) {
    try {
      const raw = await rpc<string>("eth_call", [{ to: CONTRACTS.contract, data: encodeFunctionData({ abi: GENTPAY_ABI, functionName: "getReceipt", args: [BigInt(r.id)] }) }, "latest"]);
      const s = decodeFunctionResult({ abi: GENTPAY_ABI as Abi, functionName: "getReceipt", data: raw as `0x${string}` }) as unknown as Record<string, bigint | string>;
      const ok = String(s.taskId) === r.taskId && String(s.providerId) === r.providerId && String(s.amount) === r.amount && String(s.requestHash).toLowerCase() === r.requestHash.toLowerCase();
      out.push({ ...r, confirmed: ok });
    } catch {
      out.push(r);
    }
  }
  return out;
}

export type TaskReceipts = { rows: ReceiptRow[]; fromBlock: number; toBlock: number; gaps: [number, number][]; complete: boolean };

async function scanTask(key: string): Promise<TaskReceipts> {
  const taskId = BigInt(key);
  const head = await headBlock();
  const from = Math.max(0, CONTRACTS.block || 0);
  const res = await scanBack(logReader({ address: CONTRACTS.contract, topics: [PAID_TOPIC, null, pad(taskId)] }), from, head, { maxCalls: 40, retryDelayMs: 1_000 });
  const rows = res.logs.map((l) => rowOf(l as RawLog)).filter((x): x is ReceiptRow => x !== null && x.taskId === key);
  rows.sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)));
  return { rows: await confirm(rows), fromBlock: from, toBlock: head, gaps: res.gaps, complete: res.gaps.length === 0 };
}

// Complete scans only are cached (15 s, at most 300 tasks); an incomplete one is answered as such and read again next time.
const cache = new Map<string, { at: number; value: TaskReceipts }>();
const flying = new Map<string, Promise<TaskReceipts>>();

export async function receiptsOfTask(taskId: bigint): Promise<TaskReceipts> {
  if (!contractLive()) throw new Error("not deployed");
  // The cache key carries the task's on-chain payment count, so a new payment is never hidden behind a cached list.
  const raw = await rpc<string>("eth_call", [{ to: CONTRACTS.contract, data: encodeFunctionData({ abi: GENTPAY_ABI, functionName: "getTask", args: [taskId] }) }, "latest"]);
  const task = decodeFunctionResult({ abi: GENTPAY_ABI as Abi, functionName: "getTask", data: raw as `0x${string}` }) as unknown as { payments: bigint };
  const key = `${taskId}:${task.payments}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit.value;
  const busy = flying.get(key);
  if (busy) return busy;
  const p = scanTask(taskId.toString())
    .then((value) => {
      if (value.complete && value.rows.every((r) => r.confirmed)) {
        if (cache.size >= 300) cache.clear();
        cache.set(key, { at: Date.now(), value });
      }
      return value;
    })
    .finally(() => flying.delete(key));
  flying.set(key, p);
  return p;
}

/** Receipts written by one transaction (only logs from Gentpay's own contract count). */
export async function receiptsOfTx(tx: string): Promise<{ rows: ReceiptRow[]; status: "ok" | "failed" | "missing" }> {
  if (!contractLive()) throw new Error("not deployed");
  const rc = await rpc<{ status: string; logs: RawLog[] } | null>("eth_getTransactionReceipt", [tx]);
  if (!rc) return { rows: [], status: "missing" };
  if (rc.status !== "0x1") return { rows: [], status: "failed" };
  const mine = rc.logs.filter((l) => l.address.toLowerCase() === CONTRACTS.contract.toLowerCase() && l.topics[0] === PAID_TOPIC);
  const rows = mine.map((l) => rowOf({ ...l, transactionHash: tx })).filter((x): x is ReceiptRow => x !== null);
  return { rows: await confirm(rows), status: "ok" };
}
