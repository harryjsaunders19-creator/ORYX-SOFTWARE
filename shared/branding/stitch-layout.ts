/**
 * Stitch ORYX OS shell — dark sidebar + light canvas (Stitch export palette).
 */
export const STITCH_COLORS = {
  /** Dark sidebar panel */
  sidebar: "#2e3132",
  sidebarActive: "#373b3b",
  sidebarBorder: "rgba(255, 255, 255, 0.08)",
  sidebarText: "#ffffff",
  sidebarTextMuted: "#a1a1aa",
  sidebarHover: "rgba(255, 255, 255, 0.06)",
  /** Light main canvas */
  surface: "#f8f9fa",
  background: "#f8f9fa",
  surfaceContainerLow: "#f3f4f5",
  outlineVariant: "#c6c6cd",
  onSurface: "#191c1d",
  onSurfaceVariant: "#45464c",
  primary: "#000000",
} as const

export const STITCH_SIDEBAR_W = 256
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

