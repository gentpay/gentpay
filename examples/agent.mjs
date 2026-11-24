// Example agent: buys one call from an x402-style provider out of a Gentpay task budget.
//
//   AGENT_KEY=0x… TASK_ID=1 node examples/agent.mjs https://gentpay.xyz/api/provider/sample?topic=chain
//
// Environment:
//   AGENT_KEY   private key of the task's agent (or owner). Never commit it; pass it from your shell.
//   TASK_ID     the task to pay from.
//   RPC_URL     Robinhood Chain RPC (default: the official public endpoint).
//   MAX_PRICE   highest price per unit you accept, in the token's base units (default: the price the provider quoted).
//
// Flow: GET -> 402 with the price -> read the price on chain and refuse if it differs from the quote -> checkPay (every refusal
// reason, nothing signed) -> pay() -> wait for the receipt -> GET again with x-gentpay-receipt: <task>:<nonce> -> print the data.
// The request hash binds the payment to this exact request: keccak256("gentpay-req-v1|<provider>|GET|<path?query>|<nonce>").
import { createPublicClient, createWalletClient, defineChain, http, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";

const REASONS = [
  "NO_TASK", "TASK_CLOSED", "TASK_PAUSED", "TASK_EXPIRED", "NOT_AGENT", "PROVIDER_UNKNOWN", "PROVIDER_NOT_APPROVED", "PROVIDER_PAUSED",
  "NO_PRICE", "PRICE_ABOVE_MAX", "UNITS_INVALID", "OVER_CALL_CAP", "OVER_BUDGET", "OVER_PROVIDER_CAP", "REQUEST_USED", "REQUEST_EMPTY",
  "ALLOWANCE_LOW", "BALANCE_LOW", "PAYEE_IS_PAYER", "COST_OVERFLOW",
];
const ABI = [
  { type: "function", name: "priceOf", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "uint128" }] },
  {
    type: "function",
    name: "checkPay",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "bytes32" }, { type: "uint128" }, { type: "address" }],
    outputs: [{ type: "uint256" }, { type: "uint128" }, { type: "uint256" }],
  },
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "bytes32" }, { type: "uint128" }],
    outputs: [{ type: "uint256" }],
  },
];

const url = process.argv[2];
const { AGENT_KEY, TASK_ID } = process.env;
const RPC_URL = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const fail = (msg, code = 1) => {
  console.error(`agent: ${msg}`);
  process.exit(code);
};
if (!url || !AGENT_KEY || !TASK_ID) fail("usage: AGENT_KEY=0x… TASK_ID=<id> node examples/agent.mjs <provider url>", 2);
if (!/^0x[0-9a-fA-F]{64}$/.test(AGENT_KEY)) fail("AGENT_KEY must be 0x + 64 hex", 2);

const account = privateKeyToAccount(AGENT_KEY);
const u = new URL(url);
const path = u.pathname + u.search;

// 1. Ask. A provider that wants payment answers 402 with its terms.
const first = await fetch(url);
if (first.status !== 402) fail(`expected 402 Payment Required, got ${first.status}: ${(await first.text()).slice(0, 200)}`);
const quote = await first.json();
console.log(`402 · provider #${quote.providerId} asks ${quote.pricePerUnit} base units of ${quote.symbol} per unit, ${quote.units} unit(s)`);

const chain = defineChain({ id: quote.chainId, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } });
const pub = createPublicClient({ chain, transport: http(RPC_URL) });
const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
if ((await pub.getChainId()) !== quote.chainId) fail(`RPC is chain ${await pub.getChainId()}, the provider says ${quote.chainId}`);

// 2. Never trust the quote alone: read the price on chain.
const onChain = await pub.readContract({ address: quote.contract, abi: ABI, functionName: "priceOf", args: [BigInt(quote.providerId), quote.token] });
if (onChain.toString() !== String(quote.pricePerUnit)) fail(`quoted price ${quote.pricePerUnit} differs from the on-chain price ${onChain}`);
const maxPrice = process.env.MAX_PRICE ? BigInt(process.env.MAX_PRICE) : onChain;
if (onChain > maxPrice) fail(`price ${onChain} is above MAX_PRICE ${maxPrice}`, 3);

// 3. Bind the payment to this request.
const nonce = `0x${randomBytes(32).toString("hex")}`;
const requestHash = keccak256(stringToHex(`gentpay-req-v1|${BigInt(quote.providerId)}|GET|${path}|${nonce}`));
const units = BigInt(quote.units);

// 4. Check before signing: every reason at once.
const [mask, cost, left] = await pub.readContract({ address: quote.contract, abi: ABI, functionName: "checkPay", args: [BigInt(TASK_ID), BigInt(quote.providerId), units, requestHash, maxPrice, account.address] });
if (mask !== 0n) {
  const why = REASONS.filter((_, i) => mask & (1n << BigInt(i)));
  fail(`refused before signing: ${why.join(", ")} (mask 0x${mask.toString(16)})`, 3);
}
console.log(`check passed · cost ${cost} · budget left ${left}`);

// 5. Pay from the task budget (the contract moves the cost from the owner to the provider).
const hash = await wallet.writeContract({ address: quote.contract, abi: ABI, functionName: "pay", args: [BigInt(TASK_ID), BigInt(quote.providerId), units, requestHash, maxPrice] });
const rc = await pub.waitForTransactionReceipt({ hash });
if (rc.status !== "success") fail(`payment reverted in ${hash}`);
console.log(`paid · tx ${hash} · block ${rc.blockNumber} · gas ${rc.gasUsed}`);

// 6. Retry with the receipt.
const second = await fetch(url, { headers: { "x-gentpay-receipt": `${TASK_ID}:${nonce}` } });
const body = await second.json().catch(() => null);
if (second.status !== 200) fail(`provider answered ${second.status}: ${JSON.stringify(body).slice(0, 300)}`);
console.log(`200 · receipt #${body.receipt.id} accepted`);
console.log(JSON.stringify({ tx: hash, gasUsed: rc.gasUsed.toString(), taskId: TASK_ID, nonce, receipt: body.receipt, data: body.data }, null, 2));
