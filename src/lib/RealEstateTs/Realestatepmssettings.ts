import { protectedGet, protectedPatch } from '@/lib/djangoApi';

export interface RealEstatePMSSettings {
  real_estate_id: string;
  default_rent_due_day: number;
  default_payment_tracking_enabled: boolean;
  updated_at: string;
}

const SETTINGS_ENDPOINT = '/api/core/pms/real-estate/settings/';

export function getRealEstatePMSSettings() {
  return protectedGet<RealEstatePMSSettings>(SETTINGS_ENDPOINT);
}

export function updateRealEstatePMSSettings(payload: Partial<Pick<RealEstatePMSSettings, 'default_rent_due_day' | 'default_payment_tracking_enabled'>>) {
  return protectedPatch<RealEstatePMSSettings>(SETTINGS_ENDPOINT, payload);
}
