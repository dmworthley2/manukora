import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardNav } from "@/components/dashboard/nav";

interface DataSourcesLayoutProps {
  readonly children: React.ReactNode;
}

/**
 * DataSourcesLayout
 * Provides the same shell as DashboardLayout for the Data Sources page.
 * Ensures consistent header and navigation across all sections.
 */
export default function DataSourcesLayout({ children }: DataSourcesLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-surface">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-surface-container">
        <div className="flex justify-between items-center h-16 px-6 md:px-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Toggle menu"
            >
              <Menu className="h-6 w-6" />
            </Button>
            <h1 className="font-headline italic text-2xl tracking-tight text-foreground">
              Manukora
            </h1>
          </div>

          {/* Desktop nav */}
          <DashboardNav className="hidden md:flex" />

          {/* Profile placeholder */}
          <div className="w-10 h-10 rounded-sm bg-surface-container border border-outline/10 flex-shrink-0" />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pt-16 pb-32">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <DashboardNav className="fixed bottom-0 left-0 right-0 md:hidden z-50 flex justify-around items-center bg-surface/90 backdrop-blur-lg border-t border-surface-container" />
    </div>
  );
}
