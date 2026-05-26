import { useState, useCallback, useEffect } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, Crop } from "lucide-react";

const MAX_OUTPUT_PX = 500;
const MAX_SIZE_KB = 500;

function createImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

async function extractCropBlob(imageSrc: string, pixels: Area): Promise<Blob> {
  const img = await createImage(imageSrc);
  const size = Math.min(pixels.width, pixels.height, MAX_OUTPUT_PX);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, pixels.x, pixels.y, pixels.width, pixels.height, 0, 0, size, size);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Crop failed — canvas produced no output"));
        else resolve(blob);
      },
      "image/jpeg",
      0.92,
    );
  });
}

async function smartCompress(blob: Blob): Promise<Blob> {
  if (blob.size <= MAX_SIZE_KB * 1024) return blob;
  const img = await createImage(URL.createObjectURL(blob));
  URL.revokeObjectURL(img.src);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  let quality = 0.85;
  return new Promise((resolve, reject) => {
    const tryCompress = () => {
      canvas.toBlob(
        (b) => {
          if (!b) { reject(new Error("Compression failed")); return; }
          if (b.size <= MAX_SIZE_KB * 1024 || quality <= 0.3) resolve(b);
          else { quality -= 0.1; tryCompress(); }
        },
        "image/jpeg",
        quality,
      );
    };
    tryCompress();
  });
}

interface PhotoCropModalProps {
  open: boolean;
  imageSrc: string;
  onClose: () => void;
  onConfirm: (blob: Blob) => void;
  onError: (message: string) => void;
}

export function PhotoCropModal({
  open,
  imageSrc,
  onClose,
  onConfirm,
  onError,
}: PhotoCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState("");

  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setProcessing(false);
      setProcessingLabel("");
    }
  }, [open, imageSrc]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      setProcessingLabel("Cropping...");
      const cropped = await extractCropBlob(imageSrc, croppedAreaPixels);
      const needsCompression = cropped.size > MAX_SIZE_KB * 1024;
      if (needsCompression) {
        setProcessingLabel("Compressing...");
      }
      const final = await smartCompress(cropped);
      onConfirm(final);
    } catch (err: unknown) {
      onError((err as Error).message || "Failed to process image");
    } finally {
      setProcessing(false);
      setProcessingLabel("");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !processing) onClose();
      }}
    >
      <DialogContent
        className="max-w-sm sm:max-w-md p-0 overflow-hidden gap-0 rounded-xl border-border"
        onInteractOutside={(e) => {
          if (processing) e.preventDefault();
        }}
      >
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Crop className="w-4 h-4 text-primary" />
            Crop Profile Photo
          </DialogTitle>
        </DialogHeader>

        <div className="relative w-full bg-[#0f172a]" style={{ height: 300 }}>
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              minZoom={1}
              maxZoom={4}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              style={{
                containerStyle: { background: "#0f172a" },
                cropAreaStyle: {
                  border: "2px solid #6366f1",
                  boxShadow: "0 0 0 9999px rgba(15,23,42,0.72)",
                  color: "#6366f1",
                },
              }}
            />
          )}
          {processing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 z-10">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-white font-medium">{processingLabel}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-4 space-y-1 border-t border-border/50">
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-muted-foreground shrink-0" />
            <Slider
              min={1}
              max={4}
              step={0.01}
              value={[zoom]}
              onValueChange={([v]) => setZoom(v)}
              disabled={processing}
              className="flex-1"
            />
            <ZoomIn className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
          <p className="text-xs text-muted-foreground text-center pt-0.5">
            Drag to reposition · Scroll or pinch to zoom
          </p>
        </div>

        <DialogFooter className="flex flex-row gap-2 px-5 pb-5">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={processing}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={processing || !croppedAreaPixels}
            className="flex-1"
          >
            {processing ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {processingLabel || "Processing..."}
              </span>
            ) : (
              "Upload Photo"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
