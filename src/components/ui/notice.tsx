import { cn } from "@/utils";

export function Notice({ kind, children }: { kind: "success" | "error" | "info"; children: React.ReactNode }) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        kind === "success" && "border-green-200 bg-green-50 text-green-700",
        kind === "error" && "border-red-200 bg-red-50 text-red-700",
        kind === "info" && "border-gray-200 bg-gray-50 text-gray-700",
      )}
    >
      {children}
    </div>
  );
}
