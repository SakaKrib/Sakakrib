-- Keep mover booking messages in the same canonical renter/mover
-- conversation used by ChatPage and booking_events.
-- This migration is intentionally committed to the repository so it can
-- be applied to the local Supabase database with the normal migration flow.

-- Ensure mover schedule events exists before functions reference it.
CREATE TABLE IF NOT EXISTS public.mover_schedule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mover_id uuid NOT NULL REFERENCES public.movers(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'CONFIRMED',
  title text NOT NULL DEFAULT 'Moving service',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mover_schedule_events_booking_id_key UNIQUE (booking_id),
  CONSTRAINT mover_schedule_events_check CHECK (ends_at > starts_at),
  CONSTRAINT mover_schedule_events_status_check
    CHECK (status IN ('TENTATIVE', 'CONFIRMED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_mover_schedule_events_mover_id
  ON public.mover_schedule_events(mover_id);

CREATE INDEX IF NOT EXISTS idx_mover_schedule_events_booking_id
  ON public.mover_schedule_events(booking_id);

create or replace function public.request_mover_booking(
  p_mover_id uuid,
  p_pickup_address text,
  p_dropoff_address text,
  p_pickup_latitude double precision,
  p_pickup_longitude double precision,
  p_dropoff_latitude double precision,
  p_dropoff_longitude double precision,
  p_distance_km numeric,
  p_listing_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_mover public.movers%rowtype;
  v_profile public.profiles%rowtype;
  v_quote jsonb;
  v_booking_id uuid;
  v_total numeric;
  v_fee numeric;
  v_net numeric;
  v_conversation_id text;
  v_deadline timestamptz;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then raise exception 'Profile not found'; end if;
  if v_profile.role <> 'renter' then raise exception 'Only renters can request a mover'; end if;

  if p_pickup_address is null or btrim(p_pickup_address) = '' then raise exception 'Pickup address is required'; end if;
  if p_dropoff_address is null or btrim(p_dropoff_address) = '' then raise exception 'Dropoff address is required'; end if;
  if p_distance_km is null or p_distance_km < 0 then raise exception 'Invalid distance'; end if;
  if p_pickup_latitude is null or p_dropoff_latitude is null or p_pickup_latitude not between -90 and 90 or p_dropoff_latitude not between -90 and 90 then raise exception 'Invalid latitude'; end if;
  if p_pickup_longitude is null or p_dropoff_longitude is null or p_pickup_longitude not between -180 and 180 or p_dropoff_longitude not between -180 and 180 then raise exception 'Invalid longitude'; end if;

  select * into v_mover
  from public.movers
  where id = p_mover_id
    and is_available = true
    and approval_status = 'approved';
  if not found then raise exception 'Mover is not currently available'; end if;

  select * into v_profile from public.profiles where id = v_mover.user_id;
  if not found or v_profile.verification_status <> 'verified' or v_profile.mover_application_status <> 'approved' then
    raise exception 'Mover is not verified and approved';
  end if;

  v_quote := public.calculate_mover_quote(p_mover_id, p_distance_km);
  v_total := (v_quote->>'renter_total_kes')::numeric;
  v_fee := (v_quote->>'platform_fee_kes')::numeric;
  v_net := (v_quote->>'mover_net_kes')::numeric;
  v_deadline := now() + interval '30 minutes';

  insert into public.bookings (
    renter_id, mover_id, listing_id,
    pickup_address, dropoff_address,
    moving_date, booking_amount, commission_amount, total_amount,
    status, payment_status, payment_method,
    distance_km, rate_per_km_kes, base_rate_kes,
    pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude,
    requested_at, request_expires_at
  ) values (
    v_uid, p_mover_id, p_listing_id,
    p_pickup_address, p_dropoff_address,
    current_date, v_total, v_fee, v_total,
    'pending', 'unpaid', null,
    p_distance_km, (v_quote->>'rate_per_km_kes')::numeric, (v_quote->>'base_rate_kes')::numeric,
    p_pickup_latitude, p_pickup_longitude, p_dropoff_latitude, p_dropoff_longitude,
    now(), v_deadline
  ) returning id into v_booking_id;

  v_conversation_id := least(v_uid, v_mover.user_id)::text || '__' || greatest(v_uid, v_mover.user_id)::text;

  insert into public.chat_messages (
    conversation_id, sender_id, receiver_id, content, message_type, event_data
  ) values (
    v_conversation_id, v_uid, v_mover.user_id,
    'Moving request received. Please respond within 30 minutes. Pickup: ' || p_pickup_address || '. Destination: ' || p_dropoff_address || '. Distance: ' || round(p_distance_km,2) || ' km. Estimated total: KES ' || to_char(v_total, 'FM999,999,990.00'),
    'booking_request',
    jsonb_build_object(
      'booking_id', v_booking_id,
      'distance_km', p_distance_km,
      'rate_per_km_kes', v_quote->>'rate_per_km_kes',
      'renter_total_kes', v_total,
      'platform_fee_kes', v_fee,
      'mover_net_kes', v_net,
      'pickup_latitude', p_pickup_latitude,
      'pickup_longitude', p_pickup_longitude,
      'dropoff_latitude', p_dropoff_latitude,
      'dropoff_longitude', p_dropoff_longitude,
      'request_expires_at', v_deadline
    )
  );

  insert into public.user_notifications(user_id, notification_type, title, message, data)
  values (
    v_mover.user_id,
    'MOVER_REQUEST',
    'New moving request',
    'A renter has requested your moving service. You have 30 minutes to respond.',
    jsonb_build_object('booking_id', v_booking_id, 'expires_at', v_deadline)
  );

  insert into public.notification_emails(recipient, subject, html_body, template_type, status)
  values (
    v_profile.email,
    'New Saka Krib moving request',
    '<p>You have received a new moving request on Saka Krib.</p><p>Please open the app to review and respond within 30 minutes.</p>',
    'MOVER_REQUEST',
    'pending'
  );

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'conversation_id', v_conversation_id,
    'status', 'pending',
    'request_expires_at', v_deadline,
    'quote', v_quote
  );
end;
$function$;

create or replace function public.respond_to_mover_booking(
  p_booking_id uuid,
  p_decision text,
  p_reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings%rowtype;
  v_m public.movers%rowtype;
  v_r public.profiles%rowtype;
  v_conversation text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('confirm','not_sure','cancel') then raise exception 'Invalid decision'; end if;

  select b.* into v_b
  from public.bookings b
  join public.movers m on m.id = b.mover_id
  where b.id = p_booking_id and m.user_id = v_uid
  for update;

  if not found then raise exception 'Booking not found or unauthorized'; end if;
  if v_b.status <> 'pending' then raise exception 'Booking is no longer awaiting mover response'; end if;

  if coalesce(v_b.request_expires_at, v_b.requested_at + interval '30 minutes') < now() then
    update public.bookings
    set status='cancelled', cancelled_at=now(), cancellation_reason='MOVER_TAKING_TOO_LONG', updated_at=now()
    where id=p_booking_id;
    raise exception 'The 30-minute response window has expired';
  end if;

  select * into v_m from public.movers where id=v_b.mover_id;
  select * into v_r from public.profiles where id=v_b.renter_id;
  v_conversation := least(v_r.id, v_m.user_id)::text || '__' || greatest(v_r.id, v_m.user_id)::text;

  if p_decision = 'confirm' then
    update public.bookings
    set status='confirmed', confirmed_at=now(), updated_at=now()
    where id=p_booking_id;

    insert into public.chat_messages(
      conversation_id,sender_id,receiver_id,content,message_type,event_data
    ) values(
      v_conversation,v_uid,v_r.id,
      'The mover has accepted your request. Please select a moving date and time.',
      'booking_response',
      jsonb_build_object('booking_id',p_booking_id,'decision','confirm')
    );

    insert into public.user_notifications(user_id,notification_type,title,message,data)
    values(
      v_r.id,
      'MOVER_CONFIRMED',
      'Mover confirmed your request',
      'Your selected mover accepted the request. Choose a date and time in chat.',
      jsonb_build_object('booking_id',p_booking_id)
    );

  elsif p_decision = 'not_sure' then
    if p_reason is null or btrim(p_reason)='' then raise exception 'Reason is required for not sure'; end if;

    insert into public.chat_messages(
      conversation_id,sender_id,receiver_id,content,message_type,event_data
    ) values(
      v_conversation,v_uid,v_r.id,
      'The mover is not sure about this request yet: '||p_reason,
      'booking_response',
      jsonb_build_object('booking_id',p_booking_id,'decision','not_sure','reason',p_reason)
    );

    insert into public.user_notifications(user_id,notification_type,title,message,data)
    values(
      v_r.id,
      'MOVER_NOT_SURE',
      'Mover is not sure',
      'The mover needs more discussion before confirming.',
      jsonb_build_object('booking_id',p_booking_id,'reason',p_reason)
    );

  else
    if p_reason is null or btrim(p_reason)='' then raise exception 'Reason is required for cancellation'; end if;

    update public.bookings
    set status='cancelled', cancelled_at=now(), cancellation_reason='MOVER_DECLINED', cancellation_details=p_reason, updated_at=now()
    where id=p_booking_id;

    insert into public.moving_cancellation_events(booking_id,cancelled_by,reason_code,reason_text)
    values(p_booking_id,v_uid,'OTHER',p_reason);

    insert into public.chat_messages(
      conversation_id,sender_id,receiver_id,content,message_type,event_data
    ) values(
      v_conversation,v_uid,v_r.id,
      'The mover cancelled the request: '||p_reason,
      'booking_response',
      jsonb_build_object('booking_id',p_booking_id,'decision','cancel','reason',p_reason)
    );

    insert into public.user_notifications(user_id,notification_type,title,message,data)
    values(
      v_r.id,
      'MOVER_CANCELLED',
      'Mover cancelled the request',
      'The mover cancelled your moving request.',
      jsonb_build_object('booking_id',p_booking_id,'reason',p_reason)
    );
  end if;

  return jsonb_build_object(
    'booking_id',p_booking_id,
    'decision',p_decision,
    'status',(select status from public.bookings where id=p_booking_id)
  );
end;
$function$;

create or replace function public.get_mover_booking_detail(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings%rowtype;
  v_m public.movers%rowtype;
  v_r public.profiles%rowtype;
  v_event public.mover_schedule_events%rowtype;
  v_contact_released boolean := false;
  v_conversation_id text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select b.* into v_b
  from public.bookings b
  join public.movers m on m.id = b.mover_id
  where b.id = p_booking_id and m.user_id = v_uid;

  if not found then raise exception 'Booking not found or unauthorized'; end if;

  select * into v_m from public.movers where id = v_b.mover_id;
  select * into v_r from public.profiles where id = v_b.renter_id;
  select * into v_event from public.mover_schedule_events where booking_id = p_booking_id;

  v_contact_released := v_b.contact_released_at is not null;
  v_conversation_id := least(v_b.renter_id, v_m.user_id)::text || '__' || greatest(v_b.renter_id, v_m.user_id)::text;

  return jsonb_build_object(
    'booking', to_jsonb(v_b),
    'conversation_id', v_conversation_id,
    'renter', case when v_r.id is null then null else jsonb_build_object(
      'id', v_r.id,
      'full_name', v_r.full_name,
      'phone', case when v_contact_released then v_r.phone else null end,
      'profile_photo_url', v_r.profile_photo_url,
      'city', v_r.city,
      'county', v_r.county
    ) end,
    'mover', case when v_m.id is null then null else jsonb_build_object(
      'id', v_m.id,
      'driver_full_name', v_m.driver_full_name,
      'business_name', v_m.business_name,
      'phone', v_m.phone,
      'vehicle_type', v_m.vehicle_type,
      'number_plate', v_m.number_plate,
      'operating_city', v_m.operating_city,
      'operating_county', v_m.operating_county,
      'base_rate_kes', v_m.base_rate_kes,
      'rate_per_km_kes', v_m.rate_per_km_kes,
      'approval_status', v_m.approval_status
    ) end,
    'schedule', case when v_event.id is null then null else jsonb_build_object(
      'id', v_event.id,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'status', v_event.status,
      'title', v_event.title
    ) end,
    'response_deadline', coalesce(v_b.request_expires_at, v_b.requested_at + interval '30 minutes'),
    'can_respond', (
      v_b.status='pending'
      and coalesce(v_b.request_expires_at, v_b.requested_at + interval '30 minutes') > now()
    ),
    'contact_released', v_contact_released
  );
end;
$function$;
