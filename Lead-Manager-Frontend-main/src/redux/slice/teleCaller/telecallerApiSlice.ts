// src/redux/slice/telecaller/telecallerApiSlice.ts
import apiSlice from "@/redux/apiSlice";

/* ========================= Types ========================= */

export type LeadStatus = "initialize" | "followup" | "success" | "failed";

export interface Lead {
  _id: string;
  name?: string;
  phone?: string;
  email?: string;
  status: LeadStatus;
  reason?: string | null;
  source?: string | null;
  leadType?: string | null;
  followUpDate?: string | null;
  assignedTo?: string | null;
  clientInterest?: string | null;
  metaFetchedAt?: string | null;
  metaLeadCreatedAt?: string | null;
  metaLeadId?: string | null;
  metaFormId?: string | null;
  metaFormName?: string | null;
  metaCampaignId?: string | null;
  metaAdsetId?: string | null;
  metaAdId?: string | null;
  metaRaw?: {
    created_time?: string | null;
    field_data?: Array<{ name?: string; values?: unknown[] | unknown }>;
  } | null;
  createdAt?: string;
  updatedAt?: string;
  company?: string; // optional if you store it
}

export interface TelecallerDashboardCounts {
  total: number;
  initialize: number;
  followup: number;
  success: number;
  failed: number;
}

export interface LeadsListResp {
  page: number;
  limit: number;
  total: number;
  pages: number;
  items: Lead[];
  forms?: Array<{ id: string; name?: string; count?: number }>;
}

export interface UpdateLeadStatusReq {
  id: string;
  /** Optional now: server accepts note/schedule-only updates. Built-in LeadStatus or a custom top-level status slug. */
  status?: string;
  reason?: string;
  /** ISO string for next follow-up (if scheduling follow-up) */
  followUpDate?: string | null;
  /** Optional free-text note captured in audit & activity */
  note?: string;
}
export type UpdateLeadStatusResp = { message: string; lead: Lead } | Lead;

/* ---- Reminders ---- */
export interface RemindersResp {
  tz: string;
  start: string; // ISO (day start in tz)
  end: string;   // ISO (day end in tz)
  count: number;
  items: Lead[];
}

/* ---- Simple Report ---- */
export interface TelecallerSimpleReport {
  from: string;
  to: string;
  initialize: number;
  followup: number;
  success: number;
  failed: number;
}

/* ---- Lead History (timeline) ---- */
export interface TimelineFollowup {
  type: "followup";
  at: string;
  by: { _id: string; name?: string; mobile?: string } | null;
  status: LeadStatus | null;
  note: string | null;
  reason: string | null;
  nextFollowDate: string | null;
}
export interface TimelineAudit {
  type: "audit";
  at: string;
  by: { _id: string; name?: string; mobile?: string } | null;
  action: "status_change" | "note" | "schedule_change" | "update";
  note: string | null;
  diff: {
    status: { from: LeadStatus | null; to: LeadStatus | null };
    reason: { from: string | null; to: string | null };
    followUpDate: { from: string | null; to: string | null };
  };
  meta: { ip?: string | null; ua?: string | null; source?: string | null } | null;
}
export type LeadTimelineEvent = TimelineFollowup | TimelineAudit;

export interface GetMyLeadHistoryResp {
  lead: Lead;
  timeline: LeadTimelineEvent[];
}

/* -------- Query params -------- */
export interface GetMyLeadsParams {
  status?: string; // built-in LeadStatus or a custom top-level status slug
  q?: string;
  metaFormId?: string;
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface GetMyReportParams {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}

export interface GetMyRemindersParams {
  tz?: string; // e.g. "Asia/Kolkata"
}

/* ---- Status reason options (admin-managed quick-select labels) ---- */
export type StatusReasonBaseStatus = "followup" | "success" | "failed";
export interface StatusReasonItem {
  _id: string;
  baseStatus: StatusReasonBaseStatus;
  label: string;
  order?: number;
}

/* ---- Custom top-level statuses (admin-managed, e.g. "Waiting") ---- */
export interface CustomStatusItem {
  _id: string;
  slug: string;
  label: string;
  order?: number;
}

/* ========================= Slice ========================= */

const telecallerApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    /* ---- Dashboard counts for telecaller ---- */
    getMyDashboard: builder.query<TelecallerDashboardCounts, void>({
      query: () => "/telecaller/dashboard",
      providesTags: ["TelecallerDashboard"],
    }),

    /* ---- My leads (filter + pagination) ---- */
    getMyLeads: builder.query<LeadsListResp, GetMyLeadsParams | void>({
      query: (p) => {
        const s = new URLSearchParams();
        if (p?.status) s.set("status", p.status);
        if (p?.q) s.set("q", p.q);
        if (p?.metaFormId) s.set("metaFormId", p.metaFormId);
        if (p?.page) s.set("page", String(p.page));
        if (p?.limit) s.set("limit", String(p.limit));
        if (p?.dateFrom) s.set("dateFrom", p.dateFrom);
        if (p?.dateTo) s.set("dateTo", p.dateTo);
        const qs = s.toString();
        return `/telecaller/leads${qs ? `?${qs}` : ""}`;
      },
      providesTags: (result) =>
        result
          ? [
              "TelecallerLeadList",
              ...result.items.map((i) => ({ type: "Lead" as const, id: i._id })),
            ]
          : ["TelecallerLeadList"],
    }),

    /* ---- Update lead status / followup / note (single endpoint) ---- */
    updateLeadStatus: builder.mutation<UpdateLeadStatusResp, UpdateLeadStatusReq>({
      query: ({ id, ...body }) => ({
        url: `/telecaller/update-status/${id}`,
        method: "POST",
        body,
      }),
      // Invalidate everything that depends on this lead
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Lead" as const, id },
        { type: "LeadHistory" as const, id },
        "TelecallerLeadList",
        "TelecallerDashboard",
        "TelecallerReminders",
        "TelecallerReport",
      ],
    }),

    /* ---- Today reminders (by timezone) ---- */
    getMyReminders: builder.query<RemindersResp, GetMyRemindersParams | void>({
      query: (p) => {
        const s = new URLSearchParams();
        if (p?.tz) s.set("tz", p.tz);
        const qs = s.toString();
        return `/telecaller/reminders${qs ? `?${qs}` : ""}`;
      },
      providesTags: ["TelecallerReminders"],
    }),

    /* ---- Simple report by date range ---- */
    getMyReport: builder.query<TelecallerSimpleReport, GetMyReportParams | void>({
      query: (p) => {
        const s = new URLSearchParams();
        if (p?.from) s.set("from", p.from);
        if (p?.to) s.set("to", p.to);
        const qs = s.toString();
        return `/telecaller/report${qs ? `?${qs}` : ""}`;
      },
      providesTags: ["TelecallerReport"],
    }),

    /* ---- Lead full history (timeline: followups + audits) ---- */
    getMyLeadHistory: builder.query<GetMyLeadHistoryResp, string>({
      query: (id) => `/telecaller/lead/${id}/history`,
      providesTags: (_res, _err, id) => [{ type: "LeadHistory" as const, id }],
    }),

    /* ---- Note-only (convenience) ---- */
    addLeadNote: builder.mutation<{ message: string }, { id: string; note: string }>({
      query: ({ id, note }) => ({
        url: `/telecaller/lead/${id}/note`,
        method: "POST",
        body: { note },
      }),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Lead" as const, id },
        { type: "LeadHistory" as const, id },
        "TelecallerLeadList",
        "TelecallerDashboard",
      ],
    }),

    /* ---- Status reason quick-select options (admin-managed) ---- */
    getStatusReasons: builder.query<{ items: StatusReasonItem[] }, void>({
      query: () => "/leads/status-reasons",
      providesTags: ["StatusReason"],
    }),

    /* ---- Custom top-level statuses (admin-managed) ---- */
    getCustomStatuses: builder.query<{ items: CustomStatusItem[] }, void>({
      query: () => "/leads/custom-statuses",
      providesTags: ["CustomStatus"],
    }),
  }),
  overrideExisting: true,
});

/* ========================= Hooks ========================= */
export const {
  useGetMyDashboardQuery,
  useGetMyLeadsQuery,
  useLazyGetMyLeadsQuery,
  useUpdateLeadStatusMutation,
  useGetMyRemindersQuery,
  useLazyGetMyRemindersQuery,
  useGetMyReportQuery,
  useLazyGetMyReportQuery,
  useGetMyLeadHistoryQuery,
  useLazyGetMyLeadHistoryQuery,
  useAddLeadNoteMutation,
  useGetStatusReasonsQuery,
  useGetCustomStatusesQuery,
} = telecallerApi;

/* 🔁 Alias to match existing imports in some files */
export { useGetMyDashboardQuery as useGetTelecallerDashboardQuery };

export default telecallerApi;
