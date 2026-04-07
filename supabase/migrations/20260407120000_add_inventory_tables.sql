-- MASTER PRODUCT DATA
CREATE TABLE IF NOT EXISTS public.product_catalog (
  sku VARCHAR(255) PRIMARY KEY,
  product_category VARCHAR(100),         -- e.g., 'Honey', 'Tincture', 'Bioactive Blend'
  product_name VARCHAR(500),             -- Full name from CSV
  mgo_rating INTEGER,                    -- Extracted via regex if applicable
  retail_price_usd DECIMAL(10, 2),
  target_months_cover INTEGER DEFAULT 2,
  product_notes VARCHAR(500),            -- e.g., 'Phased out Q2 2026'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CURRENT INVENTORY STATE (Most Recent Snapshot)
CREATE TABLE IF NOT EXISTS public.inventory_state (
  sku VARCHAR(255) PRIMARY KEY REFERENCES public.product_catalog(sku) ON DELETE CASCADE,
  stock_on_hand INTEGER NOT NULL,
  units_on_order INTEGER NOT NULL,
  order_arrival_months INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HISTORICAL SALES BY CHANNEL & MONTH
CREATE TABLE IF NOT EXISTS public.sales_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(255) NOT NULL REFERENCES public.product_catalog(sku) ON DELETE CASCADE,
  channel VARCHAR(50) NOT NULL,
  month_period INTEGER NOT NULL,
  units_sold INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sku, channel, month_period)
);

-- INDEXES (created before view to ensure data structure is complete)
CREATE INDEX IF NOT EXISTS inventory_state_sku_idx ON public.inventory_state (sku);
CREATE INDEX IF NOT EXISTS sales_history_sku_idx ON public.sales_history (sku);
CREATE INDEX IF NOT EXISTS sales_history_sku_channel_idx ON public.sales_history (sku, channel);
CREATE INDEX IF NOT EXISTS sales_history_period_idx ON public.sales_history (month_period);

-- SEMANTIC REASONING LAYER (created after all tables and indexes)
CREATE OR REPLACE VIEW public.agent_reasoning_feed AS
WITH sales_summary AS (
  SELECT
    sku,
    SUM(units_sold) FILTER (WHERE month_period = 4) as m4_total,
    SUM(units_sold) FILTER (WHERE month_period = 3) as m3_total,
    SUM(units_sold) FILTER (WHERE month_period = 2) as m2_total,
    SUM(units_sold) FILTER (WHERE month_period = 1) as m1_total
  FROM public.sales_history
  GROUP BY sku
)
SELECT
  p.sku,
  p.product_name,
  p.retail_price_usd,
  s.m4_total as current_demand,
  (p.retail_price_usd * s.m4_total) as revenue_opportunity,
  (i.stock_on_hand + i.units_on_order) as total_pipeline,
  ROUND((i.stock_on_hand + i.units_on_order)::numeric / NULLIF(s.m4_total, 0), 2) as months_of_cover,
  CASE
    WHEN s.m4_total < s.m3_total AND s.m3_total < s.m2_total THEN 'DECLINING'
    WHEN s.m4_total > s.m3_total AND s.m3_total > s.m2_total THEN 'GROWING'
    ELSE 'STABLE'
  END as momentum_trend,
  ((i.stock_on_hand + i.units_on_order) < (p.target_months_cover * s.m4_total)) as reorder_required,
  i.stock_on_hand,
  i.units_on_order,
  i.order_arrival_months,
  s.m1_total, s.m2_total, s.m3_total,
  p.target_months_cover
FROM public.product_catalog p
JOIN sales_summary s ON p.sku = s.sku
JOIN public.inventory_state i ON p.sku = i.sku;

-- RLS POLICIES
ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_history ENABLE ROW LEVEL SECURITY;
