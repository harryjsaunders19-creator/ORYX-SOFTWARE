"use client"

import { useEffect } from "react"

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (el.isContentEditable) return true
  return Boolean(el.closest("[contenteditable='true'], [role='textbox']"))
}

export interface JobsRegisterKeyboardHandlers {
  onFocusSearch: () => void
  onNavigate: (dir: -1 | 1) => void
  onAddRevision: () => void
  onCloseInspector: () => void
  enabled?: boolean
}

/** Register keyboard shortcuts that ignore text inputs. */
export function useJobsRegisterKeyboard({
  onFocusSearch,
  onNavigate,
  onAddRevision,
  onCloseInspector,
  enabled = true,
}: JobsRegisterKeyboardHandlers) {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape") onCloseInspector()
        return
      }

      switch (e.key) {
        case "/":
          e.preventDefault()
          onFocusSearch()
          break
        case "ArrowUp":
          e.preventDefault()
          onNavigate(-1)
          break
        case "ArrowDown":
          e.preventDefault()
          onNavigate(1)
          break
        case "r":
        case "R":
          e.preventDefault()
          onAddRevision()
          break
        case "Escape":
          e.preventDefault()
          onCloseInspector()
          break
        default:
          break
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    enabled,
    onFocusSearch,
    onNavigate,
    onAddRevision,
    onCloseInspector,
  ])
}
