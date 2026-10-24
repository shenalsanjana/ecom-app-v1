import { absoluteUrl } from "@/app/_lib/absolute-url";
import { customDesignSummary, type CustomDesignItem } from "@/app/_lib/custom-design";
import { CustomDesignNotice } from "./custom-design-notice";

export function CustomOrderDesign({ items, orderNumber }: { items: CustomDesignItem[]; orderNumber: string }) {
  const { customized, pending } = customDesignSummary(items);
  return <CustomDesignNotice orderNumber={orderNumber} received={customized.length > 0 && pending.length === 0}
    products={(pending.length ? pending : customized).map(item => ({ name: item.name, ...(item.productId ? { url: absoluteUrl(`/products/${item.productId}`) } : {}) }))} />;
}
