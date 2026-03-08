# Games Engine Architecture

The app now uses a plugin-based games engine.

## Core Components

- `services/games/GameRegistry.js`
  - Registers all game plugins.
  - Validates plugin basics (`id`, `meta`).
- `services/games/GameEngine.js`
  - Central dispatcher (`invoke(gameId, method, ctx, payload)`).
  - Standardized error type: `GameEngineError`.
- `services/games/index.js`
  - Bootstraps and exports `gameEngine`.

## Built-in Plugins

- `services/games/plugins/flipcards.js`
  - Session-based skill game.
  - Supports: `start`, `move`, `complete`, `getSession`, `abandon`.
- `services/games/plugins/mysteryBox.js`
  - Paid reward box flow.
  - Supports: `start`, `getStatus`, `purchase`, `claim`.
  - Enforces:
    - `$0.15` payment
    - max `3` boxes daily
    - strict order: bronze -> silver -> gold
    - open current before next purchase
- `services/games/plugins/quiz.js`
  - Scaffold plugin for timed quiz gameplay.
  - Currently marked `coming-soon`.
- `services/games/plugins/treasureHunt.js`
  - Scaffold plugin for checkpoint/map clue gameplay.
  - Currently marked `coming-soon`.

## Routes

- Unified routes in `routes/games.js`:
  - `GET /api/games/catalog`
  - `POST /api/games/:gameId/start`
  - `POST /api/games/:gameId/move`
  - `POST /api/games/:gameId/complete`
  - `POST /api/games/:gameId/claim`
  - `POST /api/games/:gameId/purchase`
  - `GET /api/games/:gameId/status`
  - `GET /api/games/:gameId/session/:gameSessionId`
  - `DELETE /api/games/:gameId/session/:gameSessionId`

Legacy compatibility for existing Flip Cards frontend is preserved:
- `/api/games/flipcards/start`
- `/api/games/flipcards/move`
- `/api/games/flipcards/complete`
- `/api/games/flipcards/status/:gameSessionId`
- `/api/games/flipcards/:gameSessionId`

Mystery box routes now delegate to the engine:
- `routes/mysteryBox.js`
- `routes/boxes.js`

## Add New Game Plugin

1. Create file `services/games/plugins/<gameId>.js`.
2. Export object with:
   - `id`
   - `meta` (`name`, `description`, `icon`, ...)
   - game methods (`start`, etc).
3. Register plugin in `services/games/index.js`.
4. Game appears automatically in `GET /api/games/catalog`.
5. Frontend games launcher (`public/games.js`) will render it automatically.

## Bring Quiz/Treasure Hunt Live

- Quiz:
  - Add `QuizQuestion`/`QuizSession` models.
  - Implement `move` (answer submit) and `complete` (score + reward claim).
  - Add anti-cheat: answer-time floor, question randomization, signature checks.
- Treasure Hunt:
  - Add `HuntMap`/`HuntSession` models.
  - Implement `move` (checkpoint submit) and server-side clue validation.
  - Implement `complete` reward distribution + per-map daily limits.
