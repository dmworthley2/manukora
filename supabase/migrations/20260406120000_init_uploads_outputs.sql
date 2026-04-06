-- Buckets for CSV inputs and generated briefing artifacts (private).
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('outputs', 'outputs', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  bucket TEXT NOT NULL DEFAULT 'uploads',
  original_filename TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  content_type TEXT NOT NULL,
  content_sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket, storage_path)
);

CREATE TABLE IF NOT EXISTS public.report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID REFERENCES public.uploads (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  period TEXT NOT NULL,
  fact_bundle_path TEXT,
  briefing_md_path TEXT,
  briefing_pdf_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_runs_upload_id_idx ON public.report_runs (upload_id);
CREATE INDEX IF NOT EXISTS report_runs_period_idx ON public.report_runs (period);
CREATE INDEX IF NOT EXISTS report_runs_created_at_idx ON public.report_runs (created_at DESC);

CREATE OR REPLACE FUNCTION public.set_report_runs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS report_runs_set_updated_at ON public.report_runs;
CREATE TRIGGER report_runs_set_updated_at
  BEFORE UPDATE ON public.report_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_report_runs_updated_at();

ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

-- No policies yet: only service_role (backend) or dashboard access. Add authenticated policies when Auth ships.
