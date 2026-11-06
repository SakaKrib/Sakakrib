import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  MapPin,
  Send,
  Sparkles,
  ThumbsUp,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { protectedGet, protectedPost, protectedUpload, resolveDjangoMediaUrl } from '@/lib/djangoApi';
import { useLiveEvents } from '@/lib/useLiveEvents';
import { formatKES } from '@/lib/utils';
import { getPropertyUnitSummary } from '@/lib/listingDisplay';
import type { CommunityPost, CommunityPostMedia } from '@/types/domain';

type Post = CommunityPost & { community_media?: CommunityPostMedia[] };

const ROLES = ['renter', 'landlord', 'mover', 'real_estate'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGES = 4;
const MAX_BYTES = 8 * 1024 * 1024;
const CAPTION_PREVIEW_LENGTH = 280;

function displayName(post: Post) {
  const author = post.author;
  return author?.full_name?.trim()
    || [author?.first_name, author?.middle_name, author?.last_name].filter(Boolean).join(' ').trim()
    || 'Anonymous';
}

function initials(post: Post) {
  return displayName(post).charAt(0).toUpperCase() || 'U';
}

function roleLabel(role?: string | null) {
  return String(role || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function moneyLabel(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? formatKES(amount) : null;
}

function unitPriceLabel(unit: NonNullable<Post['listing']>['units'][number]) {
  const sale = String(unit.listing_type || 'rent').toLowerCase() === 'sale';
  if (!sale) {
    const rent = moneyLabel(unit.rent);
    return rent ? `${rent}/month` : 'Rent on request';
  }

  const asking = moneyLabel(unit.sale_price) || moneyLabel(unit.installment_total_price);
  const installment = moneyLabel(unit.installment_amount);
  const frequency = String(unit.installment_frequency || 'monthly');
  const periods = unit.installment_periods;
  const parts = [asking ? `${asking} total` : null];
  if (installment) {
    parts.push(`${installment}/${frequency}${periods ? ` × ${periods}` : ''}`);
  }
  return parts.filter(Boolean).join(' · ') || 'Price on request';
}

function listingOfferLabel(listing: NonNullable<Post['listing']>) {
  const units = Array.isArray(listing.units) ? listing.units : [];
  const kinds = new Set(units.map((unit) => String(unit.listing_type || 'rent').toLowerCase()));
  if (kinds.has('rent') && kinds.has('sale')) return 'RENT & SALE';
  return String(kinds.values().next().value || listing.listing_type || 'rent').toLowerCase() === 'sale'
    ? 'FOR SALE'
    : 'FOR RENT';
}

function communityTime(post: Post) {
  const candidates = [post.created_at, post.listing?.created_at];
  for (const value of candidates) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }
  return 'Recently';
}

function Caption({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const clean = text.trim();
  const needsExpansion = clean.length > CAPTION_PREVIEW_LENGTH;
  const shown = needsExpansion && !expanded
    ? `${clean.slice(0, CAPTION_PREVIEW_LENGTH).trimEnd()}…`
    : clean;

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3 dark:border-brand-800/70 dark:bg-brand-950/40">
      <p className="whitespace-pre-line text-sm leading-6 text-brand-900 dark:text-brand-100">{shown}</p>
      {needsExpansion && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

export default function CommunityPage() {
  const { profile } = useAuth();
  const { event: liveEvent } = useLiveEvents(Boolean(profile?.id));
  const { navigate } = useNav();
  const [posts, setPosts] = useState<Post[]>([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [reacting, setReacting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [slides, setSlides] = useState<Record<string, number>>({});
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const canPost = ROLES.includes(String(profile?.role || '').toLowerCase());

  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = 'auto';
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 240)}px`;
  }, [text]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await protectedGet<{ items: Post[] }>('/api/core/community-posts/');
      setPosts(response?.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load community.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (liveEvent?.type === 'ready' && liveEvent.reconnected) {
      void load(true);
      return;
    }
    if (liveEvent?.type === 'resource.updated' && liveEvent.resource === 'community') {
      void load(true);
    }
  }, [liveEvent, load]);

  const selectFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list);
    if (files.length + next.length > MAX_IMAGES) {
      setError('A community post can have at most 4 images.');
      return;
    }
    if (next.some((file) => !IMAGE_TYPES.includes(file.type) || file.size <= 0 || file.size > MAX_BYTES)) {
      setError('Only JPG, PNG, WEBP, and GIF images smaller than 8 MB are allowed.');
      return;
    }
    setError('');
    setFiles((current) => [...current, ...next]);
  };

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setError('');
  };

  const createPost = async () => {
    if (!canPost || !text.trim() || posting) return;
    setPosting(true);
    setError('');
    try {
      const response = await protectedPost<{ post: Post }>('/api/core/community-posts/', {
        content: text.trim(),
        post_type: 'manual',
      });
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        await protectedUpload(`/api/core/community-posts/${response.post.id}/media/`, form);
      }
      setText('');
      setFiles([]);
      if (input.current) input.current.value = '';
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create post.');
      await load();
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (post: Post) => {
    if (!profile || String(post.user_id) === String(profile.id) || reacting) return;
    setReacting(post.id);
    setError('');
    try {
      const response = await protectedPost<{ reaction_count: number; reaction_type: string | null }>(
        `/api/core/community-posts/${post.id}/reactions/`,
        { reaction_type: 'like' },
      );
      setPosts((current) => current.map((item) => item.id === post.id
        ? { ...item, reaction_count: response.reaction_count, user_reaction: response.reaction_type }
        : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to react.');
    } finally {
      setReacting(null);
    }
  };

  const changeSlide = (postId: string, total: number, direction: number) => {
    if (total <= 1) return;
    setSlides((current) => {
      const index = current[postId] || 0;
      return { ...current, [postId]: (index + direction + total) % total };
    });
  };

  return (
    <div className="mx-auto max-w-2xl px-3 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-900 dark:text-white">
          <Users className="h-6 w-6 text-brand-600" />
          Community Feed
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Renters, landlords, movers, and real-estate professionals can post and react.</p>
      </div>

      {error && <div className="mb-4 rounded-xl border border-error-100 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-950/30 dark:text-error-300">{error}</div>}

      {canPost && (
        <div className="card mb-6 overflow-hidden p-3 sm:p-4">
          <div className="flex items-end gap-2 sm:gap-3">
            <div className="min-w-0 flex-1 rounded-2xl border border-brand-100 bg-brand-50/60 px-3 py-2 transition focus-within:border-brand-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-100 dark:border-brand-800 dark:bg-brand-950/40 dark:focus-within:bg-brand-950">
              <textarea
                ref={textarea}
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={10000}
                rows={1}
                className="block max-h-60 min-h-[42px] w-full resize-none overflow-y-auto border-0 bg-transparent p-0 text-sm leading-6 text-gray-800 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-100"
                placeholder="Share something with the community..."
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <input ref={input} type="file" multiple accept={IMAGE_TYPES.join(',')} className="hidden" onChange={(event) => selectFiles(event.target.files)} />
                <button type="button" onClick={() => input.current?.click()} disabled={files.length >= MAX_IMAGES || posting} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-brand-600 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-300 dark:hover:bg-brand-900/50">
                  <ImagePlus className="h-4 w-4" /> Add photos <span className="text-brand-400">{files.length}/{MAX_IMAGES}</span>
                </button>
                <span className="text-[11px] text-gray-400">{text.length}/10000</span>
              </div>
            </div>
            <button type="button" onClick={() => void createPost()} disabled={!text.trim() || posting} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:w-auto sm:rounded-xl sm:px-4">
              {posting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              <span className="ml-2 hidden sm:inline">{posting ? 'Posting...' : 'Post'}</span>
            </button>
          </div>
          {files.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {files.map((file, index) => <div key={`${file.name}-${index}`} className="group relative overflow-hidden rounded-xl border border-brand-100 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/40">
              <img src={URL.createObjectURL(file)} alt={file.name} className="h-24 w-full object-cover" />
              <button type="button" onClick={() => removeFile(index)} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white" aria-label={`Remove ${file.name}`}><X className="h-4 w-4" /></button>
              <div className="truncate px-2 py-1 text-[10px] text-gray-500 dark:text-gray-400">{file.name}</div>
            </div>)}
          </div>}
        </div>
      )}

      {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-600" /></div> : posts.length === 0 ? (
        <div className="card px-5 py-12 text-center"><Users className="mx-auto h-10 w-10 text-gray-300" /><h2 className="mt-3 font-semibold text-gray-800 dark:text-gray-100">No community posts yet</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Be the first to share something with the community.</p></div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const own = String(post.user_id) === String(profile?.id);
            const media = post.post_type === 'listing' ? (post.media || []) : (post.community_media || []);
            const currentSlide = slides[post.id] || 0;
            const authorPhoto = resolveDjangoMediaUrl(post.author?.profile_photo_url);
            const caption = (post.ai_caption || post.content || '').trim();

            return <article key={post.id} className="card overflow-hidden p-4 sm:p-5">
              <div className="flex items-center gap-3">
                {authorPhoto ? <img src={authorPhoto} alt={displayName(post)} className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-brand-50 dark:ring-brand-900" /> : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-200">{initials(post)}</div>}
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-2"><span className="truncate font-semibold text-gray-900 dark:text-white">{displayName(post)}</span><span className="text-xs text-gray-400">· {communityTime(post)}</span></div><div className="text-xs text-gray-500 dark:text-gray-400">{roleLabel(post.author?.role)}</div></div>
              </div>

              <div className="mt-4">
                {caption && <Caption text={caption} />}
                {post.ai_caption && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-300"><Sparkles className="h-3 w-3" /> AI property caption</p>}

                {post.post_type === 'listing' && post.listing && <div className="mt-3 overflow-hidden rounded-2xl border border-brand-100 bg-brand-50/30 dark:border-brand-800 dark:bg-brand-950/30">
                  <button type="button" onClick={() => navigate('listing-detail', post.listing_id!)} className="block w-full text-left">
                    {media.length > 0 && <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100 dark:bg-gray-900">
                      <img src={resolveDjangoMediaUrl(media[currentSlide]?.url)} alt={media[currentSlide]?.label || post.listing.title || 'Listing image'} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                      {media.length > 1 && <div className="absolute inset-0">
                        <button type="button" onClick={(event) => { event.stopPropagation(); changeSlide(post.id, media.length, -1); }} className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white" aria-label="Previous listing image"><ChevronLeft className="h-5 w-5" /></button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); changeSlide(post.id, media.length, 1); }} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white" aria-label="Next listing image"><ChevronRight className="h-5 w-5" /></button>
                        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/35 px-2 py-1">{media.map((item, index) => <span key={item.id || index} className={`h-1.5 w-1.5 rounded-full ${index === currentSlide ? 'bg-white' : 'bg-white/50'}`} />)}</div>
                      </div>}
                    </div>}
                    <div className="space-y-3 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-bold tracking-wide text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                          {listingOfferLabel(post.listing)}
                        </span>
                        {post.listing.is_property_management && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:bg-brand-800 dark:text-gray-300">Property management</span>}
                      </div>
                      <div>
                        <b className="block text-base text-brand-900 dark:text-white">{post.listing.property_name || post.listing.title}</b>
                        {post.listing.property_name && post.listing.title && post.listing.property_name !== post.listing.title && <p className="text-xs text-gray-500 dark:text-gray-400">{post.listing.title}</p>}
                        <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><MapPin className="h-3 w-3 text-brand-500" />{[post.listing.city, post.listing.county].filter(Boolean).join(', ') || post.listing.location_search || 'Location not provided'}</p>
                      </div>
                      {(() => {
                        const units = Array.isArray(post.listing.units) ? post.listing.units : [];
                        const unitSummary = getPropertyUnitSummary(post.listing);
                        if (unitSummary && units.length > 0) {
                          return (
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-brand-700 dark:text-brand-300">
                                <span className="rounded-full bg-brand-100 px-2.5 py-1 dark:bg-brand-900/60">Multi-unit property</span>
                                <span>{unitSummary.total} {unitSummary.total === 1 ? 'unit' : 'units'} · {unitSummary.available} available</span>
                              </div>
                              <div className="divide-y divide-brand-100 overflow-hidden rounded-xl border border-brand-100 bg-white/70 dark:divide-brand-800 dark:border-brand-800 dark:bg-brand-950/30">
                                {units.map((unit) => (
                                  <div key={unit.id} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-gray-900 dark:text-white">Unit {unit.unit_number || '—'}</span>
                                        <span className="text-xs capitalize text-gray-500 dark:text-gray-400">{String(unit.unit_type || 'unit').replace(/_/g, ' ')}</span>
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${String(unit.status).toLowerCase() === 'occupied' ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' : 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-300'}`}>{String(unit.status || 'available').toUpperCase()}</span>
                                      </div>
                                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{[unit.size, unit.beds != null ? `${unit.beds} bed` : null, unit.baths != null ? `${unit.baths} bath` : null].filter(Boolean).join(' · ') || 'Details not provided'}</p>
                                    </div>
                                    <div className="text-left sm:text-right">
                                      <b className="text-sm text-brand-700 dark:text-brand-300">{unitPriceLabel(unit)}</b>
                                      {String(unit.listing_type || 'rent').toLowerCase() === 'rent' && moneyLabel(unit.deposit_amount) && <p className="text-[11px] text-gray-500 dark:text-gray-400">Deposit {moneyLabel(unit.deposit_amount)}</p>}
                                      {String(unit.listing_type || 'rent').toLowerCase() === 'sale' && moneyLabel(unit.installment_deposit) && <p className="text-[11px] text-gray-500 dark:text-gray-400">Initial deposit {moneyLabel(unit.installment_deposit)}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        const sale = String(post.listing.listing_type || 'rent').toLowerCase() === 'sale';
                        const price = moneyLabel(post.listing.price_kes);
                        return (
                          <div className="space-y-1">
                            <b className="text-lg text-brand-700 dark:text-brand-300">{sale ? (price ? `Asking price: ${price}` : 'Asking price: Contact for price') : (price ? `Rent: ${price}/month` : 'Rent: Contact for price')}</b>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{[post.listing.size, post.listing.beds != null ? `${post.listing.beds} bed` : null, post.listing.baths != null ? `${post.listing.baths} bath` : null].filter(Boolean).join(' · ') || 'Property details available on request'}</p>
                            {!sale && post.listing.deposit_required && <p className="text-xs text-gray-500 dark:text-gray-400">{moneyLabel(post.listing.deposit_amount) ? `Deposit: ${moneyLabel(post.listing.deposit_amount)}` : 'Deposit required'}</p>}
                          </div>
                        );
                      })()}
                    </div>
                  </button>
                </div>}

                {post.post_type !== 'listing' && media.length > 0 && <div className={`mt-3 grid gap-1 overflow-hidden rounded-2xl ${media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>{media.slice(0, MAX_IMAGES).map((item, index) => <img key={item.id || index} crossOrigin="use-credentials" src={resolveDjangoMediaUrl(item.url)} alt={item.label || `Community image ${index + 1}`} className={`${media.length === 1 ? 'h-64' : 'h-40'} w-full object-cover sm:h-64`} onError={(event) => { event.currentTarget.style.display = 'none'; }} />)}</div>}

                <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800"><button type="button" onClick={() => void toggleLike(post)} disabled={own || reacting === post.id} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${post.user_reaction === 'like' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200' : 'text-gray-500 hover:bg-brand-50 hover:text-brand-600 dark:text-gray-400 dark:hover:bg-brand-950/50 dark:hover:text-brand-300'}`} title={own ? 'You cannot react to your own post' : 'Like this post'}>{reacting === post.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}Like<span className="text-xs">{post.reaction_count || 0}</span></button></div>
              </div>
            </article>;
          })}
        </div>
      )}
    </div>
  );
}
