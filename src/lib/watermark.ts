/**
 * DWT-based Steganographic Watermarking Engine
 * Implements frequency-domain watermarking using Discrete Wavelet Transform
 */

export interface WatermarkData {
  creatorId: string;
  timestamp: string;
  prompt?: string;
}

export interface WatermarkResult {
  watermarkedImageUrl: string;
  hash: string;
  ledgerEntry: LedgerEntry;
}

export interface LedgerEntry {
  id: string;
  creatorId: string;
  timestamp: string;
  prompt?: string;
  imageHash: string;
  createdAt: string;
}

// Alpha factor for watermark strength (lower = less visible)
const ALPHA = 0.02;

/**
 * Convert string to binary representation
 */
function stringToBinary(str: string): number[] {
  const binary: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    for (let bit = 7; bit >= 0; bit--) {
      binary.push((charCode >> bit) & 1);
    }
  }
  return binary;
}

/**
 * Simple 1D Haar Wavelet Transform
 */
function haarWavelet1D(data: number[]): { low: number[]; high: number[] } {
  const n = data.length;
  const half = Math.floor(n / 2);
  const low: number[] = [];
  const high: number[] = [];

  for (let i = 0; i < half; i++) {
    const a = data[2 * i];
    const b = data[2 * i + 1];
    low.push((a + b) / Math.SQRT2);
    high.push((a - b) / Math.SQRT2);
  }

  return { low, high };
}

/**
 * Inverse 1D Haar Wavelet Transform
 */
function inverseHaarWavelet1D(low: number[], high: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < low.length; i++) {
    const a = (low[i] + high[i]) / Math.SQRT2;
    const b = (low[i] - high[i]) / Math.SQRT2;
    result.push(a, b);
  }
  return result;
}

/**
 * Apply 2D Haar DWT to a channel
 */
function dwt2D(channel: number[][]): {
  LL: number[][];
  LH: number[][];
  HL: number[][];
  HH: number[][];
} {
  const height = channel.length;
  const width = channel[0].length;

  // Row transform
  const rowTransformed: { low: number[][]; high: number[][] } = {
    low: [],
    high: [],
  };

  for (let y = 0; y < height; y++) {
    const { low, high } = haarWavelet1D(channel[y]);
    rowTransformed.low.push(low);
    rowTransformed.high.push(high);
  }

  // Column transform on low frequencies
  const LL: number[][] = [];
  const LH: number[][] = [];
  const halfHeight = Math.floor(height / 2);
  const halfWidth = rowTransformed.low[0].length;

  for (let x = 0; x < halfWidth; x++) {
    const column: number[] = [];
    for (let y = 0; y < height; y++) {
      column.push(rowTransformed.low[y][x]);
    }
    const { low, high } = haarWavelet1D(column);
    for (let y = 0; y < low.length; y++) {
      if (!LL[y]) LL[y] = [];
      if (!LH[y]) LH[y] = [];
      LL[y][x] = low[y];
      LH[y][x] = high[y];
    }
  }

  // Column transform on high frequencies
  const HL: number[][] = [];
  const HH: number[][] = [];

  for (let x = 0; x < halfWidth; x++) {
    const column: number[] = [];
    for (let y = 0; y < height; y++) {
      column.push(rowTransformed.high[y][x]);
    }
    const { low, high } = haarWavelet1D(column);
    for (let y = 0; y < low.length; y++) {
      if (!HL[y]) HL[y] = [];
      if (!HH[y]) HH[y] = [];
      HL[y][x] = low[y];
      HH[y][x] = high[y];
    }
  }

  return { LL, LH, HL, HH };
}

/**
 * Inverse 2D Haar DWT
 */
function idwt2D(
  LL: number[][],
  LH: number[][],
  HL: number[][],
  HH: number[][]
): number[][] {
  const halfHeight = LL.length;
  const halfWidth = LL[0].length;

  // Inverse column transform
  const rowLow: number[][] = [];
  const rowHigh: number[][] = [];

  for (let x = 0; x < halfWidth; x++) {
    const llColumn: number[] = [];
    const lhColumn: number[] = [];
    for (let y = 0; y < halfHeight; y++) {
      llColumn.push(LL[y][x]);
      lhColumn.push(LH[y][x]);
    }
    const low = inverseHaarWavelet1D(llColumn, lhColumn);
    for (let y = 0; y < low.length; y++) {
      if (!rowLow[y]) rowLow[y] = [];
      rowLow[y][x] = low[y];
    }
  }

  for (let x = 0; x < halfWidth; x++) {
    const hlColumn: number[] = [];
    const hhColumn: number[] = [];
    for (let y = 0; y < halfHeight; y++) {
      hlColumn.push(HL[y][x]);
      hhColumn.push(HH[y][x]);
    }
    const high = inverseHaarWavelet1D(hlColumn, hhColumn);
    for (let y = 0; y < high.length; y++) {
      if (!rowHigh[y]) rowHigh[y] = [];
      rowHigh[y][x] = high[y];
    }
  }

  // Inverse row transform
  const result: number[][] = [];
  for (let y = 0; y < rowLow.length; y++) {
    result.push(inverseHaarWavelet1D(rowLow[y], rowHigh[y]));
  }

  return result;
}

/**
 * Extract Y channel from RGB (YCbCr conversion)
 */
function rgbToY(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Embed watermark into image using DWT
 */
export async function embedWatermark(
  imageDataUrl: string,
  watermarkData: WatermarkData
): Promise<WatermarkResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = async () => {
      try {
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
        // Ensure dimensions are even for DWT
        const width = img.width - (img.width % 2);
        const height = img.height - (img.height % 2);
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // Extract Y channel
        const yChannel: number[][] = [];
        for (let y = 0; y < height; y++) {
          yChannel[y] = [];
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            yChannel[y][x] = rgbToY(data[i], data[i + 1], data[i + 2]);
          }
        }
        
        // Apply DWT
        const { LL, LH, HL, HH } = dwt2D(yChannel);
        
        // Create watermark string and convert to binary
        const watermarkString = `${watermarkData.creatorId}|${watermarkData.timestamp}`;
        const binary = stringToBinary(watermarkString);
        
        // Embed watermark into LH coefficients (horizontal detail)
        let bitIndex = 0;
        for (let y = 0; y < LH.length && bitIndex < binary.length; y++) {
          for (let x = 0; x < LH[y].length && bitIndex < binary.length; x++) {
            const bit = binary[bitIndex];
            LH[y][x] += (bit === 1 ? ALPHA : -ALPHA) * Math.abs(LH[y][x] + 1);
            bitIndex++;
          }
        }
        
        // Inverse DWT
        const reconstructedY = idwt2D(LL, LH, HL, HH);
        
        // Apply changes to image
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const originalY = yChannel[y][x];
            const newY = reconstructedY[y][x];
            const diff = newY - originalY;
            
            // Apply proportional change to RGB
            data[i] = Math.max(0, Math.min(255, data[i] + diff));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + diff));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + diff));
          }
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Generate SHA-256 hash
        const watermarkedDataUrl = canvas.toDataURL('image/png');
        const hash = await generateHash(watermarkedDataUrl);
        
        // Create ledger entry
        const ledgerEntry: LedgerEntry = {
          id: crypto.randomUUID(),
          creatorId: watermarkData.creatorId,
          timestamp: watermarkData.timestamp,
          prompt: watermarkData.prompt,
          imageHash: hash,
          createdAt: new Date().toISOString(),
        };
        
        resolve({
          watermarkedImageUrl: watermarkedDataUrl,
          hash,
          ledgerEntry,
        });
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
}

/**
 * Generate SHA-256 hash of data
 */
async function generateHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Load image from URL or file and convert to data URL
 */
export function loadImageAsDataUrl(source: string | File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof source === 'string') {
      // URL - fetch and convert
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Failed to load image from URL'));
      img.src = source;
    } else {
      // File
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(source);
    }
  });
}

/**
 * Download watermarked image
 */
export function downloadImage(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Get ledger from localStorage
 */
export function getLedger(): LedgerEntry[] {
  const stored = localStorage.getItem('watermark_ledger');
  return stored ? JSON.parse(stored) : [];
}

/**
 * Save entry to ledger
 */
export function saveLedgerEntry(entry: LedgerEntry): void {
  const ledger = getLedger();
  ledger.unshift(entry);
  localStorage.setItem('watermark_ledger', JSON.stringify(ledger));
  // Dispatch storage event for real-time updates
  window.dispatchEvent(new Event('storage'));
}

/**
 * Export ledger as JSON
 */
export function exportLedger(): string {
  return JSON.stringify(getLedger(), null, 2);
}
