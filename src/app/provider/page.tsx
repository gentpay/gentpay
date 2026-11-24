import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";
import { RECEIPT_MAX_AGE } from "@/lib/server/provider";
import { PageHead, Status } from "@/components/site/PageHead";
import { Live402, RegisterProvider, RegisterSampleProvider } from "@/components/app/ProviderTools";

export const metadata = pageMeta({
  path: "/provider",
  title: "Provider | Gentpay",
  description: "Sell API calls to AI agents per request: publish a price on chain, answer 402, and serve data only after a Gentpay receipt is verified on Robinhood Chain. A working sample provider runs on this site.",
});

const STEPS = [
  ["Register", "registerProvider(payout, maxUnitsPerCall, termsHash) from your wallet. You become the provider's controller."],
  ["Price", "setPrice(providerId, token, pricePerUnit) for each stablecoin you accept. Raising it never charges an agent more than the maximum it accepted."],
  ["Answer 402", "Requests without a receipt get HTTP 402 with your provider id, the token, the price and how the request hash is built."],
  ["Verify, then serve", `On retry, read receiptFor(task, requestHash) on chain: your provider id, your token, enough units, at most ${RECEIPT_MAX_AGE / 60} minutes old, redeemed once.`],
];

export default function ProviderPage() {
  return (
    <>
      <PageHead eyebrow={<><Status kind="prototype" /><span className="badge">x402-style, not x402</span></>} lines={["Get paid", "per request"]}>
        <p>
          Providers publish a price per unit on chain. Agents pay from a task budget, straight to your payout address, and you serve the call once you have
          checked the receipt. No accounts, no cards, no fee to {BRAND.name}.
        </p>
      </PageHead>
      <div className="wrap grid gap-4 pb-28">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, d], i) => (
            <div key={t} className="card lined">
              <p className="t-num text-[13px] dim">0{i + 1}</p>
              <h2 className="mt-3 text-[28.5px] leading-[1.1] tracking-[-0.02em]">{t}</h2>
              <p className="muted mt-3 text-[15px]">{d}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Live402 />
          <div className="card" data-noauto="">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[21px]">The sample provider on this site</h2>
              <Status kind="prototype" />
            </div>
            <p className="muted mt-3 text-[15px]">
              <code className="t-num">/api/provider/sample?topic=chain</code> sells a live Robinhood Chain snapshot (block, gas, ETH/USD) and{" "}
              <code className="t-num">?topic=stablecoins</code> the proven stablecoins&apos; supply and Chainlink prices. The data is real; the provider exists to
              show the payment flow end to end, and the example agent in the repository uses it.
            </p>
            <pre className="t-num mt-4 overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-black/40 p-4 text-[12px] leading-[1.55]">{`# 1. ask: 402 with the price
curl -i ${BRAND.url}/api/provider/sample?topic=chain

# 2. pay from your task (agent key), then retry
TASK_ID=1 AGENT_KEY=0x… node examples/agent.mjs ${BRAND.url}/api/provider/sample?topic=chain

# the agent sends:  x-gentpay-receipt: <taskId>:<nonce>
# requestHash = keccak256("gentpay-req-v1|<providerId>|GET|/api/provider/sample?topic=chain|<nonce>")`}</pre>
            <p className="t-small dim mt-3">We call it x402-style: HTTP 402 then a retry with proof. The proof is a Gentpay receipt on chain, not the x402 payment header; no x402 client was tested.</p>
          </div>
        </div>
        <RegisterSampleProvider />
        <RegisterProvider />
      </div>
    </>
  );
}
