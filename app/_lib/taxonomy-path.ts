/** The canonical path for a design. Never stored — always derived, so moving a
 *  design between departments needs no slug-history rows. */
export function designPath(departmentSlug: string, designSlug: string): string {
  return `/categories/${departmentSlug}/${designSlug}`;
}
