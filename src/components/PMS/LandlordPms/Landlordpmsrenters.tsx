import { useState } from 'react';
import {
  Ban,
  Bell,
  Check,
  Clock3,
  Copy,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Users,
} from 'lucide-react';

import {
  buildClaimUrl,
  cancelRenterInvitation,
  createRenterInvitation,
  resendRenterInvitation,
  sendPaymentReminder,
  type CreatedInvitation,
} from '@/lib/LandlordTs/landlordInvitations';

import type { PMSUnit } from '@/lib/LandlordTs/Landlordpmsrent';


function formatKES(value: number) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(
    new Date(value)
  );
}


// ============================================================
// ADD RENTER (send invitation)
// ============================================================

function AddRenterForm({
  vacantUnits,
  onSent,
  onCancel,
}: {
  vacantUnits: PMSUnit[];
  onSent: () => void;
  onCancel: () => void;
}) {
  const [unitId, setUnitId] = useState(vacantUnits[0]?.unit_id ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedUnit = vacantUnits.find((u) => u.unit_id === unitId);

  const handleSend = async () => {
    if (!unitId || !name.trim() || !email.trim()) {
      setError('Unit, renter name, and email are required.');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const invitation = await createRenterInvitation(
        unitId,
        name.trim(),
        phone.trim() || null,
        email.trim()
      );
      setResult(invitation);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to send invitation.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(buildClaimUrl(result.invite_token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (result) {
    return (
      <div className="rounded-xl border border-success-200 bg-success-50 p-6 dark:border-success-900 dark:bg-success-900/20">
        <Check className="h-8 w-8 text-success-600" />
        <h3 className="mt-3 font-bold text-gray-900 dark:text-white">
          Invitation sent to {result.renter_name}
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          An email has been queued. You can also copy the link directly:
        </p>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 dark:border-brand-700 dark:bg-brand-900">
          <code className="flex-1 truncate text-xs text-gray-600 dark:text-gray-300">
            {buildClaimUrl(result.invite_token)}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-brand-800 dark:text-gray-300"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          This link expires {formatDate(result.invite_expires_at)}. It won't
          be shown again — save it now if you want to share it manually.
        </p>

        <button type="button" onClick={onSent} className="btn-primary mt-4">
          Done
        </button>
      </div>
    );
  }

  if (vacantUnits.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-brand-700 dark:bg-brand-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No vacant units available — every unit already has an active or
          pending renter.
        </p>
        <button type="button" onClick={onCancel} className="btn-secondary mt-4">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
      <h3 className="font-semibold text-gray-900 dark:text-white">
        Add Renter
      </h3>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Unit
        </label>
        <select
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          className="input-field"
        >
          {vacantUnits.map((u) => (
            <option key={u.unit_id} value={u.unit_id}>
              {`${u.listing_title} \u00b7 Unit ${u.unit_number} \u2014 ${formatKES(u.rent)}/mo`}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Renter name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Phone (optional)
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      {selectedUnit && (
        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-brand-800/30 dark:text-gray-300">
          Rent for this unit: <strong>{formatKES(selectedUnit.rent)}/mo</strong>{' '}
          — set automatically from the unit, not editable here.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-900 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {sending && <Loader2 className="h-4 w-4 animate-spin" />}
          Send Invitation
        </button>
      </div>
    </div>
  );
}


// ============================================================
// RENTERS PAGE — Active + Pending
// ============================================================

export default function LandlordPMSRenters({
  units,
  onChanged,
}: {
  units: PMSUnit[];
  onChanged: () => Promise<void>;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResend, setLastResend] = useState<{
    id: string;
    url: string;
  } | null>(null);

  const [reminderId, setReminderId] = useState<string | null>(null);
  const [reminderResult, setReminderResult] = useState<{
    id: string;
    result: import('@/lib/LandlordTs/landlordInvitations').PaymentReminderResult;
  } | null>(null);

  const activeRenters = units.filter((u) => u.assoc_status === 'ACTIVE');
  const pendingRenters = units.filter((u) => u.assoc_status === 'PENDING');
  const vacantUnits = units.filter((u) => !u.assoc_status);

  const handleResend = async (assocId: string) => {
    setProcessingId(assocId);
    setError(null);
    setLastResend(null);
    try {
      const result = await resendRenterInvitation(assocId);
      setLastResend({
        id: assocId,
        url: `${window.location.origin}/#claim-rental/${result.invite_token}`,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to resend invitation.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (assocId: string) => {
    const confirmed = window.confirm('Cancel this pending invitation?');
    if (!confirmed) return;

    setProcessingId(assocId);
    setError(null);
    try {
      await cancelRenterInvitation(assocId);
      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to cancel invitation.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleSendReminder = async (assocId: string) => {
    setReminderId(assocId);
    setError(null);
    setReminderResult(null);
    try {
      const result = await sendPaymentReminder(assocId);
      setReminderResult({ id: assocId, result });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to send reminder.'
      );
    } finally {
      setReminderId(null);
    }
  };

  if (showAddForm) {
    return (
      <AddRenterForm
        vacantUnits={vacantUnits}
        onSent={async () => {
          setShowAddForm(false);
          await onChanged();
        }}
        onCancel={() => setShowAddForm(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Renters
        </h2>
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Users className="h-4 w-4" />
          Add Renter
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-900 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}

      {/* PENDING INVITATIONS */}
      {pendingRenters.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Pending Invitations
          </h3>
          <div className="rounded-xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-900">
            <div className="divide-y divide-gray-100 dark:divide-brand-800">
              {pendingRenters.map((unit) => (
                <div key={unit.unit_id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {unit.renter_name}
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {`${unit.listing_title} \u00b7 Unit ${unit.unit_number}`}
                      </p>
                      {unit.renter_email && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                          <Mail className="h-3 w-3" />
                          {unit.renter_email}
                        </p>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-100 px-3 py-1 text-xs font-medium text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
                      <Clock3 className="h-3.5 w-3.5" />
                      Pending
                    </span>
                  </div>

                  {lastResend?.id === unit.renter_assoc_id && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-brand-700 dark:bg-brand-800/30">
                      <code className="flex-1 truncate text-xs text-gray-600 dark:text-gray-300">
                        {lastResend.url}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(lastResend.url);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-brand-700 dark:text-gray-300"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </button>
                    </div>
                  )}

                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      disabled={
                        !unit.renter_assoc_id ||
                        processingId === unit.renter_assoc_id
                      }
                      onClick={() =>
                        unit.renter_assoc_id &&
                        handleResend(unit.renter_assoc_id)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-brand-700 dark:text-gray-300 dark:hover:bg-brand-800"
                    >
                      {processingId === unit.renter_assoc_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Resend
                    </button>
                    <button
                      type="button"
                      disabled={
                        !unit.renter_assoc_id ||
                        processingId === unit.renter_assoc_id
                      }
                      onClick={() =>
                        unit.renter_assoc_id &&
                        handleCancel(unit.renter_assoc_id)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-brand-700 dark:hover:bg-error-900/20"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE RENTERS */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Active Renters
        </h3>

        {activeRenters.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-brand-700 dark:bg-brand-900">
            <Users className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="mt-3 font-medium text-gray-700 dark:text-gray-300">
              No active renters yet
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Renters appear here once they claim their invitation.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-900">
            <div className="divide-y divide-gray-100 dark:divide-brand-800">
              {activeRenters.map((unit) => (
                <div key={unit.unit_id} className="p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {unit.renter_name}
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {`${unit.listing_title} \u00b7 Unit ${unit.unit_number}`}
                        {unit.renter_phone && (
                          <span className="ml-2 inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {unit.renter_phone}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {unit.rent_paid_in_advance && (
                        <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-800 dark:text-brand-300">
                          Paid through {unit.rent_paid_through_month
                            ? formatDate(unit.rent_paid_through_month)
                            : ''}
                        </span>
                      )}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatKES(unit.rent)}/mo
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3 border-t border-gray-100 pt-3 dark:border-brand-800">
                    <button
                      type="button"
                      disabled={
                        !unit.renter_assoc_id ||
                        reminderId === unit.renter_assoc_id
                      }
                      onClick={() =>
                        unit.renter_assoc_id &&
                        handleSendReminder(unit.renter_assoc_id)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-brand-700 dark:text-gray-300 dark:hover:bg-brand-800"
                    >
                      {reminderId === unit.renter_assoc_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Bell className="h-3.5 w-3.5" />
                      )}
                      Send Payment Reminder
                    </button>

                    {reminderResult?.id === unit.renter_assoc_id && (
                      <span className="text-xs text-success-600 dark:text-success-400">
                        Sent (in-app + email)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}