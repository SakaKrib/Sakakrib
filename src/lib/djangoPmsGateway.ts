import { protectedGet, protectedPost } from '@/lib/djangoApi';

type Result<T> = { data: T | null; error: { message: string } | null };

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

const dashboard = async () =>
  protectedGet<any>('/api/core/pms/dashboard/');

const realEstateDashboard = async () =>
  protectedGet<any>('/api/core/pms/real-estate/dashboard/');

export const djangoPmsGateway = {
  auth: {
    getUser: async () => request(() => protectedGet<any>('/api/accounts/me/')),
  },

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
      case 'get_my_pms_subscription':
        return request(async () => (await dashboard()).subscription ?? null);

      case 'get_my_pms_unit_count':
        // Django's PMS dashboard is the source of truth. Unit count must
        // come from the authoritative units collection, not listing capacity.
        return request(async () => {
          const data = await dashboard();
          return Array.isArray(data?.units) ? data.units.length : 0;
        });

      case 'get_my_pms_listings':
        return request(async () => (await dashboard()).pmsListings ?? []);

      case 'get_my_available_pms_listings':
        return request(async () => (await dashboard()).availableListings ?? []);

      case 'get_current_real_estate_subscription':
        return request(async () => (await realEstateDashboard()).subscription ?? null);

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
