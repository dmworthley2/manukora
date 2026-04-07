"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, TrendingUp, AlertCircle, CheckCircle2, TrendingDown } from "lucide-react";

interface AuditorChallenge {
  readonly id: string;
  readonly type: string;
  readonly claim: string;
  readonly question: string;
  readonly evidence: string;
  readonly severity: string;
  readonly requestedAction: string;
}

interface BriefingSection {
  readonly section_id: string;
  readonly title: string;
  readonly analyst_draft: string;
  readonly analyst_reasoning?: string;
  readonly auditor_challenges?: readonly AuditorChallenge[];
  readonly auditor_notes?: string;
  readonly analyst_response?: string;
  readonly is_approved?: boolean;
}

interface BriefingResponse {
  readonly reportRunId: string;
  readonly period: string;
  readonly briefing_status: {
    overall_status: string;
    approval_summary?: {
      total: number;
      approved: number;
      escalated: number;
      pending: number;
    };
  };
  readonly sections: readonly BriefingSection[];
}

export default function ExecutiveSummaryContent() {
  const searchParams = useSearchParams();
  const reportRunId = searchParams.get("reportRunId");

  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);

  useEffect(() => {
    if (!reportRunId) {
      setError("Report ID is required");
      setLoading(false);
      return;
    }

    const fetchBriefing = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/briefings/${reportRunId}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as BriefingResponse;
        setBriefing(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load briefing");
        setBriefing(null);
      } finally {
        setLoading(false);
      }
    };

    fetchBriefing();
  }, [reportRunId]);

  if (!reportRunId || error) {
    return (
      <div className="min-h-screen bg-[#fdf9ef] flex items-center justify-center">
        <div className="text-center text-[#4d4635]">
          <p className="text-lg">{error || "Report ID is required"}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fdf9ef] flex items-center justify-center">
        <div className="text-center text-[#4d4635]">
          <p className="text-lg">Loading briefing...</p>
        </div>
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="min-h-screen bg-[#fdf9ef] flex items-center justify-center">
        <div className="text-center text-[#4d4635]">
          <p className="text-lg">Briefing not found</p>
        </div>
      </div>
    );
  }

  // Extract sections
  const executiveSummarySection = briefing.sections.find((s) => s.section_id === "executive-summary");
  const capitalAllocationSection = briefing.sections.find((s) => s.section_id === "capital-allocation");

  // Get critical insights from sections with challenges
  const criticalInsights = briefing.sections
    .filter((s) => s.auditor_challenges && s.auditor_challenges.length > 0)
    .flatMap((s) =>
      s.auditor_challenges!.map((c) => ({
        id: `${s.section_id}-${c.id}`,
        section: s.section_id,
        challenge: c,
        resolution: s.analyst_response || "Pending analyst response",
      }))
    );

  // Calculate KPIs from approval summary
  const approvalSummary = briefing.briefing_status.approval_summary;
  const totalRevenue = 1284500; // Placeholder - would come from actual data
  const avgOrderValue = 84.2; // Placeholder - would come from actual data

  return (
    <div className="bg-[#fdf9ef] min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#fdf9ef] border-b border-[#d0c5af]/20">
        <div className="flex justify-between items-center px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-2xl italic font-serif font-semibold text-[#1c1c16]">Manukora</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-[#1c1c16]/70 text-xs font-semibold uppercase tracking-wider">
            <span className="text-[#775a00] cursor-pointer">Dashboard</span>
            <span className="cursor-pointer hover:text-[#775a00] transition-colors">Supply Chain</span>
            <span className="cursor-pointer hover:text-[#775a00] transition-colors">Marketplace</span>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-20 pb-32 px-6 max-w-7xl mx-auto">
        {/* Editorial Header */}
        <section className="mb-16">
          <div className="flex flex-col md:flex-row justify-between items-end gap-6">
            <div className="max-w-2xl">
              <span className="block text-[#3f6653] text-xs font-bold uppercase tracking-[0.2em] mb-3">
                S&OP Intelligence
              </span>
              <h1 className="font-serif text-5xl md:text-6xl font-bold text-[#1c1c16] leading-tight mb-6">
                Today's <span className="italic text-[#775a00] font-normal">Briefing</span>
              </h1>
              <p className="text-[#4d4635] text-lg max-w-xl leading-relaxed">
                Synthesis of marketplace performance, supply chain risks, and strategic opportunities for {briefing.period}.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="px-4 py-2 bg-[#f9f5eb] rounded-full flex items-center gap-2 border border-[#d0c5af]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3f6653] animate-pulse"></span>
                <span className="text-xs font-bold text-[#4d4635] uppercase tracking-widest">AI Engine Live</span>
              </div>
            </div>
          </div>
        </section>

        {/* Main Content Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          {/* Executive Summary - Left Column (Wider) */}
          <div className="lg:col-span-2">
            <div className="bg-white/40 p-8 md:p-12 rounded-sm border border-[#d0c5af]/30 backdrop-blur-sm">
              <h2 className="font-serif text-3xl font-bold mb-8 text-[#1c1c16]">Executive Summary</h2>

              {executiveSummarySection ? (
                <div className="space-y-6">
                  <div className="text-[#4d4635] leading-relaxed text-base">
                    {executiveSummarySection.analyst_draft.split("\n").map((paragraph, idx) => (
                      <p key={idx} className="mb-4">
                        {paragraph}
                      </p>
                    ))}
                  </div>

                  {/* Confidence Insight Box */}
                  {capitalAllocationSection && (
                    <div className="p-6 bg-[#f9f5eb] rounded-sm border-l-4 border-[#775a00]">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <TrendingUp className="w-5 h-5 text-[#775a00]" />
                          <h3 className="text-xs font-bold uppercase tracking-widest text-[#1c1c16]">
                            Capital Allocation Insight
                          </h3>
                        </div>
                        <span className="text-[10px] font-bold bg-[#775a00]/10 text-[#775a00] px-2 py-1 rounded-sm uppercase">
                          AI Recommended
                        </span>
                      </div>
                      <p className="text-sm text-[#4d4635] leading-relaxed">
                        {capitalAllocationSection.analyst_draft.substring(0, 200)}...
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[#4d4635]">Loading briefing content...</p>
              )}
            </div>
          </div>

          {/* KPIs - Right Column */}
          <div className="space-y-6">
            {/* Revenue KPI */}
            <div className="bg-[#775a00] text-white p-8 rounded-sm">
              <span className="text-xs font-bold uppercase tracking-[0.2em] block mb-4 opacity-80">
                Total Revenue (MTD)
              </span>
              <h3 className="font-serif text-5xl font-bold tracking-tight mb-3">${(totalRevenue / 1000000).toFixed(2)}M</h3>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                <TrendingUp className="w-4 h-4" /> +12.4% vs LY
              </div>
            </div>

            {/* AOV KPI */}
            <div className="bg-[#e6e2d8] p-8 rounded-sm">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[#4d4635] text-xs font-bold uppercase tracking-[0.2em]">Avg. Order Value</span>
                <span className="text-[9px] font-bold bg-[#3f6653]/10 text-[#3f6653] px-2 py-0.5 rounded-sm uppercase">
                  98% Confidence
                </span>
              </div>
              <h3 className="font-serif text-4xl font-bold tracking-tight text-[#1c1c16]">${avgOrderValue.toFixed(2)}</h3>
            </div>

            {/* Approval Status */}
            {approvalSummary && (
              <div className="bg-[#f9f5eb] p-6 rounded-sm border border-[#d0c5af]/30">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#4d4635] block mb-4">
                  Approval Status
                </span>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#4d4635]">Approved Sections</span>
                    <span className="font-bold text-[#3f6653]">{approvalSummary.approved}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#4d4635]">Escalated</span>
                    <span className="font-bold text-[#775a00]">{approvalSummary.escalated}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#4d4635]">Total</span>
                    <span className="font-bold text-[#1c1c16]">{approvalSummary.total}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Critical Insights Section */}
        {criticalInsights.length > 0 && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div>
              <h2 className="font-serif text-4xl font-bold mb-4 tracking-tight text-[#1c1c16]">
                Critical <span className="italic text-[#775a00]">Insights</span>
              </h2>
              <p className="text-[#4d4635] text-sm leading-relaxed">
                Immediate actions identified by AI engine to preserve margin and customer experience.
              </p>
            </div>

            {/* Alerts */}
            <div className="lg:col-span-2 space-y-6">
              {criticalInsights.slice(0, 3).map((insight) => {
                const isOpen = expandedAlert === insight.id;
                const isError = insight.challenge.severity === "error";
                const bgColor = isError ? "bg-[#ba1a1a]/5" : "bg-[#f9f5eb]";
                const iconColor = isError ? "text-[#ba1a1a]" : "text-[#775a00]";

                return (
                  <div key={insight.id} className={`${bgColor} p-6 rounded-sm border border-[#d0c5af]/30`}>
                    <div className="flex items-start gap-6">
                      <div className={`w-12 h-12 rounded-sm ${isError ? "bg-[#ba1a1a]/10" : "bg-[#775a00]/10"} flex items-center justify-center shrink-0`}>
                        {isError ? (
                          <AlertCircle className={`w-6 h-6 ${iconColor}`} />
                        ) : (
                          <TrendingDown className={`w-6 h-6 ${iconColor}`} />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                          <h3 className="font-bold text-base uppercase tracking-tight text-[#1c1c16]">
                            {insight.challenge.claim}
                          </h3>
                          <div className="flex items-center gap-2">
                            <span
                              className={`${isError ? "bg-[#ba1a1a]/10 text-[#ba1a1a]" : "bg-[#e6e2d8] text-[#4d4635]"} px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.1em]`}
                            >
                              {insight.challenge.severity === "error" ? "Action Needed" : "Review Required"}
                            </span>
                          </div>
                        </div>
                        <p className="text-[#4d4635] text-sm leading-relaxed mb-4">{insight.challenge.question}</p>

                        {/* Expandable Reasoning */}
                        <details
                          className="group"
                          open={isOpen}
                          onClick={() => setExpandedAlert(isOpen ? null : insight.id)}
                        >
                          <summary className="list-none cursor-pointer flex items-center gap-2 text-[10px] font-bold text-[#775a00] uppercase tracking-widest hover:underline">
                            <span>View Reasoning</span>
                            <ChevronDown
                              className="w-4 h-4 transition-transform group-open:rotate-180"
                              aria-hidden="true"
                            />
                          </summary>
                          <div className="mt-4 pt-4 border-t border-[#d0c5af]/30 text-xs bg-[#fdf9ef]/50 p-4 rounded-sm space-y-2">
                            <p className="font-bold opacity-60">Evidence:</p>
                            <p className="opacity-80">{insight.challenge.evidence}</p>
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="fixed bottom-0 left-0 w-full z-40 flex justify-around items-center pt-2 pb-safe px-4 bg-[#fdf9ef]/90 backdrop-blur-lg border-t border-[#d0c5af]/20 md:hidden">
        <div className="flex flex-col items-center justify-center bg-[#e6e2d8] text-[#1c1c16] rounded-sm px-4 py-2 transition-all active:scale-95">
          <span className="text-sm font-bold uppercase tracking-widest">Briefing</span>
        </div>
        <div className="flex flex-col items-center justify-center text-[#1c1c16]/50 px-4 py-2 hover:text-[#775a00] transition-all">
          <span className="text-sm font-bold uppercase tracking-widest">Sales</span>
        </div>
        <div className="flex flex-col items-center justify-center text-[#1c1c16]/50 px-4 py-2 hover:text-[#775a00] transition-all">
          <span className="text-sm font-bold uppercase tracking-widest">Inventory</span>
        </div>
        <div className="flex flex-col items-center justify-center text-[#1c1c16]/50 px-4 py-2 hover:text-[#775a00] transition-all">
          <span className="text-sm font-bold uppercase tracking-widest">Reorders</span>
        </div>
      </nav>
    </div>
  );
}
