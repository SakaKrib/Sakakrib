import { protectedGet } from '@/lib/djangoApi';

export interface MovingFinancialDocument {
  id: string;
  booking_id: string;
  payment_id: string | null;
  document_type: 'RENTER_RECEIPT' | 'MOVER_SETTLEMENT';
  document_number: string;
  renter_id: string;
  mover_id: string;
  amount_kes: number;
  platform_fee_kes: number;
  mover_net_kes: number;
  currency: string;
  status: string;
  payment_provider: string | null;
  provider_reference: string | null;
  provider_transaction_id: string | null;
  mover_name_snapshot: string;
  mover_phone_snapshot: string | null;
  vehicle_type_snapshot: string | null;
  number_plate_snapshot: string | null;
  mover_profile_photo_snapshot: string | null;
  issued_at: string;
  paid_at: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
}

const core = '/api/core';

export const movingFinancialApi = {
  getDocuments: (): Promise<MovingFinancialDocument[]> =>
    protectedGet<MovingFinancialDocument[]>(`${core}/moving-financial-documents/`),
  getDocument: (id: string): Promise<MovingFinancialDocument> =>
    protectedGet<MovingFinancialDocument>(`${core}/moving-financial-documents/${encodeURIComponent(id)}/`),
};
