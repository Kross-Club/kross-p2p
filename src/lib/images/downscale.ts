// ─── Reducción de imágenes en el navegador ───────────────────────────────────
// El comprador está en un Android de gama media con 4G lenta. Una foto de 4 MB
// que se va a mostrar a 56 px le cuesta segundos de espera en el paso 1 del
// checkout — justo donde se decide la venta. Se reduce ANTES de subirla.
//
// Nunca bloquea: si el navegador no puede procesarla, se sube el archivo tal
// cual. Perder compresión es barato; perder la subida no.

export interface DownscaleOptions {
  /** Lado mayor máximo, en píxeles. */
  maxPx: number
  /** Calidad JPEG (0–1). */
  quality: number
}

/**
 * Presets por uso. La miniatura del pack se muestra a 56 px en el checkout;
 * 400 px cubre pantallas @3x y permite reutilizar la misma foto más grande
 * después sin volver a pedírsela a la marca.
 */
export const IMAGE_PRESETS: Record<'packThumb' | 'voucher', DownscaleOptions> = {
  packThumb: { maxPx: 400, quality: 0.82 },
  // El comprobante lo lee una PERSONA para verificar monto y código, así que
  // necesita más resolución que una miniatura — pero no los 4 MB del original,
  // que en 4G son segundos de espera justo antes de cerrar la venta.
  voucher: { maxPx: 1600, quality: 0.8 },
}

/** Reduce la imagen manteniendo proporción. Devuelve el original si no puede. */
export async function downscaleImage(file: File, { maxPx, quality }: DownscaleOptions): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height))
    // Ya es chica: recomprimirla solo perdería calidad sin ganar peso.
    if (scale === 1) { bitmap.close?.(); return file }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close?.(); return file }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
    // Si el resultado no pesa menos, no hay nada que ganar cambiándolo.
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
