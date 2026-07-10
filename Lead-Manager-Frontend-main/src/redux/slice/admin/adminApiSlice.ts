// src/redux/slice/admin/adminApiSlice.ts
import apiSlice from "@/redux/apiSlice";

/** Roles:
 *  1 = Telecaller
 *  2 = Admin
 */
export interface BaseUser {
  _id: string;
  name?: string;
  mobile: string;
  role: 1 | 2;
  avatarUrl?: string;
  blocked?: boolean;
  blockedReason?: string | null;
  blockedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
export interface Telecaller extends BaseUser { role: 1 }
export interface AdminUser extends BaseUser { role: 2 }

/* ------------------------- Reports Types ------------------------- */

// Telecaller performance row (extended)
export interface TelecallerReportRow {
  telecallerId: string;
  name?: string;
  mobile?: string;
  totalLeads: number;
  initialize: number;
  followup: number;
  success: number;
  failed: number;
  dueToday?: number;
  overdue?: number;
  upcoming?: number;
  followups?: number;
  conversion?: number;
}

// Dashboard summary
export interface DashboardResponse {
  totalClients: number;
  totalTelecallers: number;
  statusCounts: {
    initialize: number;
    followup: number;
    success: number;
    failed: number;
  };
}

/* ---------------- NEW: Admin Summary (rich) ---------------- */
export interface AdminSummaryReport {
  range: { from: string; to: string; tz: string; upcomingDays: number };
  totals: {
    totalInRange: number;
    successRate: number;
    assigned: number;
    unassigned: number;
    activeLeads: number;
  };
  status: {
    initialize: number;
    followup: number;
    success: number;
    failed: number;
  };
  bySource: { source: string; count: number }[];
  byLeadType: { type: string; count: number }[];
  daily: { date: string; count: number }[];
  due: { today: number; overdue: number; upcoming: number };
  telecallersTop: Array<{
    id: string;
    name?: string;
    mobile?: string;
    totalLeads: number;
    initialize: number;
    followup: number;
    success: number;
    failed: number;
    conversion: number;
  }>;
}

/* ---------------- Legacy overview (kept) ---------------- */
export interface OverviewReport {
  from: string;
  to: string;
  byStatus: Record<string, number>;
  bySource: { source: string; count: number }[];
  daily: { date: string; count: number }[];
  totals: { total: number; conversionRate: number };
}
export type LeadsOverviewResponse = OverviewReport;

/* ---------------- Leads table / rows ---------------- */
export interface LeadsTableRow {
  _id: string;
  name?: string;
  phone?: string;
  email?: string;
  status?: "initialize" | "followup" | "success" | "failed";
  source?: string;
  leadType?: string;
  followUpDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  assignedTo?: string | null;
  assignedName?: string;
  assignedMobile?: string;
  lastNote?: string;
  lastOutcome?: string;
  lastFollowupAt?: string;
}
export interface LeadsTableResp {
  page: number;
  limit: number;
  total: number;
  pages: number;
  items: LeadsTableRow[];
}

/* -------- Telecaller-focused Leads payload -------- */
export interface TelecallerLeadsSummary {
  total: number;
  byStatus: {
    initialize: number;
    followup: number;
    success: number;
    failed: number;
  };
  due: { overdue: number; today: number; upcoming: number };
}

export interface TelecallerLeadsResp {
  range: {
    from: string;
    to: string;
    tz: string;
    scope: "assigned" | "created";
    upcomingDays: number;
  };
  telecaller: { id: string; name?: string; mobile?: string; blocked: boolean };
  summary: TelecallerLeadsSummary;
  page: number;
  limit: number;
  totalItems: number;
  pages: number;
  items: LeadsTableRow[];
}

/* ---------------- Distribution (Preview → Apply) ---------------- */
export type DistStrategy = "shuffle" | "oldest_first" | "newest_first" | "round_robin";

export interface DistributionPreviewReq {
  strategy?: DistStrategy;
  limit?: number;
  statuses?: string[];        // e.g. ["initialize","followup"]
  respectBlocked?: boolean;
  perTeleCap?: number;        // per-telecaller ceiling
  seed?: number;              // for shuffle determinism
}

export interface DistributionPreviewRow {
  telecallerId: string;
  name?: string;
  mobile?: string;
  blocked?: boolean;
  alreadyAssigned: number;     // current active load
  willAssign: number;          // count that preview will assign
  capacityLeft: number | null; // remaining capacity after cap, or null (∞)
}

export interface DistributionPreviewResp {
  strategy: DistStrategy;
  consideredLeads: number;
  planned: number;
  breakdown: DistributionPreviewRow[];
  sampleLeadIds: string[];
}

export interface DistributionApplyReq extends DistributionPreviewReq {
  dryRun?: boolean;
}

export interface DistributionApplyResp {
  planned: number;
  applied: number;
  skipped: number;
}

/* ---------------- Meta (Lead Ads) ---------------- */
export interface MetaConfig {
  business?: "spacemanager" | "doonearth";
  pageId: string | null;
  formId: string | null;
  tokenSet: boolean;
  tokenHint?: string | null;
  lastSyncAt?: string | null;
  lastSyncFetched?: number;
  lastSyncInserted?: number;
  lastSyncSkipped?: number;
  lastSyncForms?: Array<{
    id: string;
    name?: string | null;
    fetched?: number;
    valid?: number;
  }>;
  lastSyncFormErrors?: Array<{
    id?: string | null;
    name?: string | null;
    error?: string | null;
  }>;
  updatedAt?: string | null;
}

export interface MetaForm {
  id: string;
  name?: string;
  status?: string;
  locale?: string;
}

export interface MetaPage {
  id: string;
  name?: string;
}

export interface MetaFormsResp {
  data: MetaForm[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
}

export interface MetaPagesResp {
  data: MetaPage[];
}

export interface MetaSyncResp {
  fetched: number;
  inserted: number;
  skipped: number;
  nextCursor?: string | null;
  fetchedAt?: string;
  autoAssignedTo?: string | null;
  formsSynced?: Array<{
    id: string;
    name?: string | null;
    fetched?: number;
    valid?: number;
  }>;
  formErrors?: Array<{
    id?: string | null;
    name?: string | null;
    error?: string | null;
  }>;
}

/* ============================ API Slice ============================ */
const adminApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    /* ---------------------- Dashboard ---------------------- */
    getDashboard: builder.query<DashboardResponse, void>({
      query: () => "/admin/dashboard",
      providesTags: ["AdminDashboard"],
    }),

    /* -------------------- Telecallers CRUD -------------------- */
    getTelecallers: builder.query<Telecaller[], void>({
      query: () => "/admin/telecallers",
      providesTags: ["Telecaller"],
    }),

    getTelecallerById: builder.query<Telecaller, string>({
      query: (id) => `/admin/telecallers/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Telecaller" as const, id }],
    }),

    addTelecaller: builder.mutation<Telecaller, { name?: string; mobile: string }>({
      query: (body) => ({
        url: "/admin/add-telecaller",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Telecaller"],
    }),

    updateTelecallerBlock: builder.mutation<
      Telecaller,
      { id: string; blocked: boolean; reason?: string }
    >({
      query: ({ id, blocked, reason }) => ({
        url: `/admin/telecallers/${id}/block`,
        method: "PATCH",
        body: { blocked, reason },
      }),
      invalidatesTags: (_r, _e, { id }) => [
        "Telecaller",
        { type: "Telecaller" as const, id },
      ],
    }),

    /* ------------------------ Admin users (match backend) ------------------------ */
    getAdmins: builder.query<AdminUser[], void>({
      query: () => "/admin/admins",
      providesTags: ["AdminUser"],
    }),

    createAdmin: builder.mutation<AdminUser, { name?: string; mobile: string }>({
      query: (body) => ({
        url: "/admin/create-admin",
        method: "POST",
        body,
      }),
      invalidatesTags: ["AdminUser"],
    }),

    /* ------------------------ NEW Reports ------------------------ */

    // All-in-one admin summary (MUST match /admin/reports/summary)
    getAdminSummary: builder.query<
      AdminSummaryReport,
      { from?: string; to?: string; tz?: string; top?: number; upcomingDays?: number } | void
    >({
      query: (p) => {
        const s = new URLSearchParams();
        if (p?.from) s.set("from", p.from);
        if (p?.to) s.set("to", p.to);
        if (p?.tz) s.set("tz", p.tz);
        if (typeof p?.top === "number") s.set("top", String(p.top));
        if (typeof p?.upcomingDays === "number") s.set("upcomingDays", String(p.upcomingDays));
        const qs = s.toString();
        return `/admin/reports/summary${qs ? `?${qs}` : ""}`;
      },
      providesTags: ["AdminSummary", "TelecallerReport"],
    }),

    // Telecaller performance (server pagination + sort)
    getTelecallerReports: builder.query<
      {
        range: { from: string; to: string; tz: string };
        page: number;
        limit: number;
        total: number;
        pages: number;
        telecallers: TelecallerReportRow[];
      },
      {
        from?: string;
        to?: string;
        tz?: string;
        sort?: "conversion" | "success" | "followups" | "dueToday" | "overdue" | "totalLeads";
        order?: "asc" | "desc";
        page?: number;
        limit?: number;
      } | void
    >({
      query: (p) => {
        const s = new URLSearchParams();
        if (p?.from) s.set("from", p.from);
        if (p?.to) s.set("to", p.to);
        if (p?.tz) s.set("tz", p.tz);
        if (p?.sort) s.set("sort", p.sort);
        if (p?.order) s.set("order", p.order);
        if (p?.page) s.set("page", String(p.page));
        if (p?.limit) s.set("limit", String(p.limit));
        const qs = s.toString();
        return `/admin/reports/telecallers${qs ? `?${qs}` : ""}`;
      },
      providesTags: ["AdminTelecallerReport"],
    }),

    // Telecaller-focused leads + summary
    getTelecallerLeads: builder.query<
      TelecallerLeadsResp,
      {
        id: string;
        tz?: string;
        from?: string;
        to?: string;
        scope?: "assigned" | "created";
        status?: "initialize" | "followup" | "success" | "failed" | "all";
        due?: "overdue" | "today" | "upcoming" | "all";
        upcomingDays?: number;
        q?: string;
        page?: number;
        limit?: number;
        sort?: "updatedAt" | "followUpDate" | "createdAt";
        order?: "asc" | "desc";
      }
    >({
      query: ({ id, ...rest }) => {
        const s = new URLSearchParams();
        if (rest.tz) s.set("tz", rest.tz);
        if (rest.from) s.set("from", rest.from);
        if (rest.to) s.set("to", rest.to);
        if (rest.scope) s.set("scope", rest.scope);
        if (rest.status) s.set("status", rest.status);
        if (rest.due) s.set("due", rest.due);
        if (typeof rest.upcomingDays === "number") s.set("upcomingDays", String(rest.upcomingDays));
        if (rest.q) s.set("q", rest.q);
        if (rest.page) s.set("page", String(rest.page));
        if (rest.limit) s.set("limit", String(rest.limit));
        if (rest.sort) s.set("sort", rest.sort);
        if (rest.order) s.set("order", rest.order);
        return `/admin/reports/telecaller/${id}/leads?${s.toString()}`;
      },
      providesTags: (_r, _e, { id }) => [{ type: "TelecallerLeads" as const, id }],
    }),

    /* ------------------------ Legacy Reports ------------------------ */

    // Rich overview (status/source/daily)
    getReportOverview: builder.query<OverviewReport, { from?: string; to?: string } | void>({
      query: (params) => {
        const s = new URLSearchParams();
        if (params?.from) s.set("from", params.from);
        if (params?.to) s.set("to", params.to);
        const qs = s.toString();
        return `/admin/reports/overview${qs ? `?${qs}` : ""}`;
      },
      providesTags: ["LeadsSummary"],
    }),

    // Paginated leads table (for ALL telecallers)
    getLeadsTable: builder.query<
      LeadsTableResp,
      {
        from?: string;
        to?: string;
        status?: string;
        assignedTo?: string;
        q?: string;
        page?: number;
        limit?: number;
      }
    >({
      query: (p) => {
        const s = new URLSearchParams();
        if (p?.from) s.set("from", p.from);
        if (p?.to) s.set("to", p.to);
        if (p?.status) s.set("status", p.status);
        if (p?.assignedTo) s.set("assignedTo", p.assignedTo);
        if (p?.q) s.set("q", p.q);
        if (p?.page) s.set("page", String(p.page));
        if (p?.limit) s.set("limit", String(p.limit));
        return `/admin/reports/leads-table?${s.toString()}`;
      },
      providesTags: ["LeadList"],
    }),

    // Single lead + full followup history
    getLeadReportWithHistory: builder.query<{ lead: any; history: any[] }, string>({
      query: (id) => `/admin/reports/lead/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Lead" as const, id }],
    }),

    /* ----- (Legacy) Simple Distribute (kept) ----- */
    distributeLeads: builder.mutation<
      { message: string; method: string; count: number },
      { method?: "round_robin" | "shuffle" | "least_loaded" }
    >({
      query: (body) => ({
        url: "/admin/distribute",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Telecaller", "AdminTelecallerReport", "LeadList", "AdminSummary"],
    }),

    /* ================= Optional: Distribution Preview / Apply ================= */
    previewDistribution: builder.query<DistributionPreviewResp, DistributionPreviewReq>({
      query: (q) => {
        const params = new URLSearchParams();
        if (q.strategy) params.set("strategy", q.strategy);
        if (typeof q.limit === "number") params.set("limit", String(q.limit));
        if (q.statuses?.length) params.set("statuses", q.statuses.join(","));
        if (typeof q.respectBlocked === "boolean")
          params.set("respectBlocked", String(q.respectBlocked));
        if (typeof q.perTeleCap === "number") params.set("perTeleCap", String(q.perTeleCap));
        if (typeof q.seed === "number") params.set("seed", String(q.seed));
        return { url: `/admin/distribution/preview?${params.toString()}` };
      },
      providesTags: ["Telecaller", "AdminTelecallerReport", "AdminSummary"],
    }),

    applyDistribution: builder.mutation<DistributionApplyResp, DistributionApplyReq>({
      query: (body) => ({
        url: "/admin/distribution/apply",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Telecaller", "AdminTelecallerReport", "LeadList", "AdminSummary"],
    }),

    /* ---------------- Meta (Lead Ads) ---------------- */
    getMetaConfig: builder.query<MetaConfig, { business: "spacemanager" | "doonearth" }>({
      query: ({ business }) => `/admin/meta-config?business=${business}`,
      providesTags: (_r, _e, { business }) => [{ type: "MetaConfig" as const, id: business }],
    }),

    updateMetaConfig: builder.mutation<
      MetaConfig,
      { business: "spacemanager" | "doonearth"; accessToken?: string; pageId?: string; formId?: string }
    >({
      query: (body) => ({
        url: "/admin/meta-config",
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { business }) => [
        { type: "MetaConfig" as const, id: business },
        "MetaForms",
      ],
    }),

    getMetaForms: builder.query<
      MetaFormsResp,
      { business: "spacemanager" | "doonearth"; pageId?: string }
    >({
      query: ({ business, pageId }) => {
        const s = new URLSearchParams({ business });
        if (pageId) s.set("pageId", pageId);
        return `/admin/meta/forms?${s.toString()}`;
      },
      providesTags: ["MetaForms"],
    }),

    getMetaPages: builder.query<MetaPagesResp, { business: "spacemanager" | "doonearth" }>({
      query: ({ business }) => `/admin/meta/pages?business=${business}`,
      providesTags: ["MetaForms"],
    }),

    syncMetaLeads: builder.mutation<
      MetaSyncResp,
      { business: "spacemanager" | "doonearth"; formId?: string; limit?: number; after?: string }
    >({
      query: (body) => ({
        url: "/admin/meta/sync",
        method: "POST",
        body,
      }),
      invalidatesTags: ["LeadList", "AdminSummary", "MetaSync"],
    }),
  }),
  overrideExisting: true,
});

export const {
  /* dashboard */
  useGetDashboardQuery,

  /* telecallers */
  useGetTelecallersQuery,
  useGetTelecallerByIdQuery,
  useAddTelecallerMutation,
  useUpdateTelecallerBlockMutation,

  /* admins */
  useGetAdminsQuery,
  useCreateAdminMutation,

  /* NEW reports */
  useGetAdminSummaryQuery,
  useGetTelecallerReportsQuery,
  useGetTelecallerLeadsQuery,

  /* legacy/general */
  useGetReportOverviewQuery,
  useGetLeadsTableQuery,
  useGetLeadReportWithHistoryQuery,
  useLazyGetLeadReportWithHistoryQuery,

  /* distribution */
  usePreviewDistributionQuery,
  useLazyPreviewDistributionQuery,
  useApplyDistributionMutation,
  useDistributeLeadsMutation,

  /* meta */
  useGetMetaConfigQuery,
  useUpdateMetaConfigMutation,
  useGetMetaFormsQuery,
  useLazyGetMetaFormsQuery,
  useGetMetaPagesQuery,
  useSyncMetaLeadsMutation,
} = adminApi;

/** Aliases (if older UI expects these names) */
export const useGetLeadWithHistoryQuery = useGetLeadReportWithHistoryQuery;
export const useLazyGetLeadWithHistoryQuery = useLazyGetLeadReportWithHistoryQuery;

export default adminApi;
