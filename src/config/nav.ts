import { BRAND } from "@/config/brand";

export const NAV = [
  { href: "/app", label: "Tasks" },
  { href: "/provider", label: "Provider" },
  { href: "/receipts", label: "Receipts" },
  { href: "/how", label: "How it works" },
  { href: "/token", label: BRAND.symbol },
] as const;

/** Every public route, for the sitemap. */
export const ROUTES = ["/", "/app", "/provider", "/receipts", "/how", "/token"] as const;
