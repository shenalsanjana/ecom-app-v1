import ReactMarkdown from "react-markdown";

type Props = { markdown: string };

export function Description({ markdown }: Props) {
  return (
    <section aria-labelledby="description-heading" className="space-y-4">
      <h2 id="description-heading" className="font-heading text-xl font-medium tracking-tight">
        About this product
      </h2>
      <div className="prose prose-sm max-w-none dark:prose-invert
                      prose-headings:font-semibold prose-headings:tracking-tight
                      prose-p:leading-relaxed prose-li:my-1">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </div>
    </section>
  );
}
