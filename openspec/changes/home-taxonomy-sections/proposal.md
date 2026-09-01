## Why

The Department → Design taxonomy landed at `8ed2952`, but the home page never learned about it: `app/_components/home/category-strip.tsx` still lists every **design** under the heading "Shop by category" and links to flat `/categories/{slug}` paths that now only resolve through a 308. Departments appear nowhere on the home page, and the two derived rules the foundation shipped for exactly this purpose — `showsNavDropdown` and `showsInDesignSection` — have no home-page caller.

## What Changes

- Replace the design strip with **department cards** under "Shop by category", filtered by `showsNavDropdown` so no tile links to a department holding no designs.
- Add a **"Shop by design"** section: one group per department passing `showsInDesignSection`, each group labelled by department name and sub-category, with designs linking to their nested paths.
- Both sections **self-hide below a threshold** — cards at fewer than 2 linked departments, the grid at 0 qualifying departments — so the page stays honest on production, which has four departments but only two designs.
- Home links are built with `designPath`, ending the home page's flat-link 308 hop. The site footer's six category links get the same fix; they render on every page.
- Tints render from the `Design.hex` / `Department.hex` columns instead of the `DESIGN_TINTS` code map. The map stays as the seed's source and the contrast gate's input.
- `app/page.tsx` becomes async and reads `getDepartments()` **once**, passing the rows to both sections, which are pure and synchronous.
- **Removed:** `app/_components/home/category-strip.tsx`.
- No carousel. The source canvas auto-rotates tiles every 3.8s; that is deliberately dropped rather than given a reduced-motion variant.

## Capabilities

### New Capabilities

None. This change adds no capability — it makes two existing ones agree with the shipped taxonomy.

### Modified Capabilities

- `storefront-home`: the pinned home section order gains "Shop by design" after "Shop by category", and both taxonomy sections gain conditional-render requirements tied to how much of the catalog exists.
- `storefront-taxonomy`: home and footer taxonomy links are required to be derived via `designPath`, never written flat.

## Impact

**Code**
- `app/page.tsx` — becomes an async Server Component; section order changes
- `app/_components/home/category-strip.tsx` — deleted
- `app/_components/home/department-cards.tsx`, `design-grid.tsx` — new
- `app/_components/ui/tint-tile.tsx` — new, shared by both sections
- `app/_components/home/site-footer.tsx` — reads `getDepartments()` instead of `getDesigns()`

**Data and APIs** — none. No schema change, no migration, no new query: `getDepartments()` already returns departments with their designs, cached at 3600s under the `catalog` / `departments` tags.

**Behaviour on production** — until the catalog is filled in, the department cards do not render and the design grid shows a single Women group of two. Both sections appear on their own as designs are added; no follow-up deploy is needed.

**Out of scope** — taxonomy follow-ups C (header mega-menu), D (browse filter tree) and E (PDP and card breadcrumbs) are untouched and remain independent.
