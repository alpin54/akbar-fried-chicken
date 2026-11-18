"use client";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CartIcon } from "@/icons";
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
  const [cartOpen, setCartOpen] = useState(false);
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
  const itemCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
    [cart],
  );
  const change = received != null ? received - total : 0;
  const canPay =
    cart.length > 0 && received != null && received >= total && !submitting;

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeCartOnDesktop = (event: MediaQueryList | MediaQueryListEvent) => {
      if (event.matches) setCartOpen(false);
    };

    closeCartOnDesktop(desktop);
    desktop.addEventListener("change", closeCartOnDesktop);
    return () => desktop.removeEventListener("change", closeCartOnDesktop);
  }, []);

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
      setCartOpen(false);
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

  const updateReceived = (value: number | null) => {
    resetKey();
    setReceived(value);
  };

  if (saved) return <Receipt sale={saved} onNew={newSale} />;

  return (
    <div className="grid gap-4 pb-28 lg:grid-cols-[1fr_420px] lg:pb-0">
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

      <aside className="hidden h-fit lg:sticky lg:top-24 lg:block">
        <CartPanel
          cart={cart}
          total={total}
          received={received}
          change={change}
          canPay={canPay}
          submitting={submitting}
          error={error}
          inputId="received-desktop"
          onChangeQty={changeQty}
          onRemoveLine={removeLine}
          onReceivedChange={updateReceived}
          onSetReceived={updateReceived}
          onPay={pay}
        />
      </aside>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[min(92dvh,48rem)] gap-0 overflow-hidden rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <SheetHeader className="shrink-0 border-b border-gray-100 px-4 py-4 pe-12 dark:border-gray-800">
            <SheetTitle>Keranjang</SheetTitle>
            <SheetDescription>
              {itemCount} item dipilih
            </SheetDescription>
          </SheetHeader>
          <CartPanel
            mobile
            cart={cart}
            total={total}
            received={received}
            change={change}
            canPay={canPay}
            submitting={submitting}
            error={error}
            inputId="received-mobile"
            onChangeQty={changeQty}
            onRemoveLine={removeLine}
            onReceivedChange={updateReceived}
            onSetReceived={updateReceived}
            onPay={pay}
          />
        </SheetContent>
      </Sheet>

      <div
        aria-hidden={itemCount === 0}
        inert={itemCount === 0}
        className={`fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 transition-[opacity,transform] duration-300 ease-out lg:hidden ${
          itemCount > 0
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-8 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-theme-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <CartIcon className="size-6" />
              <span className="absolute -end-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-xs font-semibold text-white">
                {itemCount}
              </span>
            </span>
            <div className="min-w-0">
              <p
                aria-live="polite"
                className="text-sm font-semibold text-gray-800 dark:text-white/90"
              >
                {itemCount} item di keranjang
              </p>
              <p className="truncate text-sm text-gray-500">
                {formatRupiah(total)}
              </p>
            </div>
          </div>
          <Button
            size="lg"
            className="min-h-12 shrink-0 px-6"
            onClick={() => setCartOpen(true)}
          >
            Bayar
          </Button>
        </div>
      </div>

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

type CartPanelProps = {
  mobile?: boolean;
  cart: CartLine[];
  total: number;
  received: number | null;
  change: number;
  canPay: boolean;
  submitting: boolean;
  error: string | null;
  inputId: string;
  onChangeQty: (key: string, delta: number) => void;
  onRemoveLine: (key: string) => void;
  onReceivedChange: (value: number | null) => void;
  onSetReceived: (value: number) => void;
  onPay: () => void;
};

function CartPanel({
  mobile = false,
  cart,
  total,
  received,
  change,
  canPay,
  submitting,
  error,
  inputId,
  onChangeQty,
  onRemoveLine,
  onReceivedChange,
  onSetReceived,
  onPay,
}: CartPanelProps) {
  return (
    <div
      className={
        mobile
          ? "flex min-h-0 flex-1 flex-col"
          : "space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
      }
    >
      {!mobile && (
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Keranjang
        </h2>
      )}

      <div
        className={
          mobile
            ? "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4"
            : undefined
        }
      >
        {cart.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">
            Belum ada menu dipilih.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {cart.map((line) => (
              <li key={line.key} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-800 dark:text-white/90">
                    {line.product.name}
                  </p>
                  {line.variant && (
                    <p className="text-xs text-gray-500">
                      Bagian: {PART_LABEL[line.variant]}
                    </p>
                  )}
                  {mobile && (
                    <p className="text-xs text-gray-500">
                      Harga: {formatRupiah(line.product.price)} ×{" "}
                      {line.quantity}
                    </p>
                  )}
                  <p className="text-sm text-gray-500">
                    {mobile && "Subtotal: "}
                    {formatRupiah(line.product.price * line.quantity)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Kurangi ${line.product.name}`}
                    onClick={() => onChangeQty(line.key, -1)}
                  >
                    −
                  </Button>
                  <span className="w-8 text-center font-semibold tabular-nums">
                    {line.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Tambah ${line.product.name}`}
                    onClick={() => onChangeQty(line.key, 1)}
                  >
                    +
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={`Hapus ${line.product.name}`}
                  onClick={() => onRemoveLine(line.key)}
                >
                  <TrashBinIcon className="size-5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className={
          mobile
            ? "shrink-0 space-y-3 border-t border-gray-100 px-4 pb-4 pt-3 dark:border-gray-800"
            : "space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800"
        }
      >
        <Row label="Total" value={formatRupiah(total)} strong />
        <div>
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Uang Diterima
          </label>
          <CurrencyInput
            id={inputId}
            placeholder="Rp0"
            value={received}
            onValueChange={onReceivedChange}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={total === 0}
              onClick={() => onSetReceived(total)}
            >
              Uang Pas
            </Button>
            {[10000, 20000, 50000, 100000].map((amount) => (
              <Button
                key={amount}
                variant="outline"
                size="xs"
                onClick={() => onSetReceived(amount)}
              >
                {formatRupiah(amount)}
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
        <Button size="lg" className="w-full" disabled={!canPay} onClick={onPay}>
          {submitting ? "Menyimpan..." : "Bayar"}
        </Button>
      </div>
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
