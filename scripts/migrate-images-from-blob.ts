// scripts/migrate-images-from-blob.ts
//
// One-time cutover: downloads every image currently hosted on Vercel Blob
// (Category.image, VariantImage.url — the only two Blob-URL-bearing columns
// in the schema) into the local uploads volume and rewrites the DB rows to
// point at the new /uploads/<file> URL. Run once, after restoring the
// database dump and before pointing DNS at the new server (see
// DEPLOY_OVH.md). Safe to re-run — already-local URLs are skipped.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isBlobUrl, localFilenameFor, BLOB_HOSTNAME_SUFFIX } from "@/app/_lib/blob-migration";
import { prisma } from "@/app/_lib/prisma";

async function downloadToUploads(url: string): Promise<string> {
  const filename = localFilenameFor(url);
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/${filename}`;
}

async function migrateCategories(): Promise<number> {
  const categories = await prisma.category.findMany({
    where: { image: { contains: BLOB_HOSTNAME_SUFFIX } },
  });
  let count = 0;
  for (const category of categories) {
    if (!isBlobUrl(category.image)) continue;
    const newUrl = await downloadToUploads(category.image);
    await prisma.category.update({
      where: { slug: category.slug },
      data: { image: newUrl },
    });
    console.log(`[migrate-images] Category ${category.slug}: ${category.image} -> ${newUrl}`);
    count++;
  }
  return count;
}

async function migrateVariantImages(): Promise<number> {
  const images = await prisma.variantImage.findMany({
    where: { url: { contains: BLOB_HOSTNAME_SUFFIX } },
  });
  let count = 0;
  for (const image of images) {
    if (!isBlobUrl(image.url)) continue;
    const newUrl = await downloadToUploads(image.url);
    await prisma.variantImage.update({
      where: { id: image.id },
      data: { url: newUrl },
    });
    console.log(`[migrate-images] VariantImage ${image.id}: ${image.url} -> ${newUrl}`);
    count++;
  }
  return count;
}

async function main(): Promise<void> {
  const categoryCount = await migrateCategories();
  const variantImageCount = await migrateVariantImages();
  console.log(
    `[migrate-images] Done. Migrated ${categoryCount} categories, ${variantImageCount} variant images.`,
  );
}

main()
  .catch((err) => {
    console.error("[migrate-images] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
