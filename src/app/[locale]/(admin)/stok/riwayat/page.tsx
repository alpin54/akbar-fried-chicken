import MovementList from "@/components/stok/movement-list";
import { Suspense } from "react";
export const metadata = { title: "Riwayat Stok | Fried Chicken Management" };
export default function RiwayatStokPage() {
  return <Suspense fallback={<p className="text-sm text-gray-500">Memuat...</p>}><MovementList /></Suspense>;
}
