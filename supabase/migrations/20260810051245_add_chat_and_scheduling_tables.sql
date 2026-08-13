/*
# Add Chat Messages, Booking Events, and Mover Schedule Fields

1. New Tables
- `chat_messages`: Stores real-time messages between renters and movers.
  - id (uuid PK), conversation_id (text), sender_id (uuid FK), receiver_id (uuid FK),
    content (text), message_type (text: text/event_request/event_confirmed/event_declined),
    event_data (jsonb), created_at (timestamptz)
- `booking_events`: Stores booking event requests created from chat scheduling.
  - id (uuid PK), conversation_id (text), renter_id (uuid FK), mover_id (uuid FK),
    mover_profile_id (uuid), relocation_date (date), day_of_week (text),
    pickup_time (time), pickup_address (text), dropoff_address (text),
    negotiated_price (numeric), commission_amount (numeric), total_amount (numeric),
    status (text: pending/confirmed/declined/paid/completed/cancelled),
    payment_method (text), created_at, confirmed_at, paid_at

2. Modified Tables
- `movers`: Added columns for scheduling
  - business_name (text, default '')
  - working_days (text[], default all 7 days)
  - start_time (time, default '08:00')
  - end_time (time, default '18:00')

3. Security
- RLS enabled on both new tables.
- chat_messages: authenticated users can read/send messages where they are sender or receiver.
- booking_events: authenticated users can read/create/update events where they are renter or mover.
- All policies use auth.uid() ownership checks.
*/

-- Add schedule columns to movers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movers' AND column_name = 'business_name') THEN
    ALTER TABLE movers ADD COLUMN business_name text DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movers' AND column_name = 'working_days') THEN
    ALTER TABLE movers ADD COLUMN working_days text[] DEFAULT ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movers' AND column_name = 'start_time') THEN
    ALTER TABLE movers ADD COLUMN start_time time DEFAULT '08:00';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movers' AND column_name = 'end_time') THEN
    ALTER TABLE movers ADD COLUMN end_time time DEFAULT '18:00';
  END IF;
END $$;

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'text',
  event_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_chat_messages" ON chat_messages;
CREATE POLICY "select_own_chat_messages"
ON chat_messages FOR SELECT
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "insert_own_chat_messages" ON chat_messages;
CREATE POLICY "insert_own_chat_messages"
ON chat_messages FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "update_own_chat_messages" ON chat_messages;
CREATE POLICY "update_own_chat_messages"
ON chat_messages FOR UPDATE
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = receiver_id)
WITH CHECK (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Create booking_events table
CREATE TABLE IF NOT EXISTS booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  renter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mover_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mover_profile_id uuid,
  relocation_date date NOT NULL,
  day_of_week text NOT NULL,
  pickup_time time NOT NULL,
  pickup_address text NOT NULL,
  dropoff_address text NOT NULL,
  negotiated_price numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  payment_method text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_booking_events_conversation ON booking_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_booking_events_renter ON booking_events(renter_id);
CREATE INDEX IF NOT EXISTS idx_booking_events_mover ON booking_events(mover_id);

ALTER TABLE booking_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_booking_events" ON booking_events;
CREATE POLICY "select_own_booking_events"
ON booking_events FOR SELECT
TO authenticated
USING (auth.uid() = renter_id OR auth.uid() = mover_id);

DROP POLICY IF EXISTS "insert_own_booking_events" ON booking_events;
CREATE POLICY "insert_own_booking_events"
ON booking_events FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = renter_id);

DROP POLICY IF EXISTS "update_own_booking_events" ON booking_events;
CREATE POLICY "update_own_booking_events"
ON booking_events FOR UPDATE
TO authenticated
USING (auth.uid() = renter_id OR auth.uid() = mover_id)
WITH CHECK (auth.uid() = renter_id OR auth.uid() = mover_id);
