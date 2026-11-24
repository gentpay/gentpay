import Link from "next/link";
import { BRAND, CHAIN, explorerAddress } from "@/config/brand";
import { CONTRACTS, contractLive } from "@/config/contracts";
import { REASONS } from "@/lib/gentpay/reasons";
import { FAQ } from "@/lib/faq";
import { faqLd, pageMeta } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHead, Status } from "@/components/site/PageHead";
import { StableTable } from "@/components/app/StableTable";

export const metadata = pageMeta({
  path: "/how",
  title: "How it works | Gentpay",
  description: "The exact rules of GentpayTaskBudgets: non-custodial payments, every limit on chain, twenty refusal reasons, receipts, the proven stablecoins and what is planned.",
});

const RULES = [
  ["Non-custodial", "The contract never holds a balance. Each payment is one transferFrom from the task owner's wallet to the provider's payout address, in the same transaction, within the owner's allowance."],
  ["Every limit on chain", "Budget, per-call cap, provider cap, deadline, pause, approved providers and the agent key are all checked inside pay(). The site's check is the same view the contract runs."],
  ["Price protection", "The agent passes the highest price per unit it accepts. If the provider raised its price after the quote, the payment is refused."],
  ["One payment per request", "A request hash can be paid once per task. The sample provider recomputes it from the request it serves, so a receipt for one URL cannot unlock another."],
  ["Exact amounts", "The provider's balance is measured before and after; anything but the exact cost reverts. Fee-on-transfer tokens are therefore refused. Tokens that return nothing (USDT style) work; tokens that return false are refused."],
  ["Owner only", "Only the task owner changes budget, deadline, caps, providers or the agent key, pauses or closes. Pause and close apply from the next transaction in the same block. The agent can never raise its own limits."],
  ["No admin", "No owner of the contract, no upgrade, no fee, no payable function. Native ETH is not accepted; gas is paid in ETH."],
  ["Receipts", "Each payment stores task, provider, units, amount, price, token, payer, payee, caller, request hash, Robinhood Chain block and time, and emits a Paid log with the same facts."],
];

const PLANNED = [
  "A provider directory with terms and uptime (providers register on chain today).",
  "Signed spending through a session key with daily limits across tasks.",
  "Recurring or streaming payments.",
  "Native ETH payments.",
  `${BRAND.symbol} utility: nothing is defined beyond "planned"; the product does not need the token.`,
];

export default function HowPage() {
  return (
    <>
      <JsonLd data={faqLd(FAQ)} />
      <PageHead eyebrow={<Status kind="prototype" />} lines={["The rules,", "exactly"]}>
        <p>What the contract enforces, what the site shows before you sign, which stablecoins were proven on {CHAIN.name}, and what is still planned.</p>
      </PageHead>
      <div className="wrap grid gap-4 pb-28">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {RULES.map(([t, d]) => (
            <div key={t} className="card outline">
              <h2 className="text-[28.5px] leading-[1.1] tracking-[-0.02em]">{t}</h2>
              <p className="muted mt-3 text-[15px]">{d}</p>
            </div>
          ))}
        </div>
        <StableTable />
        <div className="card" data-noauto="">
          <h2 className="text-[21px]">Refusal reasons</h2>
          <p className="t-small muted">checkPay returns a bitmask; pay() reverts with Refused(mask). Same bits in the contract, the site and the example agent.</p>
          <div className="rows mt-3">
            {REASONS.map((r) => (
              <div key={r.key} className="kv">
                <span className="t-num text-[12px]">
                  bit {r.bit} · {r.key}
                </span>
                <span>{r.words}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="card" data-noauto="">
            <h2 className="text-[21px]">The contract</h2>
            <div className="rows mt-3 text-[14px]">
              <div className="kv">
                <span>Name</span>
                <span>GentpayTaskBudgets + library GentpayReceiptMath</span>
              </div>
              <div className="kv">
                <span>Address</span>
                {contractLive() ? (
                  <a className="ulink t-num" href={explorerAddress(CONTRACTS.contract)} target="_blank" rel="noreferrer">
                    {CONTRACTS.contract}
                  </a>
                ) : (
                  <span>not deployed yet</span>
                )}
              </div>
              <div className="kv">
                <span>Deployment gas</span>
                <span className="t-num">about 2.7 million (forge)</span>
              </div>
              <div className="kv">
                <span>Tests</span>
                <span>unit, hostile tokens, fuzz, invariants, {CHAIN.name} fork</span>
              </div>
              <div className="kv">
                <span>Outside security review</span>
                <span>not yet: start with small budgets</span>
              </div>
            </div>
          </div>
          <div className="card" data-noauto="">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[21px]">Planned, not built</h2>
              <Status kind="concept" />
            </div>
            <ul className="mt-3 grid gap-2 text-[15px] muted">
              {PLANNED.map((p) => (
                <li key={p}>— {p}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="card" data-noauto="">
          <h2 className="text-[21px]">What this does not do</h2>
          <p className="muted mt-3 text-[15px]">
            {BRAND.name} does not run agents, judge the quality of a provider&apos;s data, refund a payment, or make a provider honest: a receipt proves a payment,
            not the service. It is not affiliated with Robinhood. A provider can change its payout address; every receipt records where the money went. See also{" "}
            <Link className="ulink" href="/provider">
              the provider flow
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
