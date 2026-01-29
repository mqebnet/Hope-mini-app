// config.js
const API_CONFIG = {
    BASE_URL: ' https://86035ae134b2.ngrok-free.app',
    HEADERS: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true', // Bypass ngrok warning
      'Authorization': `Telegram ${window.Telegram.WebApp.initData}`
      
    }
  };
  
  