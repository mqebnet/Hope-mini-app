import { fetchUserData, updateTopBar, getCachedUser } from './userData.js';
import { tonConnectUI } from './tonconnect.js';
import { canBootstrap, debounceButton } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  if (!canBootstrap('weeklydrop')) return;

  const rulesCheckbox = document.getElementById('rules-checkbox');
  const enterButton = document.getElementById('enter-contest-button');
  const statusEl = document.getElementById('eligibility-status');

  try {
    const cached = getCachedUser();
    if (cached) updateTopBar(cached);

    const user = await fetchUserData();
    updateTopBar(user);

    const eligRes = await fetch('/api/weeklyDrop/eligibility', {
      credentials: 'include'
    });
    const eligData = await eligRes.json();

    if (eligData.disabled) {
      statusEl.textContent = 'Weekly Drop is currently disabled. Check back soon.';
      return;
    }

    if (eligData.alreadyEntered) {
      statusEl.textContent = `You have already entered ${eligData.currentWeek}. Good luck!`;
      enterButton.disabled = true;
      return;
    }

    if (!eligData.eligible) {
      statusEl.textContent = eligData.reason || 'You are not eligible to enter.';
      return;
    }

    statusEl.textContent =
      `Eligible for ${eligData.currentWeek} - ${eligData.goldTickets} Gold tickets available.`;

    rulesCheckbox.addEventListener('change', () => {
      enterButton.disabled = !rulesCheckbox.checked;
    });

    enterButton.addEventListener('click', async () => {
      if (!debounceButton(enterButton, 3000)) return;

      try {
        statusEl.textContent = 'Getting TON amount...';
        enterButton.disabled = true;

        const priceRes = await fetch('/api/tonAmount/ton-amount?usd=0.5', {
          credentials: 'include'
        });
        if (!priceRes.ok) throw new Error('Failed to get TON amount');
        const { tonAmount, recipientAddress } = await priceRes.json();
        if (!recipientAddress) throw new Error('Payment recipient not configured');
        if (!tonAmount || tonAmount <= 0) throw new Error('Invalid TON amount');

        statusEl.textContent = 'Waiting for wallet confirmation...';

        const tx = await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 300,
          messages: [{
            address: recipientAddress,
            amount: (tonAmount * 1e9).toFixed(0)
          }]
        });

        const txHash = tx?.transaction?.hash
          || tx?.txid?.hash
          || tx?.hash
          || '';
        const txBoc = tx?.boc || '';

        if (!txHash && !txBoc) {
          throw new Error('Transaction proof missing - please try again');
        }

        statusEl.textContent = 'Verifying payment on-chain... please wait';

        const res = await fetch('/api/weeklyDrop/enter', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash, txBoc })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Entry failed');

        statusEl.textContent =
          `Entered ${data.week}! ${data.message} Gold tickets remaining: ${data.goldTickets}`;
        enterButton.disabled = true;
        rulesCheckbox.disabled = true;
      } catch (err) {
        console.error('Weekly drop entry error:', err);
        enterButton.disabled = !rulesCheckbox.checked;
        statusEl.textContent = `Entry failed: ${err.message}`;
      }
    });
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Unable to load eligibility. Please reopen the app.';
  }
});
