// marketPlace.js
import { fetchUserData, updateTopBar } from './userData.js';
import { tonConnectUI } from './tonconnect.js';

const tg = window.Telegram?.WebApp;
if (tg) tg.ready();

let user = null;
let selectedTradeAmount = null;
let selectedTradeType = null;
let currentBox = null;
let puzzleTimer = null;
let timeLeft = 30;

// -------------------- BOOTSTRAP --------------------
document.addEventListener('DOMContentLoaded', async () => {
  const tgUser = tg?.initDataUnsafe?.user;
  if (!tgUser) return alert("Telegram user not found");

  user = await fetchUserData();
  updateTopBar(user);

  initMarketplaceTabs();
  initExchangeUI();
  initMysteryBoxes();
});

function initMarketplaceTabs() {
  const tabs = document.querySelectorAll('.market-tab');
  const sections = {
    puzzles: document.getElementById('puzzles-section'),
    exchange: document.getElementById('exchange-section')
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle('active', t === tab));

      Object.entries(sections).forEach(([key, section]) => {
        if (!section) return;
        section.classList.toggle('active', key === target);
      });
    });
  });
}

// -------------------- TICKET EXCHANGE --------------------
function updateExchangePreview(tradeType, amount) {
  // Simple 1:1 exchange rates (bronze -> silver, silver -> gold)
  const exchangeRates = {
    bronze: 1,   // 100 bronze = 100 silver
    silver: 1    // 100 silver = 100 gold
  };

  const rate = exchangeRates[tradeType] || 1;
  const toAmount = Math.floor(amount * rate);

  const fromLabel = tradeType === 'bronze' ? '🟫 Bronze' : '🟩 Silver';
  const toLabel = tradeType === 'bronze' ? '🟩 Silver' : '🟨 Gold';

  const fromDiv = document.getElementById('from-ticket');
  const toDiv = document.getElementById('to-ticket');

  if (fromDiv) fromDiv.textContent = `${amount} ${fromLabel}`;
  if (toDiv) toDiv.textContent = `${toAmount} ${toLabel}`;
}

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
    tradeBtn.classList.remove('active');
    
    // Clear preview
    const fromDiv = document.getElementById('from-ticket');
    const toDiv = document.getElementById('to-ticket');
    if (fromDiv) fromDiv.textContent = '';
    if (toDiv) toDiv.textContent = '';
    
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

      // Update preview display
      updateExchangePreview(selectedTradeType, selectedTradeAmount);
    });
  });

  tradeBtn.addEventListener('click', async () => {
    if (!selectedTradeAmount) return;

    try {
      if (!tonConnectUI.wallet) {
        throw new Error('Please connect your wallet first');
      }

      const res = await fetch('/api/exchangeTickets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromType: selectedTradeType,
          quantity: selectedTradeAmount / 100
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
  const puzzleContainer = document.getElementById('puzzle-area'); // Add <div id="puzzle-area"></div> to HTML
  puzzleContainer.innerHTML = '';
  const pieces = 10;
  const cols = 5, rows = 2; // Simple grid
  const pieceWidth = 100 / cols, pieceHeight = 100 / rows;

  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement('div');
    piece.className = 'puzzle-piece';
    piece.style.backgroundImage = `url(${imageUrl})`;
    piece.style.backgroundPosition = `${-(i % cols) * pieceWidth}% ${-Math.floor(i / cols) * pieceHeight}%`;
    piece.style.width = `${pieceWidth}%`;
    piece.style.height = `${pieceHeight}%`;
    piece.draggable = true;
    piece.dataset.index = i;
    puzzleContainer.appendChild(piece); // Shuffle: append in random order
  }

  // Drag-drop logic (simplified - add full event listeners for dragstart, dragover, drop)
  puzzleContainer.addEventListener('dragover', e => e.preventDefault());
  puzzleContainer.addEventListener('drop', e => {
    const from = document.activeElement;
    const to = e.target;
    if (from !== to && to.classList.contains('puzzle-piece')) {
      const temp = to.cloneNode(true);
      to.parentNode.replaceChild(temp, to);
      to.parentNode.replaceChild(to, from);
      checkPuzzleComplete();
    }
  });
}

function checkPuzzleComplete() {
  const pieces = document.querySelectorAll('.puzzle-piece');
  let correct = true;
  pieces.forEach((p, i) => { if (p.dataset.index != i) correct = false; });
  if (correct) onPuzzleSolved();
}

function onPuzzleSolved() {
  clearInterval(puzzleTimer);
  showConfetti();
  document.getElementById('claim-mystery-reward-button').style.display = 'block';
  triggerHapticFeedback('medium');
}

// -------------------- UTILITY FUNCTIONS --------------------
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

function showConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

function triggerHapticFeedback(pattern = 'light') {
  const tg = window.Telegram?.WebApp;
  if (tg?.HapticFeedback) {
    tg.HapticFeedback.impactOccurred(pattern);
  }
}
