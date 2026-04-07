-- Briefing blackboard: Section-level state management with conflict tracking
-- Analyst and Auditor work independently on each section
-- CEO sees approval status + explicit conflicts for disputed sections

CREATE TABLE IF NOT EXISTS public.briefing_blackboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id UUID NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,

  -- Current state
  iteration INTEGER NOT NULL,
  overall_status VARCHAR(50) NOT NULL DEFAULT 'in-progress',
  -- 'in-progress' → analyst drafting
  -- 'under-review' → auditor reviewing
  -- 'responding' → analyst responding to challenges
  -- 'ready-for-approval' → all sections approved or escalated
  -- 'approved' → all sections approved, no escalations
  -- 'escalated-to-ceo' → has unresolved conflicts

  -- Section states (JSON structure for flexibility)
  sections JSONB NOT NULL DEFAULT '{}',
  -- Structure: {
  --   "executive-summary": {
  --     "title": "Executive Summary",
  --     "analyst_draft": "...",
  --     "analyst_reasoning": "...",
  --     "analyst_submitted_at": "2026-04-07T...",
  --     "auditor_status": "approved" | "challenged" | "escalated" | "pending",
  --     "auditor_challenges": [ { id: "ch-1", type: "...", claim: "...", question: "..." } ],
  --     "auditor_notes": "...",
  --     "auditor_reviewed_at": "2026-04-07T...",
  --     "analyst_response": "...",
  --     "analyst_responded_at": "2026-04-07T...",
  --     "resolution_type": "accepted" | "clarified" | "escalated",
  --     "is_approved": false | true
  --   },
  --   ...
  -- }

  -- Conflict tracking
  conflicts JSONB NOT NULL DEFAULT '[]',
  -- Array of {
  --   "section_id": "capital-allocation",
  --   "challenge_id": "ch-3",
  --   "type": "policy" | "assumption" | "tradeoff",
  --   "analyst_position": "...",
  --   "auditor_position": "...",
  --   "severity": "warning" | "blocking",
  --   "escalation_reason": "Analyst and auditor cannot agree. CEO decision needed."
  -- }

  -- Summary counts
  approval_summary JSONB NOT NULL DEFAULT '{"total": 0, "approved": 0, "escalated": 0, "pending": 0}',

  -- Timeline
  analyst_submitted_at TIMESTAMPTZ,
  auditor_started_review_at TIMESTAMPTZ,
  auditor_completed_review_at TIMESTAMPTZ,
  analyst_started_response_at TIMESTAMPTZ,
  analyst_completed_response_at TIMESTAMPTZ,

  -- Final decision
  is_final BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS briefing_blackboard_report_run_idx ON public.briefing_blackboard(report_run_id);
CREATE INDEX IF NOT EXISTS briefing_blackboard_overall_status_idx ON public.briefing_blackboard(overall_status);
CREATE INDEX IF NOT EXISTS briefing_blackboard_is_final_idx ON public.briefing_blackboard(is_final);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_briefing_blackboard_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS briefing_blackboard_set_updated_at ON public.briefing_blackboard;
CREATE TRIGGER briefing_blackboard_set_updated_at
  BEFORE UPDATE ON public.briefing_blackboard
  FOR EACH ROW
  EXECUTE FUNCTION public.set_briefing_blackboard_updated_at();

-- RLS: Service role only for now
ALTER TABLE public.briefing_blackboard ENABLE ROW LEVEL SECURITY;

-- Briefing sections (denormalized from blackboard for efficient querying)
-- Used for UX to fetch individual sections without parsing the JSONB
CREATE TABLE IF NOT EXISTS public.briefing_section (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blackboard_id UUID NOT NULL REFERENCES public.briefing_blackboard(id) ON DELETE CASCADE,

  section_id VARCHAR(100) NOT NULL,    -- "executive-summary", "capital-allocation", etc.
  title VARCHAR(255),

  -- Analyst view
  analyst_draft TEXT,
  analyst_reasoning TEXT,
  analyst_submitted_at TIMESTAMPTZ,

  -- Auditor view
  auditor_status VARCHAR(50),           -- "pending" | "approved" | "challenged" | "escalated"
  auditor_challenges JSONB,             -- Array of challenge objects
  auditor_notes TEXT,
  auditor_reviewed_at TIMESTAMPTZ,

  -- Analyst response to challenges
  analyst_response TEXT,
  analyst_responded_at TIMESTAMPTZ,

  -- Resolution
  resolution_type VARCHAR(50),          -- "accepted" | "clarified" | "escalated"
  is_approved BOOLEAN DEFAULT false,

  -- If escalated
  escalation_reason TEXT,
  analyst_position TEXT,                -- Analyst's final stance
  auditor_position TEXT,                -- Auditor's final stance

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(blackboard_id, section_id)
);

CREATE INDEX IF NOT EXISTS briefing_section_blackboard_idx ON public.briefing_section(blackboard_id);
CREATE INDEX IF NOT EXISTS briefing_section_status_idx ON public.briefing_section(auditor_status);

CREATE OR REPLACE FUNCTION public.set_briefing_section_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS briefing_section_set_updated_at ON public.briefing_section;
CREATE TRIGGER briefing_section_set_updated_at
  BEFORE UPDATE ON public.briefing_section
  FOR EACH ROW
  EXECUTE FUNCTION public.set_briefing_section_updated_at();

ALTER TABLE public.briefing_section ENABLE ROW LEVEL SECURITY;
