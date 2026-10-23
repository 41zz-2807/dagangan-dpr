import { useEffect, useRef, useState } from "react";

import { apiUpload, ApiError } from "../lib/api";
import { Button } from "./ui";

interface ImageInputProps {
  value: string | null;
  onUploaded: (image: { image_path: string; url: string; thumb_url: string }) => void;
  label?: string;
  disabled?: boolean;
}

/** Pilih file gambar atau ambil foto langsung dari kamera -> unggah ke server -> kembalikan path gambar. */
export default function ImageInput({
  value,
  onUploaded,
  label = "Gambar produk",
  disabled = false,
}: ImageInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Berkas harus berupa gambar.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Ukuran gambar maksimal 8 MB.");
      return;
    }
    setPreview(URL.createObjectURL(file));
    setLoading(true);
    try {
      const result = await apiUpload<{
        image: { image_path: string; url: string; thumb_url: string };
      }>("/uploads/product-image", file);
      onUploaded(result.image);
      setError(null);
    } catch (err) {
      setPreview(null);
      setError(
        err instanceof ApiError ? err.message : "Gagal mengunggah gambar.",
      );
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const shown = preview ?? value;

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {shown ? (
            <img
              src={shown}
              alt="Pratinjau gambar produk"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-[11px] font-medium text-slate-400">Tanpa gambar</span>
          )}
        </div>
        <div className="flex-1 space-y-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="secondary"
            full
            loading={loading}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {loading ? "Mengunggah..." : shown ? "Ganti gambar" : "Pilih dari galeri"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            full
            loading={loading}
            disabled={disabled}
            onClick={() => cameraInputRef.current?.click()}
          >
            Ambil foto
          </Button>
          <p className="text-[11px] text-slate-500">
            JPG/PNG/WEBP, maks 8 MB. Otomatis dikompres + thumbnail.
          </p>
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}
