export type PunishmentStatusKind = 'pardoned' | 'unstarted' | 'active' | 'inactive';

export interface PunishmentModificationLike {
  type?: string;
  date?: string | Date | null;
  effectiveDuration?: number | null;
}

export interface EffectivePunishmentInput<M extends PunishmentModificationLike = PunishmentModificationLike> {
  modifications?: M[];
  active?: boolean;
  expires?: string | Date | null;
  duration?: number | null;
  data?: Record<string, unknown>;
}

export interface PunishmentStatusInput<M extends PunishmentModificationLike = PunishmentModificationLike>
  extends EffectivePunishmentInput<M> {
  started?: string | Date | null;
  status?: string | null;
}

export interface EffectivePunishmentState<M extends PunishmentModificationLike = PunishmentModificationLike> {
  originalActive: boolean;
  originalExpiry?: string | Date | null;
  originalDuration?: number | null;
  effectiveActive: boolean;
  effectiveExpiry?: string | Date | null;
  effectiveDuration?: number | null;
  hasModifications: boolean;
  modifications: M[];
}

const PARDON_MODIFICATION_TYPES = new Set(['MANUAL_PARDON', 'APPEAL_ACCEPT', 'SYSTEM_PARDON']);
const DURATION_CHANGE_MODIFICATION_TYPES = new Set(['MANUAL_DURATION_CHANGE', 'APPEAL_DURATION_CHANGE']);

export const isPardonModification = (modification: { type?: string } | null | undefined): boolean =>
  PARDON_MODIFICATION_TYPES.has(modification?.type ?? '');

export const isDurationChangeModification = (modification: { type?: string } | null | undefined): boolean =>
  DURATION_CHANGE_MODIFICATION_TYPES.has(modification?.type ?? '');

export const findPardonModification = <M extends PunishmentModificationLike>(
  modifications: M[],
): M | undefined => modifications.find(isPardonModification);

const isPermanentDuration = (duration: number): boolean => duration <= 0;

const toValidTime = (value: string | Date | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const modificationTime = (modification: PunishmentModificationLike): number =>
  toValidTime(modification.date) ?? 0;

export function getEffectivePunishmentState<M extends PunishmentModificationLike>(
  punishment: EffectivePunishmentInput<M>,
): EffectivePunishmentState<M> {
  const modifications = punishment.modifications ?? [];
  const originalActive =
    punishment.active !== undefined ? punishment.active : punishment.data?.active !== false;

  let effectiveActive = originalActive;
  let effectiveExpiry = punishment.expires;
  let effectiveDuration = punishment.duration;

  const sortedModifications = [...modifications].sort(
    (a, b) => modificationTime(a) - modificationTime(b),
  );

  for (const modification of sortedModifications) {
    if (isPardonModification(modification)) {
      effectiveActive = false;
    } else if (
      isDurationChangeModification(modification) &&
      modification.effectiveDuration !== null &&
      modification.effectiveDuration !== undefined
    ) {
      effectiveDuration = modification.effectiveDuration;
      if (isPermanentDuration(modification.effectiveDuration)) {
        effectiveExpiry = null;
        effectiveActive = true;
      } else {
        const changeTime = toValidTime(modification.date);
        if (changeTime !== null) {
          const newExpiry = new Date(changeTime + modification.effectiveDuration);
          effectiveExpiry = newExpiry;
          effectiveActive = newExpiry.getTime() > Date.now();
        }
      }
    }
  }

  if (effectiveActive) {
    const expiryTime = toValidTime(effectiveExpiry);
    if (expiryTime !== null && expiryTime <= Date.now()) {
      effectiveActive = false;
    }
  }

  return {
    originalActive,
    originalExpiry: punishment.expires,
    originalDuration: punishment.duration,
    effectiveActive,
    effectiveExpiry,
    effectiveDuration,
    hasModifications: modifications.length > 0,
    modifications: sortedModifications,
  };
}

export function derivePunishmentStatusFromState<M extends PunishmentModificationLike>(
  punishment: { started?: string | Date | null; status?: string | null },
  state: EffectivePunishmentState<M>,
): PunishmentStatusKind {
  if (findPardonModification(state.modifications) || punishment.status?.toLowerCase() === 'pardoned') {
    return 'pardoned';
  }
  if (!punishment.started) {
    return 'unstarted';
  }
  return state.effectiveActive ? 'active' : 'inactive';
}

export function derivePunishmentStatus<M extends PunishmentModificationLike>(
  punishment: PunishmentStatusInput<M>,
): PunishmentStatusKind {
  return derivePunishmentStatusFromState(punishment, getEffectivePunishmentState(punishment));
}

export function deriveEffectiveDurationMs(punishment: {
  duration?: number | null;
  started?: string | Date | null;
  expires?: string | Date | null;
}): number | null {
  const rawDuration =
    punishment.duration !== null && punishment.duration !== undefined && !isPermanentDuration(punishment.duration)
      ? punishment.duration
      : null;

  const startedTime = toValidTime(punishment.started);
  const expiresTime = toValidTime(punishment.expires);

  if (expiresTime === null) {
    return startedTime === null ? rawDuration : null;
  }
  if (startedTime === null) {
    return rawDuration;
  }
  return Math.max(expiresTime - startedTime, 0);
}
