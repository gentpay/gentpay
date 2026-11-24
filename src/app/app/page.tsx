import { pageMeta } from "@/lib/seo";
import { PageHead, Status } from "@/components/site/PageHead";
import { AppModes } from "@/components/app/AppModes";

export const metadata = pageMeta({
  path: "/app",
  title: "Tasks | Gentpay",
  description: "Create tasks with a budget, approve providers, pay per call and see the cost of every task with its receipts. Practice mode runs on sample data without a wallet.",
});

export default function AppPage() {
  return (
    <>
      <PageHead eyebrow={<><Status kind="prototype" /><span className="badge">Practice works without a wallet</span></>} lines={["Your tasks,", "their costs"]}>
        <p>Each task has one stablecoin, a budget, a deadline and approved providers. Every payment is checked by the contract first and leaves a receipt.</p>
      </PageHead>
      <div className="wrap pb-28">
        <AppModes />
      </div>
    </>
  );
}
