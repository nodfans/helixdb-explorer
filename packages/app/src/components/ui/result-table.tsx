import { createMemo } from "solid-js";
import { Grid, GridColumn } from "./grid";

export const ResultTable = (props: { data: any[]; onSelect?: (rows: any[]) => void; selectedRows?: any[]; offset?: number }) => {
  const normalizedData = createMemo(() => {
    const d = props.data;
    if (Array.isArray(d)) return d;
    if (d === null || d === undefined) return [];
    return [d];
  });

  const tableData = createMemo(() => {
    return normalizedData().map((row) => {
      if (typeof row !== "object" || row === null) {
        return { __original: row, Value: row };
      }
      const newRow: any = { __original: row };
      for (const key in row) {
        const val = row[key];
        if (val !== null && typeof val === "object") {
          try {
            newRow[key] = JSON.stringify(val);
          } catch (e) {
            newRow[key] = "[Complex Object]";
          }
        } else {
          newRow[key] = val;
        }
      }
      return newRow;
    });
  });

  const columns = createMemo<GridColumn[]>(() => {
    const data = tableData();
    if (data.length === 0) return [];

    const first = data.find((item) => typeof item === "object" && item !== null);
    if (!first) return [{ key: "Value", label: "Value" }];

    const sampleSize = Math.min(data.length, 20);
    const sample = data.slice(0, sampleSize);

    const allKeys = Object.keys(first).filter((k) => k !== "__original");
    const sortedKeys = allKeys.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      if (aLower === "id") return -1;
      if (bLower === "id") return 1;
      return 0; // Keep original order for others
    });

    return sortedKeys.map((key) => {
      let maxLen = key.length;
      for (const row of sample) {
        const val = row[key];
        if (val !== null && val !== undefined) {
          const len = String(val).length;
          if (len > maxLen) maxLen = len;
        }
      }

      const estimatedWidth = Math.min(Math.max(maxLen * 8 + 20, 100), 320);

      return {
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1).toLowerCase(),
        width: estimatedWidth,
        editable: false,
      };
    });
  });

  // Convert selected row objects → indices for Grid
  const selectedRowIndices = createMemo(() => {
    const rows = props.selectedRows || [];
    const data = tableData();
    return data.map((item, idx) => (rows.includes(item.__original) ? idx : -1)).filter((idx) => idx !== -1);
  });

  // Convert indices back → original row objects for parent
  const handleSelectionChange = (indices: number[]) => {
    const data = tableData();
    const originals = indices.map((i) => data[i]?.__original).filter(Boolean);
    props.onSelect?.(originals);
  };

  return (
    <div class="flex-1 min-h-0 flex flex-col bg-[var(--bg-workbench-content)]">
      <Grid
        columns={columns()}
        data={tableData()}
        selectedRowIndices={selectedRowIndices()}
        onSelectionChange={handleSelectionChange}
        class="flex-1 min-h-0 overflow-hidden border-none rounded-none shadow-none"
        offset={props.offset}
      />
    </div>
  );
};
