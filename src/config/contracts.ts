import { isAddress } from "@/config/brand";

/*
 * Gentpay's own contract on Robinhood Chain (chain 4663). NOT deployed yet: the owner deploys it from /deploy (localhost only),
 * registers the sample provider there, then pastes the values below and runs `npm run verify-deployment`.
 *   contract        GentpayTaskBudgets (+ internal library GentpayReceiptMath, inlined, nothing to link): tasks with budgets,
 *                   provider registry with prices, pay() via transferFrom owner -> provider, receipts. No funds held, no fee,
 *                   no owner, no upgrade.
 *   sampleProvider  the provider id that /api/provider/sample answers for (registered by the owner after deployment).
 */
const DEPLOYED = {
  contract: "TBA",
  /** Block of the deployment transaction (Robinhood Chain block). */
  block: 0,
  /** Creation transaction. */
  tx: "",
  /** Provider id of the site's sample data provider. 0 = not registered yet. */
  sampleProvider: 0,
};

/**
 * Local tests only: NEXT_PUBLIC_GENTPAY_TEST_CONTRACTS='{"contract":"0x…","block":1,"sampleProvider":1}' at build time points a
 * second build at a contract on an anvil chain. Never set it on Vercel.
 */
function testOverride(): typeof DEPLOYED | null {
  const raw = process.env.NEXT_PUBLIC_GENTPAY_TEST_CONTRACTS;
  if (!raw) return null;
  try {
    const v = { ...DEPLOYED, ...(JSON.parse(raw) as Partial<typeof DEPLOYED>) };
    return isAddress(v.contract) ? v : null;
  } catch {
    return null;
  }
}

export const CONTRACTS = testOverride() ?? DEPLOYED;
export const contractLive = () => isAddress(CONTRACTS.contract);
export const CONTRACT_NAME = "GentpayTaskBudgets" as const;
