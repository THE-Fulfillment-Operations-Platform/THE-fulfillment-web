/**
 * Shared open/close state for the mobile sidebar drawer. Used by the layout
 * (backdrop + off-canvas panel), the header (hamburger) and the sidebar (nav
 * links close it on navigate). Uses Nuxt useState so a single source of truth is
 * shared across components without prop drilling.
 */
export function useSidebar() {
  const open = useState<boolean>('sidebar-open', () => false)
  return {
    open,
    toggle: () => (open.value = !open.value),
    close: () => (open.value = false),
  }
}
