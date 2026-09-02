import { protectedDelete, protectedGet, protectedPatch, protectedPost } from '@/lib/djangoApi';
import type { ListingFormPayload } from '@/lib/ListingEntitlement';

export interface ListingDraft {
  id: string;
  listing_id: string;
  user_id: string;
  data: ListingFormPayload;
  created_at: string;
  updated_at: string;
}

export async function createListingDraft(data: Partial<ListingFormPayload>): Promise<ListingDraft> {
  return protectedPost<ListingDraft>('/api/listings/drafts/', { data });
}

export async function updateListingDraft(draftId: string, data: Partial<ListingFormPayload>): Promise<ListingDraft> {
  if (!draftId) throw new Error('A draft ID is required.');
  return protectedPatch<ListingDraft>(`/api/listings/drafts/${encodeURIComponent(draftId)}/`, { data });
}

export async function getListingDraft(draftId: string): Promise<ListingDraft> {
  if (!draftId) throw new Error('A draft ID is required.');
  return protectedGet<ListingDraft>(`/api/listings/drafts/${encodeURIComponent(draftId)}/`);
}

export async function listListingDrafts(): Promise<ListingDraft[]> {
  const response = await protectedGet<{ drafts?: ListingDraft[] }>('/api/listings/drafts/');
  return response?.drafts ?? [];
}

export async function deleteListingDraft(draftId: string): Promise<void> {
  if (!draftId) return;
  await protectedDelete(`/api/listings/drafts/${encodeURIComponent(draftId)}/`);
}

export async function finalizeListingDraft(draftId: string, paymentIntentId?: string) {
  if (!draftId) throw new Error('A draft ID is required.');
  return protectedPost<{ success: boolean; listing_created: boolean; listing_id: string; listing_entitlement: string }>(
    `/api/listings/drafts/${encodeURIComponent(draftId)}/`,
    paymentIntentId ? { payment_intent_id: paymentIntentId } : {},
  );
}
