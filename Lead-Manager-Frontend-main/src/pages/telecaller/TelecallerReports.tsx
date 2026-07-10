'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  useGetMyReportQuery,
  useGetMyRemindersQuery,
} from '@/redux/slice/teleCaller/telecallerApiSlice';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Calendar, RefreshCcw } from 'lucide-react';

/* ---------------- Date helpers (local-safe) ---------------- */
const toYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const startOfWeek = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay(); // 0..6 (Sun..Sat)
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfWeek = (date = new Date()) => {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
};

const startOfMonth = (date = new Date()) => {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfMonth = (date = new Date()) => {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
};

const startOfQuarter = (date = new Date()) => {
  const q = Math.floor(date.getMonth() / 3) * 3;
  const d = new Date(date.getFullYear(), q, 1);
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfQuarter = (date = new Date()) => {
  const q = Math.floor(date.getMonth() / 3) * 3;
  const d = new Date(date.getFullYear(), q + 3, 0);
  d.setHours(23, 59, 59, 999);
  return d;
};

/** prior range of equal length (inclusive) */
const getPrevRange = (fromStr: string, toStr: string) => {
  const from = new Date(fromStr + 'T00:00:00');
  const to = new Date(toStr + 'T00:00:00');
  const days = Math.max(0, Math.round((+to - +from) / 86400000)) + 1;
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { prevFrom: toYMD(prevFrom), prevTo: toYMD(prevTo) };
};

/* ---------------- UI helpers ---------------- */
const fmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString('en-IN') : '0');
const pct = (n: number) => `${Math.abs(Math.round(n))}%`;

type Period = 'week' | 'month' | 'quarter' | 'custom';

export default function TelecallerReports() {
  const { toast } = useToast();

  /* --------- Period state --------- */
  const [period, setPeriod] = useState<Period>('week');
  const [from, setFrom] = useState(toYMD(startOfWeek()));
  const [to, setTo] = useState(toYMD(endOfWeek()));

  useEffect(() => {
    if (period === 'custom') return;
    const now = new Date();
    if (period === 'week') {
      setFrom(toYMD(startOfWeek(now)));
      setTo(toYMD(endOfWeek(now)));
    } else if (period === 'month') {
      setFrom(toYMD(startOfMonth(now)));
      setTo(toYMD(endOfMonth(now)));
    } else if (period === 'quarter') {
      setFrom(toYMD(startOfQuarter(now)));
      setTo(toYMD(endOfQuarter(now)));
    }
  }, [period]);

  const { prevFrom, prevTo } = useMemo(() => getPrevRange(from, to), [from, to]);

  /* --------- Data fetch (current + previous) --------- */
  const {
    data: report,
    isLoading: reportLoading,
    isError: reportErr,
    error: reportErrObj,
    refetch: refetchReport,
  } = useGetMyReportQuery({ from, to });

  const {
    data: reportPrev,
  } = useGetMyReportQuery({ from: prevFrom, to: prevTo });

  /* --------- Reminders (with timezone) --------- */
  const [tz, setTz] = useState<string>('Asia/Kolkata');
  const {
    data: reminders,
    isLoading: remLoading,
    isError: remErr,
    error: remErrObj,
    refetch: refetchReminders,
  } = useGetMyRemindersQuery({ tz });

  useEffect(() => {
    if (reportErr) {
      toast({
        title: 'Failed to load report',
        description: (reportErrObj as any)?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
    if (remErr) {
      toast({
        title: 'Failed to load reminders',
        description: (remErrObj as any)?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [reportErr, remErr]);

  /* --------- Derived --------- */
  const sumTotal = useMemo(() => {
    if (!report) return 0;
    return (report.initialize || 0) + (report.followup || 0) + (report.success || 0) + (report.failed || 0);
  }, [report]);

  const sumPrev = useMemo(() => {
    if (!reportPrev) return 0;
    return (reportPrev.initialize || 0) + (reportPrev.followup || 0) + (reportPrev.success || 0) + (reportPrev.failed || 0);
  }, [reportPrev]);

  const successRate = useMemo(() => {
    if (!report) return 0;
    const total = sumTotal || 0;
    return total > 0 ? Math.round(((report.success || 0) * 100) / total) : 0;
  }, [report, sumTotal]);

  const successRatePrev = useMemo(() => {
    if (!reportPrev) return 0;
    const total = sumPrev || 0;
    return total > 0 ? Math.round(((reportPrev.success || 0) * 100) / total) : 0;
  }, [reportPrev, sumPrev]);

  const delta = (curr: number, prev: number) => {
    if (!prev) return curr ? 100 : 0;
    return ((curr - prev) / prev) * 100;
  };

  const chartData = useMemo(
    () => [
      { name: 'Initialize', value: report?.initialize || 0 },
      { name: 'Follow-up', value: report?.followup || 0 },
      { name: 'Success', value: report?.success || 0 },
      { name: 'Failed', value: report?.failed || 0 },
    ],
    [report]
  );

  /* --------- UI --------- */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">My Reports</h2>
            <p className="text-muted-foreground">Track your performance and activity</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={(v: Period) => setPeriod(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            <div className="hidden md:flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={period !== 'custom'}
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={period !== 'custom'}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchReport();
              }}
              title="Refresh report"
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Leads in Range"
            value={fmt(sumTotal)}
            sub={`${from} → ${to}`}
            delta={delta(sumTotal, sumPrev)}
            loading={reportLoading}
          />
          <KpiCard
            title="Success Rate"
            value={`${successRate}%`}
            delta={delta(successRate, successRatePrev)}
            badge="success"
            loading={reportLoading}
          />
          <KpiCard
            title="Follow-ups"
            value={fmt(report?.followup || 0)}
            sub={
              remLoading
                ? 'Checking due today…'
                : `${fmt(reminders?.count || 0)} due today (${tz})`
            }
            badge="warning"
            loading={reportLoading}
          />
          <KpiCard
            title="Failed"
            value={fmt(report?.failed || 0)}
            delta={delta(report?.failed || 0, reportPrev?.failed || 0)}
            badge="destructive"
            loading={reportLoading}
          />
        </div>

        {/* Charts */}
        <Card className="overflow-hidden">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Lead Status Breakdown</CardTitle>
            <Badge variant="secondary">
              {from} → {to}
            </Badge>
          </CardHeader>
          <CardContent className="h-72">
            {reportLoading ? (
              <div className="h-full w-full bg-muted animate-pulse rounded" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} width={32} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Due Today */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Due Today</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={tz} onValueChange={setTz}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Kolkata">Asia/Kolkata</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="Asia/Dubai">Asia/Dubai</SelectItem>
                  <SelectItem value="Asia/Singapore">Asia/Singapore</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => refetchReminders()}>
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {remLoading ? (
              <div className="h-16 w-full bg-muted animate-pulse rounded" />
            ) : (reminders?.items?.length || 0) === 0 ? (
              <div className="text-sm text-muted-foreground py-4">No follow-ups due today.</div>
            ) : (
              <div className="space-y-3">
                {reminders!.items.map((lead) => (
                  <div
                    key={lead._id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <div className="font-medium">{lead.name || '—'}</div>
                      <div className="text-sm text-muted-foreground">
                        {lead.phone || '-'} {lead.email ? `• ${lead.email}` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Follow-up at</div>
                      <div className="font-semibold">
                        {lead.followUpDate ? new Date(lead.followUpDate).toLocaleString() : '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

/* ---------------- Small components ---------------- */
function KpiCard({
  title,
  value,
  sub,
  badge,
  loading,
  delta, // +/- %
}: {
  title: string;
  value: string | number;
  sub?: string;
  badge?: 'success' | 'warning' | 'destructive';
  loading?: boolean;
  delta?: number;
}) {
  const up = typeof delta === 'number' && delta >= 0;
  const showDelta = typeof delta === 'number';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-24 bg-muted animate-pulse rounded" />
        ) : (
          <div className="text-3xl font-bold">{value}</div>
        )}

        {sub && !loading && (
          <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
        )}

        <div className="mt-2 flex items-center gap-2">
          {badge === 'success' && (
            <Badge className="bg-emerald-600 hover:bg-emerald-600/90">Good</Badge>
          )}
          {badge === 'warning' && (
            <Badge className="bg-amber-600 hover:bg-amber-600/90">Attention</Badge>
          )}
          {badge === 'destructive' && <Badge variant="destructive">High</Badge>}

          {showDelta && !loading && (
            <span
              className={`ml-auto text-xs font-medium ${
                up ? 'text-emerald-600' : 'text-red-600'
              }`}
              title="vs previous period"
            >
              {up ? '▲' : '▼'} {pct(delta!)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
