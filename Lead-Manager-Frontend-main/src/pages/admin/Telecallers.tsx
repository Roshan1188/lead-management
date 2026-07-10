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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Phone,
  ShieldX,
  ShieldCheck,
  LayoutGrid,
  List as ListIcon,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useAddTelecallerMutation,
  useGetTelecallersQuery,
  useGetTelecallerReportsQuery,
  useUpdateTelecallerBlockMutation,
} from "@/redux/slice/admin/adminApiSlice";

// ——— Types (narrowed for local usage) ———
type DetailState = { open: boolean; id: string | null };
type BlockState = { open: boolean; id: string | null; name?: string; blocked?: boolean };

export default function Telecallers() {
  const { toast } = useToast();

  // View mode + small filters
  const [view, setView] = useState<"table" | "cards">("table");
  const [q, setQ] = useState("");

  // Add dialog state
  const [openAdd, setOpenAdd] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");

  // Detail modal state
  const [detail, setDetail] = useState<DetailState>({ open: false, id: null });

  // Block modal state (confirm + reason)
  const [block, setBlock] = useState<BlockState>({ open: false, id: null });
  const [blockReason, setBlockReason] = useState("");

  // Queries
  const {
    data: telecallers,
    isLoading: loadingList,
    isError: listError,
    error: listErrObj,
    refetch: refetchTele,
  } = useGetTelecallersQuery();

  // Reports (7-day default on backend)
  const { data: report, isLoading: loadingRpt } = useGetTelecallerReportsQuery();

  // Mutations
  const [addTelecaller, { isLoading: adding }] = useAddTelecallerMutation();
  const [updateBlock, { isLoading: blocking }] = useUpdateTelecallerBlockMutation();

  // id -> stats (assigned / success / dueToday)
  const statsById = useMemo(() => {
    const map = new Map<string, { totalLeads: number; success: number; dueToday: number }>();
    report?.telecallers?.forEach((r) =>
      map.set(String(r.telecallerId), {
        totalLeads: r.totalLeads ?? 0,
        success: r.success ?? 0,
        dueToday: r.dueToday ?? 0,
      })
    );
    return map;
  }, [report]);

  // Derived aggregates for header (for nicer UX)
  const headerAgg = useMemo(() => {
    if (!telecallers || !report?.telecallers) {
      return { count: telecallers?.length ?? 0, assigned: 0, converted: 0, avgRate: 0 };
    }
    let assigned = 0;
    let converted = 0;
    report.telecallers.forEach((r) => {
      assigned += r.totalLeads ?? 0;
      converted += r.success ?? 0;
    });
    const avgRate = assigned > 0 ? Math.round((converted / assigned) * 100) : 0;
    return { count: telecallers.length, assigned, converted, avgRate };
  }, [telecallers, report]);

  // Filtered list
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!telecallers) return [];
    if (!term) return telecallers;
    return telecallers.filter(
      (t) =>
        (t.name || "").toLowerCase().includes(term) ||
        (t.mobile || "").toLowerCase().includes(term)
    );
  }, [telecallers, q]);

  const phoneValid = /^\d{10}$/.test(mobile);

  // —— Handlers ——
  const handleAdd: React.FormEventHandler<HTMLFormElement> = async (e) => {
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
      await addTelecaller({ name: name.trim() || undefined, mobile }).unwrap();
      toast({ title: "Telecaller added", description: `${name || mobile} created successfully.` });
      setOpenAdd(false);
      setName("");
      setMobile("");
      refetchTele();
    } catch (err: any) {
      toast({
        title: "Failed to add telecaller",
        description: err?.data?.message || err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const openDetail = (id: string) => setDetail({ open: true, id });
  const closeDetail = () => setDetail({ open: false, id: null });

  const openBlockModal = (id: string, name?: string, blocked?: boolean) => {
    setBlock({ open: true, id, name, blocked });
    setBlockReason(""); // reset on open
  };
  const closeBlockModal = () => setBlock({ open: false, id: null });

  const confirmBlockToggle = async () => {
    if (!block.id) return;
    // When blocking -> require reason (short)
    if (!block.blocked && blockReason.trim().length < 3) {
      toast({
        title: "Reason required",
        description: "Please enter a brief reason (min 3 chars).",
        variant: "destructive",
      });
      return;
    }
    try {
      await updateBlock({
        id: block.id,
        blocked: !block.blocked,
        reason: !block.blocked ? blockReason.trim() : undefined,
      }).unwrap();

      toast({
        title: !block.blocked ? "User blocked" : "User unblocked",
        description: !block.blocked
          ? "This telecaller can no longer log in."
          : "This telecaller can now log in.",
      });
      closeBlockModal();
      refetchTele();
    } catch (err: any) {
      toast({
        title: "Failed",
        description: err?.data?.message || err?.message || "Unable to update status",
        variant: "destructive",
      });
    }
  };

  // —— Small UI helpers ——
  const ratePct = (assigned: number, converted: number) =>
    assigned > 0 ? Math.round((converted / assigned) * 100) : 0;

  const StatChip = ({ value, label }: { value: number | string; label: string }) => (
    <div className="px-3 py-2 rounded-lg border bg-background">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ——— Page Header ——— */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Telecallers</h2>
            <p className="text-muted-foreground">
              Manage your telecaller team
              {listError && (
                <>
                  {" · "}
                  <span className="text-destructive">
                    {(listErrObj as any)?.data?.message || "Failed to load"}
                  </span>
                  {" "}
                  <button className="underline" onClick={() => refetchTele()}>
                    Retry
                  </button>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="inline-flex rounded-md border p-1">
              <Button
                type="button"
                variant={view === "table" ? "default" : "ghost"}
                size="sm"
                className="gap-2"
                onClick={() => setView("table")}
              >
                <ListIcon className="h-4 w-4" /> List
              </Button>
              <Button
                type="button"
                variant={view === "cards" ? "default" : "ghost"}
                size="sm"
                className="gap-2"
                onClick={() => setView("cards")}
              >
                <LayoutGrid className="h-4 w-4" /> Cards
              </Button>
            </div>

            {/* Add telecaller */}
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
                  <DialogDescription>Enter the details of the new telecaller</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleAdd} className="space-y-4">
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
                        setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))
                      }
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={!phoneValid || adding}>
                    {adding ? "Adding..." : "Add Telecaller"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* ——— Toolbar / Search + small summary ——— */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="relative w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or mobile…"
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatChip value={headerAgg.count} label="Telecallers" />
            <StatChip value={loadingRpt ? "…" : headerAgg.assigned} label="Leads Assigned (7d)" />
            <StatChip value={loadingRpt ? "…" : headerAgg.converted} label="Leads Converted (7d)" />
            <StatChip value={loadingRpt ? "…" : `${headerAgg.avgRate}%`} label="Avg Conversion (7d)" />
          </div>
        </div>

        {/* ——— List / Cards ——— */}
        {view === "table" ? (
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
                    <TableHead className="text-right">Leads Assigned</TableHead>
                    <TableHead className="text-right">Leads Converted</TableHead>
                    <TableHead className="text-right">Conversion Rate</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingList ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                        <TableCell><div className="h-4 w-28 bg-muted animate-pulse rounded" /></TableCell>
                        <TableCell><div className="h-5 w-16 bg-muted animate-pulse rounded" /></TableCell>
                        <TableCell className="text-right"><div className="h-4 w-10 ml-auto bg-muted animate-pulse rounded" /></TableCell>
                        <TableCell className="text-right"><div className="h-4 w-10 ml-auto bg-muted animate-pulse rounded" /></TableCell>
                        <TableCell className="text-right"><div className="h-4 w-12 ml-auto bg-muted animate-pulse rounded" /></TableCell>
                        <TableCell className="text-right"><div className="h-8 w-40 ml-auto bg-muted animate-pulse rounded" /></TableCell>
                      </TableRow>
                    ))
                  ) : filtered.length ? (
                    filtered.map((t) => {
                      const s = statsById.get(String(t._id)) || { totalLeads: 0, success: 0, dueToday: 0 };
                      const rate = ratePct(s.totalLeads, s.success);

                      return (
                        <TableRow key={t._id}>
                          <TableCell className="font-medium">{t.name || "—"}</TableCell>
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
                          <TableCell className="text-right">{loadingRpt ? "…" : s.totalLeads}</TableCell>
                          <TableCell className="text-right">{loadingRpt ? "…" : s.success}</TableCell>
                          <TableCell className="text-right">
                            {loadingRpt ? "…" : (
                              <span className={rate >= 50 ? "font-semibold text-green-600 dark:text-green-500" : "font-medium"}>
                                {rate}%
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button variant="outline" size="sm" onClick={() => openDetail(t._id)}>
                              View Details
                            </Button>
                            <Button
                              variant={t.blocked ? "default" : "destructive"}
                              size="sm"
                              onClick={() => openBlockModal(t._id, t.name, !!t.blocked)}
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
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                        No telecallers found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          // ——— Cards view ———
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(loadingList ? Array.from({ length: 8 }) : filtered).map((item, idx) => {
              if (loadingList) {
                return (
                  <Card key={idx} className="border">
                    <CardContent className="p-5 space-y-4">
                      <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="h-14 bg-muted animate-pulse rounded" />
                        <div className="h-14 bg-muted animate-pulse rounded" />
                        <div className="h-14 bg-muted animate-pulse rounded" />
                      </div>
                      <div className="flex gap-2">
                        <div className="h-9 w-28 bg-muted animate-pulse rounded" />
                        <div className="h-9 w-28 bg-muted animate-pulse rounded" />
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              const t = item as any;
              const s = statsById.get(String(t._id)) || { totalLeads: 0, success: 0, dueToday: 0 };
              const rate = ratePct(s.totalLeads, s.success);

              return (
                <Card key={t._id} className="border">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-semibold">{t.name || "—"}</div>
                      {t.blocked ? (
                        <Badge variant="destructive">Blocked</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {t.mobile}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <StatChip value={loadingRpt ? "…" : s.totalLeads} label="Leads Assigned" />
                      <StatChip value={loadingRpt ? "…" : s.success} label="Leads Converted" />
                      <StatChip
                        value={loadingRpt ? "…" : `${rate}%`}
                        label="Conversion Rate"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openDetail(t._id)}>
                        View Details
                      </Button>
                      <Button
                        variant={t.blocked ? "default" : "destructive"}
                        size="sm"
                        onClick={() => openBlockModal(t._id, t.name, !!t.blocked)}
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ——— Details Modal ——— */}
      <Dialog open={detail.open} onOpenChange={(v) => (v ? null : closeDetail())}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Telecaller Details</DialogTitle>
            <DialogDescription>Profile & performance summary</DialogDescription>
          </DialogHeader>

          {(() => {
            const t = telecallers?.find((x) => x._id === detail.id);
            const s = statsById.get(String(detail.id || "")) || {
              totalLeads: 0,
              success: 0,
              dueToday: 0,
            };
            const rate = ratePct(s.totalLeads, s.success);

            if (!t) return <div className="text-sm text-muted-foreground">No data.</div>;

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Name</div>
                    <div className="font-medium">{t.name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Mobile</div>
                    <div className="font-medium">{t.mobile}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div>
                      {t.blocked ? (
                        <Badge variant="destructive">Blocked</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Joined</div>
                    <div className="font-medium">
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded border">
                    <div className="text-xs text-muted-foreground">Leads Assigned</div>
                    <div className="text-xl font-semibold">{s.totalLeads}</div>
                  </div>
                  <div className="p-3 rounded border">
                    <div className="text-xs text-muted-foreground">Leads Converted</div>
                    <div className="text-xl font-semibold">{s.success}</div>
                  </div>
                  <div className="p-3 rounded border">
                    <div className="text-xs text-muted-foreground">Conversion Rate</div>
                    <div className="text-xl font-semibold">{rate}%</div>
                  </div>
                </div>

                <div className="p-3 rounded border">
                  <div className="text-xs text-muted-foreground">Due Today</div>
                  <div className="text-xl font-semibold">{s.dueToday}</div>
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
                    onClick={() => openBlockModal(t._id, t.name, !!t.blocked)}
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

      {/* ——— Block / Unblock Confirm Modal ——— */}
      <Dialog open={block.open} onOpenChange={(v) => (v ? null : closeBlockModal())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{block.blocked ? "Unblock Telecaller" : "Block Telecaller"}</DialogTitle>
            <DialogDescription>
              {block.blocked
                ? `Allow ${block.name || "this user"} to log in again.`
                : `Disable login for ${block.name || "this user"}. A short reason is required.`}
            </DialogDescription>
          </DialogHeader>

          {!block.blocked && (
            <div className="space-y-2">
              <Label htmlFor="block-reason">Reason</Label>
              <Input
                id="block-reason"
                placeholder="e.g. Inactive account / policy violation"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeBlockModal}>Cancel</Button>
            <Button
              variant={block.blocked ? "default" : "destructive"}
              onClick={confirmBlockToggle}
              disabled={blocking}
              className="gap-2"
            >
              {block.blocked ? (
                <>
                  <ShieldCheck className="h-4 w-4" /> Confirm Unblock
                </>
              ) : (
                <>
                  <ShieldX className="h-4 w-4" /> Confirm Block
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
