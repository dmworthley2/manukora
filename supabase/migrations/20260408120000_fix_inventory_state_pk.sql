-- Recreate inventory_state with a proper surrogate PK so sku is a plain FK
-- Drop view first (it depends on inventory_state)
DROP VIEW IF EXISTS public.agent_reasoning_feed;
DROP TABLE IF EXISTS public.inventory_state;

CREATE TABLE public.inventory_state (
  inventory_state_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(255) NOT NULL UNIQUE REFERENCES public.product_catalog(sku) ON DELETE CASCADE,
  stock_on_hand INTEGER NOT NULL,
  units_on_order INTEGER NOT NULL,
  order_arrival_months INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_state_sku_idx ON public.inventory_state (sku);

-- Recreate the semantic reasoning view
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

-- Reload PostgREST schema cache so FK relationships are discoverable
NOTIFY pgrst, 'reload schema';
