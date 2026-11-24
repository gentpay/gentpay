import Link from "next/link";
import { BRAND, CHAIN, explorerAddress, hasGithub } from "@/config/brand";
import { CONTRACTS, contractLive } from "@/config/contracts";
import { NAV } from "@/config/nav";
import { MarkGlyph } from "@/components/site/Mark";
import { CaBox } from "@/components/site/CaCopy";
import { BackToTop } from "@/components/site/BackToTop";
import { GithubIcon, XIcon } from "@/components/site/Icons";

/* The reference's footer: a glass card on the left, link columns, a round back-to-top button, a hairline, the legal line, and a
 * giant wordmark cut by the bottom edge of the page. The beam glows behind it. */
export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden pt-24" data-testid="footer">
      <div className="beam" aria-hidden="true" />
      <div className="wrap relative">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,420px)_1fr_auto]">
          <div className="glass p-5" data-reveal="">
            <div className="flex items-start gap-4">
              <span className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[16px] bg-[var(--card-2)]">
                <MarkGlyph size={34} />
              </span>
              <p className="t-small muted">
                {BRAND.slogan} Non-custodial: payments go straight from the owner&apos;s wallet to the provider. Not affiliated with Robinhood.
              </p>
            </div>
            <div className="mt-4">
              <CaBox testid="footer-ca" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <ul className="grid content-start gap-2 text-[15px]">
              <li>
                <Link href="/" className="ulink">
                  Home
                </Link>
              </li>
              {NAV.slice(0, 3).map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="hover:text-white">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="grid content-start gap-2 text-[15px]">
              {NAV.slice(3).map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="hover:text-white">
                    {n.label}
                  </Link>
                </li>
              ))}
              <li>
                <a href="/llms.txt" className="hover:text-white">
                  llms.txt
                </a>
              </li>
            </ul>
            <ul className="grid content-start gap-2 text-[15px]">
              <li>
                <a href={BRAND.x} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-white">
                  <XIcon size={13} /> {BRAND.xHandle}
                </a>
              </li>
              {hasGithub ? (
                <li>
                  <a href={BRAND.github} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-white">
                    <GithubIcon size={13} /> Source
                  </a>
                </li>
              ) : null}
              <li>
                <a href={CHAIN.explorer} target="_blank" rel="noreferrer" className="hover:text-white">
                  Explorer
                </a>
              </li>
              {contractLive() ? (
                <li>
                  <a href={explorerAddress(CONTRACTS.contract)} target="_blank" rel="noreferrer" className="hover:text-white">
                    Contract
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
          <div className="hidden lg:block">
            <BackToTop />
          </div>
        </div>
        <div className="hair mt-16 flex flex-col gap-2 py-6 text-[12px] text-[var(--muted)] sm:flex-row sm:justify-between">
          <span>
            © 2026 {BRAND.name} · {BRAND.domain} · {CHAIN.name} (chain id {CHAIN.id}), gas in {CHAIN.nativeSymbol}
          </span>
          <span>Not financial advice. {BRAND.symbol} is not needed to use {BRAND.name}.</span>
        </div>
      </div>
      <div className="relative overflow-hidden" aria-hidden="true">
        <div className="giant flex items-end gap-[0.06em] pl-[var(--gutter)]">
          <MarkGlyph size={300} className="giant-mark" />
          <span>gentpay</span>
        </div>
      </div>
    </footer>
  );
}
