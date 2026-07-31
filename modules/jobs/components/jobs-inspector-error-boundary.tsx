"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { reportClientError } from "@/shared/client-error-report"

interface Props {
  children: ReactNode
  projectLabel?: string
}

interface State {
  error: Error | null
}

/**
 * Keep the Jobs Register usable if the inspector throws on a specific project.
 * Route-level error.tsx takes over the whole page otherwise (Back to jobs loop).
 */
export class JobsInspectorErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[jobs.inspector]", error, info.componentStack)
    reportClientError({ tag: "jobs.inspector", error })
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.projectLabel !== this.props.projectLabel && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <aside className="flex h-full min-h-0 w-full flex-col bg-jobs-panel p-7">
          <h3 className="text-base font-bold text-t1">Inspector failed to load</h3>
          <p className="mt-2 text-sm text-t3">
            The register is still available. Try another project, or open the full workspace.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg border border-jobs-panel-bd bg-jobs-panel-hover p-3 text-left text-xs text-dn whitespace-pre-wrap">
            {this.state.error.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            className="mt-4 rounded-xl border border-jobs-panel-bd px-3 py-2 text-sm font-medium text-t1 transition-colors duration-150 hover:bg-jobs-panel-hover"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </aside>
      )
    }
    return this.props.children
  }
}
