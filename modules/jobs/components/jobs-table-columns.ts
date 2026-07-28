export const LIMIT = 25

// Column visibility by breakpoint — mirrors the required mobile priority
// order (Drawing No. → Address → Completion Status → Type of Works →
// Client). Drawing No./Address/Completion Status have no hidden-* class
// below, since they must always be visible. Requested By, Quotation, and
// Designer are the least critical on a narrow screen, so they appear latest.
export const COL_TYPE_OF_WORKS = "hidden sm:table-cell"
export const COL_CLIENT        = "hidden sm:table-cell"
export const COL_REQUESTED_BY  = "hidden md:table-cell"
export const COL_QUOTATION     = "hidden lg:table-cell"
export const COL_DESIGNER      = "hidden lg:table-cell"
