"use client";

import { encodeFunctionData } from "viem";
import { CONTRACTS } from "@/config/contracts";
import { ERC20_ABI, GENTPAY_ABI } from "@/lib/abi";
import { read, readMany, simulate, waitForReceipt } from "@/lib/client";

/* Browser reads and writes for GentpayTaskBudgets (through the site relay first). Every write is simulated before the wallet opens. */

export type LiveTask = {
  id: number;
  owner: string;
  agent: string;
  token: string;
  deadline: number;
  status: number; // 1 open, 2 paused, 3 closed
  budget: bigint;
  spent: bigint;
  perCallCap: bigint;
  payments: number;
  createdAt: number;
  providers: { id: number; cap: bigint; spent: bigint; price: bigint; payout: string; active: boolean }[];
};

export type LiveProvider = { id: number; controller: string; payout: string; active: boolean; maxUnitsPerCall: number; metaHash: string };

const C = () => CONTRACTS.contract as `0x${string}`;
const g = (fn: string, args: readonly unknown[] = []) => ({ to: C(), abi: GENTPAY_ABI, fn, args });

type RawTask = { owner: string; agent: string; token: string; deadline: bigint; status: number; budget: bigint; spent: bigint; perCallCap: bigint; payments: bigint; createdAt: bigint };
type RawProv = { controller: string; payout: string; active: boolean; maxUnitsPerCall: bigint; metaHash: string };

export async function loadTasks(address: string): Promise<LiveTask[]> {
  const [own, agent] = (await readMany([g("tasksOfOwner", [address]), g("tasksOfAgent", [address])])) as (readonly bigint[] | null)[];
  if (own === null || agent === null) throw new Error("The contract could not be read.");
  const ids = [...new Set([...own, ...agent].map(Number))].sort((a, b) => b - a).slice(0, 40);
  if (!ids.length) return [];
  const tasks = (await readMany(ids.map((id) => g("getTask", [BigInt(id)])))) as (RawTask | null)[];
  const lists = (await readMany(ids.map((id) => g("taskProviders", [BigInt(id)])))) as (readonly bigint[] | null)[];
  const out: LiveTask[] = [];
  for (let i = 0; i < ids.length; i++) {
    const t = tasks[i];
    if (!t) continue;
    const pids = (lists[i] ?? []).map(Number);
    const extra = (await readMany(
      pids.flatMap((p) => [g("providerCap", [BigInt(ids[i]), BigInt(p)]), g("providerSpent", [BigInt(ids[i]), BigInt(p)]), g("priceOf", [BigInt(p), t.token]), g("getProvider", [BigInt(p)])]),
    )) as unknown[];
    out.push({
      id: ids[i],
      owner: t.owner,
      agent: t.agent,
      token: t.token,
      deadline: Number(t.deadline),
      status: Number(t.status),
      budget: t.budget,
      spent: t.spent,
      perCallCap: t.perCallCap,
      payments: Number(t.payments),
      createdAt: Number(t.createdAt),
      providers: pids.map((p, k) => {
        const pr = extra[k * 4 + 3] as RawProv | null;
        return { id: p, cap: (extra[k * 4] as bigint) ?? 0n, spent: (extra[k * 4 + 1] as bigint) ?? 0n, price: (extra[k * 4 + 2] as bigint) ?? 0n, payout: pr?.payout ?? "", active: pr?.active ?? false };
      }),
    });
  }
  return out;
}

export async function loadProvider(id: number): Promise<LiveProvider | null> {
  const p = (await read<RawProv>(g("getProvider", [BigInt(id)]))) as RawProv;
  if (!p || /^0x0{40}$/i.test(p.controller)) return null;
  return { id, controller: p.controller, payout: p.payout, active: p.active, maxUnitsPerCall: Number(p.maxUnitsPerCall), metaHash: p.metaHash };
}

export async function providersOf(address: string): Promise<number[]> {
  return ((await read<readonly bigint[]>(g("providersOf", [address]))) ?? []).map(Number);
}

export async function priceOf(id: number, token: string): Promise<bigint> {
  return read<bigint>(g("priceOf", [BigInt(id), token]));
}

export async function checkPay(taskId: number, providerId: number, units: number, requestHash: string, maxPrice: bigint, caller: string) {
  const [mask, amount, left] = await read<readonly [bigint, bigint, bigint]>(g("checkPay", [BigInt(taskId), BigInt(providerId), BigInt(units), requestHash, maxPrice, caller]));
  return { mask, amount, left };
}

export async function tokenState(token: string, owner: string) {
  const [bal, allow] = (await readMany([
    { to: token, abi: ERC20_ABI, fn: "balanceOf", args: [owner] },
    { to: token, abi: ERC20_ABI, fn: "allowance", args: [owner, C()] },
  ])) as (bigint | null)[];
  return { balance: bal ?? 0n, allowance: allow ?? 0n };
}

export const enc = {
  createTask: (token: string, agent: string, budget: bigint, deadline: number, perCall: bigint, metaHash: string, ids: number[], caps: bigint[]) =>
    encodeFunctionData({ abi: GENTPAY_ABI, functionName: "createTask", args: [token, agent, budget, BigInt(deadline), perCall, metaHash, ids.map(BigInt), caps] }),
  pay: (taskId: number, providerId: number, units: number, requestHash: string, maxPrice: bigint) =>
    encodeFunctionData({ abi: GENTPAY_ABI, functionName: "pay", args: [BigInt(taskId), BigInt(providerId), BigInt(units), requestHash, maxPrice] }),
  status: (fn: "pauseTask" | "resumeTask" | "closeTask", taskId: number) => encodeFunctionData({ abi: GENTPAY_ABI, functionName: fn, args: [BigInt(taskId)] }),
  limits: (taskId: number, budget: bigint, deadline: number, perCall: bigint) => encodeFunctionData({ abi: GENTPAY_ABI, functionName: "setTaskLimits", args: [BigInt(taskId), budget, BigInt(deadline), perCall] }),
  setProvider: (taskId: number, providerId: number, cap: bigint) => encodeFunctionData({ abi: GENTPAY_ABI, functionName: "setTaskProvider", args: [BigInt(taskId), BigInt(providerId), cap] }),
  register: (payout: string, maxUnits: number, metaHash: string) => encodeFunctionData({ abi: GENTPAY_ABI, functionName: "registerProvider", args: [payout, BigInt(maxUnits), metaHash] }),
  setPrice: (id: number, token: string, price: bigint) => encodeFunctionData({ abi: GENTPAY_ABI, functionName: "setPrice", args: [BigInt(id), token, price] }),
  approve: (spender: string, amount: bigint) => encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender as `0x${string}`, amount] }),
};

/** Simulate, send from the wallet, wait. Returns the tx hash and block. */
export async function send(from: string, to: string, data: string, sendTransaction: (tx: { to?: string; data: string }) => Promise<string>) {
  await simulate(from, to, data);
  const hash = await sendTransaction({ to, data });
  const rc = await waitForReceipt(hash, 180_000);
  if (!rc.ok) throw new Error("The transaction reverted on chain.");
  return { hash, block: rc.blockNumber };
}
