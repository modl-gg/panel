type NullableString = string | null | undefined;
type NullableDateValue = string | Date | null | undefined;

export type ServerPlan = "FREE" | "PREMIUM";

export type SubscriptionStatus =
  | "ACTIVE"
  | "CANCELED"
  | "PAST_DUE"
  | "INACTIVE"
  | "TRIALING"
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "UNPAID"
  | "PAUSED";

export type ProvisioningStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export type StrictnessLevel = "LENIENT" | "STANDARD" | "STRICT";

const SUBSCRIPTION_STATUS_SET = new Set<SubscriptionStatus>([
  "ACTIVE",
  "CANCELED",
  "PAST_DUE",
  "INACTIVE",
  "TRIALING",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "UNPAID",
  "PAUSED",
]);

const PROVISIONING_STATUS_SET = new Set<ProvisioningStatus>([
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
]);

const STRICTNESS_LEVEL_SET = new Set<StrictnessLevel>(["LENIENT", "STANDARD", "STRICT"]);

function normalizeEnumKey(value: NullableString): string {
  if (!value) return "";
  return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function toValidDate(value: NullableDateValue): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeServerPlan(value: NullableString): ServerPlan {
  return normalizeEnumKey(value) === "PREMIUM" ? "PREMIUM" : "FREE";
}

export function normalizeSubscriptionStatus(value: NullableString): SubscriptionStatus {
  const normalized = normalizeEnumKey(value);
  return SUBSCRIPTION_STATUS_SET.has(normalized as SubscriptionStatus)
    ? (normalized as SubscriptionStatus)
    : "INACTIVE";
}

export function normalizeProvisioningStatus(value: NullableString): ProvisioningStatus {
  const normalized = normalizeEnumKey(value);
  return PROVISIONING_STATUS_SET.has(normalized as ProvisioningStatus)
    ? (normalized as ProvisioningStatus)
    : "PENDING";
}

export function normalizeStrictnessLevel(value: NullableString): StrictnessLevel {
  const normalized = normalizeEnumKey(value);
  return STRICTNESS_LEVEL_SET.has(normalized as StrictnessLevel)
    ? (normalized as StrictnessLevel)
    : "STANDARD";
}

export function formatStrictnessLabel(value: NullableString): string {
  const strictness = normalizeStrictnessLevel(value);
  switch (strictness) {
    case "LENIENT":
      return "Lenient";
    case "STRICT":
      return "Strict";
    default:
      return "Standard";
  }
}

export function formatSubscriptionStatusLabel(value: NullableString): string {
  const status = normalizeSubscriptionStatus(value);
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "TRIALING":
      return "Trial";
    case "PAST_DUE":
      return "Past Due";
    case "CANCELED":
      return "Canceled";
    case "INCOMPLETE_EXPIRED":
      return "Incomplete Expired";
    default:
      return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function hasPremiumAccess(params: {
  plan: NullableString;
  subscriptionStatus: NullableString;
  currentPeriodEnd?: NullableDateValue;
}): boolean {
  const plan = normalizeServerPlan(params.plan);
  if (plan !== "PREMIUM") return false;

  const status = normalizeSubscriptionStatus(params.subscriptionStatus);
  const currentPeriodEnd = toValidDate(params.currentPeriodEnd);
  const hasFuturePeriod = currentPeriodEnd ? currentPeriodEnd.getTime() > Date.now() : false;

  if (status === "CANCELED") {
    return hasFuturePeriod;
  }

  if (status === "PAST_DUE" || status === "UNPAID" || status === "INCOMPLETE") {
    return hasFuturePeriod;
  }

  if (status === "INACTIVE" || status === "INCOMPLETE_EXPIRED" || status === "PAUSED") {
    return false;
  }

  return true;
}
