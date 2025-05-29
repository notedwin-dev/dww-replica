/**
 * Client-side cryptography utilities for decrypting server-side encrypted data
 */

const clientCrypto = {
  /**
   * Decrypts AES-256-CBC encrypted data using Web Crypto API
   * @param {string} encryptedHex - Encrypted data in hex format
   * @param {string} ivHex - Initialization vector in hex format
   * @param {string} salt - Salt for key derivation
   * @param {string} passphrase - Passphrase for decryption
   * @returns {Promise<Object>} - Decrypted object
   */
  async decryptData(encryptedHex, ivHex, salt, passphrase) {
    try {
      // Convert hex to array buffer for Web Crypto API
      const encryptedData = this.hexToArrayBuffer(encryptedHex);
      const iv = this.hexToArrayBuffer(ivHex);
        // Derive key using PBKDF2
      const encoder = new TextEncoder();
      const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      );
      
      // Convert hex salt string to byte array for proper salt handling
      const saltBytes = this.hexToArrayBuffer(salt);
      
      const key = await window.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: saltBytes,
          iterations: 1000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-CBC', length: 256 },
        false,
        ['decrypt']
      );
      
      // Decrypt the data
      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-CBC', iv },
        key,
        encryptedData
      );
        // Convert ArrayBuffer to string
      const decoder = new TextDecoder();
      const decryptedText = decoder.decode(decrypted);
      
      console.log('Decryption successful');
      
      try {
        const parsedData = JSON.parse(decryptedText);
        return parsedData;
      } catch (parseError) {
        console.error('Error parsing decrypted JSON:', parseError);
        console.log('Decrypted text (first 50 chars):', decryptedText.substring(0, 50));
        throw parseError;
      }
    } catch (error) {
      console.error('Decryption failed:', error);
      console.log('Debug info:', {
        encryptedLength: encryptedHex ? encryptedHex.length : 'undefined',
        ivLength: ivHex ? ivHex.length : 'undefined',
        saltLength: salt ? salt.length : 'undefined',
        passphrasePresent: !!passphrase
      });
      throw error;
    }
  },
  
  /**
   * Convert hex string to ArrayBuffer
   * @param {string} hex - Hex string
   * @returns {ArrayBuffer} - Array buffer representation
   */
  hexToArrayBuffer(hex) {
    // Handle the case where hex is already chunked into an array
    if (Array.isArray(hex)) {
      return new Uint8Array(hex).buffer;
    }
    
    // Make sure we have a clean hex string with no spaces, etc.
    hex = hex.replace(/\s/g, '');
    
    // Check if the string is hex format
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      throw new Error('Input is not a valid hex string');
    }
    
    // Make sure the hex string has an even number of characters
    if (hex.length % 2 !== 0) {
      hex = '0' + hex; // Prepend a 0 if necessary
    }
    
    // Convert hex to bytes
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    
    return bytes.buffer;
  },
    /**
   * Generates a client-side passphrase from session data
   * @param {string} sessionId - Session ID from server
   * @returns {string} - Passphrase for decryption
   */
  generatePassphrase(sessionId) {
    // In a production environment, this would be more secure
    // For now, we'll use the same server secret to ensure compatibility
    // Note: The value should match process.env.SERVER_SECRET on the server
    // The default in crypto.js is 'fallback-secret-key-for-dev'
    return 'FuTmKsSzrsWLEol3BC8H6g+48+9mDh3yJnAU2uXCqVA=';
  }
};

// Export for use in other modules
// Ensure it's available globally immediately
window.clientCrypto = clientCrypto;
console.log('clientCrypto utility loaded and available at window.clientCrypto');
