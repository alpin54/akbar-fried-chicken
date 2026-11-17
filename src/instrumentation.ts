// Dijalankan Next.js sekali saat server start (bukan lewat browser).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootstrap } = await import("@/lib/bootstrap");
  await bootstrap();
}
