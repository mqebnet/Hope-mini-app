// utils/priceHandler.js
const axios = require('axios');
const KeyValue = require('../models/KeyValue');

const TON_PRICE_CACHE_KEY = 'ton_price_usdt_cache_v1';

class PriceHandler {
  constructor() {
    this.cachedPrice = null;
    this.lastFetchedAt = 0;
    this.TTL = 60 * 1000; // fresh window
    this.STALE_TTL = Number(process.env.TON_PRICE_STALE_TTL_MS || 30 * 60 * 1000); // stale window
    this.hydrated = false;
    this.hydratingPromise = null;
  }

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

  async fetchFromCoingecko() {
    const res = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price',
      {
        params: {
          ids: 'the-open-network',
          vs_currencies: 'usdt'
        },
        timeout: 5000
      }
    );

    const price = res?.data?.['the-open-network']?.usdt;
    if (typeof price !== 'number') {
      throw new Error('Invalid Coingecko price response');
    }

    return price;
  }

  async fetchFromBinance() {
    const res = await axios.get(
      'https://api.binance.com/api/v3/ticker/price',
      { params: { symbol: 'TONUSDT' }, timeout: 5000 }
    );

    const price = Number(res.data?.price);
    if (!price || Number.isNaN(price)) {
      throw new Error('Invalid Binance price response');
    }

    return price;
  }

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
   * Convert USDT to TON
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
