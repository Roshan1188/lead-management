// src/pages/admin/Leads.tsx
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Upload,
  Loader2,
  Download,
  Database,
  SlidersHorizontal,
  Search,
  CalendarIcon,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLeadColumnPrefs } from "@/hooks/useLeadColumnPrefs";
import {
  getLeadColumnDefs,
  formatLeadType,
  LEAD_COLUMNS,
  LEAD_COLUMN_LABELS,
} from "@/lib/leadColumns";
import { LeadDetailsModal } from "@/components/LeadDetailsModal";
import {
  useBulkCsvMutation,
  useBulkJsonMutation,
  useCreateLeadMutation,
  useGetLeadsQuery,
  useLazyGetLeadsQuery,
  type Lead,
  CLIENT_INTEREST_OPTIONS,
  type ClientInterest,
  BUSINESS_OPTIONS,
  BUSINESS_LABELS,
  type Business,
} from "@/redux/slice/lead/leadApiSlice";
import {
  useGetMetaConfigQuery,
  useUpdateMetaConfigMutation,
  useGetMetaPagesQuery,
  useGetMetaFormsQuery,
  useSyncMetaLeadsMutation,
} from "@/redux/slice/admin/adminApiSlice";

/** Helpers */
const isEmail = (v: string) => /\S+@\S+\.\S+/.test(v);
const onlyDigits = (v: string, max = 10) => v.replace(/\D/g, "").slice(0, max);
const toDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN") : "—";
const toRelativeTime = (iso?: string | null) => {
  if (!iso) return "No sync has run yet.";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const getActualMetaLeadDateIso = (lead: Lead) => {
  if (lead.metaLeadCreatedAt) return lead.metaLeadCreatedAt;
  const raw = lead.metaRaw as { created_time?: string } | undefined;
  if (raw?.created_time) return raw.created_time;
  return null;
};

const getLeadDateTime = (lead: Lead) =>
  toDateTime(getActualMetaLeadDateIso(lead) || lead.createdAt || lead.metaFetchedAt);

const getFetchedDateTime = (lead: Lead) => toDateTime(lead.metaFetchedAt || lead.createdAt);

const getLeadRecencyTs = (lead: Lead) =>
  new Date(
    getActualMetaLeadDateIso(lead) || lead.metaFetchedAt || lead.updatedAt || lead.createdAt || 0
  ).getTime();

const getLeadFormName = (lead: Lead, metaFormMap?: Record<string, string>) => {
  const directName =
    typeof lead.metaFormName === "string" && lead.metaFormName.trim()
      ? lead.metaFormName.trim()
      : null;
  if (directName && directName !== lead.metaFormId) return directName;
  if (lead.metaFormId && metaFormMap?.[lead.metaFormId]) return metaFormMap[lead.metaFormId];
  if (lead.leadType === "meta") return "Unknown Form";
  return "—";
};

export default function Leads() {
  const { toast } = useToast();

  // ---- Forms state: Create Lead ----
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cCompany, setCCompany] = useState("");
  const [cNotes, setCNotes] = useState("");
  const [cInterest, setCInterest] = useState<ClientInterest | "">("");
  const [cBusiness, setCBusiness] = useState<Business | "">("");

  // ---- Forms state: Bulk ----
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [bulkBusiness, setBulkBusiness] = useState<Business | "">("");
  const [jsonText, setJsonText] = useState(
    '[\n  {"name":"Aman","phone":"9876543210","email":"aman@example.com","clientInterest":"Construction"}\n]'
  );

  // ---- Recent Leads business filter ----
  const [recentBusiness, setRecentBusiness] = useState<Business | "all">("all");

  // ---- Meta Integration (Lead Ads) ----
  const [metaBusiness, setMetaBusiness] = useState<Business>("doonearth");
  const { data: metaCfg, isLoading: metaCfgLoading, refetch: refetchMetaCfg } = useGetMetaConfigQuery(
    { business: metaBusiness },
    { pollingInterval: 60_000 }
  );
  const [updateMetaCfg, { isLoading: metaCfgSaving }] = useUpdateMetaConfigMutation();
  const [syncMeta, { isLoading: metaSyncing }] = useSyncMetaLeadsMutation();

  const [metaToken, setMetaToken] = useState("");
  const [metaPageId, setMetaPageId] = useState("");
  const [metaFormId, setMetaFormId] = useState("");
  const [metaPage, setMetaPage] = useState(1);
  const [metaLimit, setMetaLimit] = useState(20);
  const [metaSearch, setMetaSearch] = useState("");
  const [metaSearchDebounced, setMetaSearchDebounced] = useState("");
  const [metaDateFrom, setMetaDateFrom] = useState("");
  const [metaDateTo, setMetaDateTo] = useState("");
  const [recentPage, setRecentPage] = useState(1);
  const [recentLimit, setRecentLimit] = useState(10);
  const { visibleColumns, toggleColumn, resetColumns } = useLeadColumnPrefs();

  // hydrate from server config (fallback to local cache), per-business
  useEffect(() => {
    if (!metaCfg) return;
    const cachedPage =
      typeof window !== "undefined"
        ? window.localStorage.getItem(`lm_meta_page_id_${metaBusiness}`)
        : null;
    const cachedForm =
      typeof window !== "undefined"
        ? window.localStorage.getItem(`lm_meta_form_id_${metaBusiness}`)
        : null;
    setMetaPageId(metaCfg.pageId || cachedPage || "");
    setMetaFormId(metaCfg.formId || cachedForm || "");
  }, [metaCfg, metaBusiness]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`lm_meta_page_id_${metaBusiness}`, metaPageId || "");
    window.localStorage.setItem(`lm_meta_form_id_${metaBusiness}`, metaFormId || "");
  }, [metaPageId, metaFormId, metaBusiness]);

  useEffect(() => {
    setMetaPage(1);
  }, [metaLimit]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setMetaSearchDebounced(metaSearch.trim());
      setMetaPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [metaSearch]);

  // Reset page on date filter change
  useEffect(() => {
    setMetaPage(1);
  }, [metaDateFrom, metaDateTo]);

  useEffect(() => {
    setRecentPage(1);
  }, [recentLimit, recentBusiness]);

  const {
    data: metaPages,
    isFetching: metaPagesLoading,
    refetch: refetchMetaPages,
  } = useGetMetaPagesQuery(
    { business: metaBusiness },
    { skip: !metaCfg?.tokenSet }
  );

  const {
    data: metaForms,
    isFetching: metaFormsLoading,
    isError: metaFormsErr,
    error: metaFormsErrObj,
    refetch: refetchMetaForms,
  } = useGetMetaFormsQuery(
    { business: metaBusiness, pageId: metaPageId || undefined },
    { skip: !metaPageId || !metaCfg?.tokenSet }
  );

  useEffect(() => {
    if (!metaFormId || !metaForms?.data) return;
    if (!metaForms.data.some((f) => f.id === metaFormId)) {
      setMetaFormId("");
    }
  }, [metaForms, metaFormId]);

  useEffect(() => {
    if (!metaPageId || !metaCfg?.tokenSet) return;
    setMetaFormId("");
    refetchMetaForms();
  }, [metaPageId, metaCfg?.tokenSet, refetchMetaForms]);

  // ---- Mutations ----
  const [createLead, { isLoading: creating }] = useCreateLeadMutation();
  const [bulkCsv, { isLoading: uploadingCsv }] = useBulkCsvMutation();
  const [bulkJson, { isLoading: uploadingJson }] = useBulkJsonMutation();
  const [fetchAllLeads] = useLazyGetLeadsQuery();
  const [exporting, setExporting] = useState(false);
  // ---- Recent leads (admin sees all, telecaller sees own) ----
  const {
    data: recent,
    isLoading: loadingRecent,
    isError: recentErr,
    refetch: refetchLeads,
  } = useGetLeadsQuery({
    page: recentPage,
    limit: recentLimit,
    ...(recentBusiness !== "all" ? { business: recentBusiness } : {}),
  });

  // ---- Meta leads table ----
  const {
    data: metaLeads,
    isLoading: loadingMetaLeads,
    isFetching: fetchingMetaLeads,
    isError: metaLeadsErr,
    refetch: refetchMetaLeads,
  } = useGetLeadsQuery({
    page: metaPage,
    limit: metaLimit,
    leadType: "meta",
    business: metaBusiness,
    ...(metaSearchDebounced ? { q: metaSearchDebounced } : {}),
    ...(metaDateFrom ? { dateFrom: metaDateFrom } : {}),
    ...(metaDateTo ? { dateTo: metaDateTo } : {}),
  });

  const recentItems = useMemo(
    () => [...(recent?.items ?? [])].sort((a, b) => getLeadRecencyTs(b) - getLeadRecencyTs(a)),
    [recent?.items]
  );
  const recentPagesCount = recent?.pages || 1;
  const recentTotal = recent?.total || 0;
  const recentRangeStart =
    recentTotal === 0 ? 0 : (recentPage - 1) * recentLimit + 1;
  const recentRangeEnd = Math.min(recentTotal, recentPage * recentLimit);

  useEffect(() => {
    if (recentPage > recentPagesCount && recentPagesCount > 0) {
      setRecentPage(recentPagesCount);
    }
  }, [recentPage, recentPagesCount]);

  const metaItems = useMemo(
    () => [...(metaLeads?.items ?? [])].sort((a, b) => getLeadRecencyTs(b) - getLeadRecencyTs(a)),
    [metaLeads?.items]
  );
  const metaPagesCount = metaLeads?.pages || 1;
  const metaTotal = metaLeads?.total || 0;
  const metaRangeStart = metaTotal === 0 ? 0 : (metaPage - 1) * metaLimit + 1;
  const metaRangeEnd = Math.min(metaTotal, metaPage * metaLimit);

  useEffect(() => {
    if (metaPage > metaPagesCount && metaPagesCount > 0) {
      setMetaPage(metaPagesCount);
    }
  }, [metaPage, metaPagesCount]);

  const metaFormMap = useMemo(() => {
    const map: Record<string, string> = {};
    (metaForms?.data || []).forEach((f) => {
      if (!f.id) return;
      map[f.id] = f.name?.trim() || "Unknown Form";
    });
    return map;
  }, [metaForms]);

  const selectedForm = useMemo(
    () => metaForms?.data?.find((f) => f.id === metaFormId) || null,
    [metaForms, metaFormId]
  );
  const effectivePageId = useMemo(
    () => (metaPageId || metaCfg?.pageId || "").trim(),
    [metaPageId, metaCfg?.pageId]
  );
  const lastSyncFormNames = useMemo(() => {
    const names = (metaCfg?.lastSyncForms || [])
      .map((f) => (f?.name || "").trim())
      .filter(Boolean);
    return names.length ? names.join(", ") : "No form details captured yet.";
  }, [metaCfg?.lastSyncForms]);

  const leadColumns = useMemo(
    () => getLeadColumnDefs(metaFormMap),
    [metaFormMap]
  );

  const recentPageItems = useMemo(() => {
    const totalPages = Math.max(1, recentPagesCount);
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const items: Array<number | "ellipsis"> = [1];
    if (recentPage > 3) items.push("ellipsis");
    const start = Math.max(2, recentPage - 1);
    const end = Math.min(totalPages - 1, recentPage + 1);
    for (let i = start; i <= end; i += 1) items.push(i);
    if (recentPage < totalPages - 2) items.push("ellipsis");
    items.push(totalPages);
    return items;
  }, [recentPage, recentPagesCount]);

  const metaPageItems = useMemo(() => {
    const totalPages = Math.max(1, metaPagesCount);
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const items: Array<number | "ellipsis"> = [1];
    if (metaPage > 3) items.push("ellipsis");
    const start = Math.max(2, metaPage - 1);
    const end = Math.min(totalPages - 1, metaPage + 1);
    for (let i = start; i <= end; i += 1) items.push(i);
    if (metaPage < totalPages - 2) items.push("ellipsis");
    items.push(totalPages);
    return items;
  }, [metaPage, metaPagesCount]);

  const visibleLeadColumnDefs = useMemo(
    () => leadColumns.filter((c) => visibleColumns.includes(c.key)),
    [leadColumns, visibleColumns]
  );
  const showName = visibleColumns.includes("name");
  const tableLeadColumnDefs = useMemo(
    () => visibleLeadColumnDefs.slice(0, 4),
    [visibleLeadColumnDefs]
  );
  const cardLeadColumnDefs = useMemo(
    () =>
      showName
        ? tableLeadColumnDefs.filter((c) => c.key !== "name")
        : tableLeadColumnDefs,
    [tableLeadColumnDefs, showName]
  );

  const isMetaInitialLoading =
    loadingMetaLeads && (!metaLeads || metaItems.length === 0);
  const isMetaRefreshing = fetchingMetaLeads && !isMetaInitialLoading;

  /* ================= CREATE LEAD ================= */
  const canCreate =
    cName.trim().length > 1 && isEmail(cEmail) && cPhone.length === 10 && !!cBusiness;

  const onCreateLead: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!canCreate) {
      toast({
        title: "Fill required fields",
        description: "Name, valid email, 10-digit phone and Business are required.",
        variant: "destructive",
      });
      return;
    }
    try {
      await createLead({
        name: cName.trim(),
        email: cEmail.trim(),
        phone: cPhone,
        business: cBusiness || undefined,
        source: cCompany ? `Company: ${cCompany}` : undefined,
        clientInterest: cInterest || undefined,
        // optional notes
        notes: cNotes || undefined,
      } as any).unwrap();

      toast({
        title: "Lead Created",
        description: "New lead has been created successfully.",
      });
      setCName("");
      setCEmail("");
      setCPhone("");
      setCCompany("");
      setCNotes("");
      setCInterest("");
      setCBusiness("");
      refetchLeads();
    } catch (err: any) {
      toast({
        title: "Create failed",
        description: err?.data?.message || err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  /* ================= BULK UPLOAD ================= */
  const onUploadCsv: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!csvFile || !bulkBusiness) {
      toast({
        title: "Missing info",
        description: "Please choose a CSV file and a Business.",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await bulkCsv({ file: csvFile, business: bulkBusiness }).unwrap();
      toast({
        title: "CSV Uploaded",
        description: `${res.inserted} leads inserted.`,
      });
      setCsvFile(null);
      const el = document.getElementById(
        "leads-csv-input"
      ) as HTMLInputElement | null;
      if (el) el.value = "";
      refetchLeads();
    } catch (err: any) {
      toast({
        title: "Bulk CSV failed",
        description:
          err?.data?.message || err?.message || "Please check your CSV format.",
        variant: "destructive",
      });
    }
  };

  const onUploadJson: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!bulkBusiness) {
      toast({
        title: "Missing info",
        description: "Please select a Business before uploading.",
        variant: "destructive",
      });
      return;
    }
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("JSON must be a non-empty array of lead objects");
      }
      const res = await bulkJson({ leads: parsed, business: bulkBusiness }).unwrap();
      toast({
        title: "JSON Uploaded",
        description: `${res.inserted} leads inserted.`,
      });
      refetchLeads();
    } catch (err: any) {
      toast({
        title: "Bulk JSON failed",
        description: err?.message || "Invalid JSON payload.",
        variant: "destructive",
      });
    }
  };

  const csvEscape = (val: unknown) => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const buildLeadCsvRow = (l: Lead) => {
    const assignedTo =
      typeof l.assignedTo === "object" && l.assignedTo
        ? l.assignedTo.name || ""
        : "";
    const createdBy =
      typeof l.createdBy === "object" && l.createdBy
        ? l.createdBy.name || ""
        : "";
    const formName = getLeadFormName(l, metaFormMap);
    const leadDateIso = getActualMetaLeadDateIso(l) || l.createdAt || l.metaFetchedAt || "";
    return [
      l.name || "",
      l.phone || "",
      l.email || "",
      l.status || "",
      l.clientInterest || "",
      formatLeadType(l.leadType),
      l.source || "",
      assignedTo,
      createdBy,
      formName,
      leadDateIso ? new Date(leadDateIso).toLocaleString("en-IN") : "",
      l.followUpDate ? new Date(l.followUpDate).toLocaleString("en-IN") : "",
      l.reason || "",
    ].map(csvEscape).join(",");
  };

  const LEAD_CSV_HEADERS = [
    "Name",
    "Phone",
    "Email",
    "Status",
    "Client Interest",
    "Lead Type",
    "Source",
    "Assigned To",
    "Created By",
    "Form Name",
    "Lead Date",
    "Follow-up Date",
    "Reason",
  ];

  const triggerCsvDownload = (rows: string[], filename: string) => {
    const csv = "﻿" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onExportMetaLeads = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetchAllLeads({
        page: 1,
        limit: 10000,
        leadType: "meta",
        ...(metaSearchDebounced ? { q: metaSearchDebounced } : {}),
        ...(metaDateFrom ? { dateFrom: metaDateFrom } : {}),
        ...(metaDateTo ? { dateTo: metaDateTo } : {}),
      }).unwrap();

      const items = res?.items || [];
      if (items.length === 0) {
        toast({
          title: "No leads to export",
          description: "Koi lead nahi mila current filters ke saath.",
          variant: "destructive",
        });
        return;
      }

      const rows = [
        LEAD_CSV_HEADERS.map(csvEscape).join(","),
        ...items.map(buildLeadCsvRow),
      ];
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      triggerCsvDownload(rows, `meta_leads_${ts}.csv`);

      toast({
        title: "Export ready",
        description: `${items.length} meta leads exported to CSV.`,
      });
    } catch (err: any) {
      toast({
        title: "Export failed",
        description: err?.data?.message || err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const downloadCsvTemplate = () => {
    const rows = [
      ["name", "phone", "email", "company", "clientInterest"],
      [
        "Aman Kumar",
        "9876543210",
        "aman@example.com",
        "Acme Pvt Ltd",
        "Construction",
      ],
      ["Neha Verma", "9123456780", "neha@example.com", "—", "Interior"],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  /* ================= META INTEGRATION (Lead Ads) ================= */
  const onSaveMetaConfig = async () => {
    try {
      const payload: { business: Business; accessToken?: string; pageId?: string; formId?: string } = {
        business: metaBusiness,
      };
      if (metaToken.trim()) payload.accessToken = metaToken.trim();
      if (metaPageId.trim()) payload.pageId = metaPageId.trim();
      else payload.pageId = "";
      if (metaFormId.trim()) payload.formId = metaFormId.trim();
      else payload.formId = "";

      await updateMetaCfg(payload).unwrap();
      setMetaToken("");
      toast({ title: "Meta config saved", description: "Token/Page/Form updated." });
      refetchMetaCfg();
      if (metaPageId) refetchMetaForms();
    } catch (err: any) {
      toast({
        title: "Meta config failed",
        description: err?.data?.message || err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const runMetaSync = async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      const res = await syncMeta({ business: metaBusiness }).unwrap();
      const fetchedAtText = toDateTime(res.fetchedAt || null);
      const autoAssignText = res.autoAssignedTo
        ? `auto-assigned to telecaller ${res.autoAssignedTo}`
        : "auto-assignment skipped (no active telecaller).";
      const syncedFormNames = (res.formsSynced || [])
        .map((f) => (f?.name || "").trim())
        .filter(Boolean);
      const formText = syncedFormNames.length
        ? `forms: ${syncedFormNames.join(", ")}`
        : "forms: none";
      if (!silent) {
        toast({
          title: "Meta sync complete",
          description: `Fetched ${res.fetched}, inserted ${res.inserted}, skipped ${res.skipped}. Fetched at ${fetchedAtText}. ${formText}, ${autoAssignText}`,
        });
      }
      refetchMetaCfg();
      refetchLeads();
      refetchMetaLeads();
      return res;
    } catch (err: any) {
      if (!silent) {
        toast({
          title: "Meta sync failed",
          description: err?.data?.message || err?.message || "Please try again.",
          variant: "destructive",
        });
      }
      return null;
    }
  };

  const onSyncMetaLeads = async () => {
    await runMetaSync();
  };

  useEffect(() => {
    if (!metaCfg?.tokenSet || !effectivePageId) return;

    const THIRTY_MINUTES = 30 * 60 * 1000;
    const lastSyncTs = metaCfg?.lastSyncAt ? new Date(metaCfg.lastSyncAt).getTime() : 0;

    if (!lastSyncTs || Date.now() - lastSyncTs >= THIRTY_MINUTES) {
      runMetaSync({ silent: true });
    }

    const timer = window.setInterval(() => {
      runMetaSync({ silent: true });
    }, THIRTY_MINUTES);

    return () => window.clearInterval(timer);
  }, [metaCfg?.tokenSet, metaCfg?.lastSyncAt, effectivePageId]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Lead Management</h2>
            <p className="text-muted-foreground">Create and manage your leads</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetchLeads()}>
              <Database className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="create" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="create">Create Lead</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Upload</TabsTrigger>
            <TabsTrigger value="meta">Meta Leads</TabsTrigger>
          </TabsList>

          {/* ============ Create ============ */}
          <TabsContent value="create" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Create New Lead</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={onCreateLead} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="c-name">Full Name</Label>
                      <Input
                        id="c-name"
                        placeholder="John Doe"
                        value={cName}
                        onChange={(e) => setCName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-email">Email</Label>
                      <Input
                        id="c-email"
                        type="email"
                        placeholder="john@example.com"
                        value={cEmail}
                        onChange={(e) => setCEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-phone">Phone (10 digits)</Label>
                      <Input
                        id="c-phone"
                        inputMode="numeric"
                        placeholder="9876543210"
                        value={cPhone}
                        onChange={(e) => setCPhone(onlyDigits(e.target.value))}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-company">Company (optional)</Label>
                      <Input
                        id="c-company"
                        placeholder="Acme Pvt Ltd"
                        value={cCompany}
                        onChange={(e) => setCCompany(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-interest">Client Interest</Label>
                      <select
                        id="c-interest"
                        className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                        value={cInterest}
                        onChange={(e) =>
                          setCInterest(
                            (e.target.value || "") as ClientInterest | ""
                          )
                        }
                      >
                        <option value="">Select interest</option>
                        {CLIENT_INTEREST_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-business">Business</Label>
                      <select
                        id="c-business"
                        className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                        value={cBusiness}
                        onChange={(e) =>
                          setCBusiness((e.target.value || "") as Business | "")
                        }
                        required
                      >
                        <option value="">Select business</option>
                        {BUSINESS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {BUSINESS_LABELS[opt]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="c-notes">Notes</Label>
                    <Textarea
                      id="c-notes"
                      placeholder="Additional information..."
                      value={cNotes}
                      onChange={(e) => setCNotes(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button type="submit" disabled={!canCreate || creating}>
                      {creating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Create Lead
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setCName("");
                        setCEmail("");
                        setCPhone("");
                        setCCompany("");
                        setCNotes("");
                        setCInterest("");
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Recent Leads */}
            <Card>
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Recent Leads</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {recentTotal
                      ? `Showing ${recentRangeStart}-${recentRangeEnd} of ${recentTotal}`
                      : "No leads yet."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Table shows 4 fields. Use "View More" for full details.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={recentBusiness}
                    onChange={(e) =>
                      setRecentBusiness((e.target.value || "all") as Business | "all")
                    }
                  >
                    <option value="all">All Businesses</option>
                    {BUSINESS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {BUSINESS_LABELS[opt]}
                      </option>
                    ))}
                  </select>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        <SlidersHorizontal className="h-4 w-4 mr-2" />
                        Fields
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Show Fields</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {LEAD_COLUMNS.map((key) => (
                        <DropdownMenuCheckboxItem
                          key={key}
                          checked={visibleColumns.includes(key)}
                          onCheckedChange={(checked) =>
                            toggleColumn(key, Boolean(checked))
                          }
                        >
                          {LEAD_COLUMN_LABELS[key]}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={resetColumns}>
                        Reset to Default
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Select
                    value={String(recentLimit)}
                    onValueChange={(v) => setRecentLimit(Number(v))}
                  >
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue placeholder="Rows" />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 20, 50, 100].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} rows
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Mobile cards */}
                <div className="space-y-3 md:hidden">
                  {loadingRecent ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="rounded-lg border p-4 space-y-2">
                        <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-56 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                      </div>
                    ))
                  ) : recentErr ? (
                    <div className="text-sm text-destructive">
                      Failed to load.{" "}
                      <button className="underline" onClick={() => refetchLeads()}>
                        Retry
                      </button>
                    </div>
                  ) : recentItems.length > 0 ? (
                    recentItems.map((l: Lead) => (
                      <div key={l._id} className="rounded-lg border p-4 space-y-3">
                        <div className="font-medium">
                          {showName ? l.name || "—" : "Lead"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Lead Date: {getLeadDateTime(l)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Form: {getLeadFormName(l, metaFormMap)}
                        </div>
                        <div className="grid gap-2">
                          {cardLeadColumnDefs.map((col) => (
                            <div key={col.key} className="flex items-start justify-between gap-3 text-xs">
                              <span className="text-muted-foreground">{col.label}</span>
                              <span className="text-right">{col.render(l)}</span>
                            </div>
                          ))}
                        </div>
                        <LeadDetailsModal
                          lead={l}
                          metaFormMap={metaFormMap}
                          triggerLabel="View More"
                        />
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-sm text-muted-foreground">
                      No leads yet.
                    </div>
                  )}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block w-full overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {tableLeadColumnDefs.map((col) => (
                          <TableHead key={col.key}>{col.label}</TableHead>
                        ))}
                        <TableHead>Lead Date</TableHead>
                        <TableHead>Form Name</TableHead>
                        <TableHead className="text-right">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingRecent ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <TableRow key={i}>
                            {tableLeadColumnDefs.map((_, idx) => (
                              <TableCell key={idx}>
                                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                              </TableCell>
                            ))}
                            <TableCell>
                              <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                            </TableCell>
                            <TableCell>
                              <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                            </TableCell>
                            <TableCell>
                              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : recentErr ? (
                        <TableRow>
                          <TableCell
                            colSpan={tableLeadColumnDefs.length + 3}
                            className="text-sm text-destructive"
                          >
                            Failed to load.{" "}
                            <button
                              className="underline"
                              onClick={() => refetchLeads()}
                            >
                              Retry
                            </button>
                          </TableCell>
                        </TableRow>
                      ) : recentItems.length > 0 ? (
                        recentItems.map((l: Lead) => (
                          <TableRow key={l._id}>
                            {tableLeadColumnDefs.map((col) => (
                              <TableCell key={col.key}>{col.render(l)}</TableCell>
                            ))}
                            <TableCell>{getLeadDateTime(l)}</TableCell>
                            <TableCell>{getLeadFormName(l, metaFormMap)}</TableCell>
                            <TableCell className="text-right">
                              <LeadDetailsModal
                                lead={l}
                                metaFormMap={metaFormMap}
                                triggerLabel="View More"
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={tableLeadColumnDefs.length + 3}
                            className="text-center text-sm text-muted-foreground"
                          >
                            No leads yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    Page {recentPage} of {recentPagesCount}
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          className={
                            recentPage <= 1
                              ? "pointer-events-none opacity-50"
                              : undefined
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            if (recentPage > 1) setRecentPage(recentPage - 1);
                          }}
                        />
                      </PaginationItem>
                      {recentPageItems.map((p, idx) => (
                        <PaginationItem key={`${p}-${idx}`}>
                          {p === "ellipsis" ? (
                            <PaginationEllipsis />
                          ) : (
                            <PaginationLink
                              href="#"
                              isActive={recentPage === p}
                              onClick={(e) => {
                                e.preventDefault();
                                setRecentPage(p);
                              }}
                            >
                              {p}
                            </PaginationLink>
                          )}
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          className={
                            recentPage >= recentPagesCount
                              ? "pointer-events-none opacity-50"
                              : undefined
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            if (recentPage < recentPagesCount)
                              setRecentPage(recentPage + 1);
                          }}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ Bulk Upload ============ */}
          <TabsContent value="bulk" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="bulk-business">Business (applies to whole batch)</Label>
                  <select
                    id="bulk-business"
                    className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                    value={bulkBusiness}
                    onChange={(e) =>
                      setBulkBusiness((e.target.value || "") as Business | "")
                    }
                    required
                  >
                    <option value="">Select business</option>
                    {BUSINESS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {BUSINESS_LABELS[opt]}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* CSV Upload */}
              <Card>
                <CardHeader>
                  <CardTitle>Upload CSV</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={onUploadCsv} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="leads-csv-input">CSV File</Label>
                      <Input
                        id="leads-csv-input"
                        type="file"
                        accept=".csv"
                        onChange={(e) =>
                          setCsvFile(e.target.files?.[0] || null)
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Expected columns:{" "}
                        <span className="font-medium">
                          name, phone, email, company, clientInterest
                        </span>
                        .<br />
                        clientInterest can be one of:{" "}
                        <span className="font-medium">
                          {CLIENT_INTEREST_OPTIONS.join(", ")}
                        </span>
                        .
                      </p>
                      {csvFile && (
                        <div className="text-sm">
                          Selected:{" "}
                          <span className="font-medium">{csvFile.name}</span>{" "}
                          <span className="text-muted-foreground">
                            ({Math.round(csvFile.size / 1024)} KB)
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={!csvFile || !bulkBusiness || uploadingCsv}>
                        {uploadingCsv ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Upload Leads
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={downloadCsvTemplate}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Template
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* JSON Upload */}
              <Card>
                <CardHeader>
                  <CardTitle>Upload JSON</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={onUploadJson} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="leads-json">Paste JSON Array</Label>
                      <Textarea
                        id="leads-json"
                        rows={10}
                        value={jsonText}
                        onChange={(e) => setJsonText(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Array of objects with keys:{" "}
                        <span className="font-medium">
                          name, phone, email, clientInterest (optional)
                        </span>
                        . Example:{" "}
                        <code className="text-[10px]">
                          &#123;"name":"Aman","phone":"9876543210","email":"aman@example.com","clientInterest":"Construction"&#125;
                        </code>
                      </p>
                    </div>
                    <Button type="submit" disabled={!bulkBusiness || uploadingJson}>
                      {uploadingJson ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Upload JSON
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ============ Meta Leads ============ */}
          <TabsContent value="meta" className="space-y-4">
            {/* Meta Lead Ads Integration */}
            <Card>
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Meta Lead Ads Integration</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Connect your Meta Page, pick a form, and sync leads.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={metaBusiness}
                    onChange={(e) => setMetaBusiness(e.target.value as Business)}
                  >
                    {BUSINESS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {BUSINESS_LABELS[opt]}
                      </option>
                    ))}
                  </select>
                  <Button onClick={onSaveMetaConfig} disabled={metaCfgSaving}>
                    {metaCfgSaving ? "Saving…" : "Save Settings"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Last Meta Sync
                      </p>
                      <p className="text-sm font-semibold">
                        {toDateTime(metaCfg?.lastSyncAt || null)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {toRelativeTime(metaCfg?.lastSyncAt || null)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Forms Synced: <span className="font-medium text-foreground">{lastSyncFormNames}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        Fetched: {metaCfg?.lastSyncFetched ?? 0}
                      </Badge>
                      <Badge variant="secondary">
                        Inserted: {metaCfg?.lastSyncInserted ?? 0}
                      </Badge>
                      <Badge variant="secondary">
                        Skipped: {metaCfg?.lastSyncSkipped ?? 0}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="meta-token">Access Token</Label>
                    <Input
                      id="meta-token"
                      type="password"
                      placeholder={
                        metaCfg?.tokenHint
                          ? `Token saved (ends with ****${metaCfg.tokenHint})`
                          : metaCfg?.tokenSet
                          ? "Token is set (enter to replace)"
                          : "Paste Meta access token"
                      }
                      value={metaToken}
                      onChange={(e) => setMetaToken(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {metaCfgLoading
                        ? "Loading config…"
                        : metaCfg?.tokenHint
                        ? `Token saved (ends with ****${metaCfg.tokenHint}). Enter a new token to update.`
                        : metaCfg?.tokenSet
                        ? "Token saved in server (masked). Enter a new token to update."
                        : "Token not set yet."}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Page</Label>
                    <Select value={metaPageId || ""} onValueChange={setMetaPageId}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            metaCfg?.tokenSet
                              ? "Select a Page"
                              : "Set token to load pages"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(metaPages?.data || []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name || p.id} ({p.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {metaPagesLoading
                          ? "Loading pages…"
                          : metaCfg?.tokenSet
                          ? metaPages?.data?.length
                            ? `Pages available: ${metaPages.data.length}`
                            : "No pages found for this token"
                          : "Token not set yet"}
                      </span>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => refetchMetaPages()}
                        disabled={!metaCfg?.tokenSet || metaPagesLoading}
                      >
                        Refresh
                      </button>
                    </div>
                    {metaPageId && (
                      <p className="text-xs text-muted-foreground">
                        Selected Page ID:{" "}
                        <span className="font-mono">{metaPageId}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Form</Label>
                    <Select value={metaFormId || ""} onValueChange={setMetaFormId}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            metaPageId ? "Select a form" : "Pick a page first"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(metaForms?.data || []).map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name?.trim() || "Unknown Form"}{" "}
                            {f.status ? `(${f.status})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground">
                      {metaFormsLoading
                        ? "Fetching forms…"
                        : metaFormsErr
                        ? "Failed to load forms."
                        : metaPageId
                        ? metaForms?.data?.length
                          ? `Forms for Page: ${metaPageId}`
                          : "No forms found for this Page"
                        : "Select a Page to load forms"}
                    </div>
                    {metaFormsErr && (
                      <div className="text-xs text-destructive">
                        {(metaFormsErrObj as any)?.data?.error ||
                          (metaFormsErrObj as any)?.data?.message ||
                          (metaFormsErrObj as any)?.message ||
                          "Please try again."}
                      </div>
                    )}
                    {selectedForm && (
                      <div className="rounded-md border bg-muted/30 p-3 text-xs">
                        <div className="font-medium mb-2">
                          {selectedForm.name?.trim() || "Unknown Form"}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">
                            {selectedForm.status || "—"}
                          </Badge>
                          <Badge variant="outline">
                            {selectedForm.locale || "—"}
                          </Badge>
                        </div>
                        <div className="mt-2 text-muted-foreground">
                          Form ID:{" "}
                          <span className="font-mono">{selectedForm.id}</span>
                        </div>
                      </div>
                    )}
                    {metaCfg?.formId && (
                      <p className="text-xs text-muted-foreground">
                        Saved Form ID:{" "}
                        <span className="font-mono">{metaCfg.formId}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => refetchMetaPages()}
                    disabled={!metaCfg?.tokenSet || metaPagesLoading}
                  >
                    Refresh Pages
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => refetchMetaForms()}
                    disabled={!metaPageId || !metaCfg?.tokenSet || metaFormsLoading}
                  >
                    Refresh Forms
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={onSyncMetaLeads}
                    disabled={!effectivePageId || !metaCfg?.tokenSet || metaSyncing}
                  >
                    {metaSyncing ? "Syncing…" : "Sync Leads"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sync fetches leads from all forms of selected page:{" "}
                  <span className="font-mono">{effectivePageId || "Not set"}</span>
                </p>
              </CardContent>
            </Card>

            {/* Meta leads table */}
            <Card>
              <CardHeader className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Meta Leads</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {metaTotal
                        ? `Showing ${metaRangeStart}-${metaRangeEnd} of ${metaTotal}`
                        : "No meta leads yet."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last Sync: {toDateTime(metaCfg?.lastSyncAt || null)} ({toRelativeTime(metaCfg?.lastSyncAt || null)})
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isMetaRefreshing && (
                      <span className="text-xs text-muted-foreground">
                        Refreshing…
                      </span>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <SlidersHorizontal className="h-4 w-4 mr-2" />
                          Fields
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>Show Fields</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {LEAD_COLUMNS.map((key) => (
                          <DropdownMenuCheckboxItem
                            key={key}
                            checked={visibleColumns.includes(key)}
                            onCheckedChange={(checked) =>
                              toggleColumn(key, Boolean(checked))
                            }
                          >
                            {LEAD_COLUMN_LABELS[key]}
                          </DropdownMenuCheckboxItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={resetColumns}>
                          Reset to Default
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Select
                      value={String(metaLimit)}
                      onValueChange={(v) => setMetaLimit(Number(v))}
                    >
                      <SelectTrigger className="w-full sm:w-[120px]">
                        <SelectValue placeholder="Rows" />
                      </SelectTrigger>
                      <SelectContent>
                        {[10, 20, 50, 100].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} rows
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onExportMetaLeads}
                      disabled={exporting || metaTotal === 0}
                    >
                      {exporting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Export CSV
                    </Button>

                    <Button variant="outline" size="sm" onClick={() => refetchMetaLeads()}>
                      <Database className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </div>

                {/* Search & Date Filters */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, phone, email..."
                      value={metaSearch}
                      onChange={(e) => setMetaSearch(e.target.value)}
                      className="pl-9 pr-8"
                    />
                    {metaSearch && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setMetaSearch("")}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">From</Label>
                      <Input
                        type="date"
                        value={metaDateFrom}
                        onChange={(e) => setMetaDateFrom(e.target.value)}
                        className="w-[150px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">To</Label>
                      <Input
                        type="date"
                        value={metaDateTo}
                        onChange={(e) => setMetaDateTo(e.target.value)}
                        className="w-[150px]"
                      />
                    </div>
                    {(metaDateFrom || metaDateTo) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-5"
                        onClick={() => {
                          setMetaDateFrom("");
                          setMetaDateTo("");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Mobile cards */}
                <div className="space-y-3 md:hidden">
                  {isMetaInitialLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="rounded-lg border p-4 space-y-2">
                        <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-56 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                      </div>
                    ))
                  ) : metaLeadsErr ? (
                    <div className="text-sm text-destructive">
                      Failed to load meta leads.{" "}
                      <button className="underline" onClick={() => refetchMetaLeads()}>
                        Retry
                      </button>
                    </div>
                  ) : metaItems.length > 0 ? (
                    metaItems.map((l: Lead) => (
                      <div key={l._id} className="rounded-lg border p-4 space-y-3">
                        <div className="font-medium">
                          {showName ? l.name || "—" : "Lead"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Lead Date: {getLeadDateTime(l)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Form: {getLeadFormName(l, metaFormMap)}
                        </div>
                        <div className="grid gap-2">
                          {cardLeadColumnDefs.map((col) => (
                            <div key={col.key} className="flex items-start justify-between gap-3 text-xs">
                              <span className="text-muted-foreground">{col.label}</span>
                              <span className="text-right">{col.render(l)}</span>
                            </div>
                          ))}
                        </div>
                        <LeadDetailsModal
                          lead={l}
                          metaFormMap={metaFormMap}
                          triggerLabel="View More"
                        />
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-sm text-muted-foreground">
                      No meta leads yet. Click "Sync Leads".
                    </div>
                  )}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block w-full overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {tableLeadColumnDefs.map((col) => (
                          <TableHead key={col.key}>{col.label}</TableHead>
                        ))}
                        <TableHead>Lead Date</TableHead>
                        <TableHead>Form Name</TableHead>
                        <TableHead className="text-right">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isMetaInitialLoading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <TableRow key={i}>
                            {tableLeadColumnDefs.map((_, idx) => (
                              <TableCell key={idx}>
                                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                              </TableCell>
                            ))}
                            <TableCell>
                              <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                            </TableCell>
                            <TableCell>
                              <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                            </TableCell>
                            <TableCell>
                              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : metaLeadsErr ? (
                        <TableRow>
                          <TableCell
                            colSpan={tableLeadColumnDefs.length + 3}
                            className="text-sm text-destructive"
                          >
                            Failed to load meta leads.{" "}
                            <button
                              className="underline"
                              onClick={() => refetchMetaLeads()}
                            >
                              Retry
                            </button>
                          </TableCell>
                        </TableRow>
                      ) : metaItems.length > 0 ? (
                        metaItems.map((l: Lead) => (
                          <TableRow key={l._id}>
                            {tableLeadColumnDefs.map((col) => (
                              <TableCell key={col.key}>{col.render(l)}</TableCell>
                            ))}
                            <TableCell>{getLeadDateTime(l)}</TableCell>
                            <TableCell>{getLeadFormName(l, metaFormMap)}</TableCell>
                            <TableCell className="text-right">
                              <LeadDetailsModal
                                lead={l}
                                metaFormMap={metaFormMap}
                                triggerLabel="View More"
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={tableLeadColumnDefs.length + 3}
                            className="text-center text-sm text-muted-foreground"
                          >
                            {metaSearchDebounced || metaDateFrom || metaDateTo
                              ? "No leads match your filters."
                              : "No meta leads yet. Click \"Sync Leads\"."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    Page {metaPage} of {metaPagesCount}
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          className={
                            metaPage <= 1
                              ? "pointer-events-none opacity-50"
                              : undefined
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            if (metaPage > 1) setMetaPage(metaPage - 1);
                          }}
                        />
                      </PaginationItem>
                      {metaPageItems.map((p, idx) => (
                        <PaginationItem key={`${p}-${idx}`}>
                          {p === "ellipsis" ? (
                            <PaginationEllipsis />
                          ) : (
                            <PaginationLink
                              href="#"
                              isActive={metaPage === p}
                              onClick={(e) => {
                                e.preventDefault();
                                setMetaPage(p);
                              }}
                            >
                              {p}
                            </PaginationLink>
                          )}
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          className={
                            metaPage >= metaPagesCount
                              ? "pointer-events-none opacity-50"
                              : undefined
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            if (metaPage < metaPagesCount)
                              setMetaPage(metaPage + 1);
                          }}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
      </Tabs>
    </div>
  </DashboardLayout>
  );
}
