import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fromJson, type DescMessage, type MessageShape } from '@bufbuild/protobuf';
import {
  GeneralSettingsEnvelopeSchema,
  TicketFormSettingsEnvelopeSchema,
  QuickResponseSettingsEnvelopeSchema,
  OffenderThresholdSettingsEnvelopeSchema,
  TicketLabelSettingsEnvelopeSchema,
  ReplayRetentionSettingsEnvelopeSchema,
  WebhookSettingsSchema,
  PublicSettingsResponseSchema,
  type SettingsMeta,
  type GeneralSettings,
  type WebhookSettings,
} from '@modl-gg/proto/modl/v1/settings_pb.ts';
import { apiFetch } from '@/lib/api';
import { protoFetch, ProtoHttpError } from '@/lib/proto-fetch';
import { tsToDate } from '@/lib/proto-ui';
import { isPublicPage } from '@/utils/routes';

type SettingsEnvelope<T> = {
  data: T;
  _meta?: {
    version: number;
    updatedAt?: string | null;
  } | null;
};

function metaToShape(meta?: SettingsMeta): SettingsEnvelope<unknown>['_meta'] {
  if (!meta) {
    return { version: 0, updatedAt: null };
  }
  const updatedAt = tsToDate(meta.updatedAt);
  return {
    version: Number(meta.version),
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
  };
}

type EnvelopePayload<Desc extends DescMessage> =
  MessageShape<Desc> extends { data?: infer D } ? NonNullable<D> : never;

async function fetchSettingsEnvelope<Desc extends DescMessage>(
  schema: Desc,
  path: string,
): Promise<SettingsEnvelope<EnvelopePayload<Desc> | null> | null> {
  let decoded: MessageShape<Desc>;
  try {
    decoded = await protoFetch(schema, path);
  } catch (error) {
    if (error instanceof ProtoHttpError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
  const message = decoded as unknown as { data?: EnvelopePayload<Desc>; meta?: SettingsMeta };
  return {
    data: message.data ?? null,
    _meta: metaToShape(message.meta),
  };
}

export interface ReplayRetentionSettings {
  enabled: boolean;
  days: number;
}

export function useSettings() {
  return useQuery({
    queryKey: ['/v1/settings'],
    queryFn: async () => {
      const isPublic = isPublicPage();

      const fetchPublic = async () => {
        const publicData = await protoFetch(PublicSettingsResponseSchema, '/v1/public/settings');
        return {
          settings: {
            general: {
              serverDisplayName: publicData.serverDisplayName,
              panelIconUrl: publicData.panelIconUrl,
              homepageIconUrl: publicData.homepageIconUrl,
              defaultLanguage: publicData.defaultLanguage
            },
            ticketForms: publicData.ticketForms || {}
          }
        };
      };

      try {
        if (isPublic) {
          return await fetchPublic();
        }

        let generalEnvelope: SettingsEnvelope<Partial<GeneralSettings>> | null = null;
        try {
          const decoded = await protoFetch(GeneralSettingsEnvelopeSchema, '/v1/panel/settings/general');
          generalEnvelope = {
            data: decoded.data ?? {},
            _meta: metaToShape(decoded.meta),
          };
        } catch (error) {
          if (error instanceof ProtoHttpError && error.status === 401) {
            return await fetchPublic();
          }
          throw error;
        }

        let webhookSettings: WebhookSettings | null = null;
        try {
          webhookSettings = await protoFetch(WebhookSettingsSchema, '/v1/panel/settings/webhooks');
        } catch {
          webhookSettings = null;
        }

        const general = generalEnvelope.data || {};
        return {
          settings: {
            ...general,
            general,
            generalMeta: generalEnvelope._meta || null,
            webhookSettings
          }
        };
      } catch (error) {
        try {
          if (isPublic) {
            const decoded = await protoFetch(GeneralSettingsEnvelopeSchema, '/v1/panel/settings/general');
            const general = decoded.data || {};
            return {
              settings: {
                ...general,
                general,
                generalMeta: metaToShape(decoded.meta),
              }
            };
          }
          return await fetchPublic();
        } catch {
          return {
            settings: {
              general: {
                serverDisplayName: 'modl',
                panelIconUrl: null,
                homepageIconUrl: null
              },
              ticketForms: {}
            }
          };
        }
      }
    },
    staleTime: 300000,
    refetchOnWindowFocus: false,
    gcTime: 1000 * 60 * 5,
    refetchInterval: false,
    refetchOnReconnect: false
  });
}

export function useTicketFormSettings() {
  return useQuery({
    queryKey: ['/v1/panel/settings/ticket-forms'],
    queryFn: () => fetchSettingsEnvelope(TicketFormSettingsEnvelopeSchema, '/v1/panel/settings/ticket-forms'),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });
}

export function useQuickResponses() {
  return useQuery({
    queryKey: ['/v1/panel/settings/quick-responses'],
    queryFn: () => fetchSettingsEnvelope(QuickResponseSettingsEnvelopeSchema, '/v1/panel/settings/quick-responses'),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });
}

export function useStatusThresholds() {
  return useQuery({
    queryKey: ['/v1/panel/settings/status-thresholds'],
    queryFn: () => fetchSettingsEnvelope(OffenderThresholdSettingsEnvelopeSchema, '/v1/panel/settings/status-thresholds'),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });
}

export function useTicketLabelSettings() {
  return useQuery({
    queryKey: ['/v1/panel/settings/ticket-labels'],
    queryFn: () => fetchSettingsEnvelope(TicketLabelSettingsEnvelopeSchema, '/v1/panel/settings/ticket-labels'),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });
}

export function useReplayRetentionSettings() {
  return useQuery<SettingsEnvelope<ReplayRetentionSettings> | null>({
    queryKey: ['/v1/panel/settings/replay-retention'],
    queryFn: () => fetchSettingsEnvelope(ReplayRetentionSettingsEnvelopeSchema, '/v1/panel/settings/replay-retention') as Promise<SettingsEnvelope<ReplayRetentionSettings> | null>,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });
}

export function useUpdateReplayRetentionSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: ReplayRetentionSettings & { expectedVersion: number }): Promise<SettingsEnvelope<ReplayRetentionSettings>> => {
      const res = await apiFetch('/v1/panel/settings/replay-retention', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to update replay retention settings');
      }

      const decoded = fromJson(ReplayRetentionSettingsEnvelopeSchema, await res.json(), { ignoreUnknownFields: true });
      return {
        data: (decoded.data ?? { enabled: false, days: 0 }) as ReplayRetentionSettings,
        _meta: metaToShape(decoded.meta),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/settings/replay-retention'] });
    },
  });
}

export function useLabels() {
  return useQuery({
    queryKey: ['/v1/panel/settings/ticket-labels', 'labels'],
    queryFn: async () => {
      const envelope = await fetchSettingsEnvelope(TicketLabelSettingsEnvelopeSchema, '/v1/panel/settings/ticket-labels');
      return envelope?.data?.labels || [];
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });
}
