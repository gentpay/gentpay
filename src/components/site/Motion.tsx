"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
 * Site-wide motion, reproducing the UI reference (referensi/recon-ui/MOTION.txt) with our own code. Everything is visible by
 * default: hidden start states in globals.css apply only under html.motion, which MOTION_BOOT sets before paint (and removes
 * again if this script never starts). With prefers-reduced-motion nothing moves.
 *
 *  [data-reveal]   fades up 36 px once in view (adds .in); --delay staggers siblings
 *  [data-lines]    heading whose .ln > span lines slide up from a mask once in view
 *  [data-scale]    settles from scale .92 to 1 once in view
 *  [data-words]    paragraph split into words whose opacity follows the scroll (reference: two-tone text reveal)
 *  [data-grow]     sets --p (0..1) from the element's scroll progress: the scale-up media card and the blurred heading use it
 *  AUTO            cards on app pages are tagged as reveals so pages need no wrappers
 */

const AUTO = ["main .card", "main .flow-card"].join(",");

export function Motion() {
  const path = usePathname();

  useEffect(() => {
    (window as unknown as { __gpMotion?: boolean }).__gpMotion = true;
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.remove("motion");
      return;
    }
    root.classList.add("motion");

    const vh = () => window.innerHeight || 800;
    document.querySelectorAll<HTMLElement>(AUTO).forEach((el) => {
      if (el.hasAttribute("data-reveal") || el.closest("[data-reveal],[data-scale],[data-noauto]")) return;
      if (el.getBoundingClientRect().top < vh()) return;
      el.setAttribute("data-reveal", "auto");
    });

    const io = new IntersectionObserver(
      (entries) => {
        let k = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          if (el.dataset.reveal === "auto") el.style.setProperty("--delay", `${Math.min(k++, 5) * 70}ms`);
          el.classList.add("in");
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    const SEL = "[data-reveal],[data-scale],[data-lines]";
    const watched = new WeakSet<Element>();
    const observe = (r: ParentNode) => {
      r.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
        if (watched.has(el)) return;
        watched.add(el);
        io.observe(el);
      });
    };
    observe(document);
    const mo = new MutationObserver((list) => {
      for (const m of list)
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement) {
            if (n.matches(SEL) && !watched.has(n)) {
              watched.add(n);
              io.observe(n);
            }
            observe(n);
          }
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Word highlight.
    const blocks = [...document.querySelectorAll<HTMLElement>("[data-words]")];
    for (const b of blocks) {
      if (b.dataset.split) continue;
      b.dataset.split = "1";
      const walk = (node: Node) => {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === Node.TEXT_NODE) {
            const frag = document.createDocumentFragment();
            for (const w of (child.textContent ?? "").split(/(\s+)/)) {
              if (!w) continue;
              if (/^\s+$/.test(w)) frag.appendChild(document.createTextNode(w));
              else {
                const s = document.createElement("span");
                s.className = "w";
                s.textContent = w;
                frag.appendChild(s);
              }
            }
            child.replaceWith(frag);
          } else walk(child);
        }
      };
      walk(b);
    }
    const grows = [...document.querySelectorAll<HTMLElement>("[data-grow]")];
    let raf = 0;
    const paint = () => {
      raf = 0;
      const h = vh();
      for (const b of blocks) {
        const r = b.getBoundingClientRect();
        const ws = b.querySelectorAll<HTMLElement>(".w");
        const p = Math.min(1, Math.max(0, (h * 0.92 - r.top) / (h * 0.55)));
        ws.forEach((w, i) => {
          const local = Math.min(1, Math.max(0, p * ws.length - i + 1));
          w.style.setProperty("--o", String(0.22 + 0.78 * local));
        });
      }
      for (const g of grows) {
        const r = g.getBoundingClientRect();
        // 0 when the section's top reaches the bottom of the viewport, 1 when its middle reaches the middle.
        const p = Math.min(1, Math.max(0, (h - r.top) / Math.max(1, r.height * 0.6)));
        g.style.setProperty("--p", p.toFixed(3));
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [path]);

  return null;
}
