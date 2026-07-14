'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Trash2,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Tag,
  ListChecks,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useGetStatusReasonsQuery,
  useCreateStatusReasonMutation,
  useDeleteStatusReasonMutation,
  useGetCustomStatusesQuery,
  useCreateCustomStatusMutation,
  useDeleteCustomStatusMutation,
  type StatusReasonBaseStatus,
} from '@/redux/slice/admin/adminApiSlice';

type AddMode = 'reason' | 'status';

type StatusMeta = {
  label: string;
  icon: typeof Clock;
  accentBar: string;
  iconWrap: string;
  countBadge: string;
  itemHover: string;
};

const BUILT_IN_META: Record<'followup' | 'success' | 'failed', StatusMeta> = {
  followup: {
    label: 'Follow Up',
    icon: Clock,
    accentBar: 'bg-warning',
    iconWrap: 'bg-warning/15 text-warning',
    countBadge: 'bg-warning/15 text-warning border-warning/20',
    itemHover: 'hover:border-warning/40',
  },
  success: {
    label: 'Success',
    icon: CheckCircle2,
    accentBar: 'bg-success',
    iconWrap: 'bg-success/15 text-success',
    countBadge: 'bg-success/15 text-success border-success/20',
    itemHover: 'hover:border-success/40',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    accentBar: 'bg-destructive',
    iconWrap: 'bg-destructive/15 text-destructive',
    countBadge: 'bg-destructive/15 text-destructive border-destructive/20',
    itemHover: 'hover:border-destructive/40',
  },
};

const customMeta = (label: string): StatusMeta => ({
  label,
  icon: Tag,
  accentBar: 'bg-primary/60',
  iconWrap: 'bg-primary/10 text-primary',
  countBadge: 'bg-primary/10 text-primary border-primary/20',
  itemHover: 'hover:border-primary/40',
});

export default function StatusOptions() {
  const { toast } = useToast();
  const { data, isLoading, isFetching } = useGetStatusReasonsQuery();
  const [createStatusReason, { isLoading: isCreating }] = useCreateStatusReasonMutation();
  const [deleteStatusReason, { isLoading: isDeleting }] = useDeleteStatusReasonMutation();

  const {
    data: customStatusData,
    isLoading: customLoading,
    isFetching: customFetching,
  } = useGetCustomStatusesQuery();
  const [createCustomStatus, { isLoading: isCreatingStatus }] = useCreateCustomStatusMutation();
  const [deleteCustomStatus, { isLoading: isDeletingStatus }] = useDeleteCustomStatusMutation();

  const [addMode, setAddMode] = useState<AddMode>('reason');
  const [baseStatus, setBaseStatus] = useState<StatusReasonBaseStatus>('failed');
  const [label, setLabel] = useState('');

  const items = data?.items ?? [];
  const customStatuses = customStatusData?.items ?? [];

  // Built-in + custom statuses — sab ek jaise columns, sab mein reasons.
  const grouped: Array<{
    key: string;
    meta: StatusMeta;
    options: typeof items;
    customId?: string;
  }> = [
    ...(Object.keys(BUILT_IN_META) as Array<keyof typeof BUILT_IN_META>).map((key) => ({
      key: key as string,
      meta: BUILT_IN_META[key],
      options: items.filter((i) => i.baseStatus === key),
    })),
    ...customStatuses.map((s) => ({
      key: s.slug,
      meta: customMeta(s.label),
      options: items.filter((i) => i.baseStatus === s.slug),
      customId: s._id,
    })),
  ];

  const statusLabel = (key: string) =>
    grouped.find((g) => g.key === key)?.meta.label ?? key;

  const handleAdd = async () => {
    if (!label.trim()) {
      toast({ title: 'Label required', description: 'Enter an option label first.', variant: 'destructive' });
      return;
    }

    if (addMode === 'status') {
      try {
        await createCustomStatus({ label: label.trim() }).unwrap();
        toast({ title: 'Status added', description: `"${label.trim()}" is now a top-level status.` });
        setLabel('');
      } catch (e: any) {
        toast({
          title: 'Failed to add status',
          description: e?.data?.message || e?.message || 'Please try again.',
          variant: 'destructive',
        });
      }
      return;
    }

    try {
      await createStatusReason({ baseStatus, label: label.trim() }).unwrap();
      toast({ title: 'Added', description: `"${label.trim()}" added to ${statusLabel(baseStatus)}.` });
      setLabel('');
    } catch (e: any) {
      toast({
        title: 'Failed to add',
        description: e?.data?.message || e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string, itemLabel: string) => {
    try {
      await deleteStatusReason(id).unwrap();
      toast({ title: 'Removed', description: `"${itemLabel}" removed.` });
    } catch (e: any) {
      toast({
        title: 'Failed to remove',
        description: e?.data?.message || e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteCustomStatus = async (id: string, itemLabel: string) => {
    try {
      await deleteCustomStatus(id).unwrap();
      toast({ title: 'Removed', description: `"${itemLabel}" status removed.` });
    } catch (e: any) {
      toast({
        title: 'Failed to remove',
        description: e?.data?.message || e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const loadingAny = isLoading || isFetching || customLoading || customFetching;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Page header */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ListChecks className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Status Options</h2>
            <p className="text-muted-foreground">
              Manage the quick-select reason options telecallers see in the "Update Lead" dialog.
            </p>
          </div>
        </div>

        {/* Add new option */}
        <Card className="overflow-hidden border shadow-sm">
          <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-primary" />
              Add new option
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Segmented mode toggle */}
            <div className="inline-flex rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setAddMode('reason')}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                  addMode === 'reason'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Reason (under a status)
              </button>
              <button
                type="button"
                onClick={() => setAddMode('status')}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                  addMode === 'status'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                New top-level status
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {addMode === 'reason' && (
                <Select value={baseStatus} onValueChange={(v: string) => setBaseStatus(v)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BUILT_IN_META) as Array<keyof typeof BUILT_IN_META>).map((k) => (
                      <SelectItem key={k} value={k}>
                        {BUILT_IN_META[k].label}
                      </SelectItem>
                    ))}
                    {customStatuses.map((s) => (
                      <SelectItem key={s.slug} value={s.slug}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Input
                placeholder={addMode === 'status' ? 'e.g. Waiting' : 'e.g. Not interested'}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="max-w-xs"
              />

              <Button onClick={handleAdd} disabled={isCreating || isCreatingStatus} className="shadow-sm">
                <Plus className="mr-1 h-4 w-4" />
                {isCreating || isCreatingStatus ? 'Adding…' : 'Add option'}
              </Button>
            </div>

            {addMode === 'status' && (
              <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                This creates a brand new status (like Follow Up / Success / Failed) that telecallers
                can pick directly. You can then add quick-reason options under it, just like the
                built-in statuses.
              </p>
            )}
          </CardContent>
        </Card>

        {/* All status columns — built-in + custom, same behaviour */}
        <div className="grid gap-5 md:grid-cols-3">
          {grouped.map(({ key, meta, options, customId }) => {
            const Icon = meta.icon;
            return (
              <Card key={key} className="overflow-hidden border shadow-sm transition-shadow hover:shadow-md">
                <div className={`h-1 ${meta.accentBar}`} />
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2.5">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.iconWrap}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="font-semibold">{meta.label}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`${meta.countBadge} font-semibold`}>
                        {options.length}
                      </Badge>
                      {customId && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={isDeletingStatus}
                          onClick={() => handleDeleteCustomStatus(customId, meta.label)}
                          title="Remove this status (and its options)"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </span>
                  </CardTitle>
                  {customId && (
                    <p className="text-xs text-muted-foreground">Custom status</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {loadingAny ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
                      ))}
                    </div>
                  ) : options.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-6 text-center">
                      <Tag className="h-5 w-5 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No options yet</p>
                    </div>
                  ) : (
                    options.map((opt) => (
                      <div
                        key={opt._id}
                        className={`group flex items-center justify-between rounded-lg border bg-card px-3 py-2 transition-colors ${meta.itemHover}`}
                      >
                        <span className="text-sm font-medium">{opt.label}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                          disabled={isDeleting}
                          onClick={() => handleDelete(opt._id, opt.label)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
