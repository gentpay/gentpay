"use client";

import { useState } from "react";
import { keccak256, stringToHex } from "viem";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { BRAND, CHAIN, explorerAddress, explorerTx } from "@/config/brand";
import { DEFAULT_STABLE } from "@/config/tokens";
import { enc } from "@/lib/gentpay/live";
import { explain, simulate, waitForReceipt } from "@/lib/client";
import artifacts from "@/lib/contracts/artifacts.json";

/** Measured on a Robinhood Chain fork (forge gas report, 24 Nov 2026): 2.7 million gas for the creation transaction. */
export const DEPLOY_GAS = "about 2.7 million";

export function DeployPanel() {
  const { address, onChain, sendTransaction, switchNetwork } = useWallet();
  const { open } = useWalletModal();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ address: string; tx: string; block: number } | null>(null);
  const [provider, setProvider] = useState<{ id: number; tx: string } | null>(null);
  const [payout, setPayout] = useState("");
  const art = artifacts.contracts.GentpayTaskBudgets;

  async function deploy() {
    if (!address) return open();
    if (!onChain) return switchNetwork();
    setBusy(true);
    setMsg(null);
    try {
      const hash = await sendTransaction({ data: art.creation as `0x${string}` });
      setMsg(`Sent ${hash}. Waiting for the block…`);
      const rc = await waitForReceipt(hash, 300_000);
      if (!rc.ok || !rc.contractAddress) throw new Error("The deployment reverted.");
      setDone({ address: rc.contractAddress, tx: hash, block: rc.blockNumber });
      setMsg(null);
    } catch (e) {
      setMsg(explain(e));
    } finally {
      setBusy(false);
    }
  }

  async function registerSample() {
    if (!address || !done) return;
    const to = payout || address;
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return setMsg("Payout must be an address.");
    setBusy(true);
    setMsg(null);
    try {
      const data = enc.register(to, 1, keccak256(stringToHex(`${BRAND.url}/api/provider/sample`)));
      await simulate(address, done.address, data);
      const h1 = await sendTransaction({ to: done.address, data });
      const r1 = await waitForReceipt(h1, 300_000);
      if (!r1.ok) throw new Error("Registration reverted.");
      // A fresh contract numbers providers from 1; the first registration is the sample provider.
      const id = 1;
      const h2 = await sendTransaction({ to: done.address, data: enc.setPrice(id, DEFAULT_STABLE.address, 2000n) });
      const r2 = await waitForReceipt(h2, 300_000);
      if (!r2.ok) throw new Error("Setting the price reverted.");
      setProvider({ id, tx: h1 });
    } catch (e) {
      setMsg(explain(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="card" data-testid="deploy-panel" data-noauto="">
        <h2 className="t-h3">1 · GentpayTaskBudgets</h2>
        <p className="t-small muted mt-2">No constructor arguments, no owner of the contract. Creation code sha256 {art.sha256.slice(0, 16)}…</p>
        <button type="button" className="pill mt-5 w-full" disabled={busy} onClick={deploy} data-testid="deploy-submit">
          {!address ? "Connect wallet" : !onChain ? `Switch to ${CHAIN.name}` : busy ? "Confirm in wallet…" : `Deploy on ${CHAIN.name}`}
        </button>
        {done ? (
          <div className="mt-4 text-[13px] leading-relaxed" data-testid="deploy-done">
            <p className="text-[var(--good)]">Deployed.</p>
            <p className="break-all">
              Address{" "}
              <a className="ulink" href={explorerAddress(done.address)} target="_blank" rel="noreferrer">
                {done.address}
              </a>
              <br />
              Tx{" "}
              <a className="ulink" href={explorerTx(done.tx)} target="_blank" rel="noreferrer">
                {done.tx}
              </a>{" "}
              · block {done.block}
            </p>
          </div>
        ) : null}
        <h2 className="t-h3 mt-8">2 · Sample provider</h2>
        <p className="t-small muted mt-2">
          Registers provider #1 for /api/provider/sample (1 unit per call) and sets its price to 0.002 {DEFAULT_STABLE.symbol} per unit. Two transactions.
        </p>
        <label className="field mt-3">
          <span>Payout address (empty = this wallet; must not be a task owner you test with)</span>
          <input className="input t-num text-[13px]" value={payout} onChange={(e) => setPayout(e.target.value.trim())} placeholder="0x…" />
        </label>
        <button type="button" className="pill dark mt-3 w-full" disabled={busy || !done} onClick={registerSample} data-testid="deploy-provider">
          Register the sample provider
        </button>
        {provider ? <p className="t-small mt-3 text-[var(--good)]">Provider #{provider.id} registered and priced.</p> : null}
        {msg ? (
          <p className="rq-alert mt-3" role="status">
            {msg}
          </p>
        ) : null}
        {done ? (
          <p className="mt-4 text-[13px]">
            Paste into src/config/contracts.ts:{" "}
            <code className="break-all">{`contract: "${done.address}", block: ${done.block}, tx: "${done.tx}", sampleProvider: ${provider?.id ?? 1}`}</code>. Then run{" "}
            <code className="break-all">npm run verify-deployment -- --contract {done.address} --contract-tx {done.tx}</code> and verify the source with the kit in
            referensi/explorer.
          </p>
        ) : null}
      </div>
      <div className="card lined">
        <h2 className="t-h3">Before you deploy</h2>
        <ul className="mt-3 grid list-disc gap-2 pl-5 text-[14px] muted">
          <li>The contract never holds funds and has no payable function or receive(). Payments are transferFrom owner → provider in one transaction.</li>
          <li>It has unit, hostile-token, fuzz, invariant and Robinhood Chain fork tests and a written self-review, but no outside security review yet. Start with small budgets.</li>
          <li>Measured deploy gas: {DEPLOY_GAS}, paid in {CHAIN.nativeSymbol}.</li>
          <li>After deployment and source verification, delete this page (owner rule).</li>
        </ul>
      </div>
    </div>
  );
}
