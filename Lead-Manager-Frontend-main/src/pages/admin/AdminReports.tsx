'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useGetAdminSummaryQuery,
  useGetTelecallerReportsQuery,
  useGetTelecallerLeadsQuery,
  useGetTelecallersQuery,
  useGetLeadsTableQuery,
  useLazyGetLeadWithHistoryQuery,
  type AdminSummaryReport,
} from '@/redux/slice/admin/adminApiSlice';

import {
  BarChart3,
  Calendar,
  Download,
  Filter,
  LineChart as LineIcon,
  PieChart,
  RefreshCcw,
  Search,
  Users,
} from 'lucide-react';

// Recharts
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
} from 'recharts';

/* ---------------------- Helpers ---------------------- */
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const fmt = (n: number | undefined | null) =>
  typeof n === 'number' ? n.toLocaleString('en-IN') : '0';

type TeleSortKey =
  | 'totalLeads'
  | 'success'
  | 'followups'
  | 'dueToday'
  | 'overdue'
  | 'conversion'
  | 'name'
  | 'mobile'
  | 'initialize'
  | 'failed';

type SortDir = 'asc' | 'desc';
type LeadsStatus = 'initialize' | 'followup' | 'success' | 'failed';
type DueFilter = 'all' | 'overdue' | 'today' | 'upcoming';

/* ===================== Page ===================== */
export default function AdminReports() {
  const { toast } = useToast();

  // ---- Global filters ----
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [tz, setTz] = useState('Asia/Kolkata');
  const [upcomingDays, setUpcomingDays] = useState(7);

  // ---- Admin Summary ----
  const {
    data: summary,
    isLoading: sumLoading,
    isError: sumErr,
    error: sumErrObj,
    refetch: refetchSummary,
  } = useGetAdminSummaryQuery({ from, to, tz, upcomingDays, top: 5 });

  // ---- Telecaller performance (server-paginated + (optionally) server-sorted) ----
  const [telePage, setTelePage] = useState(1);
  const [teleLimit, setTeleLimit] = useState(10);
  const [teleSortKey, setTeleSortKey] = useState<TeleSortKey>('totalLeads');
  const [teleSortDir, setTeleSortDir] = useState<SortDir>('desc');
  const [teleSearch, setTeleSearch] = useState('');

  // Only these keys are supported by API sort param:
  const serverSortable = new Set<TeleSortKey>([
    'conversion',
    'success',
    'followups',
    'dueToday',
    'overdue',
    'totalLeads',
  ]);

  const teleApiArgs = useMemo(() => {
    return {
      from,
      to,
      tz,
      page: telePage,
      limit: teleLimit,
      sort: serverSortable.has(teleSortKey) ? (teleSortKey as any) : undefined,
      order: serverSortable.has(teleSortKey) ? teleSortDir : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, tz, telePage, teleLimit, teleSortKey, teleSortDir]);

  const {
    data: teleData,
    isLoading: teleLoading,
    isError: teleErr,
    error: teleErrObj,
    refetch: refetchTele,
  } = useGetTelecallerReportsQuery(teleApiArgs);

  const teleRowsPage = teleData?.telecallers ?? [];
  const teleRowsSearchedSorted = useMemo(() => {
    const term = teleSearch.trim().toLowerCase();
    const filtered = term
      ? teleRowsPage.filter(
          (r) =>
            (r.name || '').toLowerCase().includes(term) ||
            (r.mobile || '').toLowerCase().includes(term)
        )
      : teleRowsPage;

    if (!serverSortable.has(teleSortKey)) {
      const sorted = [...filtered].sort((a: any, b: any) => {
        const A = a[teleSortKey] ?? '';
        const B = b[teleSortKey] ?? '';
        if (typeof A === 'number' && typeof B === 'number') {
          return teleSortDir === 'asc' ? A - B : B - A;
        }
        const SA = String(A).toLowerCase();
        const SB = String(B).toLowerCase();
        return teleSortDir === 'asc' ? SA.localeCompare(SB) : SB.localeCompare(SA);
      });
      return sorted;
    }
    return filtered;
  }, [teleRowsPage, teleSearch, teleSortKey, teleSortDir, serverSortable]);

  const onTeleSort = (key: TeleSortKey) => {
    if (teleSortKey === key) setTeleSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setTeleSortKey(key);
      setTeleSortDir('desc');
    }
    setTelePage(1);
  };

  // ---- Telecaller dropdown data ----
  const { data: telecallersList } = useGetTelecallersQuery();

  // ---- Telecaller selection → Leads panel ----
  const [selectedTele, setSelectedTele] = useState<{ id: string; name?: string; mobile?: string } | null>(null);

  // leads filter state (shared)
  const [leadStatus, setLeadStatus] = useState<'all' | LeadsStatus>('all');
  const [leadDue, setLeadDue] = useState<DueFilter>('all');
  const [leadScope, setLeadScope] = useState<'assigned' | 'created'>('assigned');
  const [leadQ, setLeadQ] = useState('');
  const [leadPage, setLeadPage] = useState(1);
  const [leadLimit, setLeadLimit] = useState(10);
  const [leadSort, setLeadSort] = useState<'updatedAt' | 'followUpDate' | 'createdAt'>('updatedAt');
  const [leadOrder, setLeadOrder] = useState<SortDir>('desc');

  const teleLeadsEnabled = !!selectedTele?.id;

  // Telecaller-specific leads
  const teleLeadsArgs = teleLeadsEnabled
    ? {
        id: selectedTele!.id,
        tz,
        from,
        to,
        scope: leadScope,
        status: leadStatus === 'all' ? 'all' : leadStatus,
        due: leadDue,
        upcomingDays,
        q: leadQ || undefined,
        page: leadPage,
        limit: leadLimit,
        sort: leadSort,
        order: leadOrder,
      }
    : undefined;

  const {
    data: teleLeads,
    isLoading: teleLeadsLoading,
    isFetching: teleLeadsFetching,
    isError: teleLeadsErr,
    error: teleLeadsErrObj,
    refetch: refetchTeleLeads,
  } = useGetTelecallerLeadsQuery(teleLeadsArgs as any, { skip: !teleLeadsEnabled });

  // ALL telecallers leads (when no telecaller selected)
  const allLeadsArgs = !teleLeadsEnabled
    ? {
        from,
        to,
        status: leadStatus === 'all' ? undefined : leadStatus,
        assignedTo: undefined,
        q: leadQ || undefined,
        page: leadPage,
        limit: leadLimit,
      }
    : undefined;

  const {
    data: allLeads,
    isLoading: allLeadsLoading,
    isError: allLeadsErr,
    error: allLeadsErrObj,
    refetch: refetchAllLeads,
  } = useGetLeadsTableQuery(allLeadsArgs as any, { skip: !!teleLeadsEnabled });

  // ---- Lead detail drawer ----
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [fetchLeadHistory, leadHistoryResp] = useLazyGetLeadWithHistoryQuery();
  useEffect(() => {
    if (openLeadId) fetchLeadHistory(openLeadId);
  }, [openLeadId, fetchLeadHistory]);

  // ---- Export CSV (telecaller performance) ----
  const downloadCSV = () => {
    try {
      const rows = teleRowsSearchedSorted ?? [];
      const header = [
        'Name','Mobile','Total','Initialize','Follow-up','Success','Failed','Due Today','Overdue','Followups','Conversion(%)',
      ];
      const lines = [header.join(',')];
      rows.forEach((r) => {
        lines.push(
          [
            `"${(r.name || '').replace(/"/g, '""')}"`,
            `"${(r.mobile || '').replace(/"/g, '""')}"`,
            r.totalLeads ?? 0,
            r.initialize ?? 0,
            r.followup ?? 0,
            r.success ?? 0,
            r.failed ?? 0,
            r.dueToday ?? 0,
            r.overdue ?? 0,
            r.followups ?? 0,
            r.conversion ?? 0,
          ].join(',')
        );
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `telecaller_report_${from}_to_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({
        title: 'Export failed',
        description: e?.message || 'Unable to generate CSV.',
        variant: 'destructive',
      });
    }
  };

  // ---- Refresh ----
  const refreshAll = () => {
    refetchSummary();
    refetchTele();
    if (teleLeadsEnabled) refetchTeleLeads();
    else refetchAllLeads();
  };

  // ---- Error toasts ----
  useEffect(() => {
    if (sumErr) toast({ title: 'Failed to load summary', description: (sumErrObj as any)?.data?.message || 'Please try again.', variant: 'destructive' });
    if (teleErr) toast({ title: 'Failed to load telecaller report', description: (teleErrObj as any)?.data?.message || 'Please try again.', variant: 'destructive' });
    if (teleLeadsErr) toast({ title: 'Failed to load telecaller leads', description: (teleLeadsErrObj as any)?.data?.message || 'Please try again.', variant: 'destructive' });
    if (allLeadsErr) toast({ title: 'Failed to load leads', description: (allLeadsErrObj as any)?.data?.message || 'Please try again.', variant: 'destructive' });
  }, [sumErr, teleErr, teleLeadsErr, allLeadsErr, sumErrObj, teleErrObj, teleLeadsErrObj, allLeadsErrObj, toast]);

  /* ---------- Derived from summary ---------- */
  const byStatus = summary?.status ?? {};
  const bySource = summary?.bySource ?? [];
  const daily = summary?.daily ?? [];
  const totalLeadsInRange = summary?.totals?.totalInRange ?? 0;
  const successRate = summary?.totals?.successRate ?? 0;
  const dueBuckets = summary?.due ?? { today: 0, overdue: 0, upcoming: 0 };

  /* ---------- UI ---------- */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ---------- Header ---------- */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
            <p className="text-muted-foreground">
              Track telecaller performance and overall lead health at a glance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={refreshAll} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={downloadCSV} className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* ---------- Global Filters ---------- */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              Filters
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="hidden sm:flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setTelePage(1); setLeadPage(1); }} />
                <span className="text-muted-foreground">to</span>
                <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setTelePage(1); setLeadPage(1); }} />
                <Button
                  variant="outline"
                  onClick={() => {
                    setFrom(daysAgoISO(30));
                    setTo(todayISO());
                    setTelePage(1);
                    setLeadPage(1);
                  }}
                >
                  Last 30 days
                </Button>
              </div>

              {/* Timezone & UpcomingDays */}
              <Select value={tz} onValueChange={(v) => { setTz(v); setTelePage(1); setLeadPage(1); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Kolkata">Asia/Kolkata</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>

              <Select value={String(upcomingDays)} onValueChange={(v) => { setUpcomingDays(Number(v)); if (leadDue==='upcoming') setLeadPage(1); }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Upcoming window" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Upcoming: 3 days</SelectItem>
                  <SelectItem value="7">Upcoming: 7 days</SelectItem>
                  <SelectItem value="14">Upcoming: 14 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
        </Card>

        {/* ---------- KPIs (Summary) ---------- */}
        <div className="grid gap-4 md:grid-cols-5">
          <KpiCard
            title="Total (range)"
            value={fmt(totalLeadsInRange)}
            icon={<BarChart3 className="h-5 w-5" />}
            loading={sumLoading}
          />
          <KpiCard title="Initialize" value={fmt(byStatus['initialize'] || 0)} badge="info" loading={sumLoading} />
          <KpiCard title="Follow-up" value={fmt(byStatus['followup'] || 0)} badge="warning" loading={sumLoading} />
          <KpiCard title="Success (rate)" value={`${fmt(byStatus['success'] || 0)} (${successRate}%)`} badge="success" loading={sumLoading} />
          <KpiCard title="Due (Today/Over/Upc.)" value={`${fmt(dueBuckets.today)}/${fmt(dueBuckets.overdue)}/${fmt(dueBuckets.upcoming)}`} loading={sumLoading} />
        </div>

        {/* ---------- Charts (Summary) ---------- */}
        <div className="grid gap-4 xl:grid-cols-3">
          {/* Status Breakdown */}
          <Card className="overflow-hidden xl:col-span-1">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5 text-primary" />
                Status Breakdown
              </CardTitle>
              <Badge variant="secondary">
                {from} → {to}
              </Badge>
            </CardHeader>
            <CardContent className="h-64">
              <ChartStatus byStatus={summary?.status} loading={sumLoading} />
            </CardContent>
          </Card>

          {/* Leads by Source */}
          <Card className="overflow-hidden xl:col-span-1">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Leads by Source
              </CardTitle>
              <Badge variant="secondary">
                Top: {summary?.bySource?.[0]?.source ?? '—'} ({fmt(summary?.bySource?.[0]?.count ?? 0)})
              </Badge>
            </CardHeader>
            <CardContent className="h-64">
              <ChartSource bySource={summary?.bySource ?? []} loading={sumLoading} />
            </CardContent>
          </Card>

          {/* Daily Trend */}
          <Card className="overflow-hidden xl:col-span-1">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <LineIcon className="h-5 w-5 text-primary" />
                Daily Trend
              </CardTitle>
              <Badge variant="secondary">{fmt(totalLeadsInRange)} total</Badge>
            </CardHeader>
            <CardContent className="h-64">
              <ChartDaily daily={daily} loading={sumLoading} />
            </CardContent>
          </Card>
        </div>

        {/* ---------- Telecaller Performance (server-paginated) ---------- */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Telecaller Performance</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name or mobile…"
                  value={teleSearch}
                  onChange={(e) => setTeleSearch(e.target.value)}
                  className="pl-9 w-[240px]"
                />
              </div>
              <div className="text-xs text-muted-foreground hidden md:block">
                Window: {from} → {to}
              </div>
              <Select value={String(teleLimit)} onValueChange={(v) => { setTeleLimit(Number(v)); setTelePage(1); }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="20">20 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <Th label="Name" sortKey="name"  stateKey={teleSortKey} dir={teleSortDir} onSort={onTeleSort} />
                    <Th label="Mobile" sortKey="mobile" stateKey={teleSortKey} dir={teleSortDir} onSort={onTeleSort} />
                    <Th label="Total" sortKey="totalLeads" numeric stateKey={teleSortKey} dir={teleSortDir} onSort={onTeleSort} />
                    <Th label="Initialize" sortKey="initialize" numeric stateKey={teleSortKey} dir={teleSortDir} onSort={onTeleSort} />
                    <Th label="Follow-up" sortKey="followups" numeric stateKey={teleSortKey} dir={teleSortDir} onSort={onTeleSort} />
                    <Th label="Success" sortKey="success" numeric stateKey={teleSortKey} dir={teleSortDir} onSort={onTeleSort} />
                    <Th label="Failed" sortKey="failed" numeric stateKey={teleSortKey} dir={teleSortDir} onSort={onTeleSort} />
                    <Th label="Due Today" sortKey="dueToday" numeric stateKey={teleSortKey} dir={teleSortDir} onSort={onTeleSort} />
                    <Th label="Overdue" sortKey="overdue" numeric stateKey={teleSortKey} dir={teleSortDir} onSort={onTeleSort} />
                    <Th label="Conv %" sortKey="conversion" numeric stateKey={teleSortKey} dir={teleSortDir} onSort={onTeleSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teleLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 10 }).map((__, j) => (
                          <TableCell key={j}><div className="h-4 w-16 bg-muted animate-pulse rounded" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : teleRowsSearchedSorted.length > 0 ? (
                    teleRowsSearchedSorted.map((r) => (
                      <TableRow
                        key={r.telecallerId}
                        className="cursor-pointer hover:bg-muted/60"
                        onClick={() => {
                          setSelectedTele({ id: r.telecallerId, name: r.name, mobile: r.mobile });
                          setLeadPage(1);
                        }}
                      >
                        <TableCell className="font-medium">{r.name || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.mobile || '—'}</TableCell>
                        <TableCell className="text-right">{fmt(r.totalLeads)}</TableCell>
                        <TableCell className="text-right">{fmt(r.initialize)}</TableCell>
                        <TableCell className="text-right">{fmt(r.followups)}</TableCell>
                        <TableCell className="text-right"><span className="font-semibold">{fmt(r.success)}</span></TableCell>
                        <TableCell className="text-right">{fmt(r.failed)}</TableCell>
                        <TableCell className="text-right">
                          {r.dueToday ? <Badge variant="secondary">{fmt(r.dueToday)}</Badge> : <span className="text-muted-foreground">0</span>}
                        </TableCell>
                        <TableCell className="text-right">{fmt(r.overdue)}</TableCell>
                        <TableCell className="text-right">{fmt(r.conversion)}%</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-10">
                        No matching records.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Telecaller table pagination */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Page {teleData?.page ?? telePage} of {teleData?.pages ?? 1} — {fmt(teleData?.total ?? 0)} total
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={(teleData?.page ?? telePage) <= 1} onClick={() => setTelePage((p) => Math.max(1, p - 1))}>Prev</Button>
                <Button variant="outline" disabled={(teleData?.page ?? telePage) >= (teleData?.pages ?? 1)} onClick={() => setTelePage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ---------- Telecaller Leads (contextual) ---------- */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>
              {selectedTele ? `Leads: ${selectedTele.name ?? 'Telecaller'} (${selectedTele.mobile ?? '—'})` : 'Leads by Telecaller'}
            </CardTitle>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Telecaller selector */}
              <Select
                value={selectedTele?.id ?? 'all'}
                onValueChange={(val) => {
                  if (val === 'all') setSelectedTele(null);
                  else {
                    const t = telecallersList?.find((x) => x._id === val);
                    setSelectedTele(t ? { id: t._id, name: t.name, mobile: t.mobile } : { id: val });
                  }
                  setLeadPage(1);
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select telecaller" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Telecallers</SelectItem>
                  {(telecallersList ?? []).map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name || t.mobile || t._id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                placeholder="Search (name/email/phone/source)…"
                value={leadQ}
                onChange={(e) => { setLeadQ(e.target.value); setLeadPage(1); }}
                className="w-[260px]"
              />
              <Select value={leadStatus} onValueChange={(v: any) => { setLeadStatus(v); setLeadPage(1); }}>
                <SelectTrigger className="w-[150px]">
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
              <Select value={leadDue} onValueChange={(v: DueFilter) => { setLeadDue(v); setLeadPage(1); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Due filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                </SelectContent>
              </Select>
              {/* Scope only matters when a telecaller is selected */}
              <Select value={leadScope} onValueChange={(v: any) => { setLeadScope(v); setLeadPage(1); }} disabled={!teleLeadsEnabled}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                </SelectContent>
              </Select>
              <Select value={leadSort} onValueChange={(v: any) => { setLeadSort(v); setLeadPage(1); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updatedAt">Updated At</SelectItem>
                  <SelectItem value="followUpDate">Follow-up Date</SelectItem>
                  <SelectItem value="createdAt">Created At</SelectItem>
                </SelectContent>
              </Select>
              <Select value={leadOrder} onValueChange={(v: any) => { setLeadOrder(v); setLeadPage(1); }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Desc</SelectItem>
                  <SelectItem value="asc">Asc</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(leadLimit)} onValueChange={(v) => { setLeadLimit(Number(v)); setLeadPage(1); }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="20">20 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent>
            {/* --- ALL mode --- */}
            {!teleLeadsEnabled ? (
              <>
                {allLeadsLoading ? (
                  <div className="h-24 w-full bg-muted animate-pulse rounded" />
                ) : (
                  <>
                    <div className="rounded-lg border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead>Assignee</TableHead>
                            <TableHead>Last Note</TableHead>
                            <TableHead className="text-right">Updated</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(allLeads?.items ?? []).length > 0 ? (
                            allLeads!.items.map((row) => (
                              <TableRow
                                key={row._id}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => setOpenLeadId(row._id)}
                              >
                                <TableCell className="font-medium">{row.name || '—'}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {(row.phone || '—')}{row.email ? ` / ${row.email}` : ''}
                                </TableCell>
                                <TableCell><StatusPill status={row.status} /></TableCell>
                                <TableCell>{row.source || row.leadType || '—'}</TableCell>
                                <TableCell className="text-sm">
                                  {row.assignedName ? `${row.assignedName} (${row.assignedMobile ?? '—'})` : <span className="text-muted-foreground">Unassigned</span>}
                                </TableCell>
                                <TableCell className="truncate max-w-[260px]">{row.lastNote || <span className="text-muted-foreground">—</span>}</TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground">
                                  {new Date(row.updatedAt || row.createdAt!).toLocaleString('en-IN')}
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                                No leads found for the selected filters.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-muted-foreground">
                        Page {allLeads?.page ?? leadPage} of {allLeads?.pages ?? 1} — {fmt(allLeads?.total ?? 0)} total
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" disabled={(allLeads?.page ?? leadPage) <= 1} onClick={() => setLeadPage((p) => Math.max(1, p - 1))}>Prev</Button>
                        <Button variant="outline" disabled={(allLeads?.page ?? leadPage) >= (allLeads?.pages ?? 1)} onClick={() => setLeadPage((p) => p + 1)}>Next</Button>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : /* --- TELECALLER mode --- */ teleLeadsLoading && !teleLeadsFetching ? (
              <div className="h-24 w-full bg-muted animate-pulse rounded" />
            ) : teleLeads ? (
              <>
                {/* Summary mini-cards */}
                <div className="grid gap-4 md:grid-cols-4 mb-4">
                  <KpiCard title="Total" value={fmt(teleLeads.summary.total)} />
                  <KpiCard title="Initialize" value={fmt(teleLeads.summary.byStatus.initialize)} badge="info" />
                  <KpiCard title="Follow-up" value={fmt(teleLeads.summary.byStatus.followup)} badge="warning" />
                  <KpiCard title="Success" value={fmt(teleLeads.summary.byStatus.success)} badge="success" />
                  <KpiCard title="Failed" value={fmt(teleLeads.summary.byStatus.failed)} />
                  <KpiCard title="Overdue" value={fmt(teleLeads.summary.due.overdue)} />
                  <KpiCard title="Due Today" value={fmt(teleLeads.summary.due.today)} />
                  <KpiCard title={`Upcoming (${upcomingDays}d)`} value={fmt(teleLeads.summary.due.upcoming)} />
                </div>

                {/* Leads table */}
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Last Note</TableHead>
                        <TableHead className="text-right">Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(teleLeads.items ?? []).length > 0 ? (
                        teleLeads.items.map((row) => (
                          <TableRow
                            key={row._id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setOpenLeadId(row._id)}
                          >
                            <TableCell className="font-medium">{row.name || '—'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {(row.phone || '—')}{row.email ? ` / ${row.email}` : ''}
                            </TableCell>
                            <TableCell><StatusPill status={row.status} /></TableCell>
                            <TableCell>{row.source || row.leadType || '—'}</TableCell>
                            <TableCell className="truncate max-w-[260px]">{row.lastNote || <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {new Date(row.updatedAt || row.createdAt!).toLocaleString('en-IN')}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                            No leads found for the selected filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {teleLeads.page} of {teleLeads.pages} — {fmt(teleLeads.totalItems)} total
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={teleLeads.page <= 1} onClick={() => setLeadPage((p) => Math.max(1, p - 1))}>Prev</Button>
                    <Button variant="outline" disabled={teleLeads.page >= teleLeads.pages} onClick={() => setLeadPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground py-8">No data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- Lead details dialog ---------- */}
      <Dialog open={!!openLeadId} onOpenChange={(open) => !open && setOpenLeadId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Lead details</DialogTitle>
          </DialogHeader>
        {leadHistoryResp.isFetching ? (
            <div className="h-40 bg-muted animate-pulse rounded" />
          ) : leadHistoryResp.data ? (
            <LeadDetails data={leadHistoryResp.data} />
          ) : (
            <div className="text-sm text-muted-foreground">No data</div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

/* ===================== Small components ===================== */

function KpiCard({
  title,
  value,
  icon,
  badge,
  loading,
}: {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  badge?: 'success' | 'warning' | 'info';
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon ? <div className="text-primary">{icon}</div> : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-24 bg-muted animate-pulse rounded" />
        ) : (
          <div className="text-3xl font-bold">{value}</div>
        )}
        {badge ? (
          <div className="mt-2">
            {badge === 'success' && <Badge className="bg-emerald-600 hover:bg-emerald-600/90">Good</Badge>}
            {badge === 'warning' && <Badge className="bg-amber-600 hover:bg-amber-600/90">Attention</Badge>}
            {badge === 'info' && <Badge variant="secondary">Info</Badge>}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ----- Charts ----- */
function ChartStatus({
  byStatus,
  loading,
}: {
  byStatus?: AdminSummaryReport['status'];
  loading?: boolean;
}) {
  const data = useMemo(
    () => [
      { name: 'Initialize', value: byStatus?.initialize || 0 },
      { name: 'Follow-up', value: byStatus?.followup || 0 },
      { name: 'Success', value: byStatus?.success || 0 },
      { name: 'Failed', value: byStatus?.failed || 0 },
    ],
    [byStatus]
  );
  if (loading) return <div className="h-full w-full bg-muted animate-pulse rounded" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="name" tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} width={30} />
        <Tooltip />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartSource({
  bySource,
  loading,
}: {
  bySource: { source: string; count: number }[];
  loading?: boolean;
}) {
  const data = useMemo(
    () => (bySource || []).map((s) => ({ name: s.source || '—', value: s.count || 0 })),
    [bySource]
  );
  if (loading) return <div className="h-full w-full bg-muted animate-pulse rounded" />;
  if (data.length === 0) {
    return <div className="h-full grid place-items-center text-sm text-muted-foreground">No source data</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="name" tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} width={30} />
        <Tooltip />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartDaily({
  daily,
  loading,
}: {
  daily: { date: string; count: number }[];
  loading?: boolean;
}) {
  if (loading) return <div className="h-full w-full bg-muted animate-pulse rounded" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={daily}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} width={30} />
        <Tooltip />
        <Line type="monotone" dataKey="count" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ----- Table helpers ----- */
function Th({
  label,
  sortKey,
  stateKey,
  dir,
  onSort,
  numeric,
}: {
  label: string;
  sortKey: TeleSortKey;
  stateKey: TeleSortKey;
  dir: SortDir;
  onSort: (k: TeleSortKey) => void;
  numeric?: boolean;
}) {
  const active = stateKey === sortKey;
  return (
    <TableHead className={numeric ? 'text-right' : ''}>
      <button
        className={`inline-flex items-center gap-1 ${active ? 'font-semibold' : ''}`}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span className="text-xs text-muted-foreground">
          {active ? (dir === 'asc' ? '↑' : '↓') : ''}
        </span>
      </button>
    </TableHead>
  );
}

function StatusPill({ status }: { status?: string }) {
  const map: Record<string, string> = {
    initialize: 'bg-blue-600',
    followup: 'bg-amber-600',
    success: 'bg-emerald-600',
    failed: 'bg-rose-600',
  };
  const label = (status || '—').replace(/^\w/, (c) => c.toUpperCase());
  const cls = map[status || ''] || 'bg-muted-foreground';
  return <span className={`text-xs text-white px-2 py-0.5 rounded ${cls}`}>{label}</span>;
}

/* ----- Lead detail ----- */
function LeadDetails({ data }: { data: { lead: any; history: any[] } }) {
  const { lead, history } = data;
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Lead</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <div className="grid grid-cols-2 gap-y-2">
              <div className="text-muted-foreground">Name</div><div>{lead?.name || '—'}</div>
              <div className="text-muted-foreground">Phone</div><div>{lead?.phone || '—'}</div>
              <div className="text-muted-foreground">Email</div><div>{lead?.email || '—'}</div>
              <div className="text-muted-foreground">Status</div><div><StatusPill status={lead?.status} /></div>
              <div className="text-muted-foreground">Source</div><div>{lead?.source || lead?.leadType || '—'}</div>
              <div className="text-muted-foreground">Assignee</div><div>{lead?.assignedTo?.name || 'Unassigned'}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Important dates</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <div className="grid grid-cols-2 gap-y-2">
              <div className="text-muted-foreground">Created</div><div>{lead?.createdAt ? new Date(lead.createdAt).toLocaleString('en-IN') : '—'}</div>
              <div className="text-muted-foreground">Updated</div><div>{lead?.updatedAt ? new Date(lead.updatedAt).toLocaleString('en-IN') : '—'}</div>
              <div className="text-muted-foreground">Next Follow-up</div><div>{lead?.followUpDate ? new Date(lead.followUpDate).toLocaleString('en-IN') : '—'}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">History</CardTitle></CardHeader>
        <CardContent>
          {history?.length ? (
            <div className="space-y-3 max-h-[50vh] overflow-auto pr-1">
              {history.map((h, i) => (
                <div key={i} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div className="text-sm">
                    <div className="font-medium">{h.outcome || 'Update'}</div>
                    {h.note ? <div className="text-muted-foreground">{h.note}</div> : null}
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(h.createdAt).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No history</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
