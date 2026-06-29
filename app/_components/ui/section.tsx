import { cn } from "@/lib/utils";

export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", className)}
      {...props}
    />
  );
}

type SectionProps = React.ComponentProps<"section"> & {
  bordered?: boolean;
};

export function Section({
  className,
  bordered = true,
  children,
  ...props
}: SectionProps) {
  return (
    <section className={cn(bordered && "border-b", className)} {...props}>
      <Container className="py-12 md:py-20">{children}</Container>
    </section>
  );
}
