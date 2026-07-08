import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  BillingStatusResponseSchema,
  UsageResponseSchema,
  CancelResponseSchema,
  ResubscribeResponseSchema,
  UsageBillingSettingsRequestSchema,
  UsageBillingSettingsResponseSchema,
  CheckoutSessionResponseSchema,
  PortalSessionResponseSchema,
  type UsageResponse_UsageMetric,
} from '@modl-gg/proto/modl/v1/billing_pb.ts';
import { protoFetch, protoSend } from '@/lib/proto-fetch';
import { tsToDate, tsToMillis, toNum } from '@/lib/proto-ui';

export interface BillingStatus {
  plan: string;
  subscriptionStatus: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  customDomainGrandfathered?: boolean;
  maxStorageLimitBytes?: number;
  maxAiOverageRequests?: number;
}

export interface UsageMetric {
  used: number;
  limit: number;
  overage: number;
  overageRate: number;
  overageCost: number;
  percentage: number;
}

export interface UsageData {
  period: { start: number | null; end: number | null };
  cdn?: UsageMetric;
  ai?: UsageMetric;
  totalOverageCost: number;
  usageBillingEnabled: boolean;
}

const toUsageMetric = (m: UsageResponse_UsageMetric): UsageMetric => ({
  used: m.used,
  limit: m.limit,
  overage: m.overage,
  overageRate: m.overageRate,
  overageCost: m.overageCost,
  percentage: m.percentage,
});

export function useBillingStatus() {
  return useQuery<BillingStatus>({
    queryKey: ['/v1/panel/billing/status'],
    queryFn: async () => {
      const res = await protoFetch(BillingStatusResponseSchema, '/v1/panel/billing/status');
      return {
        plan: res.plan,
        subscriptionStatus: res.subscriptionStatus,
        currentPeriodStart: tsToDate(res.currentPeriodStart),
        currentPeriodEnd: tsToDate(res.currentPeriodEnd),
        customDomainGrandfathered: res.customDomainGrandfathered,
        maxStorageLimitBytes:
          res.maxStorageLimitBytes !== undefined ? toNum(res.maxStorageLimitBytes) : undefined,
        maxAiOverageRequests:
          res.maxAiOverageRequests !== undefined ? toNum(res.maxAiOverageRequests) : undefined,
      };
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      protoFetch(CancelResponseSchema, '/v1/panel/billing/cancel', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/status'] });
    },
  });
}

export function useUsageData() {
  return useQuery<UsageData>({
    queryKey: ['/v1/panel/billing/usage'],
    queryFn: async () => {
      const res = await protoFetch(UsageResponseSchema, '/v1/panel/billing/usage');
      return {
        period: {
          start: tsToMillis(res.period?.start),
          end: tsToMillis(res.period?.end),
        },
        cdn: res.cdn ? toUsageMetric(res.cdn) : undefined,
        ai: res.ai ? toUsageMetric(res.ai) : undefined,
        totalOverageCost: res.totalOverageCost,
        usageBillingEnabled: res.usageBillingEnabled,
      };
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateUsageBillingSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ enabled }: { enabled: boolean }) =>
      protoSend(
        'POST',
        '/v1/panel/billing/usage-settings',
        UsageBillingSettingsRequestSchema,
        create(UsageBillingSettingsRequestSchema, { enabled }),
        UsageBillingSettingsResponseSchema,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/usage'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/status'] });
    },
  });
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: () =>
      protoFetch(CheckoutSessionResponseSchema, '/v1/panel/billing/checkout-session', {
        method: 'POST',
      }),
  });
}

export function useCreatePortalSession() {
  return useMutation({
    mutationFn: () =>
      protoFetch(PortalSessionResponseSchema, '/v1/panel/billing/portal-session', {
        method: 'POST',
      }),
  });
}

export function useResubscribe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      protoFetch(ResubscribeResponseSchema, '/v1/panel/billing/resubscribe', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/status'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/usage'] });
    },
  });
}
