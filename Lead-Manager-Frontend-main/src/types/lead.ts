export type LeadStatus = 'initialize' | 'followup' | 'success' | 'failed';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  status: LeadStatus;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  followupDate?: string;
  followupTime?: string;
  reason?: string;
  notes?: string;
}

export interface FollowUp {
  id: string;
  leadId: string;
  date: string;
  time: string;
  notes: string;
  createdAt: string;
}
