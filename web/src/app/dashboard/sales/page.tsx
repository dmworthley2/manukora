"use client";

import { TrendingUp, TrendingDown } from "lucide-react";

const mockData = {
  topSkus: [
    {
      name: "Manuka Honey MGO 850+ (500g)",
      units: 1240,
      percentage: 92,
      trend: "increasing",
    },
    {
      name: "Manuka Honey MGO 1100+ (250g)",
      units: 985,
      percentage: 78,
      trend: "stable",
    },
    {
      name: "Raw Manuka Squeeze (340g)",
      units: 842,
      percentage: 65,
      trend: "increasing",
    },
    {
      name: "Kānuka Honey Blend (500g)",
      units: 612,
      percentage: 45,
      trend: "declining",
    },
    {
      name: "Multifloral Bulk (1kg)",
      units: 520,
      percentage: 35,
      trend: "declining",
    },
  ],
  underperforming: [
    { name: "Multifloral Bulk (1kg)", variance: "-22%" },
    { name: "Honeydew Glass Jar", variance: "-14%" },
  ],
  hubMetrics: [
    { name: "Auckland Hub", sellThru: 92, color: "#274e3d" },
    { name: "LA Warehouse", sellThru: 64, color: "#f6be00" },
    { name: "EU Distribution", sellThru: 58, color: "#d0c5af" },
  ],
};

export default function SalesPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <section className="mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="max-w-2xl">
            <p className="font-label text-primary font-bold tracking-widest uppercase text-xs mb-2">
              Performance Analytics
            </p>
            <h1 className="font-headline text-5xl font-medium tracking-tight text-foreground italic mb-3">
              Sales & Trends
            </h1>
            <p className="text-on-surface-variant max-w-md leading-relaxed text-sm font-medium opacity-80">
              An editorial overview of product movement across the global supply chain, pinpointing
              velocity shifts and regional spikes.
            </p>
          </div>
          <div className="bg-surface-container p-1 rounded-sm flex gap-1 border border-outline/10">
            <button className="bg-surface-container-high text-foreground px-6 py-2 rounded-sm font-label text-xs font-bold uppercase tracking-widest transition-all">
              Revenue
            </button>
            <button className="text-on-surface-variant hover:text-foreground px-6 py-2 rounded-sm font-label text-xs font-bold uppercase tracking-widest transition-all">
              Units
            </button>
          </div>
        </div>
      </section>

      {/* Bento grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top sold */}
        <div className="lg:col-span-8 bg-surface-container rounded-sm p-8 relative overflow-hidden border border-outline/10">
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="font-headline text-2xl font-semibold italic text-foreground mb-1">
                  What Sold Well
                </h2>
                <p className="text-on-surface-variant font-label text-xs uppercase tracking-wider font-bold">
                  Top 5 SKUs by volume · Past 30 days
                </p>
              </div>
              <div className="flex items-center gap-2 text-secondary">
                <TrendingUp size={16} />
                <span className="font-label text-xs font-bold uppercase tracking-widest">
                  +12.4% Overall Growth
                </span>
              </div>
            </div>

            <div className="space-y-8">
              {mockData.topSkus.map((sku) => (
                <div key={sku.name} className="group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-label text-sm font-bold text-foreground">
                      {sku.name}
                    </span>
                    <span className="font-headline italic font-bold text-xl text-foreground">
                      {sku.units}{" "}
                      <span className="text-xs font-medium text-on-surface-variant/60 tracking-wider">
                        UNITS
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex-grow h-1.5 bg-on-surface/5 rounded-full overflow-hidden">
                      <div
                        className="honey-gradient rounded-full"
                        style={{ width: `${sku.percentage}%` }}
                      ></div>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      {sku.trend === "increasing" && (
                        <>
                          <TrendingUp size={12} className="text-secondary" />
                          <span className="font-label font-bold text-secondary uppercase tracking-tighter">
                            Increasing
                          </span>
                        </>
                      )}
                      {sku.trend === "stable" && (
                        <span className="font-label font-bold text-on-surface-variant/60 uppercase tracking-tighter">
                          Stable
                        </span>
                      )}
                      {sku.trend === "declining" && (
                        <>
                          <TrendingDown size={12} className="text-error" />
                          <span className="font-label font-bold text-error uppercase tracking-tighter">
                            Declining
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Insights sidebar */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Executive insight */}
          <div className="flex-grow bg-secondary text-primary-container rounded-sm p-8 relative overflow-hidden">
            <div className="relative z-10 h-full flex flex-col">
              <div className="mb-auto">
                <span className="text-3xl mb-4 block">✨</span>
                <h3 className="font-headline text-2xl font-medium mb-4 leading-tight italic">
                  Executive Insight
                </h3>
                <p className="text-primary-container/80 leading-relaxed font-headline italic text-base mb-6">
                  &ldquo;Seasonal spike for <span className="text-primary-container font-bold">
                    Manuka MGO 850+
                  </span> is driven by North American wellness campaigns, outperforming the forecast by
                  18%.&rdquo;
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-sm p-4 border border-white/10">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary-container/20 rounded-sm">
                    <span className="text-lg">💡</span>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-primary-container/50 font-bold mb-1">
                      Recommendation
                    </div>
                    <div className="text-xs font-semibold leading-relaxed text-primary-container">
                      Pull forward reorder for SKU-M850 ahead of winter surge.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Underperforming */}
          <div className="bg-surface-container rounded-sm p-6 border border-outline/10">
            <h3 className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">
              Underperforming
            </h3>
            <div className="space-y-3">
              {mockData.underperforming.map((sku) => (
                <div
                  key={sku.name}
                  className="flex items-center justify-between p-3 bg-surface border border-outline/10 rounded-sm hover:border-error/30 transition-colors"
                >
                  <div>
                    <div className="text-sm font-bold text-foreground">{sku.name}</div>
                    <div className="text-xs font-bold text-error uppercase tracking-tighter">
                      {sku.variance} vs. Forecast
                    </div>
                  </div>
                  <TrendingDown size={14} className="text-error" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hub metrics */}
      <div className="bg-surface rounded-sm p-8 flex flex-col md:flex-row gap-12 items-center border border-outline/10">
        <div className="w-full md:w-1/3">
          <h3 className="font-headline text-2xl font-medium italic text-foreground mb-3">
            Inventory Reach
          </h3>
          <p className="text-on-surface-variant text-sm leading-relaxed mb-6 opacity-80">
            Real-time visualization of inventory dispersion vs. demand velocity across regional hubs.
            Areas in darker colors indicate high sell-through rates.
          </p>
          <div className="space-y-4">
            {mockData.hubMetrics.map((hub) => (
              <div key={hub.name} className="flex items-center gap-4">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: hub.color }}
                ></div>
                <div>
                  <span className="font-label text-xs font-bold block text-foreground">
                    {hub.name}
                  </span>
                  <span className="text-xs text-on-surface-variant font-medium">
                    {hub.sellThru}% Sell-thru rate
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="w-full md:w-2/3 h-48 md:h-64 bg-surface-container rounded-sm border border-outline/10 flex items-center justify-center">
          <p className="text-on-surface-variant text-center">
            Regional inventory heat map visualization
          </p>
        </div>
      </div>
    </div>
  );
}
