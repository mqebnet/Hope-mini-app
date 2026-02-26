// public/connectWallet.js
import { tonConnectUI } from './tonconnect.js';

document.addEventListener('DOMContentLoaded', async () => {
  const button = document.getElementById('ton-connect-button');
  if (!button) return;

  let busy = false;

  const updateUI = (wallet) => {
    if (wallet) {
      button.innerHTML = `<i data-lucide="wallet"></i> Connected`;
      button.classList.add('connected');
      button.disabled = true;
    } else {
      button.innerHTML = `<i data-lucide="wallet"></i> Connect Wallet`;
      button.classList.remove('connected');
      button.disabled = false;
    }
    if (window.lucide) lucide.createIcons();
  };

  try {
    // API compatibility across TonConnect UI versions
    if (typeof tonConnectUI.restoreConnection === 'function') {
      await tonConnectUI.restoreConnection();
    } else if (tonConnectUI.connectionRestored && typeof tonConnectUI.connectionRestored.then === 'function') {
      await tonConnectUI.connectionRestored;
    }
  } catch (err) {
    console.warn('Wallet restore failed:', err);
  }

  updateUI(tonConnectUI.wallet);

  tonConnectUI.onStatusChange((wallet) => {
    if (wallet && wallet.chain !== '-239') {
      alert('Switch to TON Mainnet!');
      tonConnectUI.disconnect();
      return;
    }

    updateUI(wallet);
  });

  button.addEventListener('click', async () => {
    if (busy || tonConnectUI.wallet) return;

    try {
      busy = true;
      button.disabled = true;
      await tonConnectUI.openModal();
    } catch (err) {
      console.error('Wallet connection failed:', err);
      button.disabled = false;
    } finally {
      busy = false;
    }
  });
});
