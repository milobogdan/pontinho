import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import socket from '../socket';
import Card from './Card';
import { Avatar, randomBotAvatar } from './Avatar';

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

export default function Game({ roomInfo }) {
  const [gameState, setGameState] = useState(null);
  const [selectedCards, setSelectedCards] = useState([]);   // card IDs selected in hand
  const [message, setMessage]     = useState('');
  const [handOrder, setHandOrder] = useState([]);
  const [draggedId, setDraggedId]  = useState(null);
  const [stopCountdown, setStopCountdown] = useState(120);
  const [piouActive, setPiouActive] = useState(false);
  const [newCardId, setNewCardId] = useState(null);
  const touchStartRef = useRef(null);
  const isDraggingRef = useRef(false);

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

      // Single card drawn during play → sort into correct position
      if (newOnes.length === 1) {
        setTimeout(() => setNewCardId(newOnes[0]), 50);
        setTimeout(() => setNewCardId(null), 2000);
        const newCard = player.hand.find(c => c.id === newOnes[0]);
        const suitOrder = { spades:0, hearts:1, diamonds:2, clubs:3 };
        const allSorted = [...kept.map(id => player.hand.find(c => c.id === id)).filter(Boolean), newCard]
          .sort((a, b) => {
            if (a.isJoker) return 1;
            if (b.isJoker) return -1;
            const s = (suitOrder[a.suit] ?? 4) - (suitOrder[b.suit] ?? 4);
            return s !== 0 ? s : a.value - b.value;
          });
        return allSorted.map(c => c.id);
      }
      return [...kept, ...newOnes];
    });
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

    socket.emit('getGameState', (res) => {
      if (res?.state) setGameState(res.state);
    });
    return () => {
      socket.off('gameState');
      socket.off('stopTimeout');
    };
  }, []);

  useEffect(() => {
    const bg = new Audio('/sounds/background.mp3');
    bg.loop = true;
    bg.volume = 0.1;
    bg.play().catch(() => {});
    return () => { bg.pause(); bg.currentTime = 0; };
  }, []);
   
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
    if (gameState?.status === 'roundEnd' || gameState?.status === 'gameOver') {
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
    }
  }, [gameState?.status]);

  const prevIsMyTurnRef = useRef(false);
  useEffect(() => {
    const myTurn = gameState?.players?.[gameState?.currentPlayerIndex]?.id === roomInfo.playerId;
    if (myTurn && !prevIsMyTurnRef.current && gameState?.status === 'playing') {
      playSound('turn');
    }
    prevIsMyTurnRef.current = myTurn;
  }, [gameState?.currentPlayerIndex, gameState?.status]);

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
    if (event === 'discardCard') playSound('discard');
    socket.emit(event, data, (res) => {
      if (res?.error) {
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
    if (!draggedId || draggedId === targetId) return;
    setHandOrder(prev => {
      const next     = [...prev];
      const fromIdx  = next.indexOf(draggedId);
      const toIdx    = next.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, draggedId);
      return next;
    });
  }

  // ── PICKING PHASE ────────────────────────────────────────────────────────
  if (gameState.status === 'picking') {
    const myPick   = gameState.playerPicks?.[roomInfo.playerId];
    const revealed = gameState.pickingRevealed;
    const winner   = gameState.players.find(p => p.id === gameState.pickingWinnerId);
    return (
      <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', gap:20, padding:24,
        background:'radial-gradient(ellipse at 50% 30%, #1e6b42 0%, #0d3b22 100%)' }}>

        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:52, marginBottom:8 }}>🃏</div>
          <h2 style={{ fontFamily:"'Fredoka One',cursive", fontSize:38, marginBottom:6 }}>Pick a card!</h2>
          <p style={{ opacity:0.6, fontSize:14 }}>Highest card = dealer · Player to the left goes first</p>
          <p style={{ opacity:0.4, fontSize:12, marginTop:4 }}>Ties: ♠ &gt; ♥ &gt; ♦ &gt; ♣</p>
        </div>

        <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', maxWidth:860 }}>
          {(gameState.pickingCards || []).map(card => {
            const pickedEntry = Object.entries(gameState.playerPicks || {}).find(([,c]) => c?.id === card.id);
            const isTaken  = !!pickedEntry;
            const pickedBy = pickedEntry ? gameState.players.find(p => p.id === pickedEntry[0]) : null;
            const isMyPick = myPick?.id === card.id;
            return (
              <div key={card.id} style={{ textAlign:'center' }}>
                <div onClick={() => !myPick && !isTaken && socket.emit('pickCard', { cardId: card.id }, () => {})}
                  style={{ cursor: !myPick && !isTaken ? 'pointer' : 'default',
                    opacity: isTaken && !isMyPick ? 0.4 : 1,
                    transform: isMyPick ? 'translateY(-14px)' : 'none',
                    transition:'all 0.3s' }}
                  onMouseEnter={e => { if(!myPick && !isTaken) e.currentTarget.style.transform='translateY(-8px)'; }}
                  onMouseLeave={e => { if(!isMyPick) e.currentTarget.style.transform='none'; }}>
                  <Card card={revealed ? card : { hidden:true }} />
                </div>
                {pickedBy && (
                  <p style={{ fontSize:11, marginTop:4, fontWeight:700,
                    color: isMyPick ? '#f4a522' : 'rgba(255,255,255,0.6)' }}>
                    {isMyPick ? '⭐ ' : ''}{pickedBy.name}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {!myPick && !revealed && <p style={{ opacity:0.6, fontStyle:'italic' }}>👆 Click any card to flip it</p>}
        {myPick && !revealed && (
          <div style={{ background:'rgba(244,165,34,0.15)', border:'1px solid rgba(244,165,34,0.4)',
            borderRadius:12, padding:'10px 24px' }}>
            <p style={{ color:'#f4a522', fontWeight:700 }}>✅ Picked! Waiting for others...</p>
          </div>
        )}

        {revealed && winner && (
          <div style={{ textAlign:'center', background:'rgba(244,165,34,0.15)',
            border:'2px solid #f4a522', padding:24, borderRadius:20, maxWidth:380, width:'100%' }}>
            <div style={{ fontSize:36, marginBottom:8 }}>🎴</div>
            <h3 style={{ fontFamily:"'Fredoka One',cursive", fontSize:26, color:'#f4a522', marginBottom:6 }}>
              {winner.name} is the dealer!
            </h3>
            <p style={{ opacity:0.8 }}>▶ <strong>{gameState.players[gameState.startingPlayerIndex]?.name}</strong> goes first</p>
            <p style={{ opacity:0.4, fontSize:13, marginTop:6 }}>Starting in 3 seconds...</p>
          </div>
        )}

        {revealed && (
          <div style={{ display:'flex', gap:20, flexWrap:'wrap', justifyContent:'center' }}>
            {gameState.players.map(p => {
              const pick = gameState.playerPicks?.[p.id];
              if (!pick) return null;
              return (
                <div key={p.id} style={{ textAlign:'center' }}>
                  <p style={{ fontSize:13, marginBottom:8, fontWeight:700,
                    color: p.id === gameState.pickingWinnerId ? '#f4a522' : 'rgba(255,255,255,0.7)' }}>
                    {p.id === gameState.pickingWinnerId ? '👑 ' : ''}{p.name}
                  </p>
                  <Card card={pick} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── ROUND END ─────────────────────────────────────────────────────────────
  if (gameState.status === 'roundEnd' || gameState.status === 'gameOver') {
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
          <div style={{ fontSize:64, marginBottom:8 }}>{isGameOver ? '🏆' : '🎉'}</div>
          <h1 style={{ fontFamily:"'Fredoka One',cursive", fontSize:42, marginBottom:4 }}>
            {isGameOver ? 'Game Over!' : 'Round Over!'}
          </h1>
          {winner && <p style={{ fontSize:20, fontWeight:700, opacity:0.9 }}>🎴 {winner.name} wins!</p>}
        </motion.div>

        <div style={{ background:'rgba(0,0,0,0.35)', borderRadius:20, padding:24,
          width:'100%', maxWidth:480, border:'1px solid rgba(255,255,255,0.1)' }}>
          <h3 style={{ fontFamily:"'Fredoka One',cursive", fontSize:22, marginBottom:16, textAlign:'center' }}>
            📊 Scoreboard
          </h3>
          {[...gameState.players]
            .sort((a, b) => a.totalScore - b.totalScore)
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
              <span style={{ fontFamily:"'Fredoka One',cursive", fontSize:22,
                color: rank === 0 ? '#f4a522' : '#fff' }}>
                {p.totalScore} pts
              </span>
            </motion.div>
          ))}
        </div>

        {!isGameOver && (
          <motion.button className="btn-primary"
            initial={{ opacity:0, y:20 }}
            animate={{ opacity:1, y:0 }}
            transition={{ delay:0.6, duration:0.4, ease:'backOut' }}
            whileHover={{ scale:1.05 }}
            whileTap={{ scale:0.95 }}
            style={{ fontSize:18, padding:'14px 36px' }}
            onClick={() => emit('startNextRound')}>
            Next Round →
          </motion.button>
        )}
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
              🛑 {gameState.players.find(p => p.id === gameState.stopCalledBy)?.name} called STOP!
            </div>
            <div style={{ fontSize:12, opacity:0.85, marginTop:2 }}>
              {gameState.stopCalledBy === roomInfo.playerId
                ? 'Play all your cards to win! Use the normal game controls.'
                : `Game frozen — waiting for ${gameState.players.find(p => p.id === gameState.stopCalledBy)?.name}`
              }
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{
              fontFamily:"'Fredoka One',cursive",
              fontSize:28,
              color: stopCountdown <= 10 ? '#ffff80' : '#fff',
            }}>
              {stopCountdown}s
            </div>
            {gameState.stopCalledBy === roomInfo.playerId && (
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => emit('resetStop')} style={{
                  background:'rgba(255,255,255,0.15)', color:'#fff',
                  border:'1px solid rgba(255,255,255,0.4)',
                  borderRadius:20, padding:'6px 14px',
                  cursor:'pointer', fontSize:12, fontWeight:700,
                }}>
                  🔄 Reset
                </button>
                <button onClick={declareFalseStop} style={{
                  background:'rgba(0,0,0,0.25)', color:'#fff',
                  border:'1px solid rgba(255,255,255,0.4)',
                  borderRadius:20, padding:'6px 14px',
                  cursor:'pointer', fontSize:12, fontWeight:700,
                }}>
                  😤 Give up
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── HEADER ── */}
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        background:'rgba(13,59,34,0.97)', backdropFilter:'blur(8px)',
        padding:'10px 20px', borderBottom:'1px solid rgba(255,255,255,0.07)',
        flexShrink:0, zIndex:10,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:22 }}>🃏</span>
          <span style={{ fontFamily:"'Fredoka One',cursive", fontSize:20, letterSpacing:1 }}>
            Round {gameState.round}
          </span>
        </div>

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
          {isMyTurn ? '⭐ Your turn!' : `${currentPlayer?.name}'s turn`}
        </motion.div>

        <div style={{ fontSize:12, opacity:0.45,
          background:'rgba(255,255,255,0.08)', padding:'4px 12px', borderRadius:20 }}>
          {phase}
        </div>
      </div>

      {/* ── OPPONENTS ── */}
      <div style={{
        display:'flex', gap:8, padding:'10px 16px',
        justifyContent:'center', flexWrap:'wrap',
        background:'rgba(13,59,34,0.97)', flexShrink:0,
      }}>
        {others.map(p => {
          const isActive = currentPlayer?.id === p.id;

          return (
            <div key={p.id} style={{
              background: isActive ? 'rgba(244,165,34,0.12)' : 'rgba(0,0,0,0.28)',
              border: `2px solid ${isActive ? '#f4a522' : 'rgba(255,255,255,0.08)'}`,
              borderRadius:14, padding:'8px 12px',
              flex:1, minWidth:130, maxWidth:200,
              transition:'all 0.3s',
              boxShadow: isActive ? '0 0 20px rgba(244,165,34,0.2)' : 'none',
              position:'relative',
            }}>
              {piouActive && (
                <motion.div
                  initial={{ scale:0, y:10 }}
                  animate={{ scale:1, y:0 }}
                  exit={{ scale:0 }}
                  style={{
                    position:'absolute', top:-36, left:'50%',
                    transform:'translateX(-50%)',
                    background:'#fff', color:'#e63946',
                    fontWeight:900, fontSize:13,
                    padding:'4px 10px', borderRadius:20,
                    whiteSpace:'nowrap', zIndex:50,
                    boxShadow:'0 2px 8px rgba(0,0,0,0.3)',
                  }}>
                  😤 PIOU!!!
                  <div style={{
                    position:'absolute', bottom:-6, left:'50%',
                    transform:'translateX(-50%)',
                    width:0, height:0,
                    borderLeft:'6px solid transparent',
                    borderRight:'6px solid transparent',
                    borderTop:'6px solid #fff',
                  }} />
                </motion.div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <Avatar id={p.avatarId || 'sporty'} size={32} />
                  <span style={{ fontWeight:800, fontSize:12,
                    color: !p.isBot ? '#fff' :
                      p.difficulty === 'easy' ? '#4caf50' :
                      p.difficulty === 'medium' ? '#f4a522' : '#e63946'
                  }}>
                    {p.name}{p.eliminated?' ❌':''}{p.hasExploded&&!p.eliminated?' 💥':''}
                  </span>
                </div>
                <span style={{ background:'rgba(244,165,34,0.25)', color:'#f4a522',
                  fontWeight:800, fontSize:11, padding:'2px 7px', borderRadius:20 }}>
                  {p.totalScore} pts
                </span>
              </div>
              {(() => {
                const count = (p.hand || []).length;
                const maxW  = 130;
                const offset = count <= 1 ? 0 : Math.min(12, (maxW - 48) / (count - 1));
                const totalW = count > 0 ? 48 + (count - 1) * offset : 48;
                return (
                  <div style={{ position:'relative', height:52, width:totalW, marginTop:4 }}>
                    {(p.hand || []).map((c, i) => (
                      <motion.div key={c.id ?? i}
                      initial={{ opacity:0, x:-10 }}
                      animate={{ opacity:1, x:0 }}
                      transition={{ duration:0.25, delay: i * 0.04 }}
                      style={{ position:'absolute', left: i * offset, top:0, zIndex:i }}>
                        <Card card={c} small />
                      </motion.div>
                    ))}
                    <div style={{
                      position:'absolute', top:-6, right:-10, zIndex:50,
                      background:'#f4a522', color:'#1a1a1a',
                      borderRadius:'50%', width:20, height:20,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:10, fontWeight:900,
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
                    fontSize:11, fontWeight:900, color:'#ff8080', marginTop:3,
                    background:'rgba(230,57,70,0.15)', padding:'2px 8px',
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

        {/* Melds — horizontal scroll */}
        {gameState.melds.length > 0 && (
          <div style={{
            display:'flex', flexWrap:'wrap', gap:8, padding:'10px 16px',
            flexShrink:0,
            borderBottom:'1px solid rgba(255,255,255,0.06)',
          }}>
            {gameState.melds.map(meld => (
              <div key={meld.id} style={{
                background:'rgba(0,0,0,0.22)', borderRadius:10,
                padding:'8px 10px', flexShrink:0,
                border:'1px solid rgba(255,255,255,0.08)',
              }}>
                <p style={{ fontSize:10, opacity:0.45, marginBottom:5, whiteSpace:'nowrap' }}>
                  {meld.type} · {gameState.players.find(p=>p.id===meld.ownerId)?.name}
                </p>
                <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                  {sortMeldCards(meld.cards, meld.type).map(c => (
                    <motion.div key={c.id}
                     initial={{ opacity:0, scale:0.5, y:-20 }}
                     animate={{ opacity:1, scale:1, y:0 }}
                     transition={{ duration:0.3, ease:'backOut' }}
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
            ))}
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
              <div style={{
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
              <div style={{
                cursor: (!isMyTurn && phase==='draw' && !me?.stopBanned && !gameState.stopCalledBy) ? 'pointer' : (isMyTurn&&phase==='draw' ? 'pointer' : 'default'),
                transform:'scale(1.3)', transformOrigin:'bottom center',
                transition:'all 0.2s',
                filter: (!isMyTurn && phase==='draw' && !me?.stopBanned && topDiscard && !gameState.stopCalledBy)
                  ? 'drop-shadow(0 0 8px rgba(230,57,70,0.9))'
                  : 'none',
              }}
              onMouseEnter={e => { if(isMyTurn&&phase==='draw') e.currentTarget.style.transform='scale(1.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform='scale(1.15)'; }}
              onClick={() => {
                // Not my turn + draw phase = STOP window → tap discard to STOP
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
                <div style={{ display:'flex', gap:10 }}>
                  <button className="btn-success" onClick={() => emit('firstKeepOrDiscard', { keep:true })}>✅ Keep</button>
                  <button className="btn-danger" onClick={() => emit('firstKeepOrDiscard', { keep:false })}>🗑 Discard & redraw</button>
                </div>
              )}
              {phase==='play' && <>
                {selectedCards.length === 0 && (
                  <p style={{ opacity:0.5, fontStyle:'italic', fontSize:13 }}>
                    Select cards to play a meld · Click discard pile to discard
                  </p>
                )}
                {selectedCards.length === 1 && !me?.hand?.find(c => c.id===selectedCards[0])?.isJoker && (
                  <p style={{ opacity:0.6, fontSize:13 }}>👆 Click the discard pile to discard</p>
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
                    ▶ Play {selectedCards.length} cards as meld
                  </div>
                )}
              </>}
            </>}
          </div>
        </div>
      </div>

      {/* ── HAND ── */}
      <div style={{
        background:'rgba(13,59,34,0.97)', borderTop:'2px solid rgba(255,255,255,0.07)',
        padding:'12px 16px 12px 16px', paddingTop:28, flexShrink:0,
        overflow:'visible',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontWeight:800, fontSize:14 }}>
              Your hand ({me?.hand?.length ?? 0})
            </span>
            {(me?.stopBanned || me?.discardBanned) && (
              <motion.span
                initial={{ scale:0, rotate:-10 }}
                animate={{ scale:1, rotate:0 }}
                transition={{ type:'spring', bounce:0.6 }}
                style={{ background:'rgba(230,57,70,0.85)', color:'#fff',
                  fontSize:12, fontWeight:900, padding:'4px 12px', borderRadius:20,
                  boxShadow:'0 2px 10px rgba(230,57,70,0.5)' }}>
                😤 PIOU!!! STOP and discard banned this round!
              </motion.span>
            )}
          </div>
          <span style={{ fontSize:12, color:'#f4a522', fontWeight:700 }}>
            {me?.totalScore ?? 0} pts
          </span>
        </div>
        <div style={{ overflowX:'auto', paddingBottom:4 }}>
          <div style={{ display:'flex', gap:8, paddingTop:20 }}>
          {handOrder
            .map(id => me?.hand?.find(c => c.id===id))
            .filter(Boolean)
            .map(card => (
              <motion.div key={card.id} draggable
                data-cardid={card.id}
                onDragStart={() => setDraggedId(card.id)}
                onDragOver={e => onDragOver(e, card.id)}
                onDragEnd={() => setDraggedId(null)}
                onTouchStart={e => {
                  touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                  isDraggingRef.current = false;
                  setDraggedId(card.id);
                }}
                onTouchMove={e => {
                  if (!touchStartRef.current) return;
                  const touch = e.touches[0];
                  const dx = Math.abs(touch.clientX - touchStartRef.current.x);
                  const dy = Math.abs(touch.clientY - touchStartRef.current.y);
                  if (dx > 10 || dy > 10) {
                    isDraggingRef.current = true;
                    e.preventDefault();
                    const draggedEl = e.currentTarget;
                    draggedEl.style.visibility = 'hidden';
                    const target = document.elementFromPoint(touch.clientX, touch.clientY);
                    draggedEl.style.visibility = '';
                    const targetId = target?.closest('[data-cardid]')?.dataset.cardid;
                    if (targetId && targetId !== card.id) {
                      onDragOver({ preventDefault:()=>{} }, targetId);
                    }
                  }
                }}
                onTouchEnd={e => {
                  if (!isDraggingRef.current) {
                    e.preventDefault();
                    toggleCard(card.id);
                  }
                  setDraggedId(null);
                  isDraggingRef.current = false;
                  touchStartRef.current = null;
                }}
                initial={{ opacity:0, y:60, rotate: -5 }}
                animate={{ opacity:1, y:0, rotate:0 }}
                transition={{ duration:0.35, ease:'backOut' }}
                style={{ opacity: draggedId===card.id ? 0.4 : 1, cursor:'grab' }}>
                <div style={{
                  borderRadius:10,
                  boxShadow: newCardId === card.id ? '0 0 18px 4px rgba(46,134,193,0.85)' : 'none',
                  transform: newCardId === card.id ? 'translateY(-14px)' : 'none',
                  transition:'all 0.3s',
                }}>
                  <Card card={card}
                  selected={selectedCards.includes(card.id)}
                  onClick={'ontouchstart' in window ? undefined : () => toggleCard(card.id)} />
                </div>
              </motion.div>
            ))
          }
        </div>
      </div>
      </div>

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