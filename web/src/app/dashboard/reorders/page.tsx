"use client";

import { AlertCircle } from "lucide-react";

type Urgency = "critical" | "high" | "moderate";

interface Recommendation {
  rank: number;
  sku: string;
  name: string;
  urgency: Urgency;
  reason: string;
  suggestedQty: string;
  leadTime: string;
  commercialValue: string;
  conflict: string | null;
}

const mockRecommendations: Recommendation[] = [
  {
    rank: 1,
    sku: "MK-850-500",
    name: "UMF 20+ MGO 850+ (500g)",
    urgency: "critical",
    reason: "Projected stockout in 7 days | High commercial value",
    suggestedQty: "12,000 units",
    leadTime: "14 days (ocean)",
    commercialValue: "$124,500",
    conflict: null,
  },
  {
    rank: 2,
    sku: "MK-1100-250",
    name: "UMF 24+ MGO 1122+ (250g)",
    urgency: "high",
    reason: "12 days of cover | Premium segment",
    suggestedQty: "8,500 units",
    leadTime: "14 days (ocean)",
    commercialValue: "$82,300",
    conflict: "Declining 3-month trend (-8%). Recommend smaller lot.",
  },
  {
    rank: 3,
    sku: "MK-514-500",
    name: "UMF 15+ MGO 514+ (500g)",
    urgency: "moderate",
    reason: "22 days of cover | Volume driver",
    suggestedQty: "10,000 units",
    leadTime: "21 days (air)",
    commercialValue: "$45,100",
    conflict: null,
  },
];

export default function ReordersPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <section className="mb-8">
        <p className="font-label text-xs uppercase tracking-widest text-primary font-bold mb-2">
          Commercial Optimization
        </p>
        <h2 className="font-headline text-5xl md:text-6xl font-medium tracking-tight text-foreground mb-4">
          Prioritized <span className="text-primary italic font-medium">Reorders</span>
        </h2>
        <p className="text-on-surface-variant max-w-2xl leading-relaxed text-base">
          Ranked by commercial value at risk with declining-demand conflicts surfaced. Quantities
          account for lead time, safety stock, and seasonal velocity. Final orders subject to
          supplier capacity and cash constraints.
        </p>
      </section>

      {/* Recommendations stack */}
      <div className="space-y-6">
        {mockRecommendations.map((rec) => (
          <RecommendationCard key={rec.rank} rec={rec} />
        ))}
      </div>

      {/* Footer guidance */}
      <section className="bg-surface-container rounded-sm p-8 border border-outline/10">
        <h3 className="font-headline text-xl font-semibold text-foreground mb-4">
          How to Use These Recommendations
        </h3>
        <ul className="space-y-3 text-on-surface-variant text-sm leading-relaxed">
          <li className="flex gap-3">
            <span className="text-primary font-bold">1.</span>
            <span>
              Review each recommendation with your supply chain team to confirm lead times and
              supplier availability.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-primary font-bold">2.</span>
            <span>
              Pay special attention to conflict flags—these SKUs have competing signals that require
              human judgment.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-primary font-bold">3.</span>
            <span>
              Quantities are baseline; adjust for minimum order quantities, packaging constraints, or
              cash flow as needed.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-primary font-bold">4.</span>
            <span>
              Once orders are placed, update the system with confirmed lead times for the next briefing
              cycle.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const urgencyStyles: Record<Urgency, string> = {
    critical: "border-l-4 border-error bg-error/5 hover:bg-error/10",
    high: "border-l-4 border-primary bg-primary/5 hover:bg-primary/10",
    moderate: "border-l-4 border-secondary bg-secondary/5 hover:bg-secondary/10",
  };

  const urgencyBadge: Record<Urgency, string> = {
    critical: "bg-error/20 text-error",
    high: "bg-primary/20 text-primary",
    moderate: "bg-secondary/20 text-secondary",
  };

  return (
    <div
      className={`rounded-sm p-8 border border-outline/10 transition-all cursor-pointer ${urgencyStyles[rec.urgency]}`}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left side: Core recommendation */}
        <div>
          <div className="flex items-start gap-4 mb-6">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-headline font-bold text-white flex-shrink-0 ${
                rec.urgency === "critical"
                  ? "bg-error"
                  : rec.urgency === "high"
                    ? "bg-primary"
                    : "bg-secondary"
              }`}
            >
              {rec.rank}
            </div>
            <div className="flex-1">
              <h4 className="font-headline text-lg font-semibold text-foreground mb-1">
                {rec.name}
              </h4>
              <p className="font-label text-xs text-on-surface-variant uppercase tracking-widest">
                {rec.sku}
              </p>
            </div>
            <div className={`px-3 py-1 rounded-sm font-label text-xs font-bold uppercase tracking-widest ${urgencyBadge[rec.urgency]}`}>
              {rec.urgency === "critical"
                ? "Order Now"
                : rec.urgency === "high"
                  ? "Priority"
                  : "Next Cycle"}
            </div>
          </div>

          <p className="text-on-surface-variant text-base leading-relaxed mb-6">
            {rec.reason}
          </p>

          <div className="bg-surface rounded-sm p-4 border border-outline/10">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant mb-1">
                  Suggested Quantity
                </p>
                <p className="font-headline text-xl font-bold text-foreground">
                  {rec.suggestedQty}
                </p>
              </div>
              <div>
                <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant mb-1">
                  Lead Time
                </p>
                <p className="font-headline text-base font-bold text-primary">
                  {rec.leadTime}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right side: Commercial value & conflicts */}
        <div className="flex flex-col gap-6">
          {/* Commercial value */}
          <div className="bg-surface rounded-sm p-6 border border-outline/10">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant mb-2">
              Commercial Value at Risk
            </p>
            <p className="font-headline text-4xl font-bold text-foreground mb-3">
              {rec.commercialValue}
            </p>
            <p className="text-on-surface-variant text-sm">
              Revenue exposure if stockout occurs within 30 days
            </p>
          </div>

          {/* Conflict if exists */}
          {rec.conflict ? (
            <div className="bg-error/10 rounded-sm p-6 border border-error/20 flex gap-4">
              <AlertCircle size={20} className="text-error flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-label text-xs uppercase tracking-widest text-error font-bold mb-2">
                  Demand Conflict
                </p>
                <p className="text-error text-sm leading-relaxed">{rec.conflict}</p>
              </div>
            </div>
          ) : null}

          {/* Action button */}
          <button className="mt-auto w-full honey-gradient text-on-primary px-6 py-3 rounded-sm font-label font-bold uppercase tracking-widest transition-opacity hover:opacity-90">
            Create Purchase Order
          </button>
        </div>
      </div>
    </div>
  );
}
