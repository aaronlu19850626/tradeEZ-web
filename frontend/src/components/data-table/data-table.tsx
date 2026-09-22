"use client";

import { useEffect, useState } from "react";

import type { RowSelectionState } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table/flex-render";
import { getCoreRowModel, type LegacyColumnDef, useLegacyTable } from "@tanstack/react-table/legacy";
import { cn } from "cn";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DataTableRow = Record<string, unknown> | unknown[];

export type DataTableColumn<TData extends object> = LegacyColumnDef<TData, unknown>;

export function DataTable<TData extends object>({
  columns,
  data,
  className,
  tableClassName,
  containerClassName,
  headerClassName,
  headerRowClassName,
  rowClassName,
  cellClassName,
  emptyMessage = "暂无数据",
  getRowId,
  enableRowSelection = false,
  selectionResetKey,
  onSelectionChange,
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  className?: string;
  tableClassName?: string;
  containerClassName?: string;
  headerClassName?: string;
  headerRowClassName?: string;
  rowClassName?: string;
  cellClassName?: string;
  emptyMessage?: string;
  getRowId?: (row: TData, index: number) => string;
  enableRowSelection?: boolean;
  selectionResetKey?: string | number;
  onSelectionChange?: (rowIds: string[]) => void;
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  useEffect(() => {
    void selectionResetKey;
    setRowSelection({});
  }, [selectionResetKey]);
  useEffect(() => {
    onSelectionChange?.(Object.keys(rowSelection).filter((rowId) => rowSelection[rowId]));
  }, [onSelectionChange, rowSelection]);

  const table = useLegacyTable({
    data: data as DataTableRow[],
    columns: columns as unknown as DataTableColumn<DataTableRow>[],
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId as unknown as ((row: DataTableRow, index: number) => string) | undefined,
    enableRowSelection,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
  });

  return (
    <div className={cn("overflow-hidden rounded-md border border-border/70", className)}>
      <Table className={tableClassName} containerClassName={containerClassName}>
        <colgroup>
          {table.getAllLeafColumns().map((column) => (
            <col key={column.id} style={{ width: column.getSize() === 150 ? undefined : column.getSize() }} />
          ))}
        </colgroup>
        <TableHeader className={headerClassName}>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className={cn("border-b bg-muted/50 hover:bg-muted/50", headerRowClassName)}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  aria-sort={
                    header.column.getIsSorted() === "asc"
                      ? "ascending"
                      : header.column.getIsSorted() === "desc"
                        ? "descending"
                        : undefined
                  }
                  className={cn(
                    "h-9 font-bold",
                    (header.column.columnDef.meta as { className?: string } | undefined)?.className,
                  )}
                  style={{ width: header.getSize() === 150 ? undefined : header.getSize() }}
                >
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className={cn("border-b border-border last:border-b-0", rowClassName)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      "py-2",
                      cellClassName,
                      (cell.column.columnDef.meta as { className?: string } | undefined)?.className,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
