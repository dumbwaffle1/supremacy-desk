"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LineChart, ListOrdered, Scale, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Desk", icon: LineChart },
  { href: "/games", label: "Games", icon: ListOrdered },
  { href: "/settle", label: "Settle", icon: Scale },
  { href: "/rules", label: "Rules", icon: BookOpen },
  { href: "/admin", label: "Admin", icon: Shield },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  className={cn("size-5", active && "stroke-[2.5]")}
                  aria-hidden
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
