import { Home, Search, Truck, Users, Menu } from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { cn } from '@/lib/utils';

export default function BottomBar() {
  const { navigate, view } = useNav();

  const items = [
    { icon: Home, label: 'Home', view: 'home' as const },
    { icon: Search, label: 'Browse', view: 'listings' as const },
    { icon: Truck, label: 'Movers', view: 'movers' as const },
    { icon: Users, label: 'Community', view: 'community' as const },
    { icon: Menu, label: 'More', view: 'dashboard' as const },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-md dark:border-brand-800 dark:bg-brand-950/95 md:hidden">
      <div className="flex items-center justify-around px-2 py-2">
        {items.map((item) => (
          <button
            key={item.view}
            onClick={() => navigate(item.view)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              view === item.view
                ? 'border-btnblue-500 text-btnblue-600 dark:border-btnblue-400 dark:text-btnblue-400'
                : 'border-gray-300 text-gray-500 dark:border-brand-700 dark:text-gray-400'
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </button>
        ))}
      </div>
      <div className="pb-[env(safe-area-inset-bottom)]">
        <p className="px-2 pb-1 text-center text-[9px] font-medium text-gray-400 dark:text-gray-500">
          © Copyright Saka Krib. All Rights Reserved.
        </p>
      </div>
    </nav>
  );
}
