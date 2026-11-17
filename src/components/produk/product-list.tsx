"use client";

import { Labeled } from "@/components/shared/labeled";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { apiGet, apiSend } from "@/lib/client";
import type { MenuProduct } from "@/lib/domain/sales";
import { formatRupiah } from "@/lib/money";
import { useCallback, useEffect, useState } from "react";

const selectCls = "h-11 w-full rounded-[10px] border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900";

export default function ProductList() {
  const [rows, setRows] = useState<MenuProduct[]>([]);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuProduct | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, c, u] = await Promise.all([
        apiGet<{ products: MenuProduct[] }>("/api/products?all=1"),
        apiGet<{ items: { id: string; name: string }[] }>("/api/master/categories"),
        apiGet<{ items: { name: string }[] }>("/api/master/units"),
      ]);
      setRows(p.products); setCats(c.items); setUnits(u.items.map((x) => x.name)); setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (p: MenuProduct) => {
    const { id, ...rest } = p;
    try { await apiSend(`/api/products/${id}`, { ...rest, active: !p.active }, { method: "PUT" }); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  const columns: Column<MenuProduct>[] = [
    { key: "code", header: "Kode", cell: (r) => r.code || "—" },
    { key: "name", header: "Nama Produk", cell: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
    { key: "cat", header: "Kategori", cell: (r) => cats.find((c) => c.id === r.categoryId)?.name ?? "—" },
    { key: "unit", header: "Satuan", cell: (r) => r.unit || "—" },
    { key: "stock", header: "Stok", cell: (r) => (r.stockItemId ? <Badge color="success" size="sm">Stok sendiri</Badge> : r.usesChicken || r.usesSambal ? <Badge color="primary" size="sm">Kurangi bahan</Badge> : <Badge color="gray" size="sm">Tanpa stok</Badge>) },
    { key: "buy", header: "Harga Beli", align: "right", cell: (r) => (r.buyPrice != null ? formatRupiah(r.buyPrice) : "—") },
    { key: "price", header: "Harga Jual", align: "right", cell: (r) => formatRupiah(r.price), sortValue: (r) => r.price },
    { key: "active", header: "Status", cell: (r) => <Badge color={r.active ? "success" : "gray"} size="sm">{r.active ? "Aktif" : "Nonaktif"}</Badge> },
    { key: "act", header: "", cell: (r) => (
      <div className="flex gap-2">
        <Button size="xs" variant="outline" onClick={() => setEditing(r)}>Ubah</Button>
        <Button size="xs" variant="ghost" onClick={() => toggle(r)}>{r.active ? "Nonaktifkan" : "Aktifkan"}</Button>
      </div>) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Produk</h1>
        <Button size="lg" onClick={() => setEditing("new")}>Tambah Produk</Button>
      </div>
      <Notice kind="info">Perubahan harga hanya berlaku untuk transaksi baru. Transaksi lama tidak berubah.</Notice>
      {flash && <Notice kind="success">{flash}</Notice>}
      <DataTable rows={rows} rowKey={(r) => r.id} columns={columns} loading={loading} error={error}
        emptyText="Belum ada produk." searchText={(r) => `${r.name} ${r.code ?? ""} ${cats.find((c) => c.id === r.categoryId)?.name ?? ""}`} searchPlaceholder="Cari produk..." />
      {editing && (
        <ProductForm product={editing === "new" ? null : editing} cats={cats} units={units} onClose={() => setEditing(null)}
          onDone={(m) => { setEditing(null); setFlash(m); load(); }} />
      )}
    </div>
  );
}

function ProductForm({ product, cats, units, onClose, onDone }: {
  product: MenuProduct | null; cats: { id: string; name: string }[]; units: string[]; onClose: () => void; onDone: (m: string) => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [code, setCode] = useState(product?.code ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? cats[0]?.id ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "");
  const [price, setPrice] = useState<number | null>(product?.price ?? null);
  const [buyPrice, setBuyPrice] = useState<number | null>(product?.buyPrice ?? null);
  const [chicken, setChicken] = useState(product?.usesChicken ?? false);
  const [sambal, setSambal] = useState(product?.usesSambal ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNasi = product?.id === "nasi";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || price == null || !categoryId) { setError("Isi nama produk, kategori, dan harga jual."); return; }
    setBusy(true);
    const data = {
      name, code: code || undefined, categoryId, unit: unit || undefined,
      price, buyPrice: buyPrice ?? undefined, active: product?.active ?? true,
      usesChicken: isNasi ? false : chicken, usesSambal: isNasi ? false : sambal,
    };
    try {
      if (product) await apiSend(`/api/products/${product.id}`, data, { method: "PUT" });
      else await apiSend("/api/products", data);
      onDone(product ? "Produk diperbarui." : "Produk ditambahkan.");
    } catch (err) { setError((err as Error).message); setBusy(false); }
  };

  return (
    <Modal title={product ? "Ubah Produk" : "Tambah Produk"} onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled label="Nama produk"><Input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} /></Labeled>
          <Labeled label="Kode (boleh dikosongkan)"><Input value={code} onChange={(e) => setCode(e.target.value)} /></Labeled>
          <Labeled label="Kategori">
            <select className={selectCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Labeled>
          <Labeled label="Satuan">
            <select className={selectCls} value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">— Pilih —</option>{units.map((u) => <option key={u}>{u}</option>)}
            </select>
          </Labeled>
          <Labeled label="Harga jual"><CurrencyInput placeholder="Rp0" value={price} onValueChange={(v) => { setPrice(v); setError(null); }} /></Labeled>
          <Labeled label="Harga beli (boleh dikosongkan)"><CurrencyInput placeholder="Rp0" value={buyPrice} onValueChange={setBuyPrice} /></Labeled>
        </div>
        {isNasi ? (
          <Notice kind="info">Nasi tidak memakai stok sama sekali.</Notice>
        ) : (
          <fieldset className="space-y-2 rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-800">
            <legend className="px-1 font-medium">Pengurangan bahan saat dijual</legend>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-4" checked={chicken} onChange={(e) => setChicken(e.target.checked)} />
              <span>Memakai ayam (kasir memilih bagian: Dada, Sayap, Paha Atas, Paha Bawah)</span></label>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-4" checked={sambal} onChange={(e) => setSambal(e.target.checked)} />
              <span>Memakai sambal (takaran diatur di Pengaturan Resep)</span></label>
            <p className="text-gray-500">Kosongkan keduanya bila produk tidak memakai stok.</p>
          </fieldset>
        )}
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex gap-3">
          <Button type="submit" size="lg" disabled={busy}>{busy ? "Menyimpan..." : "Simpan"}</Button>
          <Button type="button" size="lg" variant="outline" onClick={onClose}>Batal</Button>
        </div>
      </form>
    </Modal>
  );
}
