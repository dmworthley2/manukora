-- Add upload_id column to product_catalog
ALTER TABLE product_catalog
ADD COLUMN upload_id UUID NOT NULL DEFAULT gen_random_uuid();

-- Add upload_id column to inventory_state
ALTER TABLE inventory_state
ADD COLUMN upload_id UUID NOT NULL DEFAULT gen_random_uuid();

-- Add upload_id column to sales_history
ALTER TABLE sales_history
ADD COLUMN upload_id UUID NOT NULL DEFAULT gen_random_uuid();

-- Drop old single-key constraints and create composite keys
-- product_catalog: composite key on (sku, upload_id)
ALTER TABLE product_catalog
DROP CONSTRAINT IF EXISTS product_catalog_pkey;
ALTER TABLE product_catalog
ADD PRIMARY KEY (sku, upload_id);

-- inventory_state: composite key on (sku, upload_id)
ALTER TABLE inventory_state
DROP CONSTRAINT IF EXISTS inventory_state_pkey;
ALTER TABLE inventory_state
ADD PRIMARY KEY (sku, upload_id);

-- sales_history: composite key on (sku, channel, month_period, upload_id)
ALTER TABLE sales_history
DROP CONSTRAINT IF EXISTS sales_history_pkey;
ALTER TABLE sales_history
ADD PRIMARY KEY (sku, channel, month_period, upload_id);

-- Create indexes for faster lookups by upload_id
CREATE INDEX idx_product_catalog_upload_id ON product_catalog(upload_id);
CREATE INDEX idx_inventory_state_upload_id ON inventory_state(upload_id);
CREATE INDEX idx_sales_history_upload_id ON sales_history(upload_id);
