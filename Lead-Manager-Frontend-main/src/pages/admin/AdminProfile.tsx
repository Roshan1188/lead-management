import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

import authService, { clearAllAuth } from "@/services/authService";
import apiSlice from "@/redux/apiSlice";
import { useDispatch } from "react-redux";
import { useMeQuery, useUpdateProfileMutation } from "@/redux/slice/auth/authApiSlice";
import { Loader2, LogOut, UploadCloud, Shield } from "lucide-react";

export default function AdminProfile() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // ---- Server user (authoritative) ----
  const { data: me, refetch, isFetching } = useMeQuery();

  // ---- Local form state ----
  const [name, setName] = useState<string>("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    setName(me?.name ?? "");
  }, [me?.name]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const [updateProfile, { isLoading: isSaving }] = useUpdateProfileMutation();

  const fileRef = useRef<HTMLInputElement | null>(null);
  const triggerFile = () => fileRef.current?.click();
  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0] || null;
    setAvatarFile(f || null);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(f ? URL.createObjectURL(f) : null);
  };

  const initials = useMemo(() => {
    const source = me?.name?.trim() || "A D";
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join("");
  }, [me?.name]);

  const onSave: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    try {
      await updateProfile({ name: name?.trim() || undefined, avatar: avatarFile }).unwrap();
      await refetch();
      setAvatarFile(null);
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
        setAvatarPreview(null);
      }
      toast({ title: "Profile updated", description: "Your profile was saved successfully." });
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err?.data?.message || err?.message || "Could not update profile.",
        variant: "destructive",
      });
    }
  };

  // ---- Logout (clear everything) ----
  const doLogout = async () => {
    try {
      clearAllAuth(); // remove adminToken/teleCallerToken

      // clean any legacy keys
      try { localStorage.removeItem("currentUser"); } catch {}
      try { sessionStorage.clear(); } catch {}

      // reset RTK Query cache
      dispatch(apiSlice.util.resetApiState());

      // clear Cache Storage
      if ("caches" in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch {}
      }
    } finally {
      navigate("/login", { replace: true });
      setTimeout(() => window.location.reload(), 30);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Profile Settings</h2>
            <p className="text-muted-foreground">Manage your admin account settings</p>
            {isFetching && <p className="mt-2 text-xs text-muted-foreground">Refreshing your profile…</p>}
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2">
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Log out from this device?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will clear your session, API cache, and local app caches.
                  You can log in again anytime.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={doLogout}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Logout
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Personal Info */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Update your name and profile picture.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSave} className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24 ring-2 ring-offset-2 ring-primary/30">
                  <AvatarImage src={avatarPreview || me?.avatarUrl || ""} alt={me?.name || "Avatar"} />
                  <AvatarFallback className="text-2xl bg-primary/10">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-3">
                  <Input
                    ref={fileRef as any}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onFileChange}
                  />
                  <Button type="button" variant="outline" className="gap-2" onClick={triggerFile}>
                    <UploadCloud className="h-4 w-4" />
                    {avatarFile ? "Change Photo" : "Upload Photo"}
                  </Button>
                  {avatarFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setAvatarFile(null);
                        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                        setAvatarPreview(null);
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Mobile</Label>
                  <Input value={me?.mobile ?? ""} readOnly />
                </div>

                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input value="Admin" readOnly />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Security (info-only for OTP auth) */}
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>OTP-based login is enabled for this account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground p-3 rounded border">
              <Shield className="h-4 w-4" />
              Your workspace uses mobile OTP. Password changes are not applicable.
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
