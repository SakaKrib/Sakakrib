import { Home, Truck, Users, Menu, Moon, Sun, LogOut, User, LayoutDashboard, Building2, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { cn } from '@/lib/utils';

export default function Header() {
  const { theme, toggleTheme } = useTheme();
  const { profile, signOut } = useAuth();
  const { navigate, view, setAuthModalOpen, setAuthMode } = useNav();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [professionalsOpen, setProfessionalsOpen] = useState(false);
  const isAdmin = profile?.is_admin === true || profile?.role === 'admin';
  const navItems = [
    { label: 'Home', view: 'home' as const, icon: Home },
    { label: 'Browse Homes', view: 'listings' as const, icon: Home },
    { label: 'Movers', view: 'movers' as const, icon: Truck },
    { label: 'Community', view: 'community' as const, icon: Users },
  ];
  const professionalItems = [
    { label: 'Become a Mover', view: 'register-mover' as const, icon: Truck },
    { label: 'Become a Landlord / Real Estate Owner', view: 'register-landlord' as const, icon: Building2 },
  ];
  const goTo = (destination: typeof professionalItems[number]['view']) => { navigate(destination); setProfessionalsOpen(false); setMobileMenuOpen(false); };

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-md dark:border-brand-800 dark:bg-brand-950/95">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <button onClick={() => navigate('home')} className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-md"><Home className="h-5 w-5" /></div>
            <div className="text-left"><span className="block text-lg font-bold leading-tight text-gray-900 dark:text-white">Saka Krib</span><span className="hidden text-[10px] font-medium leading-tight text-gray-500 dark:text-gray-400 sm:block">Find Your Next Home, Effortlessly</span></div>
          </button>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => <button key={item.view} onClick={() => navigate(item.view)} className={cn('rounded-full border px-4 py-2 text-sm font-medium transition-colors', view === item.view ? 'border-btnblue-500 bg-btnblue-50 text-btnblue-700 dark:border-btnblue-400 dark:bg-btnblue-900/30 dark:text-btnblue-300' : 'border-gray-300 text-gray-600 hover:border-btnblue-400 hover:text-btnblue-600 dark:border-brand-700 dark:text-gray-300 dark:hover:border-btnblue-500 dark:hover:text-btnblue-400')}>{item.label}</button>)}
            {profile?.role === 'renter' && !isAdmin && ( <><div className="relative">
              <button onClick={() => setProfessionalsOpen((open) => !open)} className="flex items-center gap-1 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-btnblue-400 hover:text-btnblue-600 dark:border-brand-700 dark:text-gray-300"><Building2 className="h-4 w-4" /> Professionals <ChevronDown className="h-4 w-4" /></button>
              {professionalsOpen &&  (<div className="absolute right-0 top-12 z-50 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-xl dark:border-brand-800 dark:bg-brand-900">{professionalItems.map((item) => <button key={item.view} onClick={() => goTo(item.view)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-brand-600 dark:text-gray-200 dark:hover:bg-brand-800"><item.icon className="h-4 w-4" />{item.label}</button>)}</div>)}
            </div></>)}
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="rounded-full border border-gray-300 p-2 text-gray-600 hover:border-btnblue-400 hover:text-btnblue-600 dark:border-brand-700 dark:text-gray-300" aria-label="Toggle theme">{theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}</button>
            {profile ? <div className="hidden items-center gap-2 md:flex"><button onClick={() => navigate('profile')} className="flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 dark:border-brand-700 dark:text-gray-200"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">{profile.full_name?.charAt(0).toUpperCase() || 'U'}</div><span className="max-w-[100px] truncate">{profile.full_name || 'User'}</span></button><button onClick={() => navigate('dashboard')} className="rounded-full border border-gray-300 p-2 text-gray-600 dark:border-brand-700 dark:text-gray-300" aria-label="Dashboard"><LayoutDashboard className="h-5 w-5" /></button><button onClick={signOut} className="rounded-full border border-gray-300 p-2 text-gray-600 dark:border-brand-700 dark:text-gray-300" aria-label="Sign out"><LogOut className="h-5 w-5" /></button></div> : <div className="hidden items-center gap-2 md:flex"><button onClick={() => {setAuthMode('signin'); setAuthModalOpen(true)}} className="btn-ghost">Sign In</button><button onClick={() => {setAuthMode('signup'); setAuthModalOpen(true);}} className="btn-primary">Get Started</button></div>}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="rounded-full border border-gray-300 p-2 text-gray-600 dark:border-brand-700 dark:text-gray-300 md:hidden" aria-label="Menu"><Menu className="h-5 w-5" /></button>
          </div>
        </div>
        {mobileMenuOpen && <div className="border-t border-gray-200 py-3 dark:border-brand-800 md:hidden"><nav className="flex flex-col gap-1">{navItems.map((item) => <button key={item.view} onClick={() => { navigate(item.view); setMobileMenuOpen(false); }} className="flex items-center gap-3 rounded-full border border-gray-300 px-4 py-2.5 text-left text-sm font-medium text-gray-600 dark:border-brand-700 dark:text-gray-300"><item.icon className="h-4 w-4" />{item.label}</button>)} {profile?.role === 'renter' && !isAdmin && ( <><p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Professionals</p>{professionalItems.map((item) => (<button key={item.view} onClick={() => goTo(item.view)} className="flex items-center gap-3 rounded-full border border-gray-300 px-4 py-2.5 text-left text-sm font-medium text-gray-600 dark:border-brand-700 dark:text-gray-300"><item.icon className="h-4 w-4" />{item.label}</button>))} </>)}</nav><nav className="flex flex-row w-fit gap-2 mt-10">{profile ? <><button onClick={() => { navigate('profile'); setMobileMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-full border border-gray-300 px-4 py-2.5 text-left text-sm font-medium text-gray-600 dark:border-brand-700 dark:text-gray-300"><User className="h-4 w-4" /> Profile</button><button onClick={() => { navigate('dashboard'); setMobileMenuOpen(false); }} className="flex items-center gap-3 rounded-full border border-gray-300 px-4 py-2.5 text-left text-sm font-medium text-gray-600 dark:border-brand-700 dark:text-gray-300"><LayoutDashboard className="h-4 w-4" /> Dashboard</button><button onClick={() => { signOut(); setMobileMenuOpen(false); }} className="flex items-center gap-3 rounded-full border border-primary-300 px-4 py-2.5 text-left text-sm font-medium text-primary-600"><LogOut className="h-4 w-4" /> Sign Out</button></> : <button onClick={() => { setAuthModalOpen(true); setMobileMenuOpen(false); }} className="btn-primary mt-2">Sign In / Get Started</button>}</nav></div>}
      </div>
    </header>
  );
}
