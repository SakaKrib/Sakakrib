import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { getDjangoApiBaseUrl } from '@/lib/djangoApi';
import { initializePushNotifications, installPushNotificationActionListener } from '@/lib/pushNotifications';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { NavProvider, useNav } from '@/context/NavContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomBar from '@/components/BottomBar';
import SecurityBanner from '@/components/SecurityBanner';
import AuthModal from '@/components/AuthModal';
import SplashScreen from '@/components/SplashScreen';
import BackButtonHandler from '@/components/BackButtonHandler';
import LiveJourneyNotification from '@/components/LiveJourneyNotification';
import NotificationPermissionPrompt from '@/components/NotificationPermissionPrompt';
import RoleSelectionModal from '@/components/RoleSelectionModal';
import MovingGpsTracker from '@/components/MovingGpsTracker';
import LiveMovingMap from '@/components/LiveMovingMap';
import RenterBookingChatRedirector from '@/components/RenterBookingChatRedirector';
import HomePage from '@/pages/HomePage';
import ListingsPage from '@/pages/ListingsPage';
import ListingDetailPage from '@/pages/ListingDetailPage';
import MoversPage from '@/pages/MoversPage';
import MoverDetailPage from '@/pages/MoverDetailPage';
import MoverBookingDetail from '@/pages/Movers/MoverBookingDetail';
import MoverLiveTracking from '@/pages/Movers/MoverLiveTracking';
import MoverTrackingPage from '@/components/RentersComponentPage/MoverTrackingPage';
import ChatPage from '@/pages/ChatPage';
import CommunityPage from '@/pages/CommunityPage';
import PostListingPage from '@/pages/PostListingPageV2';
import RegisterLandlordPage from '@/pages/RegisterLandlordPage';
import KycVerifyPage from '@/pages/KycVerifyPage';
import RoleDashboardRouter from '@/Dashboards/RoleDashboardRouter';
import DashboardPage from '@/Dashboards/DashboardPage';
import AdminUserDetailsRoute from '@/pages/AdminUserDetailsRoute';
import AdminCreateListingPage from '@/pages/AdminCreateListingPage';
import ProfilePage from '@/pages/ProfilePage';
import ListingManagePage from './pages/ListingManagePage';
import PMSSubscriptionPage from './components/PMS/PMSSubscriptionPageWithHistory';
import RegisterMoverPage from './pages/RegisterMoverPage';
import MoverCalendarPage from './pages/Movers/MoverCalendarPage';
import MoverBookingRequestsPage from './pages/Movers/MoverBookingRequestsPage';
import MoverUpcomingJobsPage from './pages/Movers/MoverUpcomingJobsPage';
import MoverCustomers from './pages/Movers/MoverCustomers';
import MoverInvoices from './pages/Movers/MoverInvoices';
import MoverEarnings from './pages/Movers/MoverEarnings';
import MoverNotifications from './pages/Movers/MoverNotifications';
import MoverMessages from './pages/Movers/MoverMessages';
import MovingFinancialRecordsPage from './pages/MovingFinancialRecordsPage';
import MovingTransactionTimelinePage from './pages/MovingTransactionTimelinePage';
import PayPalSubscriptionReturnPage from './pages/PayPalSubscriptionReturnPage';
import PayPalSubscriptionCancelPage from './pages/PayPalSubscriptionCancelPage';
import ListingPaymentReturnPage from './pages/ListingPaymentReturnPage';
import { RenterInvoicesPage, RenterMovingHistoryPage } from '@/pages/RenterPages';
import RenterCalendarPage from '@/components/RentersComponentPage/RenterCalendarPage';
import RenterPaymentPage from '@/components/RentersComponentPage/RenterPaymentPage';
import RenterActivitiesPage from '@/pages/Renters/RenterActivitiesPage';
import RenterChatPerformancePage from '@/pages/Renters/RenterChatPerformancePage';
import RenterMessagesPage from '@/pages/Renters/RenterMessagesPage';
import RenterNotificationsPage from '@/pages/Renters/RenterNotificationsPage';

function AppContent() {
  const { view, selectedAdminUserId, authModalOpen, setAuthModalOpen, setAuthMode } = useNav();
  const { profile, loading: authLoading } = useAuth();

  // Handle HTTPS App Links / Universal Links when the OS opens Saka Krib from a payment return.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    let didRoute = false;
    let removeListener: (() => void) | undefined;

    const handleIncomingUrl = (url: string) => {
      if (didRoute) return;

      try {
        const incoming = new URL(url);
        const configuredApiOrigin = new URL(getDjangoApiBaseUrl()).origin;
        const allowedPaths = new Set([
          '/paypal/subscription/return',
          '/paypal/subscription/cancel',
          '/listing/payment/return',
        ]);

        if (
          incoming.protocol !== 'https:' ||
          incoming.origin !== configuredApiOrigin ||
          !allowedPaths.has(incoming.pathname)
        ) {
          return;
        }

        didRoute = true;
        // Close the PayPal Custom Tab after Android has delivered the verified
        // App Link, then resume the existing in-app payment return route.
        void Browser.close().catch(() => {});
        window.location.assign(
          `${window.location.origin}${incoming.pathname}${incoming.search}`,
        );
      } catch (error) {
        console.warn('Unable to handle native payment return link:', error);
      }
    };

    void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      handleIncomingUrl(url);
    }).then((listener) => {
      if (disposed) {
        void listener.remove();
      } else {
        removeListener = () => { void listener.remove(); };
      }
    }).catch((error) => {
      console.warn('Unable to register native app-link listener:', error);
    });

    // Also handle a payment link that launched the app from a fully closed state.
    void CapacitorApp.getLaunchUrl().then((launch) => {
      if (launch?.url) handleIncomingUrl(launch.url);
    }).catch((error) => {
      console.warn('Unable to read the native app launch URL:', error);
    });

    return () => {
      disposed = true;
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let removeActionListener = () => {};

    void installPushNotificationActionListener()
      .then((cleanup) => {
        if (cancelled) cleanup();
        else removeActionListener = cleanup;
      })
      .catch((error) => {
        console.warn('Unable to attach push notification tap listener:', error);
      });

    return () => {
      cancelled = true;
      removeActionListener();
    };
  }, []);

  useEffect(() => {
    if (authLoading || !profile?.id) return;
    let cancelled = false;
    let removeListeners = () => {};

    void initializePushNotifications()
      .then((cleanup) => {
        if (cancelled) cleanup();
        else removeListeners = cleanup;
      })
      .catch((error) => {
        console.warn('Native push notifications are unavailable:', error);
      });

    return () => {
      cancelled = true;
      removeListeners();
    };
  }, [profile?.id, authLoading]);


  useEffect(() => {
    if (view === 'mover-messages' && !authLoading && !profile && !authModalOpen) {
      setAuthMode('signin');
      setAuthModalOpen(true);
    }
  }, [view, authLoading, profile, authModalOpen, setAuthMode, setAuthModalOpen]);

  // Payment return paths are entry points only. Once a return-page action
  // navigates to another app view, let the normal hash-based router take over.
  const isPaymentReturnEntry = view === 'home' && !window.location.hash;
  if (isPaymentReturnEntry && window.location.pathname === '/paypal/subscription/return') return <PayPalSubscriptionReturnPage />;
  if (isPaymentReturnEntry && window.location.pathname === '/paypal/subscription/cancel') return <PayPalSubscriptionCancelPage />;
  if (isPaymentReturnEntry && window.location.pathname === '/listing/payment/return') return <ListingPaymentReturnPage />;

  const renderView = () => {
    switch (view) {
      case 'home': return <HomePage />;
      case 'listings': return <ListingsPage />;
      case 'listing-detail': return <ListingDetailPage />;
      case 'listing-manage': return <ListingManagePage />;
      case 'movers': return <MoversPage />;
      case 'mover-detail': return <MoverDetailPage />;
      case 'mover-booking-detail': return <MoverBookingDetail />;
      case 'mover-tracking': return profile?.role === 'mover' ? <MoverLiveTracking /> : <MoverTrackingPage />;
      case 'live-mover-map': return <LiveMovingMap />;
      case 'mover-calendar': return <MoverCalendarPage />;
      case 'mover-booking-requests': return <MoverBookingRequestsPage />;
      case 'mover-upcoming-jobs': return <MoverUpcomingJobsPage />;
      case 'mover-customers': return <MoverCustomers />;
      case 'mover-invoices': return <MoverInvoices />;
      case 'mover-earnings': return <MoverEarnings />;
      case 'mover-notifications': return <MoverNotifications />;
      case 'mover-messages': return <MoverMessages />;
      case 'moving-financial-records': return <MovingFinancialRecordsPage />;
      case 'moving-transaction-timeline': return <MovingTransactionTimelinePage />;
      case 'renter-invoices': return <RenterInvoicesPage />;
      case 'renter-payment': return <RenterPaymentPage />;
      case 'renter-moving-history': return <RenterMovingHistoryPage />;
      case 'renter-calendar': return <RenterCalendarPage />;
      case 'renter-activities': return <RenterActivitiesPage />;
      case 'renter-chat-performance': return <RenterChatPerformancePage />;
      case 'renter-messages': return <RenterMessagesPage />;
      case 'renter-notifications': return <RenterNotificationsPage />;
      case 'chat': return <ChatPage />;
      case 'community': return <CommunityPage />;
      case 'post-listing': return <PostListingPage />;
      case 'register-mover': return <RegisterMoverPage />;
      case 'register-landlord': return <RegisterLandlordPage />;
      case 'kyc-verify': return <KycVerifyPage />;
      case 'admin-user-details': return (profile?.is_superuser === true || profile?.is_admin === true) ? (selectedAdminUserId ? <AdminUserDetailsRoute userId={selectedAdminUserId} onBack={() => window.history.back()} /> : <DashboardPage />) : <DashboardPage />;
      case 'admin-create-listing': return (profile?.is_superuser === true || profile?.is_admin === true) ? <AdminCreateListingPage /> : <DashboardPage />;
      case 'dashboard': return <RoleDashboardRouter />;
      case 'pms-dashboard': return <RoleDashboardRouter />;
      case 'profile': return <ProfilePage />;
      case 'my-bookings': return <DashboardPage />;
      case 'my-listings': return <DashboardPage />;
      case 'subscription-plans': return <PMSSubscriptionPage />;
      default: return <HomePage />;
    }
  };

  if (view === 'live-mover-map' && (profile?.role === 'mover' || profile?.role === 'renter')) {
    return <><LiveMovingMap /><MovingGpsTracker /><BackButtonHandler /></>;
  }

  return <div className="app-shell flex min-h-screen flex-col overflow-hidden bg-gray-50 dark:bg-brand-950">
    <SecurityBanner />
    <Header />
    <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">{renderView()}</main>
    <Footer />
    <BottomBar />
    <AuthModal />
    <RoleSelectionModal />
    <MovingGpsTracker />
    <RenterBookingChatRedirector />
    <BackButtonHandler />
    <LiveJourneyNotification />
    <NotificationPermissionPrompt />
  </div>;
}

export default function App() {
  return <ThemeProvider><SplashScreen /><AuthProvider><NavProvider><AppContent /></NavProvider></AuthProvider></ThemeProvider>;
}
