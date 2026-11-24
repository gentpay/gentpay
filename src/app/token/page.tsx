import Link from "next/link";
import { CaBox } from "@/components/site/CaCopy";
import { PageHead, Status } from "@/components/site/PageHead";
import { BRAND, CHAIN, TOKEN } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/token",
  title: `${BRAND.symbol} token | ${BRAND.name}`,
  description: `${BRAND.symbol} on ${BRAND.chainName}: contract address${TOKEN.isLive ? "" : " (published at launch)"}, its planned use, and what it is not. Task budgets and payments never need it.`,
});

export default function TokenPage() {
  return (
    <>
      <PageHead eyebrow={<span className="badge">{BRAND.symbol}</span>} lines={[BRAND.symbol, "is not needed"]}>
        <p>
          {BRAND.tokenName} ({BRAND.symbol}) is planned for {CHAIN.name}. Tasks, payments, receipts and the sample provider all work without it, and payments are
          made in stablecoins, never in {BRAND.symbol}. It is a memecoin with a planned use, not a share of anything and not a promise of value.
        </p>
      </PageHead>
      <div className="wrap grid grid-cols-1 gap-4 pb-28 lg:grid-cols-2">
        <section className="card" data-testid="token-ca" data-noauto="">
          <div className="flex items-center gap-4">
            <img src="/brand/mark-tile.webp?v=522ed737" alt={`${BRAND.symbol} token logo`} width={72} height={72} className="h-[72px] w-[72px] rounded-[18px]" data-testid="token-logo" />
            <h2 className="t-h3">Contract address</h2>
          </div>
          <p className="muted mt-3 text-[15px]">
            {TOKEN.isLive
              ? `The only ${BRAND.symbol} contract on ${CHAIN.name}. Copies with the same name can exist; check the address.`
              : `Not launched yet. The address is published here and on X ${BRAND.xHandle} at launch; any address shared before that is not ours.`}
          </p>
          <div className="mt-6">
            <CaBox testid="ca-token" />
          </div>
          <p className="t-small muted mt-4">
            Network: {CHAIN.name} (chain {CHAIN.id}), gas paid in {CHAIN.nativeSymbol}. {TOKEN.isLive ? "" : "Launchpad: TBA. "}We never send direct messages first.
          </p>
        </section>
        <section className="card lined" id="utility">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="t-h3">Planned use</h2>
            <Status kind="concept" />
          </div>
          <p className="muted mt-4 text-[15px]">
            Planned only. No utility is built and launching the token does not create one. {BRAND.name} stays usable without it: no discounts that make the token
            necessary, no yield, no revenue share, no price promise.
          </p>
          <Link href="/app" className="pill mt-6">
            Use {BRAND.name} without it
          </Link>
        </section>
      </div>
    </>
  );
}
