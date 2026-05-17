# Pontinho — Claude Code Context

## Stack & Deploy
- **Frontend**: React + Vite, Framer Motion, canvas-confetti → Vercel (auto on push to main)
- **Backend**: Node.js + Express + Socket.io → Render free tier (auto on push to main)
- **Local**: `cd server && node index.js` / `cd client && npm run dev`
- **Debug**: `?debug=true` → 🔧 panel (blocked in prod by NODE_ENV check)

## File Map
```
client/src/
  App.jsx           — splash/lobby/game routing, lang state ('en'|'pt'|'ro')
  translations.js   — ALL strings (T.en/ro/pt) + RULES_CONTENT; dynamic strings are functions
  components/
    Game.jsx        — main game UI (~1200 lines)
    Lobby.jsx       — 4 screens: landing/create/join/waiting
    GameMenu.jsx    — hamburger menu (rules, scores, mute, leave)
    Card.jsx        — card images from /cards/; rank 10→'0'; Joker→X1.png
    Avatar.jsx      — AVATAR_LIST of 10; randomBotAvatar(usedIds)
    DebugPanel.jsx  — scenario testing; bot card reveal toggle
server/
  index.js          — socket handlers (~700 lines); getPlayerListData(room) for broadcasts
  game/
    gameState.js    — all game logic; imports canWinByExtending from bots.js
    validator.js    — isValidSet/Run/WinningRun/Extension, canUseDiscardCard, canReplaceJoker
    bots.js         — executeBotTurn, findWinningMelds, shouldDrawDiscard, canWinByExtending (exported)
    deck.js         — createDeck, shuffle, deal
```

## Game Rules (authoritative)
- **108 cards** (2 decks + 4 Jokers), 2–8 players, 9 cards dealt
- **Sets**: 3–6 cards, same rank, **exactly 3 different suits**, max 2 per suit, no Jokers
- **Runs**: 3+ sequential same-suit; Joker in MIDDLE only (max 1 per run)
- **Winning runs**: Joker allowed at start OR end; Ace tried as 1 AND 14
- **Discard pick**: must use the card that turn in a run or any table meld extension; also allowed if it enables a winning hand (findWinningMelds / isValidWinningRun / canWinByExtending)
- **Jokers**: never discarded; steal by replacing with real card; Joker-at-edge meld forces immediate win (`usedWinningRun` flag blocks discard if hand > 1 card)
- **STOP**: tap opponent's discard → stopper must play out entire hand in 2 min; false STOP → PIOU penalty (stop+discard banned rest of round)
- **Scoring**: 2–K = face value, A = 1 (or 14 if multiple), Joker = 50; 200+ first time → reset to highest other score; 200+ second time → eliminated
- **Round rotation**: clockwise from `startingPlayerIndex` (not from winner)

## Critical Implementation Notes
1. **Card id=0 is falsy** — always use `=== null` / `!== null`, never `!id` (id 0 = A♥ deck 1)
2. **toggleReady** needs both `(data, callback)` params in socket handler
3. **processBotTurn** must guard: `if (room.game?.stopCalledBy) return`
4. **STOP snapshot** restores hands/melds/discardPile but NOT stopBanned/discardBanned
5. **iOS mute**: `bg.pause()` / `bg.play()` — `volume = 0` has no effect on iOS Safari
6. **draggedId**: backed by `draggedIdRef` (useRef) — handlers read `.current` to avoid stale closures
7. **getPlayerListData(room)** — always use this for playerList broadcasts (includes avatarId, difficulty, isReady)
8. **canGoOut(cards)** in gameState.js — lone Joker returns false (can't be discarded)
9. **data-player-id** on every player panel; **data-meld-id** on each meld div (used by fly animations)
10. **extendMeld discard rule**: picked discard card can extend any meld (set or run); "run only" rule only applies to new melds via playMeld
11. **Translation**: `const t = T[lang]` at top of each component; add new strings to all 3 languages
12. **getRooms** only returns `room.game === null` rooms; 2-min interval cleans empty rooms

## Bot System
- Difficulty: easy (2500ms, 40% meld, 15% STOP) → hard (1500ms, always melds/steals, always checks STOP)
- Gender-matched names: male avatars (sporty/nerdy/cool/grandpa/kid) → Brazilian male names ≤6 chars; female avatars → female names
- Colors: easy=#4caf50, medium=#f4a522, hard=#e63946

## Pending Security (not yet fixed)
- Set NODE_ENV=production on Render (closes debugSetState in prod)
- Validate `restoreGame` savedState server-side (whitelist fields)
- Host-only checks for addBot/removeBot/setRoomOptions/setDebugMode
- Input length limits on playerName/gameName/message

## Roadmap (top items)
- First turn redesign (visual float between piles, no keep/discard buttons)
- Round-by-round score history in scoreboard
- Host kick from waiting room
- Auto-sort hand button
- Low card warning (1–2 cards left indicator)
