export const REASON_REQUIRED_PUNISHMENT_TYPES = ['Kick', 'Manual Mute', 'Manual Ban'];

export function requiresPlayerFacingReason(punishmentTypeName: string | undefined): boolean {
  return punishmentTypeName !== undefined && REASON_REQUIRED_PUNISHMENT_TYPES.includes(punishmentTypeName);
}

export function playerFacingReason(punishmentTypeName: string | undefined, reason: string | undefined): string | undefined {
  if (!requiresPlayerFacingReason(punishmentTypeName)) {
    return undefined;
  }
  const trimmed = reason?.trim();
  return trimmed ? trimmed : undefined;
}
