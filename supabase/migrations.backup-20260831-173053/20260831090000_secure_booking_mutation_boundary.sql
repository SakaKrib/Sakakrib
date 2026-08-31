-- Secure the canonical moving-booking mutation boundary.
--
-- The browser may read bookings that RLS authorizes, but it must not mutate
-- booking state directly. All booking state changes must go through the
-- existing SECURITY DEFINER RPCs, which validate auth.uid(), role, ownership,
-- lifecycle state, schedule conflicts, and other business rules.
--
-- Existing mutation RPCs intentionally remain unchanged:
--   request_mover_booking
--   respond_to_mover_booking
--   propose_moving_schedule
--   confirm_moving_schedule
--
-- This migration does not create a new booking system or change the booking
-- state machine. It closes the direct PostgREST table-write path.

revoke all on table public.bookings from anon, authenticated;

grant select on table public.bookings to authenticated;

-- Explicitly document the intended mutation boundary.
-- SECURITY DEFINER RPCs execute with their owner's table privileges and remain
-- the supported path for booking creation and state transitions.
-- No INSERT/UPDATE/DELETE privilege is granted to the browser role.

revoke insert, update, delete on table public.bookings from anon, authenticated;
