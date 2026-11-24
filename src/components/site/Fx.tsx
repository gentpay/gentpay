"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Small motion pieces from the UI reference (referensi/recon-ui/MOTION.txt), each one safe without JS (it renders the final
 * state on the server) and still under prefers-reduced-motion:
 *   Odometer   digits roll vertically to the value when it comes into view (reference: "Up To 37%")
 *   DragRow    horizontal row you can drag, with the round "Drag" cursor (reference: card carousels)
 *   Tabs       list on the left whose active item fills a progress line and advances on its own (reference: "Time Modes")
 *   Lines      a heading that slides up line by line from a mask
 */

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Odometer({ value, className = "" }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || !document.documentElement.classList.contains("motion")) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) return;
    setShown(false);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <span ref={ref} className={`odo ${className}`} aria-label={value}>
      {[...value].map((ch, i) =>
        /\d/.test(ch) ? (
          <span className="col" key={i} aria-hidden="true">
            <span style={{ transform: `translateY(-${shown ? Number(ch) * 10 : 0}%)`, transitionDelay: `${i * 60}ms` }}>
              {Array.from({ length: 10 }, (_, d) => (
                <b key={d}>{d}</b>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden="true">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

export function DragRow({ children, className = "", testid }: { children: React.ReactNode; className?: string; testid?: string }) {
  const row = useRef<HTMLDivElement>(null);
  const cur = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = row.current;
    const c = cur.current;
    if (!el || !c) return;
    let down = false;
    let x0 = 0;
    let s0 = 0;
    let moved = 0;
    const move = (e: PointerEvent) => {
      c.style.left = `${e.clientX}px`;
      c.style.top = `${e.clientY}px`;
      if (!down) return;
      moved = Math.abs(e.clientX - x0);
      el.scrollLeft = s0 - (e.clientX - x0);
    };
    const enter = () => c.classList.add("on");
    const leave = () => {
      c.classList.remove("on");
      down = false;
      el.classList.remove("dragging");
    };
    const pdown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      down = true;
      moved = 0;
      x0 = e.clientX;
      s0 = el.scrollLeft;
      el.classList.add("dragging");
    };
    const up = () => {
      down = false;
      el.classList.remove("dragging");
    };
    const click = (e: MouseEvent) => {
      if (moved > 6) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerdown", pdown);
    window.addEventListener("pointerup", up);
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerdown", pdown);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("click", click, true);
    };
  }, []);
  return (
    <>
      <div ref={row} className={`drag ${className}`} data-testid={testid}>
        {children}
      </div>
      <div ref={cur} className="drag-cursor" aria-hidden="true">
        Drag
      </div>
    </>
  );
}

export function Tabs({ items, ms = 6500 }: { items: { title: string; text: React.ReactNode; panel: React.ReactNode }[]; ms?: number }) {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!auto || reduced()) return;
    const t = setTimeout(() => {
      if (document.visibilityState === "visible") setI((v) => (v + 1) % items.length);
    }, ms);
    return () => clearTimeout(t);
  }, [i, auto, ms, items.length]);
  return (
    <div ref={host} className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,360px)_1fr] lg:gap-16">
      <div className="tabbar" role="tablist" aria-label="Steps" style={{ "--tab-ms": `${ms}ms` } as React.CSSProperties}>
        {items.map((it, k) => (
          <button
            key={it.title}
            type="button"
            role="tab"
            aria-selected={k === i}
            onClick={() => {
              setI(k);
              setAuto(false);
            }}
            data-testid={`tab-${k}`}
          >
            <span className="prog" key={`${k}-${i}-${auto}`} style={auto ? undefined : { width: k === i ? "100%" : 0, animation: "none" }} />
            <span className="flex items-baseline gap-3 text-[21px]">
              <span className="t-num text-[13px] text-[var(--dim)]">0{k + 1}</span>
              {it.title}
            </span>
            <span className="desc">
              <div>
                <p className="t-small muted mt-3 max-w-[320px]">{it.text}</p>
              </div>
            </span>
          </button>
        ))}
      </div>
      <div className="relative min-h-[360px] min-w-0" role="tabpanel">
        <div key={i} className="tabpanel-in">
          {items[i].panel}
        </div>
      </div>
    </div>
  );
}

export function Lines({ lines, className = "", as: Tag = "h2" }: { lines: React.ReactNode[]; className?: string; as?: "h1" | "h2" | "h3" | "p" }) {
  const Any = Tag as React.ElementType;
  return (
    <Any className={className} data-lines="">
      {lines.map((l, i) => (
        <span className="ln" key={i} style={{ "--i": i } as React.CSSProperties}>
          <span>{l}</span>
        </span>
      ))}
    </Any>
  );
}
