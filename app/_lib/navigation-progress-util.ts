// Pure decision: should the global progress bar start for this click target?
// `currentPath` is window.location.pathname; `currentSearch` is location.search.
export function shouldStartProgress(
  currentPath: string,
  href: string | null | undefined,
  currentSearch: string,
): boolean {
  if (!href) return false;
  // External, protocol, and in-page anchors never trigger client navigation.
  if (/^(https?:)?\/\//i.test(href)) return false;
  if (/^(mailto:|tel:|sms:|#)/i.test(href)) return false;
  if (!href.startsWith("/")) return false;
  // Strip any in-page hash: a "/path#section" click while already on "/path"
  // does not change pathname or search, so the bar would never complete.
  const hrefNoHash = href.split("#")[0];
  if (hrefNoHash === "") return false;
  // Compare destination (path + query) against the current location.
  const current = `${currentPath}${currentSearch}`;
  return hrefNoHash !== current && hrefNoHash !== currentPath;
}
