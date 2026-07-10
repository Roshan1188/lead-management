import { Badge } from '@/components/ui/badge';
import { LeadStatus } from '@/types/lead';

interface StatusBadgeProps {
  status: LeadStatus;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const variants: Record<LeadStatus, { label: string; className: string }> = {
    initialize: { label: 'New', className: 'bg-pending text-pending-foreground' },
    followup: { label: 'Follow Up', className: 'bg-warning text-warning-foreground' },
    success: { label: 'Success', className: 'bg-success text-success-foreground' },
    failed: { label: 'Failed', className: 'bg-destructive text-destructive-foreground' },
  };

  const variant = variants[status];

  return <Badge className={variant.className}>{variant.label}</Badge>;
};
