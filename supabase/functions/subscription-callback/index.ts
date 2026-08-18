import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY"
)!;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

interface MpesaCallback {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: Array<{
          Name?: string;
          Value?: string | number;
        }>;
      };
    };
  };
}

function getMetadataValue(
  items:
    | Array<{
        Name?: string;
        Value?: string | number;
      }>
    | undefined,
  name: string
) {
  return (
    items?.find(
      (item) => item.Name === name
    )?.Value ?? null
  );
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}

Deno.serve(async (req) => {
  /*
   * --------------------------------------------------------
   * CORS
   * --------------------------------------------------------
   */

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  /*
   * --------------------------------------------------------
   * METHOD
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
     * ------------------------------------------------------
     * PARSE CALLBACK
     * ------------------------------------------------------
     */

    const payload: MpesaCallback =
      await req.json();

    const callback =
      payload?.Body?.stkCallback;

    if (!callback) {
      return jsonResponse(
        {
          success: false,
          error:
            "Invalid M-Pesa callback payload",
        },
        400
      );
    }

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = callback;

    /*
     * ------------------------------------------------------
     * VALIDATE CHECKOUT REQUEST
     * ------------------------------------------------------
     */

    if (!CheckoutRequestID) {
      return jsonResponse(
        {
          success: false,
          error:
            "CheckoutRequestID missing",
        },
        400
      );
    }

    /*
     * ------------------------------------------------------
     * FIND INVOICE
     * ------------------------------------------------------
     */

    const {
      data: invoice,
      error: invoiceError,
    } = await supabase
      .from("subscription_invoices")
      .select(`
        id,
        subscription_id,
        amount_kes,
        status,
        checkout_request_id
      `)
      .eq(
        "checkout_request_id",
        CheckoutRequestID
      )
      .maybeSingle();

    if (invoiceError) {
      console.error(
        "Invoice lookup failed:",
        invoiceError
      );

      throw new Error(
        "Unable to find subscription invoice"
      );
    }

    /*
     * Unknown transaction.
     *
     * Return 200 so Daraja does not repeatedly retry
     * a transaction that does not belong to our system.
     */

    if (!invoice) {
      console.error(
        "No invoice found for CheckoutRequestID:",
        CheckoutRequestID
      );

      return jsonResponse({
        success: false,
        error: "Invoice not found",
      });
    }

    /*
     * ------------------------------------------------------
     * IDEMPOTENCY
     * ------------------------------------------------------
     */

    if (invoice.status === "PAID") {
      return jsonResponse({
        success: true,
        message:
          "Callback already processed",
      });
    }

    /*
     * ------------------------------------------------------
     * FAILED PAYMENT
     * ------------------------------------------------------
     */

    if (ResultCode !== 0) {
      const {
        error: failedUpdateError,
      } = await supabase
        .from("subscription_invoices")
        .update({
          status: "FAILED",
          result_code:
            ResultCode ?? null,
          result_description:
            ResultDesc ?? null,
        })
        .eq("id", invoice.id)
        .eq("status", "PENDING");

      if (failedUpdateError) {
        console.error(
          "Failed invoice update:",
          failedUpdateError
        );

        throw new Error(
          "Unable to update failed invoice"
        );
      }

      return jsonResponse({
        success: true,
        status: "FAILED",
        result_code: ResultCode,
        result_description:
          ResultDesc ?? null,
      });
    }

    /*
     * ------------------------------------------------------
     * SUCCESSFUL PAYMENT METADATA
     * ------------------------------------------------------
     */

    const items =
      CallbackMetadata?.Item;

    const mpesaReceipt =
      getMetadataValue(
        items,
        "MpesaReceiptNumber"
      );

    const paidAmount =
      getMetadataValue(
        items,
        "Amount"
      );

    const phoneNumber =
      getMetadataValue(
        items,
        "PhoneNumber"
      );

    /*
     * ------------------------------------------------------
     * REQUIRE RECEIPT
     * ------------------------------------------------------
     */

    if (!mpesaReceipt) {
      console.error(
        "Successful callback has no M-Pesa receipt",
        {
          invoice_id: invoice.id,
          checkout_request_id:
            CheckoutRequestID,
        }
      );

      return jsonResponse(
        {
          success: false,
          error:
            "M-Pesa receipt missing",
        },
        400
      );
    }

    /*
     * ------------------------------------------------------
     * REQUIRE PAYMENT AMOUNT
     * ------------------------------------------------------
     */

    if (paidAmount === null) {
      console.error(
        "Successful callback has no payment amount",
        {
          invoice_id: invoice.id,
        }
      );

      return jsonResponse(
        {
          success: false,
          error:
            "Payment amount missing",
        },
        400
      );
    }

    /*
     * ------------------------------------------------------
     * VERIFY PAYMENT AMOUNT
     * ------------------------------------------------------
     */

    if (
      Number(paidAmount) !==
      Number(invoice.amount_kes)
    ) {
      console.error(
        "M-Pesa amount mismatch",
        {
          expected:
            invoice.amount_kes,
          received:
            paidAmount,
          invoice_id:
            invoice.id,
        }
      );

      await supabase
        .from("subscription_invoices")
        .update({
          status: "FAILED",
          result_code:
            ResultCode ?? null,
          result_description:
            "Payment amount does not match invoice amount",
        })
        .eq("id", invoice.id)
        .eq("status", "PENDING");

      return jsonResponse({
        success: false,
        error:
          "Payment amount mismatch",
      });
    }

    /*
     * ------------------------------------------------------
     * ATOMIC PAYMENT RECONCILIATION
     * ------------------------------------------------------
     *
     * PostgreSQL handles:
     *
     * 1. Invoice → PAID
     * 2. Subscription → ACTIVE
     * 3. Billing-period calculation
     * 4. Idempotency
     *
     * All inside one database transaction.
     */

    const {
      data: reconciliation,
      error: reconciliationError,
    } = await supabase.rpc(
      "process_subscription_payment",
      {
        p_invoice_id:
          invoice.id,

        p_checkout_request_id:
          CheckoutRequestID,

        p_mpesa_receipt:
          mpesaReceipt.toString(),

        p_merchant_request_id:
          MerchantRequestID ??
          null,

        p_phone_number:
          phoneNumber?.toString() ??
          null,

        p_result_code:
          ResultCode ?? 0,

        p_result_description:
          ResultDesc ?? null,

        p_paid_amount:
          Number(paidAmount),
      }
    );

    if (reconciliationError) {
      console.error(
        "Subscription payment reconciliation failed:",
        reconciliationError
      );

      throw new Error(
        "Payment received but subscription reconciliation failed"
      );
    }

    /*
     * ------------------------------------------------------
     * SUCCESS
     * ------------------------------------------------------
     */

    return jsonResponse({
      success: true,
      status: "PAID",
      invoice_id: invoice.id,
      subscription_id:
        invoice.subscription_id,
      mpesa_receipt:
        mpesaReceipt,
      reconciliation,
    });

  } catch (error) {
    console.error(
      "Subscription callback error:",
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