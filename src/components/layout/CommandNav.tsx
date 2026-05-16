"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CandlestickChart, Microchip,CircuitBoard , Map, Plane, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { icon: CandlestickChart, labelKey: "dashboard", href: "/" },
  { icon: Microchip, labelKey: "command", href: "/command" },
  { icon: Map, labelKey: "plan", href: "/plan" },
  { icon: Plane, labelKey: "simulate", href: "/simulate" },
  { icon: CircuitBoard, labelKey: "hardware", href: "/hardware" },
  { icon: Clock, labelKey: "history", href: "/flight-logs" },
];

export function CommandNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="flex items-center gap-1.5 p-1 glass rounded-full shadow-inner my-1.5">
      {tabs.map(({ icon: Icon, labelKey, href }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium transition-all rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary",
              active
                ? "text-accent-primary bg-accent-primary/10 shadow-sm"
                : "text-text-secondary hover:text-text-primary hover:bg-white/5 hover:shadow-[0_0_12px_rgba(54,249,246,0.15)]"
            )}
          >
            <Icon size={14} />
            <span className="hidden lg:inline">{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
