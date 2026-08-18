import { createClient } from "npm:@supabase/supabase-js@2";

import { applicationApprovedEmail } from "./emails/applicationApproved.ts";
import { applicationDeclinedEmail } from "./emails/applicationDeclined.ts";
import { applicationReviewEmail } from "./emails/applicationReview.ts";
import { landlordApplicationSubmittedEmail } from "./emails/landlordApplicationSubmitted.ts";
import { moverApplicationSubmittedEmail } from "./emails/moverApplicationSubmitted.ts";
import { otpVerificationEmail } from "./emails/otpVerification.ts";
import { signInNotificationEmail } from "./emails/signInNotification.ts";
import { signUpWelcomeEmail } from "./emails/signUpWelcome.ts";
import { moverAdminNotificationEmail } from "./emails/moverAdminNotification.ts";
import { landlordAdminNotificationEmail } from "./emails/landlordAdminNotification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM");
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");

/*
|--------------------------------------------------------------------------
| Email types
|--------------------------------------------------------------------------
*/

type EmailType =
  | "application_approved"
  | "application_declined"
  | "application_review"
  | "landlord_application_submitted"
  | "mover_application_submitted"
  | "landlord_admin_notification"
  | "mover_admin_notification"
  | "otp_verification"
  | "sign_in_notification"
  | "sign_up_welcome";

/*
|--------------------------------------------------------------------------
| Template registry
|--------------------------------------------------------------------------
|
| All templates receive one payload object.
|
| OTP is handled separately below because its template
| requires fullName, otp and purpose.
|
|--------------------------------------------------------------------------
*/

const EMAIL_TEMPLATES: Partial<
  Record<EmailType, (payload: any) => string>
> = {
  application_approved: applicationApprovedEmail,

  application_declined: applicationDeclinedEmail,

  application_review: applicationReviewEmail,

  landlord_application_submitted:
    landlordApplicationSubmittedEmail,

  mover_application_submitted:
    moverApplicationSubmittedEmail,

  landlord_admin_notification:
    landlordAdminNotificationEmail,

  mover_admin_notification:
    moverAdminNotificationEmail,

  sign_in_notification:
    signInNotificationEmail,

  sign_up_welcome:
    signUpWelcomeEmail,
};

/*
|--------------------------------------------------------------------------
| Subjects
|--------------------------------------------------------------------------
*/

const EMAIL_SUBJECTS: Record<EmailType, string> = {
  application_approved:
    "Your Saka Krib application has been approved",

  application_declined:
    "Update regarding your Saka Krib application",

  application_review:
    "Your Saka Krib application is under review",

  landlord_application_submitted:
    "Landlord application submitted - Saka Krib",

  landlord_admin_notification:
    "New landlord application requires review - Saka Krib",

  mover_application_submitted:
    "Mover application submitted - Saka Krib",

  mover_admin_notification:
    "New mover application requires review - Saka Krib",

  otp_verification:
    "Your Saka Krib verification code",

  sign_in_notification:
    "New sign-in to your Saka Krib account",

  sign_up_welcome:
    "Welcome to Saka Krib",
};

/*
|--------------------------------------------------------------------------
| Edge Function
|--------------------------------------------------------------------------
*/

Deno.serve(async (req: Request) => {
  /*
  |--------------------------------------------------------------------------
  | CORS
  |--------------------------------------------------------------------------
  */

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | POST only
  |--------------------------------------------------------------------------
  */

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Method not allowed.",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    /*
    |--------------------------------------------------------------------------
    | Validate required environment variables
    |--------------------------------------------------------------------------
    */

    if (!RESEND_API_KEY) {
      throw new Error(
        "RESEND_API_KEY is not configured."
      );
    }

    if (!EMAIL_FROM) {
      throw new Error(
        "EMAIL_FROM is not configured."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Read request body
    |--------------------------------------------------------------------------
    */

    const body = await req.json();

    const type = body?.type as EmailType;

    const application =
      body?.application &&
      typeof body.application === "object"
        ? body.application
        : {};

    /*
    |--------------------------------------------------------------------------
    | Validate email type
    |--------------------------------------------------------------------------
    */

    if (!type) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email type is required.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!(type in EMAIL_SUBJECTS)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Unknown email type: ${type}`,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Determine recipient
    |--------------------------------------------------------------------------
    */

    let recipient = "";

    if (
      type === "landlord_admin_notification" ||
      type === "mover_admin_notification"
    ) {
      recipient = ADMIN_EMAIL?.trim() || "";
    } else {
      recipient =
        typeof application.applicant_email === "string"
          ? application.applicant_email.trim()
          : typeof application.email === "string"
            ? application.email.trim()
            : "";
    }

    if (!recipient) {
      throw new Error(
        "No recipient email address was provided."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Generate HTML
    |--------------------------------------------------------------------------
    */

    let htmlBody = "";

    /*
    |--------------------------------------------------------------------------
    | OTP template
    |--------------------------------------------------------------------------
    |
    | otpVerificationEmail has this signature:
    |
    | otpVerificationEmail(fullName, otp, purpose)
    |
    |--------------------------------------------------------------------------
    */

    if (type === "otp_verification") {
      const fullName =
        typeof application.full_name === "string"
          ? application.full_name
          : undefined;

      const otp =
        typeof application.otp === "string"
          ? application.otp
          : "";

      const purpose =
        typeof application.purpose === "string"
          ? application.purpose
          : "verify your account";

      if (!otp) {
        throw new Error(
          "OTP is required for otp_verification."
        );
      }

      htmlBody = otpVerificationEmail(
        fullName,
        otp,
        purpose
      );
    } else {
      const template = EMAIL_TEMPLATES[type];

      if (!template) {
        throw new Error(
          `No template registered for email type: ${type}`
        );
      }

      htmlBody = template(application);
    }

    /*
    |--------------------------------------------------------------------------
    | Validate generated HTML
    |--------------------------------------------------------------------------
    */

    if (!htmlBody.trim()) {
      throw new Error(
        "Email template returned empty HTML."
      );
    }

    const subject = EMAIL_SUBJECTS[type];

    /*
    |--------------------------------------------------------------------------
    | Create notification record
    |--------------------------------------------------------------------------
    |
    | This stores the email BEFORE sending.
    |
    | If Resend fails, it is changed to "failed".
    |
    |--------------------------------------------------------------------------
    */

    const {
      data: notification,
      error: notificationError,
    } = await supabase
      .from("notification_emails")
      .insert({
        recipient,
        subject,
        html_body: htmlBody,
        template_type: type,
        status: "pending",
      })
      .select("id")
      .single();

    if (notificationError) {
      throw notificationError;
    }

    /*
    |--------------------------------------------------------------------------
    | Send through Resend
    |--------------------------------------------------------------------------
    */

    const resendResponse = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${RESEND_API_KEY}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [recipient],
          subject,
          html: htmlBody,
        }),
      }
    );

    let resendData: any = {};

    try {
      resendData =
        await resendResponse.json();
    } catch {
      resendData = {};
    }

    /*
    |--------------------------------------------------------------------------
    | Resend failure
    |--------------------------------------------------------------------------
    */

    if (!resendResponse.ok) {
      console.error(
        "Resend failed:",
        resendData
      );

      await supabase
        .from("notification_emails")
        .update({
          status: "failed",
        })
        .eq("id", notification.id);

      throw new Error(
        resendData?.message ||
          resendData?.error ||
          `Resend failed with status ${resendResponse.status}.`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Mark notification as sent
    |--------------------------------------------------------------------------
    */

    const { error: updateError } =
      await supabase
        .from("notification_emails")
        .update({
          status: "sent",
          sent_at:
            new Date().toISOString(),
        })
        .eq("id", notification.id);

    if (updateError) {
      console.error(
        "Email was sent but notification status update failed:",
        updateError
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Success
    |--------------------------------------------------------------------------
    */

    return new Response(
      JSON.stringify({
        success: true,
        sent: true,
        notification_id:
          notification.id,
        resend_id:
          resendData?.id || null,
        recipient,
        type,
        subject,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );

  } catch (error) {
    /*
    |--------------------------------------------------------------------------
    | Error
    |--------------------------------------------------------------------------
    */

    console.error(
      "Notification email function error:",
      error
    );

    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown email error.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }
});