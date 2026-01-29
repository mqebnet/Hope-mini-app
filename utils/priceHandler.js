// utils/priceHandler.js
const axios = require('axios');

class PriceHandler {
  constructor() {
    this.cachedPrice = null;
    this.lastFetchedAt = 0;
    this.TTL = 60 * 1000; // 1 minute
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

  async getTonPriceUSDT() {
    const now = Date.now();

    if (this.cachedPrice && now - this.lastFetchedAt < this.TTL) {
      return this.cachedPrice;
    }

    try {
      this.cachedPrice = await this.fetchFromCoingecko();
    } catch (cgErr) {
      console.warn('Coingecko failed:', cgErr.message);
      try {
        this.cachedPrice = await this.fetchFromBinance();
      } catch (bnErr) {
        console.error('Binance failed:', bnErr.message);

        if (this.cachedPrice) {
          return this.cachedPrice; // fallback to last known good price
        }

        throw new Error('Failed to fetch TON price from all sources');
      }
    }

    this.lastFetchedAt = now;
    return this.cachedPrice;
  }

  /**
   * Convert USDT → TON
   */
  async usdtToTon(usdtAmount) {
    if (typeof usdtAmount !== 'number' || usdtAmount <= 0) {
      throw new Error('Invalid USDT amount');
    }

    const tonPrice = await this.getTonPriceUSDT();
    return Number((usdtAmount / tonPrice).toFixed(6));
  }
}

module.exports = new PriceHandler();
