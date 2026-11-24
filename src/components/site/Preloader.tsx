"use client";

import { useEffect, useRef, useState } from "react";
import { BRAND } from "@/config/brand";
import { Wordmark } from "@/components/site/Mark";

/*
 * The reference's preloader: a huge counter 0 -> 100 top-left whose digits roll, a small card in the middle that changes, the
 * slogan bottom-left, the wordmark top-right; then the whole layer slides up. Ours runs 1.6 s, only on the first home visit of a
 * session (MOTION_BOOT adds html.pre-on), never under reduced motion, and is skipped when the tab is hidden.
 */
const CARDS = [
  { k: "Task budget", v: "5.00 USDG", s: "3 days · 2 providers" },
  { k: "402 Payment required", v: "0.002 USDG", s: "per call · sample provider" },
  { k: "Receipt #1", v: "Paid", s: "task 1 · provider 1 · 1 unit" },
];

export function Preloader() {
  const [n, setN] = useState(0);
  const [gone, setGone] = useState(false);
  const [off, setOff] = useState(false);
  const t0 = useRef(0);
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("pre-on")) {
      queueMicrotask(() => setOff(true));
      return;
    }
    try {
      sessionStorage.setItem("gp1.pre", "1");
    } catch {
      // private mode: the preloader may show again next visit
    }
    const finish = () => {
      setN(100);
      setGone(true);
      setTimeout(() => {
        root.classList.remove("pre-on");
        setOff(true);
      }, 1000);
    };
    if (document.hidden) {
      root.classList.remove("pre-on");
      queueMicrotask(() => setOff(true));
      return;
    }
    t0.current = performance.now();
    const id = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0.current) / 1600);
      setN(Math.round(100 * (1 - Math.pow(1 - p, 2.2))));
      if (p >= 1) {
        clearInterval(id);
        finish();
      }
    }, 40);
    const hard = setTimeout(finish, 3200);
    return () => {
      clearInterval(id);
      clearTimeout(hard);
    };
  }, []);
  if (off) return null;
  const card = CARDS[Math.min(CARDS.length - 1, Math.floor(n / 34))];
  return (
    <div className={`pre ${gone ? "gone" : ""}`} aria-hidden="true" data-testid="preloader">
      <div className="count t-num">{n}</div>
      <div className="wm">
        <Wordmark size={26} />
      </div>
      <div className="card-mini glass p-4" key={card.k} style={{ animation: "rise .5s var(--ease) both" }}>
        <p className="t-small muted">{card.k}</p>
        <p className="mt-1 text-[24px]">{card.v}</p>
        <p className="t-small dim mt-1">{card.s}</p>
      </div>
      <div className="slog max-w-[520px]">{BRAND.slogan}</div>
    </div>
  );
}
