import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type { UserRole } from '@/lib/supabase';

export type AppView =
  | 'home'
  | 'listings'
  | 'listing-detail'
  | 'movers'
  | 'mover-detail'
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
  | 'subscription'
  | 'pms-dashboard';
    'details'
export type AuthMode = 'signin' | 'signup' | 'forgot';

interface NavContextValue {
  // --------------------------------------------------
  // Navigation
  // --------------------------------------------------

  view: AppView;

  selectedListingId: string | null;
  selectedMoverId: string | null;
  selectedChatMoverId: string | null;

  navigate: (view: AppView, id?: string) => void;

  // --------------------------------------------------
  // Authentication modal
  // --------------------------------------------------

  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;

  authMode: AuthMode;
  setAuthMode: Dispatch<SetStateAction<AuthMode>>;

  // --------------------------------------------------
  // Role selection modal
  // --------------------------------------------------

  roleModalOpen: boolean;
  setRoleModalOpen: (open: boolean) => void;

  // --------------------------------------------------
  // Dashboard simulator
  // --------------------------------------------------

  simulatorRole: UserRole | null;
  setSimulatorRole: Dispatch<SetStateAction<UserRole | null>>;
}

const NavContext = createContext<NavContextValue | undefined>(
  undefined
);

export function NavProvider({
  children,
}: {
  children: ReactNode;
}) {
  // --------------------------------------------------
  // Navigation state
  // --------------------------------------------------

  const [view, setView] = useState<AppView>('home');

  const [selectedListingId, setSelectedListingId] =
    useState<string | null>(null);

  const [selectedMoverId, setSelectedMoverId] =
    useState<string | null>(null);

  const [selectedChatMoverId, setSelectedChatMoverId] =
    useState<string | null>(null);

  // --------------------------------------------------
  // Authentication modal state
  // --------------------------------------------------

  const [authModalOpen, setAuthModalOpen] =
    useState(false);

  const [authMode, setAuthMode] =
    useState<AuthMode>('signin');

  // --------------------------------------------------
  // Role selection modal state
  // --------------------------------------------------

  const [roleModalOpen, setRoleModalOpen] =
    useState(false);

  // --------------------------------------------------
  // Dashboard simulator state
  // --------------------------------------------------

  /*
   * This does NOT change the user's actual role
   * in Supabase.
   *
   * It only controls which dashboard UI is displayed
   * while the admin is testing the application.
   *
   * null = use the real profile.role
   */
  const [simulatorRole, setSimulatorRole] =
    useState<UserRole | null>(null);

  // --------------------------------------------------
  // Navigation
  // --------------------------------------------------

  const navigate = (newView: AppView, id?: string) => {
    setView(newView);

    // Clear previous listing selection
    if (newView !== 'listing-detail') {
      setSelectedListingId(null);
    }

    // Clear previous mover selection
    if (newView !== 'mover-detail') {
      setSelectedMoverId(null);
    }

    // Clear previous chat selection
    if (newView !== 'chat') {
      setSelectedChatMoverId(null);
    }

    // Store relevant destination ID
    if (id) {
      if (newView === 'listing-detail') {
        setSelectedListingId(id);
      }

      if (newView === 'mover-detail') {
        setSelectedMoverId(id);
      }

      if (newView === 'chat') {
        setSelectedChatMoverId(id);
      }
    }

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <NavContext.Provider
      value={{
        // Navigation
        view,
        selectedListingId,
        selectedMoverId,
        selectedChatMoverId,
        navigate,

        // Authentication
        authModalOpen,
        setAuthModalOpen,
        authMode,
        setAuthMode,

        // Role modal
        roleModalOpen,
        setRoleModalOpen,

        // Dashboard simulator
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
    throw new Error(
      'useNav must be used within a NavProvider'
    );
  }

  return ctx;
}