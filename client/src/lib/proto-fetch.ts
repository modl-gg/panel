import { fromJson, toJson, type DescMessage, type MessageShape } from '@bufbuild/protobuf';
import { apiFetch } from '@/lib/api';

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type MutateMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ProtoFetchInit {
  method?: RequestMethod;
  body?: unknown;
}

// Backend ProtoJsonHttpMessageConverter emits canonical proto-JSON. ignoreUnknownFields
// guards against additive backend fields landing before the panel proto bump, so a new
// field never throws in production.
const READ_OPTS = { ignoreUnknownFields: true } as const;

export class ProtoHttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly bodyText: string,
  ) {
    super(`${status}: ${bodyText || statusText}`);
    this.name = 'ProtoHttpError';
  }
}

async function readErrorBody(res: Response): Promise<string> {
  return res.text().catch(() => '');
}

/** GET (or any verb) → decode the proto-JSON body into a typed message. */
export async function protoFetch<Desc extends DescMessage>(
  schema: Desc,
  path: string,
  init?: ProtoFetchInit,
): Promise<MessageShape<Desc>> {
  const res = await apiFetch(path, { method: init?.method ?? 'GET', body: init?.body });
  if (!res.ok) {
    throw new ProtoHttpError(res.status, res.statusText, await readErrorBody(res));
  }
  return fromJson(schema, await res.json(), READ_OPTS);
}

/** GET that resolves to null on 404 (mirrors the existing `if 404 return null` idiom). */
export async function protoFetchOrNull<Desc extends DescMessage>(
  schema: Desc,
  path: string,
  init?: ProtoFetchInit,
): Promise<MessageShape<Desc> | null> {
  const res = await apiFetch(path, { method: init?.method ?? 'GET', body: init?.body });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ProtoHttpError(res.status, res.statusText, await readErrorBody(res));
  }
  return fromJson(schema, await res.json(), READ_OPTS);
}

/** Encode a typed request message to proto-JSON, send it, and decode the typed response. */
export async function protoSend<ReqDesc extends DescMessage, ResDesc extends DescMessage>(
  method: MutateMethod,
  path: string,
  reqSchema: ReqDesc,
  req: MessageShape<ReqDesc>,
  resSchema: ResDesc,
): Promise<MessageShape<ResDesc>> {
  // toJson returns a plain object; apiFetch performs the single JSON.stringify. Pass the
  // object, not a pre-stringified string, so api.ts keeps its one stringify path.
  const body = toJson(reqSchema, req);
  const res = await apiFetch(path, { method, body });
  if (!res.ok) {
    throw new ProtoHttpError(res.status, res.statusText, await readErrorBody(res));
  }
  return fromJson(resSchema, await res.json(), READ_OPTS);
}
