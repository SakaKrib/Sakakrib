-- Auto-approve new listings so they're visible to renters immediately
ALTER TABLE listings ALTER COLUMN approval_status SET DEFAULT 'approved';

-- Approve the existing pending listing
UPDATE listings SET approval_status = 'approved', is_published = true
WHERE approval_status = 'pending_review';