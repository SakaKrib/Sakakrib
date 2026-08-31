-- SakaCrib landlord PayPal merchant connection
-- Stores only merchant identifiers/status. Never store PayPal passwords,
-- client secrets, access tokens, or other provider credentials in this table.

CREATE TABLE IF NOT EXISTS public.landlord_paypal_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tracking_id text NOT NULL UNIQUE,
  merchant_id text UNIQUE,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','CONNECTED','ACTION_REQUIRED','REJECTED','DISCONNECTED')),
  payments_receivable boolean NOT NULL DEFAULT false,
  primary_email_confirmed boolean NOT NULL DEFAULT false,
  permissions_granted boolean NOT NULL DEFAULT false,
  consent_status boolean NOT NULL DEFAULT false,
  account_status text,
  primary_email text,
  legal_name text,
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  granted_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_status_payload jsonb,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS landlord_paypal_connections_landlord_uidx
  ON public.landlord_paypal_connections(landlord_user_id);

CREATE INDEX IF NOT EXISTS landlord_paypal_connections_status_idx
  ON public.landlord_paypal_connections(status);

ALTER TABLE public.landlord_paypal_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "landlord_paypal_connections_select_own" ON public.landlord_paypal_connections;
CREATE POLICY "landlord_paypal_connections_select_own"
  ON public.landlord_paypal_connections
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = landlord_user_id);

DROP POLICY IF EXISTS "landlord_paypal_connections_insert_own" ON public.landlord_paypal_connections;
CREATE POLICY "landlord_paypal_connections_insert_own"
  ON public.landlord_paypal_connections
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = landlord_user_id);

DROP POLICY IF EXISTS "landlord_paypal_connections_update_own" ON public.landlord_paypal_connections;
CREATE POLICY "landlord_paypal_connections_update_own"
  ON public.landlord_paypal_connections
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = landlord_user_id)
  WITH CHECK ((select auth.uid()) = landlord_user_id);

DROP POLICY IF EXISTS "landlord_paypal_connections_delete_own" ON public.landlord_paypal_connections;
CREATE POLICY "landlord_paypal_connections_delete_own"
  ON public.landlord_paypal_connections
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = landlord_user_id);

DROP TRIGGER IF EXISTS landlord_paypal_connections_updated_at ON public.landlord_paypal_connections;
CREATE TRIGGER landlord_paypal_connections_updated_at
  BEFORE UPDATE ON public.landlord_paypal_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.landlord_paypal_connections IS
  'PayPal merchant onboarding state for landlord rent collection. Provider secrets/tokens are never stored here.';
