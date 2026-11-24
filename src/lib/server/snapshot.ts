import "server-only";
import { decodeFunctionResult, encodeFunctionData, type Abi } from "viem";
import { CONTRACTS, contractLive } from "@/config/contracts";
import { ETH_USD_FEED, STABLES } from "@/config/tokens";
import { ERC20_ABI, FEED_ABI, GENTPAY_ABI } from "@/lib/abi";
import { rpcBatch } from "@/lib/server/chainread";

/*
 * Live facts for every page, read in two JSON-RPC batches from Robinhood Chain: head block and its time, block time over the last
 * 100,000 blocks, gas price, Chainlink ETH/USD, each proven stablecoin's total supply + decimals + Chainlink price, and — once the
 * contract is deployed — its code and counters (tasks, providers, receipts). A failed read is null, never a made-up number.
 */

export type StableLive = { symbol: string; address: string; supply: string | null; decimals: number | null; price: number | null; updatedAt: number | null; feed: string };

export type ChainSnapshot = {
  block: number | null;
  time: number | null;
  blockSeconds: number | null;
  gasPriceWei: string | null;
  ethUsd: { price: number; updatedAt: number; feed: string } | null;
  stables: StableLive[];
  contract: { address: string; code: boolean | null; tasks: number | null; providers: number | null; receipts: number | null } | null;
  readAt: number;
};

const SPAN = 100_000;
const call = (to: string, abi: Abi, fn: string) => ({ method: "eth_call", params: [{ to, data: encodeFunctionData({ abi, functionName: fn } as never) }, "latest"] });
const dec = (abi: Abi, fn: string, raw: unknown): unknown => {
  if (typeof raw !== "string" || raw.length <= 2) return null;
  try {
    return decodeFunctionResult({ abi, functionName: fn, data: raw as `0x${string}` } as never);
  } catch {
    return null;
  }
};

export async function readSnapshot(): Promise<ChainSnapshot> {
  const head = await rpcBatch<unknown>([{ method: "eth_getBlockByNumber", params: ["latest", false] }]).catch(() => [null]);
  const blk = head[0] as { number?: string; timestamp?: string } | null;
  const n = blk?.number ? Number(BigInt(blk.number)) : null;
  const live = contractLive();
  const calls = [
    { method: "eth_gasPrice", params: [] },
    call(ETH_USD_FEED, FEED_ABI, "latestRoundData"),
    { method: "eth_getBlockByNumber", params: [`0x${Math.max(0, (n ?? SPAN) - SPAN).toString(16)}`, false] },
    ...STABLES.flatMap((s) => [call(s.address, ERC20_ABI, "totalSupply"), call(s.address, ERC20_ABI, "decimals"), call(s.feed, FEED_ABI, "latestRoundData")]),
    ...(live
      ? [
          { method: "eth_getCode", params: [CONTRACTS.contract, "latest"] },
          call(CONTRACTS.contract, GENTPAY_ABI, "taskCount"),
          call(CONTRACTS.contract, GENTPAY_ABI, "providerCount"),
          call(CONTRACTS.contract, GENTPAY_ABI, "receiptCount"),
        ]
      : []),
  ];
  const r = await rpcBatch<unknown>(calls).catch(() => calls.map(() => null));
  const time = blk?.timestamp ? Number(BigInt(blk.timestamp)) : null;
  const round = (raw: unknown) => {
    const v = dec(FEED_ABI as Abi, "latestRoundData", raw) as readonly [bigint, bigint, bigint, bigint, bigint] | null;
    return v && v[1] > 0n ? { price: Number(v[1]) / 1e8, updatedAt: Number(v[3]) } : null;
  };
  const eth = round(r[1]);
  const old = n !== null ? (r[2] as { timestamp?: string } | null) : null;
  const blockSeconds = time !== null && old?.timestamp ? (time - Number(BigInt(old.timestamp))) / SPAN : null;
  const stables: StableLive[] = STABLES.map((s, i) => {
    const base = 3 + i * 3;
    const supply = dec(ERC20_ABI as Abi, "totalSupply", r[base]) as bigint | null;
    const d = dec(ERC20_ABI as Abi, "decimals", r[base + 1]) as number | null;
    const p = round(r[base + 2]);
    return { symbol: s.symbol, address: s.address, supply: supply === null ? null : supply.toString(), decimals: d === null ? null : Number(d), price: p?.price ?? null, updatedAt: p?.updatedAt ?? null, feed: s.feed };
  });
  let contract: ChainSnapshot["contract"] = null;
  if (live) {
    const c0 = 3 + STABLES.length * 3;
    const num = (fn: string, raw: unknown) => {
      const v = dec(GENTPAY_ABI, fn, raw) as bigint | null;
      return v === null ? null : Number(v);
    };
    contract = {
      address: CONTRACTS.contract,
      code: typeof r[c0] === "string" ? (r[c0] as string).length > 2 : null,
      tasks: num("taskCount", r[c0 + 1]),
      providers: num("providerCount", r[c0 + 2]),
      receipts: num("receiptCount", r[c0 + 3]),
    };
  }
  return {
    block: n,
    time,
    blockSeconds,
    gasPriceWei: typeof r[0] === "string" ? BigInt(r[0]).toString() : null,
    ethUsd: eth ? { ...eth, feed: ETH_USD_FEED } : null,
    stables,
    contract,
    readAt: Date.now(),
  };
}
