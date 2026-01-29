// marketPlace.js
import { fetchUserData, updateTopBar } from './userData.js';

const tg = window.Telegram.WebApp;
tg.ready();

let user = null;
let selectedTradeAmount = null;
let selectedTradeType = null;
let currentBox = null;
let puzzleTimer = null;
let timeLeft = 30;

// -------------------- BOOTSTRAP --------------------
document.addEventListener('DOMContentLoaded', async () => {
  const tgUser = tg.initDataUnsafe?.user;
  if (!tgUser) return alert("Telegram user not found");

  user = await fetchUserData();
  updateTopBar(user);

  initExchangeUI();
  initMysteryBoxes();
});

// -------------------- TICKET EXCHANGE --------------------
function initExchangeUI() {
  const typeSelect = document.getElementById('exchange-type');
  const amountButtons = document.querySelectorAll('.amount-option');
  const tradeBtn = document.getElementById('trade-button');

  tradeBtn.disabled = true;

  function refreshAvailability() {
    amountButtons.forEach(btn => {
      const amount = parseInt(btn.dataset.amount);
      const type = typeSelect.value;
      const balance = type === 'bronze' ? user.bronzeTickets : user.silverTickets;

      if (balance < amount) {
        btn.classList.add('disabled');
      } else {
        btn.classList.remove('disabled');
      }
    });
  }

  refreshAvailability();

  typeSelect.addEventListener('change', () => {
    selectedTradeAmount = null;
    tradeBtn.disabled = true;
    refreshAvailability();
  });

  amountButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) {
        showNotification('Not enough tickets. Keep playing!', 'info');
        return;
      }

      selectedTradeAmount = parseInt(btn.dataset.amount);
      selectedTradeType = typeSelect.value;
      tradeBtn.disabled = false;
      tradeBtn.classList.add('active');
    });
  });

  tradeBtn.addEventListener('click', async () => {
    if (!selectedTradeAmount) return;

    try {
      const txHash = await window.ton.connectAndSendTransaction(0.1);

      const res = await fetch('/api/marketplace/exchange-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: user.telegramId,
          fromType: selectedTradeType,
          quantity: selectedTradeAmount / 100,
          txHash
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      user = await fetchUserData();
      updateTopBar(user);
      refreshAvailability();
      tradeBtn.disabled = true;
      tradeBtn.classList.remove('active');

      showNotification('Trade successful!', 'success');
    } catch (err) {
      showNotification(err.message || 'Trade failed', 'error');
    }
  });
}

// -------------------- MYSTERY BOXES --------------------
function initMysteryBoxes() {
  document.querySelectorAll('.buy-box').forEach(btn => {
    btn.addEventListener('click', async () => {
      const boxType = btn.dataset.box;

      try {
        const txHash = await window.ton.connectAndSendTransaction(0.1);

        const res = await fetch('/api/marketplace/purchase-mystery-box', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegramId: user.telegramId,
            boxType,
            txHash
          })
        });

        const box = await res.json();
        if (!res.ok) throw new Error(box.error);

        currentBox = box;
        openPuzzle(box);
      } catch (err) {
        showNotification(err.message || 'Purchase failed', 'error');
      }
    });
  });
}

// -------------------- PUZZLE GAME --------------------
function openPuzzle(box) {
  const game = document.getElementById('puzzle-game');
  const timerEl = document.getElementById('puzzle-timer');

  game.classList.remove('hidden');
  generatePuzzle(box.memeImage);

  timeLeft = 30;
  timerEl.textContent = timeLeft;

  puzzleTimer = setInterval(() => {
    timeLeft--;
    timerEl.textContent = timeLeft;

    if (timeLeft <= 0) {
      clearInterval(puzzleTimer);
      closePuzzle(false);
    }
  }, 1000);
}

function closePuzzle(success) {
  clearInterval(puzzleTimer);
  document.getElementById('puzzle-game').classList.add('hidden');

  if (!success) {
    showNotification('Unlucky! Try again?', 'error');
  }
}

async function claimPuzzleReward() {
  try {
    const res = await fetch('/api/marketplace/claim-mystery-box', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramId: user.telegramId,
        boxType: currentBox.boxType
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    user = await fetchUserData();
    updateTopBar(user);
    showNotification('Rewards claimed!', 'success');
  } catch (err) {
    showNotification(err.message || 'Claim failed', 'error');
  }
}

// -------------------- PUZZLE CORE (STUB) --------------------
function generatePuzzle(imageUrl) {
  // This hooks into your existing drag/drop + touch engine
  // When all pieces are correct, call:
  // onPuzzleSolved();
}

function onPuzzleSolved() {
  clearInterval(puzzleTimer);
  showConfetti();
  document.getElementById('claim-mystery-box-button').style.display = 'block';
  triggerHapticFeedback('medium');
}
