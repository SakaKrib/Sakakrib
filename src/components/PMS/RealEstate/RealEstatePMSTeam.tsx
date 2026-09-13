import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Shield, UserRound, Users, X } from 'lucide-react';

import {
  addRealEstatePMSMember,
  getRealEstatePMSTeam,
  removeRealEstatePMSMember,
  updateRealEstatePMSMember,
  type RealEstatePMSMember,
  type RealEstatePMSMemberRole,
} from '@/lib/RealEstateTs/RealEstatePMSTeamService';

function roleLabel(role: RealEstatePMSMemberRole) {
  return role === 'TEAM_MANAGER' ? 'Team Manager' : 'Agent';
}

export default function RealEstatePMSTeam() {
  const [members, setMembers] = useState<RealEstatePMSMember[]>([]);
  const [pmsRole, setPmsRole] = useState<'ADMIN' | RealEstatePMSMemberRole>('ADMIN');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RealEstatePMSMemberRole>('AGENT');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRealEstatePMSTeam();
      setMembers(data.members ?? []);
      setPmsRole(data.pms_role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the agent team.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const handleAdd = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;

    setSaving(true);
    setError(null);
    try {
      const result = await addRealEstatePMSMember(normalizedEmail, role);
      setMembers((current) => {
        const next = current.filter((member) => member.user_id !== result.member.user_id);
        return [...next, result.member];
      });
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add the agent.');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (member: RealEstatePMSMember, nextRole: RealEstatePMSMemberRole) => {
    setError(null);
    try {
      await updateRealEstatePMSMember(member.user_id, nextRole);
      setMembers((current) => current.map((item) => item.user_id === member.user_id ? { ...item, role: nextRole, status: 'ACTIVE' } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the team member.');
    }
  };

  const handleRemove = async (member: RealEstatePMSMember) => {
    setError(null);
    try {
      await removeRealEstatePMSMember(member.user_id);
      setMembers((current) => current.map((item) => item.user_id === member.user_id ? { ...item, status: 'SUSPENDED' } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove the team member.');
    }
  };

  const isAdmin = pmsRole === 'ADMIN';

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-white p-6 dark:border-brand-700 dark:bg-brand-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-brand-600 dark:text-brand-300" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Agent Team</h2>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Manage the people working inside this Real Estate PMS. Listing and unit capacity remains controlled by the subscription.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
          <Shield className="h-4 w-4" />
          {isAdmin ? 'Administrator' : roleLabel(pmsRole)}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {isAdmin && (
        <div className="rounded-xl border bg-white p-6 dark:border-brand-700 dark:bg-brand-900">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Add team member</h3>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="Agent account email"
              className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-brand-700 dark:bg-brand-950 dark:text-white"
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as RealEstatePMSMemberRole)}
              className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950 dark:text-white"
            >
              <option value="AGENT">Agent</option>
              <option value="TEAM_MANAGER">Team Manager</option>
            </select>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={saving || !email.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Agents do not receive separate listing capacity. All team members share the PMS subscription limits.
          </p>
        </div>
      )}

      <div className="rounded-xl border bg-white dark:border-brand-700 dark:bg-brand-900">
        <div className="border-b px-6 py-4 dark:border-brand-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Team members</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading team…
          </div>
        ) : members.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No agents have been added yet.
          </div>
        ) : (
          <div className="divide-y dark:divide-brand-700">
            {members.map((member) => (
              <div key={member.id} className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-full bg-brand-50 p-2.5 dark:bg-brand-800">
                    <UserRound className="h-5 w-5 text-brand-600 dark:text-brand-300" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900 dark:text-white">{member.full_name || member.email || member.user_id}</p>
                    {member.full_name && <p className="truncate text-sm text-gray-500 dark:text-gray-400">{member.email}</p>}
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{member.status === 'ACTIVE' ? roleLabel(member.role) : 'Suspended'}</p>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <select
                      value={member.role}
                      onChange={(event) => void handleRoleChange(member, event.target.value as RealEstatePMSMemberRole)}
                      disabled={member.status !== 'ACTIVE'}
                      className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950 dark:text-white"
                    >
                      <option value="AGENT">Agent</option>
                      <option value="TEAM_MANAGER">Team Manager</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleRemove(member)}
                      disabled={member.status !== 'ACTIVE'}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:text-red-300"
                    >
                      <X className="h-4 w-4" />
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
