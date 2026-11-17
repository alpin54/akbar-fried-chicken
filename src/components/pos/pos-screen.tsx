"use client";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import {
  CHICKEN_PARTS,
  type ChickenPart,
  type MenuProduct,
} from "@/lib/domain/sales";
import { formatRupiah } from "@/lib/money";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TrashBinIcon } from "@/icons";
const PART_LABEL: Record<ChickenPart, string> = {
  dada: "Dada",
  sayap: "Sayap",
  paha_atas: "Paha Atas",
  paha_bawah: "Paha Bawah",
};

type CartLine = {
  key: string;
  product: MenuProduct;
  variant: ChickenPart | null;
  quantity: number;
};

type SavedSale = {
  number: string;
  createdAt: number;
  items: {
    productName: string;
    variant: ChickenPart | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  total: number;
  received: number;
  change: number;
};

export default function PosScreen() {
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [catFilter, setCatFilter] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pickVariantFor, setPickVariantFor] = useState<MenuProduct | null>(
    null,
  );
  const [received, setReceived] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedSale | null>(null);

  // Idempotency key tetap sama untuk percobaan ulang yang identik (klik ganda / jaringan putus),
  // dan dibuat baru setiap keranjang atau uang diterima berubah.
  const keyRef = useRef<string | null>(null);
  const resetKey = () => {
    keyRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/products", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { products: MenuProduct[] };
        if (!cancelled) setProducts(data.products);
        const c = await fetch("/api/master/categories", { cache: "no-store" });
        if (c.ok && !cancelled)
          setCats(
            ((await c.json()) as { items: { id: string; name: string }[] })
              .items,
          );
      } catch {
        if (!cancelled)
          setLoadError("Daftar menu gagal dimuat. Muat ulang halaman.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = useMemo(
    () => cart.reduce((sum, l) => sum + l.product.price * l.quantity, 0),
    [cart],
  );
  const change = received != null ? received - total : 0;
  const canPay =
    cart.length > 0 && received != null && received >= total && !submitting;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!catFilter || p.categoryId === catFilter) &&
        (!q || p.name.toLowerCase().includes(q)),
    );
  }, [products, search, catFilter]);

  const addToCart = useCallback(
    (product: MenuProduct, variant: ChickenPart | null) => {
      resetKey();
      setError(null);
      setCart((prev) => {
        const key = `${product.id}:${variant ?? "-"}`;
        const found = prev.find((l) => l.key === key);
        if (found)
          return prev.map((l) =>
            l.key === key ? { ...l, quantity: l.quantity + 1 } : l,
          );
        return [...prev, { key, product, variant, quantity: 1 }];
      });
    },
    [],
  );

  const onPickProduct = (p: MenuProduct) => {
    if (p.usesChicken) setPickVariantFor(p);
    else addToCart(p, null);
  };

  const changeQty = (key: string, delta: number) => {
    resetKey();
    setCart((prev) =>
      prev
        .map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + delta } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  };
  const removeLine = (key: string) => {
    resetKey();
    setCart((prev) => prev.filter((l) => l.key !== key));
  };

  const pay = async () => {
    if (!canPay || received == null) return;
    keyRef.current ??= crypto.randomUUID();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": keyRef.current,
        },
        body: JSON.stringify({
          items: cart.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
            ...(l.variant ? { variant: l.variant } : {}),
          })),
          received,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        sale?: SavedSale;
        error?: string;
      } | null;
      if (!res.ok || !body?.sale) {
        setError(body?.error ?? "Transaksi gagal disimpan. Coba lagi.");
        return;
      }
      setSaved(body.sale);
      setCart([]);
      setReceived(null);
      resetKey();
    } catch {
      setError(
        "Tidak dapat terhubung ke server. Tekan Bayar lagi, transaksi tidak akan tercatat dua kali.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const newSale = () => {
    setSaved(null);
    setError(null);
  };

  if (saved) return <Receipt sale={saved} onNew={newSale} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      {/* Daftar menu */}
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
          Penjualan Baru
        </h1>
        <Input
          placeholder="Cari menu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Cari menu"
        />
        {cats.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {[{ id: "", name: "Semua" }, ...cats].map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={catFilter === c.id ? "default" : "outline"}
                onClick={() => setCatFilter(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>
        )}
        {loading && <p className="text-sm text-gray-500">Memuat menu...</p>}
        {loadError && (
          <p role="alert" className="text-sm text-red-600">
            {loadError}
          </p>
        )}
        {!loading && !loadError && filtered.length === 0 && (
          <p className="text-sm text-gray-500">Menu tidak ditemukan.</p>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPickProduct(p)}
              className="flex min-h-28 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-theme-xs transition hover:border-brand-300 hover:bg-brand-50 focus-visible:ring-3 focus-visible:ring-brand-500/30 focus-visible:outline-hidden dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-brand-500/10"
            >
              <span className="text-base font-semibold text-gray-800 dark:text-white/90">
                {p.name}
              </span>
              <span className="text-lg font-bold text-brand-500">
                {formatRupiah(p.price)}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Keranjang & pembayaran */}
      <aside className="h-fit space-y-4 rounded-2xl border border-gray-200 bg-white p-4 lg:sticky lg:top-24 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Keranjang
        </h2>

        {cart.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">
            Belum ada menu dipilih.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {cart.map((l) => (
              <li key={l.key} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-800 dark:text-white/90">
                    {l.product.name}
                  </p>
                  {l.variant && (
                    <p className="text-xs text-gray-500">
                      Bagian: {PART_LABEL[l.variant]}
                    </p>
                  )}
                  <p className="text-sm text-gray-500">
                    {formatRupiah(l.product.price * l.quantity)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Kurangi ${l.product.name}`}
                    onClick={() => changeQty(l.key, -1)}
                  >
                    −
                  </Button>
                  <span className="w-8 text-center font-semibold tabular-nums">
                    {l.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Tambah ${l.product.name}`}
                    onClick={() => changeQty(l.key, 1)}
                  >
                    +
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => removeLine(l.key)}
                >
                  <TrashBinIcon className="size-5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
          <Row label="Total" value={formatRupiah(total)} strong />
          <div>
            <label
              htmlFor="received"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Uang Diterima
            </label>
            <CurrencyInput
              id="received"
              placeholder="Rp0"
              value={received}
              onValueChange={(v) => {
                resetKey();
                setReceived(v);
              }}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="xs"
                disabled={total === 0}
                onClick={() => {
                  resetKey();
                  setReceived(total);
                }}
              >
                Uang Pas
              </Button>
              {[20000, 50000, 100000].map((n) => (
                <Button
                  key={n}
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    resetKey();
                    setReceived(n);
                  }}
                >
                  {formatRupiah(n)}
                </Button>
              ))}
            </div>
          </div>
          <Row
            label="Kembalian"
            value={
              received != null && received >= total ? formatRupiah(change) : "—"
            }
          />
          {received != null && received < total && cart.length > 0 && (
            <p className="text-sm text-amber-600">
              Uang diterima masih kurang {formatRupiah(total - received)}.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" disabled={!canPay} onClick={pay}>
            {submitting ? "Menyimpan..." : "Bayar"}
          </Button>
        </div>
      </aside>

      {/* Pilih bagian ayam */}
      {pickVariantFor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Pilih bagian ayam untuk ${pickVariantFor.name}`}
          className="fixed inset-0 z-99999 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setPickVariantFor(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {pickVariantFor.name}
            </h3>
            <p className="mb-4 text-sm text-gray-500">Pilih bagian ayam:</p>
            <div className="grid grid-cols-2 gap-3">
              {CHICKEN_PARTS.map((part) => (
                <button
                  key={part}
                  type="button"
                  className="h-16 rounded-xl border border-gray-200 text-base font-semibold text-gray-800 transition hover:border-brand-400 hover:bg-brand-50 focus-visible:ring-3 focus-visible:ring-brand-500/30 focus-visible:outline-hidden dark:border-gray-700 dark:text-white/90 dark:hover:bg-brand-500/10"
                  onClick={() => {
                    addToCart(pickVariantFor, part);
                    setPickVariantFor(null);
                  }}
                >
                  {PART_LABEL[part]}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() => setPickVariantFor(null)}
            >
              Batal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span
        className={
          strong
            ? "text-2xl font-bold text-gray-900 dark:text-white"
            : "text-lg font-semibold text-gray-800 dark:text-white/90"
        }
      >
        {value}
      </span>
    </div>
  );
}

function Receipt({ sale, onNew }: { sale: SavedSale; onNew: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 print:border-0">
        <p className="mb-1 text-sm font-medium text-green-600">
          Transaksi berhasil disimpan
        </p>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
          {sale.number}
        </h1>
        <p className="mb-4 text-sm text-gray-500">
          {new Date(sale.createdAt).toLocaleString("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {sale.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-3 py-2 text-sm">
              <span className="text-gray-700 dark:text-gray-300">
                {it.quantity} × {it.productName}
                {it.variant ? ` (${PART_LABEL[it.variant]})` : ""}
              </span>
              <span className="font-medium">{formatRupiah(it.subtotal)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-2 border-t border-gray-100 pt-4 dark:border-gray-800">
          <Row label="Total" value={formatRupiah(sale.total)} strong />
          <Row label="Uang Diterima" value={formatRupiah(sale.received)} />
          <Row label="Kembalian" value={formatRupiah(sale.change)} />
        </div>
      </div>
      <div className="flex gap-3 print:hidden">
        <Button size="lg" className="flex-1" onClick={onNew}>
          Penjualan Baru
        </Button>
        <Button size="lg" variant="outline" onClick={() => window.print()}>
          Cetak Struk
        </Button>
      </div>
    </div>
  );
}
