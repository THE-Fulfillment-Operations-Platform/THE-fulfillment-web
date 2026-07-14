// ---------------------------------------------------------------------------
// Centralised runtime-error reporting.
//
// A single funnel that the Vue error handler, window.onerror and
// unhandledrejection all feed into (wired in plugins/error-handler.client.ts).
// It keeps a small in-memory ring buffer for on-the-spot diagnostics and fans
// each error out to registered "sinks".
//
// The default sink logs to the console. To ship errors to a real backend
// (Sentry, a /api/client-errors endpoint, LogRocket…) register a sink at app
// start — no other code needs to change:
//
//   registerErrorSink((e) => Sentry.captureException(e.error ?? new Error(e.message)))
// ---------------------------------------------------------------------------

export type ErrorSource = 'vue' | 'window' | 'unhandledrejection' | 'manual'

export interface ReportedError {
  message: string
  source: ErrorSource
  stack?: string
  /** Extra breadcrumbs (component name, route, http info…) when available. */
  context?: Record<string, unknown>
  /** The original thrown value, for sinks that want the full object. */
  error?: unknown
  at: string
}

type ErrorSink = (err: ReportedError) => void

const sinks: ErrorSink[] = []
const buffer: ReportedError[] = []
const BUFFER_LIMIT = 50

// Guards against a sink that itself throws re-entering window.onerror and
// spiralling into an infinite report loop.
let reporting = false

/** Register a destination for reported errors. Returns an unregister fn. */
export function registerErrorSink(sink: ErrorSink): () => void {
  sinks.push(sink)
  return () => {
    const i = sinks.indexOf(sink)
    if (i >= 0) sinks.splice(i, 1)
  }
}

/** The most recent errors (newest last), for an in-app diagnostics view. */
export function getRecentErrors(): readonly ReportedError[] {
  return buffer
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

export function reportError(
  err: unknown,
  source: ErrorSource = 'manual',
  context?: Record<string, unknown>,
): void {
  if (reporting) return
  reporting = true
  try {
    const entry: ReportedError = {
      message: messageOf(err),
      source,
      stack: err instanceof Error ? err.stack : undefined,
      context,
      error: err,
      at: new Date().toISOString(),
    }
    buffer.push(entry)
    if (buffer.length > BUFFER_LIMIT) buffer.shift()
    for (const sink of sinks) {
      try {
        sink(entry)
      } catch {
        // A misbehaving sink must never break error handling.
      }
    }
  } finally {
    reporting = false
  }
}

/** Default sink: structured console output. Registered by the plugin. */
export function consoleErrorSink(entry: ReportedError): void {
  // eslint-disable-next-line no-console
  console.error(`[app-error:${entry.source}]`, entry.message, entry.context ?? '', entry.error ?? '')
}
