const loadBitmap = async (blob: Blob) => {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new Error('Unable to read this image.');
  }
};

const encodeCanvas = async (
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> => {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality });
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality)
  );
  if (!blob) throw new Error('Unable to encode image.');
  return blob;
};

const createCanvas = (width: number, height: number) => {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/**
 * Scales an image so its longest side is at most `maxSize` and re-encodes it.
 * With `skipIfSmaller`, images already within bounds are returned unchanged.
 */
export const resizeImage = async (
  blob: Blob,
  {
    maxSize,
    type = 'image/jpeg',
    quality = 0.85,
    skipIfSmaller = false,
  }: {
    maxSize: number;
    type?: string;
    quality?: number;
    skipIfSmaller?: boolean;
  }
): Promise<Blob> => {
  const bitmap = await loadBitmap(blob);

  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    if (skipIfSmaller && scale === 1) {
      return blob;
    }

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error('Canvas context is not available.');

    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await encodeCanvas(canvas, type, quality);
  } finally {
    bitmap.close();
  }
};

export const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const extensionForType = (type: string, fallbackName = '') => {
  const fromName = fallbackName.includes('.')
    ? fallbackName.split('.').pop()
    : '';
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return fromName || 'jpg';
};
