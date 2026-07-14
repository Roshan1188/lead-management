import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  ArrowRight,
  RefreshCcw,
  Database,
  Tag,
} from 'lucide-react';

import {
  useGetMyDashboardQuery,
  useGetMyRemindersQuery,
  useGetMyReportQuery,
} from '@/redux/slice/teleCaller/telecallerApiSlice';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';

/* ---------------- Status colors (chart + overview cards) ---------------- */
const STATUS_COLORS: Record<string, string> = {
  initialize: '#2563eb', // blue
  followup: '#eab308',   // yellow
  success: '#16a34a',    // green
  failed: '#e11d48',     // red
};
const CUSTOM_COLOR = '#7c3aed'; // violet for custom statuses

/* ---------------- Helpers ---------------- */
const fmtNum = (n?: number) => (typeof n === 'number' ? n.toLocaleString('en-IN') : '0');
const timeFromISO = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const phoneMask = (p?: string) => (p ? p.replace(/(\d{5})\d+(.*)?/, '$1******') : '—');

export default function TelecallerDashboard() {
  const navigate = useNavigate();

  // ---- API calls ----
  const { data: dash, isLoading: loadingDash, refetch: refetchDash } = useGetMyDashboardQuery();
  const { data: reminders, isLoading: loadingRem, refetch: refetchRem } = useGetMyRemindersQuery({
    tz: 'Asia/Kolkata',
  });
  const { data: rep, isLoading: loadingRep, refetch: refetchRep } = useGetMyReportQuery({});

  const conversion = useMemo(() => {
    const customTotal = (rep?.customStatusCounts || []).reduce((s, c) => s + c.count, 0);
    const total =
      (rep?.initialize || 0) +
      (rep?.followup || 0) +
      (rep?.success || 0) +
      (rep?.failed || 0) +
      customTotal;
    return total ? Math.round(((rep?.success || 0) * 100) / total) : 0;
  }, [rep]);

  const chartData = useMemo(
    () => [
      { name: 'Initialize', value: rep?.initialize || 0, color: STATUS_COLORS.initialize },
      { name: 'Follow-up', value: rep?.followup || 0, color: STATUS_COLORS.followup },
      { name: 'Success', value: rep?.success || 0, color: STATUS_COLORS.success },
      { name: 'Failed', value: rep?.failed || 0, color: STATUS_COLORS.failed },
      ...(rep?.customStatusCounts || []).map((s) => ({
        name: s.label,
        value: s.count,
        color: CUSTOM_COLOR,
      })),
    ],
    [rep]
  );

  // Color-wise status overview cards (all statuses, custom included)
  const statusOverview = useMemo(
    () => [
      {
        title: 'New / Initialize',
        value: dash?.initialize || 0,
        icon: Database,
        badgeClass: 'bg-blue-600 text-white',
      },
      {
        title: 'Follow Up',
        value: dash?.followup || 0,
        icon: Clock,
        badgeClass: 'bg-yellow-500 text-white',
      },
      {
        title: 'Successful',
        value: dash?.success || 0,
        icon: CheckCircle,
        badgeClass: 'bg-green-600 text-white',
      },
      {
        title: 'Failed',
        value: dash?.failed || 0,
        icon: XCircle,
        badgeClass: 'bg-rose-600 text-white',
      },
      ...(dash?.customStatusCounts || []).map((s) => ({
        title: s.label,
        value: s.count,
        icon: Tag,
        badgeClass: 'bg-violet-600 text-white',
      })),
    ],
    [dash]
  );

  const periodLabel =
    rep?.from && rep?.to
      ? `${new Date(rep.from).toLocaleDateString()} → ${new Date(rep.to).toLocaleDateString()}`
      : 'Last 7 days';

  const refreshAll = () => {
    refetchDash();
    refetchRem();
    refetchRep();
  };

  const stats = [
    {
      title: 'Assigned Leads',
      value: loadingDash ? '—' : fmtNum(dash?.total),
      icon: Users,
      color: 'text-primary',
      skel: loadingDash,
    },
    {
      title: 'Follow Ups Today',
      value: loadingRem ? '—' : fmtNum(reminders?.count),
      icon: Clock,
      color: 'text-warning',
      skel: loadingRem,
    },
    {
      title: 'Successful',
      value: loadingDash ? '—' : fmtNum(dash?.success),
      icon: CheckCircle,
      color: 'text-success',
      skel: loadingDash,
    },
    {
      title: 'Failed',
      value: loadingDash ? '—' : fmtNum(dash?.failed),
      icon: XCircle,
      color: 'text-destructive',
      skel: loadingDash,
    },
  ];

  const todayItems = reminders?.items?.slice(0, 6) || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Telecaller Dashboard</h2>
            <p className="text-muted-foreground">Your daily performance overview</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={refreshAll} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{s.title}</CardTitle>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </CardHeader>
              <CardContent>
                {s.skel ? (
                  <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                ) : (
                  <div className="text-2xl font-bold">{s.value}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Lead Status Overview — color-wise, all statuses (custom included) */}
        <div>
          <h3 className="text-xl font-semibold mb-4">Lead Status Overview</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statusOverview.map((card, idx) => (
              <Card key={idx}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${card.badgeClass}`}>
                      <card.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                      {loadingDash ? (
                        <div className="h-7 w-12 bg-muted animate-pulse rounded mt-1" />
                      ) : (
                        <p className="text-2xl font-bold">{fmtNum(card.value)}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Charts + Today list */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Performance ({periodLabel})
              </CardTitle>
              <div className="text-sm text-muted-foreground">
                Conversion: <span className="font-semibold">{conversion}%</span>
              </div>
            </CardHeader>
            <CardContent className="h-64">
              {loadingRep ? (
                <div className="h-full w-full bg-muted animate-pulse rounded" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} width={32} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Today&apos;s Follow-ups</CardTitle>
              <div className="text-xs text-muted-foreground">
                {loadingRem
                  ? 'Loading...'
                  : reminders?.count
                  ? `${reminders.count} due today`
                  : 'No follow-ups due today'}
              </div>
            </CardHeader>
            <CardContent>
              {loadingRem ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : todayItems.length ? (
                <div className="space-y-3">
                  {todayItems.map((lead: any) => (
                    <div
                      key={lead._id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{lead.name || '—'}</p>
                        <p className="text-sm text-muted-foreground">
                          {phoneMask(lead.phone)} {lead.email ? `· ${lead.email}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{timeFromISO(lead.followUpDate)}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {lead.status || '—'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Nothing due today 🎉</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <button
                onClick={() => navigate('/telecaller/leads')}
                className="p-6 border rounded-lg hover:bg-accent transition-colors text-left"
              >
                <Users className="h-8 w-8 mb-2 text-primary" />
                <h3 className="font-semibold mb-1">View All Leads</h3>
                <p className="text-sm text-muted-foreground">See all your assigned leads</p>
              </button>

              <button
                onClick={() => navigate('/telecaller/leads?filter=today')}
                className="p-6 border rounded-lg hover:bg-accent transition-colors text-left"
              >
                <Clock className="h-8 w-8 mb-2 text-warning" />
                <h3 className="font-semibold mb-1">Today&apos;s Follow-ups</h3>
                <p className="text-sm text-muted-foreground">Jump to reminders list</p>
              </button>

              <button
                onClick={refreshAll}
                className="p-6 border rounded-lg hover:bg-accent transition-colors text-left"
              >
                <TrendingUp className="h-8 w-8 mb-2 text-success" />
                <h3 className="font-semibold mb-1">Refresh Data</h3>
                <p className="text-sm text-muted-foreground">Sync latest stats & reminders</p>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
