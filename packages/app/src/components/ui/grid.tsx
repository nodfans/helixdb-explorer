import { createSignal, For, Show, onMount, onCleanup, createEffect, createMemo } from "solid-js";

export interface GridColumn {
  key: string;
  label: string;
  width?: number;
  editable?: boolean;
  type?: "text" | "number" | "select";
  options?: string[];
  align?: "left" | "center" | "right";
}

interface GridProps {
  columns: GridColumn[];
  data: any[];
  onDataChange?: (newData: any[]) => void;
  class?: string;
  offset?: number;
  // Row selection (controlled by parent, indices into props.data)
  selectedRowIndices?: number[];
  onSelectionChange?: (indices: number[]) => void;
}

const ROW_HEIGHT = 30;
const BUFFER_ROWS = 10;

export function Grid(props: GridProps) {
  const [editingCell, setEditingCell] = createSignal<string | null>(null);
  const [editValue, setEditValue] = createSignal<string>("");
  const [columnWidths, setColumnWidths] = createSignal<Record<string, number>>({});
  const [rowNumberWidth, setRowNumberWidth] = createSignal(50);
  const [resizingColumn, setResizingColumn] = createSignal<string | null>(null);
  const [isRowNumberResized, setIsRowNumberResized] = createSignal(false);
  const [resizeStartX, setResizeStartX] = createSignal(0);
  const [resizeStartWidth, setResizeStartWidth] = createSignal(0);
  const [sortConfig, setSortConfig] = createSignal<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);

  // Selection anchor for shift-click range selection (original index)
  const [anchorIndex, setAnchorIndex] = createSignal<number | null>(null);
  // Hover tracking via signal (sorted index)
  const [hoveredSortedIndex, setHoveredSortedIndex] = createSignal<number | null>(null);

  let containerRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;

  // Initialize column widths and viewport height
  onMount(() => {
    const widths: Record<string, number> = {};
    props.columns.forEach((col) => {
      widths[col.key] = col.width || 150;
    });
    setColumnWidths(widths);

    const updateViewportHeight = () => {
      if (containerRef) {
        setViewportHeight(containerRef.clientHeight);
      }
    };

    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);
    onCleanup(() => window.removeEventListener("resize", updateViewportHeight));
  });

  // Calculate row number width based on data length
  createEffect(() => {
    if (isRowNumberResized()) return;
    const offset = props.offset || 0;
    const maxRowNumber = props.data.length - 1 + offset;
    const numDigits = String(Math.max(0, maxRowNumber)).length;
    // Use a more generous multiplier (9) and base padding (20)
    // and increase max width to 120 to accommodate larger offsets.
    const calculatedWidth = Math.min(Math.max(48, numDigits * 9 + 20), 120);
    setRowNumberWidth(calculatedWidth);
  });

  // --- Column resize ---

  const handleMouseMove = (e: MouseEvent) => {
    const resCol = resizingColumn();
    if (resCol === "__row_number__") {
      setIsRowNumberResized(true);
      const diff = e.clientX - resizeStartX();
      const newWidth = Math.max(40, resizeStartWidth() + diff);
      setRowNumberWidth(newWidth);
    } else if (resCol) {
      const diff = e.clientX - resizeStartX();
      const newWidth = Math.max(60, resizeStartWidth() + diff);
      setColumnWidths((prev) => ({
        ...prev,
        [resCol]: newWidth,
      }));
    }
  };

  const handleMouseUp = () => {
    setResizingColumn(null);
  };

  createEffect(() => {
    if (resizingColumn()) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    } else {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }
  });

  onCleanup(() => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  });

  const handleResizeStart = (e: MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(colKey);
    setResizeStartX(e.clientX);
    if (colKey === "__row_number__") {
      setResizeStartWidth(rowNumberWidth());
    } else {
      setResizeStartWidth(columnWidths()[colKey] || 150);
    }
  };

  // --- Sorting ---

  const handleHeaderClick = (colKey: string) => {
    const current = sortConfig();
    if (current?.key === colKey) {
      if (current.direction === "asc") {
        setSortConfig({ key: colKey, direction: "desc" });
      } else {
        setSortConfig(null);
      }
    } else {
      setSortConfig({ key: colKey, direction: "asc" });
    }
  };

  // Sorted data with original index tracking (fixes sort + selection mismatch)
  const sortedData = createMemo(() => {
    const config = sortConfig();
    const indexed = props.data.map((row, i) => ({ row, originalIndex: i }));
    if (!config) return indexed;

    return [...indexed].sort((a, b) => {
      const aVal = a.row[config.key];
      const bVal = b.row[config.key];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const multiplier = config.direction === "asc" ? 1 : -1;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return (aVal - bVal) * multiplier;
      }
      return String(aVal).localeCompare(String(bVal)) * multiplier;
    });
  });

  // O(1) selection lookup
  const selectedSet = createMemo(() => new Set(props.selectedRowIndices || []));

  // Reverse mapping: originalIndex → sortedIndex (for shift-click range)
  const originalToSortedMap = createMemo(() => {
    const map = new Map<number, number>();
    sortedData().forEach((item, sortedIdx) => {
      map.set(item.originalIndex, sortedIdx);
    });
    return map;
  });

  // --- Virtual scrolling ---

  const virtualStore = createMemo(() => {
    const data = sortedData();
    const top = scrollTop();
    const height = viewportHeight();

    const startIndex = Math.max(0, Math.floor(top / ROW_HEIGHT) - BUFFER_ROWS);
    const endIndex = Math.min(data.length, Math.ceil((top + height) / ROW_HEIGHT) + BUFFER_ROWS);

    const visibleRows = data.slice(startIndex, endIndex).map((item, i) => ({
      row: item.row,
      originalIndex: item.originalIndex,
      sortedIndex: startIndex + i,
    }));

    return {
      visibleRows,
      startIndex,
      totalHeight: data.length * ROW_HEIGHT,
      offset: startIndex * ROW_HEIGHT,
    };
  });

  const handleScroll = (e: Event) => {
    setScrollTop((e.currentTarget as HTMLDivElement).scrollTop);
  };

  // --- Cell editing ---

  const handleCellDoubleClick = (originalIndex: number, colKey: string, value: any) => {
    const column = props.columns.find((col) => col.key === colKey);
    if (column?.editable !== false) {
      setEditingCell(`${originalIndex}-${colKey}`);
      setEditValue(String(value || ""));
      setTimeout(() => inputRef?.focus(), 0);
    }
  };

  const handleCellSave = (originalIndex: number, colKey: string) => {
    if (props.onDataChange && editValue() !== props.data[originalIndex][colKey]) {
      const newData = [...props.data];
      newData[originalIndex] = { ...newData[originalIndex], [colKey]: editValue() };
      props.onDataChange(newData);
    }
    setEditingCell(null);
  };

  const handleCellKeyDown = (e: KeyboardEvent, originalIndex: number, colKey: string) => {
    if (e.key === "Enter") {
      handleCellSave(originalIndex, colKey);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  // --- Row selection ---

  const handleRowClick = (sortedIndex: number, originalIndex: number, e: MouseEvent) => {
    if (!props.onSelectionChange) return;
    const current = props.selectedRowIndices || [];

    if (e.shiftKey && anchorIndex() !== null) {
      // Range select in visual (sorted) order
      const anchorSorted = originalToSortedMap().get(anchorIndex()!);
      if (anchorSorted !== undefined) {
        const start = Math.min(anchorSorted, sortedIndex);
        const end = Math.max(anchorSorted, sortedIndex);
        const rangeOriginals = sortedData()
          .slice(start, end + 1)
          .map((x) => x.originalIndex);
        props.onSelectionChange(rangeOriginals);
      }
      // Don't update anchor on shift-click
    } else if (e.metaKey) {
      // Cmd+Click: toggle individual row
      const isSelected = selectedSet().has(originalIndex);
      if (isSelected) {
        props.onSelectionChange(current.filter((i) => i !== originalIndex));
      } else {
        props.onSelectionChange([...current, originalIndex]);
      }
      setAnchorIndex(originalIndex);
    } else {
      // Plain click: select single row, or deselect if already sole selection
      if (current.length === 1 && current[0] === originalIndex) {
        props.onSelectionChange([]);
        setAnchorIndex(null);
      } else {
        props.onSelectionChange([originalIndex]);
        setAnchorIndex(originalIndex);
      }
    }
  };

  // --- Context menu (right-click / Ctrl+Click) ---

  const handleContextMenu = (e: MouseEvent, originalIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    let rowsToCopy: any[];
    if (selectedSet().has(originalIndex)) {
      // Right-clicked a selected row: copy all selected rows
      const indices = [...(props.selectedRowIndices || [])].sort((a, b) => a - b);
      rowsToCopy = indices.map((i) => props.data[i]);
    } else {
      // Right-clicked an unselected row: select it and copy just this one
      props.onSelectionChange?.([originalIndex]);
      setAnchorIndex(originalIndex);
      rowsToCopy = [props.data[originalIndex]];
    }

    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("show_grid_context_menu", { rows: rowsToCopy, columns: props.columns });
    });
  };

  // --- Keyboard shortcuts ---

  const handleGridKeyDown = (e: KeyboardEvent) => {
    if (editingCell()) return;

    // Cmd+C / Ctrl+C: copy selected rows as TSV
    if ((e.metaKey || e.ctrlKey) && e.key === "c") {
      // If there is any text selection in the window, let the browser handle it
      if (window.getSelection()?.toString()) {
        return;
      }

      const indices = [...(props.selectedRowIndices || [])].sort((a, b) => a - b);
      if (indices.length === 0) return;

      e.preventDefault();
      const rows = indices.map((i) => props.data[i]);
      const lines = rows.map((row) =>
        props.columns
          .map((col) => {
            const val = row[col.key];
            if (val === null || val === undefined) return "";
            return String(val);
          })
          .join("\t")
      );
      navigator.clipboard.writeText(lines.join("\n"));
    }

    // Cmd+A / Ctrl+A: select all rows
    if ((e.metaKey || e.ctrlKey) && e.key === "a") {
      e.preventDefault();
      props.onSelectionChange?.(props.data.map((_, i) => i));
    }
  };

  // --- Build TSV helper for copy ---

  return (
    <div
      class={`relative flex flex-col min-h-0 h-full ${props.class || ""}`}
      style={{
        "background-color": "var(--grid-bg)",
        "box-shadow": props.class?.includes("shadow-none") ? "none" : "var(--grid-shadow)",
        outline: "none",
      }}
      tabIndex={0}
      onKeyDown={handleGridKeyDown}
    >
      <div ref={containerRef} onScroll={handleScroll} class={`flex-1 min-h-0 overscroll-behavior-y-contain ${props.data.length === 0 ? "overflow-hidden" : "overflow-auto"}`}>
        <div class="inline-block min-w-full align-middle relative" style={{ height: `${virtualStore().totalHeight + 32}px` }}>
          {/* Header */}
          <div
            class="flex sticky top-0 z-20"
            style={{
              background: "var(--grid-header-bg)",
              "border-bottom": "0.5px solid var(--grid-header-border)",
              "backdrop-filter": "blur(8px)",
              "-webkit-backdrop-filter": "blur(8px)",
            }}
          >
            {/* Row number header */}
            <div
              class="flex-shrink-0 flex items-center justify-center relative group select-none"
              style={{
                width: `${rowNumberWidth()}px`,
                "min-height": "32px",
                "border-right": "0.5px solid var(--grid-border)",
                color: "var(--grid-header-text)",
                "font-size": "11px",
                "font-weight": "600",
                "letter-spacing": "0.02em",
              }}
            >
              #
              <div
                class="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                style={{
                  "background-color": resizingColumn() === "__row_number__" ? "var(--grid-resize-active)" : "var(--grid-resize-handle)",
                }}
                onMouseDown={(e) => handleResizeStart(e, "__row_number__")}
              />
            </div>

            <For each={props.columns}>
              {(column) => (
                <div
                  class="flex-shrink-0 px-1.5 flex items-center relative group select-none cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                  style={{
                    width: `${columnWidths()[column.key] || 150}px`,
                    "min-height": "32px",
                    "border-right": "0.5px solid var(--grid-border)",
                    color: sortConfig()?.key === column.key ? "var(--accent)" : "var(--grid-header-text)",
                    "font-size": "11px",
                    "font-weight": "600",
                  }}
                  onClick={() => handleHeaderClick(column.key)}
                >
                  <span class="truncate pr-2.5">{column.label}</span>
                  <div class="absolute right-1.5 flex items-center">
                    <Show
                      when={sortConfig()?.key === column.key}
                      fallback={
                        <svg class="w-3 h-3 opacity-0 group-hover:opacity-30 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                      }
                    >
                      <svg class="w-3 h-3 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d={sortConfig()?.direction === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                      </svg>
                    </Show>
                  </div>
                  <div
                    class="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-30"
                    style={{
                      "background-color": resizingColumn() === column.key ? "var(--grid-resize-active)" : "var(--grid-resize-handle)",
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleResizeStart(e, column.key);
                    }}
                  />
                </div>
              )}
            </For>
            <div class="flex-1 min-h-[32px]" />
          </div>

          {/* Virtual rows */}
          <div
            class="min-w-full"
            style={{
              position: "absolute",
              top: "32px",
              left: 0,
              transform: `translateY(${virtualStore().offset}px)`,
            }}
          >
            <For each={virtualStore().visibleRows}>
              {(item) => {
                const row = item.row;
                const originalIndex = item.originalIndex;
                const sortedIndex = item.sortedIndex;
                const isRowSelected = () => selectedSet().has(originalIndex);
                const isHovered = () => hoveredSortedIndex() === sortedIndex;

                return (
                  <div
                    class="flex transition-colors duration-100"
                    style={{
                      height: `${ROW_HEIGHT}px`,
                      "border-bottom": "1px solid var(--grid-border)",
                      "background-color": isRowSelected() ? "var(--grid-row-selected)" : isHovered() ? "var(--grid-row-hover)" : "var(--grid-row-bg)",
                      cursor: "pointer",
                    }}
                    onClick={(e) => handleRowClick(sortedIndex, originalIndex, e)}
                    onMouseDown={(e) => {
                      // Prevent text selection during shift-click
                      if (e.shiftKey) e.preventDefault();
                    }}
                    onMouseEnter={() => setHoveredSortedIndex(sortedIndex)}
                    onMouseLeave={() => {
                      if (hoveredSortedIndex() === sortedIndex) setHoveredSortedIndex(null);
                    }}
                    onContextMenu={(e) => handleContextMenu(e, originalIndex)}
                  >
                    {/* Row number */}
                    <div
                      class="flex-shrink-0 flex items-center justify-center select-none"
                      style={{
                        width: `${rowNumberWidth()}px`,
                        height: `${ROW_HEIGHT}px`,
                        "border-right": "1px solid var(--grid-border)",
                        color: "var(--grid-cell-secondary)",
                        "font-size": "11px",
                        "font-variant-numeric": "tabular-nums",
                        "font-family": "var(--font-sans)",
                      }}
                    >
                      <span class="truncate px-2">{(props.offset || 0) + originalIndex}</span>
                    </div>

                    {/* Data cells */}
                    <For each={props.columns}>
                      {(column) => {
                        const cellId = () => `${originalIndex}-${column.key}`;
                        const isEditing = () => editingCell() === cellId();
                        const value = () => row[column.key];

                        return (
                          <div
                            class="flex-shrink-0 flex items-center transition-colors duration-100 cursor-cell relative"
                            style={{
                              width: `${columnWidths()[column.key] || 150}px`,
                              height: `${ROW_HEIGHT}px`,
                              "border-right": "1px solid var(--grid-border)",
                            }}
                            onDblClick={() => handleCellDoubleClick(originalIndex, column.key, value())}
                          >
                            <Show
                              when={isEditing()}
                              fallback={
                                <div
                                  class="px-1.5 w-full whitespace-nowrap overflow-x-auto scrollbar-hide"
                                  style={{
                                    color: "var(--grid-cell-text)",
                                    "font-size": "12px",
                                    "text-align": column.align || "left",
                                    "line-height": "1.2",
                                    "mask-image": "linear-gradient(to right, black calc(100% - 15px), transparent 100%)",
                                    "-webkit-mask-image": "linear-gradient(to right, black calc(100% - 15px), transparent 100%)",
                                  }}
                                >
                                  {value() !== null && value() !== undefined ? String(value()) : ""}
                                </div>
                              }
                            >
                              <input
                                ref={inputRef}
                                type={column.type === "number" ? "number" : "text"}
                                value={editValue()}
                                onInput={(e) => setEditValue(e.currentTarget.value)}
                                onBlur={() => handleCellSave(originalIndex, column.key)}
                                onKeyDown={(e) => handleCellKeyDown(e, originalIndex, column.key)}
                                class="absolute inset-0 w-full h-full px-1.5 outline-none"
                                style={{
                                  "background-color": "var(--grid-input-bg)",
                                  color: "var(--grid-cell-text)",
                                  "font-size": "12px",
                                  border: "2px solid var(--grid-resize-active)",
                                  "border-radius": "2px",
                                }}
                              />
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                    <div class="flex-1 min-h-[30px]" style={{ "border-right": "none" }} />
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}
