import PMSAccessGuard from '@/components/PMS/PMSAccessGuard';

export default function PMSDashboard() {
  return (
    <PMSAccessGuard>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Property Management
        </h1>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your properties, tenants, leases and finances.
        </p>

        {/* PMS dashboard */}
      </div>
    </PMSAccessGuard>
  );
}