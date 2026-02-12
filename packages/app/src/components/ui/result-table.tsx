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
          newRow[key] = JSON.stringify(val);
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

  const selectedRowIndices = createMemo(() => {
    const rows = props.selectedRows || [];
    const data = tableData();
    // Match based on original data reference
    return data.map((item, idx) => (rows.includes(item.__original) ? idx : -1)).filter((idx) => idx !== -1);
  });

  const handleRowSelect = (index: number, e: MouseEvent) => {
    const data = tableData();
    const clickedItem = data[index];
    if (!clickedItem) return;

    const clickedOriginal = clickedItem.__original;

    if (e.shiftKey && props.selectedRows && props.selectedRows.length > 0) {
      const lastSelectedOriginal = props.selectedRows[props.selectedRows.length - 1];
      const lastIndex = data.findIndex((item) => item.__original === lastSelectedOriginal);

      if (lastIndex !== -1) {
        const start = Math.min(lastIndex, index);
        const end = Math.max(lastIndex, index);
        const range = data.slice(start, end + 1).map((item) => item.__original);
        props.onSelect?.(range);
        return;
      }
    }

    // Toggle logic for single click or Cmd/Ctrl click
    const isAlreadySelected = (props.selectedRows || []).includes(clickedOriginal);
    if (e.metaKey || e.ctrlKey) {
      if (isAlreadySelected) {
        props.onSelect?.(props.selectedRows?.filter((r) => r !== clickedOriginal) || []);
      } else {
        props.onSelect?.([...(props.selectedRows || []), clickedOriginal]);
      }
    } else {
      if (isAlreadySelected && props.selectedRows?.length === 1) {
        props.onSelect?.([]);
      } else {
        props.onSelect?.([clickedOriginal]);
      }
    }
  };

  return (
    <div class="flex-1 min-h-0 flex flex-col bg-[var(--bg-workbench-content)]">
      <Grid
        columns={columns()}
        data={tableData()}
        selectedRowIndices={selectedRowIndices()}
        onRowSelect={handleRowSelect}
        class="flex-1 min-h-0 overflow-hidden border-none rounded-none shadow-none"
        offset={props.offset}
      />
    </div>
  );
};
