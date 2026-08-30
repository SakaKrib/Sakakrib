const FUNCTION_NAME = 'protected-api';

// ============================================================
// TYPES
// ============================================================

export interface ProtectedApiErrorBody {
  error?: string;
  message?: string;
  authenticated?: boolean;
  authorized?: boolean;
  role?: string | null;
}

export interface ProtectedApiException
  extends Error {
  status?: number;
  authenticated?: boolean;
  authorized?: boolean;
}

// ============================================================
// ENVIRONMENT
// ============================================================

const getFunctionUrl = (): string => {
  const baseUrl =
    import.meta.env.VITE_SUPABASE_URL as
      | string
      | undefined;

  if (!baseUrl) {
    throw new Error(
      'VITE_SUPABASE_URL is not configured.'
    );
  }

  return `${baseUrl.replace(/\/+$/, '')}/functions/v1/${FUNCTION_NAME}`;
};

const getPublishableKey = (): string => {
  const key =
    import.meta.env.VITE_SUPABASE_ANON_KEY as
      | string
      | undefined;

  if (!key) {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY is not configured.'
    );
  }

  return key;
};

// ============================================================
// JSON PARSER
// ============================================================

const readJson = async <T>(
  response: Response
): Promise<T | null> => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

// ============================================================
// PROTECTED API
// ============================================================

export const protectedApi = async <T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> => {
  if (!path.startsWith('/rest/v1/')) {
    throw new Error(
      'Protected API paths must target /rest/v1/.'
    );
  }

  const headers = new Headers(init.headers);

  headers.set(
    'apikey',
    getPublishableKey()
  );

  if (
    init.body !== undefined &&
    init.body !== null &&
    !headers.has('Content-Type')
  ) {
    headers.set(
      'Content-Type',
      'application/json'
    );
  }

  const response = await fetch(
    `${getFunctionUrl()}${path}`,
    {
      ...init,
      credentials: 'include',
      headers,
    }
  );

  const body =
    await readJson<T | ProtectedApiErrorBody>(
      response
    );

  if (!response.ok) {
    const errorBody =
      body as ProtectedApiErrorBody | null;

    const message =
      errorBody?.error ??
      errorBody?.message ??
      `Protected API request failed (${response.status}).`;

    const error =
      new Error(
        message
      ) as ProtectedApiException;

    error.status =
      response.status;
    error.authenticated =
      errorBody?.authenticated;
    error.authorized =
      errorBody?.authorized;

    throw error;
  }

  return body as T;
};

// ============================================================
// EDGE FUNCTION PROXY
//
// User-authenticated Edge Functions must not be called directly
// from the browser when the application uses HttpOnly cookies.
// This helper calls the protected-api proxy, which authenticates
// the browser cookie and forwards a short-lived user JWT to the
// target function server-side.
// ============================================================

export const protectedFunctionPost = async <
  T = unknown
>(
  functionPath: string,
  body: unknown
): Promise<T> => {
  if (!functionPath.startsWith('/')) {
    throw new Error(
      'Protected function paths must start with /. '
    );
  }

  const response = await fetch(
    `${getFunctionUrl()}${functionPath}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        apikey: getPublishableKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  const data =
    await readJson<T | ProtectedApiErrorBody>(
      response
    );

  if (!response.ok) {
    const errorBody =
      data as ProtectedApiErrorBody | null;

    const message =
      errorBody?.error ??
      errorBody?.message ??
      `Protected function request failed (${response.status}).`;

    const error =
      new Error(
        message
      ) as ProtectedApiException;

    error.status =
      response.status;
    error.authenticated =
      errorBody?.authenticated;
    error.authorized =
      errorBody?.authorized;

    throw error;
  }

  return data as T;
};

// ============================================================
// GET
// ============================================================

export const protectedGet = async <
  T = unknown
>(
  path: string,
  init: RequestInit = {}
): Promise<T> => {
  return protectedApi<T>(
    path,
    {
      ...init,
      method: 'GET',
    }
  );
};

// ============================================================
// POST
// ============================================================

export const protectedPost = async <
  T = unknown
>(
  path: string,
  body: unknown,
  init: RequestInit = {}
): Promise<T> => {
  return protectedApi<T>(
    path,
    {
      ...init,
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
};

// ============================================================
// PATCH
// ============================================================

export const protectedPatch = async <
  T = unknown
>(
  path: string,
  body: unknown,
  init: RequestInit = {}
): Promise<T> => {
  return protectedApi<T>(
    path,
    {
      ...init,
      method: 'PATCH',
      body: JSON.stringify(body),
    }
  );
};

// ============================================================
// PUT
// ============================================================

export const protectedPut = async <
  T = unknown
>(
  path: string,
  body: unknown,
  init: RequestInit = {}
): Promise<T> => {
  return protectedApi<T>(
    path,
    {
      ...init,
      method: 'PUT',
      body: JSON.stringify(body),
    }
  );
};

// ============================================================
// DELETE
// ============================================================

export const protectedDelete = async <
  T = unknown
>(
  path: string,
  init: RequestInit = {}
): Promise<T> => {
  return protectedApi<T>(
    path,
    {
      ...init,
      method: 'DELETE',
    }
  );
};
