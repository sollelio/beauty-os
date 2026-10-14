import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// The full suite runs the route-level screens in parallel workers; under that load a screen can take longer than the
// 1s default to appear. 3s keeps the async queries stable without hiding real failures (they still fail, later).
// Follow-up (test infrastructure): accepted for UX slice 7 as a global setting; revisit with per-test waits or a
// lighter render harness instead of a suite-wide timeout.
configure({ asyncUtilTimeout: 3000 })

afterEach(() => cleanup())
