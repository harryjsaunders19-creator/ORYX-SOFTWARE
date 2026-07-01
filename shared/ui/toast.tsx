"use client"
import * as React from "react"
import { cn } from "@/shared/utils"
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react"

type Variant = "success" | "error" | "info"
interface ToastItem { id: string; message: string; variant: Variant }

const Ctx = React.createContext<{ toast: (msg: string, v?: Variant) => void }>({ toast: () => {} })
export const useToast = () => React.useContext(Ctx)

const VARIANT_STYLES: Record<Variant, React.CSSProperties> = {
  success: { border: "1px solid var(--color-ok-bd)", color: "var(--color-ok-tx)" },
  error:   { border: "1px solid var(--color-dn-bd)", color: "var(--color-dn-tx)" },
  info:    { border: "1px solid var(--color-bd)", color: "var(--color-t1)" },
}

const ICON_COLORS: Record<Variant, string> = {
  success: "var(--color-ok-ic)",
  error:   "var(--color-dn)",
  info:    "var(--color-ac)",
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])

  const toast = React.useCallback((message: string, variant: Variant = "info") => {
    const id = Math.random().toString(36).slice(2)
    setItems(p => [...p.slice(-3), { id, message, variant }])
    setTimeout(() => setItems(p => p.filter(t => t.id !== id)), 4000)
  }, [])

  const dismiss = React.useCallback((id: string) => setItems(p => p.filter(t => t.id !== id)), [])

  const ctxValue = React.useMemo(() => ({ toast }), [toast])

  return (
    <Ctx.Provider value={ctxValue}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
        style={{ position: "fixed", bottom: "16px", right: "16px", zIndex: 200, display: "flex", flexDirection: "column", gap: "8px", pointerEvents: "none" }}
      >
        {items.map(t => (
          <div
            key={t.id}
            role="alert"
            className={cn(
              "pointer-events-auto flex items-center gap-2.5",
              "min-w-[260px] max-w-sm rounded-xl border px-[18px] py-[14px]",
              "bg-sr shadow-card text-sm font-medium",
              t.variant === "success" && "border-ok-bd text-ok-tx",
              t.variant === "error"   && "border-dn-bd text-dn-tx",
              t.variant === "info"    && "border-bd text-t1",
            )}
            style={{
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              minWidth: "260px",
              maxWidth: "400px",
              borderRadius: "14px",
              padding: "14px 18px",
              backgroundColor: "var(--color-sr)",
              boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.03), 0 8px 24px -8px rgb(0 0 0 / 0.08)",
              fontSize: "14px",
              fontWeight: 500,
              ...VARIANT_STYLES[t.variant],
            }}
          >
            {t.variant === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: ICON_COLORS.success, flexShrink: 0 }} />}
            {t.variant === "error"   && <AlertCircle  className="h-4 w-4 shrink-0" style={{ color: ICON_COLORS.error,   flexShrink: 0 }} />}
            {t.variant === "info"    && <Info         className="h-4 w-4 shrink-0" style={{ color: ICON_COLORS.info,    flexShrink: 0 }} />}
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-t4 hover:text-t2"
              style={{ flexShrink: 0, color: "var(--color-t4)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" style={{ width: "14px", height: "14px" }} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
