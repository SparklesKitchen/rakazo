export const workMateAssertionStorageKey = "workmate-rakazo-assertion";

export function saveWorkMateAssertionFromLocation() {
  const assertion = new URLSearchParams(window.location.search).get("handoff")?.trim() ?? "";
  if (!assertion) return sessionStorage.getItem(workMateAssertionStorageKey) ?? "";
  sessionStorage.setItem(workMateAssertionStorageKey, assertion);
  window.history.replaceState({}, "", window.location.pathname);
  return assertion;
}

export function currentWorkMateAssertion() {
  return sessionStorage.getItem(workMateAssertionStorageKey)?.trim() ?? "";
}
