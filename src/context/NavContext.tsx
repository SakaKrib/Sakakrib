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
  | 'pms-dashboard'
  | 'renter-invoices'
  | 'renter-payment'
  | 'mover-tracking'
  | 'renter-calendar'
  | 'notifications';

/* ============================================================
 * AUTH MODE
 * ============================================================ */

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
   * Listing currently being viewed.
   *
   * Used by:
   * #listing-detail/:id
   */
  selectedListingId: string | null;

  /**
   * Listing currently being managed.
   *
   * Used by:
   * #listing-manage/:id
   */
  selectedListingManageId: string | null;

  /**
   * Mover currently being viewed.
   *
   * Used by:
   * #mover-detail/:id
   */
  selectedMoverId: string | null;

  /**
   * Mover associated with the active chat.
   *
   * Used by:
   * #chat/:moverId
   */
  selectedChatMoverId: string | null;

  /**
   * Moving booking currently being viewed.
   *
   * Used by:
   * #mover-booking-detail/:bookingId
   */
  selectedMoverBookingId: string | null;

  /**
   * Navigate to an application view.
   *
   * Examples:
   *
   * navigate('home')
   * navigate('listings')
   * navigate('listing-detail', listing.id)
   * navigate('listing-manage', listing.id)
   * navigate('movers')
   * navigate('mover-detail', mover.id)
   * navigate('mover-booking-detail', booking.id)
   * navigate('chat', mover.id)
   */
  navigate: (
    view: AppView,
    id?: string
  ) => void;

  /* ----------------------------------------------------------
   * Authentication modal
   * ---------------------------------------------------------- */

  authModalOpen: boolean;

  setAuthModalOpen: (
    open: boolean
  ) => void;

  authMode: AuthMode;

  setAuthMode: Dispatch<
    SetStateAction<AuthMode>
  >;

  /* ----------------------------------------------------------
   * Role selection modal
   * ---------------------------------------------------------- */

  roleModalOpen: boolean;

  setRoleModalOpen: (
    open: boolean
  ) => void;

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
  'renter-invoices',
  'renter-payment',
  'mover-tracking',
  'renter-calendar',
  'notifications',
];

/* ============================================================
 * DETAIL VIEWS
 * ============================================================ */

const DETAIL_VIEWS: AppView[] = [
  'listing-detail',
  'listing-manage',
  'mover-detail',
  'mover-booking-detail',
  'chat',
];

/* ============================================================
 * PROVIDER
 * ============================================================ */

export function NavProvider({
  children,
}: {
  children: ReactNode;
}) {
  /* ==========================================================
   * NAVIGATION STATE
   * ========================================================== */

  const [view, setView] =
    useState<AppView>('home');

  const [
    selectedListingId,
    setSelectedListingId,
  ] = useState<string | null>(null);

  const [
    selectedListingManageId,
    setSelectedListingManageId,
  ] = useState<string | null>(null);

  const [
    selectedMoverId,
    setSelectedMoverId,
  ] = useState<string | null>(null);

  const [
    selectedChatMoverId,
    setSelectedChatMoverId,
  ] = useState<string | null>(null);

  const [
    selectedMoverBookingId,
    setSelectedMoverBookingId,
  ] = useState<string | null>(null);

  /* ==========================================================
   * AUTHENTICATION MODAL STATE
   * ========================================================== */

  const [
    authModalOpen,
    setAuthModalOpen,
  ] = useState(false);

  const [
    authMode,
    setAuthMode,
  ] = useState<AuthMode>('signin');

  /* ==========================================================
   * ROLE SELECTION MODAL STATE
   * ========================================================== */

  const [
    roleModalOpen,
    setRoleModalOpen,
  ] = useState(false);

  /* ==========================================================
   * DASHBOARD SIMULATOR STATE
   * ========================================================== */

  /**
   * This does NOT modify the user's real role.
   *
   * It only controls which dashboard UI is displayed
   * while an administrator is testing the application.
   *
   * null = use the real profile.role.
   */
  const [
    simulatorRole,
    setSimulatorRole,
  ] = useState<UserRole | null>(null);

  /* ==========================================================
   * CLEAR ENTITY SELECTIONS
   * ========================================================== */

  const clearSelections = () => {
    setSelectedListingId(null);
    setSelectedListingManageId(null);
    setSelectedMoverId(null);
    setSelectedChatMoverId(null);
    setSelectedMoverBookingId(null);
  };

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
        clearSelections();
        return;
      }

      /* --------------------------------------------------------
       * Split URL hash
       *
       * Examples:
       *
       * #listing-detail/123
       * #mover-detail/456
       * #mover-booking-detail/789
       * #chat/456
       *
       * Result:
       *
       * hashView = listing-detail
       * hashId   = 123
       * -------------------------------------------------------- */

      const [
        hashView,
        ...idParts
      ] = hash.split('/');

      const hashId =
        idParts.length > 0
          ? idParts.join('/')
          : undefined;

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
       * Update active view
       * -------------------------------------------------------- */

      setView(nextView);

      /* --------------------------------------------------------
       * Clear all previous selections
       * -------------------------------------------------------- */

      clearSelections();

      /* --------------------------------------------------------
       * Restore entity selection
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

        case 'mover-booking-detail':
          setSelectedMoverBookingId(
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
     * Read current URL immediately.
     *
     * This is important because it makes browser refresh
     * work correctly on detail pages.
     * -------------------------------------------------------- */

    handleHashChange();

    /* --------------------------------------------------------
     * Listen for browser back/forward hash navigation.
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
     * Update view
     * -------------------------------------------------------- */

    setView(newView);

    /* --------------------------------------------------------
     * Clear all entity selections first.
     *
     * This prevents stale IDs from being reused when moving
     * between unrelated pages.
     * -------------------------------------------------------- */

    clearSelections();

    /* --------------------------------------------------------
     * Store destination entity ID.
     * -------------------------------------------------------- */

    switch (newView) {
      case 'listing-detail':
        if (id) {
          setSelectedListingId(id);
        }
        break;

      case 'listing-manage':
        if (id) {
          setSelectedListingManageId(id);
        }
        break;

      case 'mover-detail':
        if (id) {
          setSelectedMoverId(id);
        }
        break;

      case 'mover-booking-detail':
        if (id) {
          setSelectedMoverBookingId(id);
        }
        break;

      case 'chat':
        if (id) {
          setSelectedChatMoverId(id);
        }
        break;

      default:
        break;
    }

    /* --------------------------------------------------------
     * Update browser URL hash.
     * -------------------------------------------------------- */

    const nextHash =
      id
        ? `${newView}/${encodeURIComponent(id)}`
        : newView;

    const currentHash =
      window.location.hash
        .replace(/^#/, '');

    if (
      currentHash !== nextHash
    ) {
      window.location.hash = nextHash;
    }

    /* --------------------------------------------------------
     * Scroll to top.
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
        /* ------------------------------------------------------
         * Navigation
         * ------------------------------------------------------ */

        view,

        selectedListingId,

        selectedListingManageId,

        selectedMoverId,

        selectedChatMoverId,

        selectedMoverBookingId,

        navigate,

        /* ------------------------------------------------------
         * Authentication
         * ------------------------------------------------------ */

        authModalOpen,

        setAuthModalOpen,

        authMode,

        setAuthMode,

        /* ------------------------------------------------------
         * Role selection
         * ------------------------------------------------------ */

        roleModalOpen,

        setRoleModalOpen,

        /* ------------------------------------------------------
         * Dashboard simulator
         * ------------------------------------------------------ */

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
  const ctx =
    useContext(NavContext);

  if (!ctx) {
    throw new Error(
      'useNav must be used within a NavProvider'
    );
  }

  return ctx;
}
