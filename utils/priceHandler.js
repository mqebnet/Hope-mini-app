// utils/priceHandler.js
const axios = require('axios');
const KeyValue = require('../models/KeyValue');

/**
 * Database key for TON price cache
 * @type {string}
 */
const TON_PRICE_CACHE_KEY = 'ton_price_usdt_cache_v1';

/**
 * **PriceHandler** - Singleton for managing TON/USDT price with caching
 *
 * **Features:**
 * - In-memory cache with configurable TTL (fresh: 60s, stale fallback: 30min)
 * - Persistence to MongoDB (KeyValue) for recovery on restart
 * - Fallback to Binance if Coingecko fails
 * - `allowStale` option to use old price if all sources fail
 *
 * **Usage:**
 * ```javascript
 * const price = await priceHandler.getTonPriceUSDT();
 * const tonAmount = await priceHandler.usdtToTon(0.3);
 * ```
 */
class PriceHandler {
  /**
   * Initialize price handler
   */
  constructor() {
    this.cachedPrice = null;
    this.lastFetchedAt = 0;
    this.TTL = 60 * 1000; // fresh window
    this.STALE_TTL = Number(process.env.TON_PRICE_STALE_TTL_MS || 30 * 60 * 1000); // stale window
    this.hydrated = false;
    this.hydratingPromise = null;
  }

  /**
   * Load price cache from database on startup
   * @async
   * @private
   * @returns {Promise<void>}
   */
  async hydrateCacheFromDb() {
    if (this.hydrated) return;
    if (this.hydratingPromise) return this.hydratingPromise;

    this.hydratingPromise = (async () => {
      try {
        const doc = await KeyValue.findOne({ key: TON_PRICE_CACHE_KEY }).lean();
        const persistedPrice = Number(doc?.value?.price);
        const persistedFetchedAt = Number(doc?.value?.fetchedAt);

        if (persistedPrice > 0 && Number.isFinite(persistedFetchedAt)) {
          this.cachedPrice = persistedPrice;
          this.lastFetchedAt = persistedFetchedAt;
          console.log('Loaded persisted TON price cache');
        }
      } catch (err) {
        console.warn('Failed to hydrate TON price cache:', err.message);
      } finally {
        this.hydrated = true;
        this.hydratingPromise = null;
      }
    })();

    return this.hydratingPromise;
  }

  /**
   * Persist current price cache to database
   * @async
   * @private
   * @returns {Promise<void>}
   */
  async persistCacheToDb() {
    if (!this.cachedPrice || !this.lastFetchedAt) return;

    try {
      await KeyValue.findOneAndUpdate(
        { key: TON_PRICE_CACHE_KEY },
        {
          $set: {
            value: {
              price: this.cachedPrice,
              fetchedAt: this.lastFetchedAt
            }
          }
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.warn('Failed to persist TON price cache:', err.message);
    }
  }

  /**
   * Fetch TON price from Coingecko API
   * @async
   * @private
   * @returns {Promise<number>} TON price in USDT
   * @throws {Error} If Coingecko response is invalid
   */
  async fetchFromCoingecko() {
    const res = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price',
      {
        params: {
          ids: 'the-open-network,toncoin',
          vs_currencies: 'usdt,usd'
        },
        timeout: 5000
      }
    );

    const data = res?.data || {};
    const candidates = [
      data?.['the-open-network']?.usdt,
      data?.['toncoin']?.usdt,
      data?.['the-open-network']?.usd,
      data?.['toncoin']?.usd
    ].map((v) => Number(v));

    const price = candidates.find((v) => Number.isFinite(v) && v > 0);
    if (!price) {
      throw new Error('Invalid Coingecko price response');
    }

    return price;
  }

  /**
   * Fetch TON price from Binance API (fallback if Coingecko fails)
   * @async
   * @private
   * @returns {Promise<number>} TON price in USDT
   * @throws {Error} If both Binance endpoints fail
   */
  async fetchFromBinance() {
    const symbols = ['TONUSDT', 'TONFDUSD'];
    let lastErr;

    for (const symbol of symbols) {
      try {
        const res = await axios.get(
          'https://api.binance.com/api/v3/ticker/price',
          { params: { symbol }, timeout: 5000 }
        );

        const price = Number(res.data?.price);
        if (Number.isFinite(price) && price > 0) {
          return price;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    const status = lastErr?.response?.status;
    const details = lastErr?.response?.data?.msg || lastErr?.message || 'Unknown error';
    throw new Error(`Invalid Binance price response${status ? ` (${status})` : ''}: ${details}`);
  }

  /**
   * Get current TON price in USDT
   * Tries fresh cache → Coingecko → Binance → stale cache
   * @async
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.allowStale=false] - Fall back to stale cache if fetch fails
   * @returns {Promise<number>} TON price in USDT (e.g., 6.5)
   * @throws {Error} If all sources fail and allowStale=false
   * @example
   * const price = await priceHandler.getTonPriceUSDT();
   * console.log(price); // 6.42
   */
  async getTonPriceUSDT(options = {}) {
    const { allowStale = false } = options;
    const now = Date.now();

    await this.hydrateCacheFromDb();

    if (this.cachedPrice && now - this.lastFetchedAt < this.TTL) {
      return this.cachedPrice;
    }

    try {
      this.cachedPrice = await this.fetchFromCoingecko();
      this.lastFetchedAt = now;
      await this.persistCacheToDb();
      return this.cachedPrice;
    } catch (cgErr) {
      console.warn('Coingecko failed:', cgErr.message);
    }

    try {
      this.cachedPrice = await this.fetchFromBinance();
      this.lastFetchedAt = now;
      await this.persistCacheToDb();
      return this.cachedPrice;
    } catch (bnErr) {
      console.error('Binance failed:', bnErr.message);
    }

    if (allowStale && this.cachedPrice && now - this.lastFetchedAt <= this.STALE_TTL) {
      console.warn('Using stale cached TON price');
      return this.cachedPrice;
    }

    throw new Error('Failed to fetch TON price from all sources');
  }

  /**
   * Convert USDT amount to equivalent TON
   * @async
   * @param {number} usdtAmount - Amount in USDT
   * @param {Object} [options={}] - Options passed to getTonPriceUSDT
   * @param {boolean} [options.allowStale=false] - Allow using stale price
   * @returns {Promise<number>} Equivalent amount in TON (6 decimals)
   * @throws {Error} If usdtAmount is invalid or price fetch fails
   * @example
   * const tonAmount = await priceHandler.usdtToTon(0.3);
   * console.log(tonAmount); // 0.046731
   */
  async usdtToTon(usdtAmount, options = {}) {
    if (typeof usdtAmount !== 'number' || usdtAmount <= 0) {
      throw new Error('Invalid USDT amount');
    }

    const tonPrice = await this.getTonPriceUSDT(options);
    return Number((usdtAmount / tonPrice).toFixed(6));
  }
}

module.exports = new PriceHandler();
