'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
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

const BASE_STATUS_META: Record<StatusReasonBaseStatus, { label: string; badgeClass: string }> = {
  followup: { label: 'Follow Up', badgeClass: 'bg-warning text-warning-foreground' },
  success: { label: 'Success', badgeClass: 'bg-success text-success-foreground' },
  failed: { label: 'Failed', badgeClass: 'bg-destructive text-destructive-foreground' },
};

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
  const grouped = (Object.keys(BASE_STATUS_META) as StatusReasonBaseStatus[]).map((key) => ({
    key,
    meta: BASE_STATUS_META[key],
    options: items.filter((i) => i.baseStatus === key),
  }));
  const customStatuses = customStatusData?.items ?? [];

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
      toast({ title: 'Added', description: `"${label.trim()}" added to ${BASE_STATUS_META[baseStatus].label}.` });
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Status Options</h2>
          <p className="text-muted-foreground">
            Manage the quick-select reason options telecallers see in the "Update Lead" dialog.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add new option</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={addMode === 'reason' ? 'default' : 'outline'}
                onClick={() => setAddMode('reason')}
              >
                Reason (under a status)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={addMode === 'status' ? 'default' : 'outline'}
                onClick={() => setAddMode('status')}
              >
                New top-level status
              </Button>
            </div>

            <div className="flex flex-wrap gap-3">
              {addMode === 'reason' && (
                <Select value={baseStatus} onValueChange={(v: StatusReasonBaseStatus) => setBaseStatus(v)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BASE_STATUS_META) as StatusReasonBaseStatus[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {BASE_STATUS_META[k].label}
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

              <Button onClick={handleAdd} disabled={isCreating || isCreatingStatus}>
                <Plus className="h-4 w-4 mr-1" />
                {isCreating || isCreatingStatus ? 'Adding…' : 'Add option'}
              </Button>
            </div>

            {addMode === 'status' && (
              <p className="text-xs text-muted-foreground">
                This creates a brand new status (like Follow Up / Success / Failed) that telecallers
                can pick directly. It won't be counted in existing status-based reports.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {grouped.map(({ key, meta, options }) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge className={meta.badgeClass}>{meta.label}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading || isFetching ? (
                  <div className="text-sm text-muted-foreground">Loading…</div>
                ) : options.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No options yet.</div>
                ) : (
                  options.map((opt) => (
                    <div
                      key={opt._id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <span className="text-sm">{opt.label}</span>
                      <Button
                        size="icon"
                        variant="ghost"
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
          ))}

          {customLoading || customFetching ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Loading…</CardTitle>
              </CardHeader>
            </Card>
          ) : (
            customStatuses.map((s) => (
              <Card key={s._id}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <Badge className="bg-secondary text-secondary-foreground">{s.label}</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={isDeletingStatus}
                      onClick={() => handleDeleteCustomStatus(s._id, s.label)}
                      title="Remove this status"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    Custom top-level status. Telecallers can select it directly; it doesn't
                    have quick-reason options.
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {!customLoading && !customFetching && customStatuses.length === 0 && (
          <p className="text-sm text-muted-foreground">No custom top-level statuses yet.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
