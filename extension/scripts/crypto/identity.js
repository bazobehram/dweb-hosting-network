/**
 * Cryptographic Identity Module
 * Provides decentralized, cryptographically-secure identity for DWeb users
 */

const KEYPAIR_STORE_NAME = 'dweb-keypairs';
const DB_NAME = 'dweb-identity';
const DB_VERSION = 1;

/**
 * Generate a new ECDSA keypair for cryptographic identity
 */
export async function generateKeypair() {
  try {
    const keypair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256' // secp256r1
      },
      true, // extractable
      ['sign', 'verify']
    );
    return keypair;
  } catch (error) {
    throw new Error(`Failed to generate keypair: ${error.message}`);
  }
}

/**
 * Derive owner ID from public key (like Ethereum address)
 * Format: dweb:0x{first20BytesOfSHA256(publicKey)}
 */
export async function deriveOwnerIdFromPublicKey(publicKey) {
  try {
    // Export public key to raw format
    const exported = await crypto.subtle.exportKey('raw', publicKey);
    
    // Hash the public key
    const hashBuffer = await crypto.subtle.digest('SHA-256', exported);
    
    // Take first 20 bytes (like Ethereum)
    const hashArray = new Uint8Array(hashBuffer);
    const addressBytes = hashArray.slice(0, 20);
    
    // Convert to hex
    const hex = Array.from(addressBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return `dweb:0x${hex}`;
  } catch (error) {
    throw new Error(`Failed to derive owner ID: ${error.message}`);
  }
}

/**
 * Sign a message with private key
 */
export async function signMessage(privateKey, message) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    
    const signature = await crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: 'SHA-256'
      },
      privateKey,
      data
    );
    
    // Convert to base64
    return arrayBufferToBase64(signature);
  } catch (error) {
    throw new Error(`Failed to sign message: ${error.message}`);
  }
}

/**
 * Verify a signature
 */
export async function verifySignature(publicKey, message, signatureBase64) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const signature = base64ToArrayBuffer(signatureBase64);
    
    const valid = await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256'
      },
      publicKey,
      signature,
      data
    );
    
    return valid;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Export public key to base64
 */
export async function exportPublicKey(publicKey) {
  try {
    const exported = await crypto.subtle.exportKey('spki', publicKey);
    return arrayBufferToBase64(exported);
  } catch (error) {
    throw new Error(`Failed to export public key: ${error.message}`);
  }
}

/**
 * Import public key from base64
 */
export async function importPublicKey(base64Key) {
  try {
    const buffer = base64ToArrayBuffer(base64Key);
    const publicKey = await crypto.subtle.importKey(
      'spki',
      buffer,
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true,
      ['verify']
    );
    return publicKey;
  } catch (error) {
    throw new Error(`Failed to import public key: ${error.message}`);
  }
}

/**
 * Store keypair securely in IndexedDB
 */
export async function storeKeypair(ownerId, keypair) {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYPAIR_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(KEYPAIR_STORE_NAME);
    
    crypto.subtle.exportKey('jwk', keypair.privateKey)
      .then(privateKeyJwk => {
        return crypto.subtle.exportKey('jwk', keypair.publicKey)
          .then(publicKeyJwk => {
            const record = {
              ownerId,
              privateKey: privateKeyJwk,
              publicKey: publicKeyJwk,
              createdAt: Date.now()
            };
            
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error('Failed to store keypair'));
          });
      })
      .catch(reject);
    
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Load keypair from IndexedDB
 */
export async function loadKeypair(ownerId) {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYPAIR_STORE_NAME], 'readonly');
    const store = transaction.objectStore(KEYPAIR_STORE_NAME);
    const request = store.get(ownerId);
    
    request.onsuccess = async () => {
      const record = request.result;
      if (!record) {
        resolve(null);
        return;
      }
      
      try {
        const privateKey = await crypto.subtle.importKey(
          'jwk',
          record.privateKey,
          {
            name: 'ECDSA',
            namedCurve: 'P-256'
          },
          true,
          ['sign']
        );
        
        const publicKey = await crypto.subtle.importKey(
          'jwk',
          record.publicKey,
          {
            name: 'ECDSA',
            namedCurve: 'P-256'
          },
          true,
          ['verify']
        );
        
        resolve({ privateKey, publicKey });
      } catch (error) {
        reject(new Error(`Failed to import keypair: ${error.message}`));
      }
    };
    
    request.onerror = () => reject(new Error('Failed to load keypair'));
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Export keypair for backup (encrypted with password)
 */
export async function exportKeypairBackup(ownerId, password) {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYPAIR_STORE_NAME], 'readonly');
    const store = transaction.objectStore(KEYPAIR_STORE_NAME);
    const request = store.get(ownerId);
    
    request.onsuccess = async () => {
      const record = request.result;
      if (!record) {
        reject(new Error('Keypair not found'));
        return;
      }
      
      try {
        // Encrypt with password
        const encrypted = await encryptWithPassword(JSON.stringify(record), password);
        resolve(encrypted);
      } catch (error) {
        reject(error);
      }
    };
    
    request.onerror = () => reject(new Error('Failed to export keypair'));
  });
}

/**
 * Import keypair from backup
 */
export async function importKeypairBackup(encryptedData, password) {
  try {
    const decrypted = await decryptWithPassword(encryptedData, password);
    const record = JSON.parse(decrypted);
    
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([KEYPAIR_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(KEYPAIR_STORE_NAME);
      const request = store.put(record);
      
      request.onsuccess = () => resolve(record.ownerId);
      request.onerror = () => reject(new Error('Failed to import keypair'));
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    throw new Error(`Failed to import backup: ${error.message}`);
  }
}

// ==================== Helper Functions ====================

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(KEYPAIR_STORE_NAME)) {
        db.createObjectStore(KEYPAIR_STORE_NAME, { keyPath: 'ownerId' });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Failed to open IndexedDB'));
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function encryptWithPassword(data, password) {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  
  // Derive key from password
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBytes
  );
  
  // Combine salt + iv + encrypted data
  const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  return arrayBufferToBase64(result.buffer);
}

async function decryptWithPassword(base64Data, password) {
  const encoder = new TextEncoder();
  const combined = base64ToArrayBuffer(base64Data);
  const data = new Uint8Array(combined);
  
  const salt = data.slice(0, 16);
  const iv = data.slice(16, 28);
  const encrypted = data.slice(28);
  
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}
