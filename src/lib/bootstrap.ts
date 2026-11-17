import { ensureAdmin } from "@/lib/auth/session";
import { ensureSeed } from "@/lib/store/catalog";

/** Dijalankan di server saat aplikasi start. Tidak pernah melempar error agar aplikasi tetap bisa menyala;
 *  kegagalan dicatat dengan jelas dan dicoba ulang pada permintaan berikutnya. */
export async function bootstrap(): Promise<void> {
  try {
    await ensureSeed();
    await ensureAdmin();
    console.info("[bootstrap] data awal dan akun admin siap");
  } catch (e) {
    console.error("[bootstrap] GAGAL, inisialisasi belum berhasil:", e instanceof Error ? e.message : e);
  }
}
