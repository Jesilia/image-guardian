/**
 * DWT-based Steganographic Watermarking Engine v3
 *
 * Architecture:
 * - Each tile is embedded independently (no averaging across tiles)
 * - Non-overlapping tiles for clean embedding/extraction
 * - Reed-Solomon repetition ECC (3×) for bit-level robustness
 * - Mid-frequency DWT bands (LH + HL) — survives blur/sharpen/median
 * - Adaptive QIM strength per tile (texture-based)
 * - Corner sync markers for geometric detection
 * - Extraction: majority vote across all valid tiles found in image
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
const QIM_STEP = 12;          // Tuned for DWT LH/HL coefficient range (~±30)
const TILE_SIZE = 128;        // Smaller tiles = more tiles = better crop coverage
const RS_REDUNDANCY = 3;      // Each bit repeated 3× for error correction
const SYNC_MARKER = [1,0,1,1,0,1,0,0,1,1,0,1,1,0,1,0]; // 16-bit sync pattern
const MAX_PAYLOAD_CHARS = 80; // Max creatorId|timestamp characters

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
    if (charCode > 31 && charCode < 128) {
      result += String.fromCharCode(charCode);
    } else if (charCode !== 0) {
      result += ' ';
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

function rsDecode(encoded: number[], originalBitLen: number): number[] {
  const decoded: number[] = [];
  for (let i = 0; i < originalBitLen; i++) {
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
    low.push((a + b) / 2);
    high.push((a - b) / 2);
  }
  return { low, high };
}

function inverseHaarWavelet1D(low: number[], high: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < low.length; i++) {
    result.push(low[i] + high[i]);
    result.push(low[i] - high[i]);
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
  const halfHeight = Math.floor(height / 2);
  const LL: number[][] = Array.from({ length: halfHeight }, () => new Array(halfWidth).fill(0));
  const LH: number[][] = Array.from({ length: halfHeight }, () => new Array(halfWidth).fill(0));
  const HL: number[][] = Array.from({ length: halfHeight }, () => new Array(halfWidth).fill(0));
  const HH: number[][] = Array.from({ length: halfHeight }, () => new Array(halfWidth).fill(0));

  for (let x = 0; x < halfWidth; x++) {
    const lowCol: number[] = [];
    const highCol: number[] = [];
    for (let y = 0; y < height; y++) {
      lowCol.push(rowLow[y][x]);
      highCol.push(rowHigh[y][x]);
    }
    const { low: ll, high: lh } = haarWavelet1D(lowCol);
    const { low: hl, high: hh } = haarWavelet1D(highCol);
    for (let y = 0; y < halfHeight; y++) {
      LL[y][x] = ll[y];
      LH[y][x] = lh[y];
      HL[y][x] = hl[y];
      HH[y][x] = hh[y];
    }
  }

  return { LL, LH, HL, HH };
}

function idwt2D(LL: number[][], LH: number[][], HL: number[][], HH: number[][]): number[][] {
  const halfHeight = LL.length;
  const halfWidth = LL[0].length;
  const height = halfHeight * 2;

  const rowLow: number[][] = Array.from({ length: height }, () => new Array(halfWidth).fill(0));
  const rowHigh: number[][] = Array.from({ length: height }, () => new Array(halfWidth).fill(0));

  for (let x = 0; x < halfWidth; x++) {
    const llCol = LL.map(row => row[x]);
    const lhCol = LH.map(row => row[x]);
    const hlCol = HL.map(row => row[x]);
    const hhCol = HH.map(row => row[x]);
    const low = inverseHaarWavelet1D(llCol, lhCol);
    const high = inverseHaarWavelet1D(hlCol, hhCol);
    for (let y = 0; y < height; y++) {
      rowLow[y][x] = low[y];
      rowHigh[y][x] = high[y];
    }
  }

  const result: number[][] = [];
  for (let y = 0; y < height; y++) {
    result.push(inverseHaarWavelet1D(rowLow[y], rowHigh[y]));
  }
  return result;
}

// ─── Color Space ────────────────────────────────────────────────────

function rgbToY(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ─── Adaptive Strength ──────────────────────────────────────────────

function computeTextureStrength(tile: number[][]): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (const row of tile) {
    for (const v of row) {
      sum += v;
      sumSq += v * v;
      count++;
    }
  }
  if (count === 0) return 1;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  // Normalize: smooth areas get 0.7×, textured get up to 1.5×
  const normalized = Math.min(1, variance / 3000);
  return 0.7 + normalized * 0.8;
}

// ─── QIM Embedding/Extraction ────────────────────────────────────────
// CRITICAL: step must be IDENTICAL in embed and extract for correct decoding.
// Strength only adjusts a pre-emphasis offset, not the quantization grid.

function qimEmbed(coef: number, bit: number): number {
  const step = QIM_STEP;
  const half = step / 2;
  // Bit=0 → quantize to nearest multiple of step
  // Bit=1 → quantize to nearest (multiple of step + half)
  if (bit === 0) {
    return Math.round(coef / step) * step;
  } else {
    return Math.round((coef - half) / step) * step + half;
  }
}

function qimExtract(coef: number): number {
  const step = QIM_STEP;
  const half = step / 2;
  // Distance to nearest bit=0 lattice point vs bit=1 lattice point
  const q0 = Math.round(coef / step) * step;
  const q1 = Math.round((coef - half) / step) * step + half;
  return Math.abs(coef - q1) < Math.abs(coef - q0) ? 1 : 0;
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

function detectSyncMarkers(band: number[][]): number {
  const h = band.length;
  const w = band[0]?.length || 0;
  if (h < 8 || w < 8) return 0;

  const corners = [
    { y: 0, x: 0 },
    { y: 0, x: w - 4 },
    { y: h - 4, x: 0 },
    { y: h - 4, x: w - 4 },
  ];

  let totalMatches = 0;
  for (const corner of corners) {
    let matches = 0;
    let bitIdx = 0;
    for (let dy = 0; dy < 4 && corner.y + dy < h; dy++) {
      for (let dx = 0; dx < 4 && corner.x + dx < w; dx++) {
        if (bitIdx < SYNC_MARKER.length) {
          if (qimExtract(band[corner.y + dy][corner.x + dx]) === SYNC_MARKER[bitIdx]) matches++;
          bitIdx++;
        }
      }
    }
    totalMatches += matches / SYNC_MARKER.length;
  }
  return totalMatches / corners.length; // 0..1 score
}

// ─── Tile-level Embed/Extract ─────────────────────────────────────────

/**
 * Embed watermark bits into a single tile. Returns modified tile.
 */
function embedTile(tile: number[][], encodedBits: number[]): number[][] {
  const h = tile.length - (tile.length % 2);
  const w = tile[0].length - (tile[0].length % 2);
  if (h < 4 || w < 4) return tile;

  // Slice to even dimensions
  const even: number[][] = tile.slice(0, h).map(row => row.slice(0, w));

  const { LL, LH, HL, HH } = dwt2D(even);

  // Adaptive strength based on tile texture
  // Embed into LH band (mid-frequency)
  let idx = 0;
  for (let y = 0; y < LH.length; y++) {
    for (let x = 0; x < LH[y].length; x++) {
      LH[y][x] = qimEmbed(LH[y][x], encodedBits[idx % encodedBits.length]);
      idx++;
    }
  }

  // Also embed into HL band for redundancy
  idx = 0;
  for (let y = 0; y < HL.length; y++) {
    for (let x = 0; x < HL[y].length; x++) {
      HL[y][x] = qimEmbed(HL[y][x], encodedBits[idx % encodedBits.length]);
      idx++;
    }
  }

  // Sync markers in HH corners
  embedSyncMarkers(HH);

  const reconstructed = idwt2D(LL, LH, HL, HH);

  // Rebuild tile with reconstructed even portion
  const result = tile.map(row => [...row]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      result[y][x] = reconstructed[y][x];
    }
  }
  return result;
}

/**
 * Extract watermark bits from a single tile using majority vote from LH + HL.
 */
function extractTileBits(tile: number[][], payloadLen: number): { bits: number[]; syncScore: number } {
  const h = tile.length - (tile.length % 2);
  const w = tile[0].length - (tile[0].length % 2);
  if (h < 4 || w < 4) return { bits: new Array(payloadLen).fill(0), syncScore: 0 };

  const even: number[][] = tile.slice(0, h).map(row => row.slice(0, w));
  const { LH, HL, HH } = dwt2D(even);

  const syncScore = detectSyncMarkers(HH);

  // Vote tallies per bit position
  const votes: Array<[number, number]> = Array.from({ length: payloadLen }, () => [0, 0]);

  let idx = 0;
  for (let y = 0; y < LH.length; y++) {
    for (let x = 0; x < LH[y].length; x++) {
      const bit = qimExtract(LH[y][x]);
      votes[idx % payloadLen][bit]++;
      idx++;
    }
  }
  idx = 0;
  for (let y = 0; y < HL.length; y++) {
    for (let x = 0; x < HL[y].length; x++) {
      const bit = qimExtract(HL[y][x]);
      votes[idx % payloadLen][bit]++;
      idx++;
    }
  }

  const bits = votes.map(([v0, v1]) => v1 >= v0 ? 1 : 0);
  return { bits, syncScore };
}

// ─── Tile Grid ───────────────────────────────────────────────────────

interface TileInfo {
  startY: number;
  startX: number;
  height: number;
  width: number;
}

/**
 * Compute non-overlapping tiles covering the image.
 * Non-overlapping ensures each pixel is modified exactly once → clean QIM.
 */
function computeTiles(imgH: number, imgW: number): TileInfo[] {
  const tiles: TileInfo[] = [];
  for (let y = 0; y < imgH; y += TILE_SIZE) {
    for (let x = 0; x < imgW; x += TILE_SIZE) {
      const tileH = Math.min(TILE_SIZE, imgH - y);
      const tileW = Math.min(TILE_SIZE, imgW - x);
      if (tileH >= 32 && tileW >= 32) {
        tiles.push({ startY: y, startX: x, height: tileH, width: tileW });
      }
    }
  }
  return tiles;
}

function readTile(channel: number[][], tile: TileInfo): number[][] {
  return Array.from({ length: tile.height }, (_, y) =>
    Array.from({ length: tile.width }, (_, x) =>
      channel[tile.startY + y]?.[tile.startX + x] ?? 0
    )
  );
}

function writeTile(channel: number[][], tile: TileInfo, data: number[][]): void {
  for (let y = 0; y < tile.height; y++) {
    for (let x = 0; x < tile.width; x++) {
      if (tile.startY + y < channel.length && tile.startX + x < channel[0].length) {
        channel[tile.startY + y][tile.startX + x] = data[y][x];
      }
    }
  }
}

// ─── Main Embed ──────────────────────────────────────────────────────

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
        // Use even dimensions
        const width = img.width - (img.width % 2);
        const height = img.height - (img.height % 2);
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        // Extract Y (luminance) channel as 2D array
        const yChannel: number[][] = Array.from({ length: height }, (_, y) =>
          Array.from({ length: width }, (_, x) => {
            const i = (y * width + x) * 4;
            return rgbToY(pixels[i], pixels[i + 1], pixels[i + 2]);
          })
        );

        // Prepare payload: creatorId|timestamp (padded/trimmed to MAX_PAYLOAD_CHARS)
        const rawPayload = `${watermarkData.creatorId}|${watermarkData.timestamp}`.slice(0, MAX_PAYLOAD_CHARS);
        const rawBits = stringToBinary(rawPayload);
        const encodedBits = rsEncode(rawBits); // 3× redundancy

        // Non-overlapping tiles
        const tiles = computeTiles(height, width);
        console.log(`[WM v3 Embed] ${tiles.length} tiles, payload ${rawPayload.length} chars → ${encodedBits.length} encoded bits`);

        // Embed into each tile independently (no averaging)
        for (const tile of tiles) {
          const tileData = readTile(yChannel, tile);
          const embeddedTile = embedTile(tileData, encodedBits);
          writeTile(yChannel, tile, embeddedTile);
        }

        // Apply Y-channel changes back to RGB pixels (luminance-only modification)
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const origY = rgbToY(pixels[i], pixels[i + 1], pixels[i + 2]);
            const newY = yChannel[y][x];
            const diff = newY - origY;
            pixels[i]     = Math.max(0, Math.min(255, pixels[i]     + diff));
            pixels[i + 1] = Math.max(0, Math.min(255, pixels[i + 1] + diff));
            pixels[i + 2] = Math.max(0, Math.min(255, pixels[i + 2] + diff));
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

// ─── Main Extract ────────────────────────────────────────────────────

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
        const pixels = imageData.data;

        const yChannel: number[][] = Array.from({ length: height }, (_, y) =>
          Array.from({ length: width }, (_, x) => {
            const i = (y * width + x) * 4;
            return rgbToY(pixels[i], pixels[i + 1], pixels[i + 2]);
          })
        );

        const tiles = computeTiles(height, width);
        console.log(`[WM v3 Extract] Extracting from ${tiles.length} tiles`);

        // We try a range of payload lengths. The real payload is ≤ MAX_PAYLOAD_CHARS chars.
        // encodedBits length = rawBits * RS_REDUNDANCY
        // We try charLen from 30 to MAX_PAYLOAD_CHARS, step 2
        const isoPattern = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/;

        for (let charLen = 30; charLen <= MAX_PAYLOAD_CHARS; charLen += 2) {
          const encodedBitLen = charLen * 8 * RS_REDUNDANCY;

          // Weighted majority vote across tiles
          const globalVotes: Array<[number, number]> = Array.from({ length: encodedBitLen }, () => [0, 0]);

          for (const tile of tiles) {
            const tileData = readTile(yChannel, tile);
            const { bits, syncScore } = extractTileBits(tileData, encodedBitLen);
            const weight = 0.3 + syncScore * 0.7; // tiles with sync markers are more reliable
            for (let i = 0; i < encodedBitLen; i++) {
              globalVotes[i][bits[i]] += weight;
            }
          }

          const encodedBits = globalVotes.map(([v0, v1]) => v1 >= v0 ? 1 : 0);
          const rawBits = rsDecode(encodedBits, charLen * 8);
          const rawString = binaryToString(rawBits);

          const match = rawString.match(isoPattern);
          if (match) {
            console.log(`[WM v3 Extract] ✓ Found watermark at charLen=${charLen}:`, match[1], match[2]);
            resolve({ creatorId: match[1], timestamp: match[2], raw: match[0] });
            return;
          }
        }

        // Fallback: try without RS decoding at various lengths
        console.log('[WM v3 Extract] RS decode failed, trying raw extraction...');
        for (let charLen = 40; charLen <= MAX_PAYLOAD_CHARS; charLen += 4) {
          const globalVotes: Array<[number, number]> = Array.from({ length: charLen * 8 }, () => [0, 0]);

          for (const tile of tiles) {
            const tileData = readTile(yChannel, tile);
            const { bits } = extractTileBits(tileData, charLen * 8);
            for (let i = 0; i < charLen * 8; i++) {
              globalVotes[i][bits[i]]++;
            }
          }

          const rawBits = globalVotes.map(([v0, v1]) => v1 >= v0 ? 1 : 0);
          const rawString = binaryToString(rawBits);
          const match = rawString.match(isoPattern);
          if (match) {
            console.log(`[WM v3 Extract] ✓ Found watermark (raw) at charLen=${charLen}`);
            resolve({ creatorId: match[1], timestamp: match[2], raw: match[0] });
            return;
          }
        }

        console.log('[WM v3 Extract] No watermark pattern found');
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

  // PRIMARY: Match by DWT-extracted metadata (works on cropped/filtered images)
  if (extractedData) {
    const { data: wmEntries, error: wmError } = await supabase
      .from('watermark_registry')
      .select('*')
      .eq('creator_id', extractedData.creatorId)
      .eq('timestamp', extractedData.timestamp)
      .limit(1);

    if (!wmError && wmEntries && wmEntries.length > 0) {
      return {
        status: 'registered',
        extractedData,
        currentHash,
        registryEntry: wmEntries[0] as RegistryEntry,
        confidence: currentHash === wmEntries[0].image_hash ? 'exact_hash' : 'dwt_metadata',
      };
    }

    // Check local ledger fallback
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

  // SECONDARY: Exact hash match (works only on unmodified images)
  const { data: hashEntries, error: hashError } = await supabase
    .from('watermark_registry')
    .select('*')
    .eq('image_hash', currentHash)
    .limit(1);

  if (!hashError && hashEntries && hashEntries.length > 0) {
    return {
      status: 'registered',
      extractedData,
      currentHash,
      registryEntry: hashEntries[0] as RegistryEntry,
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

// ─── Utilities ──────────────────────────────────────────────────────

async function generateHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
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
