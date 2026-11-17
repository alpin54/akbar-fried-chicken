"use client";

import type React from "react";
import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

type ThemeMode = "light" | "dark" | "auto";
type ResolvedTheme = "light" | "dark";

type ThemeContextType = {
  theme: ResolvedTheme; // Resolved theme actually active ("light" or "dark")
  themeMode: ThemeMode; // The configured preference ("light", "dark", or "auto")
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// --- Preferensi tema disimpan di localStorage (sumber di luar React) ---
const MODE_KEY = "theme-mode";
const LEGACY_KEY = "theme";
const modeListeners = new Set<() => void>();

function readMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(MODE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    return saved === "light" || saved === "dark" || saved === "auto" ? saved : "light";
  } catch {
    return "light";
  }
}

function subscribeMode(onChange: () => void) {
  modeListeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === MODE_KEY || e.key === LEGACY_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    modeListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function writeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // penyimpanan tidak tersedia: pilihan hanya berlaku selama halaman terbuka
  }
  modeListeners.forEach((l) => l());
}

// --- Preferensi sistem (prefers-color-scheme) ---
const DARK_QUERY = "(prefers-color-scheme: dark)";
function subscribeSystem(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getSystemDark = () => window.matchMedia(DARK_QUERY).matches;

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const themeMode = useSyncExternalStore<ThemeMode>(subscribeMode, readMode, () => "light");
  const systemDark = useSyncExternalStore(subscribeSystem, getSystemDark, () => false);

  // Tema yang aktif diturunkan saat render, tanpa state tambahan.
  const theme: ResolvedTheme =
    themeMode === "auto" ? (systemDark ? "dark" : "light") : themeMode;

  // Effect hanya menyinkronkan ke luar React (DOM dan localStorage).
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, themeMode);
      localStorage.setItem(LEGACY_KEY, theme);
    } catch {
      // abaikan bila penyimpanan tidak tersedia
    }
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.setAttribute("data-color-scheme", theme);
  }, [themeMode, theme]);

  const setThemeMode = (mode: ThemeMode) => writeMode(mode);
  const toggleTheme = () => writeMode(theme === "light" ? "dark" : "light");

  return (
    <ThemeContext.Provider
      value={{ theme, themeMode, setThemeMode, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
