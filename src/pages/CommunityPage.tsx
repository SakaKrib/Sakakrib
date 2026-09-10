import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, MapPin, Send, Sparkles, ThumbsUp, Users, X } from 'lucide-react';
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

export default function CommunityPage() {
  const { profile } = useAuth(); const { navigate } = useNav();
  const [posts, setPosts] = useState<Post[]>([]); const [text, setText] = useState(''); const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true); const [posting, setPosting] = useState(false); const [reacting, setReacting] = useState<string | null>(null); const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const canPost = ROLES.includes(String(profile?.role || '').toLowerCase());

  const load = async () => { setLoading(true); try { const r = await protectedGet<{items: Post[]}>('/api/core/community-posts/'); setPosts(r?.items || []); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load community.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);

  const selectFiles = (list: FileList | null) => { if (!list) return; const next = Array.from(list); if (files.length + next.length > MAX_IMAGES) return setError('A community post can have at most 4 images.'); if (next.some(f => !TYPES.includes(f.type) || f.size <= 0 || f.size > MAX_BYTES)) return setError('Only JPG, PNG, WEBP, and GIF images smaller than 8 MB are allowed.'); setError(''); setFiles(v => [...v, ...next]); };
  const createPost = async () => { if (!canPost || !text.trim() || posting) return; setPosting(true); setError(''); try { const r = await protectedPost<{post: Post}>('/api/core/community-posts/', {content:text.trim(), post_type:'manual'}); for (const file of files) { const form = new FormData(); form.append('file', file); await protectedUpload(`/api/core/community-posts/${r.post.id}/media/`, form); } setText(''); setFiles([]); if (input.current) input.current.value=''; await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create post.'); await load(); } finally { setPosting(false); } };
  const toggleLike = async (post: Post) => { if (!profile || String(post.user_id) === String(profile.id) || reacting) return; setReacting(post.id); try { const r = await protectedPost<{reaction_count:number;reaction_type:string|null}>(`/api/core/community-posts/${post.id}/reactions/`, {reaction_type:'like'}); setPosts(v => v.map(p => p.id===post.id ? {...p,reaction_count:r.reaction_count,user_reaction:r.reaction_type}:p)); } catch (e) { setError(e instanceof Error ? e.message : 'Failed to react.'); } finally { setReacting(null); } };

  return <div className="mx-auto max-w-2xl px-2 py-8 sm:px-6"><div className="mb-6"><h1 className="flex items-center gap-2 text-2xl font-bold"><Users className="h-6 w-6 text-brand-600"/> Community Feed</h1><p className="mt-1 text-sm text-gray-500">Renters, landlords, movers, and real-estate professionals can post and react.</p></div>
    {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    {canPost && <div className="card mb-6 p-4"><textarea value={text} onChange={e=>setText(e.target.value)} maxLength={10000} rows={3} className="input-field resize-none" placeholder="Share something with the community..."/><div className="mt-3 flex items-center justify-between"><div><input ref={input} type="file" multiple accept={TYPES.join(',')} className="hidden" onChange={e=>selectFiles(e.target.files)}/><button type="button" onClick={()=>input.current?.click()} disabled={files.length>=MAX_IMAGES||posting} className="flex items-center gap-2 text-sm text-gray-500"><ImagePlus className="h-4 w-4"/> Images {files.length}/{MAX_IMAGES}</button>{files.length>0&&<div className="mt-1 text-xs text-gray-400">{files.map((f,i)=><span key={`${f.name}-${i}`} className="mr-2">{f.name}<button type="button" onClick={()=>setFiles(v=>v.filter((_,n)=>n!==i))}><X className="ml-1 inline h-3 w-3"/></button></span>)}</div>}</div><button type="button" onClick={()=>void createPost()} disabled={!text.trim()||posting} className="btn-primary">{posting?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>} {posting?'Posting...':'Post'}</button></div></div>}
    {loading?<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-600"/></div>:<div className="space-y-4">{posts.map(post=>{const own=String(post.user_id)===String(profile?.id); const media=post.community_media || (post.post_type==='listing'?post.media:[]); return <article key={post.id} className="card p-5"><div className="text-sm"><b>{post.author?.full_name||'Anonymous'}</b><span className="ml-2 text-xs text-gray-400">· {timeAgo(post.created_at||'')}</span><div className="text-xs capitalize text-gray-400">{String(post.author?.role||'').replace('_',' ')}</div></div><div className="mt-3">{post.post_type==='listing'&&post.listing?<><p className="whitespace-pre-line text-sm">{post.ai_caption||post.content}</p>{post.ai_caption&&<p className="mt-1 flex gap-1 text-xs text-brand-500"><Sparkles className="h-3 w-3"/> Existing listing AI caption</p>}<button type="button" onClick={()=>navigate('listing-detail',post.listing_id!)} className="mt-3 w-full rounded-xl border p-3 text-left"><b>{post.listing.title}</b><p className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="h-3 w-3"/>{post.listing.city}, {post.listing.county}</p><b className="text-brand-600">{formatKES(post.listing.price_kes)}</b></button></>:<p className="whitespace-pre-line text-sm">{post.content}</p>}{media?.length&&<div className="mt-3 grid grid-cols-2 gap-1">{media.slice(0,4).map((m,i)=><img key={m.id||i} src={m.url} alt={m.label||'Community image'} className="h-40 w-full rounded-lg object-cover"/>)}</div>}</div><div className="mt-4 border-t pt-3"><button type="button" onClick={()=>void toggleLike(post)} disabled={own||reacting===post.id} className="flex items-center gap-2 text-sm text-gray-500 disabled:opacity-50"><ThumbsUp className="h-4 w-4"/>Like {post.reaction_count?`· ${post.reaction_count}`:''}</button></div></article>})}</div>}
  </div>;
}
