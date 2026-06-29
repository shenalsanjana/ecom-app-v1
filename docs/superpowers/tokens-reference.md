# Storefront Design Tokens — Reference

Single source for the cohesion foundation. Primitives in `app/_components/ui/`
encode these; new surfaces reuse the primitives rather than re-deciding values.

## Spacing (Balanced) — 4px ladder (Tailwind defaults)
- Section vertical padding: `py-12 md:py-20` (48px mobile / 80px desktop)
- Grid gap: `gap-6` (24px)
- Section-header → content offset: `mb-10` (40px)
- Container: `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8` (unchanged; kept)

## Type scale (Poppins only)
| Role | Class recipe |
|------|--------------|
| eyebrow | `text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-brand` |
| display (hero h1) | `font-heading text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight` |
| h2 (section) | `font-heading text-2xl font-semibold tracking-tight` |
| h3 (card) | `font-heading text-base font-medium leading-snug` |
| body | `text-[0.9375rem] leading-relaxed` |
| meta | `text-xs text-muted-foreground` |
| price | `font-heading text-base font-semibold` (`text-brand` when on sale) |

## Motion (Restrained) — existing tokens
- Durations: `--duration-fast 150ms`, `--duration-base 200ms`, `--duration-slow 320ms`; ease `--ease-out`.
- Card hover: `translateY(-2px)` + `shadow-card`, `duration-base` (Card primitive already does this).
- Media zoom: `scale-105`, `duration-slow`.
- Press: `active:translate-y-px`.
- Underline link: underline wipes in from left on hover (`TextLink`).
- All transitions gated behind `motion-safe:`.

## Focus ring (one style)
`focus-visible:ring-3 focus-visible:ring-ring/50` (olive), plus `focus-visible:border-ring`
on bordered controls (inputs, buttons). Unbordered controls like `TextLink` apply only the
ring (a border color would be a no-op).
