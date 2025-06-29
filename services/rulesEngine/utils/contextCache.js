const logger = require('../../../config/logger');
const config = require('../config');

/**
 * Intelligent context cache with TTL support
 */
class ContextCache {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map();
    this.maxSize = config.CONTEXT_CACHE_MAX_SIZE;
  }

  /**
   * Get value from cache or fetch using provided function
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data if not in cache
   * @param {number} ttlMs - TTL in milliseconds
   * @returns {Promise<*>} Cached or fetched value
   */
  async get(key, fetchFn, ttlMs = config.CONTEXT_CACHE_TTL_MS) {
    // Check if key exists and is not expired
    if (this.cache.has(key)) {
      const expiryTime = this.ttl.get(key);
      if (Date.now() < expiryTime) {
        logger.debug(`ContextCache: Cache hit for key: ${key}`);
        return this.cache.get(key);
      } else {
        // Expired, remove from cache
        this.cache.delete(key);
        this.ttl.delete(key);
        logger.debug(`ContextCache: Cache expired for key: ${key}`);
      }
    }

    // Cache miss or expired, fetch new data
    logger.debug(`ContextCache: Cache miss for key: ${key}, fetching...`);
    try {
      const value = await fetchFn();
      this.set(key, value, ttlMs);
      return value;
    } catch (error) {
      logger.error(`ContextCache: Error fetching data for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set value in cache with TTL
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttlMs - TTL in milliseconds
   */
  set(key, value, ttlMs = config.CONTEXT_CACHE_TTL_MS) {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.ttl.delete(firstKey);
      logger.debug(`ContextCache: Evicted oldest entry: ${firstKey}`);
    }

    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + ttlMs);
    logger.debug(`ContextCache: Cached value for key: ${key}, TTL: ${ttlMs}ms`);
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is valid
   */
  has(key) {
    if (!this.cache.has(key)) return false;
    
    const expiryTime = this.ttl.get(key);
    if (Date.now() >= expiryTime) {
      this.cache.delete(key);
      this.ttl.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Clear all cached entries
   */
  clear() {
    this.cache.clear();
    this.ttl.clear();
    logger.debug('ContextCache: Cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, expiryTime] of this.ttl.entries()) {
      if (now >= expiryTime) {
        this.cache.delete(key);
        this.ttl.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug(`ContextCache: Cleaned up ${cleanedCount} expired entries`);
    }
  }
}

// Create singleton instance
const contextCache = new ContextCache();

// Set up periodic cleanup
setInterval(() => {
  contextCache.cleanup();
}, config.CONTEXT_CACHE_TTL_MS);

module.exports = contextCache;
