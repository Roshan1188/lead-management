import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Lead } from "@/redux/slice/lead/leadApiSlice";
import { getLeadColumnDefs } from "@/lib/leadColumns";

type LeadDetailsModalProps = {
  lead: Lead;
  triggerLabel?: string;
  metaFormMap?: Record<string, string>;
};

const formatMetaValue = (value: unknown) => {
  if (value === null || typeof value === "undefined" || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => formatMetaValue(v)).join(", ");
  return "—";
};

const getMetaPayloadRows = (metaRaw: unknown): Array<{ label: string; value: string }> => {
  if (!metaRaw || typeof metaRaw !== "object") return [];
  const raw = metaRaw as {
    created_time?: string;
    field_data?: Array<{ name?: string; values?: unknown[] | unknown }>;
  };

  const rows: Array<{ label: string; value: string }> = [];
  if (raw.created_time) {
    rows.push({
      label: "Meta Created Time",
      value: new Date(raw.created_time).toLocaleString(),
    });
  }

  if (Array.isArray(raw.field_data)) {
    raw.field_data.forEach((f) => {
      const key = (f?.name || "").trim();
      if (!key) return;
      const v = Array.isArray(f.values) ? f.values[0] : f.values;
      rows.push({ label: key, value: formatMetaValue(v) });
    });
  }
  return rows;
};

export function LeadDetailsModal({
  lead,
  triggerLabel = "View",
  metaFormMap,
}: LeadDetailsModalProps) {
  const columnDefs = getLeadColumnDefs(metaFormMap);
  const metaRows = getMetaPayloadRows(lead.metaRaw);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Lead Details</DialogTitle>
          <DialogDescription>Complete lead information</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] w-full rounded-md border bg-muted/30 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {columnDefs.map((col) => (
              <div key={col.key} className="space-y-1">
                <div className="text-xs text-muted-foreground">{col.label}</div>
                <div className="text-sm">{col.render(lead)}</div>
              </div>
            ))}
          </div>

          <Separator className="my-4" />

          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">Meta Payload (HTML View)</div>
            {metaRows.length > 0 ? (
              <div className="rounded-md border bg-background">
                {metaRows.map((row, idx) => (
                  <div
                    key={`${row.label}-${idx}`}
                    className="grid grid-cols-1 gap-1 border-b p-3 text-sm last:border-b-0 sm:grid-cols-2"
                  >
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      {row.label}
                    </div>
                    <div className="break-words">{row.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No Meta payload available.</div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
