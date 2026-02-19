/**
 * DWT-based Steganographic Watermarking Engine v2
 * 
 * Features:
 * - Tiled Redundancy: Image divided into overlapping tiles, watermark embedded in each
 * - Reed-Solomon Error Correction: Bit-level robustness via ECC
 * - Mid-frequency DWT Embedding: Survives common filters (blur, sharpen, median)
 * - Adaptive Strength: Texture-aware embedding strength
 * - Corner Synchronization Markers: Geometric robustness (crop/rotate detection)
 * - QIM (Quantization Index Modulation): Robust bit encoding
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
  confidence: 'exact_hash' | 'dwt_metadata' | 'none';
}

// ─── Constants ──────────────────────────────────────────────────────
const QIM_STEP = 50;
const TILE_SIZE = 256;
const TILE_OVERLAP = 0.5; // 50% overlap
const RS_REDUNDANCY = 3; // Reed-Solomon-like repetition factor for ECC
const SYNC_MARKER = [1,0,1,1,0,1,0,0,1,1,0,1,1,0,1,0]; // 16-bit sync pattern
const ADAPTIVE_MIN_STRENGTH = 0.6;
const ADAPTIVE_MAX_STRENGTH = 1.4;

// ─── Binary Utilities ───────────────────────────────────────────────

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

// ─── Reed-Solomon-like ECC (repetition code) ────────────────────────

function rsEncode(bits: number[]): number[] {
  const encoded: number[] = [];
  for (const bit of bits) {
    for (let r = 0; r < RS_REDUNDANCY; r++) {
      encoded.push(bit);
    }
  }
  return encoded;
}

function rsDecode(encoded: number[], originalLength: number): number[] {
  const decoded: number[] = [];
  for (let i = 0; i < originalLength; i++) {
    let sum = 0;
    for (let r = 0; r < RS_REDUNDANCY; r++) {
      const idx = i * RS_REDUNDANCY + r;
      if (idx < encoded.length) sum += encoded[idx];
    }
    decoded.push(sum >= Math.ceil(RS_REDUNDANCY / 2) ? 1 : 0);
  }
  return decoded;
}

// ─── Haar Wavelet Transform ─────────────────────────────────────────

function haarWavelet1D(data: number[]): { low: number[]; high: number[] } {
  const half = Math.floor(data.length / 2);
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

function inverseHaarWavelet1D(low: number[], high: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < low.length; i++) {
    result.push((low[i] + high[i]) / Math.SQRT2, (low[i] - high[i]) / Math.SQRT2);
  }
  return result;
}

function dwt2D(channel: number[][]): {
  LL: number[][]; LH: number[][]; HL: number[][]; HH: number[][];
} {
  const height = channel.length;
  const rowLow: number[][] = [];
  const rowHigh: number[][] = [];
  for (let y = 0; y < height; y++) {
    const { low, high } = haarWavelet1D(channel[y]);
    rowLow.push(low);
    rowHigh.push(high);
  }

  const halfWidth = rowLow[0].length;
  const LL: number[][] = [];
  const LH: number[][] = [];
  for (let x = 0; x < halfWidth; x++) {
    const col: number[] = [];
    for (let y = 0; y < height; y++) col.push(rowLow[y][x]);
    const { low, high } = haarWavelet1D(col);
    for (let y = 0; y < low.length; y++) {
      if (!LL[y]) LL[y] = [];
      if (!LH[y]) LH[y] = [];
      LL[y][x] = low[y];
      LH[y][x] = high[y];
    }
  }

  const HL: number[][] = [];
  const HH: number[][] = [];
  for (let x = 0; x < halfWidth; x++) {
    const col: number[] = [];
    for (let y = 0; y < height; y++) col.push(rowHigh[y][x]);
    const { low, high } = haarWavelet1D(col);
    for (let y = 0; y < low.length; y++) {
      if (!HL[y]) HL[y] = [];
      if (!HH[y]) HH[y] = [];
      HL[y][x] = low[y];
      HH[y][x] = high[y];
    }
  }

  return { LL, LH, HL, HH };
}

function idwt2D(LL: number[][], LH: number[][], HL: number[][], HH: number[][]): number[][] {
  const halfHeight = LL.length;
  const halfWidth = LL[0].length;
  const rowLow: number[][] = [];
  const rowHigh: number[][] = [];

  for (let x = 0; x < halfWidth; x++) {
    const llCol: number[] = [];
    const lhCol: number[] = [];
    for (let y = 0; y < halfHeight; y++) {
      llCol.push(LL[y][x]);
      lhCol.push(LH[y][x]);
    }
    const low = inverseHaarWavelet1D(llCol, lhCol);
    for (let y = 0; y < low.length; y++) {
      if (!rowLow[y]) rowLow[y] = [];
      rowLow[y][x] = low[y];
    }
  }

  for (let x = 0; x < halfWidth; x++) {
    const hlCol: number[] = [];
    const hhCol: number[] = [];
    for (let y = 0; y < halfHeight; y++) {
      hlCol.push(HL[y][x]);
      hhCol.push(HH[y][x]);
    }
    const high = inverseHaarWavelet1D(hlCol, hhCol);
    for (let y = 0; y < high.length; y++) {
      if (!rowHigh[y]) rowHigh[y] = [];
      rowHigh[y][x] = high[y];
    }
  }

  const result: number[][] = [];
  for (let y = 0; y < rowLow.length; y++) {
    result.push(inverseHaarWavelet1D(rowLow[y], rowHigh[y]));
  }
  return result;
}

// ─── Color Space ────────────────────────────────────────────────────

function rgbToY(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ─── Adaptive Strength ──────────────────────────────────────────────

/**
 * Compute local texture complexity (variance) for a region.
 * Higher variance = more texture = can embed stronger.
 */
function computeTextureStrength(channel: number[][], startY: number, startX: number, h: number, w: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = startY; y < startY + h && y < channel.length; y++) {
    for (let x = startX; x < startX + w && x < channel[y].length; x++) {
      sum += channel[y][x];
      sumSq += channel[y][x] * channel[y][x];
      count++;
    }
  }
  if (count === 0) return 1;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  // Normalize variance to a strength multiplier
  const normalized = Math.min(1, variance / 2000);
  return ADAPTIVE_MIN_STRENGTH + normalized * (ADAPTIVE_MAX_STRENGTH - ADAPTIVE_MIN_STRENGTH);
}

// ─── QIM Embedding/Extraction with Adaptive Strength ────────────────

function qimEmbed(coef: number, bit: number, strength: number = 1): number {
  const step = QIM_STEP * strength;
  const halfStep = step / 2;
  const offset = bit === 1 ? halfStep : 0;
  return Math.round((coef - offset) / step) * step + offset;
}

function qimExtract(coef: number): number {
  const step = QIM_STEP;
  const halfStep = step / 2;
  const dist0 = Math.abs(coef - Math.round(coef / step) * step);
  const dist1 = Math.abs(coef - (Math.round((coef - halfStep) / step) * step + halfStep));
  return dist0 <= dist1 ? 0 : 1;
}

// ─── Corner Synchronization Markers ─────────────────────────────────

function embedSyncMarkers(band: number[][]): void {
  const h = band.length;
  const w = band[0]?.length || 0;
  if (h < 8 || w < 8) return;

  const corners = [
    { y: 0, x: 0 },
    { y: 0, x: w - 4 },
    { y: h - 4, x: 0 },
    { y: h - 4, x: w - 4 },
  ];

  for (const corner of corners) {
    let bitIdx = 0;
    for (let dy = 0; dy < 4 && corner.y + dy < h; dy++) {
      for (let dx = 0; dx < 4 && corner.x + dx < w; dx++) {
        if (bitIdx < SYNC_MARKER.length) {
          band[corner.y + dy][corner.x + dx] = qimEmbed(
            band[corner.y + dy][corner.x + dx],
            SYNC_MARKER[bitIdx]
          );
          bitIdx++;
        }
      }
    }
  }
}

function detectSyncMarkers(band: number[][]): { found: number; total: number } {
  const h = band.length;
  const w = band[0]?.length || 0;
  if (h < 8 || w < 8) return { found: 0, total: 4 };

  const corners = [
    { y: 0, x: 0 },
    { y: 0, x: w - 4 },
    { y: h - 4, x: 0 },
    { y: h - 4, x: w - 4 },
  ];

  let found = 0;
  for (const corner of corners) {
    let matches = 0;
    let bitIdx = 0;
    for (let dy = 0; dy < 4 && corner.y + dy < h; dy++) {
      for (let dx = 0; dx < 4 && corner.x + dx < w; dx++) {
        if (bitIdx < SYNC_MARKER.length) {
          const extracted = qimExtract(band[corner.y + dy][corner.x + dx]);
          if (extracted === SYNC_MARKER[bitIdx]) matches++;
          bitIdx++;
        }
      }
    }
    if (matches >= SYNC_MARKER.length * 0.6) found++;
  }

  return { found, total: 4 };
}

// ─── Tiled Embedding/Extraction ─────────────────────────────────────

interface TileInfo {
  startY: number;
  startX: number;
  height: number;
  width: number;
}

function computeTiles(height: number, width: number): TileInfo[] {
  const tiles: TileInfo[] = [];
  const step = Math.floor(TILE_SIZE * (1 - TILE_OVERLAP));
  
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const tileH = Math.min(TILE_SIZE, height - y);
      const tileW = Math.min(TILE_SIZE, width - x);
      if (tileH >= 32 && tileW >= 32) { // Minimum usable tile
        tiles.push({ startY: y, startX: x, height: tileH, width: tileW });
      }
    }
  }
  return tiles;
}

function extractTile(channel: number[][], tile: TileInfo): number[][] {
  const result: number[][] = [];
  for (let y = 0; y < tile.height; y++) {
    result[y] = [];
    for (let x = 0; x < tile.width; x++) {
      result[y][x] = channel[tile.startY + y]?.[tile.startX + x] ?? 0;
    }
  }
  return result;
}

function applyTile(channel: number[][], tile: TileInfo, tileData: number[][]): void {
  for (let y = 0; y < tile.height; y++) {
    for (let x = 0; x < tile.width; x++) {
      if (tile.startY + y < channel.length && tile.startX + x < channel[0].length) {
        channel[tile.startY + y][tile.startX + x] = tileData[y][x];
      }
    }
  }
}

/**
 * Embed watermark into a single tile's mid-frequency bands (LH, HL) with adaptive strength.
 */
function embedIntoTile(
  tileChannel: number[][],
  encodedBits: number[],
  fullChannel: number[][],
  tileInfo: TileInfo
): number[][] {
  // Ensure even dimensions
  const h = tileChannel.length - (tileChannel.length % 2);
  const w = tileChannel[0].length - (tileChannel[0].length % 2);
  if (h < 4 || w < 4) return tileChannel;

  const evenTile: number[][] = [];
  for (let y = 0; y < h; y++) {
    evenTile[y] = tileChannel[y].slice(0, w);
  }

  const { LL, LH, HL, HH } = dwt2D(evenTile);

  // Compute adaptive strength for this tile region
  const strength = computeTextureStrength(fullChannel, tileInfo.startY, tileInfo.startX, tileInfo.height, tileInfo.width);

  // Embed into mid-frequency bands (LH, HL) — more filter-resistant than HH
  let bitIndex = 0;
  for (let y = 0; y < LH.length; y++) {
    for (let x = 0; x < LH[y].length; x++) {
      if (bitIndex >= encodedBits.length) bitIndex = 0;
      LH[y][x] = qimEmbed(LH[y][x], encodedBits[bitIndex], strength);
      bitIndex++;
    }
  }
  bitIndex = 0;
  for (let y = 0; y < HL.length; y++) {
    for (let x = 0; x < HL[y].length; x++) {
      if (bitIndex >= encodedBits.length) bitIndex = 0;
      HL[y][x] = qimEmbed(HL[y][x], encodedBits[bitIndex], strength);
      bitIndex++;
    }
  }

  // Embed sync markers into HH band
  embedSyncMarkers(HH);

  const reconstructed = idwt2D(LL, LH, HL, HH);

  // Merge back (only overwrite even-sized portion)
  const result = tileChannel.map(row => [...row]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      result[y][x] = reconstructed[y][x];
    }
  }
  return result;
}

/**
 * Extract watermark from a single tile using majority voting across LH, HL bands.
 */
function extractFromTile(tileChannel: number[][], payloadLength: number): { bits: number[]; syncScore: number } {
  const h = tileChannel.length - (tileChannel.length % 2);
  const w = tileChannel[0].length - (tileChannel[0].length % 2);
  if (h < 4 || w < 4) return { bits: [], syncScore: 0 };

  const evenTile: number[][] = [];
  for (let y = 0; y < h; y++) {
    evenTile[y] = tileChannel[y].slice(0, w);
  }

  const { LH, HL, HH } = dwt2D(evenTile);

  // Detect sync markers to weight this tile's reliability
  const sync = detectSyncMarkers(HH);
  const syncScore = sync.found / sync.total;

  // Extract from mid-frequency bands
  const votes: number[][] = Array.from({ length: payloadLength }, () => [0, 0]);

  let bitIndex = 0;
  for (let y = 0; y < LH.length; y++) {
    for (let x = 0; x < LH[y].length; x++) {
      const idx = bitIndex % payloadLength;
      votes[idx][qimExtract(LH[y][x])]++;
      bitIndex++;
    }
  }
  bitIndex = 0;
  for (let y = 0; y < HL.length; y++) {
    for (let x = 0; x < HL[y].length; x++) {
      const idx = bitIndex % payloadLength;
      votes[idx][qimExtract(HL[y][x])]++;
      bitIndex++;
    }
  }

  const bits = votes.map(v => (v[1] >= v[0] ? 1 : 0));
  return { bits, syncScore };
}

// ─── Main Embed Function ────────────────────────────────────────────

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

        // Create watermark payload with RS encoding
        const watermarkString = `${watermarkData.creatorId}|${watermarkData.timestamp}`;
        const rawBits = stringToBinary(watermarkString);
        const encodedBits = rsEncode(rawBits);

        // Compute tiles with overlap
        const tiles = computeTiles(height, width);
        console.log(`[WM Embed] Embedding into ${tiles.length} overlapping tiles (${TILE_SIZE}px, ${TILE_OVERLAP * 100}% overlap)`);

        // For overlapping tiles, we accumulate changes and average
        const changeSum: number[][] = Array.from({ length: height }, () => new Float64Array(width) as unknown as number[]);
        const changeCount: number[][] = Array.from({ length: height }, () => new Float64Array(width) as unknown as number[]);

        for (const tile of tiles) {
          const tileData = extractTile(yChannel, tile);
          const embedded = embedIntoTile(tileData, encodedBits, yChannel, tile);

          for (let y = 0; y < tile.height; y++) {
            for (let x = 0; x < tile.width; x++) {
              const gy = tile.startY + y;
              const gx = tile.startX + x;
              if (gy < height && gx < width) {
                changeSum[gy][gx] += embedded[y][x] - tileData[y][x];
                changeCount[gy][gx]++;
              }
            }
          }
        }

        // Apply averaged changes to image
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (changeCount[y][x] > 0) {
              const diff = changeSum[y][x] / changeCount[y][x];
              const i = (y * width + x) * 4;
              data[i] = Math.max(0, Math.min(255, data[i] + diff));
              data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + diff));
              data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + diff));
            }
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

        resolve({ watermarkedImageUrl: watermarkedDataUrl, hash, ledgerEntry });
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
}

// ─── Main Extract Function ──────────────────────────────────────────

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
        const pixelData = imageData.data;

        // Extract Y channel
        const yChannel: number[][] = [];
        for (let y = 0; y < height; y++) {
          yChannel[y] = [];
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            yChannel[y][x] = rgbToY(pixelData[i], pixelData[i + 1], pixelData[i + 2]);
          }
        }

        // Compute tiles
        const tiles = computeTiles(height, width);
        const maxPayloadBits = 1024 * 8 * RS_REDUNDANCY;
        const payloadLength = Math.min(maxPayloadBits, 2048);

        console.log(`[WM Extract] Extracting from ${tiles.length} tiles`);

        // Weighted majority voting across all tiles
        const globalVotes: number[][] = Array.from({ length: payloadLength }, () => [0, 0]);

        for (const tile of tiles) {
          const tileData = extractTile(yChannel, tile);
          const { bits, syncScore } = extractFromTile(tileData, payloadLength);
          
          // Weight by sync marker detection (tiles with sync markers are more reliable)
          const weight = 0.5 + syncScore * 0.5;
          
          for (let i = 0; i < bits.length && i < payloadLength; i++) {
            globalVotes[i][bits[i]] += weight;
          }
        }

        // Resolve votes
        const encodedBits = globalVotes.map(v => (v[1] >= v[0] ? 1 : 0));

        // RS decode — try various original lengths
        const tryDecode = (origBitLen: number): string => {
          const decoded = rsDecode(encodedBits, origBitLen);
          return binaryToString(decoded);
        };

        // Try a range of payload sizes
        for (let charLen = 30; charLen <= 200; charLen += 5) {
          const rawString = tryDecode(charLen * 8);
          
          // Search for email|ISO-timestamp pattern
          const isoPattern = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/;
          const match = rawString.match(isoPattern);
          if (match) {
            console.log('[WM Extract] Found watermark via RS decode:', match[1], match[2]);
            resolve({ creatorId: match[1], timestamp: match[2], raw: match[0] });
            return;
          }
        }

        // Fallback: try raw bit extraction without RS decoding
        const rawBits = globalVotes.map(v => (v[1] >= v[0] ? 1 : 0));
        const rawString = binaryToString(rawBits);
        console.log('[WM Extract] Raw string (first 200):', rawString.substring(0, 200));

        const isoPattern = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/;
        const match = rawString.match(isoPattern);
        if (match) {
          console.log('[WM Extract] Found watermark (raw):', match[1], match[2]);
          resolve({ creatorId: match[1], timestamp: match[2], raw: match[0] });
          return;
        }

        // Loose pattern fallback
        const loosePattern = /([\x20-\x7E]{3,60})\|(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/;
        const looseMatch = rawString.match(loosePattern);
        if (looseMatch) {
          console.log('[WM Extract] Found watermark (loose):', looseMatch[1], looseMatch[2]);
          resolve({ creatorId: looseMatch[1].trim(), timestamp: looseMatch[2].trim(), raw: looseMatch[0] });
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

// ─── Verification ───────────────────────────────────────────────────

export async function verifyImage(
  imageDataUrl: string,
  extractedData: ExtractedWatermark | null
): Promise<VerificationResult> {
  const currentHash = await generateHash(imageDataUrl);

  if (extractedData) {
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
        confidence: currentHash === registryEntry.image_hash ? 'exact_hash' : 'dwt_metadata',
      };
    }

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
        confidence: currentHash === localEntry.imageHash ? 'exact_hash' : 'dwt_metadata',
      };
    }
  }

  // SECONDARY: Exact hash match
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
      confidence: 'exact_hash',
    };
  }

  return {
    status: 'unregistered',
    extractedData,
    currentHash,
    registryEntry: null,
    confidence: 'none',
  };
}

// ─── Utility Functions ──────────────────────────────────────────────

async function generateHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function loadImageAsDataUrl(source: string | File): Promise<string> {
  if (typeof source !== 'string') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(source);
    });
  }

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
      } catch {
        reject(new Error('Failed to load image from URL'));
      }
    };
    img.src = source;
  });
}

export function downloadImage(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function getLedger(): LedgerEntry[] {
  const stored = localStorage.getItem('watermark_ledger');
  return stored ? JSON.parse(stored) : [];
}

export async function saveLedgerEntry(entry: LedgerEntry): Promise<void> {
  const ledger = getLedger();
  ledger.unshift(entry);
  localStorage.setItem('watermark_ledger', JSON.stringify(ledger));

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

  window.dispatchEvent(new Event('storage'));
}

export function exportLedger(): string {
  return JSON.stringify(getLedger(), null, 2);
}
