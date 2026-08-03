/**
 * ORYX OS Inspector design system — reuse across Jobs, Clients, Quotes, etc.
 *
 * Surface: InspectorShell (s2) · Content: InfoCard / RevisionCard
 * Structure: InspectorPanel · InspectorBody · InspectorSection · AccordionSection
 * Data: PropertyGrid · StatusBadge · ActionToolbar · EmptyState
 */
export { inspectorTokens, inspectorType } from "./tokens"
export { InfoCard, InformationCard, infoCardClassName, informationCardClassName } from "./info-card"
export { PropertyGrid, PropertyCell } from "./property-grid"
export {
  InspectorSectionHeader,
  InspectorSection,
  AccordionSection,
} from "./section"
export { EmptyState, EmptyStateCard } from "./empty-state"
export { RevisionCard, RevisionCardShell } from "./revision-card"
export {
  ActionToolbar,
  inspectorActionPrimaryClass,
  inspectorActionSecondaryClass,
} from "./action-toolbar"
export { StatusBadge, StatusBadgeRow } from "./status-badge"
export { InspectorPanel, InspectorBody, InspectorShell, inspectorShellClassName } from "./panel"
