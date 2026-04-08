"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ReportRunRow } from "@manukora/backend";

interface BriefingSection {
  section_id: string;
  title: string;
  analyst_draft: string;
  analyst_reasoning: string;
  is_approved: boolean;
}

interface BriefingData {
  reportRunId: string;
  period: string;
  created_at: string;
  sections: BriefingSection[];
}

/**
 * DashboardPage
 * Daily Briefing view aligned to mockup design.
 * Features editorial layout with executive summary, KPIs, and critical insights.
 * Fetches real data from /api/briefings and /api/reports endpoints.
 */
export default function DashboardPage() {
  const [reports, setReports] = useState<ReportRunRow[]>([]);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch latest report
        const reportsResponse = await fetch("/api/reports");
        if (!reportsResponse.ok) {
          throw new Error("Failed to fetch reports");
        }
        const reportsData = (await reportsResponse.json()) as ReportRunRow[];
        setReports(reportsData);

        // Fetch briefing for latest report
        if (reportsData.length > 0) {
          const latestReport = reportsData[0];
          const briefingResponse = await fetch(`/api/briefings/${latestReport.id}`);
          if (briefingResponse.ok) {
            const briefingData = (await briefingResponse.json()) as BriefingData;
            setBriefing(briefingData);
          }
        }

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
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
      <Card className="border-red-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-bold mb-2">Failed to Load Dashboard</h3>
              <p className="text-on-surface-variant text-sm">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const latestReport = reports[0];
  const metadata = (latestReport?.metadata as Record<string, unknown> | null) || {};
  const reportDate = briefing?.created_at
    ? new Date(briefing.created_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

  // Find specific sections
  const executiveSummarySection = briefing?.sections.find(
    (s) => s.section_id === "executive-summary" || s.title.toLowerCase().includes("executive")
  );
  const insightSections = briefing?.sections.filter(
    (s) => !s.section_id?.includes("executive") && s.analyst_draft
  ) || [];

  return (
    <div className="space-y-12">
      {/* Editorial Header Section */}
      <section className="mb-12">
        <div className="flex flex-col md:flex-row justify-between items-end gap-6">
          <div className="max-w-2xl">
            <p className="font-label text-secondary font-bold tracking-[0.2em] uppercase text-[10px] mb-2 block">
              S&OP Intelligence
            </p>
            <h2 className="font-headline text-5xl md:text-7xl font-extrabold text-foreground leading-none mb-6">
              Today's <span className="text-primary italic font-medium">Briefing</span>
            </h2>
            <p className="text-on-surface-variant text-lg max-w-xl leading-relaxed">
              Synthesis of marketplace performance, supply chain risks, and strategic opportunities for {reportDate}.
            </p>
          </div>
          <Badge variant="outline" className="h-fit">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-secondary animate-pulse mr-2" />
            AI Engine Live
          </Badge>
        </div>
      </section>

      {/* Monthly Briefing Text Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-16">
        <div className="lg:col-span-8">
          <Card className="bg-white/40 border-outline/10">
            <CardContent className="p-8 md:p-12">
              <h3 className="font-headline text-3xl font-bold mb-8">Executive Summary</h3>
              <div className="space-y-6 text-on-surface-variant leading-relaxed text-lg">
                {executiveSummarySection?.analyst_draft ? (
                  <>
                    <p>{executiveSummarySection.analyst_draft}</p>
                    {executiveSummarySection.analyst_reasoning && (
                      <div className="p-6 bg-surface-container-low rounded-sm border-l-4 border-primary">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <span className="text-primary">📊</span>
                            <h4 className="font-bold text-xs uppercase tracking-widest text-foreground">
                              Analysis & Reasoning
                            </h4>
                          </div>
                        </div>
                        <p className="text-sm mb-4">{executiveSummarySection.analyst_reasoning}</p>
                        <details className="group">
                          <summary className="list-none cursor-pointer flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-widest hover:underline">
                            <span>View Detailed Logic</span>
                            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="mt-4 pt-4 border-t border-outline/10 text-xs space-y-2">
                            <p>Reasoning sourced from backend analysis and data validation</p>
                          </div>
                        </details>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-on-surface-variant/50">Executive summary data pending...</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary KPIs */}
        <div className="lg:col-span-4 space-y-6">
          {/* Total Revenue */}
          <Card className="bg-primary text-on-primary border-0">
            <CardContent className="p-8">
              <span className="font-label font-bold uppercase tracking-[0.2em] text-[10px] block mb-6 opacity-80">
                Total Revenue (MTD)
              </span>
              <span className="font-headline text-5xl font-bold tracking-tight block mb-2">
                {metadata?.totalRevenue
                  ? `$${(metadata.totalRevenue as number).toLocaleString()}`
                  : "—"}
              </span>
              {metadata?.revenueGrowth ? (
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                  <span>📈</span> {metadata.revenueGrowth as string}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Avg Order Value */}
          <Card className="bg-surface-container-high border-0">
            <CardContent className="p-8">
              <div className="flex justify-between items-start mb-6">
                <span className="text-on-surface-variant font-label font-bold uppercase tracking-[0.2em] text-[10px]">
                  Avg. Order Value
                </span>
              </div>
              <span className="font-headline text-4xl font-bold tracking-tight text-foreground block">
                {metadata?.avgOrderValue ? `$${(metadata.avgOrderValue as number).toFixed(2)}` : "—"}
              </span>
              {metadata?.avgOrderValueConfidence ? (
                <details className="group mt-6">
                  <summary className="list-none cursor-pointer flex items-center gap-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60 hover:opacity-100">
                    <span>Drill Down Logic</span>
                    <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-4 pt-4 border-t border-outline/10 text-[10px] space-y-2">
                    <p>{metadata.avgOrderValueConfidence as string}</p>
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Critical Insights Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-4">
          <h3 className="font-headline text-4xl font-bold mb-6 tracking-tight">
            Critical <span className="text-primary italic font-medium">Insights</span>
          </h3>
          <p className="text-on-surface-variant mb-8 text-sm leading-relaxed">
            Immediate actions identified by AI engine to preserve margin and customer experience.
          </p>
          <Card className="bg-secondary-container border-secondary/10">
            <CardContent className="p-6">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">
                Supply Chain Status
              </span>
              <div className="flex items-center gap-3 mt-3">
                <span>✓</span>
                <span className="font-bold text-xs uppercase tracking-widest text-secondary">Logistics: On Track</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Insight Cards */}
        <div className="lg:col-span-8 space-y-6">
          {insightSections && insightSections.length > 0 ? (
            insightSections.map((section) => (
              <Card key={section.section_id} className="bg-surface-container-low border-outline/5">
                <CardContent className="p-6">
                  <div className="flex items-start gap-6">
                    <div className="w-12 h-12 rounded-sm flex items-center justify-center shrink-0 bg-primary/5">
                      <span className="text-xl">📊</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                        <h4 className="font-bold text-base uppercase tracking-tight">{section.title}</h4>
                        {section.is_approved && (
                          <span className="bg-secondary/10 text-secondary px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.1em]">
                            Approved
                          </span>
                        )}
                      </div>
                      <p className="text-on-surface-variant text-sm leading-relaxed mb-4">{section.analyst_draft}</p>
                      {section.analyst_reasoning && (
                        <details
                          className="group"
                          open={expandedAlert === section.section_id}
                          onChange={(e) =>
                            setExpandedAlert(e.currentTarget.open ? section.section_id : null)
                          }
                        >
                          <summary className="list-none cursor-pointer flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-widest hover:underline">
                            <span>View Reasoning</span>
                            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="mt-4 pt-4 border-t border-outline/10 text-xs bg-surface-container/30 p-4 rounded-sm">
                            <p className="font-semibold mb-2">Analysis & Reasoning:</p>
                            <p className="opacity-80">{section.analyst_reasoning}</p>
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="bg-surface-container-low border-outline/5">
              <CardContent className="p-6">
                <p className="text-on-surface-variant text-sm">Critical insights data pending...</p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
