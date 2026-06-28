"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { BookOpen, LineChart, ListOrdered, Scale, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomTabBar({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  const base = `/l/${leagueId}`;

  const tabs = [
    { href: base, label: "Desk", icon: LineChart, exact: true },
    { href: `${base}/games`, label: "Games", icon: ListOrdered },
    { href: `${base}/settle`, label: "Settle", icon: Scale },
    { href: `${base}/rules`, label: "Rules", icon: BookOpen },
    { href: `${base}/settings`, label: "Settings", icon: Settings },
  ];

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch">
        {tabs.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="relative flex flex-col items-center gap-1 py-2.5"
              >
                {active && (
                  <motion.span
                    layoutId="tab-active"
                    transition={{ type: "spring", stiffness: 520, damping: 40 }}
                    className="absolute -top-px h-0.5 w-8 rounded-full bg-primary"
                  />
                )}
                <Icon
                  className={cn(
                    "size-[19px] transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "text-[10px] font-medium transition-colors",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
