"use client";

import { Filter, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InventoryTable } from "@/components/inventory/inventory-table";

type RiskLevel = "critical" | "high" | "moderate" | "safe";

interface InventoryItem {
  readonly sku: string;
  readonly name: string;
  readonly onHand: number;
  readonly dailyVelocity: number;
  readonly daysOfCover: number;
  readonly riskLevel: RiskLevel;
  readonly revenueOpportunity: string;
}

const mockInventory: readonly InventoryItem[] = [
  {
    sku: "MK-850-500",
    name: "UMF 20+ MGO 850+ (500g)",
    onHand: 420,
    dailyVelocity: 58.4,
    daysOfCover: 7,
    riskLevel: "critical",
    revenueOpportunity: "$124,500",
  },
  {
    sku: "MK-1100-250",
    name: "UMF 24+ MGO 1122+ (250g)",
    onHand: 185,
    dailyVelocity: 15.2,
    daysOfCover: 12,
    riskLevel: "high",
    revenueOpportunity: "$82,300",
  },
  {
    sku: "MK-514-500",
    name: "UMF 15+ MGO 514+ (500g)",
    onHand: 1450,
    dailyVelocity: 65.0,
    daysOfCover: 22,
    riskLevel: "moderate",
    revenueOpportunity: "$45,100",
  },
  {
    sku: "MK-080-1000",
    name: "Multifloral MGO 80+ (1kg)",
    onHand: 3200,
    dailyVelocity: 78.2,
    daysOfCover: 41,
    riskLevel: "safe",
    revenueOpportunity: "$18,400",
  },
];

export default function InventoryPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-8 items-end mb-8">
        <div className="md:col-span-8">
          <p className="font-label text-xs uppercase tracking-widest text-primary font-bold mb-2">
            Supply Chain Intelligence
          </p>
          <h2 className="font-headline text-5xl md:text-6xl font-medium tracking-tight text-foreground leading-tight mb-4">
            Stock Cover <br />& <span className="text-primary italic font-semibold">Inventory Risk</span>
          </h2>
          <p className="mt-4 text-on-surface-variant max-w-lg font-body text-sm leading-relaxed opacity-80">
            Real-time monitoring of SKU longevity based on current sell-through velocity. Prioritizing
            reorders for maximum revenue protection.
          </p>
        </div>
        <div className="md:col-span-4 flex flex-col items-end">
          <div className="bg-surface border border-surface-container rounded-sm px-6 py-4 flex items-center gap-6">
            <div className="text-right">
              <p className="font-label text-xs uppercase text-on-surface-variant tracking-widest mb-1">
                Total SKUs
              </p>
              <p className="font-headline text-3xl font-medium text-foreground">142</p>
            </div>
            <div className="h-10 w-px bg-surface-container"></div>
            <div className="text-right">
              <p className="font-label text-xs uppercase text-error tracking-widest mb-1">
                Critical (&lt;15d)
              </p>
              <p className="font-headline text-3xl font-medium text-error">12</p>
            </div>
          </div>
        </div>
      </section>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Critical Cover Risk Analysis</CardTitle>
            <CardDescription>Top at-risk SKUs by days of cover</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <InventoryTable items={mockInventory} />
        </CardContent>
      </Card>

      {/* Insight cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            title: "Safety Stock Breaches",
            metric: "3 SKUs",
            description:
              "Expected safety stock threshold breaches within 14 days if lead times delay.",
            icon: "⚠️",
          },
          {
            title: "Slow-Moving Inventory",
            metric: "18 SKUs",
            description:
              "Items with less than 3 days of cover should be discontinued or bundled.",
            icon: "📦",
          },
          {
            title: "Optimal Reorder Window",
            metric: "Next 7 days",
            description:
              "Historical lead times suggest orders placed by Friday will arrive on schedule.",
            icon: "📅",
          },
        ].map((card) => (
          <Card key={card.title} className="hover:border-primary/30 transition-all">
            <CardHeader className="pb-3">
              <span className="text-4xl mb-2 block">{card.icon}</span>
              <CardTitle className="text-lg">{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-headline text-2xl font-bold text-primary mb-2">
                {card.metric}
              </p>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
