-- ================================================================
-- Add DocuSeal Submission ID Column
-- Author: Mickey (DocuSeal integration spec)
-- Date: 2026-03-04
-- ================================================================
--
-- Purpose: Store the DocuSeal submission ID so webhooks can be matched
-- back to the correct order for automatic status updates.
--
-- Changes:
--   1. Add `docuseal_submission_id text` column to orders (nullable)
--   2. Index for efficient webhook lookups
--
-- Context: When /api/estimate-send is called, it will POST to DocuSeal,
-- receive a submission_id in return, and store it here. When DocuSeal
-- posts a webhook to /api/estimate-webhook on completion, we can
-- look up the order by docuseal_submission_id and auto-update
-- status to 'Signed' with the signed date from the webhook.
--
-- ================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS docuseal_submission_id text DEFAULT NULL UNIQUE;

-- Index for efficient webhook lookups
CREATE INDEX IF NOT EXISTS idx_orders_docuseal_submission_id 
ON orders(docuseal_submission_id);

SELECT 'DocuSeal submission ID migration complete ✓' AS result;
