import { useEffect, useState } from "react";
import {
  LEAD_COLUMNS,
  LEAD_DEFAULT_COLUMNS,
  LEAD_COLUMNS_STORAGE_KEY,
  type LeadColumnKey,
} from "@/lib/leadColumns";

const loadColumns = (): LeadColumnKey[] => {
  const minCount = LEAD_DEFAULT_COLUMNS.length;
  if (typeof window === "undefined") return [...LEAD_DEFAULT_COLUMNS];
  const raw = window.localStorage.getItem(LEAD_COLUMNS_STORAGE_KEY);
  if (!raw) return [...LEAD_DEFAULT_COLUMNS];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const filtered = parsed.filter((k) =>
        LEAD_COLUMNS.includes(k as LeadColumnKey)
      ) as LeadColumnKey[];
      return filtered.length >= minCount ? filtered : [...LEAD_DEFAULT_COLUMNS];
    }
  } catch {
    // ignore
  }
  return [...LEAD_DEFAULT_COLUMNS];
};

export const useLeadColumnPrefs = () => {
  const [visibleColumns, setVisibleColumns] = useState<LeadColumnKey[]>(loadColumns);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      LEAD_COLUMNS_STORAGE_KEY,
      JSON.stringify(visibleColumns)
    );
  }, [visibleColumns]);

  const toggleColumn = (key: LeadColumnKey, checked: boolean) => {
    const minCount = LEAD_DEFAULT_COLUMNS.length;
    setVisibleColumns((prev) => {
      if (checked) return prev.includes(key) ? prev : [...prev, key];
      const next = prev.filter((k) => k !== key);
      return next.length >= minCount ? next : prev;
    });
  };

  const resetColumns = () => setVisibleColumns([...LEAD_DEFAULT_COLUMNS]);

  return { visibleColumns, setVisibleColumns, toggleColumn, resetColumns };
};
