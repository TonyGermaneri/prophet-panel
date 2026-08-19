import { useSyncExternalStore } from 'react'

import { userGroups } from '../library/userGroups'

/** Re-renders when a user group is created, renamed, deleted, or a bundle is imported. */
export function useUserGroups(): typeof userGroups {
  useSyncExternalStore(
    (fn) => userGroups.subscribe(fn),
    () => userGroups.all,
    () => userGroups.all,
  )
  return userGroups
}
