/**
 * Stitch ORYX OS shell — Desktop Command Centre palette
 * (light sidebar + light canvas, black active nav).
 */
export const STITCH_COLORS = {
  /** Light sidebar panel (surface-container) */
  sidebar: "#eeeef0",
  sidebarActive: "#000000",
  sidebarBorder: "#cfc4c5",
  sidebarText: "#1a1c1d",
  sidebarTextMuted: "#4c4546",
  sidebarHover: "#e1dfdf",
  /** Light main canvas */
  surface: "#f9f9fb",
  background: "#f9f9fb",
  surfaceBright: "#f9f9fb",
  surfaceContainerLow: "#f3f3f5",
  outlineVariant: "#cfc4c5",
  onSurface: "#1a1c1d",
  onSurfaceVariant: "#4c4546",
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
