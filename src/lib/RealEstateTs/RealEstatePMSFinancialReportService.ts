import { protectedGet } from '@/lib/djangoApi';

export interface RealEstatePMSFinancialReportData {
  period: {
    months: number;
    from: string;
    to: string;
  };
  summary: {
    invoiced_kes: number;
    collected_kes: number;
    outstanding_kes: number;
    collection_rate: number;
    invoice_count: number;
    pending_payment_submissions: number;
  };
  monthly: Array<{
    month: string;
    invoiced_kes: number;
    collected_kes: number;
    outstanding_kes: number;
  }>;
  properties: Array<{
    listing_id: string;
    property_name: string;
    units: number;
    occupied_units: number;
    vacant_units: number;
    invoiced_kes: number;
    collected_kes: number;
    outstanding_kes: number;
    collection_rate: number;
  }>;
  units: Array<{
    unit_id: string;
    unit_number: string;
    listing_id: string;
    property_name: string;
    invoiced_kes: number;
    collected_kes: number;
    outstanding_kes: number;
    collection_rate: number;
  }>;
  pms_role: string;
}

export async function getRealEstatePMSFinancialReport(months = 12) {
  return protectedGet<RealEstatePMSFinancialReportData>(
    `/api/subscriptions/real-estate/financial-report/?months=${months}`,
  );
}
