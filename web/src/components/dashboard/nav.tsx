"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
}

interface DashboardNavProps {
  readonly className?: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/data-sources", label: "Data Sources", icon: "📁" },
  { href: "/dashboard", label: "Summary", icon: "📊" },
  { href: "/dashboard/sales", label: "Sales", icon: "📈" },
  { href: "/dashboard/inventory", label: "Inventory", icon: "📦" },
  { href: "/dashboard/reorders", label: "Reorders", icon: "🔄" },
];

/**
 * DashboardNav
 * Responsive navigation component used in both desktop and mobile contexts.
 * Highlights the current route.
 */
export function DashboardNav({ className }: DashboardNavProps) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex gap-8 items-center", className)}>
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href ||
          (pathname.startsWith(item.href) && item.href !== "/dashboard");

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center p-4 md:p-0 transition-colors gap-1 md:gap-0",
              isActive
                ? "text-primary md:text-primary"
                : "text-on-surface-variant hover:text-primary md:hover:text-primary"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="text-2xl md:text-base">{item.icon}</span>
            <span className="text-[10px] font-label font-semibold uppercase tracking-widest md:text-sm">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
