"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KPICard } from "@/components/dashboard/kpi-card";
import { AlertCard } from "@/components/dashboard/alert-card";
import type { ReportRunRow, FactBundle } from "@manukora/backend";

type AlertType = "error" | "warning" | "info";

interface AlertData {
  readonly id: number;
  readonly type: AlertType;
  readonly title: string;
  readonly description: string;
  readonly icon: React.ReactNode;
}

const mockData = {
  revenue: {
    value: "$1,284,500",
    trend: "+12.4% vs LY",
  },
  averageOrderValue: {
    value: "$84.20",
    insight: "Stabilized after Q3 price adjustment. Retention rates up 4.2%.",
  },
  channels: [
    { name: "Shopify", percentage: 62 },
    { name: "Amazon", percentage: 38 },
  ],
  alerts: [
    {
      id: 1,
      type: "error" as const,
      title: "2 SKUs at Critical Low Stock",
      description:
        "UMF 24+ (250g) and Multifloral (500g) are projected to stock out in 8 days. Ocean freight delay of 4 days confirmed.",
      icon: "⚠️",
    },
    {
      id: 2,
      type: "warning" as const,
      title: "High-Value SKU Trend Shift",
      description:
        "UMF 15+ 3-month sales trend declining by 14%. Competitive entry on Amazon US suspected. Reviewing pricing strategy.",
      icon: "📉",
    },
    {
      id: 3,
      type: "info" as const,
      title: "Inventory Rebalance: West Coast",
      description:
        "Reallocation of 4,000 units from East to West Coast DCs to optimize shipping costs and lead times.",
      icon: "📦",
    },
  ] as readonly AlertData[],
} as const;

/**
 * DashboardPage
 * Executive summary view with KPIs, channel split, and action items.
 * Uses composed shadcn components (Card, Badge) for consistency.
 * Fetches real data from /api/reports endpoint.
 */
export default function DashboardPage() {
  const [reports, setReports] = useState<ReportRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const response = await fetch("/api/reports");
        if (!response.ok) {
          throw new Error("Failed to fetch reports");
        }
        setReports(await response.json());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-12">
        <div className="animate-pulse">
          <div className="h-8 bg-surface-container rounded w-1/3 mb-4" />
          <div className="h-4 bg-surface-container rounded w-full" />
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <AlertCard
        type="error"
        title="Failed to Load Dashboard"
        description={error}
        icon="⚠️"
        badgeLabel="Error"
      />
    );
  }

  // Get latest report for display
  const latestReport = reports[0];
  const metadata = latestReport?.metadata as Record<string, unknown> | null;

  return (
    <div className="space-y-12">
      {/* Header section */}
      <section className="mb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="max-w-2xl">
            <p className="font-label text-secondary font-bold tracking-widest uppercase text-xs mb-2">
              Monthly Performance
            </p>
            <h2 className="font-headline text-5xl md:text-6xl font-bold text-foreground leading-none mb-4">
              Executive <span className="text-primary italic font-medium">Summary</span>
            </h2>
            <p className="text-on-surface-variant text-base max-w-md leading-relaxed">
              A high-precision overview of current sales trajectories and inventory health for the MTD
              period.
            </p>
          </div>
          <Badge variant="outline" className="h-fit">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-secondary animate-pulse mr-2" />
            Live Market Data
          </Badge>
        </div>
      </section>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Total Revenue */}
        <div className="md:col-span-12 lg:col-span-7">
          <KPICard
            title={`Revenue - ${latestReport?.period || "MTD"}`}
            value={metadata?.totalRevenue ? `$${(metadata.totalRevenue as number).toLocaleString()}` : mockData.revenue.value}
            trend={mockData.revenue.trend}
          >
            <div className="w-full h-20 flex items-end gap-1">
              {[50, 65, 35, 75, 50, 100, 85].map((height, i) => (
                <div
                  key={i}
                  className="flex-1 bg-secondary/20 rounded-sm"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </KPICard>
        </div>

        {/* Average Order Value */}
        <div className="md:col-span-6 lg:col-span-5">
          <KPICard
            title="Avg. Order Value"
            value={mockData.averageOrderValue.value}
            footer={
              <p className="text-xs text-on-surface-variant leading-relaxed font-medium uppercase tracking-wider">
                {mockData.averageOrderValue.insight}
              </p>
            }
          />
        </div>

        {/* Channel Split */}
        <div className="md:col-span-12">
          <Card className="bg-surface-container border-outline/5">
            <CardContent className="pt-6">
              <h3 className="text-xs font-label uppercase tracking-widest text-on-surface-variant mb-6">
                Channel Split
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {mockData.channels.map((channel) => (
                  <div key={channel.name} className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                        {channel.name}
                      </span>
                      <span className="font-headline text-xl font-bold text-foreground">
                        {channel.percentage}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                      <div
                        className="honey-gradient h-full rounded-full"
                        style={{ width: `${channel.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Alerts Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4">
          <h3 className="font-headline text-4xl font-bold mb-4 tracking-tight">
            What to <span className="text-primary italic font-medium">Act On</span>
          </h3>
          <p className="text-on-surface-variant mb-6 text-sm leading-relaxed">
            Identified critical items requiring executive oversight or strategic pivot within the next
            72 hours.
          </p>
          <Card className="bg-secondary-container border-secondary/10">
            <CardContent className="pt-6">
              <span className="text-xs font-bold uppercase tracking-widest text-secondary">
                Supply Chain Status
              </span>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-lg">✓</span>
                <span className="font-label text-xs font-bold uppercase tracking-widest text-secondary">
                  Logistics: On Track
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8 space-y-4">
          {mockData.alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              type={alert.type}
              title={alert.title}
              description={alert.description}
              icon={alert.icon}
              badgeLabel={
                alert.type === "error"
                  ? "Action Needed"
                  : alert.type === "warning"
                    ? "Review Required"
                    : "In Progress"
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}
