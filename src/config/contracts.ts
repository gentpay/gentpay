import { isAddress } from "@/config/brand";

/*
 * Gentpay's own contract on Robinhood Chain (chain 4663), deployed by the owner on 24 Nov 2026 and checked with
 * `npm run verify-deployment` (MATCH) and source-verified on Blockscout.
 *   contract        GentpayTaskBudgets (+ internal library GentpayReceiptMath, inlined, nothing to link): tasks with budgets,
 *                   provider registry with prices, pay() via transferFrom owner -> provider, receipts. No funds held, no fee,
 *                   no owner, no upgrade.
 *   sampleProvider  the provider id that /api/provider/sample answers for (registered by the owner after deployment).
 */
const DEPLOYED = {
  contract: "0x14fc46155c4091bd7bf80012874ee973927e87fe",
  /** Block of the deployment transaction (Robinhood Chain block). */
  block: 122214223,
  /** Creation transaction. */
  tx: "0x114b7339bf618c8baea71a579716a42009ee5ebdbccd3f3817387ad770666e19",
  /**
   * Provider id of the site's sample data provider. 0 = not registered yet (the owner registers it on /provider, "Register this
   * site's sample provider", then puts the id shown there here — one line).
   */
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
