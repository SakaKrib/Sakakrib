import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY"
);
const CRON_SECRET = Deno.env.get("CRON_SECRET");

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is not configured");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
}

if (!CRON_SECRET) {
  throw new Error("CRON_SECRET is not configured");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function getBearerToken(
  req: Request
): string | null {
  const authorization =
    req.headers.get("Authorization");

  if (!authorization) {
    return null;
  }

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.substring(
    "Bearer ".length
  ).trim();
}

Deno.serve(async (req) => {
  /*
   * --------------------------------------------------------
   * ONLY POST
   * --------------------------------------------------------
   */

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed",
      },
      405
    );
  }

  try {
    /*
     * --------------------------------------------------------
     * CRON AUTHENTICATION
     * --------------------------------------------------------
     */

    const suppliedSecret =
      getBearerToken(req);

    if (!suppliedSecret) {
      return jsonResponse(
        {
          success: false,
          error: "Unauthorized",
        },
        401
      );
    }

    if (suppliedSecret !== CRON_SECRET) {
      return jsonResponse(
        {
          success: false,
          error: "Unauthorized",
        },
        401
      );
    }

    /*
     * --------------------------------------------------------
     * RUN DATABASE EXPIRY PROCESSOR
     * --------------------------------------------------------
     *
     * The database function is responsible for:
     *
     * - detecting expired subscriptions
     * - moving ACTIVE → GRACE_PERIOD
     * - moving GRACE_PERIOD → EXPIRED
     * - setting grace_period_end
     * - handling subscription unit access
     * - creating renewal records where appropriate
     *
     * The Edge Function is only the secure scheduler entrypoint.
     */

    const {
      data,
      error,
    } = await supabase.rpc(
      "process_subscription_expiry"
    );

    if (error) {
      console.error(
        "Subscription expiry RPC failed:",
        error
      );

      return jsonResponse(
        {
          success: false,
          error:
            "Subscription expiry processing failed",
        },
        500
      );
    }

    /*
     * --------------------------------------------------------
     * SUCCESS
     * --------------------------------------------------------
     */

    console.log(
      "Subscription cron completed successfully:",
      data
    );

    return jsonResponse({
      success: true,
      result: data ?? null,
    });

  } catch (error) {
    console.error(
      "Subscription cron error:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500
    );
  }
});