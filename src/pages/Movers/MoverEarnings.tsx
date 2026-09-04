import { RefreshCw, Wallet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverPayout } from '@/lib/Movers';
import MoverEarningsChart from './MoverEarningsChart';

const money = (v: number) => `KES ${v.toLocaleString()}`;
export default function MoverEarnings() {
  const { profile } = useAuth(); const { navigate } = useNav(); const [payouts, setPayouts] = useState<MoverPayout[]>([]); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { if (!profile?.id || profile.role !== 'mover') return; setLoading(true); try { setPayouts(await moverApi.getPayouts()); } finally { setLoading(false); } }, [profile?.id, profile?.role]);
  useEffect(() => { void load(); }, [load]);
  const totals = useMemo(() => payouts.reduce((a, p) => ({ gross: a.gross + (p.renter_payment || 0), deductions: a.deductions + (p.platform_deduction || 0), net: a.net + (p.net_mover_payable || 0) }), { gross: 0, deductions: 0, net: 0 }), [payouts]);
  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div>;
  return <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mb-6"><button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to dashboard</button><h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Earnings</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Payout performance and mover earnings history.</p></div><div className="mb-6 grid gap-4 md:grid-cols-3"><div className="card p-5"><p className="text-sm text-gray-500">Gross booking value</p><p className="mt-1 text-2xl font-bold">{money(totals.gross)}</p></div><div className="card p-5"><p className="text-sm text-gray-500">Platform deductions</p><p className="mt-1 text-2xl font-bold">{money(totals.deductions)}</p></div><div className="card p-5"><p className="text-sm text-gray-500">Mover payable</p><p className="mt-1 flex items-center gap-2 text-2xl font-bold"><Wallet className="h-5 w-5 text-brand-500" />{money(totals.net)}</p></div></div><MoverEarningsChart payouts={payouts} /></div>;
}
