/**
 * Stitch ORYX OS shell — surface hierarchy palette.
 * Sidebar tokens flip with light/dark in `app/globals.css`.
 */
export const STITCH_COLORS = {
  /** Navigation surface — light default; dark overrides in CSS */
  sidebar: "#F7F8FA",
  sidebarActive: "#000000",
  sidebarActiveText: "#ffffff",
  sidebarBorder: "#D9DEE5",
  sidebarText: "#1a1c1d",
  sidebarTextMuted: "#6B7280",
  sidebarHover: "#EEF0F3",
  /** Cool light-grey application canvas */
  surface: "#F3F4F6",
  background: "#F3F4F6",
  surfaceBright: "#FFFFFF",
  surfaceContainerLow: "#F1F3F5",
  nestedSurface: "#FAFAFB",
  hoverSurface: "#F7F8FA",
  selectedSurface: "#EEF4FF",
  outlineVariant: "#D9DEE5",
  borderSubtle: "#E5E7EB",
  borderStrong: "#CBD1D9",
  onSurface: "#111827",
  onSurfaceVariant: "#6B7280",
  primary: "#000000",
  error: "#ba1a1a",
  errorContainer: "#ffdad6",
  onErrorContainer: "#93000a",
} as const

export const STITCH_SIDEBAR_W = 256
export const STITCH_SIDEBAR_COLLAPSED_W = 72
export const STITCH_TOP_BAR_H = 64

export const STITCH_SIDEBAR_BG = STITCH_COLORS.sidebar
export const STITCH_SIDEBAR_BORDER = STITCH_COLORS.sidebarBorder
export const STITCH_NAV_TEXT = STITCH_COLORS.sidebarText
export const STITCH_NAV_TEXT_MUTED = STITCH_COLORS.sidebarTextMuted
export const STITCH_NAV_HOVER_BG = STITCH_COLORS.sidebarHover
export const STITCH_NAV_ACTIVE_BG = STITCH_COLORS.sidebarActive
export const STITCH_CANVAS_BG = STITCH_COLORS.background

export const APP_SIDEBAR_W = STITCH_SIDEBAR_W
export const APP_TOP_BAR_H = STITCH_TOP_BAR_H
