"use client";

import Image from "next/image";
import { Ruler } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SizeChartDialog() {
  return (
    <Dialog>
      <DialogTrigger className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <Ruler className="h-3.5 w-3.5" aria-hidden />
        Size Chart
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Oversize T-shirt size chart</DialogTitle>
          <DialogDescription>
            Measurements in inches, ±0.5&quot; tolerance. Unisex sizing.
          </DialogDescription>
        </DialogHeader>
        <div className="relative aspect-square w-full overflow-hidden rounded-md">
          <Image
            src="/size-charts/oversize.jpg"
            alt="Oversize t-shirt size chart"
            fill
            sizes="(min-width: 640px) 42rem, 100vw"
            className="object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
