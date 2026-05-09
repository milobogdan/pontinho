import { executeBotTurn, findWinningMelds } from './game/bots.js';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import {
  createGame, startRound, startPicking, pickCard,
  firstDraw, firstKeepOrDiscard,
  drawFromPile, drawFromDiscard,
  playMeld, extendMeld, stealJoker,
  discardCard, callStop, getPlayerView,
  nextTurn, initiateStop, resumeAfterStop
} from './game/gameState.js';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// All active game rooms stored in memory
const rooms = {};

function getRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Broadcast updated game state to every player in the room
// Each player only sees their own hand (unless debug mode is on)
function broadcastGameState(room) {
  const { game, debugMode } = room;
  room.players.forEach(({ id, socketId }) => {
    const view = getPlayerView(game, id, debugMode);
    io.to(socketId).emit('gameState', view);
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function processBotTurn(room) {
  if (!room.game || room.game.status !== 'playing') return;
  if (room.game.stopCalledBy) return;
  const current = room.game.players[room.game.currentPlayerIndex];
  if (!current?.isBot) return;
  const roomPlayer = room.players.find(p => p.id === current.id);
  if (!roomPlayer) {
    console.log('⚠️ Bot not found in room:', current.id);
    return;
  }
  console.log(`🤖 Bot turn: ${current.name} phase: ${room.game.turnPhase}`);
  try {
    await executeBotTurn(
      room.game, current.id, roomPlayer.difficulty || 'easy',
      () => broadcastGameState(room)
    );
  } catch (err) {
    console.error('❌ Bot error:', err);
  }
  if (room.game.status === 'playing') processBotTurn(room);
}

async function autoBotPick(room) {
  if (!room.game || room.game.status !== 'picking') return;

  for (const gamePlayer of room.game.players) {
    if (!gamePlayer.isBot) continue;
    await delay(600 + Math.random() * 800);
    if (room.game.status !== 'picking') return;
    if (room.game.playerPicks[gamePlayer.id]) continue;

    const pickedIds = Object.values(room.game.playerPicks).map(c => c?.id);
    const available = room.game.pickingCards.filter(c => !pickedIds.includes(c.id));
    if (!available.length) continue;

    const card = available[Math.floor(Math.random() * available.length)];
    const result = pickCard(room.game, gamePlayer.id, card.id);
    broadcastGameState(room);

    if (result.allPicked) {
      setTimeout(() => {
        startRound(room.game);
        broadcastGameState(room);
        processBotTurn(room);
      }, 3500);
    }
  }
}

async function checkBotStop(room) {
  if (!room.game || room.game.status !== 'playing') return;
  if (room.game.stopCalledBy) return;

  const topDiscard = room.game.discardPile.at(-1);
  if (!topDiscard) return;

  const currentId = room.game.players[room.game.currentPlayerIndex].id;

  for (const gamePlayer of room.game.players) {
    if (gamePlayer.id === currentId) continue;
    if (!gamePlayer.isBot || gamePlayer.stopBanned || gamePlayer.eliminated) continue;

    const roomPlayer = room.players.find(p => p.id === gamePlayer.id);
    if (!roomPlayer) continue;

    const difficulty = roomPlayer.difficulty || 'easy';

    // Easy bots: only 15% chance to even attempt STOP
    if (difficulty === 'easy' && Math.random() > 0.15) continue;

    const handPlusDiscard = [...gamePlayer.hand, topDiscard];
    const result = findWinningMelds(handPlusDiscard);

    if (result) {
      // Bot can win! Small delay for realism
      await delay(difficulty === 'hard' ? 500 : 900);

      // Make sure nothing changed while we were waiting
      if (room.game.stopCalledBy) return;
      if (room.game.discardPile.at(-1)?.id !== topDiscard.id) return;
      if (room.game.status !== 'playing') return;

      console.log(`🛑 ${gamePlayer.name} calls STOP!`);

      room.game.stopCalledBy = gamePlayer.id;
      broadcastGameState(room);

      const meldIds = result.melds.map(meld => meld.map(c => c.id));
      const finalDiscardId = result.discard?.id || null;

      const stopResult = callStop(room.game, gamePlayer.id, meldIds, finalDiscardId);
      resumeAfterStop(room.game);
      if (room.stopTimer) { clearTimeout(room.stopTimer); room.stopTimer = null; }

      if (!stopResult.error) {
        broadcastGameState(room);
      } else {
        // Shouldn't happen but handle gracefully
        console.log('⚠️ Bot STOP failed:', stopResult.error);
        gamePlayer.stopBanned = true;
        gamePlayer.discardBanned = true;
        broadcastGameState(room);
        processBotTurn(room);
      }
      return;
    }
  }
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // ── CREATE ROOM ────────────────────────────────────────────────
  socket.on('createRoom', ({ playerName }, callback) => {
    const code = getRoomCode();
    const playerId = socket.id;

    rooms[code] = {
      code,
      players: [{ id: playerId, socketId: socket.id, name: playerName }],
      game: null,
      debugMode: false,
    };

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = playerId;

    console.log(`Room ${code} created by ${playerName}`);
    callback({ success: true, code, playerId });
  });

  // ── JOIN ROOM ──────────────────────────────────────────────────
  socket.on('joinRoom', ({ code, playerName }, callback) => {
    const room = rooms[code];
    if (!room) return callback({ error: 'Room not found' });
    if (room.game?.status === 'playing') return callback({ error: 'Game already in progress' });
    if (room.players.length >= 8) return callback({ error: 'Room is full (max 8 players)' });

    const playerId = socket.id;
    room.players.push({ id: playerId, socketId: socket.id, name: playerName });

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = playerId;

    // Tell everyone in the room who is here
    io.to(code).emit('playerList', room.players.map(p => ({ id: p.id, name: p.name })));
    console.log(`${playerName} joined room ${code}`);
    callback({ success: true, playerId, 
      players: room.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot })) 
    });
 }); 
  // ── ADD BOT ────────────────────────────────────────────────────
  socket.on('addBot', ({ difficulty }, callback) => {
    const room = rooms[socket.data.roomCode];
    if (!room) return callback({ error: 'Room not found' });
    if (room.players.length >= 8) return callback({ error: 'Room is full' });

    const botId = `bot-${Date.now()}`;
    const botName = `Bot (${difficulty})`;
    room.players.push({ id: botId, socketId: null, name: botName, isBot: true, difficulty });

    io.to(room.code).emit('playerList', room.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot })));
    callback({ success: true, botId });
  });

  // ── TOGGLE DEBUG MODE ──────────────────────────────────────────
  socket.on('setDebugMode', ({ enabled }) => {
    const room = rooms[socket.data.roomCode];
    if (!room) return;
    room.debugMode = enabled;
    if (room.game) broadcastGameState(room);
  });

  // ── START GAME ─────────────────────────────────────────────────
  socket.on('startGame', (callback) => {
    const room = rooms[socket.data.roomCode];
    if (!room) return callback({ error: 'Room not found' });
    if (room.players.length < 2) return callback({ error: 'Need at least 2 players' });

    room.game = createGame(room.players.map(p => ({
      id: p.id, name: p.name, isBot: p.isBot || false,
    })));

    startPicking(room.game);
    broadcastGameState(room);
    io.to(room.code).emit('gameStarted');
    autoBotPick(room);
    callback({ success: true });
  });

  socket.on('pickCard', ({ cardId }, callback) => {
    const room = rooms[socket.data.roomCode];
    if (!room?.game) return callback({ error: 'No game' });
    const result = pickCard(room.game, socket.data.playerId, cardId);
    if (result.error) return callback(result);
    broadcastGameState(room);
    if (result.allPicked) {
      setTimeout(() => {
        startRound(room.game);
        broadcastGameState(room);
        processBotTurn(room);
      }, 3500);
    }
    callback({ success: true });
  });

  socket.on('initiateStop', ({ claimedCardId }, callback) => {
    const room = rooms[socket.data.roomCode];
    if (!room?.game) return callback({ error: 'No game' });
    const result = initiateStop(room.game, socket.data.playerId, claimedCardId);
    if (result.error) return callback(result);
    broadcastGameState(room);
    if (room.stopTimer) clearTimeout(room.stopTimer);
    room.stopTimer = setTimeout(() => {
      if (room.game?.stopCalledBy === socket.data.playerId) {
        const player = room.game.players.find(p => p.id === socket.data.playerId);
        if (player) { player.stopBanned = true; player.discardBanned = true; }
        resumeAfterStop(room.game);
        broadcastGameState(room);
        processBotTurn(room);
        io.to(room.code).emit('stopTimeout', { playerId: socket.data.playerId });
      }
    }, 60000); // ← 60 seconds
    callback({ success: true });
  });
    
  // ── GAME ACTIONS ───────────────────────────────────────────────
  function handleAction(fn, ...args) {
    const room = rooms[socket.data.roomCode];
    if (!room?.game) return { error: 'No active game' };
    const result = fn(room.game, socket.data.playerId, ...args);
    if (!result.error) {
      broadcastGameState(room);
      // After a discard, check if any bot can STOP
      if (fn === discardCard && room.game.status === 'playing') {
        setTimeout(() => checkBotStop(room), 300);
      }
      processBotTurn(room);
    }
    return result;
  }

  socket.on('firstDraw',           (_, cb) => cb(handleAction(firstDraw)));
  socket.on('firstKeepOrDiscard',  ({ keep }, cb) => cb(handleAction(firstKeepOrDiscard, keep)));
  socket.on('drawFromPile',        (_, cb) => cb(handleAction(drawFromPile)));
  socket.on('drawFromDiscard',     (_, cb) => cb(handleAction(drawFromDiscard)));
  socket.on('playMeld',            ({ cardIds }, cb) => cb(handleAction(playMeld, cardIds)));
  socket.on('extendMeld',          ({ meldId, cardIds }, cb) => cb(handleAction(extendMeld, meldId, cardIds)));
  socket.on('discardCard',         ({ cardId }, cb) => cb(handleAction(discardCard, cardId)));
  socket.on('callStop', ({ proposedMelds, finalDiscardId }, callback) => {
    const room = rooms[socket.data.roomCode];
    if (!room?.game) return callback({ error: 'No game' });
    const result = callStop(room.game, socket.data.playerId, proposedMelds, finalDiscardId);
    resumeAfterStop(room.game);
    if (room.stopTimer) { clearTimeout(room.stopTimer); room.stopTimer = null; }
    if (!result.error) broadcastGameState(room);
    else processBotTurn(room);
    callback(result);
  });  
  socket.on('stealJoker', ({ meldId, replacementCardId }, cb) => cb(handleAction(stealJoker, meldId, replacementCardId)));

  // ── START NEXT ROUND ───────────────────────────────────────────
  socket.on('startNextRound', (_, callback) => {
    const room = rooms[socket.data.roomCode];
    if (!room?.game) return callback({ error: 'No active game' });
    startRound(room.game);
    broadcastGameState(room);
    processBotTurn(room);
    callback({ success: true });
  });

  // Player admits they can't win — apply penalty without needing server validation
  socket.on('declareFalseStop', (_, callback) => {
    const room = rooms[socket.data.roomCode];
    if (!room?.game) return callback({ error: 'No game' });
    const player = room.game.players.find(p => p.id === socket.data.playerId);
    if (!player) return callback({ error: 'Player not found' });
    player.stopBanned = true;
    player.discardBanned = true;
    resumeAfterStop(room.game);
    if (room.stopTimer) { clearTimeout(room.stopTimer); room.stopTimer = null; }
    broadcastGameState(room);
    processBotTurn(room); // resume bots
    callback({ success: true });
  });

  // ── GET CURRENT STATE (fixes race condition on load) ───────────────────
  socket.on('getGameState', (callback) => {
    const room = rooms[socket.data.roomCode];
    if (!room?.game) return callback({ error: 'No game' });
    const view = getPlayerView(room.game, socket.data.playerId, room.debugMode);
    callback({ success: true, state: view });
  });

  // ── DISCONNECT ─────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    const code = socket.data.roomCode;
    if (!code || !rooms[code]) return;

    const room = rooms[code];

    // If game hasn't started yet, remove player from lobby and notify others
    if (!room.game || room.game.status === 'waiting' || room.game.status === 'picking') {
      room.players = room.players.filter(p => p.socketId !== socket.id);
      io.to(code).emit('playerList', room.players.map(p => ({
        id: p.id, name: p.name, isBot: p.isBot
      })));

      // Clean up empty rooms
      if (room.players.filter(p => !p.isBot).length === 0) {
        delete rooms[code];
        console.log(`Room ${code} deleted (empty)`);
      }
    }
    // If game is in progress, keep the room alive for reconnection
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});