"use client";
import { UploadButton } from "./upload-button";
import type { ResizeTarget } from "@/app/_lib/resize-image";

// A URL/path text field paired with an "Upload" button. Both write to the same
// value, so existing /products/… paths keep working and a local-device upload
// just fills the field with a Blob URL. Used for the category image and the
// product main image. When `resizeTarget` is set, uploads are cropped/resized
// to that target and the preview box mirrors the resulting aspect ratio.
export function ImageInput({
  value,
  onChange,
  preview = false,
  resizeTarget,
  placeholder = "Image URL / path — or upload →",
}: {
  value: string;
  onChange: (v: string) => void;
  preview?: boolean;
  resizeTarget?: ResizeTarget;
  placeholder?: string;
}) {
  const previewBox =
    resizeTarget === "product"
      ? "aspect-[4/5] w-40"
      : resizeTarget === "category"
        ? "aspect-square w-40"
        : "h-32 w-full";
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
        />
        <UploadButton onUploaded={onChange} resizeTarget={resizeTarget} />
      </div>
      {preview && value ? (
        <div className={`overflow-hidden rounded ${previewBox}`}>
          {/* Plain <img>: this admin-only thumbnail must render any pasted URL
              (external host, /public path, or Blob URL) without next/image's
              remotePatterns allowlist throwing and breaking the form. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
    </div>
  );
}
