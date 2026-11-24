"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NAV } from "@/config/nav";
import { MarkGlyph, Wordmark } from "@/components/site/Mark";
import { CaBox } from "@/components/site/CaCopy";
import { NavWallet } from "@/components/wallet/WalletButton";
import { useFocusTrap } from "@/components/site/useFocusTrap";

/*
 * The reference's chrome: a bare wordmark at the top (no bar), and a floating light pill at the bottom centre that is wide at the
 * top of the page (menu · mark · dark "Open app" segment) and shrinks to the mark alone once you scroll. The menu opens as a
 * full-screen overlay with huge links. Wallet + CA sit top-right (our addition, required on every page).
 */
export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [small, setSmall] = useState(false);
  const [tinted, setTinted] = useState(false);
  useEffect(() => {
    let last = 0;
    const on = () => {
      const y = window.scrollY;
      setSmall(y > 240 && y >= last - 4);
      setTinted(y > 40);
      last = y;
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <>
      <header className={`top ${small ? "hide" : ""} ${tinted ? "tint" : ""}`} data-testid="top">
        <div className="wrap top-in">
          <Link href="/" aria-label="Gentpay home" data-testid="home-link">
            <Wordmark />
          </Link>
          <div className="top-r">
            <div className="top-ca">
              <CaBox testid="header-ca" compact />
            </div>
            <NavWallet label="Connect wallet" />
          </div>
        </div>
      </header>
      <div className={`dock ${small ? "small" : ""}`} data-testid="dock">
        <button type="button" className="seg side" aria-label="Open the menu" aria-expanded={open} onClick={() => setOpen(true)} data-testid="menu-open">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M3 7h12M3 11h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="seg" aria-label="Open the menu" onClick={() => setOpen(true)}>
          <MarkGlyph size={20} />
        </button>
        <Link href="/app" className="seg side go" data-testid="dock-app">
          <span className="roll">
            <span>Open app</span>
            <span aria-hidden="true">Open app</span>
          </span>
        </Link>
      </div>
      {open ? <Menu onClose={() => setOpen(false)} path={path} /> : null}
    </>
  );
}

function Menu({ onClose, path }: { onClose: () => void; path: string }) {
  const trap = useRef<HTMLDivElement>(null);
  useFocusTrap(trap, true, onClose);
  return createPortal(
    <div className="dock-menu" role="dialog" aria-modal="true" aria-label="Menu" ref={trap} data-testid="menu" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute left-0 right-0 top-0">
        <div className="wrap top-in">
          <Wordmark />
          <button type="button" className="rq-iconbtn" aria-label="Close the menu" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <nav aria-label="Main" className="mb-8">
        {[{ href: "/", label: "Home" }, ...NAV].map((n) => (
          <Link key={n.href} href={n.href} onClick={onClose} aria-current={path === n.href ? "page" : undefined}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="max-w-[520px]">
        <CaBox testid="menu-ca" />
      </div>
    </div>,
    document.body,
  );
}
