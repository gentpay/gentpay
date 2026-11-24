"use client";

import { useJson } from "@/lib/useJson";

export type StableFacts = { symbol: string; address: string; supply: string | null; decimals: number | null; price: number | null; updatedAt: number | null; feed: string };

export type ChainFacts = {
  block: number | null;
  time: number | null;
  blockSeconds: number | null;
  gasPriceWei: string | null;
  ethUsd: { price: number; updatedAt: number; feed: string } | null;
  stables: StableFacts[];
  contract: { address: string; code: boolean | null; tasks: number | null; providers: number | null; receipts: number | null } | null;
  readAt: number;
};

/** Live chain facts from /api/chain (server-cached a few seconds; polling pauses while the tab is hidden). */
export function useChain(every = 20_000) {
  return useJson<ChainFacts>("/api/chain", every);
}
