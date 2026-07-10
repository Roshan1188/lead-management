// src/pages/admin/Distribution.tsx
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LeadStatus } from "@/types/lead";
import { useToast } from "@/hooks/use-toast";
import { useLeadColumnPrefs } from "@/hooks/useLeadColumnPrefs";
import { getLeadColumnDefs } from "@/lib/leadColumns";
import { LeadDetailsModal } from "@/components/LeadDetailsModal";
import {
  useGetLeadsQuery,
  useUpdateLeadMutation,
  type Lead,
} from "@/redux/slice/lead/leadApiSlice";
import {
  useGetTelecallersQuery,
  type Telecaller,
} from "@/redux/slice/admin/adminApiSlice";
import {
  Loader2,
  Users,
  UserCheck,
  ListChecks,
  Search,
  CheckSquare,
  Square,
  RotateCw,        // ⬅️ added for refresh icon
} from "lucide-react";

/** Helpers */
const startOfTodayIST = () => {
  const now = new Date();
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // 00:00 IST = 18:30 UTC previous day
  return new Date(utc - (5 * 60 + 30) * 60 * 1000);
};

type StatusFilter = "all" | LeadStatus;
type AssignFilter = "all" | "unassigned" | "assigned";

export default function Distribution() {
  const { toast } = useToast();

  // ---- Filters / Search ----
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assignFilter, setAssignFilter] = useState<AssignFilter>("unassigned");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { visibleColumns } = useLeadColumnPrefs();

  // ---- Data ----
  const {
    data: leadPage,
    isLoading: loadingLeads,
    isError: leadErr,
    error: leadErrObj,
    refetch: refetchLeads,
  } = useGetLeadsQuery({ page: 1, limit: 200, business: "spacemanager" }); // DoOnEarth leads are always pre-assigned to the designated telecaller and never enter this manual redistribution pool

  const {
    data: telecallers,
    isLoading: loadingTele,
    isError: teleErr,
    error: teleErrObj,
    refetch: refetchTele,
  } = useGetTelecallersQuery();

  const [updateLead, { isLoading: assigning }] = useUpdateLeadMutation();

  const allLeads = useMemo<Lead[]>(() => leadPage?.items ?? [], [leadPage]);

  // ---- Derived list (filters + search) ----
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return allLeads
      .filter((l) => (statusFilter === "all" ? true : l.status === statusFilter))
      .filter((l) =>
        assignFilter === "all"
          ? true
          : assignFilter === "unassigned"
          ? !l.assignedTo
          : !!l.assignedTo
      )
      .filter((l) => {
        if (!term) return true;
        return (
          (l.name || "").toLowerCase().includes(term) ||
          (l.email || "").toLowerCase().includes(term) ||
          (l.phone || "").toLowerCase().includes(term)
        );
      })
      // Active first; then recent
      .sort((a, b) => {
        const order = (s?: string) =>
          s === "initialize" ? 0 : s === "followup" ? 1 : 2;
        const byStatus = order(a.status) - order(b.status);
        if (byStatus !== 0) return byStatus;
        return (
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime()
        );
      });
  }, [allLeads, statusFilter, assignFilter, q]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, assignFilter, q, limit]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginated = useMemo(
    () => filtered.slice((page - 1) * limit, page * limit),
    [filtered, page, limit]
  );

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

  const rangeStart = totalItems === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(totalItems, page * limit);

  const pageItems = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const items: Array<number | "ellipsis"> = [1];
    if (page > 3) items.push("ellipsis");
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i += 1) items.push(i);
    if (page < totalPages - 2) items.push("ellipsis");
    items.push(totalPages);
    return items;
  }, [page, totalPages]);

  // ---- Stats (client computed) ----
  const todayStart = startOfTodayIST();
  const totalUnassigned = allLeads.filter((l) => !l.assignedTo).length;
  const assignedToday = allLeads.filter(
    (l) => !!l.assignedTo && new Date(l.updatedAt || l.createdAt || 0) >= todayStart
  ).length;
  const activeAssignments = allLeads.filter(
    (l) => !!l.assignedTo && (l.status === "initialize" || l.status === "followup")
  ).length;

  // ---- Selection for bulk assign ----
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const toggleOne = (id: string) =>
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  const visibleIds = paginated.map((l) => l._id);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected[id]);
  const toggleAllVisible = () => {
    setSelected((s) => {
      const next = { ...s };
      const mark = !allChecked;
      for (const id of visibleIds) next[id] = mark;
      return next;
    });
  };
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  // ---- Single assign ----
  const handleAssign = async (leadId: string, telecallerId: string) => {
    try {
      // ✅ correct shape (no nested body)
      await updateLead({ id: leadId, assignedTo: telecallerId }).unwrap();
      toast({ title: "Lead Assigned", description: "Lead successfully assigned." });
      setSelected((s) => ({ ...s, [leadId]: false }));
      refetchLeads();
    } catch (err: any) {
      toast({
        title: "Assign failed",
        description: err?.data?.message || err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  // ---- Bulk assign selected ----
  const [bulkTarget, setBulkTarget] = useState<string>("");
  const onBulkAssign = async () => {
    if (!bulkTarget || selectedIds.length === 0) return;
    try {
      await Promise.all(
        selectedIds.map((id) =>
          // ✅ correct shape here too
          updateLead({ id, assignedTo: bulkTarget }).unwrap()
        )
      );
      toast({
        title: "Bulk Assigned",
        description: `${selectedIds.length} lead(s) assigned successfully.`,
      });
      setSelected({});
      setBulkTarget("");
      refetchLeads();
    } catch (err: any) {
      toast({
        title: "Bulk assign failed",
        description: err?.data?.message || err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const showError =
    (leadErr || teleErr) &&
    ((leadErrObj as any)?.data?.message || (teleErrObj as any)?.data?.message);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Lead Distribution</h2>
            <p className="text-muted-foreground">
              Assign leads to telecallers
              {showError && (
                <>
                  {" · "}
                  <span className="text-destructive">
                    {String(showError) || "Failed to load"}
                  </span>{" "}
                  <button
                    className="underline"
                    onClick={() => { refetchLeads(); refetchTele(); }}
                  >
                    Retry
                  </button>
                </>
              )}
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name / email / phone…"
                className="pl-9 w-full sm:w-[260px]"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <Select value={statusFilter} onValueChange={(v: StatusFilter) => setStatusFilter(v)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="initialize">Initialize</SelectItem>
                <SelectItem value="followup">Follow-up</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={assignFilter} onValueChange={(v: AssignFilter) => setAssignFilter(v)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Assignment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => { setQ(""); setStatusFilter("all"); setAssignFilter("unassigned"); }}
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Stats */}
        <Card>
          {/* ⬇️ Title left, Refresh right */}
          <div className=" flex items-center justify-between mb-4 px-4 pt-4">
            <CardTitle>Distribution Statistics</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { refetchLeads(); refetchTele(); }}
              className="gap-2"
            >
              <RotateCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>

          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-3 rounded-lg border">
                <p className="text-sm font-medium text-muted-foreground">Total Unassigned</p>
                <div className="mt-1 flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <p className="text-3xl font-bold">{totalUnassigned}</p>
                </div>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-sm font-medium text-muted-foreground">Assigned Today</p>
                <div className="mt-1 flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-muted-foreground" />
                  <p className="text-3xl font-bold">{assignedToday}</p>
                </div>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-sm font-medium text-muted-foreground">Active Assignments</p>
                <div className="mt-1 flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  <p className="text-3xl font-bold">{activeAssignments}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bulk assign bar */}
        <Card>
          <CardHeader>
            <CardTitle>Bulk Assign (Selected)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAllVisible}
                className="gap-2"
              >
                {allChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {allChecked ? "Unselect all" : "Select visible"}
              </Button>
              <Badge variant="secondary">Selected: {selectedIds.length}</Badge>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={bulkTarget}
                onValueChange={setBulkTarget}
                disabled={loadingTele || (telecallers ?? []).length === 0}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder={loadingTele ? "Loading telecallers…" : "Choose telecaller…"} />
                </SelectTrigger>
                <SelectContent>
                  {(telecallers ?? []).map((t: Telecaller) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name || t.mobile}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                onClick={onBulkAssign}
                disabled={!bulkTarget || selectedIds.length === 0 || assigning}
                className="gap-2 w-full sm:w-auto"
              >
                {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Assign Selected
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Unassigned & Active Leads</CardTitle>
              <p className="text-xs text-muted-foreground">
                {totalItems ? `Showing ${rangeStart}-${rangeEnd} of ${totalItems}` : "No leads found."}
              </p>
              <p className="text-xs text-muted-foreground">
                Table shows 4 fields. Use “View More” for full details.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
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
              {loadingLeads || loadingTele ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-lg border p-4 space-y-2">
                    <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-56 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                  </div>
                ))
              ) : paginated.length > 0 ? (
                paginated.map((lead) => (
                  <div key={lead._id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {showName ? lead.name || "—" : "Lead"}
                        </div>
                      </div>
                      <button
                        aria-label="select row"
                        onClick={() => toggleOne(lead._id)}
                        className="inline-flex items-center justify-center h-6 w-6 rounded border"
                      >
                        {selected[lead._id] ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </div>

                    <div className="grid gap-2">
                      {cardLeadColumnDefs.map((col) => (
                        <div key={col.key} className="flex items-start justify-between gap-3 text-xs">
                          <span className="text-muted-foreground">{col.label}</span>
                          <span className="text-right">{col.render(lead)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2">
                      <Select
                        onValueChange={(teleId) => handleAssign(lead._id, teleId)}
                        disabled={assigning}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Assign to…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(telecallers ?? []).map((t: Telecaller) => (
                            <SelectItem key={t._id} value={t._id}>
                              {t.name || t.mobile}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <LeadDetailsModal lead={lead} triggerLabel="View More" />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  No leads match your filters.
                </div>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[44px]"></TableHead>
                    {tableLeadColumnDefs.map((col) => (
                      <TableHead key={col.key}>{col.label}</TableHead>
                    ))}
                    <TableHead className="w-[260px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLeads || loadingTele ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="h-5 w-5 bg-muted animate-pulse rounded" />
                        </TableCell>
                        {tableLeadColumnDefs.map((_, idx) => (
                          <TableCell key={idx}>
                            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                          </TableCell>
                        ))}
                        <TableCell>
                          <div className="h-9 w-56 bg-muted animate-pulse rounded" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : paginated.length > 0 ? (
                    paginated.map((lead) => (
                      <TableRow key={lead._id}>
                        <TableCell>
                          <button
                            aria-label="select row"
                            onClick={() => toggleOne(lead._id)}
                            className="inline-flex items-center justify-center h-5 w-5 rounded border"
                          >
                            {selected[lead._id] ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        </TableCell>
                        {tableLeadColumnDefs.map((col) => (
                          <TableCell key={col.key}>{col.render(lead)}</TableCell>
                        ))}

                        <TableCell>
                          <div className="flex flex-col gap-2">
                            <Select
                              onValueChange={(teleId) => handleAssign(lead._id, teleId)}
                              disabled={assigning}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Assign to…" />
                              </SelectTrigger>
                              <SelectContent>
                                {(telecallers ?? []).map((t: Telecaller) => (
                                  <SelectItem key={t._id} value={t._id}>
                                    {t.name || t.mobile}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <LeadDetailsModal lead={lead} triggerLabel="View More" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={tableLeadColumnDefs.length + 2}
                        className="text-center text-sm text-muted-foreground"
                      >
                        No leads match your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        if (page > 1) setPage(page - 1);
                      }}
                    />
                  </PaginationItem>
                  {pageItems.map((p, idx) => (
                    <PaginationItem key={`${p}-${idx}`}>
                      {p === "ellipsis" ? (
                        <PaginationEllipsis />
                      ) : (
                        <PaginationLink
                          href="#"
                          isActive={page === p}
                          onClick={(e) => {
                            e.preventDefault();
                            setPage(p);
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
                      className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        if (page < totalPages) setPage(page + 1);
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
