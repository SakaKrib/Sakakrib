import { protectedDelete, protectedGet, protectedPatch, protectedPost } from '@/lib/djangoApi';

export type RealEstatePMSMemberRole = 'TEAM_MANAGER' | 'AGENT';
export type RealEstatePMSMemberStatus = 'ACTIVE' | 'SUSPENDED';

export interface RealEstatePMSMember {
  id: string;
  user_id: string;
  role: RealEstatePMSMemberRole;
  status: RealEstatePMSMemberStatus;
  created_at: string;
  updated_at: string;
}

export interface RealEstatePMSTeamResponse {
  pms_owner_id: string;
  pms_role: 'ADMIN' | RealEstatePMSMemberRole;
  members: RealEstatePMSMember[];
}

export async function getRealEstatePMSTeam() {
  return protectedGet<RealEstatePMSTeamResponse>('/api/subscriptions/real-estate/team/');
}

export async function addRealEstatePMSMember(userId: string, role: RealEstatePMSMemberRole = 'AGENT') {
  return protectedPost<{ success: boolean; member: RealEstatePMSMember }>('/api/subscriptions/real-estate/team/', {
    user_id: userId,
    role,
  });
}

export async function updateRealEstatePMSMember(userId: string, role: RealEstatePMSMemberRole) {
  return protectedPatch<{ success: boolean; user_id: string; role: RealEstatePMSMemberRole; status: RealEstatePMSMemberStatus }>(
    '/api/subscriptions/real-estate/team/',
    { user_id: userId, role },
  );
}

export async function removeRealEstatePMSMember(userId: string) {
  return protectedDelete<{ success: boolean; user_id: string; status: RealEstatePMSMemberStatus }>(
    '/api/subscriptions/real-estate/team/',
    { user_id: userId },
  );
}

export async function getRealEstatePMSListingAssignments(listingId?: string) {
  const query = listingId ? `?listing_id=${encodeURIComponent(listingId)}` : '';
  return protectedGet<Array<{
    assignment_id: string;
    listing_id: string;
    agent_id: string;
    assigned_by_id: string;
    created_at: string;
  }>>(`/api/subscriptions/real-estate/listing-assignments/${query}`);
}

export async function assignRealEstatePMSListing(listingId: string, agentId: string) {
  return protectedPost<{ success: boolean; assignment_id: string }>('/api/subscriptions/real-estate/listing-assignments/', {
    listing_id: listingId,
    agent_id: agentId,
  });
}

export async function unassignRealEstatePMSListing(listingId: string, agentId: string) {
  return protectedDelete<{ success: boolean; listing_id: string; agent_id: string; status: string }>(
    '/api/subscriptions/real-estate/listing-assignments/',
    { listing_id: listingId, agent_id: agentId },
  );
}