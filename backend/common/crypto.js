import crypto from 'crypto';

/**
 * Verify ECDSA signature
 */
export async function verifySignature(publicKeyBase64, message, signatureBase64) {
  try {
    // Import public key
    const publicKeyDer = Buffer.from(publicKeyBase64, 'base64');
    const publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki'
    });
    
    // Verify signature
    const verify = crypto.createVerify('SHA256');
    verify.update(message);
    verify.end();
    
    const signature = Buffer.from(signatureBase64, 'base64');
    const valid = verify.verify(publicKey, signature);
    
    return valid;
  } catch (error) {
    console.error('[Crypto] Signature verification failed:', error.message);
    return false;
  }
}

/**
 * Derive owner ID from public key (matches client-side logic)
 */
export function deriveOwnerIdFromPublicKey(publicKeyBase64) {
  try {
    const publicKeyDer = Buffer.from(publicKeyBase64, 'base64');
    
    // For SPKI format, skip the header and extract raw key
    // SPKI format: SEQUENCE + header + raw key
    // For P-256: header is 26 bytes, then 65 bytes raw key
    const rawKey = publicKeyDer.slice(26); // Skip SPKI header
    
    // Hash the raw public key
    const hash = crypto.createHash('sha256').update(rawKey).digest();
    
    // Take first 20 bytes
    const addressBytes = hash.slice(0, 20);
    
    // Convert to hex
    const hex = addressBytes.toString('hex');
    
    return `dweb:0x${hex}`;
  } catch (error) {
    console.error('[Crypto] Owner ID derivation failed:', error.message);
    return null;
  }
}
