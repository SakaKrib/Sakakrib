import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type { UserRole } from '@/lib/supabase';

/* ============================================================
 * APP VIEWS
 * ============================================================ */

export type AppView =
  | 'home'
  | 'listings'
  | 'listing-detail'
  | 'listing-manage'
  | 'movers'
  | 'mover-detail'
  | 'mover-booking-detail'
  | 'chat'
  | 'community'
  | 'post-listing'
  | 'register-mover'
  | 'register-landlord'
  | 'kyc-verify'
  | 'dashboard'
  | 'my-bookings'
  | 'my-listings'
  | 'profile'
  | 'subscription-plans'
  | 'pms-dashboard';

export type AuthMode =
  | 'signin'
  | 'signup'
  | 'forgot';

/* ============================================================
 * NAVIGATION CONTEXT TYPE
 * ============================================================ */

interface NavContextValue {
  view: AppView;
  selectedListingId: string | null;
  selectedListingManageId: string | null;
  selectedMoverId: string | null;
  selectedMoverBookingId: string | null;
  selectedChatMoverId: string | null;

  navigate: (view: AppView, id?: string) => void;

  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;

  authMode: AuthMode;
  setAuthMode: Dispatch<SetStateAction<AuthMode>>;

  roleModalOpen: boolean;
  setRoleModalOpen: (open: boolean) => void;

  simulatorRole: UserRole | null;
  setSimulatorRole: Dispatch<SetStateAction<UserRole | null>>;
}

const NavContext = createContext<NavContextValue | undefined>(undefined);

const VALID_APP_VIEWS: AppView[] = [
  'home',
  'listings',
  'listing-detail',
  'listing-manage',
  'movers',
  'mover-detail',
  'mover-booking-detail',
  'chat',
  'community',
  'post-listing',
  'register-mover',
  'register-landlord',
  'kyc-verify',
  'dashboard',
  'my-bookings',
  'my-listings',
  'profile',
  'subscription-plans',
  'pms-dashboard',
];

export function NavProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<AppView>('home');
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [selectedListingManageId, setSelectedListingManageId] = useState<string | null>(null);
  const [selectedMoverId, setSelectedMoverId] = useState<string | null>(null);
  const [selectedMoverBookingId, setSelectedMoverBookingId] = useState<string | null>(null);
  const [selectedChatMoverId, setSelectedChatMoverId] = useState<string | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [simulatorRole, setSimulatorRole] = useState<UserRole | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#/, '').trim();

      if (!hash) {
        setView('home');
        setSelectedListingId(null);
        setSelectedListingManageId(null);
        setSelectedMoverId(null);
        setSelectedMoverBookingId(null);
        setSelectedChatMoverId(null);
        return;
      }

      const [hashView, hashId] = hash.split('/');

      if (!VALID_APP_VIEWS.includes(hashView as AppView)) return;

      const nextView = hashView as AppView;
      setView(nextView);

      setSelectedListingId(null);
      setSelectedListingManageId(null);
      setSelectedMoverId(null);
      setSelectedMoverBookingId(null);
      setSelectedChatMoverId(null);

      switch (nextView) {
        case 'listing-detail':
          setSelectedListingId(hashId ?? null);
          break;
        case 'listing-manage':
          setSelectedListingManageId(hashId ?? null);
          break;
        case 'mover-detail':
          setSelectedMoverId(hashId ?? null);
          break;
        case 'mover-booking-detail':
          setSelectedMoverBookingId(hashId ?? null);
          break;
        case 'chat':
          setSelectedChatMoverId(hashId ?? null);
          break;
        default:
          break;
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (newView: AppView, id?: string) => {
    setView(newView);

    if (newView !== 'listing-detail') setSelectedListingId(null);
    if (newView !== 'listing-manage') setSelectedListingManageId(null);
    if (newView !== 'mover-detail') setSelectedMoverId(null);
    if (newView !== 'mover-booking-detail') setSelectedMoverBookingId(null);
    if (newView !== 'chat') setSelectedChatMoverId(null);

    if (id) {
      switch (newView) {
        case 'listing-detail':
          setSelectedListingId(id);
          break;
        case 'listing-manage':
          setSelectedListingManageId(id);
          break;
        case 'mover-detail':
          setSelectedMoverId(id);
          break;
        case 'mover-booking-detail':
          setSelectedMoverBookingId(id);
          break;
        case 'chat':
          setSelectedChatMoverId(id);
          break;
        default:
          break;
      }
    }

    const nextHash = id ? `${newView}/${id}` : newView;

    if (window.location.hash.replace(/^#/, '') !== nextHash) {
      window.location.hash = nextHash;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <NavContext.Provider
      value={{
        view,
        selectedListingId,
        selectedListingManageId,
        selectedMoverId,
        selectedMoverBookingId,
        selectedChatMoverId,
        navigate,
        authModalOpen,
        setAuthModalOpen,
        authMode,
        setAuthMode,
        roleModalOpen,
        setRoleModalOpen,
        simulatorRole,
        setSimulatorRole,
      }}
    >
      {children}
    </NavContext.Provider>
  );
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);

  if (!ctx) {
    throw new Error('useNav must be used within a NavProvider');
  }

  return ctx;
}
