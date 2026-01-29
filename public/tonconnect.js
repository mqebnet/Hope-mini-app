// public/tonconnect.js
import { TonConnectUI } from '@tonconnect/ui';

/**
 * Single shared TON Connect UI instance
 * Used across the frontend
 */
export const tonConnectUI = new TonConnectUI({
  manifestUrl: 'https://YOUR_DOMAIN/tonconnect-manifest.json',

  // Enforce mainnet only
  network: 'mainnet',

  uiPreferences: {
    theme: 'DARK'
  }
});
