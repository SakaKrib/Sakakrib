import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { NavProvider, useNav } from '@/context/NavContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomBar from '@/components/BottomBar';
import SecurityBanner from '@/components/SecurityBanner';
import AuthModal from '@/components/AuthModal';
import RoleSelectionModal from '@/components/RoleSelectionModal';
import HomePage from '@/pages/HomePage';
import ListingsPage from '@/pages/ListingsPage';
import ListingDetailPage from '@/pages/ListingDetailPage';
import MoversPage from '@/pages/MoversPage';
import MoverDetailPage from '@/pages/MoverDetailPage';
import MoverBookingDetailPage from '@/pages/MoverBookingDetailPage';
import CommunityPage from '@/pages/CommunityPage';
import PostListingPage from '@/pages/PostListingPage';
import RegisterMoverPage from '@/pages/RegisterMoverPage';
import RegisterLandlordPage from '@/pages/RegisterLandlordPage';
import KycVerifyPage from '@/pages/KycVerifyPage';
import DashboardPage from '@/Dashboards/DashboardPage';
import RenterDashboard from '@/Dashboards/RenterDashboard';
import ProfilePage from '@/pages/ProfilePage';
import ListingManagePage from './pages/ListingManagePage';
import PMSSubscriptionPage from './components/PMS/PMSSubscriptionPage';

function AppContent() {
  const { view } = useNav();

  const renderView = () => {
    switch (view) {
      case 'home':
        return <HomePage />;
      case 'listings':
        return <ListingsPage />;
      case 'listing-detail':
        return <ListingDetailPage />;
      case 'listing-manage':
        return <ListingManagePage />;
      case 'movers':
        return <MoversPage />;
      case 'mover-detail':
        return <MoverDetailPage />;
      case 'mover-booking-detail':
        return <MoverBookingDetailPage />;
      case 'community':
        return <CommunityPage />;
      case 'post-listing':
        return <PostListingPage />;
      case 'register-mover':
        return <RegisterMoverPage />;
      case 'register-landlord':
        return <RegisterLandlordPage />;
      case 'kyc-verify':
        return <KycVerifyPage />;
      case 'renter-dashboard':
        return <RenterDashboard />;
      case 'dashboard':
        return <DashboardPage />;
      case 'profile':
        return <ProfilePage />;
      case 'subscription-plans':
        return <PMSSubscriptionPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-brand-950 overflow-x-hidden">
      <SecurityBanner />
      <Header />
      <main className="flex-1 pb-20 md:pb-0">{renderView()}</main>
      <Footer />
      <BottomBar />
      <AuthModal />
      <RoleSelectionModal />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NavProvider>
          <AppContent />
        </NavProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
