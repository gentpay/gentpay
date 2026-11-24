import { Suspense } from "react";
import { pageMeta } from "@/lib/seo";
import { PageHead, Status } from "@/components/site/PageHead";
import { ReceiptLookup } from "@/components/app/ReceiptLookup";

export const metadata = pageMeta({
  path: "/receipts",
  title: "Receipts | Gentpay",
  description: "Look up Gentpay receipts on Robinhood Chain by transaction or task: amount, units, price, provider, request hash and block, each confirmed against the contract.",
});

export default function ReceiptsPage() {
  return (
    <>
      <PageHead eyebrow={<Status kind="prototype" />} lines={["Receipts you", "can check"]}>
        <p>Every payment stores a receipt in the contract and emits a log. Paste a transaction or a task number; each row is confirmed against the stored receipt before it is shown.</p>
      </PageHead>
      <div className="wrap pb-28">
        <Suspense>
          <ReceiptLookup />
        </Suspense>
      </div>
    </>
  );
}
