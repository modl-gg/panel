# Panel Cleanup Plan

## 1. Dead Code — Safe to Delete

### Unused Duplicate Pages
- `pages/HomePage.tsx` — Unused duplicate of `home.tsx`
- `pages/lookup.tsx` — Unused duplicate of `lookup-page.tsx`
- `pages/appeals-integrated.tsx` — Unused duplicate of `appeals.tsx`
- `pages/analytics.tsx` — Not in routing, never imported

### Unused Components
- `components/analytics/` — Entire directory (7 files): `index.tsx`, `AuditLogs.tsx`, `OverviewCards.tsx`, `PlayerActivity.tsx`, `PunishmentAnalytics.tsx`, `StaffPerformance.tsx`, `TicketAnalytics.tsx`
- `components/dashboard/DashboardMetricsChart.tsx` — Never imported

### Unused Hooks in `use-data.tsx`
- `useRecentActivity()` — 0 imports
- `useAvailablePlayers()` — 0 imports
- `useTicketSubscriptions()` — 0 imports (note: `useTicketSubscriptionUpdates` IS used)
- `usePlayerAllTickets()` — Exact duplicate of `usePlayerTickets()` (same query key, same endpoint)

### Entire File: `hooks/use-data-with-permissions.tsx`
- Contains 5 hooks (`useBillingStatusWithPermissions`, `useUsageDataWithPermissions`, `useStaffDataWithPermissions`, `usePunishmentSettingsWithPermissions`, `useAnalyticsDataWithPermissions`)
- None of them are actually called anywhere in the codebase

---

## 2. Duplicates of shared-web — Delete & Repoint Imports

### `hooks/use-toast.ts` (192 lines)
- 100% identical to `@modl-gg/shared-web/hooks/use-toast`
- ~6 files import from local `@/hooks/use-toast`, ~17 already import from shared-web
- **Action:** Delete file, update 6 imports to `@modl-gg/shared-web`

### `hooks/use-mobile.tsx` (30 lines)
- Duplicate of `@modl-gg/shared-web/hooks/use-mobile` (shared-web version is superior — uses matchMedia)
- **Action:** Delete file, update imports to `@modl-gg/shared-web`

---

## 3. `apiFetch` Duplicated in 10 Files (Critical)

`lib/api.ts` already exports a proper `apiFetch`, but every hook re-defines its own copy:

1. `hooks/use-data.tsx` (lines 10-28)
2. `hooks/use-data-with-permissions.tsx` (lines 5-14)
3. `hooks/use-public-settings.tsx` (lines 4-16)
4. `hooks/use-player-lookup.tsx` (lines 4-13)
5. `hooks/use-permissions.tsx` (lines 7-22)
6. `hooks/use-media-upload.tsx` (lines 5-23)
7. `pages/submit-ticket.tsx` (lines 32-43)
8. `pages/appeals.tsx` (lines 10-20)
9. `pages/HomePage.tsx` (lines 15-25) — (this file is dead code anyway)

**Variations:**
- Some include 429 rate limit handling, some don't
- Inconsistent credential handling (`include` vs conditional based on `/v1/public/`)
- Some add `Content-Type` explicitly

**Action:** Remove all local `apiFetch` definitions. Import from `lib/api.ts` everywhere. Ensure `lib/api.ts` version handles all cases (rate limit, credentials logic).

---

## 4. Duplicate Type Definitions

### `AppealFormField` — defined 3 times
- `pages/appeals.tsx` (~lines 58-63)
- `pages/appeals-integrated.tsx` (lines 43-51) — dead code anyway
- `pages/settings.tsx` (lines 53-64)

### `TicketFormField` / `TicketFormSettings` — defined 2 times
- `components/settings/TicketSettings.tsx` (~lines 20-50)
- `pages/settings.tsx` (lines 83-110)

**Action:** Centralize into a `types/settings.ts` or `types/forms.ts` file.

---

## 5. Duplicate Role Fetch Pattern

Both modals independently fetch `/v1/panel/roles` with inline `useQuery` + manual fetch instead of using existing hooks:

- `components/settings/ChangeRoleModal.tsx` (lines 48-60)
- `components/settings/InviteStaffModal.tsx` (lines 56-68)

**Action:** Create `useAvailableRoles()` hook or use existing hook from `use-data.tsx`.

---

## 6. Redundant API Call Patterns

### `staleTime: 0` on many queries (causes constant refetching)
- `useTicket()` — staleTime: 0, gcTime: 0
- `usePanelTicket()` — staleTime: 0, gcTime: 0
- `usePlayerTickets()` — staleTime: 0
- `usePlayerAllTickets()` — staleTime: 0
- `useSettings()` — staleTime: 0

**Action:** Set reasonable stale times: 30s for tickets, 5min for settings.

### Excessive refetch flags
11+ hooks have both `refetchOnMount: true` AND `refetchOnWindowFocus: true`. This causes unnecessary API calls on every component mount and tab focus.

**Affected:** `usePlayer`, `useLinkedAccounts`, `useTickets`, `usePanelTicket`, `usePlayerTickets`, `useRecentActivity`, `useStats`, `useDashboardMetrics`, `useTicketStatusCounts`, `useMigrationStatus`, `useTicketSubscriptions`

**Action:** Remove `refetchOnMount: true` where data is already cached. Keep `refetchOnWindowFocus` only for real-time data.

### HomePage.tsx direct useEffect+fetch (dead code, but pattern warning)
`pages/HomePage.tsx` uses `useEffect` + direct `fetch` instead of `useQuery`. No caching, no dedup. This file is dead code anyway, but the pattern should not be copied.

---

## 7. Copy-to-Clipboard Logic Duplicated 4 Times

Same pattern in:
- `pages/ticket-detail.tsx`
- `pages/settings.tsx`
- `components/settings/DomainSettings.tsx`
- `components/ArticleMediaUpload.tsx`

```tsx
const [copied, setCopied] = useState(false);
const handleCopy = async () => {
  await navigator.clipboard.writeText(value);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};
```

**Action (optional):** Create `hooks/use-copy-to-clipboard.ts`.

---

## Execution Priority

### Phase 1 — Delete dead code
1. Delete `pages/HomePage.tsx`, `pages/lookup.tsx`, `pages/appeals-integrated.tsx`, `pages/analytics.tsx`
2. Delete `components/analytics/` directory (7 files)
3. Delete `components/dashboard/DashboardMetricsChart.tsx`
4. Delete `hooks/use-data-with-permissions.tsx`
5. Remove unused hooks from `use-data.tsx` (`useRecentActivity`, `useAvailablePlayers`, `useTicketSubscriptions`, `usePlayerAllTickets`)

### Phase 2 — Deduplicate shared-web
6. Delete `hooks/use-toast.ts`, update ~6 imports
7. Delete `hooks/use-mobile.tsx`, update imports

### Phase 3 — Consolidate apiFetch
8. Ensure `lib/api.ts` `apiFetch` handles all edge cases (429, credentials)
9. Remove local `apiFetch` from all 8 remaining files, import from `lib/api.ts`

### Phase 4 — Centralize types
10. Create `types/forms.ts` with `AppealFormField`, `TicketFormField`, etc.
11. Update imports in `settings.tsx`, `appeals.tsx`, `TicketSettings.tsx`

### Phase 5 — Fix API call patterns
12. Update staleTime values across hooks
13. Remove unnecessary refetch flags
14. Deduplicate role-fetching modals
