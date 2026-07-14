// src/redux/slice/leads/leadApiSlice.ts
import apiSlice from "@/redux/apiSlice";

/* ========= Types ========= */

export type LeadStatus = "initialize" | "followup" | "success" | "failed";
export type LeadType = "create" | "bulk" | "meta";

export type ClientInterest =
  | "Construction"
  | "Interior"
  | "Renovation"
  | "Modular Kitchen"
  | "Interior Designing/Architectural Planning";

export const CLIENT_INTEREST_OPTIONS: ClientInterest[] = [
  "Construction",
  "Interior",
  "Renovation",
  "Modular Kitchen",
  "Interior Designing/Architectural Planning",
];

export type Business = "spacemanager" | "doonearth";

export const BUSINESS_OPTIONS: Business[] = ["spacemanager", "doonearth"];

export const BUSINESS_LABELS: Record<Business, string> = {
  spacemanager: "Space Manager",
  doonearth: "DoOnEarth Solutions",
};

export interface RefUser {
  _id: string;
  name?: string;
  mobile?: string;
}

export interface Attachment {
  url?: string;
  secure_url?: string;
  public_id?: string;
  format?: string;
  bytes?: number;
  original_filename?: string;
  [k: string]: unknown;
}

export interface Lead {
  _id: string;
  name?: string;
  phone?: string;
  email?: string;
  status?: LeadStatus;
  reason?: string;
  /** Client roadmap: call → visit → quotation → decision */
  journeyStage?: "call" | "visit" | "quotation" | "decision";
  followUpDate?: string | null;
  assignedTo?: string | RefUser | null;
  createdBy?: string | RefUser | null;
  leadType?: LeadType;
  business?: Business;
  source?: string;
  clientInterest?: ClientInterest; // 👈 NEW FIELD
  attachments?: Attachment[];
  metaLeadId?: string;
  metaFormId?: string;
  metaFormName?: string;
  metaLeadCreatedAt?: string;
  metaCampaignId?: string;
  metaAdsetId?: string;
  metaAdId?: string;
  metaFetchedAt?: string;
  metaRaw?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

export interface FollowupRow {
  _id: string;
  lead: string;
  note?: string;
  outcome?: string;
  nextDate?: string | null;
  telecaller?: RefUser | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaginatedLeads {
  page: number;
  limit: number;
  total: number;
  pages: number;
  items: Lead[];
}

export interface LeadListQuery {
  status?: LeadStatus;
  leadType?: LeadType;
  assignedTo?: string;
  q?: string;
  page?: number;
  limit?: number;
  clientInterest?: ClientInterest;
  business?: Business;
  dateFrom?: string;
  dateTo?: string;
}

export interface LeadDetailResponse {
  lead: Lead;
  history: FollowupRow[];
}

/* ========= Slice ========= */

const leadApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    /* ---- Create single lead ---- */
    createLead: builder.mutation<Lead, Partial<Lead>>({
      query: (body) => ({
        url: "/leads/create",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Lead", "LeadList"],
    }),

    /* ---- Bulk JSON upload ---- */
    bulkJson: builder.mutation<
      { inserted: number },
      { leads: Partial<Lead>[]; business: Business }
    >({
      query: ({ leads, business }) => ({
        url: "/leads/bulk-json",
        method: "POST",
        body: { leads, business },
      }),
      invalidatesTags: ["Lead", "LeadList"],
    }),

    /* ---- Bulk CSV upload (file field: 'file') ---- */
    bulkCsv: builder.mutation<{ inserted: number }, { file: File; business: Business }>({
      query: ({ file, business }) => {
        const form = new FormData();
        form.append("file", file);
        form.append("business", business);
        return {
          url: "/leads/bulk-csv",
          method: "POST",
          body: form,
        };
      },
      invalidatesTags: ["Lead", "LeadList"],
    }),

    /* ---- Meta lead create ---- */
    createMetaLead: builder.mutation<Lead, Partial<Lead>>({
      query: (body) => ({
        url: "/leads/meta",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Lead", "LeadList"],
    }),

    /* ---- List leads (with filters & pagination) ---- */
    getLeads: builder.query<PaginatedLeads, LeadListQuery | void>({
      query: (params) => ({
        url: "/leads",
        params,
      }),
      providesTags: (result) =>
        result?.items
          ? [
              "LeadList",
              ...result.items.map((l) => ({ type: "Lead" as const, id: l._id })),
            ]
          : ["LeadList"],
    }),

    /* ---- Lead details (with followup history) ---- */
    getLeadById: builder.query<LeadDetailResponse, string>({
      query: (id) => `/leads/${id}`,
      providesTags: (_res, _err, id) => [{ type: "Lead" as const, id }, "LeadDetail"],
    }),

    /* ---- Update lead (OPTIMISTIC assign) ---- */
    updateLead: builder.mutation<Lead, { id: string } & Partial<Lead>>({
      query: ({ id, ...patch }) => ({
        url: `/leads/${id}`,
        method: "PUT",
        body: patch,
      }),
      // 🔥 Optimistic UI: patch common cached lists + detail
      async onQueryStarted({ id, ...patch }, { dispatch, queryFulfilled }) {
        const KNOWN_ARG_SETS: (LeadListQuery | void)[] = [
          undefined, // generic list
          { page: 1, limit: 200 }, // e.g. distribution page
        ];

        const patches: Array<{ undo: () => void }> = [];

        // Patch paginated lists
        for (const args of KNOWN_ARG_SETS) {
          try {
            const p = dispatch(
              leadApi.util.updateQueryData("getLeads", args as any, (draft) => {
                const idx = draft.items.findIndex((x) => x._id === id);
                if (idx >= 0) {
                  Object.assign(draft.items[idx], patch);
                  draft.items[idx].updatedAt = new Date().toISOString();
                }
              })
            );
            patches.push(p);
          } catch {
            // no cache for this args — ignore
          }
        }

        // Patch detail view if open
        try {
          const d = dispatch(
            leadApi.util.updateQueryData("getLeadById", id, (draft) => {
              if (draft?.lead) {
                Object.assign(draft.lead, patch);
                draft.lead.updatedAt = new Date().toISOString();
              }
            })
          );
          patches.push(d);
        } catch {
          // no cached detail — ignore
        }

        try {
          await queryFulfilled;
        } catch {
          patches.forEach((p) => p.undo());
        }
      },
      invalidatesTags: (_r, _e, { id }) => [
        "LeadList",
        { type: "Lead" as const, id },
        "LeadDetail",
      ],
    }),

    /* ---- Upload attachments (field: files[], up to 5) ---- */
    uploadLeadFiles: builder.mutation<
      { message: string; attachments: Attachment[] },
      { id: string; files: File[] }
    >({
      query: ({ id, files }) => {
        const form = new FormData();
        files.forEach((f) => form.append("files", f));
        return {
          url: `/leads/${id}/upload`,
          method: "POST",
          body: form,
        };
      },
      invalidatesTags: (_r, _e, { id }) => [
        "LeadList",
        { type: "Lead" as const, id },
        "LeadDetail",
      ],
    }),
  }),
  overrideExisting: true,
});

export const {
  useCreateLeadMutation,
  useBulkJsonMutation,
  useBulkCsvMutation,
  useCreateMetaLeadMutation,
  useGetLeadsQuery,
  useLazyGetLeadsQuery,
  useGetLeadByIdQuery,
  useUpdateLeadMutation,
  useUploadLeadFilesMutation,
} = leadApi;

export default leadApi;
