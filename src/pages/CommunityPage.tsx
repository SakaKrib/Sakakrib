import { useState, useEffect } from 'react';
import { Users, Loader2, Home, ThumbsUp, MessageCircle, Share2, Sparkles, Send, MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { supabase } from '@/lib/supabase';
import { timeAgo, formatKES, cn } from '@/lib/utils';
import type { CommunityPost, Profile, Listing, ListingMedia } from '@/lib/supabase';

interface EnrichedPost extends CommunityPost {
  author?: Profile;
  listing?: Listing;
  media?: ListingMedia[];
}

export default function CommunityPage() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [posts, setPosts] = useState<EnrichedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('community_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      const posts = data as CommunityPost[];

      // Fetch author profiles
      const userIds = [...new Set(posts.map((p) => p.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);
      const profileMap: Record<string, Profile> = {};
      (profiles || []).forEach((p) => { profileMap[p.id] = p as Profile; });

      // Fetch listings
      const listingIds = posts.filter((p) => p.listing_id).map((p) => p.listing_id!);
      let listingMap: Record<string, Listing> = {};
      if (listingIds.length > 0) {
        const { data: listings } = await supabase
          .from('listings')
          .select('*')
          .in('id', listingIds);
        (listings || []).forEach((l) => { listingMap[l.id] = l as Listing; });
      }

      // Fetch listing media (photos)
      let mediaMap: Record<string, ListingMedia[]> = {};
      if (listingIds.length > 0) {
        const { data: media } = await supabase
          .from('listing_media')
          .select('*')
          .in('listing_id', listingIds)
          .eq('media_type', 'photo')
          .order('position');
        (media || []).forEach((m) => {
          const lid = (m as ListingMedia).listing_id;
          if (!mediaMap[lid]) mediaMap[lid] = [];
          mediaMap[lid].push(m as ListingMedia);
        });
      }

      setPosts(posts.map((p) => ({
        ...p,
        author: profileMap[p.user_id],
        listing: p.listing_id ? listingMap[p.listing_id] : undefined,
        media: p.listing_id ? mediaMap[p.listing_id] : undefined,
      })));
    }
    setLoading(false);
  };

  const handlePost = async () => {
    if (!profile || !newPost.trim()) return;
    setPosting(true);
    const { error } = await supabase.from('community_posts').insert({
      user_id: profile.id,
      content: newPost.trim(),
      post_type: 'manual',
    });
    if (!error) {
      setNewPost('');
      await fetchPosts();
    }
    setPosting(false);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Users className="h-6 w-6 text-brand-600" /> Community Feed
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Connect with landlords, movers, and renters across Kenya.
        </p>
      </div>

      {/* New Post */}
      {profile && (
        <div className="card mb-6 p-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
              {profile.full_name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1">
              <textarea
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                placeholder="Share an update, ask a question, or post about a property..."
                rows={3}
                className="input-field resize-none"
              />
              <div className="mt-2 flex justify-end">
                <button onClick={handlePost} disabled={!newPost.trim() || posting} className="btn-primary">
                  <Send className="h-4 w-4" /> {posting ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : posts.length === 0 ? (
        <div className="py-20 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">No posts yet. Be the first to share!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div key={post.id} className="card overflow-hidden p-5 animate-fade-in">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                  {post.author?.full_name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {post.author?.full_name || 'Anonymous'}
                    </p>
                    {post.author?.verification_status === 'verified' && (
                      <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700 dark:bg-success-900/30 dark:text-success-400">
                        Verified
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{timeAgo(post.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-400">{post.author?.role || 'renter'}</p>
                </div>
              </div>

              {/* Content */}
              <div className="mt-3">
                {post.post_type === 'listing' && post.listing ? (
                  <div>
                    {/* Full AI caption or fallback content */}
                    {post.ai_caption ? (
                      <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        {post.ai_caption}
                      </p>
                    ) : (
                      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{post.content}</p>
                    )}
                    {post.ai_caption && (
                      <p className="mt-2 flex items-center gap-1 text-xs text-brand-500 dark:text-brand-400">
                        <Sparkles className="h-3 w-3" /> AI-generated by Gemini
                      </p>
                    )}

                    {/* Listing photos */}
                    {post.media && post.media.length > 0 && (
                      <div className={cn(
                        'mt-3 gap-1',
                        post.media.length === 1 ? 'grid grid-cols-1' : 'grid grid-cols-2',
                      )}>
                        {post.media.slice(0, 4).map((m, i) => (
                          <button
                            key={m.id}
                            onClick={() => navigate('listing-detail', post.listing_id!)}
                            className={cn(
                              'relative overflow-hidden rounded-lg bg-gray-200 dark:bg-brand-800',
                              post.media!.length === 1 ? 'h-64' : 'h-40',
                              post.media!.length === 3 && i === 0 && 'col-span-2 h-48',
                            )}
                          >
                            <img
                              src={m.url}
                              alt={m.label || post.listing?.title || 'Property photo'}
                              className="h-full w-full object-cover transition-transform hover:scale-105"
                            />
                            {i === 3 && post.media!.length > 4 && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                <span className="text-lg font-bold text-white">+{post.media!.length - 4}</span>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Listing preview card */}
                    {post.listing && (
                      <button
                        onClick={() => navigate('listing-detail', post.listing_id!)}
                        className="mt-3 block w-full rounded-xl border border-gray-200 p-4 text-left transition-colors hover:bg-gray-50 dark:border-brand-800 dark:hover:bg-brand-800/30"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-800/50">
                              <Home className="h-5 w-5 text-brand-600" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">{post.listing.title}</p>
                              <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <MapPin className="h-3 w-3" /> {post.listing.city}, {post.listing.county}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-brand-600 dark:text-brand-400">
                              {formatKES(post.listing.price_kes)}
                            </p>
                            <p className="text-xs text-gray-400">
                              {post.listing.listing_type === 'rent' ? 'per month' : 'for sale'}
                            </p>
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{post.content}</p>
                )}
              </div>

              {/* Actions */}
              <div className="mt-4 flex items-center gap-6 border-t border-gray-100 pt-3 dark:border-brand-800">
                <button className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-brand-600 dark:text-gray-400">
                  <ThumbsUp className="h-4 w-4" /> Like
                </button>
                <button className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-brand-600 dark:text-gray-400">
                  <MessageCircle className="h-4 w-4" /> Comment
                </button>
                <button className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-brand-600 dark:text-gray-400">
                  <Share2 className="h-4 w-4" /> Share
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
