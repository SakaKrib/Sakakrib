import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

/**
 * ============================================================
 * ENVIRONMENT
 * ============================================================
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase environment is not configured.');
}

const FUNCTION_NAME = 'protected-api';

const FUNCTION_PREFIX = `/functions/v1/${FUNCTION_NAME}`;

/**
 * Always remove trailing slashes.
 *
 * This prevents:
 *
 *   https://project.supabase.co//rest/v1/...
 *
 * which can cause PostgREST path errors.
 */
const SUPABASE_BASE_URL = SUPABASE_URL.replace(/\/+$/, '');

/**
 * ============================================================
 * SUPABASE CLIENT
 * ============================================================
 */

const supabase = createClient(
  SUPABASE_BASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

/**
 * ============================================================
 * CORS
 * ============================================================
 */

const allowedOrigin = (request: Request): string => {
  const origin = request.headers.get('origin');
  const configuredOrigin = Deno.env.get('APP_ORIGIN');

  if (configuredOrigin && origin === configuredOrigin) {
    return origin;
  }

  const developmentOrigins = new Set([
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',

    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:5176',

    'http://100.109.224.0:5173',
  ]);

  if (origin && developmentOrigins.has(origin)) {
    return origin;
  }

  return configuredOrigin ?? '';
};

const corsHeaders = (
  request: Request,
): HeadersInit => {
  const origin = allowedOrigin(request);

  return {
    ...(origin
      ? {
          'Access-Control-Allow-Origin': origin,
        }
      : {}),

    'Access-Control-Allow-Credentials': 'true',

    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-http-method-override',

    'Access-Control-Allow-Methods':
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',

    Vary: 'Origin',
  };
};

/**
 * ============================================================
 * JSON RESPONSE
 * ============================================================
 */

const json = (
  request: Request,
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: HeadersInit = [],
): Response => {
  const headers = new Headers(
    corsHeaders(request),
  );

  headers.set(
    'Content-Type',
    'application/json',
  );

  headers.set(
    'Cache-Control',
    'no-store',
  );

  for (const [name, value] of extraHeaders) {
    headers.append(name, value);
  }

  return new Response(
    JSON.stringify(body),
    {
      status,
      headers,
    },
  );
};

/**
 * ============================================================
 * COOKIE HELPERS
 * ============================================================
 */

const readCookies = (
  request: Request,
): Record<string, string> => {
  const cookies: Record<string, string> = {};

  const header =
    request.headers.get('cookie') ?? '';

  for (const part of header.split(';')) {
    const index = part.indexOf('=');

    if (index === -1) continue;

    const name = part
      .slice(0, index)
      .trim();

    if (!name) continue;

    const rawValue = part
      .slice(index + 1)
      .trim();

    try {
      cookies[name] =
        decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
};

const cookieBase = [
  'Path=/',
  'HttpOnly',
  'Secure',
  'SameSite=None',
];

const setAuthCookies = (
  accessToken: string,
  refreshToken: string,
): HeadersInit => [
  [
    'Set-Cookie',
    `sk_access=${encodeURIComponent(
      accessToken,
    )}; ${cookieBase.join(
      '; ',
    )}; Max-Age=3600`,
  ],

  [
    'Set-Cookie',
    `sk_refresh=${encodeURIComponent(
      refreshToken,
    )}; ${cookieBase.join(
      '; ',
    )}; Max-Age=2592000`,
  ],
];

const clearAuthCookies =
  (): HeadersInit => [
    [
      'Set-Cookie',
      `sk_access=; ${cookieBase.join(
        '; ',
      )}; Max-Age=0`,
    ],

    [
      'Set-Cookie',
      `sk_refresh=; ${cookieBase.join(
        '; ',
      )}; Max-Age=0`,
    ],
  ];

/**
 * ============================================================
 * PROTECTED PATH NORMALIZATION
 * ============================================================
 *
 * Browser sends:
 *
 *   /functions/v1/protected-api/rest/v1/platform_settings
 *
 * Edge Runtime may expose:
 *
 *   /functions/v1/protected-api/rest/v1/platform_settings
 *
 * or:
 *
 *   /protected-api/rest/v1/platform_settings
 *
 * or:
 *
 *   /rest/v1/platform_settings
 *
 * We only care about the actual PostgREST portion:
 *
 *   /rest/v1/...
 *
 * Everything before that is discarded.
 */

const normalizeProtectedPath = (
  pathname: string,
): string => {
  if (!pathname) {
    return '';
  }

  let decodedPath: string;

  try {
    decodedPath =
      decodeURIComponent(pathname);
  } catch {
    return '';
  }

  /**
   * Find the first legitimate PostgREST
   * segment.
   */
  const restIndex =
    decodedPath.indexOf('/rest/v1/');

  if (restIndex !== -1) {
    return decodedPath.slice(restIndex);
  }

  /**
   * Also support the exact root:
   *
   * /rest/v1
   */
  if (decodedPath === '/rest/v1') {
    return '/rest/v1/';
  }

  /**
   * If no PostgREST path exists,
   * reject it.
   */
  return '';
};

/**
 * ============================================================
 * SAFE POSTGREST PATH
 * ============================================================
 */

const isSafeRestPath = (
  path: string,
): boolean => {
  if (!path) {
    return false;
  }

  if (!path.startsWith('/rest/v1/')) {
    return false;
  }

  /**
   * Prevent absolute URLs.
   */
  if (path.includes('://')) {
    return false;
  }

  /**
   * Prevent protocol-relative URLs.
   */
  if (path.startsWith('//')) {
    return false;
  }

  /**
   * Prevent backslash path tricks.
   */
  if (path.includes('\\')) {
    return false;
  }

  /**
   * Prevent null-byte path tricks.
   */
  if (path.includes('\0')) {
    return false;
  }

  return true;
};

/**
 * ============================================================
 * PROFILE
 * ============================================================
 */

type Profile = {
  id: string;

  email: string | null;

  role: string | null;

  email_verified: boolean | null;

  verification_status: string | null;

  kyc_completed: boolean | null;

  landlord_application_status: string | null;

  real_estate_application_status: string | null;

  mover_application_status: string | null;
};

/**
 * ============================================================
 * AUTHENTICATED USER
 * ============================================================
 */

type Authenticated = {
  user: {
    id: string;
    email: string | null;
  };

  accessToken: string;

  refreshToken?: string;

  profile: Profile;
};

/**
 * ============================================================
 * AUTHENTICATE ACCESS TOKEN
 * ============================================================
 */

const authenticate = async (
  accessToken: string,
): Promise<Authenticated | null> => {
  /**
   * Validate the JWT against Supabase Auth.
   */
  const authClient = createClient(
    SUPABASE_BASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  const {
    data,
    error,
  } = await authClient.auth.getUser(
    accessToken,
  );

  if (error || !data.user) {
    return null;
  }

  /**
   * Create a user-scoped client.
   *
   * This is important because RLS must see
   * the authenticated user's JWT.
   */
  const userClient = createClient(
    SUPABASE_BASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },

      global: {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    },
  );

  /**
   * Load the protected application profile.
   */
  const {
    data: profile,
    error: profileError,
  } =
    await userClient
      .from('profiles')
      .select(
        [
          'id',
          'email',
          'role',
          'email_verified',
          'verification_status',
          'kyc_completed',
          'landlord_application_status',
          'real_estate_application_status',
          'mover_application_status',
        ].join(','),
      )
      .eq(
        'id',
        data.user.id,
      )
      .maybeSingle();

  if (
    profileError ||
    !profile
  ) {
    console.error(
      'Profile authentication lookup failed:',
      profileError,
    );

    return null;
  }

  return {
    user: {
      id: data.user.id,

      email:
        data.user.email ?? null,
    },

    accessToken,

    profile:
      profile as Profile,
  };
};

/**
 * ============================================================
 * REFRESH SESSION
 * ============================================================
 */

const refreshFromCookie = async (
  refreshToken: string,
): Promise<Authenticated | null> => {
  const {
    data,
    error,
  } =
    await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

  if (
    error ||
    !data.session ||
    !data.user
  ) {
    return null;
  }

  const authenticated =
    await authenticate(
      data.session.access_token,
    );

  if (!authenticated) {
    return null;
  }

  return {
    ...authenticated,

    refreshToken:
      data.session.refresh_token,
  };
};

/**
 * ============================================================
 * ROLE AUTHORIZATION
 * ============================================================
 *
 * The browser never supplies the role.
 *
 * Role comes from the protected profiles
 * record associated with the authenticated
 * Supabase user.
 */

const requiredRoleForPath = (
  path: string,
): string | null => {
  if (
    path.startsWith(
      '/rest/v1/landlord/',
    )
  ) {
    return 'landlord';
  }

  if (
    path.startsWith(
      '/rest/v1/real_estate/',
    )
  ) {
    return 'real_estate';
  }

  if (
    path.startsWith(
      '/rest/v1/renter/',
    )
  ) {
    return 'renter';
  }

  return null;
};

/**
 * ============================================================
 * AUTHORIZATION
 * ============================================================
 */

const authorizeRoute = (
  profile: Profile,
  path: string,
):
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number;
      error: string;
    } => {
  /**
   * Account verification.
   */
  if (
    profile.email_verified !== true
  ) {
    return {
      ok: false,
      status: 403,
      error:
        'Email verification is required.',
    };
  }

  /**
   * Application roles.
   */
  const role = (
    profile.role ?? ''
  )
    .trim()
    .toLowerCase();

  const validRoles = new Set([
    'landlord',
    'real_estate',
    'renter',
    'mover',
    'admin',
  ]);

  if (!validRoles.has(role)) {
    return {
      ok: false,
      status: 403,
      error:
        'Your account does not have a valid application role.',
    };
  }

  /**
   * Explicit route role.
   */
  const requiredRole =
    requiredRoleForPath(path);

  if (
    requiredRole &&
    role !== requiredRole
  ) {
    return {
      ok: false,
      status: 403,
      error:
        `This protected route requires the ${requiredRole} role.`,
    };
  }

  return {
    ok: true,
  };
};

/**
 * ============================================================
 * EDGE FUNCTION
 * ============================================================
 */

Deno.serve(
  async (request: Request) => {
    /**
     * --------------------------------------------------------
     * CORS PREFLIGHT
     * --------------------------------------------------------
     */

    if (
      request.method === 'OPTIONS'
    ) {
      return new Response(null, {
        status: 204,

        headers:
          corsHeaders(request),
      });
    }

    /**
     * --------------------------------------------------------
     * ORIGIN CHECK
     * --------------------------------------------------------
     */

    const origin =
      request.headers.get(
        'origin',
      );

    const configuredOrigin =
      Deno.env.get(
        'APP_ORIGIN',
      );

    if (
      configuredOrigin &&
      origin &&
      origin !== configuredOrigin
    ) {
      return json(
        request,
        {
          error:
            'Origin not allowed.',
        },
        403,
      );
    }

    try {
      /**
       * ------------------------------------------------------
       * READ AUTH COOKIES
       * ------------------------------------------------------
       */

      const cookies =
        readCookies(request);

      let accessToken =
        cookies.sk_access;

      let refreshHeaders:
        HeadersInit = [];

      /**
       * ------------------------------------------------------
       * AUTHENTICATE ACCESS TOKEN
       * ------------------------------------------------------
       */

      let authenticated =
        accessToken
          ? await authenticate(
              accessToken,
            )
          : null;

      /**
       * ------------------------------------------------------
       * REFRESH IF NECESSARY
       * ------------------------------------------------------
       */

      if (!authenticated) {
        const refreshToken =
          cookies.sk_refresh;

        if (!refreshToken) {
          return json(
            request,
            {
              authenticated:
                false,

              error:
                'Authentication required.',
            },
            401,
            clearAuthCookies(),
          );
        }

        const refreshed =
          await refreshFromCookie(
            refreshToken,
          );

        if (!refreshed) {
          return json(
            request,
            {
              authenticated:
                false,

              error:
                'Authentication expired.',
            },
            401,
            clearAuthCookies(),
          );
        }

        accessToken =
          refreshed.accessToken;

        authenticated =
          refreshed;

        refreshHeaders =
          setAuthCookies(
            refreshed.accessToken,
            refreshed.refreshToken!,
          );
      }

      /**
       * ------------------------------------------------------
       * EXTRACT POSTGREST PATH
       * ------------------------------------------------------
       */

      const requestUrl =
        new URL(request.url);

      const targetPath =
        normalizeProtectedPath(
          requestUrl.pathname,
        );

      /**
       * IMPORTANT:
       *
       * Log the actual path used for debugging.
       */
      console.log(
        'protected-api request:',
        {
          originalPath:
            requestUrl.pathname,

          normalizedPath:
            targetPath,
        },
      );

      /**
       * ------------------------------------------------------
       * VALIDATE PATH
       * ------------------------------------------------------
       */

      if (
        !isSafeRestPath(
          targetPath,
        )
      ) {
        return json(
          request,
          {
            error:
              'Unsupported protected API path.',
          },
          400,
        );
      }

      /**
       * ------------------------------------------------------
       * ROLE / ACCOUNT AUTHORIZATION
       * ------------------------------------------------------
       */

      const authorization =
        authorizeRoute(
          authenticated.profile,
          targetPath,
        );

      if (!authorization.ok) {
        return json(
          request,
          {
            authenticated: true,

            authorized: false,

            role:
              authenticated
                .profile.role,

            error:
              authorization.error,
          },
          authorization.status,
          refreshHeaders,
        );
      }

      /**
       * ------------------------------------------------------
       * BUILD POSTGREST URL
       * ------------------------------------------------------
       *
       * SUPABASE_BASE_URL has already had all trailing
       * slashes removed.
       *
       * targetPath always starts with /rest/v1/
       *
       * Therefore this ALWAYS becomes:
       *
       * https://project.supabase.co/rest/v1/...
       */

      const targetUrl =
        `${SUPABASE_BASE_URL}${targetPath}${requestUrl.search}`;

      console.log(
        'protected-api target:',
        targetUrl,
      );

      /**
       * ------------------------------------------------------
       * REQUEST BODY
       * ------------------------------------------------------
       */

      const body =
        request.method === 'GET' ||
        request.method === 'HEAD'
          ? undefined
          : await request.text();

      /**
       * ------------------------------------------------------
       * POSTGREST HEADERS
       * ------------------------------------------------------
       */

      const headers =
        new Headers();

      /**
       * Required by Supabase REST.
       */
      headers.set(
        'apikey',
        SUPABASE_ANON_KEY,
      );

      /**
       * User JWT.
       *
       * This is what makes PostgREST/RLS operate
       * as the authenticated Supabase user.
       */
      headers.set(
        'Authorization',
        `Bearer ${accessToken}`,
      );

      headers.set(
        'Accept',
        request.headers.get(
          'accept',
        ) ??
          'application/json',
      );

      const contentType =
        request.headers.get(
          'content-type',
        );

      if (contentType) {
        headers.set(
          'Content-Type',
          contentType,
        );
      }

      const prefer =
        request.headers.get(
          'prefer',
        );

      if (prefer) {
        headers.set(
          'Prefer',
          prefer,
        );
      }

      const range =
        request.headers.get(
          'range',
        );

      if (range) {
        headers.set(
          'Range',
          range,
        );
      }

      /**
       * ------------------------------------------------------
       * FORWARD TO POSTGREST
       * ------------------------------------------------------
       */

      let postgrestResponse =
        await fetch(
          targetUrl,
          {
            method:
              request.method,

            headers,

            body,
          },
        );

      /**
       * ------------------------------------------------------
       * ONE-TIME TOKEN REFRESH
       * ------------------------------------------------------
       *
       * The token can expire between:
       *
       *   auth.getUser()
       *
       * and:
       *
       *   PostgREST
       *
       * Refresh once and retry.
       */

      if (
        postgrestResponse.status ===
          401 &&
        cookies.sk_refresh &&
        refreshHeaders.length === 0
      ) {
        const refreshed =
          await refreshFromCookie(
            cookies.sk_refresh,
          );

        if (refreshed) {
          accessToken =
            refreshed.accessToken;

          refreshHeaders =
            setAuthCookies(
              refreshed.accessToken,
              refreshed.refreshToken!,
            );

          headers.set(
            'Authorization',
            `Bearer ${accessToken}`,
          );

          postgrestResponse =
            await fetch(
              targetUrl,
              {
                method:
                  request.method,

                headers,

                body,
              },
            );
        }
      }

      /**
       * ------------------------------------------------------
       * RESPONSE
       * ------------------------------------------------------
       */

      const responseHeaders =
        new Headers(
          corsHeaders(request),
        );

      responseHeaders.set(
        'Cache-Control',
        'no-store',
      );

      for (const headerName of [
        'content-type',
        'content-range',
        'location',
      ]) {
        const value =
          postgrestResponse.headers.get(
            headerName,
          );

        if (value) {
          responseHeaders.set(
            headerName,
            value,
          );
        }
      }

      /**
       * Send refreshed cookies
       * back to browser.
       */
      for (
        const [
          name,
          value,
        ] of refreshHeaders
      ) {
        responseHeaders.append(
          name,
          value,
        );
      }

      /**
       * Clear invalid authentication
       * cookies after a final 401.
       */
      if (
        postgrestResponse.status ===
        401
      ) {
        for (
          const [
            name,
            value,
          ] of clearAuthCookies()
        ) {
          responseHeaders.append(
            name,
            value,
          );
        }
      }

      return new Response(
        await postgrestResponse.arrayBuffer(),
        {
          status:
            postgrestResponse.status,

          headers:
            responseHeaders,
        },
      );
    } catch (error) {
      console.error(
        'protected-api error:',
        error,
      );

      return json(
        request,
        {
          error:
            'Protected API request failed.',
        },
        500,
      );
    }
  },
);
