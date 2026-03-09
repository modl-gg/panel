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

export type TicketLifecycleStatus = "UNFINISHED" | "OPEN" | "CLOSED";

export type AppealWorkflowStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "PENDING_PLAYER_RESPONSE"
  | "APPROVED"
  | "REJECTED";

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

const TICKET_LIFECYCLE_SET = new Set<TicketLifecycleStatus>(["UNFINISHED", "OPEN", "CLOSED"]);

const APPEAL_WORKFLOW_SET = new Set<AppealWorkflowStatus>([
  "OPEN",
  "UNDER_REVIEW",
  "PENDING_PLAYER_RESPONSE",
  "APPROVED",
  "REJECTED",
]);

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

export function normalizeTicketLifecycleStatus(value: NullableString): TicketLifecycleStatus {
  const normalized = normalizeEnumKey(value);
  if (normalized === "DRAFT") return "UNFINISHED";
  if (normalized === "IN_PROGRESS") return "OPEN";
  return TICKET_LIFECYCLE_SET.has(normalized as TicketLifecycleStatus)
    ? (normalized as TicketLifecycleStatus)
    : "OPEN";
}

export function formatTicketLifecycleLabel(value: NullableString): string {
  const status = normalizeTicketLifecycleStatus(value);
  switch (status) {
    case "UNFINISHED":
      return "Unfinished";
    case "CLOSED":
      return "Closed";
    default:
      return "Open";
  }
}

export function isTicketClosed(value: NullableString): boolean {
  return normalizeTicketLifecycleStatus(value) === "CLOSED";
}

export function normalizeAppealWorkflowStatus(value: NullableString): AppealWorkflowStatus | null {
  const normalized = normalizeEnumKey(value);
  if (!normalized) return null;
  return APPEAL_WORKFLOW_SET.has(normalized as AppealWorkflowStatus)
    ? (normalized as AppealWorkflowStatus)
    : null;
}

export function formatAppealWorkflowLabel(value: NullableString): string {
  const workflowStatus = normalizeAppealWorkflowStatus(value);
  switch (workflowStatus) {
    case "OPEN":
      return "Pending Review";
    case "UNDER_REVIEW":
      return "Under Review";
    case "PENDING_PLAYER_RESPONSE":
      return "Pending Player Response";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    default:
      return "";
  }
}

export function getAppealStatusLabel(params: {
  appealWorkflowStatus?: NullableString;
  lifecycleStatus?: NullableString;
}): string {
  const workflowLabel = formatAppealWorkflowLabel(params.appealWorkflowStatus);
  return workflowLabel || formatTicketLifecycleLabel(params.lifecycleStatus);
}

export function isAppealTerminalStatus(params: {
  appealWorkflowStatus?: NullableString;
  lifecycleStatus?: NullableString;
}): boolean {
  const workflowStatus = normalizeAppealWorkflowStatus(params.appealWorkflowStatus);
  if (workflowStatus) {
    return workflowStatus === "APPROVED" || workflowStatus === "REJECTED";
  }
  return isTicketClosed(params.lifecycleStatus);
}

export function formatTicketCategoryLabel(value: NullableString): string {
  if (!value) return "Support";

  const rawValue = value.trim();
  const normalized = normalizeEnumKey(rawValue);

  switch (normalized) {
    case "BUG":
    case "BUG_REPORT":
      return "Bug Report";
    case "PLAYER":
    case "PLAYER_REPORT":
      return "Player Report";
    case "CHAT":
    case "CHAT_REPORT":
      return "Chat Report";
    case "APPEAL":
    case "BAN_APPEAL":
    case "PUNISHMENT_APPEAL":
      return "Ban Appeal";
    case "APPLICATION":
    case "STAFF":
    case "STAFF_APPLICATION":
      return "Staff Application";
    case "SUPPORT":
    case "GENERAL_SUPPORT":
      return "Support";
    default:
      if (/[A-Z]/.test(rawValue) || rawValue.includes(" ")) {
        return rawValue;
      }
      return normalized
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
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
