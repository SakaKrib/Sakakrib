import { createContext, useContext, useState, type ReactNode } from 'react';
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
  | 'profile';

interface NavContextValue {
  view: AppView;
  selectedListingId: string | null;
  selectedMoverId: string | null;
  selectedChatMoverId: string | null;
  navigate: (view: AppView, id?: string) => void;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  roleModalOpen: boolean;
  setRoleModalOpen: (open: boolean) => void;
  simulatorRole: UserRole | null;
  setSimulatorRole: (role: UserRole | null) => void;
}

const NavContext = createContext<NavContextValue | undefined>(undefined);

export function NavProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<AppView>('home');
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [selectedMoverId, setSelectedMoverId] = useState<string | null>(null);
  const [selectedChatMoverId, setSelectedChatMoverId] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [simulatorRole, setSimulatorRole] = useState<UserRole | null>(() => {
    try { return localStorage.getItem('saka_simulator_role') as UserRole | null; } catch { return null; }
  });

  // const handleSetSimulatorRole = (role: UserRole | null) => {
  //   setSimulatorRole(role);
  //   try {
  //     if (role) localStorage.setItem('saka_simulator_role', role);
  //     else localStorage.removeItem('saka_simulator_role');
  //   } catch { /* ignore */ }
  // };

  const handleSetSimulatorRole = (role: UserRole | null) => {
    setSimulatorRole(role);
    try {
      if (role) localStorage.setItem('saka_simulator_role', role);
      else localStorage.removeItem('saka_simulator_role');
    } catch { /* ignore */ }
  };

  const navigate = (newView: AppView, id?: string) => {
    setView(newView);
    if (id) {
      if (newView === 'listing-detail') setSelectedListingId(id);
      if (newView === 'mover-detail') setSelectedMoverId(id);
      if (newView === 'chat') setSelectedChatMoverId(id);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <NavContext.Provider
      value={{
        view,
        selectedListingId,
        selectedMoverId,
        selectedChatMoverId,
        navigate,
        authModalOpen,
        setAuthModalOpen,
        roleModalOpen,
        setRoleModalOpen,
        simulatorRole,
        setSimulatorRole: handleSetSimulatorRole,
      }}
    >
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within NavProvider');
  return ctx;
}
