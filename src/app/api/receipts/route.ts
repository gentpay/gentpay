import { allowPublic, tooMany } from "@/lib/guard";
import { contractLive } from "@/config/contracts";
import { bad, fail, ok } from "@/lib/server/respond";
import { receiptsOfTask, receiptsOfTx } from "@/lib/server/receipts";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* GET /api/receipts?task=<id>  every receipt of a task (log scan, confirmed against getReceipt)
 * GET /api/receipts?tx=<hash>  receipts written by one transaction */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "receipts", 30, 600))) return tooMany();
  if (!contractLive()) return ok({ deployed: false, rows: [] }, 30);
  const u = new URL(request.url);
  const task = u.searchParams.get("task");
  const tx = u.searchParams.get("tx");
  try {
    if (task !== null) {
      if (!/^\d{1,12}$/.test(task) || task === "0") return bad("task must be a positive whole number.");
      return ok({ deployed: true, ...(await receiptsOfTask(BigInt(task))) });
    }
    if (tx !== null) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return bad("tx must be a 32-byte transaction hash.");
      return ok({ deployed: true, ...(await receiptsOfTx(tx)) });
    }
    return bad("Give ?task=<id> or ?tx=<hash>.");
  } catch (e) {
    return fail(e);
  }
}
