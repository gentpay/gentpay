import { BRAND, CHAIN } from "@/config/brand";
import { CONTRACTS, contractLive } from "@/config/contracts";
import { STABLES } from "@/config/tokens";

export const dynamic = "force-static";

export function GET() {
  const lines = [
    `# ${BRAND.name}`,
    "",
    `> ${BRAND.slogan} ${BRAND.tagline} Owners create tasks with a budget in a proven stablecoin, a deadline, a per-call cap and approved providers; agents pay providers per request through GentpayTaskBudgets on ${CHAIN.name} (chain ${CHAIN.id}); every payment is a receipt (task, provider, units, amount, request hash, block). Non-custodial (transferFrom owner -> provider). Prototype; no token needed. Not affiliated with Robinhood.`,
    "",
    `Stablecoins offered: ${STABLES.map((s) => `${s.symbol} ${s.address} (${s.decimals} decimals)`).join(", ")}`,
    `GentpayTaskBudgets: ${contractLive() ? CONTRACTS.contract : "not deployed yet"}`,
    `Sample provider (x402-style, HTTP 402 then a receipt header): ${BRAND.url}/api/provider/sample?topic=chain`,
    `Receipts API: ${BRAND.url}/api/receipts?task=<id> or ?tx=<hash>`,
    `How it works: ${BRAND.url}/how`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
