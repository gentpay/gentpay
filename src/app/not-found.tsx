import Link from "next/link";
import { PageHead } from "@/components/site/PageHead";

export default function NotFound() {
  return (
    <>
      <PageHead eyebrow={<span className="badge">404</span>} lines={["No receipt", "for this page"]}>
        <p>This page does not exist. Your tasks and receipts do.</p>
      </PageHead>
      <div className="wrap flex flex-wrap gap-3 pb-24">
        <Link href="/app" className="pill">
          Open the app
        </Link>
        <Link href="/" className="pill dark">
          Home
        </Link>
      </div>
    </>
  );
}
