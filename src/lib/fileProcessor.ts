/**
 * Multimodal File Processor for Akari AI
 * Handles client-side extraction, thumbnail rendering, and compression for:
 * - Photos & Images (PNG, JPG, WEBP, GIF, SVG, BMP)
 * - PDFs (Page rendering & text extraction)
 * - Documents & Code (TXT, MD, PY, JS, TS, JSON, CSV, HTML, CSS, LOG, DOCX, etc.)
 */

export interface ProcessedFile {
  name: string;
  size: number;
  formattedSize: string;
  category: "image" | "pdf" | "document" | "code";
  mimeType: string;
  previewUrl?: string; // thumbnail / data URL for rendering in chat UI
  textContent?: string; // extracted text content for docs & PDFs
  base64Data?: string; // raw base64 data (without prefix) for Gemini
  totalPages?: number;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function getFileCategory(file: File): "image" | "pdf" | "document" | "code" {
  const mime = file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() || "";

  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico"].includes(ext)) {
    return "image";
  }

  if (mime === "application/pdf" || ext === "pdf") {
    return "pdf";
  }

  const codeExts = [
    "js", "jsx", "ts", "tsx", "py", "html", "css", "json", "c", "cpp", "h", "hpp",
    "java", "rs", "go", "php", "rb", "sh", "bat", "ps1", "sql", "yaml", "yml", "xml",
    "toml", "vue", "svelte", "env"
  ];
  if (codeExts.includes(ext)) {
    return "code";
  }

  return "document";
}

/**
 * Resizes and converts image file to optimized Base64 JPEG/PNG for Gemini Live & UI
 */
async function processImage(file: File): Promise<{ previewUrl: string; base64Data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          const rawBase64 = (e.target?.result as string).split(",")[1] || "";
          resolve({ previewUrl: e.target?.result as string, base64Data: rawBase64, mimeType: file.type || "image/jpeg" });
          return;
        }

        const maxDim = 1280;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
        const quality = mime === "image/jpeg" ? 0.8 : undefined;
        const dataUrl = canvas.toDataURL(mime, quality);
        const base64Data = dataUrl.split(",")[1];

        resolve({
          previewUrl: dataUrl,
          base64Data,
          mimeType: mime,
        });
      };
      img.onerror = () => {
        const rawBase64 = (e.target?.result as string).split(",")[1] || "";
        resolve({ previewUrl: e.target?.result as string, base64Data: rawBase64, mimeType: file.type || "image/jpeg" });
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Extracts text and renders first page thumbnail from a PDF
 */
async function processPdf(file: File): Promise<{ textContent: string; previewUrl?: string; base64Data?: string; totalPages: number }> {
  const arrayBuffer = await file.arrayBuffer();

  try {
    // Dynamic import to support browser bundler
    const pdfjs = await import("pdfjs-dist");
    
    // Set up standard worker fallback if needed
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || "4.10.38"}/pdf.worker.min.mjs`;
    }

    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    let fullText = "";
    const maxPagesToExtract = Math.min(totalPages, 20);

    for (let i = 1; i <= maxPagesToExtract; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || "")
        .join(" ");
      fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }

    // Render first page as thumbnail
    let previewUrl: string | undefined;
    let base64Data: string | undefined;
    try {
      const firstPage = await pdf.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1.0 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (context) {
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await (firstPage.render({ canvasContext: context, viewport, canvas } as any)).promise;
        previewUrl = canvas.toDataURL("image/jpeg", 0.75);
        base64Data = previewUrl.split(",")[1];
      }
    } catch (renderErr) {
      console.warn("PDF first page thumbnail render warning:", renderErr);
    }

    return {
      textContent: fullText.trim() || `[PDF document "${file.name}" with ${totalPages} page(s). Text could not be extracted directly (may be scanned images).]`,
      previewUrl,
      base64Data,
      totalPages,
    };
  } catch (pdfErr) {
    console.warn("PDF.js extraction failed, using fallback:", pdfErr);
    
    // Fallback: Read raw strings
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const rawString = decoder.decode(arrayBuffer);
    
    // Simple regex extraction of text chunks inside PDF
    const textMatches = rawString.match(/\(([^)]+)\)\s*Tj/g) || [];
    const extracted = textMatches
      .map(m => m.replace(/^\(/, "").replace(/\)\s*Tj$/, ""))
      .join(" ");

    return {
      textContent: extracted.trim() || `[PDF Document: "${file.name}" (${formatBytes(file.size)}). Ready for review.]`,
      totalPages: 1,
    };
  }
}

/**
 * Reads text content from code/document files
 */
async function processTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve((e.target?.result as string) || "");
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Main file processing pipeline
 */
export async function processUploadFile(file: File): Promise<ProcessedFile> {
  const category = getFileCategory(file);
  const formattedSize = formatBytes(file.size);

  if (category === "image") {
    const { previewUrl, base64Data, mimeType } = await processImage(file);
    return {
      name: file.name,
      size: file.size,
      formattedSize,
      category,
      mimeType,
      previewUrl,
      base64Data,
    };
  }

  if (category === "pdf") {
    const { textContent, previewUrl, base64Data, totalPages } = await processPdf(file);
    return {
      name: file.name,
      size: file.size,
      formattedSize,
      category,
      mimeType: "application/pdf",
      textContent,
      previewUrl,
      base64Data,
      totalPages,
    };
  }

  // Text, code, markdown, csv, json, etc.
  const textContent = await processTextFile(file);
  return {
    name: file.name,
    size: file.size,
    formattedSize,
    category,
    mimeType: file.type || "text/plain",
    textContent,
  };
}
