"use client";

import { useEffect } from "react";

type Props = { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean };

export function Modal({ title, onClose, children, wide }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog" aria-modal="true" aria-label={title}
      className="fixed inset-0 z-99999 flex items-end justify-center overflow-y-auto bg-black/40 p-4 sm:items-center print:static print:bg-transparent print:p-0"
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? "max-w-xl" : "max-w-md"} max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 dark:bg-gray-900`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h2>
        {children}
      </div>
    </div>
  );
}
