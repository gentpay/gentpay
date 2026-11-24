"use client";

import { useState } from "react";
import { contractLive } from "@/config/contracts";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Practice } from "@/components/app/Practice";
import { Live } from "@/components/app/Live";

/* Practice (sample data, no wallet) or Live (the contract on Robinhood Chain). Live is chosen by default once a wallet is connected
 * and the contract exists. */
export function AppModes() {
  const { address } = useWallet();
  const [picked, setMode] = useState<"practice" | "live" | null>(null);
  const mode = picked ?? (address && contractLive() ? "live" : "practice");
  return (
    <div>
      <div className="mb-6 inline-flex rounded-full border border-[var(--line-2)] p-1" role="tablist" aria-label="Mode">
        {(
          [
            ["practice", "Practice · sample data"],
            ["live", "Live · Robinhood Chain"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={mode === k}
            onClick={() => setMode(k)}
            className={`h-9 rounded-full px-4 text-[13px] transition-colors ${mode === k ? "bg-[var(--pill)] text-[var(--pill-ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}
            data-testid={`mode-${k}`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "practice" ? <Practice /> : <Live />}
    </div>
  );
}
