export const DEFAULT_CHUNK_SIZE = 262_144; // 256 KiB

export class ChunkManager {
  constructor({ chunkSize = DEFAULT_CHUNK_SIZE } = {}) {
    this.chunkSize = chunkSize;
    this.transfers = new Map();
  }

  /**
   * Hazırlanan transferleri bellekte tutar ve manifest ile geri döner.
   * @param {File} file
   * @returns {Promise<{ manifest: object, transfer: ChunkTransfer }>}
   */
  async prepareTransfer(file) {
    if (!(file instanceof File)) {
      throw new TypeError('prepareTransfer expects a File object');
    }

    const arrayBuffer = await file.arrayBuffer();
    const fullHash = await sha256(arrayBuffer);

    const chunks = sliceBuffer(arrayBuffer, this.chunkSize);
    const chunkHashes = [];

    for (const chunk of chunks) {
      const hash = await sha256(chunk.buffer.slice(
        chunk.byteOffset,
        chunk.byteOffset + chunk.byteLength
      ));
      chunkHashes.push(hash);
    }

    const transferId = generateTransferId();
    const manifest = {
      type: 'manifest',
      transferId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      chunkSize: this.chunkSize,
      chunkCount: chunks.length,
      sha256: fullHash,
      chunkHashes,
      createdAt: Date.now()
    };

    const transfer = new ChunkTransfer({
      transferId,
      file,
      chunks,
      chunkHashes,
      fullHash
    });

    this.transfers.set(transferId, transfer);
    return { manifest, transfer };
  }

  getTransfer(transferId) {
    return this.transfers.get(transferId) ?? null;
  }

  removeTransfer(transferId) {
    this.transfers.delete(transferId);
  }

  async computeHash(buffer) {
    return sha256(buffer);
  }
}

class ChunkTransfer {
  constructor({ transferId, file, chunks, chunkHashes, fullHash }) {
    this.transferId = transferId;
    this.file = file;
    this.chunks = chunks;
    this.chunkHashes = chunkHashes;
    this.fullHash = fullHash;
    this.base64Cache = new Array(chunks.length).fill(null);
  }

  get totalChunks() {
    return this.chunks.length;
  }

  getChunk(index) {
    if (index < 0 || index >= this.chunks.length) {
      throw new RangeError('Chunk index out of bounds');
    }
    return this.chunks[index];
  }

  getChunkHash(index) {
    if (index < 0 || index >= this.chunkHashes.length) {
      throw new RangeError('Chunk hash index out of bounds');
    }
    return this.chunkHashes[index];
  }

  getChunkBase64(index) {
    if (index < 0 || index >= this.chunks.length) {
      throw new RangeError('Chunk index out of bounds');
    }
    if (!this.base64Cache[index]) {
      this.base64Cache[index] = toBase64(this.chunks[index]);
    }
    return this.base64Cache[index];
  }

  toBlob() {
    return new Blob(this.chunks, { type: this.file.type || 'application/octet-stream' });
  }
}

function sliceBuffer(arrayBuffer, chunkSize) {
  const view = new Uint8Array(arrayBuffer);
  const result = [];
  for (let offset = 0; offset < view.byteLength; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, view.byteLength);
    result.push(view.subarray(offset, end));
  }
  return result;
}

async function sha256(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return toBase64Url(hashBuffer);
}

function toBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function toBase64(typedArray) {
  let binary = '';
  for (let i = 0; i < typedArray.byteLength; i += 1) {
    binary += String.fromCharCode(typedArray[i]);
  }
  return btoa(binary);
}

function generateTransferId() {
  const stamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `tr-${stamp}-${random}`;
}
