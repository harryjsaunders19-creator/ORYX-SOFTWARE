import {
  STITCH_SIDEBAR_W,
  STITCH_TOP_BAR_H,
  STITCH_SIDEBAR_BG,
  STITCH_SIDEBAR_BORDER,
  STITCH_CANVAS_BG,
} from "@/lib/stitch-layout"

/** Shown while session resolves — ORYX OS shell. */
export function AppShellSkeleton() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: STITCH_CANVAS_BG }}>
      <aside
        className="stitch-sidebar fixed inset-y-0 left-0 flex flex-col py-4 px-4"
        style={{
          width: STITCH_SIDEBAR_W,
          backgroundColor: STITCH_SIDEBAR_BG,
          borderRight: `2px solid ${STITCH_SIDEBAR_BORDER}`,
        }}
      >
        <div className="mb-6 space-y-2 px-2">
          <div className="skeleton h-10 w-full max-w-[160px] rounded bg-white/10" />
          <div className="skeleton h-3 w-24 rounded bg-white/10" />
        </div>
        <div className="flex-1 space-y-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton h-11 rounded bg-white/10" />
          ))}
        </div>
      </aside>
      <header
        className="stitch-top-bar fixed top-0 right-0 flex items-center gap-4 px-6"
        style={{
          left: STITCH_SIDEBAR_W,
          height: STITCH_TOP_BAR_H,
          backgroundColor: STITCH_CANVAS_BG,
          borderBottom: "1px solid #c6c6cd",
        }}
      >
        <div className="skeleton h-5 w-28 rounded" />
        <div className="skeleton hidden h-5 w-48 rounded sm:block" />
        <div className="skeleton ml-auto hidden h-9 w-56 rounded md:block" />
        <div className="skeleton h-8 w-8 rounded-full" />
      </header>
      <main
        className="min-h-screen px-8 py-8"
        style={{
          marginLeft: STITCH_SIDEBAR_W,
          paddingTop: STITCH_TOP_BAR_H,
          backgroundColor: STITCH_CANVAS_BG,
        }}
      >
        <div className="skeleton mb-2 h-8 w-48 rounded" />
        <div className="skeleton mb-8 h-4 w-64 rounded" />
        <div className="skeleton h-64 rounded-xl border border-bd" />
      </main>
    </div>
  )
}

export { AppShellSkeleton as StitchAppShellSkeleton }
