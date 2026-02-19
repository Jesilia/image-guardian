/**
 * DWT-based Steganographic Watermarking Engine
 * Implements frequency-domain watermarking using Discrete Wavelet Transform
 */

import { supabase } from '@/integrations/supabase/client';

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

export interface ExtractedWatermark {
  creatorId: string;
  timestamp: string;
  raw: string;
}

export interface RegistryEntry {
  id: string;
  creator_id: string;
  timestamp: string;
  prompt: string | null;
  image_hash: string;
  created_at: string;
}

export interface VerificationResult {
  status: 'registered' | 'unregistered';
  extractedData: ExtractedWatermark | null;
  currentHash: string;
  registryEntry: RegistryEntry | null;
}

// QIM (Quantization Index Modulation) step size — larger = more robust but more visible
const QIM_STEP = 50;
// Minimum tile size for block-based embedding (watermark is tiled across image)
const MIN_TILE_SIZE = 64;

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
 * Convert binary to string
 */
function binaryToString(binary: number[]): string {
  let result = '';
  for (let i = 0; i < binary.length; i += 8) {
    let charCode = 0;
    for (let bit = 0; bit < 8 && i + bit < binary.length; bit++) {
      charCode = (charCode << 1) | binary[i + bit];
    }
    if (charCode > 0 && charCode < 128) {
      result += String.fromCharCode(charCode);
    }
  }
  return result;
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
 * QIM embedding: quantize coefficient to encode a bit
 */
function qimEmbed(coef: number, bit: number): number {
  const step = QIM_STEP;
  const halfStep = step / 2;
  // Quantize to nearest multiple of step, offset by halfStep for bit=1
  const offset = bit === 1 ? halfStep : 0;
  return Math.round((coef - offset) / step) * step + offset;
}

/**
 * QIM extraction: determine which bit a coefficient encodes
 */
function qimExtract(coef: number): number {
  const step = QIM_STEP;
  const halfStep = step / 2;
  // Distance to nearest even quantization (bit 0) vs odd (bit 1)
  const dist0 = Math.abs(coef - Math.round(coef / step) * step);
  const dist1 = Math.abs(coef - (Math.round((coef - halfStep) / step) * step + halfStep));
  return dist0 <= dist1 ? 0 : 1;
}

/**
 * Embed watermark bits into a single DWT band using QIM
 */
function embedIntoBand(band: number[][], binary: number[]): void {
  let bitIndex = 0;
  for (let y = 0; y < band.length; y++) {
    for (let x = 0; x < band[y].length; x++) {
      if (bitIndex >= binary.length) bitIndex = 0; // tile/repeat
      band[y][x] = qimEmbed(band[y][x], binary[bitIndex]);
      bitIndex++;
    }
  }
}

/**
 * Extract watermark bits from a DWT band using QIM majority voting
 */
function extractFromBand(band: number[][], payloadLength: number): number[] {
  const votes: number[][] = Array.from({ length: payloadLength }, () => [0, 0]);
  let bitIndex = 0;
  for (let y = 0; y < band.length; y++) {
    for (let x = 0; x < band[y].length; x++) {
      const idx = bitIndex % payloadLength;
      const bit = qimExtract(band[y][x]);
      votes[idx][bit]++;
      bitIndex++;
    }
  }
  return votes.map(v => (v[1] >= v[0] ? 1 : 0));
}

/**
 * Embed watermark into image using DWT + QIM (robust to crop, filters, format changes)
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
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
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
        
        // Create watermark payload
        const watermarkString = `${watermarkData.creatorId}|${watermarkData.timestamp}`;
        const binary = stringToBinary(watermarkString);
        
        // Embed into all three detail bands using QIM (tiled/repeated automatically)
        embedIntoBand(LH, binary);
        embedIntoBand(HL, binary);
        embedIntoBand(HH, binary);
        
        // Inverse DWT
        const reconstructedY = idwt2D(LL, LH, HL, HH);
        
        // Apply changes to image
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const originalY = yChannel[y][x];
            const newY = reconstructedY[y][x];
            const diff = newY - originalY;
            
            data[i] = Math.max(0, Math.min(255, data[i] + diff));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + diff));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + diff));
          }
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        const watermarkedDataUrl = canvas.toDataURL('image/png');
        const hash = await generateHash(watermarkedDataUrl);
        
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
 * Extract watermark from image using DWT + QIM with majority voting across 3 bands
 */
export async function extractWatermark(imageDataUrl: string): Promise<ExtractedWatermark | null> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
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
        const { LH, HL, HH } = dwt2D(yChannel);
        
        // Extract a large buffer and search for the pattern inside it
        // Use a large payload size and scan the decoded string for the pattern
        const maxPayloadBits = 1024 * 8; // 1024 chars max
        const actualBits = Math.min(maxPayloadBits, LH.length * (LH[0]?.length || 0));
        
        // Extract from all 3 bands with the full available length
        const bitsLH = extractFromBand(LH, actualBits);
        const bitsHL = extractFromBand(HL, actualBits);
        const bitsHH = extractFromBand(HH, actualBits);
        
        // Cross-band majority vote
        const finalBits: number[] = [];
        for (let i = 0; i < actualBits; i++) {
          const sum = bitsLH[i] + bitsHL[i] + bitsHH[i];
          finalBits.push(sum >= 2 ? 1 : 0);
        }
        
        const rawString = binaryToString(finalBits);
        console.log('[WM Extract] Raw extracted string (first 200 chars):', rawString.substring(0, 200));
        
        // Search for email|ISO-timestamp pattern anywhere in the extracted string
        // Pattern: something@something.something|YYYY-MM-DDTHH:MM:SS.sssZ
        const isoPattern = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/;
        const match = rawString.match(isoPattern);
        
        if (match) {
          console.log('[WM Extract] Found watermark:', match[1], match[2]);
          resolve({
            creatorId: match[1],
            timestamp: match[2],
            raw: match[0],
          });
          return;
        }
        
        // Fallback: look for any creatorId|timestamp-like pattern
        const loosePattern = /([\x20-\x7E]{3,60})\|(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/;
        const looseMatch = rawString.match(loosePattern);
        if (looseMatch) {
          console.log('[WM Extract] Found watermark (loose):', looseMatch[1], looseMatch[2]);
          resolve({
            creatorId: looseMatch[1].trim(),
            timestamp: looseMatch[2].trim(),
            raw: looseMatch[0],
          });
          return;
        }
        
        console.log('[WM Extract] No watermark pattern found');
        resolve(null);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
}

/**
 * Verify image against Cloud registry
 */
export async function verifyImage(
  imageDataUrl: string,
  extractedData: ExtractedWatermark | null
): Promise<VerificationResult> {
  // Generate hash of current image (for display purposes)
  const currentHash = await generateHash(imageDataUrl);

  // PRIMARY: Use extracted watermark data (creatorId + timestamp) to look up registry.
  // This is robust to cropping, filters, format conversion, etc.
  if (extractedData) {
    // Query registry by creator_id and timestamp from the embedded watermark
    const { data: wmEntries, error: wmError } = await supabase
      .from('watermark_registry')
      .select('*')
      .eq('creator_id', extractedData.creatorId)
      .eq('timestamp', extractedData.timestamp)
      .limit(1);

    if (!wmError && wmEntries && wmEntries.length > 0) {
      const registryEntry = wmEntries[0] as RegistryEntry;
      return {
        status: 'registered',
        extractedData,
        currentHash,
        registryEntry,
      };
    }

    // Fallback: check local ledger by extracted data
    const localLedger = getLedger();
    const localEntry = localLedger.find(
      (e) => e.creatorId === extractedData.creatorId && e.timestamp === extractedData.timestamp
    );

    if (localEntry) {
      return {
        status: 'registered',
        extractedData,
        currentHash,
        registryEntry: {
          id: localEntry.id,
          creator_id: localEntry.creatorId,
          timestamp: localEntry.timestamp,
          prompt: localEntry.prompt || null,
          image_hash: localEntry.imageHash,
          created_at: localEntry.createdAt,
        },
      };
    }
  }

  // SECONDARY: Exact hash match (only works on unmodified images)
  const { data: hashEntries, error: hashError } = await supabase
    .from('watermark_registry')
    .select('*')
    .eq('image_hash', currentHash)
    .limit(1);

  if (!hashError && hashEntries && hashEntries.length > 0) {
    const registryEntry = hashEntries[0] as RegistryEntry;
    return {
      status: 'registered',
      extractedData,
      currentHash,
      registryEntry,
    };
  }

  return {
    status: 'unregistered',
    extractedData,
    currentHash,
    registryEntry: null,
  };
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
  if (typeof source !== 'string') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(source);
    });
  }

  // For URLs, try direct load first, then fall back to proxy for CORS issues
  return new Promise((resolve, reject) => {
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
    img.onerror = async () => {
      // CORS blocked — use server-side proxy
      try {
        const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/image-proxy`;
        const res = await fetch(proxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ url: source }),
        });
        if (!res.ok) throw new Error('Proxy fetch failed');
        const data = await res.json();
        resolve(data.dataUrl);
      } catch (proxyErr) {
        reject(new Error('Failed to load image from URL'));
      }
    };
    img.src = source;
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
 * Get ledger from localStorage (local backup)
 */
export function getLedger(): LedgerEntry[] {
  const stored = localStorage.getItem('watermark_ledger');
  return stored ? JSON.parse(stored) : [];
}

/**
 * Save entry to both Cloud registry and local ledger
 */
export async function saveLedgerEntry(entry: LedgerEntry): Promise<void> {
  // Save to local storage as backup
  const ledger = getLedger();
  ledger.unshift(entry);
  localStorage.setItem('watermark_ledger', JSON.stringify(ledger));
  
  // Save to Cloud registry
  const { error } = await supabase.from('watermark_registry').insert({
    id: entry.id,
    creator_id: entry.creatorId,
    timestamp: entry.timestamp,
    prompt: entry.prompt || null,
    image_hash: entry.imageHash,
    created_at: entry.createdAt,
  });
  
  if (error) {
    console.error('Failed to save to Cloud registry:', error);
  }
  
  // Dispatch storage event for real-time updates
  window.dispatchEvent(new Event('storage'));
}

/**
 * Export ledger as JSON
 */
export function exportLedger(): string {
  return JSON.stringify(getLedger(), null, 2);
}
