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
import { Plus, Shield, Phone, Search, LayoutList, LayoutGrid } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateAdminMutation,
  useGetAdminsQuery,
  type AdminUser,
} from "@/redux/slice/admin/adminApiSlice";

type ViewMode = "list" | "cards";

export default function Admins() {
  const { toast } = useToast();

  // Add dialog
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const phoneValid = /^\d{10}$/.test(mobile);

  // Search + view toggle
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("list");

  // Data
  const {
    data: admins,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetAdminsQuery();

  const [createAdmin, { isLoading: creating }] = useCreateAdminMutation();

  const filtered: AdminUser[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!admins || !term) return admins || [];
    return admins.filter((a) =>
      [a.name || "", a.mobile || ""].some((v) => v.toLowerCase().includes(term))
    );
  }, [admins, q]);

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
      await createAdmin({ name: name.trim() || undefined, mobile }).unwrap();
      toast({ title: "Admin Added", description: `${name || mobile} promoted as Admin.` });
      setOpen(false);
      setName("");
      setMobile("");
      refetch();
    } catch (err: unknown) {
      toast({
        title: "Failed to add admin",
        description: err?.data?.message || err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Administrators</h2>
            <p className="text-muted-foreground">
              Manage admin users
              {isError && (
                <>
                  {" · "}
                  <span className="text-destructive">
                    {(error as any)?.data?.message || "Failed to load"}
                  </span>
                  {" "}
                  <button className="underline" onClick={() => refetch()}>
                    Retry
                  </button>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or mobile…"
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            {/* View toggle */}
            <div className="inline-flex rounded-lg border p-1">
              <Button
                variant={view === "list" ? "default" : "ghost"}
                size="sm"
                className="gap-1"
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
              >
                <LayoutList className="h-4 w-4" /> List
              </Button>
              <Button
                variant={view === "cards" ? "default" : "ghost"}
                size="sm"
                className="gap-1"
                onClick={() => setView("cards")}
                aria-pressed={view === "cards"}
              >
                <LayoutGrid className="h-4 w-4" /> Cards
              </Button>
            </div>

            {/* Add admin */}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Admin
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Administrator</DialogTitle>
                  <DialogDescription>Enter the details of the new admin user</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
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

                  <Button type="submit" className="w-full" disabled={!phoneValid || creating}>
                    {creating ? "Adding…" : "Add Administrator"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* ===== CONTENT ===== */}
        {view === "list" ? (
          <Card>
            <CardHeader>
              <CardTitle>All Administrators</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                          </TableCell>
                          <TableCell>
                            <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                          </TableCell>
                          <TableCell>
                            <div className="h-5 w-20 bg-muted animate-pulse rounded" />
                          </TableCell>
                          <TableCell>
                            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="h-9 w-24 ml-auto bg-muted animate-pulse rounded" />
                          </TableCell>
                        </TableRow>
                      ))
                    : filtered && filtered.length > 0
                    ? filtered.map((admin) => (
                        <TableRow key={admin._id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4 text-primary" />
                              {admin.name || "—"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              {admin.mobile}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">Admin</Badge>
                          </TableCell>
                          <TableCell>
                            {admin.createdAt
                              ? new Date(admin.createdAt).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <ManageAdminDialog admin={admin} />
                          </TableCell>
                        </TableRow>
                      ))
                    : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                          No administrators found.
                        </TableCell>
                      </TableRow>
                    )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          // ===== Cards view =====
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i} className="border">
                    <CardHeader className="pb-2">
                      <div className="h-5 w-40 bg-muted animate-pulse rounded" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                      <div className="h-9 w-full bg-muted animate-pulse rounded" />
                    </CardContent>
                  </Card>
                ))
              : (filtered || []).map((admin) => (
                  <Card key={admin._id} className="border">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Shield className="h-4 w-4 text-primary" />
                        {admin.name || "—"}
                        <Badge variant="secondary" className="ml-auto">Admin</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5" />
                        {admin.mobile}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Created:{" "}
                        <span className="font-medium">
                          {admin.createdAt
                            ? new Date(admin.createdAt).toLocaleDateString()
                            : "—"}
                        </span>
                      </div>
                      <ManageAdminDialog admin={admin} />
                    </CardContent>
                  </Card>
                ))}
            {!isLoading && filtered && filtered.length === 0 && (
              <div className="col-span-full text-sm text-muted-foreground text-center py-8">
                No administrators found.
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

/** Small Manage dialog (placeholder actions; extend as needed) */
function ManageAdminDialog({ admin }: { admin: AdminUser }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">Manage</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Admin</DialogTitle>
          <DialogDescription>View or update this administrator</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Name</div>
              <div className="font-medium">{admin?.name || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Mobile</div>
              <div className="font-medium">{admin?.mobile || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Role</div>
              <div><Badge variant="secondary">Admin</Badge></div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Created</div>
              <div className="font-medium">
                {admin?.createdAt ? new Date(admin.createdAt).toLocaleDateString() : "—"}
              </div>
            </div>
          </div>

          {/* Future actions: transfer ownership / revoke admin, etc. */}
        </div>
        <div className="flex justify-end">
          <Button onClick={() => setOpen(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
