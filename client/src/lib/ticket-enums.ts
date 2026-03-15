type NullableString = string | null | undefined;

function normalizeEnumValue(value: NullableString): string {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const TICKET_STATUS_ALIASES: Record<string, "unfinished" | "open" | "closed"> = {
  unfinished: "unfinished",
  draft: "unfinished",
  open: "open",
  new: "open",
  active: "open",
  pending: "open",
  in_progress: "open",
  inprogress: "open",
  closed: "closed",
  resolved: "closed",
  complete: "closed",
  completed: "closed",
  done: "closed",
};

const APPEAL_STATUS_ALIASES: Record<string, "open" | "under_review" | "pending_player_response" | "approved" | "rejected" | "closed"> = {
  open: "open",
  pending_review: "open",
  under_review: "under_review",
  underreview: "under_review",
  pending_player_response: "pending_player_response",
  pendingplayerresponse: "pending_player_response",
  approved: "approved",
  approve: "approved",
  accepted: "approved",
  accept: "approved",
  rejected: "rejected",
  reject: "rejected",
  denied: "rejected",
  deny: "rejected",
  closed: "closed",
  resolved: "closed",
  complete: "closed",
  completed: "closed",
  done: "closed",
};

export type NormalizedTicketStatus = "unfinished" | "open" | "closed";
export type NormalizedAppealStatus = "open" | "under_review" | "pending_player_response" | "approved" | "rejected" | "closed";

export function normalizeTicketStatus(value: NullableString): NormalizedTicketStatus {
  return TICKET_STATUS_ALIASES[normalizeEnumValue(value)] || "open";
}

export function formatTicketStatusLabel(value: NullableString): string {
  switch (normalizeTicketStatus(value)) {
    case "unfinished":
      return "Unfinished";
    case "closed":
      return "Closed";
    default:
      return "Open";
  }
}

export function isClosedTicketStatus(value: NullableString): boolean {
  return normalizeTicketStatus(value) === "closed";
}

export function normalizeAppealStatus(value: NullableString): NormalizedAppealStatus {
  return APPEAL_STATUS_ALIASES[normalizeEnumValue(value)] || "open";
}

export function formatAppealStatusLabel(value: NullableString): string {
  switch (normalizeAppealStatus(value)) {
    case "under_review":
      return "Under Review";
    case "pending_player_response":
      return "Pending Player Response";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "closed":
      return "Closed";
    default:
      return "Pending Review";
  }
}

export function isTerminalAppealStatus(value: NullableString): boolean {
  const status = normalizeAppealStatus(value);
  return status === "approved" || status === "rejected" || status === "closed";
}
