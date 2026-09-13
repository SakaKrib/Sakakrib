import { useCallback, useEffect, useState } from 'react';
import { Link2, Loader2, UserRound } from 'lucide-react';

import { loadRealEstateDashboardData } from '@/lib/RealEstateTs/Realestateservice';
import {
  assignRealEstatePMSListing,
  getRealEstatePMSListingAssignments,
  getRealEstatePMSTeam,
  unassignRealEstatePMSListing,
  type RealEstatePMSMember,
} from '@/lib/RealEstateTs/RealEstatePMSTeamService';

export default function RealEstatePMSListingAssignments() {
  const [members, setMembers] = useState<RealEstatePMSMember[]>([]);
  const [listings, setListings] = useState<Array<{ id: string; title: string }>>([]);
  const [assignments, setAssignments] = useState<Array<{ assignment_id: string; listing_id: string; agent_id: string }>>([]);
  const [selectedListing, setSelectedListing] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [team, dashboard, currentAssignments] = await Promise.all([
        getRealEstatePMSTeam(),
        loadRealEstateDashboardData(''),
        getRealEstatePMSListingAssignments(),
      ]);
      setMembers((team.members ?? []).filter((member) => member.status === 'ACTIVE'));
      setListings((dashboard.listings ?? []).filter((listing) => listing.pms_managed).map((listing) => ({ id: listing.id, title: listing.title })));
      setAssignments(currentAssignments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load listing assignments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAssign = async () => {
    if (!selectedListing || !selectedAgent) return;
    setSaving(true);
    setError(null);
    try {
      await assignRealEstatePMSListing(selectedListing, selectedAgent);
      setSelectedListing('');
      setSelectedAgent('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to assign the listing.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async (listingId: string, agentId: string) => {
    setError(null);
    try {
      await unassignRealEstatePMSListing(listingId, agentId);
      setAssignments((current) => current.filter((item) => !(item.listing_id === listingId && item.agent_id === agentId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove the assignment.');
    }
  };

  const memberName = (userId: string) => {
    const member = members.find((item) => item.user_id === userId);
    return member?.full_name || member?.email || userId;
  };

  const listingName = (listingId: string) => listings.find((item) => item.id === listingId)?.title || listingId;

  return (
    <section className="rounded-xl border bg-white dark:border-brand-700 dark:bg-brand-900">
      <div className="border-b px-6 py-4 dark:border-brand-700">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-brand-600 dark:text-brand-300" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Listing assignments</h3>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Assign PMS-managed listings to active agents. Assignments do not create additional listing capacity.</p>
      </div>

      {error && <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin" />Loading assignments…</div>
      ) : (
        <div className="space-y-5 p-6">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <select value={selectedListing} onChange={(event) => setSelectedListing(event.target.value)} className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950 dark:text-white">
              <option value="">Select listing</option>
              {listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title}</option>)}
            </select>
            <select value={selectedAgent} onChange={(event) => setSelectedAgent(event.target.value)} className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950 dark:text-white">
              <option value="">Select agent</option>
              {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || member.email || member.user_id} — {member.role === 'TEAM_MANAGER' ? 'Team Manager' : 'Agent'}</option>)}
            </select>
            <button type="button" onClick={() => void handleAssign()} disabled={saving || !selectedListing || !selectedAgent} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? 'Assigning…' : 'Assign'}
            </button>
          </div>

          {assignments.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No listing assignments yet.</p>
          ) : (
            <div className="divide-y rounded-lg border dark:divide-brand-700 dark:border-brand-700">
              {assignments.map((assignment) => (
                <div key={assignment.assignment_id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">{listingName(assignment.listing_id)}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><UserRound className="h-3.5 w-3.5" />{memberName(assignment.agent_id)}</p>
                  </div>
                  <button type="button" onClick={() => void handleUnassign(assignment.listing_id, assignment.agent_id)} className="shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-brand-700 dark:text-gray-300 dark:hover:bg-brand-800">Unassign</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
