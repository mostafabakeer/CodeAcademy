import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';

interface WatermarkOptions {
  studentName: string;
  studentPhone: string;
  grade: string;
  opacity?: number; // 0-1
  fontSize?: number;
  angle?: number; // degrees
}

const DEFAULT_OPACITY = 0.08;
const DEFAULT_FONT_SIZE = 36;
const DEFAULT_ANGLE = -45;

/**
 * Adds a watermark to every page of a PDF with student info
 * Runs entirely client-side - no server load
 */
export async function addWatermarkToPDF(
  pdfBytes: Uint8Array,
  options: WatermarkOptions
): Promise<Uint8Array> {
  const { studentName, studentPhone, grade, opacity = DEFAULT_OPACITY, fontSize = DEFAULT_FONT_SIZE, angle = DEFAULT_ANGLE } = options;

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Build watermark text: "Ahmed Ali | 01012345678 | Bac1"
  const watermarkText = `${studentName} | ${studentPhone} | ${grade}`;
  const rotation = degrees(angle);

  for (const page of pages) {
    const { width, height } = page.getSize();

    // Create a diagonal watermark pattern across the page
    const centerX = width / 2;
    const centerY = height / 2;

    // Calculate how many watermarks we need to cover the page
    const diagonal = Math.sqrt(width * width + height * height);
    const spacing = fontSize * 8; // space between repeated watermarks
    const count = Math.ceil(diagonal / spacing);

    page.drawText(watermarkText, {
      x: centerX,
      y: centerY,
      size: fontSize,
      font,
      color: rgb(0.5, 0.5, 0.5), // neutral gray
      opacity,
      rotate: rotation,
    });

    // Add repeated watermarks in a grid pattern for better coverage
    for (let i = -count; i <= count; i++) {
      for (let j = -count; j <= count; j++) {
        if (i === 0 && j === 0) continue; // center already done

        const offsetX = i * spacing * 1.5;
        const offsetY = j * spacing * 1.5;

        // Only draw if within page bounds (with some margin)
        const drawX = centerX + offsetX;
        const drawY = centerY + offsetY;

        if (drawX > -fontSize * 5 && drawX < width + fontSize * 5 &&
            drawY > -fontSize * 5 && drawY < height + fontSize * 5) {
          page.drawText(watermarkText, {
            x: drawX,
            y: drawY,
            size: fontSize,
            font,
            color: rgb(0.5, 0.5, 0.5),
            opacity,
            rotate: rotation,
          });
        }
      }
    }
  }

  return await pdfDoc.save();
}

/**
 * Downloads a PDF with watermark applied
 */
export async function downloadWatermarkedPDF(
  pdfUrl: string,
  fileName: string,
  options: WatermarkOptions
): Promise<void> {
  try {
    // Fetch the PDF
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error('فشل تحميل الملف');
    const pdfBytes = await response.arrayBuffer();

    // Add watermark
    const watermarkedBytes = await addWatermarkToPDF(new Uint8Array(pdfBytes), options);

    // Trigger download - use ArrayBuffer directly for Blob
    const blob = new Blob([watermarkedBytes as unknown as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Watermark download failed:', error);
    throw new Error('فشل إضافة العلامة المائية وتحميل الملف');
  }
}

/**
 * Opens PDF in new tab with watermark (for viewing without download)
 */
export async function openWatermarkedPDF(
  pdfUrl: string,
  options: WatermarkOptions
): Promise<string> {
  const response = await fetch(pdfUrl);
  if (!response.ok) throw new Error('فشل تحميل الملف');
  const pdfBytes = await response.arrayBuffer();

  const watermarkedBytes = await addWatermarkToPDF(new Uint8Array(pdfBytes), options);

  const blob = new Blob([watermarkedBytes as unknown as BlobPart], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}