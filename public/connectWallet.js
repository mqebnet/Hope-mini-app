import { tonConnectUI } from './tonconnect.js';

document.addEventListener('DOMContentLoaded', async () => {
  const button = document.getElementById('ton-connect-button');
  if (!button) return;

  let busy = false;

  const updateUI = (wallet) => {
    if (wallet) {
      button.innerHTML = `<i data-lucide="wallet"></i> Connected`;
      button.classList.add('connected');
      button.disabled = true; // prevent accidental disconnect
    } else {
      button.innerHTML = `<i data-lucide="wallet"></i> Connect Wallet`;
      button.classList.remove('connected');
      button.disabled = false;
    }
    lucide.createIcons();
  };

  // Wait for wallet restoration
  await tonConnectUI.restoreConnection();
  updateUI(tonConnectUI.wallet);

  // React to wallet changes
tonConnectUI.onStatusChange(wallet => {
  if (wallet && wallet.chain !== '-239') { // -239 = mainnet ID
    alert('Switch to TON Mainnet!');
    tonConnectUI.disconnect();
    return;
  }
  updateUI(wallet);
  if (wallet) {
    // Link to user ID (backend call)
    fetch('/api/link-wallet', {
      method: 'POST',
      body: JSON.stringify({ address: wallet.account.address }),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('jwt')}` }
    });
  }
});

  // Connect wallet
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
