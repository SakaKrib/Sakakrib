import { useEffect, useRef, useState } from 'react';
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
import { protectedGet, protectedPost, protectedUpload } from '@/lib/djangoApi';
import { formatKES, timeAgo } from '@/lib/utils';
import type { CommunityPost, CommunityPostMedia } from '@/types/domain';

type Post = CommunityPost & { community_media?: CommunityPostMedia[] };

const ROLES = ['renter', 'landlord', 'mover', 'real_estate'];
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGES = 4;
const MAX_BYTES = 8 * 1024 * 1024;

function displayName(post: Post) {
  const author = post.author;
  return author?.full_name?.trim() ||
    [author?.first_name, author?.middle_name, author?.last_name].filter(Boolean).join(' ').trim() ||
    'Anonymous';
}

function initials(post: Post) {
  const author = post.author;
  const name = author?.first_name?.trim() || displayName(post);
  return name.charAt(0).toUpperCase() || 'U';
}

function roleLabel(role?: string | null) {
  return String(role || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function CommunityPage() {
  const { profile } = useAuth();
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

  const load = async () => {
    setLoading(true);
    try {
      const response = await protectedGet<{ items: Post[] }>('/api/core/community-posts/');
      setPosts(response?.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load community.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list);
    if (files.length + next.length > MAX_IMAGES) {
      setError('A community post can have at most 4 images.');
      return;
    }
    if (next.some((file) => !TYPES.includes(file.type) || file.size <= 0 || file.size > MAX_BYTES)) {
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
      setPosts((current) => current.map((item) =>
        item.id === post.id
          ? { ...item, reaction_count: response.reaction_count, user_reaction: response.reaction_type }
          : item,
      ));
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
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6 text-brand-600" />
          Community Feed
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Renters, landlords, movers, and real-estate professionals can post and react.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {canPost && (
        <div className="card mb-6 overflow-hidden p-3 sm:p-4">
          <div className="flex items-end gap-2 sm:gap-3">
            <div className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 transition focus-within:border-brand-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-100">
              <textarea
                ref={textarea}
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={10000}
                rows={1}
                className="block max-h-60 min-h-[42px] w-full resize-none overflow-y-auto border-0 bg-transparent p-0 text-sm leading-6 outline-none focus:ring-0"
                placeholder="Share something with the community..."
                aria-label="Community post"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <input
                  ref={input}
                  type="file"
                  multiple
                  accept={TYPES.join(',')}
                  className="hidden"
                  onChange={(event) => selectFiles(event.target.files)}
                />
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  disabled={files.length >= MAX_IMAGES || posting}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ImagePlus className="h-4 w-4" />
                  <span>Add photos</span>
                  <span className="text-gray-400">{files.length}/{MAX_IMAGES}</span>
                </button>
                <span className="text-[11px] text-gray-400">{text.length}/10000</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void createPost()}
              disabled={!text.trim() || posting}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:w-auto sm:rounded-xl sm:px-4"
              aria-label="Post to community"
            >
              {posting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              <span className="ml-2 hidden sm:inline">{posting ? 'Posting...' : 'Post'}</span>
            </button>
          </div>

          {files.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="group relative overflow-hidden rounded-xl border bg-gray-100">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="h-24 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="truncate px-2 py-1 text-[10px] text-gray-500">{file.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : posts.length === 0 ? (
        <div className="card px-5 py-12 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-300" />
          <h2 className="mt-3 font-semibold text-gray-800">No community posts yet</h2>
          <p className="mt-1 text-sm text-gray-500">Be the first to share something with the community.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const own = String(post.user_id) === String(profile?.id);
            const media = post.post_type === 'listing'
              ? (post.media || [])
              : (post.community_media || []);
            const currentSlide = slides[post.id] || 0;
            const authorPhoto = post.author?.profile_photo_url || '';

            return (
              <article key={post.id} className="card overflow-hidden p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  {authorPhoto ? (
                    <img
                      src={authorPhoto}
                      alt={displayName(post)}
                      className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 ring-2 ring-white">
                      {initials(post)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="truncate font-semibold text-gray-900">{displayName(post)}</span>
                      <span className="text-xs text-gray-400">· {timeAgo(post.created_at || '')}</span>
                    </div>
                    <div className="text-xs capitalize text-gray-400">{roleLabel(post.author?.role)}</div>
                  </div>
                </div>

                <div className="mt-4">
                  {post.post_type === 'listing' && post.listing ? (
                    <>
                      <p className="whitespace-pre-line text-sm leading-6 text-gray-800">
                        {post.ai_caption || post.content}
                      </p>
                      {post.ai_caption && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-brand-500">
                          <Sparkles className="h-3 w-3" />
                          AI property caption
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => navigate('listing-detail', post.listing_id!)}
                        className="mt-3 block w-full overflow-hidden rounded-2xl border border-gray-200 bg-white text-left transition hover:border-brand-300 hover:shadow-sm"
                      >
                        {media.length > 0 && (
                          <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                            <img
                              src={media[currentSlide]?.url}
                              alt={media[currentSlide]?.label || post.listing.title || 'Listing image'}
                              className="h-full w-full object-cover"
                            />
                            {media.length > 1 && (
                              <>
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); changeSlide(post.id, media.length, -1); }}
                                  className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/60"
                                  aria-label="Previous listing image"
                                >
                                  <ChevronLeft className="h-5 w-5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); changeSlide(post.id, media.length, 1); }}
                                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/60"
                                  aria-label="Next listing image"
                                >
                                  <ChevronRight className="h-5 w-5" />
                                </button>
                                <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/35 px-2 py-1">
                                  {media.map((item, index) => (
                                    <span key={item.id || index} className={`h-1.5 w-1.5 rounded-full ${index === currentSlide ? 'bg-white' : 'bg-white/50'}`} />
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        <div className="space-y-1 p-3">
                          <b className="block text-base text-gray-900">{post.listing.title}</b>
                          <p className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin className="h-3 w-3" />
                            {post.listing.city}, {post.listing.county}
                          </p>
                          <b className="text-brand-600">{formatKES(post.listing.price_kes)}</b>
                        </div>
                      </button>
                    </>
                  ) : (
                    <p className="whitespace-pre-line text-sm leading-6 text-gray-800">{post.content}</p>
                  )}

                  {post.post_type !== 'listing' && media.length > 0 && (
                    <div className={`mt-3 grid gap-1 overflow-hidden rounded-2xl ${media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      {media.slice(0, 4).map((item, index) => (
                        <img
                          key={item.id || index}
                          src={item.url}
                          alt={item.label || 'Community image'}
                          className={`${media.length === 1 ? 'h-64' : 'h-40'} w-full object-cover`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t pt-3">
                  <button
                    type="button"
                    onClick={() => void toggleLike(post)}
                    disabled={own || reacting === post.id}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${post.user_reaction === 'like' ? 'font-semibold text-brand-600' : 'text-gray-500 hover:bg-gray-50 hover:text-brand-600'}`}
                  >
                    <ThumbsUp className="h-4 w-4" />
                    Like{post.reaction_count ? ` · ${post.reaction_count}` : ''}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
