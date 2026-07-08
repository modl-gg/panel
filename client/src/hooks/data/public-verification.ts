import { create, fromJson, toJson } from '@bufbuild/protobuf';
import { apiFetch } from '@/lib/api';
import {
  PublicTicketVerificationRequestResponseSchema,
  PublicTicketVerificationResponseSchema,
  VerifyTicketCodeRequestSchema,
} from '@modl-gg/proto/modl/v1/ticket_pb.ts';

const READ_OPTS = { ignoreUnknownFields: true } as const;

export type PublicRecordResource = 'ticket' | 'appeal';

export function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  const value = match?.[2];
  return value !== undefined ? decodeURIComponent(value) : null;
}

export function publicAuthTokenKey(resource: PublicRecordResource, id: string): string {
  return `${resource}_auth_${id}`;
}

export function withPublicAuthToken(path: string, resource: PublicRecordResource, id: string): string {
  const token = getCookie(publicAuthTokenKey(resource, id));
  return token ? `${path}?token=${encodeURIComponent(token)}` : path;
}

export async function requestPublicVerification(recordPath: string) {
  const res = await apiFetch(`${recordPath}/request-verification`, {
    method: 'POST',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to request verification');
  }

  return fromJson(PublicTicketVerificationRequestResponseSchema, await res.json(), READ_OPTS);
}

export async function verifyPublicCode(recordPath: string, code: string) {
  const request = create(VerifyTicketCodeRequestSchema, { code });

  const res = await apiFetch(`${recordPath}/verify`, {
    method: 'POST',
    body: toJson(VerifyTicketCodeRequestSchema, request),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Invalid or expired code');
  }

  return fromJson(PublicTicketVerificationResponseSchema, await res.json(), READ_OPTS);
}
