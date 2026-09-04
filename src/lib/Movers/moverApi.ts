/**
 * Mover API surface.
 *
 * This module is the boundary for mover-specific data access. Domain methods
 * are added only after their Django route and response contract are verified,
 * preventing the dashboard from inventing frontend-only APIs.
 */
export const moverApi = {} as const;

export type MoverApi = typeof moverApi;
