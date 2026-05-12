# Pontinho with Family — Project Context for Claude Code

## Project Overview
A multiplayer browser-based card game called "Pontinho" — a traditional Brazilian card game. Built with React + Vite (frontend) and Node.js + Socket.io (backend). Deployed live at https://pontinho-six.vercel.app/

## Repository
- GitHub: https://github.com/milobogdan/pontinho.git
- Local: C:\Users\Bogdan\Desktop\card-game\
- Frontend deploy: Vercel (auto-deploys on push to main)
- Backend deploy: Render (auto-deploys on push to main)

## Tech Stack
- **Frontend**: React + Vite, Framer Motion, canvas-confetti
- **Backend**: Node.js + Express + Socket.io
- **Hosting**: Vercel (client) + Render free tier (server)
- **Fonts**: Fredoka One + Nunito (Google Fonts)

## File Structure
```
card-game/
  client/
    public/
      pontinho.jpg          ← splash screen box art image
      cardback.jpg          ← custom card back image
      cards/                ← card face images from deckofcardsapi.com (0-9,A,J,Q,K + S,H,D,C + X1.png joker)
      avatars/              ← 10 cartoon avatar PNGs (sporty/nerdy/cool/grandpa/kid/curly/ponytail/grandma/business/pigtails)
      sounds/               ← card.wav, win.wav, stop.wav, error.mp3, piou.m4a, background.mp3, turn.wav
    src/
      App.jsx               ← splash screen, language toggle, routing between splash/lobby/game
      App.css               ← global styles
      socket.js             ← Socket.io client connection
      index.css             ← root styles, body background
      translations.js       ← ALL translations (EN/RO/PT) for every string in the app + RULES_CONTENT
      components/
        Card.jsx            ← card component (small/medium/normal sizes, uses card images from /cards/)
        Game.jsx            ← main game UI (~1200 lines, the biggest file)
        Lobby.jsx           ← beautiful lobby with 4 screens: landing/create/join/waiting
        Avatar.jsx          ← avatar component + AvatarPicker + AVATAR_LIST
        GameMenu.jsx        ← hamburger menu (rules, scores, mute, leave)
        DebugPanel.jsx      ← debug tool (only shows with ?debug=true URL param)
  server/
    index.js                ← Socket.io server, all socket handlers (~700 lines)
    game/
      deck.js               ← createDeck, shuffle, deal
      gameState.js          ← all game logic functions (~450 lines)
      validator.js          ← isValidSet, isValidRun, isValidWinningRun, isValidExtension, canUseDiscardCard etc.
      bots.js               ← executeBotTurn, findWinningMelds, autoBotPick
```

---

## Complete Game Rules

### Setup
- 108 cards (2 decks + 4 Jokers), 2–8 players, 9 cards dealt each
- Discard pile starts empty
- Cards spread face-down, each player picks one → highest card = dealer → player to LEFT goes first
- Suit tiebreaker: ♠ > ♥ > ♦ > ♣

### First Player Special Turn
- Draw a card → keep OR discard and draw another
- Cannot discard Jokers (ever)
- Must end turn with a discard OR go out

### Normal Turn
1. Draw from pile OR take top discard (must use in a run that turn, OR if it completes a winning set/run)
2. Optionally play melds / extend existing melds on table
3. Must discard to end turn OR go out (play all cards)

### Melds
**Sets:**
- Exactly 3 cards, same rank, 3 DIFFERENT suits. No Jokers.
- Can extend with same-rank cards of those 3 suits only (max 6 cards, max 2 per suit)

**Runs:**
- 3+ sequential same-suit cards
- Joker only in MIDDLE (not start/end), max 1 Joker per run
- EXCEPTION when winning: Joker CAN be at start or end
- No Jack alongside Joker at end rule was REMOVED

### Picking from Discard
- Must be able to use it in a run (normal play)
- Exception: can pick if it completes a WINNING set (all remaining cards form valid melds)
- Exception: can pick if picking + hand forms a winning run (isValidWinningRun)
- Must actually use the picked card (in a run, or winning set/run)

### Joker Rules
- Can NEVER be discarded
- Can steal a Joker from a table run by replacing with the real card it represents
- Max 1 Joker per run (normal play)
- During STOP phase: all melds use winning rules (Joker at start/end allowed)

### STOP Mechanic (REVISED)
- When another player discards → tap the discard card to call STOP
- Discard card added to stopper's hand automatically
- Stopper plays on the NORMAL game screen (same UI, no separate screen)
- Other players see game frozen with countdown banner
- Stopper has 2 minutes to play all cards and win
- Reset button: stopper can undo their plays and try different combinations
- False STOP: give up button OR timer runs out → snapshot restored, penalty applied
- Penalty: STOP banned + discard banned for rest of round → PIOU! 😤
- Bots also use STOP (hard: always checks, easy: 15% chance)

### Winning a Round
- First to empty hand wins
- Others count remaining cards: 2-K = face value, A = 1 (or 14 if multiple aces), Joker = 50

### Explosion Rule
- Hit 200+ pts first time → reset to highest other player's score (once per game)
- Hit 200+ second time → eliminated
- Last player standing wins

### Round Rotation
- Clockwise from previous round's startingPlayerIndex (NOT from winner)

---

## Game State Fields (server/game/gameState.js)
```javascript
{
  status: 'waiting' | 'picking' | 'playing' | 'roundEnd' | 'gameOver',
  round: number,
  players: [{
    id, name, isBot, difficulty, avatarId,
    hand: [], totalScore, hasExploded, eliminated,
    stopBanned, discardBanned, isReady, isDisconnected,
  }],
  currentPlayerIndex: number,
  startingPlayerIndex: number,
  turnPhase: 'firstDraw' | 'firstKeepOrDiscard' | 'draw' | 'play',
  drawPile: [],
  discardPile: [],
  melds: [{ id, ownerId, type: 'set'|'run', cards: [] }],
  pickedFromDiscard: boolean,
  pickedDiscardCard: card | null,
  stopCalledBy: playerId | null,
  stopDeadline: timestamp | null,
  stopOriginalPlayerIndex: number,
  stopOriginalPhase: string,
  stopSnapshot: { hands, melds, discardPile } | null,
  lastDiscardedBy: playerId | null,
}
```

---

## Key Server Socket Events (server/index.js)

### Room Management
- `createRoom` ({ playerName, avatarId, gameName, maxPlayers, isPrivate })
- `joinRoom` ({ code, playerName, avatarId })
- `leaveRoom` ()
- `rejoinRoom` ({ roomCode, playerId }) — reconnection
- `getRooms` () → list of public open rooms
- `addBot` ({ difficulty })
- `removeBot` ({ botId })
- `setRoomOptions` ({ gameName, maxPlayers, isPrivate })
- `toggleReady` (data, callback) — IMPORTANT: takes data AND callback
- `sendLobbyMessage` ({ message })
- `startGame` ()

### Game Actions
- `pickCard` ({ cardId }) — picking phase
- `firstDraw` ()
- `firstKeepOrDiscard` ({ keep: boolean })
- `drawFromPile` ()
- `drawFromDiscard` ()
- `playMeld` ({ cardIds })
- `extendMeld` ({ meldId, cardIds })
- `discardCard` ({ cardId })
- `stealJoker` ({ meldId, replacementCardId })
- `initiateStop` ({ claimedCardId })
- `declareFalseStop` (data, callback)
- `resetStop` () — undo plays during STOP, try again
- `startNextRound` ()
- `getGameState` (callback)

### Debug (local only)
- `debugSetState` ({ hand, discardCard, melds, phase })

### Server Broadcasts
- `gameState` — full game state (personalized per player)
- `playerList` — lobby player list
- `gameStarted` — game has started
- `playerDisconnected` ({ playerId, playerName, deadline })
- `playerReconnected` ({ playerId, playerName })
- `stopTimeout` — false STOP by timeout
- `lobbyMessage` ({ playerId, playerName, avatarId, message })
- `playerLeft` ({ name })
- `youAreHost` — you are now the host
- `roomOptions` ({ gameName, maxPlayers, isPrivate })

---

## Frontend Key Components

### App.jsx
- Screens: 'splash' | 'lobby' | 'game'
- Language state: 'en' | 'pt' | 'ro'
- Imports `T` and `RULES_CONTENT` from `translations.js`
- Passes `lang` prop to both `<Lobby>` and `<Game>`
- Splash screen: full-screen image with blurred background, language toggle, PLAY + Rules buttons

### translations.js
- Central store for ALL UI strings in EN, RO, PT
- `export default T` — object with `T.en`, `T.ro`, `T.pt`, each containing every key
- `export { RULES_CONTENT }` — rules text by language (used by App splash and GameMenu)
- Dynamic strings are functions: `t.sTurn(name)`, `t.playMeld(n)`, `t.wins(name)`, etc.
- Used by: App.jsx, Lobby.jsx, Game.jsx, GameMenu.jsx
- Adding a new string: add the key to all 3 language objects in translations.js

### Lobby.jsx (4 screens)
- Accepts `lang` prop, derives `const t = T[lang]` at top
- **landing**: avatar picker, name input, Create/Join buttons, Back to Start
- **create**: game name, max players (2-8), public/private toggle
- **join**: room list with filters (all/open/full), private code entry
- **waiting**: room code display, player avatars, chat bubbles, bot controls, ready/start

### Game.jsx (main game, ~1200 lines)
- Accepts `lang` prop, derives `const t = T[lang]` at top, passes `lang` to GameMenu
- Accepts `onLeave` prop — called only from game over screen (not round end)

Key states:
```javascript
const [gameState, setGameState] = useState(null);
const [selectedCards, setSelectedCards] = useState([]);
const [handOrder, setHandOrder] = useState([]);
const [draggedId, setDraggedId] = useState(null);
const [stopCountdown, setStopCountdown] = useState(120);
const [newCardId, setNewCardId] = useState(null);        // gold glow on drawn card
const [piouActive, setPiouActive] = useState(false);     // PIOU flash
const [disconnectInfo, setDisconnectInfo] = useState(null);
const [disconnectCountdown, setDisconnectCountdown] = useState(30);
const [isMuted, setIsMuted] = useState(false);
const [flyAnim, setFlyAnim] = useState(null);            // { fromX, fromY, toX, toY, hidden }
const [showRoundEnd, setShowRoundEnd] = useState(false); // 2.2s delay before scoreboard
```

Key refs:
```javascript
const touchStartRef = useRef(null);
const isDraggingRef = useRef(false);
const prevIsMyTurnRef = useRef(false);
const bgMusicRef = useRef(null);
const handContainerRef = useRef(null);
const prevTurnPhaseRef = useRef(null);   // detects firstKeepOrDiscard exit
const prevGameStateRef = useRef(null);   // detects opponent draw/discard for fly animation
const drawPileRef = useRef(null);        // DOM ref for fly animation origin
const discardPileRef = useRef(null);     // DOM ref for fly animation origin
```

Key derived values:
```javascript
const me = gameState.players.find(p => p.id === roomInfo.playerId);
const others = gameState.players.filter(p => p.id !== roomInfo.playerId);
const currentPlayer = gameState.players[gameState.currentPlayerIndex];
const isMyTurn = currentPlayer?.id === roomInfo.playerId;
const topDiscard = gameState.discardPile.at(-1);
const phase = gameState.turnPhase;
const isDebug = new URLSearchParams(window.location.search).get('debug') === 'true';
```

### Card.jsx
- Sizes: small (48x68), medium (responsive), normal (62-84 x 90-120 depending on mobile)
- Uses images from `/cards/` folder (deckofcardsapi.com format: rank+suit, 10='0')
- Joker uses `/cards/X1.png`
- Card back uses `/cardback.jpg`
- `objectFit: 'cover'`, `borderRadius: 7`
- `WebkitTouchCallout: 'none'` to prevent iOS long-press menu
- `selected` prop: lifts card translateY(-14px) with gold glow

### Avatar.jsx
- `Avatar` component: just an img tag, `objectFit: 'contain'`, no circular clip
- `AvatarPicker`: grid of 10 avatars, gold border on selected
- `AVATAR_LIST`: [{id, label}] — sporty/nerdy/cool/grandpa/kid/curly/ponytail/grandma/business/pigtails
- `randomBotAvatar(usedIds)`: returns random unused avatar id

### GameMenu.jsx
- Accepts `lang` prop, derives `const t = T[lang]` and `const rules = RULES_CONTENT[lang]`
- Slides in from LEFT side
- Panels: null (menu) | 'rules' | 'scores' | 'leave'
- Rules content comes from RULES_CONTENT[lang] (localized)
- Scores sorted by totalScore ascending

---

## Translation System

All UI strings live in `client/src/translations.js`. Every component receives `lang` from App.jsx.

Key groups in T[lang]:
- Splash: `play`, `rules`, `rulesTitle`, `subtitle`
- Lobby: `createGame`, `joinGame`, `yourName`, `gameName`, `maxPlayers`, `public`, `private`, `createRoom`, `join`, `back`, `leaveRoom`, `addBots`, `easy`, `medium`, `hard`, `tapWhenReady`, `ready`, `startGame`, `waitingForPlayers`, etc.
- Game: `round`, `yourTurn`, `sTurn(name)`, `yourHand`, `keep`, `discardAndRedraw`, `stop`, `giveUp`, `reset`, `piouBanned`, `stopBanner(name, secs)`, `playMeld(n)`, `selectCardsHint`
- Round/GameOver: `roundOver`, `gameOver`, `wins(name)`, `winsShort(name)`, `nextRound`, `backToHome`, `scoreboard`
- GameMenu: `menu`, `muteMusic`, `unmuteMusic`, `on`, `off`, `rulesMenu`, `scoresMenu`, `leaveGame`, `leaveGameQ`, `replacedByBot`, `yesLeave`, `cancel`, `cardsInHand(n)`, `explodedOnce`, `eliminated`, `firstTo200`

---

## Fly Card Animation System

Cards fly as a visual overlay when drawn or discarded (player and opponents):

```javascript
// flyAnim state: { fromX, fromY, toX, toY, hidden }
// hidden:true = card back, hidden:false = face-up
```

Triggers:
1. **Player draws from pile**: fly from drawPileRef to hand center-bottom
2. **Player draws from discard**: fly from discardPileRef to hand center-bottom (face-up)
3. **Player during firstKeepOrDiscard**: fly from drawPileRef, newCardId stays highlighted until phase changes
4. **Opponent draws from pile**: fly from drawPileRef to opponent area (top-center of screen)
5. **Opponent draws from discard**: fly from discardPileRef to opponent area
6. **Opponent discards**: fly from opponent area to discardPileRef

Rendered as a `motion.div` with `position:fixed, zIndex:1000, pointerEvents:none`.

---

## Round End Flow

When `status === 'roundEnd'` or `'gameOver'`:
1. `showRoundEnd` starts as `false` — game table stays visible with winner overlay on top
2. Winner overlay: dark semi-transparent backdrop, bouncing avatar, gold banner with `t.winsShort(name)`
3. After 2.2s: `showRoundEnd = true` → scoreboard screen renders
4. Scoreboard: Next Round button (round end only) + Back to Home button (game over only)

---

## Validator Functions (server/game/validator.js)

```javascript
isValidSet(cards)           // 3+ same rank, different suits, no Jokers
isValidRun(cards)           // 3+ sequential same suit, Joker in MIDDLE only
isValidWinningRun(cards)    // like isValidRun but Joker can be at start/end; tries Ace as 1 AND 14
isValidMeld(cards)          // isValidSet OR isValidRun
isValidExtension(existingMeld, newCards)  // can add newCards to existing meld
canUseDiscardCard(card, hand, melds)      // can use card in a run with hand/table
canFormRunWith(cards)       // can these cards form a run
canReplaceJoker(meld, card) // can this card replace a Joker in this meld
```

**Important**: `isValidWinningRun` tries Ace as both 1 and 14 (e.g. Q K A + Joker works).

---

## Bot System (server/game/bots.js)
- `executeBotTurn(game, playerId, difficulty, broadcastFn)`
- Difficulty affects: draw strategy, meld detection, Joker use, STOP decisions
- Easy: random play, 40% meld chance, 15% STOP
- Medium/Hard: smart draw, always extend melds, always steal Jokers
- Bot thinking delay in processBotTurn: easy=2500ms, medium=2000ms, hard=1500ms
- Bot names are gender-matched to avatar: male avatars (sporty/nerdy/cool/grandpa/kid) get male names, female avatars (curly/ponytail/grandma/business/pigtails) get female names
- Male names (≤6 chars, Brazilian/international): Marco, Thiago, Diego, Lucas, Pedro, Bruno, Caio, Leo, Luca, Nico, Tomas, Andre, Vitor, Davi, Igor, Mateo, Dante, Beto, Felipe, Carlos, Murilo, Sergio, Marcos, Rafael, Max, Rafa, Joao, Kaio
- Female names (≤6 chars): Bia, Sara, Ana, Mia, Julia, Maria, Luiza, Camila, Clara, Laura, Sofia, Livia, Alice, Bruna, Carol, Paula, Lara, Nina, Vera, Rosa, Yasmin, Renata, Flavia, Marcia, Gabi, Nadia
- Bot name colors: easy=green (#4caf50), medium=amber (#f4a522), hard=red (#e63946)

---

## Sound System
```javascript
function playSound(type) // in Game.jsx
// Types: 'card', 'meld', 'discard', 'stop', 'win', 'error', 'piou', 'turn'
// Files in client/public/sounds/
```

Background music: `/sounds/background.mp3`, volume 0.1, loops
iOS mute fix: use `bg.pause()` / `bg.play()` instead of `bg.volume = 0` (iOS ignores volume changes)
Module-level `_isMuted` flag syncs with React `isMuted` state for sound effect suppression.

---

## PIOU Easter Egg 😤
- Triggered when false STOP occurs
- `piouActive` state shows big centered "😤 PIOU!!!" flash for 3 seconds
- Opponent cards show speech bubble BELOW their card panel (not above — would be hidden by header)
- Permanent badge next to "Your hand" label (localized via `t.piouBanned`)
- Sound: `/sounds/piou.m4a`

---

## Card Picking Phase (who starts)
- Overlapping fan layout using `marginLeft: -28` (desktop) / `-36` (mobile) on flex container
- Cards have random tilts from TILTS array, `transformOrigin: 'bottom center'`
- Selected card lifts (-22px) with gold glow, others settle to 0 rotation when taken
- Winner card gets gold drop-shadow glow
- Avatar + name shown below each picked card
- Fan capped with `maxWidth: 100vw, overflow: hidden` to stay on screen on mobile

---

## Meld Display
- Desktop: flex row with `gap:3`, medium-size cards
- Mobile: always overlapping, step = `min(38, (180-48)/(n-1))` px per card
- Both use Framer Motion `initial={{ opacity:0, scale:0.5, y:-20 }}` → `animate={{ opacity:1, scale:1, y:0 }}`

---

## Disconnect Handling
**Server (index.js):**
- Lobby disconnect: remove player, transfer host, broadcast playerList
- In-game disconnect: mark `isDisconnected=true`, start 30s timer, broadcast `playerDisconnected`
- After 30s: replace with easy bot in BOTH `room.players` AND `room.game.players`
- Rejoin: `rejoinRoom` event restores socket, clears timer

**Client (Game.jsx):**
- `disconnectInfo` state stores { playerName, deadline }
- Dark banner at top with countdown timer (localized)
- `playerReconnected` clears the banner

---

## Environment Variables
- Vercel: `VITE_SERVER_URL=https://pontinho.onrender.com`
- Local frontend: `http://localhost:5173`
- Local backend: `http://localhost:3001`
- `socket.js`: `const URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'`

---

## Known Issues / Current Bugs
- iOS vibration: `navigator.vibrate()` not supported on iOS Safari (Apple never implemented it)

---

## Roadmap (Remaining Features)

### 🔴 Important Fixes
- First turn redesign (remove keep/discard buttons, float card visually between piles)
- **Avatar bug**: guests joining a room show sporty.png for everyone until they press Ready — avatarId not sent correctly on join, only on ready

### 🟡 UX Improvements
- Card picking phase: show card values during reveal more dramatically

### 🟢 Features
- Rules rewrite with visual examples
- Save game vs bots (localStorage)
- Analytics dashboard (who played, scores, game history)
- Spectator mode (join active games, see all hands)
- Custom favicon

### 🔵 Nice to Have
- PWA (install on home screen)
- Steam/App Store (long term)

### ✅ Done
- Mute button only mutes background music, not sound effects
- Empty lobby persistence: server auto-destroys rooms with no human players; lobby hidden from list as soon as game starts
- Opponent panel on mobile: compact layout with tiny cards
- Round-end scoreboard: shows +X pts per player
- Bot AI overhaul: threat level, score guard, Joker urgency, win-check-first
- Emoji reactions during game with text labels, positioned near the sender
- Round-end auto-advance: 5s countdown on Next Round button
- Multi-meld winning move fix: Joker at start/end allowed when rest of hand can go out
- Card fly animations: draw/discard/meld all fly to/from the correct player's panel
- Bot names gender-matched to avatar (Brazilian/international, ≤6 chars)
- Decorative emojis removed from lobby/create/join/pick-a-card screens
- Last card drag fix: draggedId backed by ref to avoid stale closure

---

## Deployment
```bash
# Push to deploy both frontend (Vercel) and backend (Render)
git add .
git commit -m "your message"
git push

# Local development
# Terminal 1:
cd server && node index.js

# Terminal 2:
cd client && npm run dev
```

## Debug Mode
Add `?debug=true` to URL: `http://localhost:5173?debug=true`
- Shows 🔧 button bottom-right
- Set custom hand, discard card, or load preset scenarios (including first-turn Joker scenario)
- Only works locally (blocked in production by NODE_ENV check)

---

## Important Implementation Notes

1. **getPlayerListData(room)** helper in index.js — always use this for playerList broadcasts to ensure avatarId, difficulty, isReady are included

2. **toggleReady** handler signature: `socket.on('toggleReady', (data, callback) => {` — needs BOTH data and callback params

3. **processBotTurn** must check `if (room.game?.stopCalledBy) return` at the top

4. **STOP snapshot** restores hands/melds/discardPile but NOT stopBanned/discardBanned (penalties persist)

5. **Card image URLs**: rank '10' maps to '0' in filename: `const rankCode = card.rank === '10' ? '0' : card.rank`

6. **Mobile fan layout** uses `'ontouchstart' in window || window.innerWidth < 600` for detection

7. **isValidWinningRun** allows Joker at start OR end, still max 1 Joker per run. Tries Ace as 1 AND 14.

8. **extendMeld** uses `isValidWinningRun` when `isWinningMove || game.stopCalledBy`

9. **drawFromDiscard** checks: `canUseDiscardCard OR findWinningMelds OR isValidWinningRun` for the complete hand

10. **playMeld discard restriction**: discard card can be in a set/run only if `isValidRun OR isWinningRun OR isWinningSet` (remainingAfter.length <= 1 counts as winning)

11. **Translation pattern**: `const t = T[lang]` at top of each component. Dynamic strings are functions in the translation object (e.g. `t.wins(name)`, `t.playMeld(n)`). Add new strings to all 3 languages in translations.js.

12. **iOS mute**: use `bgMusicRef.current.pause()` / `.play()` — do NOT use `volume = 0`, it has no effect on iOS Safari.

13. **Featured card** during firstKeepOrDiscard: `newCardId` persists (not auto-cleared) until phase changes. Uses `selected={selectedCards.includes(id) || isFeatured}` on Card component to reuse the built-in lift+glow style.

14. **Back to Home** button (`onLeave` prop on Game): only shown on `gameOver` screen, NOT on `roundEnd`.
