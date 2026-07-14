import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { BUSINESS_LABELS, type Lead } from "@/redux/slice/lead/leadApiSlice";

export const LEAD_COLUMNS = [
  "name",
  "phone",
  "email",
  "status",
  "journeyStage",
  "clientInterest",
  "leadType",
  "business",
  "source",
  "assignedTo",
  "createdBy",
  "followUpDate",
  "reason",
  "metaLeadId",
  "metaFormId",
  "metaCampaignId",
  "metaAdsetId",
  "metaAdId",
  "metaFetchedAt",
  "createdAt",
  "updatedAt",
] as const;

export type LeadColumnKey = (typeof LEAD_COLUMNS)[number];

export const LEAD_DEFAULT_COLUMNS: LeadColumnKey[] = [
  "name",
  "phone",
  "email",
  "status",
  "journeyStage",
  "business",
];

/* ---------- Client roadmap progress (call → visit → quotation → decision) ---------- */
const JOURNEY_STAGES = ["call", "visit", "quotation", "decision"] as const;
const JOURNEY_LABELS: Record<string, string> = {
  call: "Call",
  visit: "Visit",
  quotation: "Quotation",
  decision: "Decision",
};

export const renderJourneyProgress = (l: Lead) => {
  const stage = l.journeyStage || "call";
  const idx = Math.max(0, JOURNEY_STAGES.indexOf(stage as (typeof JOURNEY_STAGES)[number]));
  const decided = l.status === "success" ? "yes" : l.status === "failed" ? "no" : null;
  const doneCount = decided ? JOURNEY_STAGES.length : idx;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {JOURNEY_STAGES.map((s, i) => (
          <span
            key={s}
            title={JOURNEY_LABELS[s]}
            className={`h-2 w-2 rounded-full ${
              i < doneCount
                ? decided === "no" && i === JOURNEY_STAGES.length - 1
                  ? "bg-destructive"
                  : "bg-success"
                : i === idx && !decided
                ? "bg-primary"
                : "bg-muted-foreground/25"
            }`}
          />
        ))}
      </div>
      <span className="text-xs font-medium whitespace-nowrap">
        {decided === "yes"
          ? "Won 🎉"
          : decided === "no"
          ? "Lost"
          : `${JOURNEY_LABELS[stage]} (${idx + 1}/4)`}
      </span>
    </div>
  );
};

export const LEAD_COLUMN_LABELS: Record<LeadColumnKey, string> = {
  name: "Name",
  phone: "Phone",
  email: "Email",
  status: "Status",
  journeyStage: "Progress",
  clientInterest: "Interest",
  leadType: "Type",
  business: "Business",
  source: "Source",
  assignedTo: "Assigned",
  createdBy: "Created By",
  followUpDate: "Follow-up",
  reason: "Reason",
  metaLeadId: "Meta Lead ID",
  metaFormId: "Form",
  metaCampaignId: "Campaign ID",
  metaAdsetId: "Adset ID",
  metaAdId: "Ad ID",
  metaFetchedAt: "Meta Fetched",
  createdAt: "Created",
  updatedAt: "Updated",
};

export const LEAD_COLUMNS_STORAGE_KEY = "lm_lead_columns_v1";

export const formatLeadType = (t?: Lead["leadType"] | null) => {
  if (!t) return "—";
  switch (t) {
    case "create":
      return "Manual";
    case "bulk":
      return "Bulk";
    case "meta":
      return "Meta (Ads)";
    default:
      return String(t);
  }
};

export const formatUser = (u?: Lead["assignedTo"] | Lead["createdBy"] | null) => {
  if (!u) return "—";
  if (typeof u === "string") return u;
  const name = u.name || "—";
  return u.mobile ? `${name} (${u.mobile})` : name;
};

export const formatDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString() : "—";

export type LeadColumnDef = {
  key: LeadColumnKey;
  label: string;
  render: (l: Lead) => ReactNode;
};

export const getLeadColumnDefs = (
  metaFormMap?: Record<string, string>
): LeadColumnDef[] => [
  {
    key: "name",
    label: LEAD_COLUMN_LABELS.name,
    render: (l) => <span className="font-medium">{l.name || "—"}</span>,
  },
  { key: "phone", label: LEAD_COLUMN_LABELS.phone, render: (l) => l.phone || "—" },
  { key: "email", label: LEAD_COLUMN_LABELS.email, render: (l) => l.email || "—" },
  {
    key: "status",
    label: LEAD_COLUMN_LABELS.status,
    render: (l) => (l.status ? <StatusBadge status={l.status} /> : "—"),
  },
  {
    key: "journeyStage",
    label: LEAD_COLUMN_LABELS.journeyStage,
    render: renderJourneyProgress,
  },
  {
    key: "clientInterest",
    label: LEAD_COLUMN_LABELS.clientInterest,
    render: (l) => l.clientInterest || "—",
  },
  {
    key: "leadType",
    label: LEAD_COLUMN_LABELS.leadType,
    render: (l) => (
      <Badge variant={l.leadType === "meta" ? "secondary" : "outline"}>
        {formatLeadType(l.leadType)}
      </Badge>
    ),
  },
  {
    key: "business",
    label: LEAD_COLUMN_LABELS.business,
    render: (l) => (
      <Badge variant={l.business === "doonearth" ? "secondary" : "outline"}>
        {l.business ? BUSINESS_LABELS[l.business] : "—"}
      </Badge>
    ),
  },
  { key: "source", label: LEAD_COLUMN_LABELS.source, render: (l) => l.source || "—" },
  {
    key: "assignedTo",
    label: LEAD_COLUMN_LABELS.assignedTo,
    render: (l) => formatUser(l.assignedTo),
  },
  {
    key: "createdBy",
    label: LEAD_COLUMN_LABELS.createdBy,
    render: (l) => formatUser(l.createdBy),
  },
  {
    key: "followUpDate",
    label: LEAD_COLUMN_LABELS.followUpDate,
    render: (l) => formatDate(l.followUpDate),
  },
  { key: "reason", label: LEAD_COLUMN_LABELS.reason, render: (l) => l.reason || "—" },
  {
    key: "metaLeadId",
    label: LEAD_COLUMN_LABELS.metaLeadId,
    render: (l) => <span className="font-mono text-xs">{l.metaLeadId || "—"}</span>,
  },
  {
    key: "metaFormId",
    label: LEAD_COLUMN_LABELS.metaFormId,
    render: (l) => {
      const directName =
        typeof l.metaFormName === "string" && l.metaFormName.trim()
          ? l.metaFormName.trim()
          : null;
      if (directName && directName !== l.metaFormId) return directName;
      if (l.metaFormId && metaFormMap?.[l.metaFormId]) return metaFormMap[l.metaFormId];
      if (l.leadType === "meta") return "Unknown Form";
      return "—";
    },
  },
  {
    key: "metaCampaignId",
    label: LEAD_COLUMN_LABELS.metaCampaignId,
    render: (l) => <span className="font-mono text-xs">{l.metaCampaignId || "—"}</span>,
  },
  {
    key: "metaAdsetId",
    label: LEAD_COLUMN_LABELS.metaAdsetId,
    render: (l) => <span className="font-mono text-xs">{l.metaAdsetId || "—"}</span>,
  },
  {
    key: "metaAdId",
    label: LEAD_COLUMN_LABELS.metaAdId,
    render: (l) => <span className="font-mono text-xs">{l.metaAdId || "—"}</span>,
  },
  {
    key: "metaFetchedAt",
    label: LEAD_COLUMN_LABELS.metaFetchedAt,
    render: (l) => formatDate(l.metaFetchedAt || l.createdAt),
  },
  {
    key: "createdAt",
    label: LEAD_COLUMN_LABELS.createdAt,
    render: (l) => formatDate(l.createdAt),
  },
  {
    key: "updatedAt",
    label: LEAD_COLUMN_LABELS.updatedAt,
    render: (l) => formatDate(l.updatedAt),
  },
];
