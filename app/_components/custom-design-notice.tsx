import { MessageCircle } from "lucide-react";
import { designWhatsAppUrl, type CustomDesignProduct } from "@/app/_lib/custom-design";

export function CustomDesignNotice({ products, orderNumber, received = false }: {
  products: CustomDesignProduct[]; orderNumber?: string; received?: boolean;
}) {
  if (!products.length) return null;
  return <section aria-label="Custom design submission" className="my-4 space-y-3 rounded-lg border border-brand/30 bg-brand/5 p-4 text-left text-sm">
    <h2 className="font-semibold">{received ? "Design received" : orderNumber ? "Design submission required" : "Customized design product"}</h2>
    {received ? <p>Our team has confirmed receipt of your design files.</p> : <>
      <p>{orderNumber ? "Our team has not yet confirmed all your design files. " : "You can complete your purchase now. "}
        Send your PNG design files through Business WhatsApp and include your order number after checkout.</p>
      <p className="text-muted-foreground">Discuss your requirements with us before printing. Our team confirms receipt after checking your files.</p>
    </>}
    <ul className="list-inside list-disc break-words">{products.map((product, index) => <li key={`${product.name}-${index}`}>{product.name}</li>)}</ul>
    <a href={designWhatsAppUrl(products, orderNumber)} target="_blank" rel="noopener noreferrer"
      className="inline-flex max-w-[calc(100%_-_3.5rem)] sm:max-w-full items-center justify-center gap-2 rounded-md bg-green-700 px-4 py-2 font-medium text-white hover:bg-green-800">
      <MessageCircle className="size-4 shrink-0" aria-hidden />Send Your Design via WhatsApp
    </a>
  </section>;
}
