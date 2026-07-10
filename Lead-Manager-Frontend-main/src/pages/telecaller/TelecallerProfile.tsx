// src/pages/admin/Telecallers.tsx
import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, ShieldX, ShieldCheck, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useAddTelecallerMutation,
  useGetTelecallersQuery,
  useGetTelecallerReportsQuery,
  useUpdateTelecallerBlockMutation,
} from "@/redux/slice/admin/adminApiSlice";
import { useMeQuery } from "@/redux/slice/auth/authApiSlice";

type DetailState = {
  open: boolean;
  id: string | null;
};

export default function Telecallers() {
  const { toast } = useToast();

  // Dialog (Add)
  const [openAdd, setOpenAdd] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");

  // Detail modal
  const [detail, setDetail] = useState<DetailState>({ open: false, id: null });

  // ---- Current user (admin or telecaller) ----
  const { data: me, isLoading: loadingMe } = useMeQuery();

  const roleRaw = me?.role;
  const isAdmin =
    roleRaw === 2 || String(roleRaw).toLowerCase() === "admin";
  const isTelecaller =
    roleRaw === 1 || String(roleRaw).toLowerCase() === "telecaller";

  const roleLabel = isAdmin
    ? "Admin"
    : isTelecaller
    ? "Telecaller"
    : String(roleRaw ?? "-");

  // ---- Queries (admin only) ----
  const {
    data: telecallers,
    isLoading: loadingList,
    isError: listError,
    error: listErrObj,
    refetch: refetchTele,
  } = useGetTelecallersQuery(undefined, {
    skip: !isAdmin, // ✅ telecaller ke liye API hit nahi hogi, 403 avoid
  });

  const { data: report, isLoading: loadingRpt } = useGetTelecallerReportsQuery(
    undefined,
    { skip: !isAdmin } // ✅ reports bhi sirf admin ke liye
  );

  // Mutations (admin only use karega UI se)
  const [addTelecaller, { isLoading: adding }] = useAddTelecallerMutation();
  const [updateBlock, { isLoading: blocking }] =
    useUpdateTelecallerBlockMutation();

  // id -> stats
  const statsById = useMemo(() => {
    const map = new Map<
      string,
      { totalLeads: number; success: number; dueToday: number }
    >();
    report?.telecallers?.forEach((r: any) =>
      map.set(String(r.telecallerId), {
        totalLeads: r.totalLeads ?? 0,
        success: r.success ?? 0,
        dueToday: r.dueToday ?? 0,
      })
    );
    return map;
  }, [report]);

  const phoneValid = /^\d{10}$/.test(mobile);

  // ---- Logout (admin / telecaller dono ke liye) ----
  const handleLogout = () => {
    // safest: dono tokens clear
    localStorage.removeItem("adminToken");
    localStorage.removeItem("teleCallerToken");
    // apne project ka login route lagao ("/" ya "/login")
    window.location.href = "/"; 
  };

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!phoneValid) {
      toast({
        title: "Invalid mobile",
        description: "Please enter a valid 10-digit mobile number.",
        variant: "destructive",
      });
      return;
    }
    try {
      await addTelecaller({
        name: name.trim() || undefined,
        mobile,
      }).unwrap();
      toast({
        title: "Telecaller added",
        description: `${name || mobile} created successfully.`,
      });
      setOpenAdd(false);
      setName("");
      setMobile("");
      refetchTele();
    } catch (err: any) {
      toast({
        title: "Failed to add telecaller",
        description:
          err?.data?.message || err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const openDetail = (id: string) => setDetail({ open: true, id });
  const closeDetail = () => setDetail({ open: false, id: null });

  const onToggleBlock = async (id: string, blocked: boolean) => {
    try {
      await updateBlock({
        id,
        blocked: !blocked,
        reason: !blocked ? "Blocked by admin" : undefined,
      }).unwrap();
      toast({
        title: !blocked ? "User blocked" : "User unblocked",
        description: !blocked
          ? "This telecaller can no longer log in."
          : "This telecaller can now log in.",
      });
      refetchTele();
    } catch (err: any) {
      toast({
        title: "Failed",
        description:
          err?.data?.message ||
          err?.message ||
          "Unable to update status",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ---- Top: current user profile + logout (telecaller focus) ---- */}
        <Card className="max-w-xl">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">
                {loadingMe ? "Loading profile..." : "Your Profile"}
              </CardTitle>
              {!loadingMe && me && (
                <p className="text-sm text-muted-foreground">
                  Logged in as <span className="font-medium">{roleLabel}</span>
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="gap-2"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </CardHeader>
          {!loadingMe && me && (
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Name</div>
                <div className="font-medium">{me.name || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Mobile</div>
                <div className="font-medium">{me.mobile}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Role</div>
                <div className="font-medium">{roleLabel}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Joined</div>
                <div className="font-medium">
                  {me.createdAt
                    ? new Date(me.createdAt).toLocaleDateString()
                    : "—"}
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* ---- Admin UI only ---- */}
        {isAdmin && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">
                  Telecallers
                </h2>
                <p className="text-muted-foreground">
                  Manage your telecaller team
                </p>
                {listError && (
                  <div className="mt-2 text-sm text-destructive">
                    {(listErrObj as any)?.data?.message ||
                      "Failed to load telecallers"}{" "}
                    —{" "}
                    <button
                      className="underline"
                      onClick={() => refetchTele()}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>

              {/* Add */}
              <Dialog open={openAdd} onOpenChange={setOpenAdd}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Telecaller
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Telecaller</DialogTitle>
                    <DialogDescription>
                      Enter the details of the new telecaller
                    </DialogDescription>
                  </DialogHeader>

                  <form
                    onSubmit={handleSubmit}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        id="name"
                        placeholder="John Doe"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="mobile">Mobile (10 digits)</Label>
                      <Input
                        id="mobile"
                        inputMode="numeric"
                        placeholder="9876543210"
                        value={mobile}
                        onChange={(e) =>
                          setMobile(
                            e.target.value
                              .replace(/\D/g, "")
                              .slice(0, 10)
                          )
                        }
                        required
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={!phoneValid || adding}
                    >
                      {adding ? "Adding..." : "Add Telecaller"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Table */}
            <Card>
              <CardHeader>
                <CardTitle>All Telecallers</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Leads Assigned</TableHead>
                      <TableHead>Leads Converted</TableHead>
                      <TableHead>Conversion Rate</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingList ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                          </TableCell>
                          <TableCell>
                            <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                          </TableCell>
                          <TableCell>
                            <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                          </TableCell>
                          <TableCell>
                            <div className="h-4 w-12 bg-muted animate-pulse rounded" />
                          </TableCell>
                          <TableCell>
                            <div className="h-4 w-12 bg-muted animate-pulse rounded" />
                          </TableCell>
                          <TableCell>
                            <div className="h-4 w-10 bg-muted animate-pulse rounded" />
                          </TableCell>
                          <TableCell>
                            <div className="h-8 w-40 bg-muted animate-pulse rounded" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : telecallers && telecallers.length > 0 ? (
                      telecallers.map((t: any) => {
                        const stat = statsById.get(String(t._id));
                        const assigned = stat?.totalLeads ?? 0;
                        const converted = stat?.success ?? 0;
                        const rate =
                          assigned > 0
                            ? Math.round((converted / assigned) * 100)
                            : 0;

                        return (
                          <TableRow key={t._id}>
                            <TableCell className="font-medium">
                              {t.name || "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                {t.mobile}
                              </div>
                            </TableCell>
                            <TableCell>
                              {t.blocked ? (
                                <Badge variant="destructive">Blocked</Badge>
                              ) : (
                                <Badge variant="secondary">Active</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {loadingRpt ? "…" : assigned}
                            </TableCell>
                            <TableCell>
                              {loadingRpt ? "…" : converted}
                            </TableCell>
                            <TableCell>
                              {loadingRpt ? (
                                "…"
                              ) : (
                                <span
                                  className={
                                    rate >= 50
                                      ? "font-medium text-green-600 dark:text-green-500"
                                      : "font-medium"
                                  }
                                >
                                  {rate}%
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openDetail(t._id)}
                              >
                                View Details
                              </Button>
                              <Button
                                variant={t.blocked ? "default" : "destructive"}
                                size="sm"
                                onClick={() =>
                                  onToggleBlock(t._id, !!t.blocked)
                                }
                                disabled={blocking}
                                className="gap-2"
                              >
                                {t.blocked ? (
                                  <>
                                    <ShieldCheck className="h-4 w-4" /> Unblock
                                  </>
                                ) : (
                                  <>
                                    <ShieldX className="h-4 w-4" /> Block
                                  </>
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center text-sm text-muted-foreground"
                        >
                          No telecallers found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {/* ---- Agar koi role resolve hi nahi hua / access nahi hai ---- */}
        {!loadingMe && !isAdmin && !isTelecaller && (
          <div className="text-sm text-destructive">
            You are not authorized to view this page.
          </div>
        )}
      </div>

      {/* 📄 Details Modal – sirf admin ke liye */}
      {isAdmin && (
        <Dialog
          open={detail.open}
          onOpenChange={(v) => (v ? null : closeDetail())}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Telecaller Details</DialogTitle>
              <DialogDescription>
                Profile &amp; performance summary
              </DialogDescription>
            </DialogHeader>

            {(() => {
              const t = telecallers?.find(
                (x: any) => x._id === detail.id
              );
              const s =
                statsById.get(String(detail.id || "")) || {
                  totalLeads: 0,
                  success: 0,
                  dueToday: 0,
                };
              const rate =
                s.totalLeads > 0
                  ? Math.round((s.success / s.totalLeads) * 100)
                  : 0;

              if (!t)
                return (
                  <div className="text-sm text-muted-foreground">
                    No data.
                  </div>
                );

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Name
                      </div>
                      <div className="font-medium">
                        {t.name || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Mobile
                      </div>
                      <div className="font-medium">{t.mobile}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Status
                      </div>
                      <div>
                        {t.blocked ? (
                          <Badge variant="destructive">
                            Blocked
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            Active
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Joined
                      </div>
                      <div className="font-medium">
                        {t.createdAt
                          ? new Date(
                              t.createdAt
                            ).toLocaleDateString()
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded border">
                      <div className="text-xs text-muted-foreground">
                        Assigned
                      </div>
                      <div className="text-xl font-semibold">
                        {s.totalLeads}
                      </div>
                    </div>
                    <div className="p-3 rounded border">
                      <div className="text-xs text-muted-foreground">
                        Converted
                      </div>
                      <div className="text-xl font-semibold">
                        {s.success}
                      </div>
                    </div>
                    <div className="p-3 rounded border">
                      <div className="text-xs text-muted-foreground">
                        Conversion
                      </div>
                      <div className="text-xl font-semibold">
                        {rate}%
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded border">
                    <div className="text-xs text-muted-foreground">
                      Due Today
                    </div>
                    <div className="text-xl font-semibold">
                      {s.dueToday}
                    </div>
                  </div>

                  {t.blocked && t.blockedReason && (
                    <div className="p-3 rounded border bg-destructive/5 text-sm">
                      <span className="font-medium">Reason: </span>
                      {t.blockedReason}
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={closeDetail}>
                      Close
                    </Button>
                    <Button
                      variant={t.blocked ? "default" : "destructive"}
                      onClick={() =>
                        onToggleBlock(t._id, !!t.blocked)
                      }
                      disabled={blocking}
                      className="gap-2"
                    >
                      {t.blocked ? (
                        <>
                          <ShieldCheck className="h-4 w-4" /> Unblock
                        </>
                      ) : (
                        <>
                          <ShieldX className="h-4 w-4" /> Block
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
