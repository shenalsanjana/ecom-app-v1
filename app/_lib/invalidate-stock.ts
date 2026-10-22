import { revalidatePath, revalidateTag } from "next/cache";

export function invalidateStock(): void {
  revalidateTag("catalog", { expire: 0 });
  revalidateTag("promotions", { expire: 0 });
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/feed/meta-catalog.csv");
}
