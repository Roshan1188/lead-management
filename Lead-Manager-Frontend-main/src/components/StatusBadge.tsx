import { Badge } from '@/components/ui/badge';
import { LeadStatus } from '@/types/lead';

interface StatusBadgeProps {
  status: LeadStatus | string;
}

const VARIANTS: Record<string, { label: string; className: string }> = {
  initialize: { label: 'New', className: 'bg-pending text-pending-foreground' },
  followup: { label: 'Follow Up', className: 'bg-warning text-warning-foreground' },
  success: { label: 'Success', className: 'bg-success text-success-foreground' },
  failed: { label: 'Failed', className: 'bg-destructive text-destructive-foreground' },
};

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  // status is not a fixed enum on the backend — admins can add custom
  // top-level statuses, so unknown values must fall back instead of crashing.
  const variant = VARIANTS[status] ?? {
    label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown',
    className: 'bg-primary/10 text-primary border border-primary/20',
  };

  return <Badge className={variant.className}>{variant.label}</Badge>;
};
