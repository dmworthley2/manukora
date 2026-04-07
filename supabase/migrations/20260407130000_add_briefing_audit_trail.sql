-- Audit trail for briefing generation: captures analyst proposals, auditor challenges, and resolution
CREATE TABLE IF NOT EXISTS public.briefing_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id UUID NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,

  -- Metadata
  iteration INTEGER NOT NULL,
  analyst_archetype VARCHAR(50) NOT NULL DEFAULT 'senior-analyst',
  auditor_archetype VARCHAR(50) NOT NULL DEFAULT 'senior-auditor',

  -- Analyst proposal
  analyst_proposal JSONB,         -- Full briefing draft or response
  analyst_reasoning TEXT,         -- Explanation of key choices
  analyst_submitted_at TIMESTAMPTZ DEFAULT now(),

  -- Auditor review
  auditor_challenges JSONB,       -- Array of { id, type, claim, question, severity, requestedAction }
  auditor_notes TEXT,             -- High-level summary of concerns
  auditor_reviewed_at TIMESTAMPTZ,

  -- Resolution
  analyst_response TEXT,          -- Analyst's response to challenges (addresses each challenge-id)
  resolution_type VARCHAR(50),    -- 'accepted' | 'clarified' | 'escalated' | 'pending'
  resolved_at TIMESTAMPTZ,

  -- Final approval
  auditor_approved BOOLEAN,
  escalation_reason TEXT,         -- If unresolved: explain the disagreement

  -- For CEO visibility
  is_final BOOLEAN DEFAULT false, -- Only set to true for approved briefing or escalation

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS briefing_audit_report_run_idx ON public.briefing_audit_trail(report_run_id);
CREATE INDEX IF NOT EXISTS briefing_audit_iteration_idx ON public.briefing_audit_trail(report_run_id, iteration);
CREATE INDEX IF NOT EXISTS briefing_audit_is_final_idx ON public.briefing_audit_trail(is_final);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_briefing_audit_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS briefing_audit_set_updated_at ON public.briefing_audit_trail;
CREATE TRIGGER briefing_audit_set_updated_at
  BEFORE UPDATE ON public.briefing_audit_trail
  FOR EACH ROW
  EXECUTE FUNCTION public.set_briefing_audit_updated_at();

-- RLS: Service role only for now
ALTER TABLE public.briefing_audit_trail ENABLE ROW LEVEL SECURITY;
