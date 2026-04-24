// public/tonconnect.js
import { TonConnectUI } from 'https://esm.sh/@tonconnect/ui@2.0.10';

const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`;

export const tonConnectUI = new TonConnectUI({
  buttonRootId: 'ton-connect-ui',
  manifestUrl,
  uiPreferences: { theme: 'DARK' }
});
