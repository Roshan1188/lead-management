'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table as TableIcon,
  LayoutGrid,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  StickyNote,
  Clock4,
  CheckCircle2,
  XCircle,
  History,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLeadColumnPrefs } from '@/hooks/useLeadColumnPrefs';
import { getLeadColumnDefs } from '@/lib/leadColumns';

// RTK Query hooks & types
import {
  useGetMyLeadsQuery,
  useLazyGetMyLeadsQuery,
  useUpdateLeadStatusMutation,
  useGetMyLeadHistoryQuery,
  useLazyGetMyLeadHistoryQuery,
  useAddLeadNoteMutation,
  useGetStatusReasonsQuery,
  useGetCustomStatusesQuery,
  type Lead,
  type LeadStatus,
  type LeadTimelineEvent,
} from '@/redux/slice/teleCaller/telecallerApiSlice';

/* ---------------- Helpers ---------------- */
const toLocalDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');
const toLocalDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN') : '—';

const toISOFromDateTime = (date?: string, time?: string) => {
  if (!date) return undefined;
  const t = time && time.trim() !== '' ? time : '10:00';
  const dt = new Date(`${date}T${t}:00`);
  return dt.toISOString();
};

function useDebounce<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** relative-time like "2h ago" */
const timeAgo = (iso: string) => {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const s = Math.max(1, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.round(d / 7);
  return `${w}w ago`;
};

/** Today / Yesterday / MMM DD, YYYY */
const dayHeading = (iso: string) => {
  const dt = new Date(iso);
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const diffDays = Math.round((+a - +b) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

type ViewMode = 'table' | 'card';
type StatusFilter = string; // 'all' | LeadStatus | custom-status slug
type UpdatableStatus = string; // 'followup' | 'success' | 'failed' | custom-status slug
const QUICK_REASON_CUSTOM = '__custom__';

// 👇 leadType ko readable banane ke liye helper
const formatLeadType = (t?: Lead['leadType']) => {
  if (!t) return '—';
  switch (t) {
    case 'create':
      return 'Manual';
    case 'bulk':
      return 'Bulk Upload';
    case 'meta':
      return 'Meta (Ads)';
    default:
      return t;
  }
};

const getStatusLabelForLead = (lead: Lead, customStatusMap: Record<string, string> = {}) => {
  if (lead.status === 'failed') return lead.reason?.trim() || 'Failed';
  if (lead.status === 'followup') return 'Follow Up';
  if (lead.status === 'success') return 'Success';
  if (lead.status === 'initialize') return 'New';
  return customStatusMap[lead.status as string] || (lead.status as string) || 'New';
};

const getStatusBadgeClass = (status: string) => {
  if (status === 'failed') return 'bg-destructive text-destructive-foreground';
  if (status === 'followup') return 'bg-warning text-warning-foreground';
  if (status === 'success') return 'bg-success text-success-foreground';
  if (status === 'initialize') return 'bg-pending text-pending-foreground';
  return 'bg-secondary text-secondary-foreground'; // custom top-level status
};

const getActualMetaLeadDateIso = (lead: Lead) => {
  if (lead.metaLeadCreatedAt) return lead.metaLeadCreatedAt;
  if (lead.metaRaw?.created_time) return lead.metaRaw.created_time;
  return null;
};

const getLeadRecencyTs = (lead: Lead) =>
  new Date(
    getActualMetaLeadDateIso(lead) || lead.metaFetchedAt || lead.updatedAt || lead.createdAt || 0
  ).getTime();

const getLeadDate = (lead: Lead) =>
  toLocalDateTime(getActualMetaLeadDateIso(lead) || lead.createdAt || lead.metaFetchedAt);

const getLeadFetchedDate = (lead: Lead) => toLocalDateTime(lead.metaFetchedAt || lead.createdAt);

const getLeadFormName = (lead: Lead, nameMap: Record<string, string>) => {
  const directName =
    typeof lead.metaFormName === 'string' && lead.metaFormName.trim()
      ? lead.metaFormName.trim()
      : null;
  if (directName && directName !== lead.metaFormId) return directName;
  if (lead.metaFormId && nameMap[lead.metaFormId]) return nameMap[lead.metaFormId];
  if (lead.leadType === 'meta') return 'Unknown Form';
  return '—';
};

/* ============================== Component ============================== */

export default function Clients() {
  /* ---------- UI State ---------- */
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [formFilter, setFormFilter] = useState('all');
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q, 350);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  // Action modal
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState<UpdatableStatus>('followup');
  const [quickReason, setQuickReason] = useState<string>(QUICK_REASON_CUSTOM);
  const [actionReason, setActionReason] = useState('');
  const [actionDate, setActionDate] = useState(''); // YYYY-MM-DD
  const [actionTime, setActionTime] = useState(''); // HH:mm
  const [noteOnly, setNoteOnly] = useState(false);

  const { data: statusReasonsData } = useGetStatusReasonsQuery();
  const quickReasonOptions = useMemo(
    () => (statusReasonsData?.items ?? []).filter((o) => o.baseStatus === actionStatus),
    [statusReasonsData, actionStatus]
  );

  const { data: customStatusData } = useGetCustomStatusesQuery();
  const customStatuses = customStatusData?.items ?? [];
  const customStatusMap = useMemo(
    () => Object.fromEntries(customStatuses.map((s) => [s.slug, s.label])),
    [customStatuses]
  );

  // Details modal (+ timeline)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [noteInput, setNoteInput] = useState('');

  // Timeline UI controls
  type TimelineFilter = 'all' | 'note' | 'followup' | 'audit-status' | 'audit-assign';
  const [tlFilter, setTlFilter] = useState<TimelineFilter>('all');

  const { toast } = useToast();

  /* ---------- Data ---------- */
  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
    error,
  } = useGetMyLeadsQuery(
    {
      status: status === 'all' ? undefined : status,
      q: debouncedQ || undefined,
      metaFormId: formFilter === 'all' ? undefined : formFilter,
      page,
      limit,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    },
    { refetchOnMountOrArgChange: true }
  );

  const [triggerList] = useLazyGetMyLeadsQuery();
  const [updateStatus, { isLoading: isUpdating }] = useUpdateLeadStatusMutation();
  const [addNote, { isLoading: isAddingNote }] = useAddLeadNoteMutation();

  const {
    data: historyData,
    isLoading: historyLoading,
    isFetching: historyFetching,
    refetch: refetchHistory,
  } = useGetMyLeadHistoryQuery(selectedLead?._id ?? '', {
    skip: !detailsOpen || !selectedLead?._id,
  });

  const [triggerHistory] = useLazyGetMyLeadHistoryQuery();

  const items = useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => getLeadRecencyTs(b) - getLeadRecencyTs(a)),
    [data?.items]
  );
  const formOptions = data?.forms ?? [];
  const formNameById = useMemo(() => {
    const map: Record<string, string> = {};
    formOptions.forEach((f) => {
      const name = String(f?.name || '').trim();
      if (!f?.id) return;
      if (name && name !== f.id) {
        map[f.id] = name;
      }
    });
    return map;
  }, [formOptions]);
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const { visibleColumns } = useLeadColumnPrefs();
  const leadColumns = useMemo(() => getLeadColumnDefs(), []);
  const visibleLeadColumnDefs = useMemo(
    () => leadColumns.filter((c) => visibleColumns.includes(c.key)),
    [leadColumns, visibleColumns]
  );
  const tableLeadColumnDefs = useMemo(
    () => visibleLeadColumnDefs.slice(0, 4),
    [visibleLeadColumnDefs]
  );

  /* ---------- Handlers ---------- */
  const handleViewDetails = async (lead: Lead) => {
    setSelectedLead(lead);
    setDetailsOpen(true);
    setTlFilter('all');
    // best-effort immediate fetch
    triggerHistory(lead._id, true);
  };

  const openAction = (lead: Lead) => {
    setSelectedLead(lead);
    setNoteOnly(false);
    setActionStatus('followup');
    setQuickReason(QUICK_REASON_CUSTOM);
    setActionReason('');
    setActionDate('');
    setActionTime('');
    setActionOpen(true);
  };

  const handleActionStatusChange = (value: string) => {
    setActionStatus(value as UpdatableStatus);
    setQuickReason(QUICK_REASON_CUSTOM);
    setActionReason('');
  };

  const handleQuickReasonChange = (value: string) => {
    setQuickReason(value);
    setActionReason(value === QUICK_REASON_CUSTOM ? '' : value);
  };

  const handleSubmitAction = async () => {
    if (!selectedLead) return;

    // Note-only path
    if (noteOnly) {
      if (!actionReason.trim()) {
        toast({
          title: 'Add a note',
          description: 'Note cannot be empty.',
          variant: 'destructive',
        });
        return;
      }
      try {
        await addNote({ id: selectedLead._id, note: actionReason.trim() }).unwrap();
        await triggerList(
          {
            status: status === 'all' ? undefined : status,
            q: debouncedQ || undefined,
            metaFormId: formFilter === 'all' ? undefined : formFilter,
            page,
            limit,
          },
          true
        );
        if (detailsOpen) await refetchHistory();
        toast({ title: 'Note added', description: 'Your note has been saved to the timeline.' });
        setActionOpen(false);
        setSelectedLead(null);
        return;
      } catch (e: any) {
        toast({
          title: 'Failed to add note',
          description: e?.data?.message || e?.message || 'Please try again.',
          variant: 'destructive',
        });
        return;
      }
    }

    // Status update path
    if (actionStatus === 'followup' && !actionDate) {
      toast({
        title: 'Pick follow-up date',
        description: 'Please select a date for follow-up.',
        variant: 'destructive',
      });
      return;
    }

    if (actionStatus === 'failed' && !actionReason.trim()) {
      toast({
        title: 'Select reason',
        description: 'Please select a failed reason.',
        variant: 'destructive',
      });
      return;
    }

    const followUpISO = actionStatus === 'followup' ? toISOFromDateTime(actionDate, actionTime) : null;

    try {
      await updateStatus({
        id: selectedLead._id,
        status: actionStatus,
        reason: actionReason || undefined,
        followUpDate: followUpISO ?? undefined,
      }).unwrap();

      await triggerList(
        {
          status: status === 'all' ? undefined : status,
          q: debouncedQ || undefined,
          metaFormId: formFilter === 'all' ? undefined : formFilter,
          page,
          limit,
        },
        true
      );
      if (detailsOpen) await refetchHistory();

      toast({ title: 'Updated', description: `Lead status set to ${actionStatus}.` });
      setActionOpen(false);
      setSelectedLead(null);
    } catch (e: any) {
      toast({
        title: 'Update failed',
        description: e?.data?.message || e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  // When filters change, go back to page 1
  useEffect(() => {
    setPage(1);
  }, [status, formFilter, debouncedQ]);

  const headerRight = useMemo(
    () => (
      <div className="flex gap-2">
        <Button
          variant={viewMode === 'table' ? 'default' : 'outline'}
          size="icon"
          onClick={() => setViewMode('table')}
          title="Table view"
        >
          <TableIcon className="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === 'card' ? 'default' : 'outline'}
          size="icon"
          onClick={() => setViewMode('card')}
          title="Card view"
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
      </div>
    ),
    [viewMode]
  );

  /* ---------- UI ---------- */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Clients</h2>
            <p className="text-muted-foreground">Manage your assigned leads</p>
          </div>
          {headerRight}
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email or phone…"
              className="pl-10"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <Select value={status} onValueChange={(v: StatusFilter) => setStatus(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="initialize">New</SelectItem>
              <SelectItem value="followup">Follow Up</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              {customStatuses.map((s) => (
                <SelectItem key={s._id} value={s.slug}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={formFilter} onValueChange={setFormFilter}>
            <SelectTrigger className="w-[230px]">
              <SelectValue placeholder="Filter by form" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Forms</SelectItem>
              {formOptions.map((f, idx) => (
                <SelectItem key={f.id} value={f.id}>
                  {String(f.name || '').trim() && String(f.name || '').trim() !== f.id
                    ? String(f.name).trim()
                    : `Unknown Form ${idx + 1}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>

        {/* Date Range Filter */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-[150px]"
            />
          </div>
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
            >
              <X className="h-4 w-4 mr-1" /> Clear dates
            </Button>
          )}
        </div>

        {/* Error state */}
        {isError && (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-sm text-red-500">
                Failed to load leads. {(error as any)?.data?.message || (error as any)?.message || 'Try again.'}
              </div>
            </CardContent>
          </Card>
        )}

        {/* TABLE VIEW */}
        {viewMode === 'table' ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground mb-2">
                Table shows 4 fields. Use "View More" for full details.
              </p>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {tableLeadColumnDefs.map((col) => (
                        <TableHead key={col.key}>{col.label}</TableHead>
                      ))}
                      <TableHead>Lead Date</TableHead>
                      <TableHead>Fetched At</TableHead>
                      <TableHead>Form</TableHead>
                      <TableHead className="w-[220px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(isLoading || isFetching) &&
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
                            <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                          </TableCell>
                          <TableCell>
                            <div className="h-8 w-28 bg-muted animate-pulse rounded" />
                          </TableCell>
                        </TableRow>
                      ))}

                    {!isLoading && !isFetching && items.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={tableLeadColumnDefs.length + 4}
                          className="text-center text-sm text-muted-foreground py-10"
                        >
                          No leads found.
                        </TableCell>
                      </TableRow>
                    )}

                    {items.map((lead) => (
                      <TableRow key={lead._id}>
                        {tableLeadColumnDefs.map((col) => (
                          <TableCell key={col.key}>
                            {col.key === 'status' ? (
                              <Badge className={getStatusBadgeClass(lead.status)}>
                                {getStatusLabelForLead(lead, customStatusMap)}
                              </Badge>
                            ) : (
                              col.render(lead)
                            )}
                          </TableCell>
                        ))}
                        <TableCell>
                          <div className="text-sm">{getLeadDate(lead)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{getLeadFetchedDate(lead)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{getLeadFormName(lead, formNameById)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleViewDetails(lead)}>
                              <Eye className="h-4 w-4 mr-1" />
                              View More
                            </Button>
                            <Button size="sm" onClick={() => openAction(lead)}>
                              Action
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {pages} • {total} total
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pages}
                      onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    >
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* CARD VIEW */
          <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((lead) => (
              <Card key={lead._id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{lead.name || '—'}</CardTitle>
                      <p className="text-sm text-muted-foreground">{lead.source || 'No source'}</p>
                    </div>
                    <Badge className={getStatusBadgeClass(lead.status)}>{getStatusLabelForLead(lead, customStatusMap)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Email:</span> {lead.email || '—'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone:</span> {lead.phone || '—'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Interest:</span>{' '}
                      {lead.clientInterest || '—'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Lead Type:</span>{' '}
                      {formatLeadType(lead.leadType)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Follow-up:</span>{' '}
                      {toLocalDate(lead.followUpDate)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Lead Date:</span>{' '}
                      {getLeadDate(lead)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Fetched At:</span>{' '}
                      {getLeadFetchedDate(lead)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Form:</span>{' '}
                      {getLeadFormName(lead, formNameById)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => handleViewDetails(lead)}>
                      View More
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => openAction(lead)}>
                      Take Action
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {page} of {pages} • {total} total
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
          </div>
        )}

        {/* ---------- Action Modal ---------- */}
        <Dialog open={actionOpen} onOpenChange={setActionOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Lead</DialogTitle>
              <DialogDescription>
                {selectedLead ? `Action on ${selectedLead.name || 'Lead'}` : '—'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Note-only toggle */}
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4" />
                  <Label className="cursor-pointer">Note only (don’t change status)</Label>
                </div>
                <button
                  type="button"
                  aria-pressed={noteOnly}
                  onClick={() => setNoteOnly((v) => !v)}
                  className={`h-6 w-10 rounded-full transition-colors ${
                    noteOnly ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      noteOnly ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {!noteOnly && (
                <div className="space-y-2">
                  <Label>Update Status</Label>
                  <Select value={actionStatus} onValueChange={handleActionStatusChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="followup">Follow Up</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      {customStatuses.map((s) => (
                        <SelectItem key={s._id} value={s.slug}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!noteOnly && quickReasonOptions.length > 0 && (
                <div className="space-y-2">
                  <Label>Quick reason (optional)</Label>
                  <Select value={quickReason} onValueChange={handleQuickReasonChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a quick reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={QUICK_REASON_CUSTOM}>Custom (type below)</SelectItem>
                      {quickReasonOptions.map((opt) => (
                        <SelectItem key={opt._id} value={opt.label}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="reason">{noteOnly ? 'Note' : 'Reason / Notes'}</Label>
                <Textarea
                  id="reason"
                  placeholder={noteOnly ? 'Add a note…' : 'Add notes about this interaction…'}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                />
              </div>

              {!noteOnly && actionStatus === 'followup' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="followup-date">Follow-up Date</Label>
                    <Input
                      id="followup-date"
                      type="date"
                      value={actionDate}
                      onChange={(e) => setActionDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="followup-time">Follow-up Time</Label>
                    <Input
                      id="followup-time"
                      type="time"
                      value={actionTime}
                      onChange={(e) => setActionTime(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setActionOpen(false)}
                  disabled={isUpdating || isAddingNote}
                >
                  Cancel
                </Button>
                <Button onClick={handleSubmitAction} disabled={isUpdating || isAddingNote}>
                  {isUpdating || isAddingNote ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ---------- Details Modal (with Grouped Timeline) ---------- */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Lead Details & Activity</DialogTitle>
            </DialogHeader>

            {selectedLead && (
              <div className="grid lg:grid-cols-[1fr_1.25fr] gap-6">
                {/* Left: Summary + Quick note */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Name</Label>
                      <p className="font-medium">{selectedLead.name || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <div className="mt-1">
                        <Badge className={getStatusBadgeClass(selectedLead.status)}>
                          {getStatusLabelForLead(selectedLead, customStatusMap)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Email</Label>
                      <p className="font-medium">{selectedLead.email || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Phone</Label>
                      <p className="font-medium">{selectedLead.phone || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Source</Label>
                      <p className="font-medium">{selectedLead.source || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Lead Type</Label>
                      <p className="font-medium">{formatLeadType(selectedLead.leadType)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Client Interest</Label>
                      <p className="font-medium">{selectedLead.clientInterest || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Created</Label>
                      <p className="font-medium">{toLocalDate(selectedLead.createdAt)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Updated</Label>
                      <p className="font-medium">{toLocalDateTime(selectedLead.updatedAt)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Lead Date (Meta)</Label>
                      <p className="font-medium">{getLeadDate(selectedLead)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Meta Fetched</Label>
                      <p className="font-medium">
                        {toLocalDateTime(selectedLead.metaFetchedAt || selectedLead.createdAt)}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Form</Label>
                      <p className="font-medium">{getLeadFormName(selectedLead, formNameById)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Meta Lead ID</Label>
                      <p className="font-medium break-all">{selectedLead.metaLeadId || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Campaign ID</Label>
                      <p className="font-medium break-all">{selectedLead.metaCampaignId || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Adset ID</Label>
                      <p className="font-medium break-all">{selectedLead.metaAdsetId || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Ad ID</Label>
                      <p className="font-medium break-all">{selectedLead.metaAdId || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Reason</Label>
                      <p className="font-medium">{selectedLead.reason || '—'}</p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-muted-foreground">Scheduled Follow-up</Label>
                    <p className="font-medium">
                      {selectedLead.followUpDate ? toLocalDate(selectedLead.followUpDate) : '—'}
                    </p>
                  </div>

                  {/* Quick note box */}
                  <div className="rounded-lg border p-3 space-y-2">
                    <Label className="flex items-center gap-2">
                      <StickyNote className="h-4 w-4" /> Add a quick note
                    </Label>
                    <Textarea
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Write a note…"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!selectedLead || !noteInput.trim()) return;
                          try {
                            await addNote({ id: selectedLead._id, note: noteInput.trim() }).unwrap();
                            setNoteInput('');
                            await refetchHistory();
                            toast({ title: 'Note added', description: 'Saved to timeline.' });
                          } catch (e: any) {
                            toast({
                              title: 'Failed to add note',
                              description:
                                e?.data?.message || e?.message || 'Please try again.',
                              variant: 'destructive',
                            });
                          }
                        }}
                        disabled={isAddingNote || !noteInput.trim()}
                      >
                        {isAddingNote ? 'Saving…' : 'Add Note'}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Right: Timeline */}
                <div className="space-y-3">
                  {/* Filter & Refresh */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <TimelineChip active={tlFilter === 'all'} onClick={() => setTlFilter('all')}>
                        All
                      </TimelineChip>
                      <TimelineChip active={tlFilter === 'note'} onClick={() => setTlFilter('note')}>
                        <StickyNote className="h-3.5 w-3.5 mr-1" /> Notes
                      </TimelineChip>
                      <TimelineChip
                        active={tlFilter === 'followup'}
                        onClick={() => setTlFilter('followup')}
                      >
                        <Clock4 className="h-3.5 w-3.5 mr-1" /> Follow-ups
                      </TimelineChip>
                      <TimelineChip
                        active={tlFilter === 'audit-status'}
                        onClick={() => setTlFilter('audit-status')}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Status
                      </TimelineChip>
                      <TimelineChip
                        active={tlFilter === 'audit-assign'}
                        onClick={() => setTlFilter('audit-assign')}
                      >
                        <History className="h-3.5 w-3.5 mr-1" /> Assignment
                      </TimelineChip>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchHistory()}
                      disabled={historyLoading || historyFetching}
                    >
                      Refresh
                    </Button>
                  </div>

                  {/* Rail + grouped days */}
                  <div className="max-h-[420px] overflow-y-auto pr-1">
                    <div className="relative pl-5">
                      {/* vertical rail */}
                      <div className="absolute left-2 top-0 bottom-0 w-px bg-muted" />

                      {renderGroupedTimeline(historyData?.timeline || [], tlFilter)}
                      {(historyLoading || historyFetching) && (
                        <div className="space-y-2 mt-3">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="pl-3">
                              <div className="relative mb-2">
                                <div className="absolute -left-[22px] h-2.5 w-2.5 rounded-full bg-muted" />
                                <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                              </div>
                              <div className="rounded-md border p-3">
                                <div className="h-4 w-48 bg-muted animate-pulse rounded mb-2" />
                                <div className="h-3 w-64 bg-muted animate-pulse rounded" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {!historyLoading &&
                        !historyFetching &&
                        (historyData?.timeline?.length || 0) === 0 && (
                          <div className="text-sm text-muted-foreground">
                            No activity yet.
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

/* ============================== Timeline helpers/components ============================== */

function TimelineChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'
      }`}
    >
      {children}
    </button>
  );
}

function renderGroupedTimeline(
  all: LeadTimelineEvent[],
  filter: 'all' | 'note' | 'followup' | 'audit-status' | 'audit-assign'
) {
  const filtered = all.filter((ev) => {
    const kind = (ev as any).type || (ev as any).action ? (ev as any).type || 'audit' : 'note';
    if (filter === 'all') return true;
    if (filter === 'note') return kind === 'note';
    if (filter === 'followup') return kind === 'followup';
    if (filter === 'audit-status') {
      // status changes typically in audit with diff.status
      return (
        kind === 'audit' &&
        (ev as any).diff?.status &&
        (ev as any).diff.status.from !== (ev as any).diff.status.to
      );
    }
    if (filter === 'audit-assign') {
      // assignment changes often recorded with action like "change_assignment"
      return kind === 'audit' && String((ev as any).action || '').includes('assign');
    }
    return true;
  });

  // Group by day
  const groups: Record<string, LeadTimelineEvent[]> = {};
  filtered.forEach((ev) => {
    const key = dayHeading(ev.at);
    (groups[key] ||= []).push(ev);
  });

  // Sort by recency inside groups
  Object.values(groups).forEach((arr) =>
    arr.sort((a, b) => +new Date(b.at) - +new Date(a.at))
  );

  const keys = Object.keys(groups);
  if (keys.length === 0) return null;

  return (
    <div className="space-y-5">
      {keys.map((k) => (
        <div key={k} className="pl-3">
          {/* Day marker dot */}
          <div className="relative mb-2">
            <div className="absolute -left-[22px] h-2.5 w-2.5 rounded-full bg-primary" />
            <div className="text-xs font-semibold tracking-wide text-muted-foreground">{k}</div>
          </div>

          <div className="space-y-3">
            {groups[k].map((ev, idx) => (
              <TimelineCard key={`${k}-${idx}`} ev={ev} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineCard({ ev }: { ev: LeadTimelineEvent }) {
  const kind: 'note' | 'followup' | 'audit' = (ev as any).type ? ((ev as any).type as any) : 'audit';

  const who = ev.by?.name || ev.by?.mobile || '—';
  const whenAbs = new Date(ev.at).toLocaleString();
  const whenRel = timeAgo(ev.at);

  // header pill
  const Pill = ({
    className,
    children,
  }: {
    className?: string;
    children: React.ReactNode;
  }) => (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        className || ''
      }`}
    >
      {children}
    </span>
  );

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {kind === 'note' && (
            <Pill className="bg-amber-100 text-amber-800">
              <StickyNote className="h-3.5 w-3.5" /> Note
            </Pill>
          )}
          {kind === 'followup' && (
            <Pill className="bg-blue-100 text-blue-800">
              <Clock4 className="h-3.5 w-3.5" /> Follow-up
            </Pill>
          )}
          {kind === 'audit' && (
            <Pill className="bg-slate-100 text-slate-800">
              <History className="h-3.5 w-3.5" /> Audit
            </Pill>
          )}
          <span className="text-xs text-muted-foreground">By {who}</span>
        </div>
        <div className="text-xs text-muted-foreground" title={whenAbs}>
          {whenRel}
        </div>
      </div>

      {/* body */}
      <div className="mt-2 space-y-1.5 text-sm">
        {kind === 'note' && ev.note && <div>"{ev.note}"</div>}

        {kind === 'followup' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Status:</span>
              {ev.status === 'success' ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Success
                </span>
              ) : ev.status === 'failed' ? (
                <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                  <XCircle className="h-4 w-4" /> Failed
                </span>
              ) : (
                <span className="font-medium">Followup</span>
              )}
            </div>
            {ev.note && (
              <div>
                <span className="text-muted-foreground">Note:</span> {ev.note}
              </div>
            )}
            {ev.nextFollowDate && (
              <div>
                <span className="text-muted-foreground">Next follow-up:</span>{' '}
                {toLocalDate(ev.nextFollowDate)}
              </div>
            )}
          </>
        )}

        {kind === 'audit' && (
          <>
            {/* optional action label */}
            {ev.action && (
              <div>
                <span className="text-muted-foreground">Action:</span>{' '}
                <span className="font-medium capitalize">
                  {String(ev.action).replace(/_/g, ' ')}
                </span>
              </div>
            )}

            {/* compact diffs */}
            {ev.diff?.status && (
              <DiffRow
                label="Status"
                from={ev.diff.status.from}
                to={ev.diff.status.to}
              />
            )}
            {ev.diff?.reason && (
              <DiffRow
                label="Reason"
                from={ev.diff.reason.from}
                to={ev.diff.reason.to}
              />
            )}
            {ev.diff?.followUpDate && (
              <DiffRow
                label="Follow-up"
                from={
                  ev.diff.followUpDate.from
                    ? toLocalDate(ev.diff.followUpDate.from as any)
                    : '—'
                }
                to={
                  ev.diff.followUpDate.to
                    ? toLocalDate(ev.diff.followUpDate.to as any)
                    : '—'
                }
              />
            )}
            {(ev as any).diff?.clientInterest && (
              <DiffRow
                label="Interest"
                from={(ev as any).diff.clientInterest.from}
                to={(ev as any).diff.clientInterest.to}
              />
            )}

            {/* audit note if any */}
            {ev.note && (
              <div>
                <span className="text-muted-foreground">Note:</span> {ev.note}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DiffRow({ label, from, to }: { label: string; from: any; to: any }) {
  if (from === to) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-red-100 line-through opacity-80">
        {from ?? '—'}
      </span>
      <span className="text-muted-foreground">→</span>
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-emerald-100 font-medium">
        {to ?? '—'}
      </span>
    </div>
  );
}
