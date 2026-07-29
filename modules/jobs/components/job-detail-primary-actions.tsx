"use client"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu"
import { Button } from "@/shared/ui/button"
import { MoreHorizontal } from "lucide-react"

interface JobDetailPrimaryActionsProps {
  isCancelled: boolean
  isAdmin: boolean
  canAddRevision: boolean
  canExportCat2: boolean
  hasDesigner: boolean
  cat2Exporting: boolean
  onAssign: () => void
  onCreateQuote: () => void
  onEdit: () => void
  onAddRevision: () => void
  onAttachQuote: () => void
  onCat2Export: () => void
  onEditDrawingNumber: () => void
  onDelete: () => void
}

export function JobDetailPrimaryActions({
  isCancelled,
  isAdmin,
  canAddRevision,
  canExportCat2,
  hasDesigner,
  cat2Exporting,
  onAssign,
  onCreateQuote,
  onEdit,
  onAddRevision,
  onAttachQuote,
  onCat2Export,
  onEditDrawingNumber,
  onDelete,
}: JobDetailPrimaryActionsProps) {
  if (isCancelled) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={hasDesigner ? "outline" : "primary"} size="sm" onClick={onAssign}>
        {hasDesigner ? "Change designer" : "Assign designer"}
      </Button>
      <Button variant="outline" size="sm" onClick={onCreateQuote}>
        Create quote
      </Button>
      {canAddRevision && (
        <Button variant="outline" size="sm" onClick={onAddRevision}>
          Add revision
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={onEdit}>
        Edit job
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
            More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={onAttachQuote}>Attach existing quote</DropdownMenuItem>
          {canExportCat2 && (
            <DropdownMenuItem onSelect={onCat2Export} disabled={cat2Exporting}>
              Export CAT II check sheet
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem onSelect={onEditDrawingNumber}>
              Edit drawing number
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={onDelete}>
                Cancel job
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
