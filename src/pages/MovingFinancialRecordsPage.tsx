import { FileText, RefreshCw, WalletCards } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { movingFinancialApi, type MovingFinancialDocument } from '@/lib/movingFinancialApi';

const money = (value: number | null | undefined) => `KES ${(value ?? 0).toLocaleString()}`;
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—';
function statusLabel(status: string) { return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()); }

export default function MovingFinancialRecordsPage() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [documents, setDocuments] = useState<MovingFinancialDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true); setError(null);
    try { setDocuments(await movingFinancialApi.getDocuments()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load financial records.'); }
    finally { setLoading(false); }
  }, [profile?.id]);
  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => ({
    receipts: documents.filter((d) => d.document_type === 'RENTER_RECEIPT').length,
    settlements: documents.filter((d) => d.document_type === 'MOVER_SETTLEMENT').length,
    value: documents.reduce((sum, d) => sum + Number(d.amount_kes || 0), 0),
  }), [documents]);

  const isMover = profile?.role === 'mover';
  const isAdmin = profile?.is_admin === true || profile?.is_superuser === true;
  const title = isAdmin ? 'Moving financial records' : isMover ? 'Financial records & settlements' : 'Payments & receipts';
  const description = isAdmin
    ? 'Review moving payments, renter receipts, mover settlements, and provider references.'
    : isMover
      ? 'Track your booking settlements, platform deductions, payout status and provider references.'
      : 'Track your moving payments and the receipts issued for confirmed transactions.';