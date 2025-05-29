/**
 * Test script for encryption/decryption
 * Run this with: node utils/test-crypto.js
 */
const crypto = require('./crypto');
require('dotenv').config();

// Test data
const testData = JSON.stringify({
  supabaseUrl: 'https://test-url.supabase.co',
  supabaseKey: 'test-key-for-supabase'
});

console.log('Original data:', testData);

// Encrypt
console.log('\n--- ENCRYPTING ---');
const encrypted = crypto.encrypt(testData);
console.log('Encrypted:', {
  encryptedData: encrypted.encryptedData.substring(0, 20) + '...',
  iv: encrypted.iv,
  salt: encrypted.salt
});

// Decrypt
console.log('\n--- DECRYPTING ---');
const decrypted = crypto.decrypt(encrypted.encryptedData, encrypted.iv, encrypted.salt);
console.log('Decrypted:', decrypted);

// Verify
console.log('\n--- VERIFICATION ---');
const verification = crypto.createVerificationHash(testData);
console.log('Verification hash:', verification);

// Test if the decryption matches the original
console.log('\n--- RESULT ---');
if (decrypted === testData) {
  console.log('SUCCESS: Encryption and decryption working correctly!');
} else {
  console.error('ERROR: Decrypted data does not match original!');
}
