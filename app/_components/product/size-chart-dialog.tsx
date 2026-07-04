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
      <DialogTrigger className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Ruler className="h-4 w-4" aria-hidden />
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
