"use client";

import { Ruler } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SizeChartContent } from "@/app/_components/product/size-chart-content";

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
        </DialogHeader>
        <SizeChartContent />
      </DialogContent>
    </Dialog>
  );
}
