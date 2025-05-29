/**
 * Utility functions for encryption/decryption
 */
const crypto = require('crypto');

// Get server secret from environment or use fallback for dev
const getServerSecret = () => process.env.SERVER_SECRET || 'fallback-secret-key-for-dev';

/**
 * Encrypts data using AES-256-CBC
 * @param {string} data - The data to encrypt
 * @returns {Object} - Object containing encrypted data, IV and salt
 */
const encrypt = (data) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.pbkdf2Sync(getServerSecret(), salt, 1000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    salt
  };
};

/**
 * Decrypts data using AES-256-CBC
 * @param {string} encryptedData - The encrypted data in hex
 * @param {string} ivHex - The initialization vector in hex
 * @param {string} salt - The salt used for key derivation
 * @returns {string} - The decrypted data
 */
const decrypt = (encryptedData, ivHex, salt) => {
  const key = crypto.pbkdf2Sync(getServerSecret(), salt, 1000, 32, 'sha256');
  const iv = Buffer.from(ivHex, 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

/**
 * Creates a verification hash for data integrity checking
 * @param {string} data - The data to create a verification hash for
 * @returns {string} - Short verification hash
 */
const createVerificationHash = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 8);
};

module.exports = {
  encrypt,
  decrypt,
  createVerificationHash
};
