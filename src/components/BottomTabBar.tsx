"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { BookOpen, LineChart, ListOrdered, Scale, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Desk", icon: LineChart, adminOnly: false },
  { href: "/games", label: "Games", icon: ListOrdered, adminOnly: false },
  { href: "/settle", label: "Settle", icon: Scale, adminOnly: false },
  { href: "/rules", label: "Rules", icon: BookOpen, adminOnly: false },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: true },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomTabBar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pt-2"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
      <ul className="glass flex w-full max-w-md items-stretch gap-1 rounded-2xl border border-border p-1.5 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.9)]">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium tracking-wide transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground/80",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-active"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    className="absolute inset-0 rounded-xl border border-border bg-accent/60"
                    style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.05)" }}
                  />
                )}
                <Icon
                  className={cn(
                    "relative size-[18px] transition-colors",
                    active && "text-brand",
                  )}
                  aria-hidden
                />
                <span className="relative">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
