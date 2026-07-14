import { ApiError } from '~/utils/api-error'
import { consoleErrorSink, registerErrorSink, reportError } from '~/utils/error-reporter'

// Wires every runtime-error channel into the central reporter so nothing fails
// silently in production. Swap/extend the sink (see utils/error-reporter.ts) to
// forward to Sentry or a backend endpoint without touching this file.
export default defineNuxtPlugin((nuxtApp) => {
  registerErrorSink(consoleErrorSink)

  // Handled API errors are already surfaced to the user (toast / StateBlock);
  // reporting them here too would just be noise. Everything else is a real bug.
  const isHandled = (err: unknown) => err instanceof ApiError

  // Vue component render/lifecycle/watcher errors.
  nuxtApp.vueApp.config.errorHandler = (err, _instance, info) => {
    if (!isHandled(err)) reportError(err, 'vue', { info })
  }

  // Errors thrown outside Vue's reactivity (event handlers, timers, etc.).
  window.addEventListener('error', (ev) => {
    reportError(ev.error ?? ev.message, 'window', {
      filename: ev.filename,
      line: ev.lineno,
      col: ev.colno,
    })
  })

  // Promise rejections nobody caught (e.g. a fire-and-forget fetch).
  window.addEventListener('unhandledrejection', (ev) => {
    if (!isHandled(ev.reason)) reportError(ev.reason, 'unhandledrejection')
  })
})
