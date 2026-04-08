"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, TrendingUp, AlertCircle, TrendingDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDataSource } from "@/contexts/DataSourceContext";

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

interface MetricsResponse {
  readonly totalRevenue: number;
  readonly avgOrderValue: number;
  readonly totalUnitsSold: number;
  readonly periodMonth: string;
}

// Poll every 5 seconds for up to 2 minutes (24 attempts)
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 24;

function BriefingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-4 bg-[#d0c5af]/40 rounded w-3/4" />
      <div className="h-4 bg-[#d0c5af]/40 rounded w-full" />
      <div className="h-4 bg-[#d0c5af]/40 rounded w-5/6" />
      <div className="h-4 bg-[#d0c5af]/40 rounded w-2/3" />
      <div className="mt-6 p-6 bg-[#f9f5eb] rounded-sm border-l-4 border-[#d0c5af]/40">
        <div className="h-3 bg-[#d0c5af]/40 rounded w-1/3 mb-4" />
        <div className="h-3 bg-[#d0c5af]/40 rounded w-full mb-2" />
        <div className="h-3 bg-[#d0c5af]/40 rounded w-4/5" />
      </div>
    </div>
  );
}

export default function ExecutiveSummaryContent() {
  const searchParams = useSearchParams();
  const { latestReportRunId } = useDataSource();

  // Prefer query param (direct link) over context (post-upload navigation)
  const reportRunId = searchParams.get("reportRunId") ?? latestReportRunId;

  const [activeReportRunId, setActiveReportRunId] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);

  const startPolling = useCallback((runId: string) => {
    setLoading(true);
    setError(null);
    setBriefing(null);
    setPollAttempts(0);

    let attempt = 0;
    let cancelled = false;

    const fetchBriefing = async (): Promise<boolean> => {
      try {
        const response = await fetch(`/api/briefings/${runId}`);
        if (response.status === 404) return false;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as BriefingResponse;
        if (cancelled) return true;
        setBriefing(data);
        setError(null);
        setLoading(false);
        setGenerating(false);
        fetch(`/api/briefings/${runId}/metrics`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => { if (d && !cancelled) setMetrics(d as MetricsResponse); })
          .catch(() => {});
        return true;
      } catch (err) {
        if (cancelled) return false;
        setError(err instanceof Error ? err.message : "Failed to load briefing");
        setLoading(false);
        setGenerating(false);
        return false;
      }
    };

    const poll = async () => {
      const ready = await fetchBriefing();
      if (ready || cancelled) return;

      const interval = setInterval(async () => {
        if (cancelled) { clearInterval(interval); return; }
        attempt++;
        setPollAttempts(attempt);
        if (attempt >= MAX_POLL_ATTEMPTS) {
          clearInterval(interval);
          setError("Analysis is taking longer than expected. Please try again.");
          setLoading(false);
          setGenerating(false);
          return;
        }
        const ready = await fetchBriefing();
        if (ready) clearInterval(interval);
      }, POLL_INTERVAL_MS);

      return () => { cancelled = true; clearInterval(interval); };
    };

    poll();
    return () => { cancelled = true; };
  }, []);

  const handleRetrieve = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/briefings/latest");
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "No briefing found");
        setLoading(false);
        return;
      }
      const data = await res.json() as BriefingResponse;
      setBriefing(data);
      setLoading(false);
      fetch(`/api/briefings/${data.reportRunId}/metrics`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setMetrics(d as MetricsResponse); })
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retrieve briefing");
      setLoading(false);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/briefings/generate", { method: "POST" });
      const data = await res.json() as { reportRunId?: string; error?: string };
      if (!res.ok || !data.reportRunId) {
        setError(data.error ?? "Failed to start analysis");
        setGenerating(false);
        return;
      }
      setActiveReportRunId(data.reportRunId);
      startPolling(data.reportRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start analysis");
      setGenerating(false);
    }
  }, [startPolling]);

  // On mount: if we have a reportRunId from URL or context, try to load existing briefing
  useEffect(() => {
    if (!reportRunId) return;
    startPolling(reportRunId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportRunId]);

  const executiveSummarySection = briefing?.sections.find((s) => s.section_id === "executive-summary");
  const capitalAllocationSection = briefing?.sections.find((s) => s.section_id === "capital-allocation");

  const criticalInsights = briefing?.sections
    .filter((s) => s.auditor_challenges && s.auditor_challenges.length > 0)
    .flatMap((s) =>
      s.auditor_challenges!.map((c) => ({
        id: `${s.section_id}-${c.id}`,
        section: s.section_id,
        challenge: c,
        resolution: s.analyst_response || "Pending analyst response",
      }))
    ) ?? [];

  const approvalSummary = briefing?.briefing_status.approval_summary;
  const totalRevenue = metrics?.totalRevenue ?? 0;
  const avgOrderValue = metrics?.avgOrderValue ?? 0;

  return (
    <div className="bg-[#fdf9ef] min-h-screen pb-16">
      {/* Main Content */}
      <div className="px-6 max-w-7xl mx-auto">
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
                {briefing
                  ? `Synthesis of marketplace performance, supply chain risks, and strategic opportunities for ${briefing.period}.`
                  : loading
                  ? "Analysing your inventory data — this takes about a minute…"
                  : "Upload your inventory CSV, then generate a CFO-level briefing from your data."}
              </p>
            </div>
            <div className="flex gap-3 items-center">
              {!briefing && !loading && (
                <>
                  {error && (
                    <Button
                      onClick={handleRetrieve}
                      variant="outline"
                      className="border-[#775a00] text-[#775a00] hover:bg-[#775a00]/10 px-6 py-2.5 rounded-sm font-bold uppercase tracking-widest text-xs"
                    >
                      Retrieve Analysis
                    </Button>
                  )}
                  <Button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="bg-[#775a00] hover:bg-[#5a4200] text-white px-6 py-2.5 rounded-sm font-bold uppercase tracking-widest text-xs flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate Analysis
                  </Button>
                </>
              )}
              <div className="px-4 py-2 bg-[#f9f5eb] rounded-full flex items-center gap-2 border border-[#d0c5af]/30">
                <span className={`w-1.5 h-1.5 rounded-full ${loading ? "bg-[#775a00] animate-pulse" : "bg-[#3f6653]"}`} />
                <span className="text-xs font-bold text-[#4d4635] uppercase tracking-widest">
                  {loading ? `Generating${pollAttempts > 0 ? ` (${pollAttempts})` : ""}` : "AI Engine Live"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Error state */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-sm text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Main Content Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          {/* Executive Summary */}
          <div className="lg:col-span-2">
            <div className="bg-white/40 p-8 md:p-12 rounded-sm border border-[#d0c5af]/30 backdrop-blur-sm">
              <h2 className="font-serif text-3xl font-bold mb-8 text-[#1c1c16]">Executive Summary</h2>

              {loading ? (
                <BriefingSkeleton />
              ) : executiveSummarySection ? (
                <div className="space-y-6">
                  <div className="text-[#4d4635] leading-relaxed text-base">
                    {executiveSummarySection.analyst_draft.split("\n").map((paragraph, idx) => (
                      <p key={idx} className="mb-4">{paragraph}</p>
                    ))}
                  </div>

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
                <div className="flex flex-col items-start gap-6 py-8">
                  <p className="text-[#4d4635] text-base leading-relaxed max-w-md">
                    No briefing has been generated yet. Upload your inventory CSV and click{" "}
                    <strong>Generate Analysis</strong> to get your CFO-level briefing.
                  </p>
                  <Button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="bg-[#775a00] hover:bg-[#5a4200] text-white px-6 py-2.5 rounded-sm font-bold uppercase tracking-widest text-xs flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate Analysis
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* KPIs */}
          <div className="space-y-6">
            <div className="bg-[#775a00] text-white p-8 rounded-sm">
              <span className="text-xs font-bold uppercase tracking-[0.2em] block mb-4 opacity-80">
                Total Revenue (MTD)
              </span>
              {loading ? (
                <div className="h-12 bg-white/20 rounded animate-pulse mb-3" />
              ) : (
                <h3 className="font-serif text-5xl font-bold tracking-tight mb-3">
                  {totalRevenue >= 1000000
                    ? `$${(totalRevenue / 1000000).toFixed(2)}M`
                    : `$${(totalRevenue / 1000).toFixed(1)}K`}
                </h3>
              )}
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                <TrendingUp className="w-4 h-4" /> {metrics ? "From Sales Data" : "Calculating..."}
              </div>
            </div>

            <div className="bg-[#e6e2d8] p-8 rounded-sm">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[#4d4635] text-xs font-bold uppercase tracking-[0.2em]">Avg. Revenue/SKU</span>
                <span className="text-[9px] font-bold bg-[#3f6653]/10 text-[#3f6653] px-2 py-0.5 rounded-sm uppercase">
                  {metrics ? "Calculated" : "Loading"}
                </span>
              </div>
              {loading ? (
                <div className="h-10 bg-[#d0c5af]/40 rounded animate-pulse" />
              ) : (
                <h3 className="font-serif text-4xl font-bold tracking-tight text-[#1c1c16]">
                  ${avgOrderValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </h3>
              )}
            </div>

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

        {/* Critical Insights */}
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

            <div className="lg:col-span-2 space-y-6">
              {criticalInsights.slice(0, 3).map((insight) => {
                const isOpen = expandedAlert === insight.id;
                const isError = insight.challenge.severity === "error";

                return (
                  <div
                    key={insight.id}
                    className={`${isError ? "bg-[#ba1a1a]/5" : "bg-[#f9f5eb]"} p-6 rounded-sm border border-[#d0c5af]/30`}
                  >
                    <div className="flex items-start gap-6">
                      <div className={`w-12 h-12 rounded-sm ${isError ? "bg-[#ba1a1a]/10" : "bg-[#775a00]/10"} flex items-center justify-center shrink-0`}>
                        {isError
                          ? <AlertCircle className={`w-6 h-6 ${isError ? "text-[#ba1a1a]" : "text-[#775a00]"}`} />
                          : <TrendingDown className="w-6 h-6 text-[#775a00]" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                          <h3 className="font-bold text-base uppercase tracking-tight text-[#1c1c16]">
                            {insight.challenge.claim}
                          </h3>
                          <span className={`${isError ? "bg-[#ba1a1a]/10 text-[#ba1a1a]" : "bg-[#e6e2d8] text-[#4d4635]"} px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.1em]`}>
                            {isError ? "Action Needed" : "Review Required"}
                          </span>
                        </div>
                        <p className="text-[#4d4635] text-sm leading-relaxed mb-4">{insight.challenge.question}</p>

                        <details
                          className="group"
                          open={isOpen}
                          onClick={() => setExpandedAlert(isOpen ? null : insight.id)}
                        >
                          <summary className="list-none cursor-pointer flex items-center gap-2 text-[10px] font-bold text-[#775a00] uppercase tracking-widest hover:underline">
                            <span>View Reasoning</span>
                            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" aria-hidden="true" />
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
      </div>
    </div>
  );
}
