/*
 * Stablecoins Gentpay supports on Robinhood Chain (chain id 4663). Each one was PROVEN on chain on 24 Nov 2026 before it was named
 * here (eth_call name/symbol/decimals/totalSupply, code, Chainlink feed): see referensi/recon-feature/STABLECOINS.txt.
 * Many lookalike tokens on this chain reuse the symbols USDG, USDC and USDT; only these addresses are used. Tokens named USDC or
 * USDT were NOT proven (every candidate found was a lookalike without a market), so they are not offered.
 * The contract itself is token-agnostic: any ERC-20 works on chain, the site only offers the proven ones.
 */

export type Stable = {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  /** Chainlink <SYMBOL> / USD price feed on Robinhood Chain. */
  feed: `0x${string}`;
  note: string;
};

export const USDG: Stable = {
  symbol: "USDG",
  name: "Global Dollar",
  address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  decimals: 6,
  feed: "0x61B7e5650328764B076A108EFF5fa7282a1B9aD2",
  note: "Proxy contract (EIP-1967). Its issuer can upgrade it; a blocked address cannot send or receive.",
};

export const USDE: Stable = {
  symbol: "USDe",
  name: "USDe",
  address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
  decimals: 18,
  feed: "0xb9fB4e65744E4178894f7C61CF80E8a48A5f224a",
  note: "A synthetic dollar, not a fiat-backed coin: its price can move away from $1.",
};

/** Local tests only: NEXT_PUBLIC_GENTPAY_TEST_TOKEN='{"address":"0x…"}' swaps the USDG address for a token on an anvil chain. */
function testToken(): Stable | null {
  const raw = process.env.NEXT_PUBLIC_GENTPAY_TEST_TOKEN;
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { address?: string };
    return v.address && /^0x[0-9a-fA-F]{40}$/.test(v.address) ? { ...USDG, address: v.address as `0x${string}` } : null;
  } catch {
    return null;
  }
}

export const STABLES: Stable[] = [testToken() ?? USDG, USDE];
export const DEFAULT_STABLE = STABLES[0];

export function stableByAddress(a: string | null | undefined): Stable | null {
  if (!a) return null;
  return STABLES.find((s) => s.address.toLowerCase() === a.toLowerCase()) ?? null;
}

/** Chainlink ETH / USD on Robinhood Chain (verified on chain: description "ETH / USD", 8 decimals). */
export const ETH_USD_FEED = "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9" as const;
