import { NextResponse } from "next/server";
import { CHAIN } from "@/config/brand";
import { allowPublic, tooMany } from "@/lib/guard";
import { parseReceiptHeader, RECEIPT_HEADER } from "@/lib/gentpay/request";
import { paymentRequired, quote, verifyReceipt } from "@/lib/server/provider";
import { readSnapshot } from "@/lib/server/snapshot";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TOPICS = ["chain", "stablecoins"] as const;
const H = { "cache-control": "no-store" };

/*
 * Sample paid data provider (x402-style). GET /api/provider/sample?topic=chain|stablecoins
 *   no receipt header -> 402 with the on-chain price and how to pay
 *   x-gentpay-receipt: <taskId>:<nonce> -> the receipt is checked on chain, then the live data is served once.
 * The data itself is real (read from Robinhood Chain at request time); the provider exists to show the payment flow.
 */
export async function GET(request: Request) {
  const store = getStore();
  if (!(await allowPublic(store, request, "provider", 30, 600))) return tooMany();
  const url = new URL(request.url);
  const topic = url.searchParams.get("topic") ?? "chain";
  if (!(TOPICS as readonly string[]).includes(topic) || [...url.searchParams.keys()].some((k) => k !== "topic")) {
    return NextResponse.json({ error: `Use ?topic=${TOPICS.join("|")} and nothing else.` }, { status: 400, headers: H });
  }
  const path = `${url.pathname}?topic=${topic}`;
  let q;
  try {
    q = await quote();
  } catch {
    return NextResponse.json({ error: "The chain could not be reached to read the price." }, { status: 503, headers: H });
  }
  if (!q) return NextResponse.json({ error: "Not configured on this site yet: the sample provider is not registered in the Gentpay contract yet.", chainId: CHAIN.id }, { status: 503, headers: H });
  if (!q.active || q.pricePerUnit === "0") return NextResponse.json({ error: "The sample provider is paused or has no price." }, { status: 503, headers: H });

  const header = request.headers.get(RECEIPT_HEADER);
  if (!header) return NextResponse.json(paymentRequired(q, path), { status: 402, headers: { ...H, "x-gentpay-price": `${q.pricePerUnit} ${q.token}` } });
  const parsed = parseReceiptHeader(header);
  if (!parsed) return NextResponse.json({ error: `Malformed ${RECEIPT_HEADER}; expected <taskId>:<0x + 64 hex nonce>.` }, { status: 400, headers: H });

  let v;
  try {
    v = await verifyReceipt(q, parsed.taskId, parsed.nonce, "GET", path, store, Math.floor(Date.now() / 1000));
  } catch {
    return NextResponse.json({ error: "The receipt could not be read from the chain. Try again." }, { status: 503, headers: H });
  }
  if (!v.ok) return NextResponse.json({ error: v.error, ...(v.status === 402 ? paymentRequired(q, path) : {}) }, { status: v.status, headers: H });

  const snap = await readSnapshot();
  const data =
    topic === "chain"
      ? { block: snap.block, blockTime: snap.time, secondsPerBlock: snap.blockSeconds, gasPriceWei: snap.gasPriceWei, ethUsd: snap.ethUsd }
      : { stablecoins: snap.stables };
  return NextResponse.json(
    { topic, data, source: `Robinhood Chain (chain id ${CHAIN.id}) read at ${new Date(snap.readAt).toISOString()}`, receipt: { id: v.receiptId, taskId: parsed.taskId.toString(), amount: v.amount, units: v.units } },
    { status: 200, headers: { ...H, "x-gentpay-receipt-id": v.receiptId } },
  );
}
