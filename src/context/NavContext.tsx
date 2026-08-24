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
  /* ----------------------------------------------------------
   * Navigation
   * ---------------------------------------------------------- */

  view: AppView;

  /**
   * ID of the listing currently being viewed
   * on the listing-detail page.
   */
  selectedListingId: string | null;

  /**
   * ID of the listing currently being managed
   * on the listing-manage page.
   */
  selectedListingManageId: string | null;

  /**
   * ID of the mover currently being viewed
   * on the mover-detail page.
   */
  selectedMoverId: string | null;

  /**
   * ID of the mover currently associated with
   * the active chat.
   */
  selectedChatMoverId: string | null;

  /**
   * Navigate to an application view.
   *
   * For detail/manage pages, pass the entity ID:
   *
   * navigate('listing-detail', listing.id)
   * navigate('listing-manage', listing.id)
   * navigate('mover-detail', mover.id)
   * navigate('chat', mover.id)
   */
  navigate: (view: AppView, id?: string) => void;

  /* ----------------------------------------------------------
   * Authentication modal
   * ---------------------------------------------------------- */

  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;

  authMode: AuthMode;
  setAuthMode: Dispatch<SetStateAction<AuthMode>>;

  /* ----------------------------------------------------------
   * Role selection modal
   * ---------------------------------------------------------- */

  roleModalOpen: boolean;
  setRoleModalOpen: (open: boolean) => void;

  /* ----------------------------------------------------------
   * Dashboard simulator
   * ---------------------------------------------------------- */

  simulatorRole: UserRole | null;
  setSimulatorRole: Dispatch<
    SetStateAction<UserRole | null>
  >;
}

/* ============================================================
 * CONTEXT
 * ============================================================ */

const NavContext = createContext<
  NavContextValue | undefined
>(undefined);

/* ============================================================
 * VALID APP VIEWS
 * ============================================================ */

const VALID_APP_VIEWS: AppView[] = [
  'home',
  'listings',
  'listing-detail',
  'listing-manage',
  'movers',
  'mover-detail',
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

/* ============================================================
 * PROVIDER
 * ============================================================ */

export function NavProvider({
  children,
}: {
  children: ReactNode;
}) {
  /* ----------------------------------------------------------
   * Navigation state
   * ---------------------------------------------------------- */

  const [view, setView] =
    useState<AppView>('home');

  const [selectedListingId, setSelectedListingId] =
    useState<string | null>(null);

  const [selectedListingManageId, setSelectedListingManageId] =
    useState<string | null>(null);

  const [selectedMoverId, setSelectedMoverId] =
    useState<string | null>(null);

  const [selectedChatMoverId, setSelectedChatMoverId] =
    useState<string | null>(null);

  /* ----------------------------------------------------------
   * Authentication modal state
   * ---------------------------------------------------------- */

  const [authModalOpen, setAuthModalOpen] =
    useState(false);

  const [authMode, setAuthMode] =
    useState<AuthMode>('signin');

  /* ----------------------------------------------------------
   * Role selection modal state
   * ---------------------------------------------------------- */

  const [roleModalOpen, setRoleModalOpen] =
    useState(false);

  /* ----------------------------------------------------------
   * Dashboard simulator state
   * ---------------------------------------------------------- */

  /**
   * This does NOT change the user's actual role
   * in Supabase.
   *
   * It only controls which dashboard UI is displayed
   * while an admin is testing the application.
   *
   * null = use the real profile.role
   */
  const [simulatorRole, setSimulatorRole] =
    useState<UserRole | null>(null);

  /* ==========================================================
   * READ URL HASH
   * ========================================================== */

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash
        .replace(/^#/, '')
        .trim();

      /* --------------------------------------------------------
       * No hash = home
       * -------------------------------------------------------- */

      if (!hash) {
        setView('home');
        setSelectedListingId(null);
        setSelectedListingManageId(null);
        setSelectedMoverId(null);
        setSelectedChatMoverId(null);
        return;
      }

      /* --------------------------------------------------------
       * Split:
       *
       * #listing-manage/123
       *
       * becomes:
       *
       * hashView = listing-manage
       * hashId   = 123
       * -------------------------------------------------------- */

      const [hashView, hashId] =
        hash.split('/');

      /* --------------------------------------------------------
       * Validate view
       * -------------------------------------------------------- */

      if (
        !VALID_APP_VIEWS.includes(
          hashView as AppView
        )
      ) {
        return;
      }

      const nextView =
        hashView as AppView;

      /* --------------------------------------------------------
       * Set active view
       * -------------------------------------------------------- */

      setView(nextView);

      /* --------------------------------------------------------
       * Reset all entity selections first
       * -------------------------------------------------------- */

      setSelectedListingId(null);
      setSelectedListingManageId(null);
      setSelectedMoverId(null);
      setSelectedChatMoverId(null);

      /* --------------------------------------------------------
       * Restore entity ID for detail/manage pages
       * -------------------------------------------------------- */

      switch (nextView) {
        case 'listing-detail':
          setSelectedListingId(
            hashId ?? null
          );
          break;

        case 'listing-manage':
          setSelectedListingManageId(
            hashId ?? null
          );
          break;

        case 'mover-detail':
          setSelectedMoverId(
            hashId ?? null
          );
          break;

        case 'chat':
          setSelectedChatMoverId(
            hashId ?? null
          );
          break;

        default:
          break;
      }
    };

    /* --------------------------------------------------------
     * Read the current URL immediately on mount.
     * This is what makes browser refresh work.
     * -------------------------------------------------------- */

    handleHashChange();

    /* --------------------------------------------------------
     * Listen for browser hash navigation.
     * -------------------------------------------------------- */

    window.addEventListener(
      'hashchange',
      handleHashChange
    );

    return () => {
      window.removeEventListener(
        'hashchange',
        handleHashChange
      );
    };
  }, []);

  /* ==========================================================
   * NAVIGATION
   * ========================================================== */

  const navigate = (
    newView: AppView,
    id?: string
  ) => {
    /* --------------------------------------------------------
     * Set destination
     * -------------------------------------------------------- */

    setView(newView);

    /* --------------------------------------------------------
     * Clear listing-detail selection when leaving
     * listing-detail.
     * -------------------------------------------------------- */

    if (newView !== 'listing-detail') {
      setSelectedListingId(null);
    }

    /* --------------------------------------------------------
     * Clear listing-manage selection when leaving
     * listing-manage.
     * -------------------------------------------------------- */

    if (newView !== 'listing-manage') {
      setSelectedListingManageId(null);
    }

    /* --------------------------------------------------------
     * Clear mover selection when leaving
     * mover-detail.
     * -------------------------------------------------------- */

    if (newView !== 'mover-detail') {
      setSelectedMoverId(null);
    }

    /* --------------------------------------------------------
     * Clear chat mover selection when leaving chat.
     * -------------------------------------------------------- */

    if (newView !== 'chat') {
      setSelectedChatMoverId(null);
    }

    /* --------------------------------------------------------
     * Store destination ID
     * -------------------------------------------------------- */

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

        case 'chat':
          setSelectedChatMoverId(id);
          break;

        default:
          break;
      }
    }

    /* --------------------------------------------------------
     * Update browser URL hash
     *
     * Examples:
     *
     * #home
     * #listings
     * #listing-detail/123
     * #listing-manage/123
     * #mover-detail/123
     * #chat/123
     * -------------------------------------------------------- */

    const nextHash = id
      ? `${newView}/${id}`
      : newView;

    if (
      window.location.hash.replace(/^#/, '') !==
      nextHash
    ) {
      window.location.hash = nextHash;
    }

    /* --------------------------------------------------------
     * Scroll to top whenever navigation occurs.
     * -------------------------------------------------------- */

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  /* ==========================================================
   * PROVIDER
   * ========================================================== */

  return (
    <NavContext.Provider
      value={{
        /* Navigation */
        view,
        selectedListingId,
        selectedListingManageId,
        selectedMoverId,
        selectedChatMoverId,
        navigate,

        /* Authentication */
        authModalOpen,
        setAuthModalOpen,
        authMode,
        setAuthMode,

        /* Role selection */
        roleModalOpen,
        setRoleModalOpen,

        /* Dashboard simulator */
        simulatorRole,
        setSimulatorRole,
        
      }}
    >
      {children}
    </NavContext.Provider>
  );
}

/* ============================================================
 * HOOK
 * ============================================================ */

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);

  if (!ctx) {
    throw new Error(
      'useNav must be used within a NavProvider'
    );
  }

  return ctx;
}