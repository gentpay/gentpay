import type { PState } from "@/lib/gentpay/engine";

/*
 * Practice data. Everything here is SAMPLE DATA (badged on the page): invented tasks and providers so the flow can be tried
 * without a wallet. Token address = real USDG (6 decimals) so the amounts read the same way as on chain; no tokens move.
 */

export const PRACTICE_OWNER = "0x00000000000000000000000000000000000a11ce";
export const PRACTICE_AGENT = "0x000000000000000000000000000000000000a9e7";
export const PRACTICE_TOKEN = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const U = (usd: number) => BigInt(Math.round(usd * 1e6));

export function practiceState(now = Math.floor(Date.now() / 1000)): PState {
  return {
    now,
    providers: [
      { id: 1, name: "Chain snapshot API (sample)", controller: "0x00000000000000000000000000000000000c0001", payout: "0x00000000000000000000000000000000000b0001", active: true, maxUnitsPerCall: 100, prices: { [PRACTICE_TOKEN]: U(0.002) } },
      { id: 2, name: "Filings search API (sample)", controller: "0x00000000000000000000000000000000000c0002", payout: "0x00000000000000000000000000000000000b0002", active: true, maxUnitsPerCall: 10, prices: { [PRACTICE_TOKEN]: U(0.05) } },
      { id: 3, name: "Image captioning API (sample)", controller: "0x00000000000000000000000000000000000c0003", payout: "0x00000000000000000000000000000000000b0003", active: true, maxUnitsPerCall: 20, prices: { [PRACTICE_TOKEN]: U(0.01) } },
      { id: 4, name: "Unvetted scraper (sample)", controller: "0x00000000000000000000000000000000000c0004", payout: "0x00000000000000000000000000000000000b0004", active: true, maxUnitsPerCall: 0, prices: { [PRACTICE_TOKEN]: U(2) } },
    ],
    tasks: [
      {
        id: 1,
        title: "Weekly market research brief",
        owner: PRACTICE_OWNER,
        agent: PRACTICE_AGENT,
        token: PRACTICE_TOKEN,
        budget: U(5),
        spent: 0n,
        perCallCap: U(0.25),
        deadline: now + 3 * 86400,
        status: "open",
        payments: 0,
        providers: { 1: { cap: U(1), spent: 0n }, 2: { cap: U(3), spent: 0n } },
      },
      {
        id: 2,
        title: "Caption 40 product photos",
        owner: PRACTICE_OWNER,
        agent: PRACTICE_AGENT,
        token: PRACTICE_TOKEN,
        budget: U(0.5),
        spent: 0n,
        perCallCap: 0n,
        deadline: now + 86400,
        status: "open",
        payments: 0,
        providers: { 3: { cap: U(0.5), spent: 0n } },
      },
    ],
    receipts: [],
    wallets: { [PRACTICE_OWNER]: { [PRACTICE_TOKEN]: { balance: U(40), allowance: U(10) } } },
    refusals: [],
  };
}
