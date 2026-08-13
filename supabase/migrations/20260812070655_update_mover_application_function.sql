/*
# Update submit_mover_application for new fields

Updates the submit_mover_application function to accept rate_per_km_kes,
insurance_policy_details, vehicle_inspection_expiry, terms_accepted.
*/

CREATE OR REPLACE FUNCTION submit_mover_application(p_application jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid() FOR UPDATE;
  IF v_profile.id IS NULL OR v_profile.role <> 'renter' THEN
    RAISE EXCEPTION 'Only renter accounts can submit a mover application';
  END IF;
  IF v_profile.mover_application_status IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'A mover application is already pending or approved';
  END IF;
  IF COALESCE(p_application->>'dl_photo_url', '') = '' OR COALESCE(p_application->>'number_plate', '') = '' THEN
    RAISE EXCEPTION 'Mover evidence is required';
  END IF;
  IF COALESCE((p_application->>'terms_accepted')::boolean, false) <> true THEN
    RAISE EXCEPTION 'Terms and conditions must be accepted';
  END IF;
  INSERT INTO movers (
    user_id, driver_full_name, national_id, dl_number, dl_photo_url, vehicle_type, number_plate,
    operating_city, operating_county, phone, base_rate_kes, rate_per_km_kes, capacity_details, payment_channel,
    payment_account, liability_accepted, insurance_policy_details, vehicle_inspection_expiry, terms_accepted,
    reference_contacts, is_available, approval_status
  ) VALUES (
    auth.uid(), p_application->>'driver_full_name', p_application->>'national_id', p_application->>'dl_number', p_application->>'dl_photo_url',
    p_application->>'vehicle_type', upper(p_application->>'number_plate'), p_application->>'operating_city', p_application->>'operating_county',
    p_application->>'phone', COALESCE((p_application->>'base_rate_kes')::numeric, 0), COALESCE((p_application->>'rate_per_km_kes')::numeric, 0),
    p_application->>'capacity_details', p_application->>'payment_channel', p_application->>'payment_account',
    COALESCE((p_application->>'liability_accepted')::boolean, false), p_application->>'insurance_policy_details',
    NULLIF(p_application->>'vehicle_inspection_expiry', '')::date, COALESCE((p_application->>'terms_accepted')::boolean, false),
    COALESCE(p_application->'reference_contacts', '[]'::jsonb), false, 'pending_review'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    driver_full_name = EXCLUDED.driver_full_name, national_id = EXCLUDED.national_id, dl_number = EXCLUDED.dl_number,
    dl_photo_url = EXCLUDED.dl_photo_url, vehicle_type = EXCLUDED.vehicle_type, number_plate = EXCLUDED.number_plate,
    operating_city = EXCLUDED.operating_city, operating_county = EXCLUDED.operating_county, phone = EXCLUDED.phone,
    base_rate_kes = EXCLUDED.base_rate_kes, rate_per_km_kes = EXCLUDED.rate_per_km_kes, capacity_details = EXCLUDED.capacity_details,
    payment_channel = EXCLUDED.payment_channel, payment_account = EXCLUDED.payment_account, liability_accepted = EXCLUDED.liability_accepted,
    insurance_policy_details = EXCLUDED.insurance_policy_details, vehicle_inspection_expiry = EXCLUDED.vehicle_inspection_expiry,
    terms_accepted = EXCLUDED.terms_accepted, reference_contacts = EXCLUDED.reference_contacts,
    is_available = false, approval_status = 'pending_review';
  UPDATE profiles SET mover_application_status = 'pending' WHERE id = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION submit_mover_application(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION submit_mover_application(jsonb) TO authenticated;
