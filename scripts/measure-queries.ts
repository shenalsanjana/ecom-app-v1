/**
 * Diagnostic: measure server-side data-fetch latency against the real DB.
 * Temporary — safe to delete after the navigation-perf brainstorm.
 *
 * Reads .env.local for DATABASE_URL, then times the representative queries
 * behind the slow pages (catalog list, search, product detail, admin orders),
 * reporting cold (first hit) vs warm (repeat) latency over several runs.
 *
 *   npx tsx scripts/measure-queries.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

// --- load .env.local into process.env before importing Prisma ---
function loadEnv(file: string) {
  let text = "";
  try {
    text = readFileSync(resolve(process.cwd(), file), "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
loadEnv(".env.local");

// Apply the same conservative pool default the app uses.
function withPool(url: string | undefined) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "2");
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "20");
    return u.toString();
  } catch {
    return url;
  }
}

const prisma = new PrismaClient({
  datasourceUrl: withPool(process.env.DATABASE_URL),
  log: ["error"],
});

function ms(n: number) {
  return `${n.toFixed(0)}ms`;
}

async function time<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = performance.now();
  const value = await fn();
  return { ms: performance.now() - t0, value };
}

/** Run a labelled query: 1 warmup (cold), then `runs` timed (warm). */
async function bench(label: string, fn: () => Promise<unknown>, runs = 3) {
  const cold = await time(fn);
  const warm: number[] = [];
  for (let i = 0; i < runs; i++) {
    const r = await time(fn);
    warm.push(r.ms);
  }
  const avgWarm = warm.reduce((a, b) => a + b, 0) / warm.length;
  const minWarm = Math.min(...warm);
  console.log(
    `${label.padEnd(34)} cold ${ms(cold.ms).padStart(7)}   warm avg ${ms(avgWarm).padStart(7)}  (min ${ms(minWarm)})`,
  );
}

async function attachAggregates(ids: string[]) {
  if (!ids.length) return;
  await prisma.review.groupBy({
    by: ["productId"],
    where: { productId: { in: ids } },
    _avg: { rating: true },
    _count: { _all: true },
  });
}

async function main() {
  console.log(`\nDB host: ${new URL(process.env.DATABASE_URL ?? "postgres://?").host}`);
  console.log("Each line: cold = first call, warm = repeat calls (caching/pool warmed)\n");

  // Pick a real product id for the detail benchmark.
  const sample = await prisma.product.findFirst({ where: { archived: false }, select: { id: true, categorySlug: true } });
  const pid = sample?.id;

  const select = {
    id: true, name: true, price: true, originalPrice: true,
    image: true, categorySlug: true, sizes: true,
  } as const;

  // 1. Categories (currently unstable_cache'd; measuring raw query cost)
  await bench("categories.findMany", () =>
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  );

  // 2. Featured products + aggregates (2 sequential waves)
  await bench("featured (find + groupBy)", async () => {
    const rows = await prisma.product.findMany({
      where: { archived: false, id: { startsWith: "p" } },
      orderBy: { id: "asc" }, take: 8, select,
    });
    await attachAggregates(rows.map((r) => r.id));
  });

  // 3. getProducts() worst case: full catalog, no filter + aggregates  (UNCACHED in app)
  await bench("getProducts (all + groupBy) [uncached]", async () => {
    const rows = await prisma.product.findMany({ where: { archived: false }, select });
    await attachAggregates(rows.map((r) => r.id));
  });

  // 4. searchProducts('shirt') + aggregates  (UNCACHED in app)
  await bench("searchProducts('shirt') [uncached]", async () => {
    const rows = await prisma.product.findMany({
      where: {
        archived: false,
        OR: [{ name: { contains: "shirt" } }, { description: { contains: "shirt" } }],
      },
      take: 20, orderBy: { id: "asc" }, select,
    });
    await attachAggregates(rows.map((r) => r.id));
  });

  // 5. Product detail: findUnique(include) -> Promise.all(aggregate, related) -> groupBy(related)
  if (pid) {
    await bench("getProductDetail (3 waves)", async () => {
      const product = await prisma.product.findUnique({
        where: { id: pid, archived: false },
        include: { category: true, images: { orderBy: { sortOrder: "asc" } } },
      });
      if (!product) return;
      const [, related] = await Promise.all([
        prisma.review.aggregate({ where: { productId: pid }, _avg: { rating: true }, _count: { _all: true } }),
        prisma.product.findMany({
          where: { archived: false, categorySlug: product.categorySlug, id: { not: pid } },
          take: 4, orderBy: { id: "asc" }, select,
        }),
      ]);
      await attachAggregates(related.map((r) => r.id));
    });
  }

  // 6. Admin orders list: findMany(include items) + count  (dynamic, auth-gated -> NOT unstable_cache-able)
  await bench("admin orders list (find + count)", async () => {
    await Promise.all([
      prisma.order.findMany({
        take: 20, orderBy: { createdAt: "desc" },
        include: { items: true },
      }),
      prisma.order.count(),
    ]);
  });

  console.log("");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
