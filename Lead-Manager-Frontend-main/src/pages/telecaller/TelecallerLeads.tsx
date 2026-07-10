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
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Upload,
  Share2,
  Loader2,
  Download,
  Database,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLeadColumnPrefs } from "@/hooks/useLeadColumnPrefs";
import { getLeadColumnDefs } from "@/lib/leadColumns";
import { LeadDetailsModal } from "@/components/LeadDetailsModal";
import {
  useBulkCsvMutation,
  useBulkJsonMutation,
  useCreateLeadMutation,
  useCreateMetaLeadMutation,
  useGetLeadsQuery,
  type Lead,
  CLIENT_INTEREST_OPTIONS,
  type ClientInterest,
} from "@/redux/slice/lead/leadApiSlice";

/** Helpers */
const isEmail = (v: string) => /\S+@\S+\.\S+/.test(v);
const onlyDigits = (v: string, max = 10) => v.replace(/\D/g, "").slice(0, max);

export default function Leads() {
  const { toast } = useToast();

  // ---- Forms state: Create Lead ----
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cCompany, setCCompany] = useState("");
  const [cNotes, setCNotes] = useState("");
  const [cInterest, setCInterest] = useState<ClientInterest | "">("");

  // ---- Forms state: Bulk ----
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [jsonText, setJsonText] = useState(
    '[\n  {"name":"Aman","phone":"9876543210","email":"aman@example.com","clientInterest":"Construction"}\n]'
  );
  const [recentPage, setRecentPage] = useState(1);
  const [recentLimit, setRecentLimit] = useState(10);
  const { visibleColumns } = useLeadColumnPrefs();

  // ---- Forms state: Meta ----
  const [mPlatform, setMPlatform] = useState("facebook");
  const [mCampaign, setMCampaign] = useState("");
  const [mName, setMName] = useState("");
  const [mEmail, setMEmail] = useState("");
  const [mPhone, setMPhone] = useState("");
  const [mInterest, setMInterest] = useState<ClientInterest | "">("");

  // ---- Mutations ----
  const [createLead, { isLoading: creating }] = useCreateLeadMutation();
  const [bulkCsv, { isLoading: uploadingCsv }] = useBulkCsvMutation();
  const [bulkJson, { isLoading: uploadingJson }] = useBulkJsonMutation();
  const [createMetaLead, { isLoading: creatingMeta }] =
    useCreateMetaLeadMutation();

  // ---- Recent leads (admin sees all, telecaller sees own) ----
  const {
    data: recent,
    isLoading: loadingRecent,
    isError: recentErr,
    refetch: refetchLeads,
  } = useGetLeadsQuery({ page: recentPage, limit: recentLimit });

  const recentItems = useMemo(() => recent?.items ?? [], [recent]);
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

  useEffect(() => {
    setRecentPage(1);
  }, [recentLimit]);

  const leadColumns = useMemo(() => getLeadColumnDefs(), []);
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

  /* ================= CREATE LEAD ================= */
  const canCreate =
    cName.trim().length > 1 && isEmail(cEmail) && cPhone.length === 10;

  const onCreateLead: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!canCreate) {
      toast({
        title: "Fill required fields",
        description: "Name, valid email and 10-digit phone are required.",
        variant: "destructive",
      });
      return;
    }
    try {
      await createLead({
        name: cName.trim(),
        email: cEmail.trim(),
        phone: cPhone,
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
    if (!csvFile) {
      toast({
        title: "No file selected",
        description: "Please choose a CSV file.",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await bulkCsv({ file: csvFile }).unwrap();
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
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("JSON must be a non-empty array of lead objects");
      }
      const res = await bulkJson({ leads: parsed }).unwrap();
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

  /* ================= META LEADS ================= */
  const canMeta =
    mName.trim().length > 1 &&
    mPhone.length === 10 &&
    (!mEmail || isEmail(mEmail));

  const onCreateMeta: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!canMeta) {
      toast({
        title: "Fill required fields",
        description:
          "Name and 10-digit phone are required. Email (if provided) must be valid.",
        variant: "destructive",
      });
      return;
    }
    try {
      await createMetaLead({
        name: mName.trim(),
        phone: mPhone,
        email: mEmail || undefined,
        platform: mPlatform,
        campaign: mCampaign || undefined,
        clientInterest: mInterest || undefined,
      } as any).unwrap();

      toast({
        title: "Meta Lead Created",
        description: "Lead captured from Meta flow.",
      });
      setMName("");
      setMPhone("");
      setMEmail("");
      setMCampaign("");
      setMInterest("");
      refetchLeads();
    } catch (err: any) {
      toast({
        title: "Meta lead failed",
        description: err?.data?.message || err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

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
                    Table shows 4 fields. Use “View More” for full details.
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                        <div className="grid gap-2">
                          {cardLeadColumnDefs.map((col) => (
                            <div key={col.key} className="flex items-start justify-between gap-3 text-xs">
                              <span className="text-muted-foreground">{col.label}</span>
                              <span className="text-right">{col.render(l)}</span>
                            </div>
                          ))}
                        </div>
                        <LeadDetailsModal lead={l} triggerLabel="View More" />
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
                              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : recentErr ? (
                        <TableRow>
                          <TableCell
                            colSpan={tableLeadColumnDefs.length + 1}
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
                            <TableCell className="text-right">
                              <LeadDetailsModal lead={l} triggerLabel="View More" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={tableLeadColumnDefs.length + 1}
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
                      <Button type="submit" disabled={!csvFile || uploadingCsv}>
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
                    <Button type="submit" disabled={uploadingJson}>
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
            <Card>
              <CardHeader>
                <CardTitle>Meta Lead Capture</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={onCreateMeta} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="m-platform">Platform</Label>
                      <select
                        id="m-platform"
                        className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                        value={mPlatform}
                        onChange={(e) => setMPlatform(e.target.value)}
                      >
                        <option value="facebook">Facebook</option>
                        <option value="instagram">Instagram</option>
                        <option value="whatsapp">WhatsApp</option>
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="m-campaign">Campaign (optional)</Label>
                      <Input
                        id="m-campaign"
                        placeholder="Campaign / Ad name"
                        value={mCampaign}
                        onChange={(e) => setMCampaign(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="m-name">Full Name</Label>
                      <Input
                        id="m-name"
                        placeholder="Neha Verma"
                        value={mName}
                        onChange={(e) => setMName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="m-email">Email (optional)</Label>
                      <Input
                        id="m-email"
                        type="email"
                        placeholder="neha@example.com"
                        value={mEmail}
                        onChange={(e) => setMEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="m-phone">Phone (10 digits)</Label>
                      <Input
                        id="m-phone"
                        inputMode="numeric"
                        placeholder="9123456780"
                        value={mPhone}
                        onChange={(e) => setMPhone(onlyDigits(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="m-interest">Client Interest</Label>
                      <select
                        id="m-interest"
                        className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                        value={mInterest}
                        onChange={(e) =>
                          setMInterest(
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
                  </div>

                  <div className="flex items-center gap-2 mt-4">
                    <Button type="submit" disabled={!canMeta || creatingMeta}>
                      {creatingMeta ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Share2 className="h-4 w-4 mr-2" />
                      )}
                      Create Meta Lead
                    </Button>

                    <MetaInfoDialog />
                  </div>

                  <div className="p-4 mt-4 rounded-lg bg-muted">
                    <h4 className="font-semibold mb-1">Integration Status</h4>
                    <p className="text-sm text-muted-foreground">
                      Direct webhook integration can be added later (Facebook Lead Ads
                      → Webhook → <code>/leads/meta</code>).
                    </p>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

/** Small helper dialog explaining the flow (optional, polish) */
function MetaInfoDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Learn more
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>How Meta Lead Capture Works</DialogTitle>
          <DialogDescription>
            Quick overview of capturing leads from Facebook/Instagram forms.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc pl-5 space-y-2 text-sm">
          <li>Create Facebook Lead Ads and add a webhook to your server.</li>
          <li>
            Parse the payload and post to <code>/leads/meta</code> with
            name/phone/email/campaign/clientInterest.
          </li>
          <li>Leads appear in “Recent Leads” automatically.</li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
