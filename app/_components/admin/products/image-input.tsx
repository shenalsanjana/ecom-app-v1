"use client";
import { UploadButton } from "./upload-button";

// A URL/path text field paired with an "Upload" button. Both write to the same
// value, so existing /products/… paths keep working and a local-device upload
// just fills the field with a Blob URL. Used for the category image and the
// product main image.
export function ImageInput({
  value,
  onChange,
  preview = false,
  placeholder = "Image URL / path — or upload →",
}: {
  value: string;
  onChange: (v: string) => void;
  preview?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
        />
        <UploadButton onUploaded={onChange} />
      </div>
      {preview && value ? (
        // Plain <img>: this admin-only thumbnail must render any pasted URL
        // (external host, /public path, or Blob URL) without next/image's
        // remotePatterns allowlist throwing and breaking the form.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-32 w-full rounded object-cover" />
      ) : null}
    </div>
  );
}
