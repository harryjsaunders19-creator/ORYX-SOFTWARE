/** Client-safe exports — no server DB/service imports. */
export type {
  SearchEntityType,
  SearchHit,
  SearchGroup,
  GlobalSearchResult,
  GlobalSearchOptions,
} from "./types"

export { highlightParts, scoreField, bestScore } from "./rank"
export { CommandPalette } from "./components/command-palette"
