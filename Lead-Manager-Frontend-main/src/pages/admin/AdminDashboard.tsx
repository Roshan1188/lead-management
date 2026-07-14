// src/pages/admin/AdminDashboard.tsx
import { useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Database,
  PhoneCall,
  TrendingUp,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Tag,
} from "lucide-react";
import { useGetDashboardQuery } from "@/redux/slice/admin/adminApiSlice";

// tiny skeleton
function LineSkeleton() {
  return <div className="h-4 w-24 rounded bg-muted animate-pulse" />;
}
function NumSkeleton() {
  return <div className="h-7 w-16 rounded bg-muted animate-pulse" />;
}

export default function AdminDashboard() {
  const { data, isLoading, isError, error, refetch } = useGetDashboardQuery();

  const totals = useMemo(() => {
    const initialize = data?.statusCounts?.initialize ?? 0;
    const followup = data?.statusCounts?.followup ?? 0;
    const success = data?.statusCounts?.success ?? 0;
    const failed = data?.statusCounts?.failed ?? 0;
    const customStatuses = data?.customStatusCounts ?? [];
    const customTotal = customStatuses.reduce((sum, s) => sum + s.count, 0);
    const totalLeads = initialize + followup + success + failed + customTotal;
    const successRate =
      totalLeads > 0 ? Math.round((success / totalLeads) * 100) : 0;

    return {
      initialize,
      followup,
      success,
      failed,
      customStatuses,
      totalLeads,
      totalTelecallers: data?.totalTelecallers ?? 0,
      successRate,
    };
  }, [data]);

  const stats = [
    {
      title: "Total Leads",
      value: isLoading ? <NumSkeleton /> : totals.totalLeads.toLocaleString(),
      sub: isLoading ? <LineSkeleton /> : "All leads in the system",
      icon: Database,
      color: "text-primary",
    },
    {
      title: "Active Telecallers",
      value: isLoading ? <NumSkeleton /> : totals.totalTelecallers.toLocaleString(),
      sub: isLoading ? <LineSkeleton /> : "Users with role = Telecaller",
      icon: PhoneCall,
      color: "text-green-600 dark:text-green-500",
    },
    {
      title: "Success Rate",
      value: isLoading ? <NumSkeleton /> : `${totals.successRate}%`,
      sub: isLoading ? <LineSkeleton /> : "Successful / Total",
      icon: TrendingUp,
      color: "text-green-600 dark:text-green-500",
    },
    {
      title: "Team",
      value: isLoading ? <NumSkeleton /> : (totals.totalTelecallers || 0).toString(),
      sub: isLoading ? <LineSkeleton /> : "Telecaller count",
      icon: Users,
      color: "text-amber-600 dark:text-amber-500",
    },
  ];

  const statusCards = [
    {
      title: "New / Initialize",
      value: isLoading ? "—" : totals.initialize.toString(),
      icon: Database,
      badgeClass: "bg-blue-600 text-white",
    },
    {
      title: "Follow Up",
      value: isLoading ? "—" : totals.followup.toString(),
      icon: Clock,
      badgeClass: "bg-yellow-500 text-white",
    },
    {
      title: "Successful",
      value: isLoading ? "—" : totals.success.toString(),
      icon: CheckCircle,
      badgeClass: "bg-green-600 text-white",
    },
    {
      title: "Failed",
      value: isLoading ? "—" : totals.failed.toString(),
      icon: XCircle,
      badgeClass: "bg-rose-600 text-white",
    },
    // Custom top-level statuses (e.g. Call Back, Waiting)
    ...totals.customStatuses.map((s) => ({
      title: s.label,
      value: isLoading ? "—" : s.count.toString(),
      icon: Tag,
      badgeClass: "bg-violet-600 text-white",
    })),
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
          <p className="text-muted-foreground">
            Overview of your lead management system
          </p>
          {isError && (
            <div className="mt-3 text-sm text-destructive">
              {(error as any)?.data?.message || "Failed to load dashboard"} —{" "}
              <button
                onClick={() => refetch()}
                className="underline underline-offset-4"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Top KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, idx) => (
            <Card key={idx}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Status Overview */}
        <div>
          <h3 className="text-xl font-semibold mb-4">Lead Status Overview</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statusCards.map((card, idx) => (
              <Card key={idx}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${card.badgeClass}`}>
                      <card.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {card.title}
                      </p>
                      <p className="text-2xl font-bold">{card.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Recent Activity (placeholder for now; can wire to /reports later) */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <LineSkeleton />
                <LineSkeleton />
                <LineSkeleton />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Hook this to your activity stream or reports API when ready.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
