-- New mover booking requests must use the same canonical renter/mover conversation
-- as every later chat message. Booking id is carried in event_data.

create or replace function public.request_mover_booking(
  p_mover_id uuid,
  p_pickup_address text,
  p_dropoff_address text,
  p_pickup_latitude double precision,
  p_pickup_longitude double precision,
  p_dropoff_latitude double precision,
  p_dropoff_longitude double precision,
  p_distance_km numeric,
  p_listing_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
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
  select * into v_profile from public.profiles where id=v_uid;
  if not found then raise exception 'Profile not found'; end if;
  if v_profile.role<>'renter' then raise exception 'Only renters can request a mover'; end if;
  if p_pickup_address is null or btrim(p_pickup_address)='' then raise exception 'Pickup address is required'; end if;
  if p_dropoff_address is null or btrim(p_dropoff_address)='' then raise exception 'Dropoff address is required'; end if;
  if p_distance_km is null or p_distance_km<0 then raise exception 'Invalid distance'; end if;
  if p_pickup_latitude is null or p_dropoff_latitude is null or p_pickup_latitude not between -90 and 90 or p_dropoff_latitude not between -90 and 90 then raise exception 'Invalid latitude'; end if;
  if p_pickup_longitude is null or p_dropoff_longitude is null or p_pickup_longitude not between -180 and 180 or p_dropoff_longitude not between -180 and 180 then raise exception 'Invalid longitude'; end if;
  select * into v_mover from public.movers where id=p_mover_id and is_available=true and approval_status='approved';
  if not found then raise exception 'Mover is not currently available'; end if;
  select * into v_profile from public.profiles where id=v_mover.user_id;
  if not found or v_profile.verification_status<>'verified' or v_profile.mover_application_status<>'approved' then raise exception 'Mover is not verified and approved'; end if;
  v_quote:=public.calculate_mover_quote(p_mover_id,p_distance_km);
  v_total:=(v_quote->>'renter_total_kes')::numeric;
  v_fee:=(v_quote->>'platform_fee_kes')::numeric;
  v_net:=(v_quote->>'mover_net_kes')::numeric;
  v_deadline:=now()+interval '30 minutes';
  insert into public.bookings(renter_id,mover_id,listing_id,pickup_address,dropoff_address,moving_date,booking_amount,commission_amount,total_amount,status,payment_status,payment_method,distance_km,rate_per_km_kes,base_rate_kes,pickup_latitude,pickup_longitude,dropoff_latitude,dropoff_longitude,requested_at,request_expires_at)
  values(v_uid,p_mover_id,p_listing_id,p_pickup_address,p_dropoff_address,current_date,v_total,v_fee,v_total,'pending','unpaid',null,p_distance_km,(v_quote->>'rate_per_km_kes')::numeric,(v_quote->>'base_rate_kes')::numeric,p_pickup_latitude,p_pickup_longitude,p_dropoff_latitude,p_dropoff_longitude,now(),v_deadline)
  returning id into v_booking_id;

  v_conversation_id:=((least(v_uid,v_mover.user_id))::text||'__'||(greatest(v_uid,v_mover.user_id))::text);
  insert into public.chat_messages(conversation_id,sender_id,receiver_id,content,message_type,event_data)
  values(v_conversation_id,v_uid,v_mover.user_id,'Moving request received. Please respond within 30 minutes. Pickup: '||p_pickup_address||'. Destination: '||p_dropoff_address||'. Distance: '||round(p_distance_km,2)||' km. Estimated total: KES '||to_char(v_total,'FM999,999,990.00'),'booking_request',jsonb_build_object('booking_id',v_booking_id,'distance_km',p_distance_km,'rate_per_km_kes',v_quote->>'rate_per_km_kes','renter_total_kes',v_total,'platform_fee_kes',v_fee,'mover_net_kes',v_net,'pickup_latitude',p_pickup_latitude,'pickup_longitude',p_pickup_longitude,'dropoff_latitude',p_dropoff_latitude,'dropoff_longitude',p_dropoff_longitude,'request_expires_at',v_deadline));
  insert into public.user_notifications(user_id,notification_type,title,message,data)
  values(v_mover.user_id,'MOVER_REQUEST','New moving request','A renter has requested your moving service. You have 30 minutes to respond.',jsonb_build_object('booking_id',v_booking_id,'expires_at',v_deadline));
  insert into public.notification_emails(recipient,subject,html_body,template_type,status)
  values(v_profile.email,'New Saka Krib moving request','<p>You have received a new moving request on Saka Krib.</p><p>Please open the app to review and respond within 30 minutes.</p>','MOVER_REQUEST','pending');
  return jsonb_build_object('booking_id',v_booking_id,'conversation_id',v_conversation_id,'status','pending','request_expires_at',v_deadline,'quote',v_quote);
end;
$$;

revoke execute on function public.request_mover_booking(uuid,text,text,double precision,double precision,double precision,double precision,numeric,uuid) from public,anon;
grant execute on function public.request_mover_booking(uuid,text,text,double precision,double precision,double precision,double precision,numeric,uuid) to authenticated;
