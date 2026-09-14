// Theme system simplified — single fixed premium dark theme.
// This file is kept for backward compatibility but no longer applies theme switching.

export function initTheme() {
  // Remove any previously stored theme attribute
  document.documentElement.removeAttribute('data-theme')
  localStorage.removeItem('beacon_theme')
}

export function getTheme() { return 'default' }
export function applyTheme() {}
export const THEMES = []
