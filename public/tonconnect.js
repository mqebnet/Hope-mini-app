// public/tonconnect.js
import { TonConnectUI } from '@tonconnect/ui';

/**
 * Single shared TON Connect UI instance
 * Used across the frontend
 */
export const tonConnectUI = new TonConnectUI({
  manifestUrl: 'https://529c-197-211-63-6.ngrok-free.app /tonconnect-manifest.json',

  // Enforce mainnet only
  network: 'mainnet',

  uiPreferences: {
    theme: 'DARK'
  }
});
