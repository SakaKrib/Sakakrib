import { useEffect, useState } from 'react';
import { ArrowRight, FileText, Loader2, Trash2 } from 'lucide-react';
import { deleteListingDraft, listListingDrafts, type ListingDraft } from '@/lib/ListingDraft';

interface ListingDraftsPanelProps {
  /** Open the form on this draft (loads every field and photo that was saved). */
  onContinue: (draftId: string) => void;
  /** Called after a draft is deleted so the page can drop any local copy of it. */
  onDeleted?: (draftId: string) => void;
}

const formatUpdated = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/**
 * "Continue where you left off": the user's saved listing drafts. Drafts are stored on the
 * server (fields and uploaded photos/videos), so they are still here after logging out and in.
 * Renders nothing when there are no drafts.
 */
export default function ListingDraftsPanel({ onContinue, onDeleted }: ListingDraftsPanelProps) {
  const [drafts, setDrafts] = useState<ListingDraft[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listListingDrafts()
      .then((rows) => { if (!cancelled) setDrafts(rows); })
      .catch(() => { if (!cancelled) setDrafts([]); });
    return () => { cancelled = true; };
  }, []);

  if (drafts === null) {
    return (
      <div className="mx-auto w-full max-w-5xl px-2 pt-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />Checking for saved drafts...</div>
      </div>
    );
  }
  if (drafts.length === 0) return null;

  const remove = async (draft: ListingDraft) => {
    if (!window.confirm('Delete this draft and its uploaded photos? This cannot be undone.')) return;
    setDeletingId(draft.id);
    try {
      await deleteListingDraft(draft.id);
      setDrafts((current) => (current ?? []).filter((item) => item.id !== draft.id));
      onDeleted?.(draft.id);
    } catch (error) {
      console.error('Unable to delete the draft:', error);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-2 pt-6 sm:px-6 lg:px-8">
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Continue a saved draft</h2>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Your progress and photos are saved automatically. Pick up where you left off, or start a new listing below.</p>
        <ul className="mt-3 space-y-2">
          {drafts.map((draft) => {
            const data = (draft.data ?? {}) as unknown as Record<string, unknown>;
            const title = String(data.title || data.property_name || '').trim() || 'Untitled draft';
            const place = [data.city, data.county].map((value) => String(value || '').trim()).filter(Boolean).join(', ');
            return (
              <li key={draft.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-brand-700">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{[place, formatUpdated(draft.updated_at)].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => onContinue(draft.id)} className="btn-primary px-3 py-1.5 text-xs">Continue<ArrowRight className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => void remove(draft)} disabled={deletingId === draft.id} aria-label="Delete draft" className="rounded-full border border-gray-300 p-2 text-gray-500 hover:text-error-600 disabled:opacity-50 dark:border-brand-700">
                    {deletingId === draft.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
