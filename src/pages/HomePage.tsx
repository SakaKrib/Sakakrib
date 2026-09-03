import { useState, useEffect } from 'react';
import { Home, Truck, Users, Search, MapPin, ShieldCheck, Star, ArrowRight, Building2, TrendingUp } from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { useAuth } from '@/context/AuthContext';
import { KENYAN_CITIES, formatKES, cn } from '@/lib/utils';
import type { Listing } from '@/types/domain';
import { protectedGet } from '@/lib/djangoLegacyApi';

export default function HomePage() {
  const { navigate, setAuthModalOpen, setRoleModalOpen } = useNav();
  const { profile, needsRoleSelection, loading, session } = useAuth();
  const [searchCity, setSearchCity] = useState('');
  const [searchType, setSearchType] = useState<'rent' | 'sale'>('rent');
  const [featured, setFeatured] = useState<Listing[]>([]);
  const [mediaMap, setMediaMap] = useState<Record<string, string>>({});
  const [stats, setStats] = useState({ listings: 0, landlords: 0, movers: 0, reviews: 0 });
  const [error, setError] = useState("");
  const isAdmin = profile?.is_admin === true || profile?.role === 'admin';

  useEffect(() => {
    let mounted = true;
    const fetchHomepageData = async () => {
      if (loading || !session) return;
      try {
        const [listings, landlords, movers, reviews] = await Promise.all([
          protectedGet<{ id: string }[]>('/rest/v1/listings?select=id&is_published=eq.true&is_approved=eq.true'),
          protectedGet<{ id: string }[]>('/rest/v1/profiles?select=id&role=eq.landlord&landlord_application_status=eq.approved'),
          protectedGet<{ id: string }[]>('/rest/v1/movers?select=id&approval_status=eq.approved&is_available=eq.true'),
          protectedGet<{ id: string }[]>('/rest/v1/reviews?select=id'),
        ]);
        if (!mounted) return;
        setStats({ listings: listings?.length ?? 0, landlords: landlords?.length ?? 0, movers: movers?.length ?? 0, reviews: reviews?.length ?? 0 });
      } catch (err) {
        if (mounted) console.error('Homepage stats:', err);
      }
    };
    void fetchHomepageData();
    return () => { mounted = false; };
  }, [session, loading]);

  useEffect(() => {
    let mounted = true;
    const fetchFeaturedListings = async () => {
      if (loading || !session) return;
      try {
        const listings = await protectedGet<Listing[]>('/rest/v1/listings?select=*&is_published=eq.true&is_approved=eq.true&order=created_at.desc&limit=12');
        if (!mounted) return;
        if (!listings || listings.length === 0) { setFeatured([]); setMediaMap({}); return; }
        setFeatured(listings);
        const ids = listings.map((listing) => listing.id);
        const media = await protectedGet<{ listing_id: string; url: string }[]>(`/rest/v1/listing_media?select=listing_id,url&listing_id=in.(${ids.join(',')})&media_type=eq.photo&order=position.asc`);
        if (!mounted) return;
        const map: Record<string, string> = {};
        media?.forEach((item) => { if (!map[item.listing_id]) map[item.listing_id] = item.url; });
        setMediaMap(map);
      } catch (err) {
        if (mounted) console.error('Featured listings:', err);
      }
    };
    void fetchFeaturedListings();
    return () => { mounted = false; };
  }, [session, loading]);

  const handleSearch = () => navigate('listings');

  return (
    <div>
      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-2 py-3 rounded relative" role="alert"><span className="block sm:inline">{error}</span></div>}
      <section className="border-b border-gray-200 bg-white dark:border-brand-800 dark:bg-brand-900">
        <div className="mx-auto max-w-7xl lg:px-2 py-4 p-1 lg:px-8 w-full">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h1 className="text-lg font-bold text-gray-900 dark:text-white sm:text-xl">Saka Krib <span className="font-normal text-gray-400">|</span> <span className="font-normal text-gray-500 dark:text-gray-400">Find Your Next Home, Effortlessly</span></h1></div>
            <div className="flex flex-row gap-2 sm:items-center">
              <div className="relative"><MapPin className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><select value={searchCity} onChange={(e) => setSearchCity(e.target.value)} className="h-9 rounded-full border border-gray-300 bg-gray-50 pl-8 pr-3 text-sm text-gray-700 dark:border-brand-700 dark:bg-brand-800 dark:text-gray-200"><option value="">All Cities</option>{KENYAN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <div className="flex gap-1">{(['rent', 'sale'] as const).map((t) => <button key={t} onClick={() => setSearchType(t)} className={cn('h-9 rounded-full border px-3 text-sm font-semibold transition-colors', searchType === t ? 'border-btnblue-500 bg-btnblue-500 text-white' : 'border-gray-300 bg-white text-gray-600 dark:border-brand-700 dark:bg-brand-800 dark:text-gray-400')}>{t === 'rent' ? 'Rent' : 'Buy'}</button>)}</div>
              <button onClick={handleSearch} className="btn-primary h-9 text-sm"><Search className="h-4 w-4" /> Search</button>
            </div>
          </div>
        </div>
      </section>
      <section className="border-b border-gray-200 bg-white dark:border-brand-800 dark:bg-brand-900"><div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8"><div className="flex gap-2 overflow-x-auto py-2.5">{[{ icon: Home, label: 'Browse Homes', view: 'listings' as const, color: 'text-btnblue-500' }, { icon: Truck, label: 'Find Movers', view: 'movers' as const, color: 'text-secondary-500' }, { icon: Building2, label: 'Post Listing', view: 'post-listing' as const, color: 'text-success-600' }, { icon: Users, label: 'Community', view: 'community' as const, color: 'text-primary-500' }].filter((item) => !isAdmin || item.view === 'listings').map((item, i) => <button key={i} onClick={() => { if (!profile) { setAuthModalOpen(true); return; } navigate(item.view); }} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-btnblue-400 hover:text-btnblue-600 dark:border-brand-700 dark:text-gray-400 dark:hover:border-btnblue-500 dark:hover:text-btnblue-400"><item.icon className={cn('h-4 w-4', item.color)} /> {item.label}</button>)}</div></div></section>
      <section className="mx-auto max-w-7xl px-2 py-4 sm:px-6 lg:px-8">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-gray-900 dark:text-white">Featured Listings</h2><button onClick={() => navigate('listings')} className="flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400">View All<ArrowRight className="h-3.5 w-3.5" /></button></div>
        {featured.length === 0 ? <div className="py-12 text-center"><Home className="mx-auto h-10 w-10 text-gray-300" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No listings yet. Be the first to post!</p></div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{featured.map((listing) => <button key={listing.id} onClick={() => navigate('listing-detail', listing.id)} className="card group overflow-hidden text-left transition-all hover:shadow-md"><div className="relative h-40 overflow-hidden bg-gray-200 dark:bg-brand-800">{mediaMap[listing.id] ? <img src={mediaMap[listing.id]} alt={listing.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" /> : <div className="flex h-full items-center justify-center"><Home className="h-10 w-10 text-gray-400" /></div>}<div className="absolute right-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">{listing.listing_type === 'rent' ? 'Rent' : 'Sale'}</div></div><div className="p-3"><h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{listing.title}</h3><p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><MapPin className="h-3 w-3" />{listing.city}, {listing.county}</p><p className="mt-1.5 text-base font-bold text-brand-600 dark:text-brand-400">{formatKES(listing.price_kes)}{listing.listing_type === 'rent' && <span className="text-xs font-normal text-gray-400">/mo</span>}</p><div className="mt-1.5 flex gap-2 text-xs text-gray-500 dark:text-gray-400"><span>{listing.beds} bed</span><span>{listing.baths} bath</span><span className="truncate">{listing.size}</span></div></div></button>)}</div>}
      </section>
      <section className="border-y border-gray-200 bg-white dark:border-brand-800 dark:bg-brand-900"><div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8"><div className="grid grid-cols-2 gap-4 py-6 sm:grid-cols-4">{[{ icon: Building2, label: 'Vendor Listings', value: stats.listings.toLocaleString() }, { icon: ShieldCheck, label: 'Verified Landlords', value: stats.landlords.toLocaleString() }, { icon: Truck, label: 'Professional Movers', value: stats.movers.toLocaleString() }, { icon: Star, label: 'User Reviews', value: stats.reviews.toLocaleString() }].map((stat, i) => <div key={i} className="text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50"><stat.icon className="h-5 w-5 text-brand-600 dark:text-brand-400" /></div><p className="mt-1.5 text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p><p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p></div>)}</div></div></section>
      {!isAdmin && <section className="mx-auto max-w-7xl px-2 py-8 lg:px-8"><h2 className="text-center text-xl font-bold text-gray-900 dark:text-white">How Saka Krib Works For You</h2><div className="mt-6 grid gap-4 sm:grid-cols-3">{[{ icon: Home, title: 'For Renters', desc: 'Browse verified homes, contact landlords, and book movers.', color: 'from-brand-500 to-brand-700', action: 'Browse Homes', view: 'listings' as const }, { icon: Building2, title: 'For Landlords', desc: 'Post your property and reach thousands of renters.', color: 'from-success-500 to-success-700', action: 'Post a Listing', view: 'post-listing' as const }, { icon: Truck, title: 'For Movers', desc: 'Register your vehicle and accept moving jobs nationwide.', color: 'from-accent-500 to-accent-700', action: 'Become a Mover', view: 'register-mover' as const }].map((card, i) => <div key={i} className="card group p-5 transition-all hover:shadow-lg"><div className={cn('flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md', card.color)}><card.icon className="h-6 w-6" /></div><h3 className="mt-3 text-base font-bold text-gray-900 dark:text-white">{card.title}</h3><p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{card.desc}</p><button onClick={() => { if (loading) return; if (!session || !profile) { setAuthModalOpen(true); return; } if (card.view === 'listings') { navigate('listings'); return; } if (card.view === 'register-mover' && profile.role === 'mover') { setError('You are already registered as a mover.'); return; } if (card.view === 'register-mover' && profile.role === 'landlord') { setError('Landlords cannot register as movers. Please select a different role to find movers.'); return; } if (card.view === 'register-mover' && profile.role === 'renter') { setRoleModalOpen(true); return; } if (card.view === 'post-listing' && profile.role === 'renter') { setRoleModalOpen(true); return; } if (card.view === 'post-listing' && (profile.role === 'landlord' || profile.role === 'real_estate')) { navigate('post-listing'); return; } if (card.view === 'post-listing' && profile.role === 'mover') { setError('Movers cannot post listings. Please select a different role to post a listing.'); return; } setRoleModalOpen(true); navigate('kyc-verify'); }} className="mt-3 flex items-center gap-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400">{card.action} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></button></div>)}</div></section>}
      {!isAdmin && <section className="mx-auto max-w-7xl px-2 pb-8 sm:px-6 lg:px-8"><div className="grid gap-4 sm:grid-cols-3">{[{ icon: ShieldCheck, title: 'Verified & Secure', desc: 'All landlords and movers undergo KYC verification.' }, { icon: TrendingUp, title: 'Free to Start', desc: '3 free listings for landlords. Browse free for renters.' }, { icon: Users, title: 'Community Feed', desc: 'LinkedIn-style feed with AI-generated captions.' }].map((item, i) => <div key={i} className="card p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50"><item.icon className="h-5 w-5 text-brand-600 dark:text-brand-400" /></div><h3 className="mt-3 text-base font-bold text-gray-900 dark:text-white">{item.title}</h3><p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{item.desc}</p></div>)}</div></section>}
    </div>
  );
}
