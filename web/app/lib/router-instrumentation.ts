import { useEffect, useRef } from 'react'
import { useFetchers, useLocation, useNavigation } from 'react-router'

type FetcherRun = {
  startedAt: number
  href: string | null
}

const instrumentationEnabled = () =>
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true'

const logEvent = (event: string, payload: Record<string, unknown>) => {
  if (!instrumentationEnabled()) return

  console.info('[router-instrumentation]', {
    event,
    at: new Date().toISOString(),
    ...payload,
  })
}

export const useRouterInstrumentation = () => {
  const location = useLocation()
  const navigation = useNavigation()
  const fetchers = useFetchers()
  const navStartRef = useRef<number | null>(null)
  const navFromRef = useRef<string>('')
  const fetcherRunsRef = useRef<Map<string, FetcherRun>>(new Map())
  const lastNavPendingLogRef = useRef<number>(0)
  const lastFetcherPendingLogByKeyRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const state = navigation.state

    if (state !== 'idle' && navStartRef.current === null) {
      navStartRef.current = performance.now()
      navFromRef.current = `${location.pathname}${location.search}`
      logEvent('navigation_start', {
        from: navFromRef.current,
        to: navigation.location ? `${navigation.location.pathname}${navigation.location.search}` : null,
        state,
        formAction: navigation.formAction ?? null,
        formMethod: navigation.formMethod ?? null,
      })
      return
    }

    if (state === 'idle' && navStartRef.current !== null) {
      const durationMs = Math.round(performance.now() - navStartRef.current)
      logEvent('navigation_end', {
        from: navFromRef.current,
        to: `${location.pathname}${location.search}`,
        durationMs,
      })
      navStartRef.current = null
      navFromRef.current = ''
    }
  }, [location.pathname, location.search, navigation.formAction, navigation.formMethod, navigation.location, navigation.state])

  useEffect(() => {
    if (navigation.state === 'idle') {
      lastNavPendingLogRef.current = 0
      return
    }

    const tick = window.setInterval(() => {
      if (navStartRef.current === null) return
      const elapsedMs = Math.round(performance.now() - navStartRef.current)
      const now = Date.now()
      if (now - lastNavPendingLogRef.current < 2000) return
      lastNavPendingLogRef.current = now
      logEvent('navigation_still_blocked', {
        from: navFromRef.current,
        to: navigation.location ? `${navigation.location.pathname}${navigation.location.search}` : null,
        elapsedMs,
        state: navigation.state,
        activeFetcherCount: fetchers.filter(fetcher => fetcher.state !== 'idle').length,
      })
    }, 1000)

    return () => {
      window.clearInterval(tick)
    }
  }, [fetchers, navigation.location, navigation.state])

  useEffect(() => {
    const activeKeys = new Set<string>()

    for (const fetcher of fetchers) {
      const key = fetcher.key
      activeKeys.add(key)

      if (fetcher.state !== 'idle' && !fetcherRunsRef.current.has(key)) {
        fetcherRunsRef.current.set(key, {
          startedAt: performance.now(),
          href: fetcher.formAction ?? null,
        })
        logEvent('fetcher_start', {
          key,
          state: fetcher.state,
          href: fetcher.formAction ?? null,
          method: fetcher.formMethod ?? null,
          currentUrl: `${location.pathname}${location.search}`,
        })
      }

      if (fetcher.state !== 'idle') {
        const run = fetcherRunsRef.current.get(key)
        if (run) {
          const elapsedMs = Math.round(performance.now() - run.startedAt)
          const lastLogAt = lastFetcherPendingLogByKeyRef.current.get(key) ?? 0
          const now = Date.now()
          if (elapsedMs >= 2000 && now - lastLogAt >= 2000) {
            lastFetcherPendingLogByKeyRef.current.set(key, now)
            logEvent('fetcher_still_blocked', {
              key,
              href: run.href,
              elapsedMs,
              state: fetcher.state,
              currentUrl: `${location.pathname}${location.search}`,
            })
          }
        }
      }

      if (fetcher.state === 'idle' && fetcherRunsRef.current.has(key)) {
        const run = fetcherRunsRef.current.get(key)
        if (!run) continue
        const durationMs = Math.round(performance.now() - run.startedAt)
        logEvent('fetcher_end', {
          key,
          href: run.href,
          durationMs,
          currentUrl: `${location.pathname}${location.search}`,
        })
        fetcherRunsRef.current.delete(key)
        lastFetcherPendingLogByKeyRef.current.delete(key)
      }
    }

    for (const [key] of fetcherRunsRef.current.entries()) {
      if (activeKeys.has(key)) continue
      fetcherRunsRef.current.delete(key)
      lastFetcherPendingLogByKeyRef.current.delete(key)
    }
  }, [fetchers, location.pathname, location.search])
}
