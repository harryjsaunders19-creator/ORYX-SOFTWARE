"use client"

interface EventPillProps {
  title: string
  color: string
  time?: string
  onClick?: () => void
}

export function EventPill({ title, color, time, onClick }: EventPillProps) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick?.() }}
      className="w-full text-left rounded px-1.5 py-0.5 text-[11px] font-medium truncate flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer"
      style={{
        backgroundColor: color + "18",
        borderLeft: `3px solid ${color}`,
        color: "var(--color-t1)",
      }}
      title={title}
    >
      {time && <span className="text-[10px] font-normal opacity-70 shrink-0">{time}</span>}
      <span className="truncate">{title}</span>
    </button>
  )
}
