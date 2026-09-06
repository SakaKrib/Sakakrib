import { protectedGet, protectedPost } from '@/lib/djangoApi';

type Result<T> = { data: T | null; error: { message: string } | null };

export type PMSAccessDecision = {
  allowed: boolean;
  reason: string;
  read_only: boolean;
  role?: 'landlord' | 'real_estate';
  subscription_id?: string;
  subscription_status?: string;
};

export type PMSSubscriptionSnapshot = Record<string, unknown> | null;
export type PMSEntitlementSnapshot = Record<string, unknown> | null;
export type PMSDashboardSnapshot = Record<string, any>;

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(error: unknown): Result<T> => ({
  data: null,
  error: { message: error instanceof Error ? error.message : 'Request failed.' },
});

const request = async <T>(work: () => Promise<T>): Promise<Result<T>> => {
  try {
    return ok(await work());
  } catch (error) {
    return fail<T>(error);
  }
};

const dashboard = async (): Promise<PMSDashboardSnapshot> =>
  protectedGet<PMSDashboardSnapshot>('/api/core/pms/dashboard/');

const realEstateDashboard = async () =>
  protectedGet<any>('/api/core/pms/real-estate/dashboard/');

/**
 * Django-authoritative PMS access decision.
 * Routes that enter PMS must ask Django whether access is allowed before rendering
 * the workspace. No client-side subscription state is trusted for authorization.
 */
const pmsAccess = async (): Promise<PMSAccessDecision> =>
  protectedGet<PMSAccessDecision>('/api/subscriptions/me/pms-access/');

/** Django-authoritative subscription/listing entitlement. */
const subscriptionAccess = async (): Promise<PMSEntitlementSnapshot> =>
  protectedGet<PMSEntitlementSnapshot>('/api/subscriptions/me/access/');

const subscription = async (): Promise<PMSSubscriptionSnapshot> =>
  protectedGet<any>('/api/subscriptions/me/');

export const djangoPmsGateway = {
  auth: {
    // Keep a Supabase-shaped auth result only as a compatibility contract for
    // existing PMS components. The actual request is still Django-only.
    getUser: async () => {
      const result = await request(() => protectedGet<any>('/api/accounts/me/'));
      return {
        data: { user: result.data },
        error: result.error,
      };
    },
  },

  /** Direct Django PMS boundary for new routes/components. */
  dashboard: async () => request(dashboard),
  access: async () => request(pmsAccess),
  entitlement: async () => request(subscriptionAccess),
  subscription: async () => request(subscription),

  from(table: string) {
    if (table !== 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => fail<any>(new Error(`Unsupported Django profile table: ${table}`)),
          }),
        }),
      };
    }

    return {
      select: () => ({
        eq: (_column: string, _value: unknown) => ({
          single: async () => request(() => protectedGet<any>('/api/accounts/me/')),
        }),
      }),
    };
  },

  rpc: async (name: string, params: Record<string, unknown> = {}) => {
    switch (name) {
      case 'get_my_pms_access':
        return request(pmsAccess);
      case 'get_my_pms_entitlement':
        return request(subscriptionAccess);
      case 'get_my_pms_subscription':
        // Subscription selection must remain available when PMS access is denied.
        // The dashboard endpoint is access-gated, so it cannot be used to discover
        // an existing/expired subscription on the subscription purchase page.
        return request(async () => await subscription());
      case 'get_my_subscription':
        return request(subscription);
      case 'get_my_unit_entitlement':
        return request(subscriptionAccess);
      case 'get_my_pms_unit_count':
        return request(async () => {
          const data = await dashboard();
          return Array.isArray(data?.units) ? data.units.length : 0;
        });
      case 'get_my_pms_listings':
        return request(async () => (await dashboard()).pmsListings ?? []);
      case 'get_my_available_pms_listings':
        return request(async () => (await dashboard()).availableListings ?? []);
      case 'get_current_real_estate_subscription':
        // Same rule as landlord subscriptions: purchasing/reviewing a plan must
        // not depend on already having PMS workspace access.
        return request(async () => await subscription());
      case 'get_real_estate_listing_entitlement':
        return request(async () => (await realEstateDashboard()).entitlement ?? null);
      case 'add_listing_to_pms':
      case 'remove_listing_from_pms': {
        const profile = await protectedGet<any>('/api/accounts/me/');
        const endpoint = profile?.role === 'real_estate'
          ? '/api/core/pms/real-estate/action/'
          : '/api/core/pms/action/';
        return request(() => protectedPost<any>(endpoint, {
          action: name === 'add_listing_to_pms' ? 'add_listing' : 'remove_listing',
          listing_id: params.p_listing_id,
          subscription_id: params.p_subscription_id,
        }));
      }
      default:
        return fail<any>(new Error(`No Django PMS operation exists for ${name}.`));
    }
  },
};