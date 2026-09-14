import { protectedGet } from '@/lib/djangoApi';

export interface RealEstatePMSAnalyticsSummary {
  properties: number;
  units: number;
  occupied_units: number;
  vacant_units: number;
  occupancy_rate: number;
  active_leases: number;
  leases_expiring_90_days: number;
  scheduled_rent: number;
  invoiced: number;
  collected: number;
  outstanding: number;
  collection_rate: number;
}

export interface RealEstatePMSAnalyticsResponse {
  pms_role: string | null;
  summary: RealEstatePMSAnalyticsSummary;
  trend: Array<{
    month: string;
    invoiced: number;
    collected: number;
    outstanding: number;
  }>;
}

export async function getRealEstatePMSAnalytics() {
  return protectedGet<RealEstatePMSAnalyticsResponse>('/api/subscriptions/real-estate/analytics/');
}
