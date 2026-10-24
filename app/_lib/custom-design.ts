export const BUSINESS_WHATSAPP_NUMBER = "94740545536";

export type CustomDesignProduct = { name: string; url?: string };
export type CustomDesignItem = {
  name: string;
  productId?: string | null;
  isCustomizedDesign?: boolean;
  designReceivedAt?: Date | string | null;
};

export function designWhatsAppUrl(products: CustomDesignProduct[], orderNumber?: string): string {
  const intro = orderNumber
    ? `Hello Dressing Bear, I would like to send PNG design files and discuss my customized order ${orderNumber}.`
    : "Hello Dressing Bear, I would like to discuss customization and send my design as a PNG file.";
  const unique = [...new Map(products.map(product => [`${product.name}|${product.url ?? ""}`, product])).values()];
  const details = unique.slice(0, 20).map(product => `${product.name}${product.url ? `\n${product.url}` : ""}`);
  if (unique.length > 20) details.push(`Plus ${unique.length - 20} other customized products in this order.`);
  return `https://wa.me/${BUSINESS_WHATSAPP_NUMBER}?text=${encodeURIComponent([intro, ...details].join("\n\n"))}`;
}

export function customDesignSummary(items: CustomDesignItem[]) {
  const customized = items.filter(item => item.isCustomizedDesign === true);
  return { customized, pending: customized.filter(item => !item.designReceivedAt) };
}
