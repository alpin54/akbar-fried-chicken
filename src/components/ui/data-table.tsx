"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/utils";
import { useMemo, useState } from "react";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  align?: "right";
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  toolbar?: React.ReactNode;
  pageSize?: number;
};

export function DataTable<T>({
  columns, rows, rowKey, loading, error, emptyText = "Belum ada data.",
  searchText, searchPlaceholder = "Cari...", toolbar, pageSize = 10,
}: Props<T>) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const view = useMemo(() => {
    let r = rows;
    const needle = q.trim().toLowerCase();
    if (needle && searchText) r = r.filter((x) => searchText(x).toLowerCase().includes(needle));
    const col = sort && columns.find((c) => c.key === sort.key);
    if (sort && col?.sortValue) {
      const sv = col.sortValue;
      r = [...r].sort((a, b) => {
        const x = sv(a), y = sv(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
    }
    return r;
  }, [rows, q, sort, columns, searchText]);

  const pages = Math.max(1, Math.ceil(view.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = view.slice(cur * pageSize, cur * pageSize + pageSize);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {searchText && (
          <div className="w-full sm:w-64">
            <Input
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
            />
          </div>
        )}
        {toolbar}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <Table>
          <TableHeader className="border-b border-gray-100 dark:border-gray-800">
            <TableRow>
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  isHeader
                  className={cn("px-4 py-3 text-xs font-medium whitespace-nowrap text-gray-500 uppercase",
                    c.align === "right" ? "text-right" : "text-start")}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      className="uppercase hover:text-gray-800"
                      onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}
                    >
                      {c.header}{sort?.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                    </button>
                  ) : c.header}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading && (
              <TableRow>
                <TableCell colSpan={columns.length} className="px-4 py-10 text-center text-sm text-gray-500">Memuat data...</TableCell>
              </TableRow>
            )}
            {!loading && error && (
              <TableRow>
                <TableCell colSpan={columns.length} className="px-4 py-10 text-center text-sm text-red-600">{error}</TableCell>
              </TableRow>
            )}
            {!loading && !error && slice.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="px-4 py-10 text-center text-sm text-gray-500">{emptyText}</TableCell>
              </TableRow>
            )}
            {!loading && !error && slice.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn("px-4 py-3 text-sm text-gray-700 dark:text-gray-300", c.align === "right" && "text-right tabular-nums")}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {view.length > pageSize && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Halaman {cur + 1} dari {pages} ({view.length} data)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Sebelumnya</Button>
            <Button variant="outline" size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Berikutnya</Button>
          </div>
        </div>
      )}
    </div>
  );
}
