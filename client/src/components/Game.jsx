import DebugPanel from './DebugPanel';
import GameMenu from './GameMenu';
import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import socket from '../socket';
import Card from './Card';
import { Avatar, randomBotAvatar } from './Avatar';
import T from '../translations';

const REACTIONS = [
  { emoji: '😂', text: "Haha!" },
  { emoji: '🔥', text: "Let's go!" },
  { emoji: '👏', text: "Nice one!" },
  { emoji: '😮', text: "No way!" },
  { emoji: '😅', text: "Phew!" },
  { emoji: '💀', text: "I'm dead" },
  { emoji: '🎉', text: "Yes!" },
  { emoji: '👍', text: "GG!" },
  { emoji: '😤', text: "PIOU!" },
  { emoji: '❤️', text: "Love it!" },
  { emoji: '🫡', text: "Respect!" },
  { emoji: '😡', text: "No mercy!" },
];

let _isMuted = false;
function playSound(type) {
  const files = {
    card:    '/sounds/card.wav',
    meld:    '/sounds/win.wav',
    discard: '/sounds/card.wav',
    stop:    '/sounds/stop.wav',
    win:     '/sounds/win.wav',
    error:   '/sounds/error.mp3',
    piou:    '/sounds/piou.m4a',
    turn:    '/sounds/turn.mp3',
  };
  const audio = new Audio(files[type]);
  audio.volume = type === 'win' ? 0.5 : 0.3;
  audio.play().catch(() => {});
}

export default function Game({ roomInfo, onLeave, onSaveAndLeave, lang = 'en' }) {
  const t = T[lang];
  const [gameState, setGameState] = useState(null);
  const [selectedCards, setSelectedCards] = useState([]);   // card IDs selected in hand
  const [message, setMessage]     = useState('');
  const [handOrder, setHandOrder] = useState([]);
  const [draggedId, setDraggedIdState] = useState(null);
  const draggedIdRef = useRef(null);
  function setDraggedId(id) { draggedIdRef.current = id; setDraggedIdState(id); }
  const [stopCountdown, setStopCountdown] = useState(120);
  const [piouActive, setPiouActive] = useState(false);
  const [newCardId, setNewCardId] = useState(null);
  const touchStartRef = useRef(null);
  const isDraggingRef = useRef(false);
  const handContainerRef = useRef(null);
  const prevTurnPhaseRef = useRef(null);
  const prevGameStateRef = useRef(null);
  const drawPileRef = useRef(null);
  const discardPileRef = useRef(null);
  const meldAreaRef = useRef(null);
  const prevMeldsRef = useRef([]);
  const [flyAnim, setFlyAnim] = useState(null); // { fromX, fromY, toX, toY, hidden }
  const [disconnectInfo, setDisconnectInfo] = useState(null);
  const [disconnectCountdown, setDisconnectCountdown] = useState(30);
  const [isMuted, setIsMuted] = useState(false);
  const [showRoundEnd, setShowRoundEnd] = useState(false);
  const [nextRoundCountdown, setNextRoundCountdown] = useState(null);
  const [revealedHands, setRevealedHands] = useState(null);
  const [roundEndTab, setRoundEndTab] = useState('score');
  const [isMobileLayout, setIsMobileLayout] = useState(() => window.innerWidth < 768);
  const [roundStartScores, setRoundStartScores] = useState({});
  const [reactions, setReactions] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isDebug = new URLSearchParams(window.location.search).get('debug') === 'true';

  useEffect(() => {
    const onResize = () => setIsMobileLayout(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!gameState) return;
    const player = gameState.players?.find(p => p.id === roomInfo.playerId);
    if (!player?.hand) return;
    setHandOrder(prev => {
      const currentIds = player.hand.map(c => c.id);
      const kept    = prev.filter(id => currentIds.includes(id));
      const newOnes = currentIds.filter(id => !prev.includes(id));

      // Many new cards at once = new round deal → auto sort by suit
      if (newOnes.length > 2) {
        const suitOrder = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
        return [...player.hand].sort((a, b) => {
          if (a.isJoker) return 1;
          if (b.isJoker) return -1;
          const s = (suitOrder[a.suit] ?? 4) - (suitOrder[b.suit] ?? 4);
          return s !== 0 ? s : a.value - b.value;
        }).map(c => c.id);
      }

      // Single card drawn → append at end with blue glow + fly animation
      if (newOnes.length === 1) {
        const cardId = newOnes[0];
        setTimeout(() => setNewCardId(cardId), 50);
        if (gameState?.turnPhase !== 'firstKeepOrDiscard') {
          setTimeout(() => setNewCardId(null), 2000);
        }
        // Fly card from draw pile toward hand
        if (drawPileRef.current) {
          const r = drawPileRef.current.getBoundingClientRect();
          setFlyAnim({
            fromX: r.left + r.width / 2,
            fromY: r.top + r.height / 2,
            toX: window.innerWidth / 2,
            toY: window.innerHeight - 80,
            hidden: true,
          });
          setTimeout(() => setFlyAnim(null), 450);
        }
      }
      return [...kept, ...newOnes];
    });
  }, [gameState]);

  // Fly animation for opponent draw / discard
  useEffect(() => {
    const prev = prevGameStateRef.current;
    prevGameStateRef.current = gameState;
    if (!prev || !gameState || gameState.status !== 'playing') return;

    const currentOpponent = gameState.players[gameState.currentPlayerIndex];
    const opponentTurn = currentOpponent?.id !== roomInfo.playerId;

    function getOpponentCenter(playerId) {
      const el = document.querySelector(`[data-player-id="${playerId}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      return { x: window.innerWidth / 2, y: window.innerHeight * 0.12 };
    }

    // Opponent drew from pile
    if (opponentTurn && gameState.drawPile.length < prev.drawPile.length && drawPileRef.current) {
      const r = drawPileRef.current.getBoundingClientRect();
      const { x, y } = getOpponentCenter(currentOpponent.id);
      setFlyAnim({ fromX: r.left + r.width / 2, fromY: r.top + r.height / 2,
        toX: x, toY: y, hidden: true });
      setTimeout(() => setFlyAnim(null), 450);
      return;
    }

    // Opponent drew from discard
    if (opponentTurn && gameState.discardPile.length < prev.discardPile.length && discardPileRef.current) {
      const r = discardPileRef.current.getBoundingClientRect();
      const { x, y } = getOpponentCenter(currentOpponent.id);
      setFlyAnim({ fromX: r.left + r.width / 2, fromY: r.top + r.height / 2,
        toX: x, toY: y, hidden: true });
      setTimeout(() => setFlyAnim(null), 450);
      return;
    }

    // Opponent discarded
    if (gameState.lastDiscardedBy && gameState.lastDiscardedBy !== roomInfo.playerId &&
        gameState.lastDiscardedBy !== prev.lastDiscardedBy && discardPileRef.current) {
      const r = discardPileRef.current.getBoundingClientRect();
      const { x, y } = getOpponentCenter(gameState.lastDiscardedBy);
      setFlyAnim({ fromX: x, fromY: y,
        toX: r.left + r.width / 2, toY: r.top + r.height / 2, hidden: true });
      setTimeout(() => setFlyAnim(null), 400);
    }
  }, [gameState]);

  // Fly animation for meld plays and extensions
  useEffect(() => {
    if (!gameState?.melds || gameState.status !== 'playing') {
      prevMeldsRef.current = gameState?.melds ?? [];
      return;
    }
    const prevMelds = prevMeldsRef.current;
    prevMeldsRef.current = gameState.melds;

    function getMeldTarget(meldId) {
      const el = meldId ? document.querySelector(`[data-meld-id="${meldId}"]`) : meldAreaRef.current;
      if (el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      if (meldAreaRef.current) { const r = meldAreaRef.current.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      return { x: window.innerWidth / 2, y: 120 };
    }
    function getPlayerCenter(playerId) {
      const el = document.querySelector(`[data-player-id="${playerId}"]`);
      if (el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      return { x: window.innerWidth / 2, y: window.innerHeight * 0.15 };
    }

    // New meld played
    const prevIds = new Set(prevMelds.map(m => m.id));
    const newMeld = gameState.melds.find(m => !prevIds.has(m.id));
    if (newMeld) {
      const from = getPlayerCenter(newMeld.ownerId);
      const to = getMeldTarget(null);
      setFlyAnim({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, hidden: true });
      setTimeout(() => setFlyAnim(null), 450);
      return;
    }

    // Meld extended
    const extended = gameState.melds.find(m => {
      const prev = prevMelds.find(pm => pm.id === m.id);
      return prev && m.cards.length > prev.cards.length;
    });
    if (extended) {
      const extenderId = gameState.players[gameState.currentPlayerIndex]?.id;
      const from = getPlayerCenter(extenderId);
      const to = getMeldTarget(extended.id);
      setFlyAnim({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, hidden: true });
      setTimeout(() => setFlyAnim(null), 450);
    }
  }, [gameState?.melds]);

  // Clear the featured highlight the moment we leave firstKeepOrDiscard
  useEffect(() => {
    if (!gameState) return;
    const phase = gameState.turnPhase;
    if (prevTurnPhaseRef.current === 'firstKeepOrDiscard' && phase !== 'firstKeepOrDiscard') {
      setNewCardId(null);
    }
    prevTurnPhaseRef.current = phase;
  }, [gameState]);

  useEffect(() => {
    socket.on('gameState', (state) => {
      setGameState(state);
      setSelectedCards([]);
      // Only close stop mode if server says stop is resolved
      // Update countdown from server deadline
      if (state.stopDeadline) {
        const remaining = Math.max(0, Math.ceil((state.stopDeadline - Date.now()) / 1000));
        setStopCountdown(remaining);
      }
    });
    socket.on('stopTimeout', () => {
      setPiouActive(true);
      playSound('piou');
      setTimeout(() => setPiouActive(false), 3000);
    });
    socket.on('playerDisconnected', ({ playerName, deadline }) => {
      setDisconnectInfo({ playerName, deadline });
    });
    socket.on('playerReconnected', ({ playerName }) => {
      setDisconnectInfo(null);
      msg(`✅ ${playerName} reconnected!`);
    });

    socket.on('reaction', ({ playerId, playerName, emoji, text }) => {
      const id = Date.now() + Math.random();
      let cx, cy;
      const el = document.querySelector(`[data-player-id="${playerId}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        cx = rect.left + rect.width / 2;
        cy = rect.top + rect.height / 2;
      } else {
        cx = window.innerWidth / 2;
        cy = window.innerHeight / 2;
      }
      setReactions(prev => [...prev, { id, playerId, playerName, emoji, text, cx, cy }]);
      setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 4500);
    });

    socket.emit('getGameState', (res) => {
      if (res?.state) setGameState(res.state);
    });
    if (isDebug) socket.emit('setDebugMode', { enabled: true });
    return () => {
      socket.off('gameState');
      socket.off('stopTimeout');
      socket.off('playerDisconnected');
      socket.off('playerReconnected');
      socket.off('reaction');
    };
  }, []);

  const bgMusicRef = useRef(null);
  useEffect(() => {
    const bg = new Audio('/sounds/background.mp3');
    bg.loop = true;
    bg.volume = 0.1;
    bg.play().catch(() => {});
    bgMusicRef.current = bg;
    return () => { bg.pause(); bg.currentTime = 0; };
  }, []);

  useEffect(() => {
    _isMuted = isMuted;
    const bg = bgMusicRef.current;
    if (!bg) return;
    if (isMuted) {
      bg.pause();
    } else {
      bg.play().catch(() => {});
    }
  }, [isMuted]);
   
  useEffect(() => {
    if (!gameState?.stopCalledBy) return;
    const interval = setInterval(() => {
      if (gameState?.stopDeadline) {
        const remaining = Math.max(0, Math.ceil((gameState.stopDeadline - Date.now()) / 1000));
        setStopCountdown(remaining);
      } else {
        setStopCountdown(prev => Math.max(0, prev - 1));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState?.stopCalledBy]);

  useEffect(() => {
    if (gameState?.status !== 'roundEnd' && gameState?.status !== 'gameOver') {
      setShowRoundEnd(false);
      setNextRoundCountdown(null);
      setRevealedHands(null);
      setRoundEndTab('score');
    }
  }, [gameState?.status]);

  useEffect(() => {
    if (!showRoundEnd || gameState?.status !== 'roundEnd') {
      setNextRoundCountdown(null);
      return;
    }
    setNextRoundCountdown(10);
    const interval = setInterval(() => {
      setNextRoundCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          emit('startNextRound');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showRoundEnd, gameState?.status]);

  // Capture scores at round start; record history at round end
  const prevStatusRef2 = useRef(null);
  useEffect(() => {
    if (!gameState) return;
    const status = gameState.status;
    const prev = prevStatusRef2.current;

    if (status === 'playing' && prev !== 'playing') {
      const scores = {};
      gameState.players.forEach(p => { scores[p.id] = p.totalScore; });
      setRoundStartScores(scores);
    }

    prevStatusRef2.current = status;
  }, [gameState]);

  useEffect(() => {
    if (gameState?.status === 'roundEnd' || gameState?.status === 'gameOver') {
      // Capture any non-empty hands as they arrive from the server
      const hands = {};
      gameState.players.forEach(p => {
        if (p.hand?.length > 0 && !p.hand[0]?.hidden) hands[p.id] = p.hand;
      });
      if (Object.keys(hands).length > 0) setRevealedHands(hands);
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState?.status === 'roundEnd' || gameState?.status === 'gameOver') {
      setShowRoundEnd(false);
      const t = setTimeout(() => setShowRoundEnd(true), 2200);
      playSound('win');
      const winner = gameState.players.find(p => p.id === gameState.winner);
      if (winner?.id === roomInfo.playerId) {
        // YOU won — big celebration!
        confetti({
          particleCount: 200,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#f4a522', '#e63946', '#2d8a54', '#fff'],
        });
      } else {
        // Someone else won — small confetti
        confetti({
          particleCount: 60,
          spread: 50,
          origin: { y: 0.6 },
          colors: ['#f4a522', '#fff'],
        });
      }
      return () => clearTimeout(t);
    }
  }, [gameState?.status]);

  useEffect(() => {
    socket.on('connect', () => {
      // Try to rejoin if we have room info
      if (roomInfo?.code && roomInfo?.playerId) {
        socket.emit('rejoinRoom', { 
          roomCode: roomInfo.code, 
          playerId: roomInfo.playerId 
        }, (res) => {
          if (res?.error) msg('⚠️ Could not reconnect — please refresh');
        });
      }
    });
    return () => socket.off('connect');
  }, [roomInfo]);

  const prevIsMyTurnRef = useRef(false);
  useEffect(() => {
    const myTurn = gameState?.players?.[gameState?.currentPlayerIndex]?.id === roomInfo.playerId;
    if (myTurn && !prevIsMyTurnRef.current && gameState?.status === 'playing') {
      playSound('turn');
      navigator.vibrate?.(200);
    }
    prevIsMyTurnRef.current = myTurn;
  }, [gameState?.currentPlayerIndex, gameState?.status]);

  useEffect(() => {
    const el = handContainerRef.current;
    if (!el) return;
    const handler = e => {
      if (isDraggingRef.current) e.preventDefault();
    };
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, []);

  useEffect(() => {
    if (!disconnectInfo) return;
    const interval = setInterval(() => {
      const remaining = disconnectInfo?.deadline 
        ? Math.max(0, Math.ceil((disconnectInfo.deadline - Date.now()) / 1000))
        : 30;
      setDisconnectCountdown(remaining);
      if (remaining === 0) {
        setDisconnectInfo(null);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [disconnectInfo]);

  if (!gameState) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <h2>Waiting for game to start...</h2>
    </div>
  );

  

  const me = gameState.players.find(p => p.id === roomInfo.playerId);
  const others = gameState.players.filter(p => p.id !== roomInfo.playerId);
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === roomInfo.playerId;
  const topDiscard = gameState.discardPile.at(-1);
  const phase = gameState.turnPhase;

  

  function msg(text) { setMessage(text); setTimeout(() => setMessage(''), 3000); }

  function emit(event, data = {}) {
    if (event === 'discardCard') {
      playSound('discard');
      if (discardPileRef.current) {
        const r = discardPileRef.current.getBoundingClientRect();
        setFlyAnim({
          fromX: window.innerWidth / 2,
          fromY: window.innerHeight - 120,
          toX: r.left + r.width / 2,
          toY: r.top + r.height / 2,
          hidden: true,
        });
        setTimeout(() => setFlyAnim(null), 400);
      }
    }
    socket.emit(event, data, (res) => {
      if (res?.error) {
        if (res.error === 'No active game') {
          msg('⚠️ Connection lost — please refresh the page');
          return;
        }
        playSound('error');
        msg(res.error);
      } else if (event === 'drawFromPile' || event === 'drawFromDiscard' || event === 'firstDraw') {
        playSound('card');
      } else if (event === 'playMeld' || event === 'extendMeld') {
        playSound('meld');
      }
    });
  }

  function toggleCard(cardId) {
    setSelectedCards(prev =>
      prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]
    );
  }

  // ── STOP MODE ─────────────────────────────────────────────────────────────
  function enterStopMode() {
    playSound('stop');
    if (!topDiscard) return msg('No discard card available');
    if (me.stopBanned) return msg('You cannot use STOP this round');
    socket.emit('initiateStop', { claimedCardId: topDiscard.id }, (res) => {
      if (res?.error) return msg(res.error);
    });
  }
    
  function declareFalseStop() {
    socket.emit('declareFalseStop', {}, (res) => {
      if (res?.error) msg(res.error);
      else {
        setPiouActive(true);
        playSound('piou');
        setTimeout(() => setPiouActive(false), 3000);
      }
    });
  }

function handleLeave() {
    socket.emit('leaveRoom', {}, () => {});
    onLeave();
  }

  function handleSaveAndLeave() {
    socket.emit('getSaveState', { code: roomInfo.code }, (res) => {
      socket.emit('leaveRoom', {}, () => {});
      if (res?.state && onSaveAndLeave) {
        const me = res.state.players.find(p => p.id === roomInfo.playerId);
        onSaveAndLeave({
          ...res.state,
          myPlayerId: roomInfo.playerId,
          playerName: me?.name,
          avatarId: me?.avatarId,
        });
      } else {
        onLeave();
      }
    });
  }

function sortHandForReveal(cards) {
  const suitOrder = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
  return [...cards].sort((a, b) => {
    if (a.isJoker && b.isJoker) return 0;
    if (a.isJoker) return 1;
    if (b.isJoker) return -1;
    const s = (suitOrder[a.suit] ?? 4) - (suitOrder[b.suit] ?? 4);
    return s !== 0 ? s : a.value - b.value;
  });
}

function sortMeldCards(cards, type) {
    if (type === 'set') {
      const suitOrder = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
      return [...cards].sort((a, b) => (suitOrder[a.suit] ?? 4) - (suitOrder[b.suit] ?? 4));
    }

    const jokers = cards.filter(c => c.isJoker);
    const nonJokers = cards.filter(c => !c.isJoker);
    const hasAce = nonJokers.some(c => c.rank === 'A');

    // Ace is high if other cards in the run are Q or K
    const otherValues = nonJokers.filter(c => c.rank !== 'A').map(c => c.value);
    const aceIsHigh = hasAce && otherValues.some(v => v >= 12);

    const getVal = c => c.rank === 'A' ? (aceIsHigh ? 14 : 1) : c.value;
    const sorted = [...nonJokers].sort((a, b) => getVal(a) - getVal(b));

    if (jokers.length === 0) return sorted;

    // Insert joker into the gap
    for (let i = 1; i < sorted.length; i++) {
      if (getVal(sorted[i]) - getVal(sorted[i - 1]) === 2) {
        return [...sorted.slice(0, i), jokers[0], ...sorted.slice(i)];
      }
    }
    return [...sorted, ...jokers];
  }
  

  function sortBySuit() {
    const suitOrder = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
    const sorted = [...(me?.hand || [])].sort((a, b) => {
      if (a.isJoker) return 1;
      if (b.isJoker) return -1;
      const s = (suitOrder[a.suit] ?? 4) - (suitOrder[b.suit] ?? 4);
      return s !== 0 ? s : a.value - b.value;
    });
    setHandOrder(sorted.map(c => c.id));
  }

  function sortByRank() {
    const sorted = [...(me?.hand || [])].sort((a, b) => {
      if (a.isJoker) return 1;
      if (b.isJoker) return -1;
      const r = a.value - b.value;
      return r !== 0 ? r : a.suit.localeCompare(b.suit);
    });
    setHandOrder(sorted.map(c => c.id));
  }

  function onDragOver(e, targetId) {
    e.preventDefault();
    const dragged = draggedIdRef.current;
    if (dragged === null || dragged === targetId) return;
    setHandOrder(prev => {
      const next    = [...prev];
      const fromIdx = next.indexOf(dragged);
      const toIdx   = next.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, dragged);
      return next;
    });
  }

  // ── PICKING PHASE ────────────────────────────────────────────────────────
  if (gameState.status === 'picking') {
    const myPick   = gameState.playerPicks?.[roomInfo.playerId];
    const revealed = gameState.pickingRevealed;
    const winner   = gameState.players.find(p => p.id === gameState.pickingWinnerId);
    return (
      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
        style={{ minHeight:'100vh', display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center', gap:28, padding:'24px 16px',
          background:'radial-gradient(ellipse at 50% 30%, #1e6b42 0%, #0d3b22 100%)' }}>

        {/* Header */}
        <motion.div initial={{ y:-24, opacity:0 }} animate={{ y:0, opacity:1 }}
          transition={{ delay:0.1 }} style={{ textAlign:'center' }}>
          <h2 style={{ fontFamily:"'Fredoka One',cursive", fontSize:34, marginBottom:4 }}>
            {revealed ? `${winner?.name ?? 'Someone'} deals!` : 'Pick a card!'}
          </h2>
          {!revealed && <>
            <p style={{ opacity:0.55, fontSize:14 }}>Highest card deals · Left player goes first</p>
            <p style={{ opacity:0.3, fontSize:12, marginTop:2 }}>Ties: ♠ &gt; ♥ &gt; ♦ &gt; ♣</p>
          </>}
        </motion.div>

        {/* Cards — overlapping fan, dynamically sized to never overflow */}
        {(() => {
          const cards = gameState.pickingCards || [];
          const count = cards.length;
          const isMob = window.innerWidth < 600;
          const cardW = isMob ? 62 : 84;
          const cardH = isMob ? 90 : 120;
          // Max fan width = viewport minus padding; step shrinks to fit
          const maxFanW = window.innerWidth - 48;
          const step = count > 1
            ? Math.min(isMob ? 44 : 38, Math.floor((maxFanW - cardW) / (count - 1)))
            : 0;
          const fanW = count > 0 ? cardW + step * (count - 1) : cardW;
          const TILTS = [-13, 8, -17, 5, 14, -7, 11, -4, 16, -10, 6, -15, 9, -3, 12, -8];

          return (
            <div style={{
              position: 'relative',
              width: fanW,
              height: cardH + 70,
              marginTop: 20,
              flexShrink: 0,
            }}>
              {cards.map((card, idx) => {
                const pickedEntry = Object.entries(gameState.playerPicks || {}).find(([,c]) => c?.id === card.id);
                const isTaken  = !!pickedEntry;
                const pickedBy = pickedEntry ? gameState.players.find(p => p.id === pickedEntry[0]) : null;
                const isMyPick = myPick?.id === card.id;
                const isWinner = revealed && card.id === gameState.playerPicks?.[gameState.pickingWinnerId]?.id;
                const canPick  = !myPick && !isTaken;
                const tilt     = TILTS[idx % TILTS.length];
                return (
                  <motion.div key={card.id}
                    initial={{ y: -40, opacity: 0 }}
                    animate={{
                      opacity: 1,
                      y: isMyPick ? -22 : 0,
                      rotate: isTaken ? 0 : tilt,
                      zIndex: isMyPick ? 100 : isTaken ? 50 : idx,
                    }}
                    whileHover={canPick ? { y: -14, rotate: 0, zIndex: 200 } : {}}
                    transition={{ duration: 0.3, delay: idx * 0.04 }}
                    style={{
                      position: 'absolute',
                      left: idx * step,
                      top: 0,
                      cursor: canPick ? 'pointer' : 'default',
                      transformOrigin: 'bottom center',
                      filter: isWinner
                        ? 'drop-shadow(0 0 14px rgba(244,165,34,1)) drop-shadow(0 0 28px rgba(244,165,34,0.5))'
                        : isMyPick ? 'drop-shadow(0 0 10px rgba(244,165,34,0.8))' : 'none',
                    }}
                    onClick={() => canPick && socket.emit('pickCard', { cardId: card.id }, () => {})}>
                    <motion.div
                      key={`flip-${isTaken}-${revealed}`}
                      initial={{ rotateY: isTaken ? -90 : 0 }}
                      animate={{ rotateY: 0 }}
                      transition={{ duration: 0.35, delay: revealed && isTaken ? idx * 0.09 : 0 }}
                      style={{ display:'inline-block', transformStyle:'preserve-3d' }}>
                      <Card card={isTaken ? card : { hidden: true }} />
                    </motion.div>
                    {pickedBy && (
                      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        style={{ marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <Avatar id={pickedBy.avatarId} size={26} />
                        <p style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                          color: isMyPick || isWinner ? '#f4a522' : 'rgba(255,255,255,0.65)' }}>
                          {isWinner ? '👑 ' : ''}{pickedBy.name}
                        </p>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          );
        })()}

        {/* Status */}
        <AnimatePresence mode="wait">
          {!myPick && !revealed && (
            <motion.p key="hint" initial={{ opacity:0 }} animate={{ opacity:0.6 }} exit={{ opacity:0 }}
              style={{ fontStyle:'italic', fontSize:14 }}>
              Tap any card to pick it
            </motion.p>
          )}
          {myPick && !revealed && (
            <motion.div key="waiting" initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}
              style={{ background:'rgba(244,165,34,0.12)', border:'1px solid rgba(244,165,34,0.35)',
                borderRadius:14, padding:'12px 28px', textAlign:'center' }}>
              <p style={{ color:'#f4a522', fontWeight:700, fontSize:15 }}>Card picked!</p>
              <p style={{ opacity:0.5, fontSize:12, marginTop:2 }}>Waiting for others...</p>
            </motion.div>
          )}
          {revealed && winner && (
            <motion.div key="winner" initial={{ opacity:0, y:20, scale:0.9 }}
              animate={{ opacity:1, y:0, scale:1 }} transition={{ delay:0.3, type:'spring', bounce:0.4 }}
              style={{ background:'rgba(244,165,34,0.15)', border:'2px solid #f4a522',
                borderRadius:20, padding:'20px 36px', textAlign:'center' }}>
              <div style={{ fontSize:30, marginBottom:4 }}>👑</div>
              <h3 style={{ fontFamily:"'Fredoka One',cursive", fontSize:24, color:'#f4a522', marginBottom:4 }}>
                {winner.name} deals!
              </h3>
              <p style={{ opacity:0.8, fontSize:14 }}>
                <strong>{gameState.players[gameState.startingPlayerIndex]?.name}</strong> goes first
              </p>
              <p style={{ opacity:0.35, fontSize:12, marginTop:8 }}>Starting in 3 seconds...</p>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    );
  }

  // ── ROUND END ─────────────────────────────────────────────────────────────
  if ((gameState.status === 'roundEnd' || gameState.status === 'gameOver') && showRoundEnd) {
    const isGameOver = gameState.status === 'gameOver';
    const winner = gameState.players.find(p => p.id === gameState.winner);
    return (
      <motion.div
        initial={{ opacity:0 }}
        animate={{ opacity:1 }}
        transition={{ duration:0.5 }}
        style={{ display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', minHeight:'100vh', gap:24, padding:24,
        background:'radial-gradient(ellipse at 50% 30%, #1e6b42 0%, #0d3b22 100%)' }}>
        <motion.div
          initial={{ scale:0, rotate:-10 }}
          animate={{ scale:1, rotate:0 }}
          transition={{ delay:0.2, duration:0.5, ease:'backOut' }}
          style={{ textAlign:'center' }}>
          {isGameOver && <div style={{ fontSize:64, marginBottom:8 }}>🏆</div>}
          <h1 style={{ fontFamily:"'Fredoka One',cursive", fontSize:42, marginBottom:4 }}>
            {isGameOver ? t.gameOver : t.roundOver}
          </h1>
          {winner && <p style={{ fontSize:20, fontWeight:700, opacity:0.9 }}>{t.wins(winner.name)}</p>}
        </motion.div>

        {/* Scoreboard / Card reveal toggle */}
        {(() => {
          const hasReveal = revealedHands && Object.keys(revealedHands).length > 0;
          const [tab, setTab] = [roundEndTab, setRoundEndTab];
          return (
            <div style={{ width:'100%', maxWidth:480 }}>
              {/* Tab bar */}
              {hasReveal && (
                <div style={{ display:'flex', marginBottom:8, borderRadius:14, overflow:'hidden',
                  background:'rgba(0,0,0,0.25)', padding:4, gap:4 }}>
                  {['score', 'cards'].map(t2 => (
                    <button key={t2} onClick={() => setTab(t2)} style={{
                      flex:1, padding:'9px', border:'none', borderRadius:10, cursor:'pointer',
                      fontFamily:"'Fredoka One',cursive", fontSize:15,
                      background: tab === t2 ? 'rgba(244,165,34,0.25)' : 'transparent',
                      color: tab === t2 ? '#f4a522' : 'rgba(255,255,255,0.5)',
                      fontWeight: tab === t2 ? 800 : 600,
                      transition:'all 0.2s',
                    }}>
                      {t2 === 'score' ? '🏆 Score' : '🃏 Their cards'}
                    </button>
                  ))}
                </div>
              )}

              {/* Score panel */}
              {tab === 'score' && (
                <div style={{ background:'rgba(0,0,0,0.35)', borderRadius:20, padding:24,
                  border:'1px solid rgba(255,255,255,0.1)' }}>
                  {[...gameState.players]
                    .sort((a, b) => {
                      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
                      return a.totalScore - b.totalScore;
                    })
                    .map((p, rank) => (
                    <motion.div key={p.id}
                      initial={{ opacity:0, x:-30 }}
                      animate={{ opacity:1, x:0 }}
                      transition={{ delay: 0.3 + rank * 0.1, duration:0.3 }}
                      style={{
                      display:'flex', justifyContent:'space-between', alignItems:'center',
                      padding:'10px 14px', marginBottom:8, borderRadius:12,
                      background: rank === 0 ? 'rgba(244,165,34,0.15)' : 'rgba(255,255,255,0.05)',
                      border: rank === 0 ? '1px solid rgba(244,165,34,0.4)' : '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:20 }}>
                          {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank+1}.`}
                        </span>
                        <span style={{ fontWeight:800, fontSize:15 }}>
                          {p.name}{p.isBot?' 🤖':''}{p.eliminated?' ❌':''}{p.hasExploded&&!p.eliminated?' 💥':''}
                        </span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        {(() => {
                          const delta = p.totalScore - (roundStartScores[p.id] ?? p.totalScore);
                          return delta > 0 ? (
                            <span style={{ fontSize:13, fontWeight:700, color:'#ff8080',
                              background:'rgba(230,57,70,0.15)', padding:'2px 7px', borderRadius:20 }}>
                              +{delta}
                            </span>
                          ) : delta === 0 && !p.eliminated ? (
                            <span style={{ fontSize:13, fontWeight:700, color:'#80ff80',
                              background:'rgba(76,175,80,0.15)', padding:'2px 7px', borderRadius:20 }}>
                              +0 🏆
                            </span>
                          ) : null;
                        })()}
                        <span style={{ fontFamily:"'Fredoka One',cursive", fontSize:22,
                          color: rank === 0 ? '#f4a522' : '#fff' }}>
                          {p.totalScore} pts
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Card reveal panel */}
              {tab === 'cards' && hasReveal && (
                <div style={{ background:'rgba(0,0,0,0.3)', borderRadius:20, padding:'16px 20px',
                  border:'1px solid rgba(255,255,255,0.08)' }}>
                  {gameState.players
                    .filter(p => revealedHands[p.id]?.length > 0)
                    .map(p => {
                      const cards = sortHandForReveal(revealedHands[p.id]);
                      const n = cards.length;
                      const availableW = Math.min(window.innerWidth - 80, 400);
                      const step = n > 1 ? Math.min(44, Math.floor(availableW / n)) : 48;
                      const overlap = -(48 - step);
                      return (
                        <div key={p.id} style={{ marginBottom:14 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                            <Avatar id={p.avatarId || 'sporty'} size={22} />
                            <span style={{ fontSize:12, fontWeight:700, opacity:0.6 }}>{p.name}</span>
                          </div>
                          <div style={{ display:'flex', flexWrap:'nowrap' }}>
                            {cards.map((c, i) => (
                              <div key={c.id} style={{ marginLeft: i === 0 ? 0 : overlap, zIndex: i, flexShrink:0 }}>
                                <Card card={c} small />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })()}

        <div style={{ display:'flex', gap:14, flexWrap:'wrap', justifyContent:'center' }}>
          {!isGameOver && (
            <motion.button className="btn-primary"
              initial={{ opacity:0, y:20 }}
              animate={{ opacity:1, y:0 }}
              transition={{ delay:0.6, duration:0.4, ease:'backOut' }}
              whileHover={{ scale:1.05 }}
              whileTap={{ scale:0.95 }}
              style={{ fontSize:18, padding:'14px 36px', display:'flex', alignItems:'center', gap:10 }}
              onClick={() => { setNextRoundCountdown(null); emit('startNextRound'); }}>
              {t.nextRound}
              {nextRoundCountdown !== null && (
                <span style={{
                  background:'rgba(0,0,0,0.25)', borderRadius:20,
                  padding:'2px 10px', fontSize:15, fontWeight:800,
                  minWidth:28, textAlign:'center',
                }}>
                  {nextRoundCountdown}
                </span>
              )}
            </motion.button>
          )}
          {isGameOver && (
            <motion.button className="btn-primary"
              initial={{ opacity:0, y:20 }}
              animate={{ opacity:1, y:0 }}
              transition={{ delay:0.6, duration:0.4, ease:'backOut' }}
              whileHover={{ scale:1.05 }}
              whileTap={{ scale:0.95 }}
              style={{ fontSize:18, padding:'14px 36px' }}
              onClick={onLeave}>
              {t.backToHome}
            </motion.button>
          )}
        </div>
      </motion.div>
    );
  }

  // ── MAIN GAME SCREEN ──────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'visible' }}>

{/* PIOU flash */}
      {piouActive && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, bottom:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:500, pointerEvents:'none',
        }}>
          <motion.div
            initial={{ scale:0, rotate:-15 }}
            animate={{ scale:1, rotate:0 }}
            exit={{ scale:0 }}
            transition={{ type:'spring', bounce:0.6 }}
            style={{
              background:'rgba(230,57,70,0.95)', color:'#fff',
              fontFamily:"'Fredoka One',cursive",
              fontSize:64, fontWeight:900, padding:'24px 48px',
              borderRadius:30, textAlign:'center',
              boxShadow:'0 8px 40px rgba(230,57,70,0.6)',
            }}>
            😤 PIOU!!!
          </motion.div>
        </div>
      )}

{/* Winner overlay — shown during 2s pause before scoreboard */}
      {(gameState.status === 'roundEnd' || gameState.status === 'gameOver') && !showRoundEnd && (() => {
        const winner = gameState.players.find(p => p.id === gameState.winner);
        return (
          <motion.div
            initial={{ opacity:0 }}
            animate={{ opacity:1 }}
            style={{
              position:'fixed', top:0, left:0, right:0, bottom:0,
              background:'rgba(0,0,0,0.45)', zIndex:300,
              display:'flex', alignItems:'center', justifyContent:'center',
              pointerEvents:'none',
            }}>
            {winner && (
              <motion.div
                initial={{ scale:0.6, opacity:0 }}
                animate={{ scale:1, opacity:1 }}
                transition={{ duration:0.4, ease:'backOut' }}
                style={{ textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
                <motion.div
                  animate={{ y: [0, -16, 0, -10, 0, -5, 0] }}
                  transition={{ duration:1.1, ease:'easeInOut', repeat: Infinity }}>
                  <Avatar id={winner.avatarId || 'sporty'} size={100} />
                </motion.div>
                <div style={{
                  background:'rgba(244,165,34,0.95)', color:'#5a3000',
                  fontFamily:"'Fredoka One',cursive",
                  fontSize:36, padding:'14px 36px', borderRadius:24,
                  boxShadow:'0 6px 30px rgba(244,165,34,0.5)',
                }}>
                  {t.winsShort(winner.name)}
                </div>
              </motion.div>
            )}
          </motion.div>
        );
      })()}

{/* Disconnect banner */}
      {disconnectInfo && (
        <motion.div
          initial={{ y:-60 }}
          animate={{ y:0 }}
          style={{
            position:'fixed', top: gameState.stopCalledBy ? 70 : 0,
            left:0, right:0, zIndex:190,
            background:'rgba(30,30,30,0.95)',
            padding:'10px 20px',
            display:'flex', justifyContent:'space-between', alignItems:'center',
            boxShadow:'0 4px 20px rgba(0,0,0,0.5)',
          }}>
          <div>
            <div style={{ fontWeight:900, fontSize:15 }}>
              ⚠️ {t.disconnectedWaiting(disconnectInfo.playerName)}
            </div>
          </div>
          <div style={{
            fontFamily:"'Fredoka One',cursive", fontSize:28,
            color: disconnectCountdown <= 10 ? '#e63946' : '#f4a522',
          }}>
            {disconnectCountdown}s
          </div>
        </motion.div>
      )}

{/* ── STOP BANNER ── */}
      {gameState.stopCalledBy && (
        <motion.div
          initial={{ y:-60 }}
          animate={{ y:0 }}
          style={{
            position:'fixed', top:0, left:0, right:0, zIndex:200,
            background:'linear-gradient(135deg, #e63946, #c0392b)',
            padding:'10px 20px',
            display:'flex', justifyContent:'space-between', alignItems:'center',
            boxShadow:'0 4px 20px rgba(230,57,70,0.5)',
          }}>
          <div>
            <div style={{ fontWeight:900, fontSize:16 }}>
              🛑 {t.stopBanner(gameState.players.find(p => p.id === gameState.stopCalledBy)?.name, stopCountdown)}
            </div>
          </div>
          {gameState.stopCalledBy === roomInfo.playerId && (
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => emit('resetStop')} style={{
                background:'rgba(255,255,255,0.15)', color:'#fff',
                border:'1px solid rgba(255,255,255,0.4)',
                borderRadius:20, padding:'6px 14px',
                cursor:'pointer', fontSize:12, fontWeight:700,
              }}>
                🔄 {t.reset}
              </button>
              <button onClick={declareFalseStop} style={{
                background:'rgba(0,0,0,0.25)', color:'#fff',
                border:'1px solid rgba(255,255,255,0.4)',
                borderRadius:20, padding:'6px 14px',
                cursor:'pointer', fontSize:12, fontWeight:700,
              }}>
                😤 {t.giveUp}
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* ── HEADER ── */}
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        background:'rgba(13,59,34,0.97)', backdropFilter:'blur(8px)',
        padding:'10px 20px', borderBottom:'1px solid rgba(255,255,255,0.07)',
        flexShrink:0, zIndex:100,
      }}>
        <GameMenu
          gameState={gameState}
          roomInfo={roomInfo}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted(prev => !prev)}
          onLeave={handleLeave}
          onSaveAndLeave={handleSaveAndLeave}
          lang={lang}
        />

        <motion.div
          key={isMyTurn ? 'myturn' : 'theirturn'}
          initial={isMyTurn ? { scale:0.8, y:-10 } : { scale:1, y:0 }}
          animate={isMyTurn ? { scale:[1.1, 1], y:0 } : { scale:1, y:0 }}
          transition={{ type:'spring', bounce:0.5, duration:0.4 }}
          style={{
            background: isMyTurn ? 'rgba(244,165,34,0.18)' : 'rgba(255,255,255,0.07)',
            border: `2px solid ${isMyTurn ? '#f4a522' : 'rgba(255,255,255,0.1)'}`,
            borderRadius:50, padding:'7px 20px',
            fontWeight:800, fontSize:15,
            color: isMyTurn ? '#f4a522' : '#fff',
          }}>
          {isMyTurn ? t.yourTurn : t.sTurn(currentPlayer?.name)}
        </motion.div>

        {/* Emoji reaction button */}
        <div style={{ position:'relative' }}>
          <button
            onClick={() => setShowEmojiPicker(p => !p)}
            style={{
              background: showEmojiPicker ? 'rgba(244,165,34,0.25)' : 'rgba(255,255,255,0.1)',
              border: `1px solid ${showEmojiPicker ? '#f4a522' : 'rgba(255,255,255,0.15)'}`,
              borderRadius:10, padding:'6px 10px',
              cursor:'pointer', fontSize:18, lineHeight:1,
              transition:'all 0.2s',
            }}>
            💬
          </button>
          <AnimatePresence>
            {showEmojiPicker && (
              <motion.div
                initial={{ opacity:0, scale:0.85, y:6 }}
                animate={{ opacity:1, scale:1, y:0 }}
                exit={{ opacity:0, scale:0.85, y:6 }}
                transition={{ duration:0.15 }}
                style={{
                  position:'absolute', top:'calc(100% + 8px)', right:0,
                  background:'rgba(15,74,42,0.98)', border:'1px solid rgba(255,255,255,0.15)',
                  borderRadius:14, padding:10, zIndex:500,
                  display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6, width:220,
                  boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
                }}>
                {REACTIONS.map(({ emoji, text }) => (
                  <button key={emoji}
                    onClick={() => {
                      socket.emit('sendReaction', { emoji, text });
                      setShowEmojiPicker(false);
                    }}
                    style={{
                      background:'rgba(255,255,255,0.07)', border:'none',
                      borderRadius:8, padding:'7px 10px', fontSize:13,
                      cursor:'pointer', transition:'all 0.15s',
                      display:'flex', alignItems:'center', gap:6,
                      color:'#fff', fontWeight:600, textAlign:'left',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(244,165,34,0.25)'}
                    onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.07)'}
                  >
                    <span style={{ fontSize:20 }}>{emoji}</span>
                    <span>{text}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Floating reaction bubbles */}
      <AnimatePresence>
        {reactions.map(r => (
          <motion.div key={r.id}
            initial={{ opacity:1, y:0, scale:0.5 }}
            animate={{ opacity:0, y:-140, scale:1 }}
            exit={{ opacity:0 }}
            transition={{ duration:4, ease:'easeOut' }}
            style={{
              position:'fixed', left: r.cx, top: r.cy,
              transform:'translateX(-50%)',
              zIndex:900, pointerEvents:'none',
              display:'flex', flexDirection:'column', alignItems:'center', gap:3,
            }}>
            <div style={{
              background:'rgba(15,40,25,0.98)', border:'1px solid rgba(255,255,255,0.25)',
              borderRadius:20, padding:'5px 10px',
              display:'flex', alignItems:'center', gap:6,
              boxShadow:'0 4px 16px rgba(0,0,0,0.4)',
            }}>
              <span style={{ fontSize:22 }}>{r.emoji}</span>
              <span style={{ fontSize:13, fontWeight:700, color:'#fff', whiteSpace:'nowrap' }}>{r.text}</span>
            </div>
            <div style={{
              background:'rgba(0,0,0,0.5)', borderRadius:20,
              padding:'1px 7px', fontSize:10, fontWeight:700,
              color:'rgba(255,255,255,0.6)', whiteSpace:'nowrap',
            }}>{r.playerName}</div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ── OPPONENTS ── */}
      <div style={{
        display:'flex', gap: isMobileLayout ? 5 : 8,
        padding: isMobileLayout ? '5px 8px' : '10px 16px',
        justifyContent:'center', flexWrap:'wrap',
        background:'rgba(13,59,34,0.97)', flexShrink:0,
      }}>
        {others.map(p => {
          const isActive = currentPlayer?.id === p.id;
          const avatarSize = isMobileLayout ? 22 : 40;
          const cardW = isDebug ? 60 : isMobileLayout ? 30 : 48;
          const fanH = isDebug ? 90 : isMobileLayout ? 32 : 52;
          const maxFanW = isDebug ? 999 : isMobileLayout ? 80 : 130;
          return (
            <div key={p.id} data-player-id={p.id} style={{
              background: isActive ? 'rgba(244,165,34,0.12)' : 'rgba(0,0,0,0.28)',
              border: `2px solid ${isActive ? '#f4a522' : 'rgba(255,255,255,0.08)'}`,
              borderRadius:14,
              padding: isMobileLayout ? '5px 8px' : '8px 12px',
              flex: isDebug ? '0 0 auto' : 1,
              minWidth: isDebug ? 120 : isMobileLayout ? 80 : 130,
              maxWidth: isDebug ? 'none' : isMobileLayout ? 140 : 200,
              transition:'all 0.3s',
              boxShadow: isActive ? '0 0 20px rgba(244,165,34,0.2)' : 'none',
              position:'relative',
            }}>
              {piouActive && (
                <motion.div
                  initial={{ scale:0, y:-10 }}
                  animate={{ scale:1, y:0 }}
                  exit={{ scale:0 }}
                  style={{
                    position:'absolute', bottom: isMobileLayout ? -24 : -32, left:'50%',
                    transform:'translateX(-50%)',
                    background:'#fff', color:'#e63946',
                    fontWeight:900, fontSize: isMobileLayout ? 10 : 13,
                    padding:'3px 8px', borderRadius:20,
                    whiteSpace:'nowrap', zIndex:200,
                    boxShadow:'0 2px 8px rgba(0,0,0,0.3)',
                  }}>
                  😤 PIOU!!!
                  <div style={{
                    position:'absolute', top:-6, left:'50%',
                    transform:'translateX(-50%)',
                    width:0, height:0,
                    borderLeft:'6px solid transparent',
                    borderRight:'6px solid transparent',
                    borderBottom:'6px solid #fff',
                  }} />
                </motion.div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: isMobileLayout ? 3 : 6 }}>
                <div style={{ display:'flex', alignItems:'center', gap: isMobileLayout ? 3 : 5 }}>
                  <Avatar id={p.avatarId || 'sporty'} size={avatarSize} />
                  <span style={{ fontWeight:800, fontSize: isMobileLayout ? 9 : 12,
                    color: !p.isBot ? '#fff' :
                      p.difficulty === 'easy' ? '#4caf50' :
                      p.difficulty === 'medium' ? '#f4a522' : '#e63946',
                    maxWidth: isMobileLayout ? 50 : 999,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  }}>
                    {p.name}{p.eliminated?' ❌':''}{p.hasExploded&&!p.eliminated?' 💥':''}
                  </span>
                </div>
                <span style={{ background:'rgba(244,165,34,0.25)', color:'#f4a522',
                  fontWeight:800, fontSize: isMobileLayout ? 9 : 11,
                  padding: isMobileLayout ? '1px 5px' : '2px 7px', borderRadius:20 }}>
                  {p.totalScore}
                </span>
              </div>
              {(() => {
                const count = (p.hand || []).length;
                const offset = isDebug ? cardW + 4 : count <= 1 ? 0 : Math.min(isMobileLayout ? 8 : 12, (maxFanW - cardW) / (count - 1));
                const totalW = isDebug ? count * (cardW + 4) : count > 0 ? cardW + (count - 1) * offset : cardW;
                return (
                  <div style={{ position:'relative', height:fanH, width:totalW, marginTop: isMobileLayout ? 2 : 4 }}>
                    {(p.hand || []).map((c, i) => (
                      <motion.div key={c.id ?? i}
                        initial={{ opacity:0, x:-10 }}
                        animate={{ opacity:1, x:0 }}
                        transition={{ duration:0.25, delay: i * 0.04 }}
                        style={{ position:'absolute', left: i * offset, top:0, zIndex:i }}>
                        <Card card={c} medium={isDebug} small={!isDebug && !isMobileLayout} tiny={!isDebug && isMobileLayout} />
                      </motion.div>
                    ))}
                    <div style={{
                      position:'absolute', top:-5, right:-8, zIndex:50,
                      background:'#f4a522', color:'#1a1a1a',
                      borderRadius:'50%',
                      width: isMobileLayout ? 15 : 20,
                      height: isMobileLayout ? 15 : 20,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize: isMobileLayout ? 8 : 10, fontWeight:900,
                      boxShadow:'0 2px 6px rgba(0,0,0,0.4)',
                    }}>
                      {count}
                    </div>
                  </div>
                );
              })()}
              {p.stopBanned && (
                <motion.div
                  initial={{ scale:0 }}
                  animate={{ scale:1 }}
                  style={{
                    fontSize: isMobileLayout ? 9 : 11, fontWeight:900, color:'#ff8080',
                    marginTop: isMobileLayout ? 2 : 3,
                    background:'rgba(230,57,70,0.15)', padding:'2px 6px',
                    borderRadius:20, textAlign:'center',
                  }}>
                  😤 PIOU!!!
                </motion.div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── TABLE SURFACE ── */}
      <div style={{
        flex:1, display:'flex', flexDirection:'column', overflow:'visible',
        background:'radial-gradient(ellipse at 55% 45%, #1e6b42 0%, #124d2e 100%)',
        position:'relative',
      }}>

        {/* Melds */}
        {gameState.melds.length > 0 && (
          <div ref={meldAreaRef} style={{
            display:'flex', flexWrap:'wrap', gap:8, padding:'10px 16px',
            flexShrink:0,
            borderBottom:'1px solid rgba(255,255,255,0.06)',
            alignItems:'flex-start',
            justifyContent: isMobileLayout ? 'flex-start' : 'center',
          }}>
            {gameState.melds.map(meld => {
              const sorted = sortMeldCards(meld.cards, meld.type);
              const n = sorted.length;
              const cardW = isMobileLayout ? 48 : 60;
              const cardH = isMobileLayout ? 68 : 86;

              // Mobile: 2-per-row with overlap for many cards
              // Desktop: auto-size each meld box (no forced percentages)
              const flexBasis = isMobileLayout
                ? (n >= 8 ? '100%' : 'calc(50% - 4px)')
                : 'auto';

              // Mobile overlap calculation; desktop never needs overlap (box auto-sizes)
              const mobileInnerW = n >= 8 ? 330 : 150;
              const noOverlapW = n * cardW + (n - 1) * 3;
              const needsOverlap = isMobileLayout && noOverlapW > mobileInnerW;
              const step = needsOverlap && n > 1
                ? Math.max(16, Math.floor((mobileInnerW - cardW) / (n - 1)))
                : null;

              return (
                <div key={meld.id} data-meld-id={meld.id} style={{
                  background:'rgba(0,0,0,0.22)', borderRadius:10,
                  padding:'8px 10px',
                  flex: `0 0 ${flexBasis}`,
                  minWidth:0, boxSizing:'border-box',
                  border:'1px solid rgba(255,255,255,0.08)',
                }}>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    {sorted.map((c, i) => (
                      <motion.div key={c.id}
                        initial={{ opacity:0, scale:0.5, y:-20 }}
                        animate={{ opacity:1, scale:1, y:0 }}
                        transition={{ duration:0.3, ease:'backOut' }}
                        style={{ marginLeft: i === 0 ? 0 : needsOverlap ? -(cardW - step) : 3, zIndex:i, flexShrink:0 }}
                        onClick={() => {
                          if (!isMyTurn || phase !== 'play' || selectedCards.length === 0) return;
                          if (c.isJoker && selectedCards.length === 1) {
                            emit('stealJoker', { meldId: meld.id, replacementCardId: selectedCards[0] });
                          } else {
                            emit('extendMeld', { meldId: meld.id, cardIds: selectedCards });
                          }
                        }}>
                        <Card card={c} medium />
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Center: piles + actions */}
        <div style={{
          flex:1, display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center', gap:20,
        }}>
          {/* Draw + Discard */}
          <div style={{ display:'flex', gap:40, alignItems:'flex-end' }}>
            <div style={{ textAlign:'center' }}>
              <p style={{ fontSize:11, fontWeight:700, opacity:0.45, letterSpacing:1, marginBottom:16 }}>
                DRAW ({gameState.drawPile.length})
              </p>
              <div ref={drawPileRef} style={{
                cursor: isMyTurn&&(phase==='draw'||phase==='firstDraw') ? 'pointer' : 'default',
                transform:'scale(1.3)', transformOrigin:'bottom center',
                transition:'transform 0.2s',
              }}
              onMouseEnter={e => { if(isMyTurn) e.currentTarget.style.transform='scale(1.22)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform='scale(1.15)'; }}
              onClick={() => {
                if (!isMyTurn) return;
                if (phase === 'firstDraw') emit('firstDraw');
                else if (phase === 'draw') emit('drawFromPile');
              }}>
                <Card card={{ hidden:true }} />
              </div>
            </div>

            <div style={{ textAlign:'center' }}>
              <p style={{ fontSize:11, fontWeight:700, opacity:0.45, letterSpacing:1, marginBottom:16 }}>
                DISCARD
              </p>
              <div ref={discardPileRef} style={{
                cursor: (!isMyTurn && phase==='draw' && !me?.stopBanned && !gameState.stopCalledBy) ? 'pointer' : (isMyTurn&&phase==='draw' ? 'pointer' : 'default'),
                transform:'scale(1.3)', transformOrigin:'bottom center',
                transition:'all 0.2s',
                filter: (!isMyTurn && phase==='draw' && !me?.stopBanned && topDiscard && !gameState.stopCalledBy && !me?.discardBanned && gameState.lastDiscardedBy !== roomInfo.playerId)
                  ? 'drop-shadow(0 0 12px rgba(230,57,70,1)) drop-shadow(0 0 20px rgba(230,57,70,0.7))'
                  : 'none',
              }}
              onMouseEnter={e => { if(isMyTurn&&phase==='draw') e.currentTarget.style.transform='scale(1.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform='scale(1.15)'; }}
              onClick={() => {
                if (!isMyTurn && phase === 'draw' && !me?.stopBanned && topDiscard && !gameState.stopCalledBy) {
                  enterStopMode();
                  return;
                }
                if (!isMyTurn) return;
                if (phase === 'draw') emit('drawFromDiscard');
                else if (phase === 'play' && selectedCards.length === 1) {
                  const card = me?.hand?.find(c => c.id === selectedCards[0]);
                  if (!card?.isJoker) emit('discardCard', { cardId: selectedCards[0] });
                }
              }}>
                {topDiscard
                  ? <Card card={topDiscard} />
                  : <div style={{ width:70, height:100, border:'2px dashed rgba(255,255,255,0.2)', borderRadius:8 }} />
                }
              </div>
            </div>
          </div>

          {/* Action area */}
          <div style={{ display:'flex', flexDirection:'column', gap:10, alignItems:'center' }}>
            {isMyTurn && <>
              {phase==='firstDraw' && (
                <p style={{ opacity:0.65, fontStyle:'italic', fontSize:14 }}>👆 Click the draw pile</p>
              )}
              {phase==='firstKeepOrDiscard' && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                  <p style={{ opacity:0.6, fontSize:13, fontWeight:700, letterSpacing:0.4, margin:0 }}>
                    {me?.hand?.find(c => c.id === newCardId)?.isJoker
                      ? t.jokerMustKeep
                      : t.keepOrDraw}
                  </p>
                  <div style={{ display:'flex', gap:12 }}>
                    <button className="btn-success"
                      style={{ fontSize:16, padding:'13px 30px' }}
                      onClick={() => emit('firstKeepOrDiscard', { keep:true })}>
                      {t.keep}
                    </button>
                    {!me?.hand?.some(c => c.id === newCardId && c.isJoker) && (
                      <button className="btn-danger"
                        style={{ fontSize:16, padding:'13px 30px' }}
                        onClick={() => emit('firstKeepOrDiscard', { keep:false })}>
                        {t.discardAndRedraw}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {phase==='play' && <>
                {selectedCards.length === 0 && (
                  <p style={{ opacity:0.5, fontStyle:'italic', fontSize:13 }}>
                    {t.selectCardsHint}
                  </p>
                )}
                {selectedCards.length === 1 && !me?.hand?.find(c => c.id===selectedCards[0])?.isJoker && (
                  <p style={{ opacity:0.6, fontSize:13 }}>👆 {t.selectCardsHint.split('·')[1]?.trim()}</p>
                )}
                {selectedCards.length >= 3 && (
                  <div onClick={() => emit('playMeld', { cardIds:selectedCards })}
                    style={{
                      border:'2px dashed rgba(255,255,255,0.5)', borderRadius:12,
                      padding:'12px 32px', cursor:'pointer',
                      background:'rgba(255,255,255,0.07)',
                      fontSize:14, color:'rgba(255,255,255,0.85)',
                      transition:'all 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.07)'}>
                    {t.playMeld(selectedCards.length)}
                  </div>
                )}
              </>}
            </>}
          </div>
        </div>
      </div>

      {/* ── HAND ── */}
      <div data-player-id={roomInfo.playerId} style={{
        background:'rgba(13,59,34,0.97)', borderTop:'2px solid rgba(255,255,255,0.07)',
        padding:'12px 16px 12px 16px', paddingTop:28, flexShrink:0,
        overflow:'visible',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontWeight:800, fontSize:14 }}>
              {t.yourHand} ({me?.hand?.length ?? 0})
            </span>
            {(me?.stopBanned || me?.discardBanned) && (
              <motion.span
                initial={{ scale:0, rotate:-10 }}
                animate={{ scale:1, rotate:0 }}
                transition={{ type:'spring', bounce:0.6 }}
                style={{ background:'rgba(230,57,70,0.85)', color:'#fff',
                  fontSize:12, fontWeight:900, padding:'4px 12px', borderRadius:20,
                  boxShadow:'0 2px 10px rgba(230,57,70,0.5)' }}>
                {t.piouBanned}
              </motion.span>
            )}
          </div>
          <span style={{ fontSize:12, color:'#f4a522', fontWeight:700 }}>
            {me?.totalScore ?? 0} pts
          </span>
        </div>
        {(() => {
          const isMobile = 'ontouchstart' in window || window.innerWidth < 600;
          const orderedHand = handOrder.map(id => me?.hand?.find(c => c.id===id)).filter(Boolean);
          const cardW = isMobile ? 62 : 84;
          const cardH = isMobile ? 90 : 120;
          const availableW = window.innerWidth - 48;
          const count = orderedHand.length;
          const offset = count <= 1 ? cardW + 8 : Math.min(cardW + 8, (availableW - cardW) / (count - 1));

          if (isMobile) return (
            <div style={{ position:'relative', height: cardH + 30, marginTop:8, marginLeft:'auto', marginRight:'auto', width: Math.min(window.innerWidth - 48, cardW + offset * (count - 1)) }}>
              {orderedHand.map((card, i) => {
                const isSelected = selectedCards.includes(card.id);
                const isNew = newCardId === card.id;
                const isFeatured = isNew && phase === 'firstKeepOrDiscard' && isMyTurn;
                return (
                  <motion.div
                    key={card.id}
                    data-cardid={card.id}
                    initial={{ opacity:0, y:40 }}
                    animate={{
                      opacity:1,
                      x: i * offset,
                      y: isSelected ? -20 : 0,
                      scale: 1,
                      zIndex: isSelected ? 100 : isFeatured ? 200 : i,
                    }}
                    transition={{ duration:0.2 }}
                    style={{
                      position:'absolute', top:0, left:0,
                      zIndex: isSelected ? 100 : isFeatured ? 200 : i,
                      filter: isNew && !isFeatured ? 'drop-shadow(0 0 10px rgba(46,134,193,0.9))' : 'none',
                      touchAction:'none',
                    }}
                    onTouchStart={e => {
                      touchStartRef.current = { x:e.touches[0].clientX, y:e.touches[0].clientY };
                      isDraggingRef.current = false;
                      setDraggedId(card.id);
                    }}
                    onTouchMove={e => {
                      if (!touchStartRef.current) return;
                      const touch = e.touches[0];
                      const dx = Math.abs(touch.clientX - touchStartRef.current.x);
                      const dy = Math.abs(touch.clientY - touchStartRef.current.y);
                      if (dx > 8 || dy > 8) {
                        isDraggingRef.current = true;
                        // Find which card position the finger is over based on x position
                        const containerLeft = e.currentTarget.parentElement.getBoundingClientRect().left;
                        const fingerX = touch.clientX - containerLeft;
                        const targetIndex = Math.min(count - 1, Math.max(0, Math.round((fingerX - cardW/2) / offset)));
                        const targetCard = orderedHand[targetIndex];
                        if (targetCard && targetCard.id !== card.id) {
                          onDragOver({ preventDefault:()=>{} }, targetCard.id);
                        }
                      }
                    }}
                    onTouchEnd={e => {
                      if (!isDraggingRef.current) {
                        toggleCard(card.id);
                      }
                      setDraggedId(null);
                      isDraggingRef.current = false;
                      touchStartRef.current = null;
                    }}>
                    <Card card={card} selected={isSelected || isFeatured} />
                  </motion.div>
                );
              })}
            </div>
          );

          // Desktop layout — horizontal scroll
          return (
            <div ref={handContainerRef} style={{ overflowX:'auto', overflowY:'hidden', paddingBottom:4 }}>
              <div style={{ display:'flex', gap:8, paddingTop:20, justifyContent:'center', flexWrap:'wrap' }}>
                {orderedHand.map(card => {
                  const isFeatured = newCardId === card.id && phase === 'firstKeepOrDiscard' && isMyTurn;
                  return (
                    <motion.div key={card.id} draggable
                      data-cardid={card.id}
                      onDragStart={() => setDraggedId(card.id)}
                      onDragOver={e => onDragOver(e, card.id)}
                      onDragEnd={() => setDraggedId(null)}
                      initial={{ opacity:0, y:60, rotate:-5 }}
                      animate={{ opacity:1, y:0, scale:1, rotate:0 }}
                      transition={{ duration:0.35, ease:'backOut' }}
                      style={{
                        opacity: draggedId===card.id ? 0.4 : 1,
                        cursor:'grab',
                        position: isFeatured ? 'relative' : 'static',
                        zIndex: isFeatured ? 200 : 'auto',
                        filter: newCardId===card.id && !isFeatured ? 'drop-shadow(0 0 10px rgba(46,134,193,0.9))' : 'none',
                      }}>
                      <Card card={card}
                        selected={selectedCards.includes(card.id) || isFeatured}
                        onClick={() => toggleCard(card.id)} />
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {isDebug && <DebugPanel gameState={gameState} roomInfo={roomInfo} />}

      {/* Flying card animation */}
      {flyAnim && (
        <motion.div
          style={{ position:'fixed', top:0, left:0, zIndex:300, pointerEvents:'none' }}
          initial={{ x: flyAnim.fromX - 35, y: flyAnim.fromY - 50, opacity:1, scale:1 }}
          animate={{ x: flyAnim.toX - 35, y: flyAnim.toY - 50, opacity:0, scale:0.75 }}
          transition={{ duration:0.38, ease:'easeIn' }}
        >
          <Card card={{ hidden: flyAnim.hidden }} />
        </motion.div>
      )}

      {/* Toast message */}
      {message && (
        <div style={{
          position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)',
          background:'linear-gradient(135deg,#f05060,#e63946)',
          padding:'12px 28px', borderRadius:50, fontWeight:700, fontSize:14,
          boxShadow:'0 4px 20px rgba(230,57,70,0.5)', zIndex:999,
          whiteSpace:'nowrap',
        }}>
          {message}
        </div>
      )}
    </div>
  );
}