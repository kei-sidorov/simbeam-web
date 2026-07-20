import type { KV } from "../protocol/identity";

/**
 * Theme preference. `auto` follows the OS `prefers-color-scheme`; `light`/`dark`
 * pin it. The concrete theme actually painted (`resolveTheme`) is written to
 * `<html data-theme>`, which every token in style.css keys off.
 */
export type ThemePref = "auto" | "light" | "dark";

const THEME_KEY = "simbeam_theme";

export function loadThemePref(kv: KV): ThemePref {
  const v = kv.get(THEME_KEY);
  return v === "light" || v === "dark" || v === "auto" ? v : "auto";
}

export function saveThemePref(kv: KV, pref: ThemePref): void {
  kv.set(THEME_KEY, pref);
}

/** The next preference in the auto → light → dark → auto cycle. */
export function nextThemePref(pref: ThemePref): ThemePref {
  return pref === "auto" ? "light" : pref === "light" ? "dark" : "auto";
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Resolve a preference to the concrete theme shown right now. */
export function resolveTheme(pref: ThemePref): "light" | "dark" {
  return pref === "auto" ? (systemPrefersDark() ? "dark" : "light") : pref;
}

/** Paint the resolved theme onto <html> and keep the color-scheme meta in sync. */
export function applyTheme(pref: ThemePref): void {
  const t = resolveTheme(pref);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", t);
}

/** Notify on OS scheme changes (only visible while the preference is `auto`). */
export function watchSystemTheme(cb: () => void): void {
  if (typeof matchMedia !== "function") return;
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", cb);
}
