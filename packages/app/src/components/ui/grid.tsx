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
  selectedCells?: Set<string>;
  onCellSelect?: (cellId: string) => void;
  class?: string;
  offset?: number;
  selectedRowIndices?: number[];
  onRowSelect?: (index: number, event: MouseEvent) => void;
}

const ROW_HEIGHT = 30;
const BUFFER_ROWS = 10;

export function Grid(props: GridProps) {
  const [editingCell, setEditingCell] = createSignal<string | null>(null);
  const [editValue, setEditValue] = createSignal<string>("");
  const [columnWidths, setColumnWidths] = createSignal<Record<string, number>>({});
  const [rowNumberWidth, setRowNumberWidth] = createSignal(50);
  const [resizingColumn, setResizingColumn] = createSignal<string | null>(null);
  const [resizeStartX, setResizeStartX] = createSignal(0);
  const [resizeStartWidth, setResizeStartWidth] = createSignal(0);
  const [sortConfig, setSortConfig] = createSignal<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);

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
    const offset = props.offset || 0;
    const maxRowNumber = props.data.length - 1 + offset;
    const numDigits = String(Math.max(0, maxRowNumber)).length;
    const calculatedWidth = Math.min(Math.max(36, numDigits * 9 + 12), 80);
    setRowNumberWidth(calculatedWidth);
  });

  const handleMouseMove = (e: MouseEvent) => {
    const resCol = resizingColumn();
    if (resCol === "__row_number__") {
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

  const handleCellDoubleClick = (rowIndex: number, colKey: string, value: any) => {
    const column = props.columns.find((col) => col.key === colKey);
    if (column?.editable !== false) {
      setEditingCell(`${rowIndex}-${colKey}`);
      setEditValue(String(value || ""));
      setTimeout(() => inputRef?.focus(), 0);
    }
  };

  const handleCellSave = (rowIndex: number, colKey: string) => {
    if (props.onDataChange && editValue() !== props.data[rowIndex][colKey]) {
      const newData = [...props.data];
      newData[rowIndex] = { ...newData[rowIndex], [colKey]: editValue() };
      props.onDataChange(newData);
    }
    setEditingCell(null);
  };

  const handleKeyDown = (e: KeyboardEvent, rowIndex: number, colKey: string) => {
    if (e.key === "Enter") {
      handleCellSave(rowIndex, colKey);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  const sortedData = createMemo(() => {
    const config = sortConfig();
    if (!config) return props.data;

    return [...props.data].sort((a, b) => {
      const aVal = a[config.key];
      const bVal = b[config.key];

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

  const virtualStore = createMemo(() => {
    const data = sortedData();
    const top = scrollTop();
    const height = viewportHeight();

    const startIndex = Math.max(0, Math.floor(top / ROW_HEIGHT) - BUFFER_ROWS);
    const endIndex = Math.min(data.length, Math.ceil((top + height) / ROW_HEIGHT) + BUFFER_ROWS);

    const visibleRows = data.slice(startIndex, endIndex).map((row, i) => ({
      data: row,
      index: startIndex + i,
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

  const handleContextMenu = (e: MouseEvent, row: any, rowIndex: number) => {
    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();

      // If the right-clicked row is part of the selection, copy all selected rows
      // Otherwise, just copy the single row that was right-clicked
      let rowsToCopy = [row];
      if (props.selectedRowIndices?.includes(rowIndex)) {
        rowsToCopy = props.selectedRowIndices.sort((a, b) => a - b).map((idx) => props.data[idx]);
      }

      import("@tauri-apps/api/core").then(({ invoke }) => {
        invoke("show_grid_context_menu", { rows: rowsToCopy, columns: props.columns });
      });
    }
  };

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

  return (
    <div
      class={`relative flex flex-col min-h-0 h-full ${props.class || ""}`}
      style={{
        "background-color": "var(--grid-bg)",
        "box-shadow": props.class?.includes("shadow-none") ? "none" : "var(--grid-shadow)",
      }}
    >
      <div ref={containerRef} onScroll={handleScroll} class={`flex-1 min-h-0 scrollbar-thin overscroll-behavior-y-contain ${props.data.length === 0 ? "overflow-hidden" : "overflow-auto"}`}>
        <div class="inline-block min-w-full align-middle relative" style={{ height: `${virtualStore().totalHeight + 32}px` }}>
          {/* Header */}
          <div
            class="flex sticky top-0 z-20"
            style={{
              background: "var(--grid-header-bg)",
              "border-bottom": "0.5px solid var(--grid-header-border)",
            }}
          >
            {/* Row number header with resize handle */}
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
                  class="flex-shrink-0 px-1.5 flex items-center relative group select-none cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200"
                  style={{
                    width: `${columnWidths()[column.key] || 150}px`,
                    "min-height": "32px",
                    "border-right": "0.5px solid var(--grid-border)",
                    color: sortConfig()?.key === column.key ? "var(--accent)" : "var(--grid-header-text)",
                    "font-size": "11px",
                    "font-weight": "700",
                    "letter-spacing": "0.03em",
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

          {/* Vertical Offset Wrapper */}
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
                const row = item.data;
                const rowIndex = () => item.index;

                return (
                  <div
                    class="flex transition-colors duration-100"
                    style={{
                      height: `${ROW_HEIGHT}px`,
                      "border-bottom": "0.5px solid var(--grid-border)",
                      "background-color": props.selectedRowIndices?.includes(rowIndex()) ? "var(--grid-row-selected)" : "var(--grid-row-bg)",
                      cursor: "pointer",
                    }}
                    onClick={(e) => {
                      if (!e.shiftKey) {
                        props.onRowSelect?.(rowIndex(), e);
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (!props.selectedRowIndices?.includes(rowIndex())) {
                        e.currentTarget.style.backgroundColor = "var(--grid-row-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!props.selectedRowIndices?.includes(rowIndex())) {
                        e.currentTarget.style.backgroundColor = "var(--grid-row-bg)";
                      }
                    }}
                    onContextMenu={(e) => handleContextMenu(e, row, rowIndex())}
                    onMouseDown={(e) => {
                      if (e.shiftKey) {
                        e.preventDefault();
                        props.onRowSelect?.(rowIndex(), e);
                      }
                      if (e.ctrlKey && e.button === 0) {
                        handleContextMenu(e, row, rowIndex());
                      }
                    }}
                  >
                    {/* Row number */}
                    <div
                      class="flex-shrink-0 flex items-center justify-center select-none"
                      style={{
                        width: `${rowNumberWidth()}px`,
                        height: `${ROW_HEIGHT}px`,
                        "border-right": "0.5px solid var(--grid-border)",
                        color: "var(--grid-cell-secondary)",
                        "font-size": "11px",
                        "font-variant-numeric": "tabular-nums",
                        "font-family": "var(--font-sans)",
                      }}
                    >
                      <span class="truncate px-2">{(props.offset || 0) + rowIndex()}</span>
                    </div>

                    {/* Cells */}
                    <For each={props.columns}>
                      {(column) => {
                        const cellId = () => `${rowIndex()}-${column.key}`;
                        const isEditing = () => editingCell() === cellId();
                        const isSelected = () => props.selectedCells?.has(cellId());
                        const value = () => row[column.key];

                        return (
                          <div
                            class="flex-shrink-0 flex items-center transition-colors duration-100 cursor-cell relative"
                            style={{
                              width: `${columnWidths()[column.key] || 150}px`,
                              height: `${ROW_HEIGHT}px`,
                              "border-right": "0.5px solid var(--grid-border)",
                              "background-color": isSelected() ? "var(--grid-row-selected)" : "transparent",
                              outline: isSelected() ? "2px solid var(--grid-focus-ring)" : "none",
                              "outline-offset": "-1px",
                            }}
                            onClick={(e) => {
                              if (props.onCellSelect) {
                                e.stopPropagation();
                                props.onCellSelect(cellId());
                              }
                            }}
                            onDblClick={() => handleCellDoubleClick(rowIndex(), column.key, value())}
                          >
                            <Show
                              when={isEditing()}
                              fallback={
                                <div
                                  class="px-1.5 w-full truncate"
                                  style={{
                                    color: "var(--grid-cell-text)",
                                    "font-size": "12px",
                                    "text-align": column.align || "left",
                                    "line-height": "1.2",
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
                                onBlur={() => handleCellSave(rowIndex(), column.key)}
                                onKeyDown={(e) => handleKeyDown(e, rowIndex(), column.key)}
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
