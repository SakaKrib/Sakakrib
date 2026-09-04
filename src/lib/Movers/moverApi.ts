import { api } from '../djangoApi';

/**
 * Mover API surface.
 *
 * Endpoints are intentionally kept in one place while the backend audit is
 * completed. Add domain-specific functions here only after verifying their
 * Django route and response contract.
 */
export const moverApi = {
  /** Fetch the authenticated mover's profile/domain record. */
  getProfile: () => api.get('/api/movers/me/'),
};

export type MoverApi = typeof moverApi;
