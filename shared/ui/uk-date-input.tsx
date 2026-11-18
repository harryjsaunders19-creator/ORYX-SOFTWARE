"use client"

import { useState, useEffect } from "react"
import { Input } from "./input"
import { cn } from "@/shared/utils"

/**
 * UK date input (DD/MM/YYYY). Stores and emits ISO YYYY-MM-DD.
 * Avoids the browser's locale-dependent type="date" which shows US format
 * and produces garbled values when typed.
 */
export function UkDateInput({
  value,
  onChange,
  className,
  style,
  id,
  disabled,
  required,
}: {
  value: string          // ISO YYYY-MM-DD or empty
  onChange: (iso: string) => void
  className?: string
  style?: React.CSSProperties
  id?: string
  disabled?: boolean
  required?: boolean
}) {
  const [text, setText] = useState(isoToUk(value))

  useEffect(() => {
    setText(isoToUk(value))
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d]/g, "").slice(0, 8)
    // Auto-insert slashes: DD/MM/YYYY
    if (raw.length > 4) raw = raw.slice(0, 2) + "/" + raw.slice(2, 4) + "/" + raw.slice(4)
    else if (raw.length > 2) raw = raw.slice(0, 2) + "/" + raw.slice(2)
    setText(raw)

    const iso = ukToIso(raw)
    if (iso) onChange(iso)
    else if (raw === "") onChange("")
  }

  const handleBlur = () => {
    // On blur, if partial/invalid, revert to last valid or clear
    const iso = ukToIso(text)
    if (iso) {
      setText(isoToUk(iso))
      onChange(iso)
    } else if (text.trim() === "") {
      onChange("")
    } else {
      setText(isoToUk(value))
    }
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder="DD/MM/YYYY"
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      className={cn(className)}
      style={style}
      disabled={disabled}
      required={required}
      autoComplete="off"
    />
  )
}

function isoToUk(iso: string): string {
  if (!iso || iso.length < 10) return ""
  const [y, m, d] = iso.slice(0, 10).split("-")
  if (!y || !m || !d) return ""
  return `${d}/${m}/${y}`
}

function ukToIso(uk: string): string | null {
  const m = uk.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = m[1].padStart(2, "0")
  const mo = m[2].padStart(2, "0")
  const y = m[3]
  const day = Number(d)
  const month = Number(mo)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  // Basic validity
  const dt = new Date(Number(y), month - 1, day)
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null
  return `${y}-${mo}-${d}`
}
