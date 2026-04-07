"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock, AlertTriangle } from "lucide-react";

interface AuditorChallenge {
  readonly id: string;
  readonly type: "numerical" | "hallucination" | "assumption" | "tradeoff" | "policy";
  readonly claim: string;
  readonly question: string;
  readonly evidence: string;
  readonly severity: "error" | "assumption" | "concern";
  readonly requestedAction: string;
}

interface BriefingSection {
  readonly section_id: string;
  readonly title: string;
  readonly status: string;
  readonly analyst_draft: string;
  readonly analyst_reasoning?: string;
  readonly analyst_submitted_at?: string;
  readonly auditor_status?: "approved" | "challenged" | "escalated";
  readonly auditor_challenges?: readonly AuditorChallenge[];
  readonly auditor_notes?: string;
  readonly auditor_reviewed_at?: string;
  readonly analyst_response?: string;
  readonly analyst_position?: string;
  readonly is_approved?: boolean;
  readonly escalation_reason?: string;
  readonly resolution_type?: string;
}

interface BriefingResponse {
  readonly reportRunId: string;
  readonly period: string;
  readonly created_at: string;
  readonly briefing_status: {
    overall_status: string;
    is_final: boolean;
    approval_summary?: {
      total: number;
      approved: number;
      escalated: number;
      pending: number;
    };
  };
  readonly sections: readonly BriefingSection[];
  readonly conflicts?: readonly {
    section_id: string;
    escalation_reason: string;
  }[];
  readonly ceo_decision?: {
    unresolved_conflicts: readonly {
      section_id: string;
      escalation_reason: string;
    }[];
  } | null;
}

function getSectionStatusIcon(section: BriefingSection) {
  if (section.is_approved) {
    return <CheckCircle className="w-5 h-5 text-green-600" />;
  }
  if (section.auditor_status === "escalated") {
    return <AlertTriangle className="w-5 h-5 text-orange-600" />;
  }
  if (section.auditor_status === "challenged") {
    return <AlertCircle className="w-5 h-5 text-yellow-600" />;
  }
  if (section.auditor_status === "approved") {
    return <CheckCircle className="w-5 h-5 text-green-600" />;
  }
  return <Clock className="w-5 h-5 text-gray-400" />;
}

function ChallengeCard({ challenge }: { challenge: AuditorChallenge }) {
  return (
    <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4 rounded space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-yellow-900">
          {challenge.id} ({challenge.type})
        </span>
        <Badge variant="outline" className="text-xs">
          {challenge.severity}
        </Badge>
      </div>
      <div className="space-y-1 text-sm">
        <p className="text-yellow-800">
          <span className="font-semibold">Claim:</span> {challenge.claim}
        </p>
        <p className="text-yellow-800">
          <span className="font-semibold">Question:</span> {challenge.question}
        </p>
        <p className="text-yellow-800">
          <span className="font-semibold">Evidence:</span> {challenge.evidence}
        </p>
        <p className="text-yellow-800">
          <span className="font-semibold">Requested Action:</span> {challenge.requestedAction}
        </p>
      </div>
    </div>
  );
}

export default function ExecutiveSummaryContent() {
  const searchParams = useSearchParams();
  const reportRunId = searchParams.get("reportRunId");

  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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

  if (!reportRunId) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Executive Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">Report ID is required</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Executive Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">Loading briefing...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !briefing) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Executive Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{error || "Briefing not found"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const approvalSummary = briefing.briefing_status.approval_summary;
  const hasEscalations = briefing.briefing_status.overall_status === "escalated-to-ceo";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Executive Summary</h1>
        <p className="text-gray-600">
          Period: {briefing.period} | Status: {briefing.briefing_status.overall_status}
        </p>
      </div>

      {/* Approval Summary */}
      {approvalSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Briefing Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {approvalSummary.approved}
                </p>
                <p className="text-sm text-gray-600">Approved</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">
                  {approvalSummary.escalated}
                </p>
                <p className="text-sm text-gray-600">Escalated</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">
                  {approvalSummary.pending}
                </p>
                <p className="text-sm text-gray-600">Pending</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-600">
                  {approvalSummary.total}
                </p>
                <p className="text-sm text-gray-600">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Escalation Alert */}
      {hasEscalations && briefing.ceo_decision && (
        <Card className="border-2 border-orange-500 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-orange-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              CEO Decision Required
            </CardTitle>
            <CardDescription className="text-orange-800">
              {briefing.ceo_decision.unresolved_conflicts.length} section(s) escalated
              for CEO review
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {briefing.ceo_decision.unresolved_conflicts.map((conflict) => (
                <div key={conflict.section_id} className="text-sm text-orange-900">
                  <p className="font-semibold">{conflict.section_id}</p>
                  <p className="text-orange-800">{conflict.escalation_reason}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sections */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Analysis Sections</h2>
        {briefing.sections.map((section) => (
          <Card key={section.section_id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getSectionStatusIcon(section)}
                  <div>
                    <CardTitle className="text-lg">{section.title}</CardTitle>
                    <CardDescription>{section.section_id}</CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  {section.is_approved && (
                    <Badge className="bg-green-600">Approved</Badge>
                  )}
                  {section.auditor_status === "escalated" && (
                    <Badge className="bg-orange-600">Escalated</Badge>
                  )}
                  {section.auditor_status === "challenged" && (
                    <Badge className="bg-yellow-600">Challenged</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Analyst Draft */}
              <div>
                <h3 className="font-semibold text-sm text-gray-700 mb-2">
                  Analyst Perspective
                </h3>
                <div className="bg-slate-50 p-4 rounded border-l-4 border-blue-500">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {section.analyst_draft}
                  </p>
                </div>
              </div>

              {/* Analyst Reasoning */}
              {section.analyst_reasoning && (
                <div>
                  <h3 className="font-semibold text-sm text-gray-700 mb-2">
                    Analyst Reasoning
                  </h3>
                  <div className="bg-blue-50 p-4 rounded border-l-4 border-blue-400">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {section.analyst_reasoning}
                    </p>
                  </div>
                </div>
              )}

              {/* Auditor Challenges */}
              {section.auditor_challenges && section.auditor_challenges.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm text-gray-700 mb-2">
                    Auditor Challenges
                  </h3>
                  <div className="space-y-2">
                    {section.auditor_challenges.map((challenge) => (
                      <ChallengeCard key={challenge.id} challenge={challenge} />
                    ))}
                  </div>
                </div>
              )}

              {section.auditor_notes && (
                <div>
                  <h3 className="font-semibold text-sm text-gray-700 mb-2">
                    Auditor Notes
                  </h3>
                  <div className="bg-yellow-50 p-4 rounded border-l-4 border-yellow-400">
                    <p className="text-sm text-gray-700">{section.auditor_notes}</p>
                  </div>
                </div>
              )}

              {/* Analyst Response */}
              {section.analyst_response && (
                <div>
                  <h3 className="font-semibold text-sm text-gray-700 mb-2">
                    Analyst Response
                  </h3>
                  <div className="bg-green-50 p-4 rounded border-l-4 border-green-400">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {section.analyst_response}
                    </p>
                  </div>
                </div>
              )}

              {/* Analyst Position (if escalated) */}
              {section.analyst_position && section.auditor_status === "escalated" && (
                <div>
                  <h3 className="font-semibold text-sm text-gray-700 mb-2">
                    Analyst Position (for CEO)
                  </h3>
                  <div className="bg-blue-50 p-4 rounded border-l-4 border-blue-500">
                    <p className="text-sm text-gray-700">{section.analyst_position}</p>
                  </div>
                </div>
              )}

              {/* Escalation Reason */}
              {section.escalation_reason && (
                <div>
                  <h3 className="font-semibold text-sm text-gray-700 mb-2">
                    Escalation Reason
                  </h3>
                  <div className="bg-orange-50 p-4 rounded border-l-4 border-orange-500">
                    <p className="text-sm text-gray-700">{section.escalation_reason}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
