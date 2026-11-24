# Gentpay

Gentpay gives an AI agent a budget per task. AI agents increasingly need paid data and APIs, while the people who run them need to
control what they spend and know what each job cost. The owner creates a task with one stablecoin, a budget, a deadline, a per-call cap
and the providers the agent may pay; when the agent wants a paid call, a contract on Robinhood Chain reads the provider's price and what
is left, then either pays the provider straight from the owner's wallet or refuses with the reason. Every payment leaves a receipt that
names its task.

Agent payments with task budgets and clear receipts. Budgets per task, approved providers and on-chain receipts for AI agents on Robinhood Chain.

## Read this before anything else

This repository is the working code behind https://gentpay.xyz.

- **What runs today (Prototype).** A task dashboard with a practice mode that runs the contract's exact rules on sample data in the
  browser (no wallet, no token), a live mode that reads and writes `GentpayTaskBudgets`, a sample paid data provider at
  `/api/provider/sample` (HTTP 402 with the on-chain price, then live chain data once a receipt is verified on chain), a receipt
  lookup, and `examples/agent.mjs`, a small agent that pays and fetches.
- **Live data.** Robinhood Chain head block, gas price, Chainlink ETH/USD, and the two stablecoins proven on chain — USDG
  (`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 decimals) and USDe (`0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34`, 18 decimals) —
  with their supply and Chainlink price feeds. Tokens named USDC or USDT on this chain were not offered: every candidate found was a
  lookalike.
- **The contract is not deployed yet.** It is non-custodial (payments are one `transferFrom` from the owner to the provider), has
  no owner, admin, fee or upgrade, and was tested with unit, hostile-token, fuzz, invariant and Robinhood Chain fork tests plus a
  written self-review — but no outside security review. Start with small budgets.
- **"x402-style", not x402.** The sample provider answers 402 and accepts a Gentpay receipt as proof; it is not the x402 payment
  header, and no x402 client was tested.
- **Planned, not built:** a provider directory, session keys across tasks, recurring payments, native ETH payments, and any utility for
  $GENTPAY. Nothing here claims the token has value or that a provider's data is good: a receipt proves a payment, not the service.

## Layout

| Path | What it is |
|---|---|
| `src/app/` | Pages (home, `/app`, `/provider`, `/receipts`, `/how`, `/token`, localhost-only `/deploy`) and API routes (`/api/chain`, `/api/rpc`, `/api/receipts`, `/api/provider/sample`). |
| `src/components/` | Interface components: the task dashboard (practice and live), provider tools, the wallet dialog, motion. |
| `src/config/` | `brand.ts` (name, ticker, token address, links), `contracts.ts` (deployed address, block, sample provider id), `tokens.ts` (the proven stablecoins). |
| `src/lib/gentpay/` | Reason bits (same as the Solidity library), the request hash, the practice engine and the browser contract calls. |
| `src/lib/` | Chain reads, the read-only RPC relay with its rate limits, receipts from logs, the sample provider's receipt check. |
| `contracts/` | Solidity sources (`src/`) and Foundry tests (`test/`). |
| `examples/` | `agent.mjs`: an agent that reads the 402, checks the budget, pays and retries with its receipt. |
| `scripts/` | `verify-deployment` and the contract artifact builder. |
| `public/` | Brand images and wallet icons. |

## Run the tests

Node.js 20 or newer.

```
npm install
npm run typecheck
npm test
```

Contracts use [Foundry](https://book.getfoundry.sh/):

```
cd contracts
bash setup.sh
forge test
forge test --match-contract Fork --fork-url https://rpc.mainnet.chain.robinhood.com --evm-version cancun
```

### What was checked for this snapshot

2026-11-24 UTC, Node.js 25, forge 1.5.1: typecheck exit 0; `npm test` 35 pass / 0 fail; `next build` 19 routes; `forge test` 44 passed
(41 unit, hostile-token and fuzz tests with 1,024 fuzz runs, 3 invariants with 64 runs × 48 calls); 4 fork tests passed against
Robinhood Chain with real USDG and USDe. A browser run on a local fork of Robinhood Chain (chain id 4663, injected test wallet, the
example agent) passed 10 of 10 steps: create a task, pay, refuse over budget and over the unit limit, receipt lookup, replayed receipt
refused, pause and close, provider registration. Measured gas there: deployment 2,664,793; first payment in a task 352,171.
Not run: anything against a deployed contract on mainnet (none exists yet).

## Look at the site

```
npm install
npm run build
npm start
```

Open http://localhost:6660. With no configuration the site reads Robinhood Chain through its public RPC, practice mode works, and
the live dashboard, receipts and sample provider say "not deployed" until `src/config/contracts.ts` holds a deployed address.
Optional variables are listed under "Deploy your own".

## Contracts

| Contract | Address | Explorer |
|---|---|---|
| `GentpayTaskBudgets` (with the internal library `GentpayReceiptMath`) | not deployed yet | — |

The contract records tasks (owner, agent, token, budget, spent, per-call cap, deadline, status), a provider registry with a price per
unit per token, approved providers with a cap per task, and one receipt per payment (task, provider, units, amount, price, token,
payer, payee, caller, request hash, Robinhood Chain block, time). `checkPay` returns a bitmask of every reason a payment would fail
(20 reasons) so that nothing is signed when it would be refused. It has no owner, no admin, no fee, no upgrade and never holds funds;
native ETH is rejected and fee-on-transfer tokens are refused.

## Verify a deployment

```
npm run verify-deployment -- --contract <address> --contract-tx <creation tx>
```

The script compares the bytecode on Robinhood Chain with the build in this repository and prints MATCH or the first difference.

## Add the network to your wallet

| Field | Value |
|---|---|
| Network | Robinhood Chain |
| Chain ID | 4663 |
| Currency | ETH |
| RPC | https://rpc.mainnet.chain.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com |

The site offers to add it when you connect.

## Data sources and limits

- Robinhood Chain JSON-RPC (official endpoint, public fallbacks): blocks, gas, token supply, Chainlink feeds, the contract. The
  `/api/chain` snapshot is cached a few seconds; a failed read shows "—", never a made-up number.
- Receipts come from the contract's `Paid` logs, scanned in windows the node accepts; every row is confirmed against the stored
  receipt. An incomplete scan is labelled as such.
- The browser reads through the site's own relay (`/api/rpc`), which only forwards the read calls the site makes, with a budget per
  network and a site-wide ceiling.
- Refusals are recorded in the browser only: a refused payment never reaches the chain.

## Token

$GENTPAY is the community token of Gentpay on Robinhood Chain. Contract address: announced on https://gentpay.xyz at launch. It has
no promised value. Any utility is planned only; tasks and payments use stablecoins and never need the token.

## Deploy your own

1. Import the repository into a Next.js host (preset Next.js, root `./`). `npm run build` must pass.
2. Optional environment variables (names and formats only):

| Variable | What it is for | Format |
|---|---|---|
| `ROBINHOOD_RPC_URL` | Server-side Robinhood Chain RPC (recommended for log scans) | `https://…` |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | Browser RPC, only if you accept exposing it | `https://…` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect in the wallet dialog | 32 hex characters |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Shared rate limits and redeem-once for the sample provider | `https://…` + token |
| `STORE_KEY_PREFIX` | Key prefix in the shared store | text, default `gentpay:` |

3. Contracts: run the site locally, open `/deploy` (localhost only), deploy `GentpayTaskBudgets` (no constructor arguments), register
   the sample provider, paste address, block, creation tx and provider id into `src/config/contracts.ts`, then run
   `npm run verify-deployment`. Remove `/deploy` once the source is verified.
4. After the deploy: `/` answers 200, `/api/chain` returns a block number, `/api/provider/sample?topic=chain` answers 402 with a price,
   and `/deploy` answers 404 on the public host.

## Contributing

Fork the repository, branch from `main`, and run `npm run typecheck`, `npm test` and `npm run build`, and `bash setup.sh && forge test` in `contracts/` before opening a pull request. For a bug, open an issue with the expected and actual behavior and minimal steps. Keep private keys, seed phrases and environment values out of issues.

## Security

Please do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. The contract, the API routes (relay, receipts, sample provider) and the transactions the site builds are in scope; wallets, RPC providers, explorers, token issuers and launchpads are not. There is no bug bounty.

## Notices and license

This project's original code is released under the [MIT License](LICENSE). The self-hosted fonts Outfit and JetBrains Mono are under
the SIL Open Font License (texts in `src/fonts/`). Wallet logos in `public/wallets/` belong to their projects and are used only to
identify each wallet. The Gentpay name, logo and artwork belong to the project and are not licensed for reuse as a brand.
