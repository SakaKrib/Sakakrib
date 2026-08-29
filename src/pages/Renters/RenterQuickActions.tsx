import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  MapPin,
  Receipt,
  Truck,
} from 'lucide-react';

/* ============================================================
 * TYPES
 * ============================================================ */

export type RenterQuickAction =
  | 'invoices'
  | 'payment'
  | 'find-mover'
  | 'track-move'
  | 'calendar';

interface RenterQuickActionsProps {
  hasActiveMove?: boolean;
  onAction: (action: RenterQuickAction) => void;
}

/* ============================================================
 * COMPONENT
 * ============================================================ */

export default function RenterQuickActions({
  hasActiveMove = false,
  onAction,
}: RenterQuickActionsProps) {
  const actions = [
    {
      id: 'invoices' as const,
      icon: Receipt,
      iconClass:
        'text-brand-600 dark:text-brand-400',
      title: 'Rent & Invoices',
      description: 'View your rent invoices',
    },
    {
      id: 'payment' as const,
      icon: CreditCard,
      iconClass:
        'text-success-600 dark:text-success-400',
      title: 'Add Transaction',
      description: 'Add a payment transaction ID',
    },
    {
      id: 'find-mover' as const,
      icon: Truck,
      iconClass:
        'text-accent-600 dark:text-accent-400',
      title: 'Find a Mover',
      description: 'Find moving services',
    },
    {
      id: 'track-move' as const,
      icon: MapPin,
      iconClass:
        'text-purple-600 dark:text-purple-400',
      title: hasActiveMove
        ? 'Track Mover'
        : 'Track a Move',
      description: hasActiveMove
        ? 'View current move'
        : 'No active move',
    },
    {
      id: 'calendar' as const,
      icon: CalendarDays,
      iconClass:
        'text-btnblue-500 dark:text-btnblue-400',
      title: 'Calendar',
      description: 'Rent and moving dates',
    },
  ];

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-base font-bold text-gray-900 dark:text-white">
          Quick Actions
        </h2>

        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Manage your renter account
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction(action.id)}
              className="card group p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              <Icon
                className={`h-5 w-5 ${action.iconClass}`}
              />

              <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
                {action.title}
              </p>

              <p className="mt-1 min-h-[2rem] text-xs text-gray-500 dark:text-gray-400">
                {action.description}
              </p>

              <ArrowRight className="mt-3 h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
