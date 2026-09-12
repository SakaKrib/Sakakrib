import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Crown, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { djangoPmsGateway } from "@/lib/djangoPmsGateway";
import { protectedGet } from "@/lib/djangoLegacyApi";
import { useNav } from "@/context/NavContext";
import PMSPlanSelector, { type PMSBillingCycle, type PMSPlanName, type PMSSubscriptionPlan } from "./PMSPlanSelector";

type PMSRole = "landlord" | "real_estate";
type PMSSubscriptionStatus = "PENDING_PAYMENT" | "ACTIVE" | "GRACE_PERIOD" | "EXPIRED" | "CANCELLED" | "PAST_DUE";
interface PMSSubscription {
  id: string;
  plan_id: string;
  plan_name: string;
  billing_cycle: PMSBillingCycle;
  status: PMSSubscriptionStatus;
  max_listings: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_period_end: string | null;
  auto_renew: boolean;
  billing_amount_kes?: number | null;
  billing_amount_usd?: number | null;
  paypal_subscription_id?: string | null;
  paypal_status?: string | null;
  next_billing_at?: string | null;
  cancel_at_period_end?: boolean;
  cancelled_at?: string | null;
}
type RPCRow = Record<string, unknown>;
const PMS_PLAN_NAMES: readonly PMSPlanName[] = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"];

function firstRow(data: unknown): RPCRow | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" && !Array.isArray(first) ? (first as RPCRow) : null;
  }
  return data && typeof data === "object" && !Array.isArray(data) ? (data as RPCRow) : null;
}
function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}
function nullableString(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}
function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
}
function normalizeRole(value: unknown): PMSRole {
  const role = String(value ?? "").trim().toLowerCase();
  return ["real_estate", "real-estate", "real estate", "realestate"].includes(role) ? "real_estate" : "landlord";
}
function normalizePlanName(value: unknown): PMSPlanName | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return PMS_PLAN_NAMES.includes(normalized as PMSPlanName) ? (normalized as PMSPlanName) : null;
}
function normalizeBillingCycle(value: unknown): PMSBillingCycle {
  return String(value ?? "").trim().toUpperCase() === "ANNUAL" ? "ANNUAL" : "MONTHLY";
}
function normalizeStatus(value: unknown): PMSSubscriptionStatus {
  const status = String(value ?? "").trim().toUpperCase();
  switch (status) {
    case "PENDING_PAYMENT":
    case "ACTIVE":
    case "GRACE_PERIOD":
    case "EXPIRED":
    case "CANCELLED":
    case "PAST_DUE":
      return status;
    default:
      return "EXPIRED";
  }
}
function normalizeSubscription(row: RPCRow): PMSSubscription | null {
  const id = stringValue(row.id ?? row.subscription_id);
  if (!id) return null;
  return {
    id,
    plan_id: stringValue(row.plan_id),
    plan_name: stringValue(row.plan_name ?? row.name) || "STARTER",
    billing_cycle: normalizeBillingCycle(row.billing_cycle),
    status: normalizeStatus(row.status ?? row.subscription_status),
    max_listings: nullableNumber(row.max_listings ?? row.max_properties ?? row.listing_limit ?? row.subscription_limit),
    current_period_start: nullableString(row.current_period_start),
    current_period_end: nullableString(row.current_period_end),
    grace_period_end: nullableString(row.grace_period_end),
    auto_renew: booleanValue(row.auto_renew),
    billing_amount_kes: nullableNumber(row.billing_amount_kes),
    billing_amount_usd: nullableNumber(row.billing_amount_usd),
    paypal_subscription_id: nullableString(row.paypal_subscription_id),
    paypal_status: nullableString(row.paypal_status),
    next_billing_at: nullableString(row.next_billing_at),
    cancel_at_period_end: row.cancel_at_period_end === undefined ? false : booleanValue(row.cancel_at_period_end),
    cancelled_at: nullableString(row.cancelled_at),
  };
}
function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function formatKES(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(value);
}

export default function PMSSubscriptionPage() {
  const [role, setRole] = useState<PMSRole | null>(null);
  const [subscription, setSubscription] = useState<PMSSubscription | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PMSPlanName | null>(null);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<PMSBillingCycle>("MONTHLY");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { navigate } = useNav();

  const loadProfile = useCallback(async () => {
    const { data: authData, error: userError } = await djangoPmsGateway.auth.getUser();
    if (userError) throw userError;
    if (!authData?.user) throw new Error("You must be signed in to access PMS.");
    const profiles = await protectedGet<any[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(authData.user.id)}&select=id,role`);
    const profile = Array.isArray(profiles) ? profiles[0] ?? null : profiles;
    if (!profile) throw new Error("Profile not found");
    const profileRole = String(profile.role ?? "").trim().toLowerCase();
    if (profileRole !== "landlord" && profileRole !== "real_estate") throw new Error("PMS subscriptions are available only to landlord and real estate accounts.");
    return { id: authData.user.id, role: normalizeRole(profileRole) };
  }, []);

  const loadSubscription = useCallback(async () => {
    try {
      setError(null);
      const profile = await loadProfile();
      setRole(profile.role);
      const result = await djangoPmsGateway.rpc(
        profile.role === "landlord" ? "get_my_pms_subscription" : "get_current_real_estate_subscription",
        profile.role === "real_estate" ? { p_real_estate_id: profile.id } : undefined,
      );
      if (result.error) throw result.error;
      const raw = firstRow(result.data);
      const normalized = raw ? normalizeSubscription(raw) : null;
      setSubscription(normalized);
      setSelectedBillingCycle(normalized?.billing_cycle ?? "MONTHLY");
      setSelectedPlan(normalizePlanName(normalized?.plan_name));
    } catch (err) {
      setSubscription(null);
      setSelectedPlan(null);
      setError(err instanceof Error ? err.message : "Unable to load your PMS subscription.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadProfile]);

  useEffect(() => { void loadSubscription(); }, [loadSubscription]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    await loadSubscription();
  }, [loadSubscription, refreshing]);

  const handlePlanChange = useCallback((plan: PMSSubscriptionPlan) => {
    setSelectedPlan(normalizePlanName(plan.name));
  }, []);

  const handleProceedToPayment = useCallback((plan: PMSSubscriptionPlan, cycle: PMSBillingCycle) => {
    setSelectedPlan(normalizePlanName(plan.name));
    setSelectedBillingCycle(cycle);
  }, []);

  const handleGoToDashboard = useCallback(() => { navigate("pms-dashboard"); }, [navigate]);
  const currentPlanName = normalizePlanName(subscription?.plan_name);
  const planSelector = role ? (
    <PMSPlanSelector
      role={role}
      selectedPlanName={selectedPlan ?? currentPlanName ?? "STARTER"}
      billingCycle={selectedBillingCycle}
      currentPlanId={subscription?.plan_id ?? null}
      currentPlanName={currentPlanName}
      currentBillingCycle={subscription?.billing_cycle ?? null}
      onPlanChange={handlePlanChange}
      onBillingCycleChange={setSelectedBillingCycle}
      onProceedToPayment={handleProceedToPayment}
      onPaymentSuccess={handleRefresh}
      onGoToDashboard={handleGoToDashboard}
    />
  ) : null;

  if (loading) return (
    <section className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-6"><div className="h-8 w-72 rounded bg-gray-200 dark:bg-gray-800" /><div className="card h-64" /></div>
    </section>
  );

  if (error) return (
    <section className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
      <div className="card overflow-hidden border-red-200 dark:border-red-900">
        <div className="border-b border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/30"><p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400"><AlertCircle className="h-4 w-4" />PMS Subscription Error</p></div>
        <div className="p-6"><p className="font-semibold text-gray-900 dark:text-white">Unable to load PMS</p><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{error}</p><button type="button" onClick={() => void handleRefresh()} disabled={refreshing} className="btn-secondary mt-5">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Try Again</button></div>
      </div>
    </section>
  );

  if (!role) return null;

  if (!subscription) return (
    <section className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white"><Crown className="h-6 w-6 text-brand-600" />{role === "landlord" ? "PMS Subscription" : "Real Estate Subscription"}</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose a subscription plan to activate your {role === "landlord" ? "PMS management" : "real estate listing entitlement"}.</p></div>
        <button type="button" onClick={() => void handleRefresh()} disabled={refreshing} className="btn-secondary">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh</button>
      </div>
      <div className="card p-6">{planSelector}</div>
    </section>
  );

  return (
    <section className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white"><Crown className="h-6 w-6 text-brand-600" />PMS Subscription</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage your subscription, billing cycle, payment and renewal options.</p></div>
        <button type="button" onClick={() => void handleRefresh()} disabled={refreshing} className="btn-secondary">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh</button>
      </div>

      {subscription.status === "PENDING_PAYMENT" && <StatusNotice icon={<Clock3 className="h-4 w-4" />} title="Payment Pending" heading="Complete your subscription payment" description="Complete payment to activate your subscription." tone="amber" />}
      {subscription.status === "PAST_DUE" && <StatusNotice icon={<ShieldAlert className="h-4 w-4" />} title="Payment Past Due" heading="Your subscription payment is past due" description="Please complete payment to keep your subscription active." tone="amber" />}

      <div className="card mb-6 overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-4 py-3 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50"><p className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300"><Crown className="h-4 w-4" />Current Subscription</p></div>
        <div className="p-6">
          <div className="flex items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200"><Crown className="h-7 w-7" /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-gray-900 dark:text-white">{subscription.plan_name}</h2><SubscriptionStatus status={subscription.status} /></div><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{role === "real_estate" ? `Your ${subscription.plan_name} real estate subscription.` : `Your ${subscription.plan_name} Saka Crib PMS subscription.`}</p><p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">Billed {subscription.billing_cycle === "MONTHLY" ? "monthly" : "annually"}</p></div></div>
          <div className="mt-6 grid gap-4 border-t border-gray-200 pt-6 dark:border-gray-800 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem icon={<CalendarDays className="h-4 w-4" />} label="Period started" value={formatDate(subscription.current_period_start)} />
            <InfoItem icon={<CalendarDays className="h-4 w-4" />} label="Period ends" value={formatDate(subscription.current_period_end)} />
            <InfoItem label={role === "landlord" ? "Property limit" : "Listing limit"} value={subscription.max_listings === null ? "Unlimited" : `${subscription.max_listings} ${role === "landlord" ? "properties" : "listings"}`} />
            <InfoItem label="Auto renewal" value={subscription.auto_renew ? "Enabled" : "Disabled"} />
          </div>
          <div className="mt-4 grid gap-4 border-t border-gray-200 pt-4 dark:border-gray-800 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem label="Billing amount" value={formatKES(subscription.billing_amount_kes)} />
            <InfoItem label="Next billing" value={formatDate(subscription.next_billing_at ?? null)} />
            <InfoItem label="Payment status" value={subscription.paypal_status ?? subscription.status} />
            <InfoItem label="Cancellation" value={subscription.cancel_at_period_end ? "At period end" : "Not scheduled"} />
          </div>
        </div>
      </div>

      {subscription.status === "GRACE_PERIOD" && <StatusNotice icon={<Clock3 className="h-4 w-4" />} title="Grace Period" heading="Your subscription is in the grace period" description={`Renew before ${subscription.grace_period_end ? formatDate(subscription.grace_period_end) : "the grace period ends"} to maintain access.`} tone="amber" />}
      {subscription.status === "EXPIRED" && <StatusNotice icon={<ShieldAlert className="h-4 w-4" />} title="Subscription Expired" heading="Subscription expired" description="Select a new plan below to review the subscription options available to your account." tone="red" />}
      {subscription.status === "CANCELLED" && <StatusNotice icon={<ShieldAlert className="h-4 w-4" />} title="Subscription Cancelled" heading="Subscription cancelled" description="Select a plan below to review the subscription options available to your account." tone="gray" />}

      <div className="card overflow-hidden">
        <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-800"><h2 className="text-lg font-bold text-gray-900 dark:text-white">Available {role === "landlord" ? "PMS" : "Subscription"} Plans</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Compare plans, change your billing cycle, renew, or upgrade your subscription.</p></div>
        <div className="p-6">
          {planSelector}
          {selectedPlan !== currentPlanName || selectedBillingCycle !== subscription.billing_cycle ? <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/20"><p className="text-sm font-semibold text-brand-700 dark:text-brand-300">New selection</p><p className="mt-1 text-sm text-brand-600 dark:text-brand-400">{selectedPlan ?? "No plan selected"} — {selectedBillingCycle === "MONTHLY" ? "Monthly" : "Annual"} billing</p></div> : <div className="mt-5 rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-800 dark:bg-success-950/20"><p className="flex items-center gap-2 text-sm font-semibold text-success-700 dark:text-success-400"><CheckCircle2 className="h-4 w-4" />Current plan selected</p></div>}
        </div>
      </div>
    </section>
  );
}

function StatusNotice({ icon, title, heading, description, tone }: { icon: ReactNode; title: string; heading: string; description: string; tone: "amber" | "red" | "gray" }) {
  const styles = {
    amber: { wrapper: "border-amber-200 dark:border-amber-900", header: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400" },
    red: { wrapper: "border-red-200 dark:border-red-900", header: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30", text: "text-red-700 dark:text-red-400" },
    gray: { wrapper: "border-gray-200 dark:border-gray-800", header: "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50", text: "text-gray-700 dark:text-gray-300" },
  }[tone];
  return <div className={`card mb-6 overflow-hidden ${styles.wrapper}`}><div className={`border-b px-4 py-3 ${styles.header}`}><p className={`flex items-center gap-2 text-sm font-semibold ${styles.text}`}>{icon}{title}</p></div><div className="p-5"><h2 className="font-semibold text-gray-900 dark:text-white">{heading}</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p></div></div>;
}

function SubscriptionStatus({ status }: { status: PMSSubscriptionStatus }) {
  const labels: Record<PMSSubscriptionStatus, string> = { PENDING_PAYMENT: "Payment Pending", ACTIVE: "Active", GRACE_PERIOD: "Grace Period", EXPIRED: "Expired", CANCELLED: "Cancelled", PAST_DUE: "Payment Past Due" };
  const classes: Record<PMSSubscriptionStatus, string> = {
    PENDING_PAYMENT: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400",
    ACTIVE: "border-success-200 bg-success-50 text-success-700 dark:border-success-800 dark:bg-success-900/20 dark:text-success-400",
    GRACE_PERIOD: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-400",
    EXPIRED: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400",
    CANCELLED: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400",
    PAST_DUE: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400",
  };
  return <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${classes[status]}`}>{labels[status]}</span>;
}

function InfoItem({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-900/50"><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{icon}{label}</p><p className="mt-1.5 font-semibold text-gray-900 dark:text-white">{value}</p></div>;
}
