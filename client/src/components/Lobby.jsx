import { useState, useEffect, useRef } from 'react';
import socket from '../socket';
import { Avatar, AvatarPicker, AVATAR_LIST } from './Avatar';
import { motion, AnimatePresence } from 'framer-motion';

const CHAT_MESSAGES = [
  { emoji: '👋', text: 'Hello!' },
  { emoji: '😄', text: "Let's go!" },
  { emoji: '🤔', text: 'Hurry up!' },
  { emoji: '😂', text: "I'll win this!" },
  { emoji: '🎴', text: 'Good luck!' },
  { emoji: '😡', text: 'No mercy!' },
];

export default function Lobby({ onGameStart }) {
  const [screen, setScreen]           = useState('landing');
  const [playerName, setPlayerName]   = useState('');
  const [avatarId, setAvatarId]       = useState('sporty');
  const [showPicker, setShowPicker]   = useState(false);
  const [roomCode, setRoomCode]       = useState('');
  const [currentRoom, setCurrentRoom] = useState(null);
  const [error, setError]             = useState('');
  const [rooms, setRooms]             = useState([]);
  const [roomFilter, setRoomFilter]   = useState('open');
  const [gameName, setGameName]       = useState('');
  const [maxPlayers, setMaxPlayers]   = useState(8);
  const [isPrivate, setIsPrivate]     = useState(false);
  const [chatBubbles, setChatBubbles] = useState([]);
  const refreshRef = useRef(null);

  // Auto-refresh room list
  useEffect(() => {
    if (screen !== 'join') return;
    const fetch = () => socket.emit('getRooms', setRooms);
    fetch();
    refreshRef.current = setInterval(fetch, 3000);
    return () => clearInterval(refreshRef.current);
  }, [screen]);

  useEffect(() => {
    socket.on('playerList', (players) => {
      setCurrentRoom(prev => prev ? { ...prev, players } : prev);
    });
    socket.on('gameStarted', () => {
      setTimeout(() => {
        setCurrentRoom(prev => {
          if (prev) onGameStart({ code: prev.code, playerId: prev.playerId, playerName });
          return prev;
        });
      }, 0);
    });
    socket.on('lobbyMessage', (msg) => {
      const id = Date.now();
      setChatBubbles(prev => [...prev, { ...msg, id }]);
      setTimeout(() => setChatBubbles(prev => prev.filter(b => b.id !== id)), 3000);
    });
    return () => {
      socket.off('playerList');
      socket.off('gameStarted');
      socket.off('lobbyMessage');
    };
  }, []);

  function createRoom() {
    if (!playerName.trim()) return setError('Enter your name first');
    socket.emit('createRoom', { playerName, avatarId, gameName: gameName || `${playerName}'s Game`, maxPlayers, isPrivate }, (res) => {
      if (res.error) return setError(res.error);
      setCurrentRoom({ code: res.code, playerId: res.playerId, players: [{ id: res.playerId, name: playerName, avatarId, isReady: true }], isHost: true });
      setScreen('waiting');
      setError('');
    });
  }

  function joinRoom(code) {
    const c = (code || roomCode).toUpperCase().trim();
    if (!playerName.trim()) return setError('Enter your name first');
    if (!c) return setError('Enter a room code');
    socket.emit('joinRoom', { code: c, playerName, avatarId }, (res) => {
      if (res.error) return setError(res.error);
      setCurrentRoom({ code: c, playerId: res.playerId, players: res.players || [], isHost: false });
      setScreen('waiting');
      setError('');
    });
  }

  function addBot(difficulty) {
    socket.emit('addBot', { difficulty }, (res) => {
      if (res.error) setError(res.error);
    });
  }

  function startGame() {
    socket.emit('startGame', (res) => {
      if (res.error) return setError(res.error);
      onGameStart({ code: currentRoom.code, playerId: currentRoom.playerId, playerName });
    });
  }

  function toggleReady() {
    socket.emit('toggleReady', {}, () => {});
  }

  function sendChat(msg) {
    socket.emit('sendLobbyMessage', { message: msg }, () => {});
  }

  const filteredRooms = rooms.filter(r => {
    if (roomFilter === 'open') return r.playerCount < r.maxPlayers;
    if (roomFilter === 'full') return r.playerCount >= r.maxPlayers;
    return true;
  });

  const canStart = currentRoom?.players?.filter(p => !p.isBot).every(p => p.isReady) && currentRoom?.players?.length >= 2;

  // ── LANDING ──────────────────────────────────────────────────
  if (screen === 'landing') return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', gap:20, padding:24,
      background:'radial-gradient(ellipse at 50% 30%, #1e6b42 0%, #0d3b22 100%)',
    }}>
      <motion.h1
        initial={{ y:-30, opacity:0 }}
        animate={{ y:0, opacity:1 }}
        style={{ fontFamily:"'Fredoka One',cursive", fontSize:42, color:'#f4a522',
          textShadow:'0 4px 20px rgba(244,165,34,0.4)', marginBottom:0 }}>
        Pontinho
      </motion.h1>
      <motion.p
        initial={{ opacity:0 }}
        animate={{ opacity:0.6 }}
        transition={{ delay:0.2 }}
        style={{ fontSize:14, marginTop:-12 }}>
        with Family
      </motion.p>

      {/* Avatar */}
      <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ delay:0.1, type:'spring' }}>
        <div onClick={() => setShowPicker(!showPicker)} style={{ cursor:'pointer', position:'relative' }}>
          <Avatar id={avatarId} size={90} />
          <div style={{
            position:'absolute', bottom:0, right:0,
            background:'#f4a522', borderRadius:'50%',
            width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:14, boxShadow:'0 2px 8px rgba(0,0,0,0.3)',
          }}>✏️</div>
        </div>
      </motion.div>

      {/* Avatar Picker */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity:0, height:0 }}
            animate={{ opacity:1, height:'auto' }}
            exit={{ opacity:0, height:0 }}
            style={{ overflow:'hidden', width:'100%', maxWidth:440 }}>
            <AvatarPicker selected={avatarId} onSelect={(id) => { setAvatarId(id); setShowPicker(false); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Name input */}
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.2 }}
        style={{ width:'100%', maxWidth:340 }}>
        <input
          placeholder="Your name"
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setScreen('create')}
          style={{
            width:'100%', padding:'14px 20px', borderRadius:50,
            border:'2px solid rgba(255,255,255,0.2)',
            background:'rgba(255,255,255,0.1)', color:'#fff',
            fontSize:16, textAlign:'center', outline:'none',
            boxSizing:'border-box',
          }}
        />
      </motion.div>

      {error && <p style={{ color:'#ff8080', fontSize:13 }}>{error}</p>}

      {/* Buttons */}
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.3 }}
        style={{ display:'flex', flexDirection:'column', gap:12, width:'100%', maxWidth:340 }}>
        <button onClick={() => {
          if (!playerName.trim()) return setError('Enter your name first');
          setError('');
          setScreen('create');
        }} style={{
          padding:'16px', borderRadius:50, border:'none', cursor:'pointer',
          background:'linear-gradient(135deg, #f9c55a, #f4a522)',
          color:'#3a1f00', fontFamily:"'Fredoka One',cursive",
          fontSize:20, fontWeight:700, letterSpacing:1,
          boxShadow:'0 6px 20px rgba(244,165,34,0.4)',
        }}>
          🎮 Create Game
        </button>
        <button onClick={() => {
          if (!playerName.trim()) return setError('Enter your name first');
          setError('');
          setScreen('join');
        }} style={{
          padding:'16px', borderRadius:50, border:'2px solid rgba(255,255,255,0.3)',
          cursor:'pointer', background:'rgba(255,255,255,0.1)',
          color:'#fff', fontFamily:"'Fredoka One',cursive",
          fontSize:20, letterSpacing:1,
        }}>
          🔗 Join Game
        </button>
      </motion.div>
    </div>
  );

  // ── CREATE GAME ───────────────────────────────────────────────
  if (screen === 'create') return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', gap:20, padding:24,
      background:'radial-gradient(ellipse at 50% 30%, #1e6b42 0%, #0d3b22 100%)',
    }}>
      <motion.h2 initial={{ y:-20, opacity:0 }} animate={{ y:0, opacity:1 }}
        style={{ fontFamily:"'Fredoka One',cursive", fontSize:32, color:'#f4a522' }}>
        🎮 Create Game
      </motion.h2>

      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
        style={{ background:'rgba(0,0,0,0.3)', borderRadius:20, padding:28,
          width:'100%', maxWidth:400, display:'flex', flexDirection:'column', gap:16,
          border:'1px solid rgba(255,255,255,0.1)' }}>

        {/* Game name */}
        <div>
          <p style={{ fontSize:12, opacity:0.6, marginBottom:6 }}>GAME NAME</p>
          <input
            placeholder={`${playerName}'s Game`}
            value={gameName}
            onChange={e => setGameName(e.target.value)}
            style={{
              width:'100%', padding:'12px 16px', borderRadius:12,
              border:'1px solid rgba(255,255,255,0.2)',
              background:'rgba(255,255,255,0.08)', color:'#fff',
              fontSize:15, outline:'none', boxSizing:'border-box',
            }}
          />
        </div>

        {/* Max players */}
        <div>
          <p style={{ fontSize:12, opacity:0.6, marginBottom:8 }}>MAX PLAYERS</p>
          <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
            {[2,3,4,5,6,7,8].map(n => (
              <div key={n} onClick={() => setMaxPlayers(n)} style={{
                width:36, height:36, borderRadius:'50%', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                background: maxPlayers === n ? '#f4a522' : 'rgba(255,255,255,0.1)',
                color: maxPlayers === n ? '#3a1f00' : '#fff',
                fontWeight:800, fontSize:14, transition:'all 0.2s',
                border: maxPlayers === n ? 'none' : '1px solid rgba(255,255,255,0.2)',
              }}>
                {n}
              </div>
            ))}
          </div>
        </div>

        {/* Public/Private toggle */}
        <div>
          <p style={{ fontSize:12, opacity:0.6, marginBottom:8 }}>VISIBILITY</p>
          <div style={{ display:'flex', gap:8 }}>
            {[
              { value: false, label: '🌍 Public', desc: 'Anyone can join' },
              { value: true,  label: '🔒 Private', desc: 'Code only' },
            ].map(opt => (
              <div key={String(opt.value)} onClick={() => setIsPrivate(opt.value)} style={{
                flex:1, padding:'10px', borderRadius:12, cursor:'pointer', textAlign:'center',
                background: isPrivate === opt.value ? 'rgba(244,165,34,0.2)' : 'rgba(255,255,255,0.05)',
                border: `2px solid ${isPrivate === opt.value ? '#f4a522' : 'rgba(255,255,255,0.1)'}`,
                transition:'all 0.2s',
              }}>
                <div style={{ fontWeight:700, fontSize:14 }}>{opt.label}</div>
                <div style={{ fontSize:11, opacity:0.6, marginTop:2 }}>{opt.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {error && <p style={{ color:'#ff8080', fontSize:13 }}>{error}</p>}

        <button onClick={createRoom} style={{
          padding:'14px', borderRadius:50, border:'none', cursor:'pointer',
          background:'linear-gradient(135deg, #f9c55a, #f4a522)',
          color:'#3a1f00', fontFamily:"'Fredoka One',cursive",
          fontSize:18, fontWeight:700,
          boxShadow:'0 4px 16px rgba(244,165,34,0.4)',
        }}>
          🚀 Create Room
        </button>

        <button onClick={() => { setError(''); setScreen('landing'); }} style={{
          padding:'10px', borderRadius:50, border:'1px solid rgba(255,255,255,0.2)',
          cursor:'pointer', background:'transparent', color:'rgba(255,255,255,0.6)', fontSize:14,
        }}>
          ← Back
        </button>
      </motion.div>
    </div>
  );

  // ── JOIN GAME ─────────────────────────────────────────────────
  if (screen === 'join') return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', gap:20, padding:24,
      background:'radial-gradient(ellipse at 50% 30%, #1e6b42 0%, #0d3b22 100%)',
    }}>
      <motion.h2 initial={{ y:-20, opacity:0 }} animate={{ y:0, opacity:1 }}
        style={{ fontFamily:"'Fredoka One',cursive", fontSize:32, color:'#f4a522' }}>
        🔗 Join Game
      </motion.h2>

      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
        style={{ width:'100%', maxWidth:440, display:'flex', flexDirection:'column', gap:16 }}>

        {/* Private code entry */}
        <div style={{ background:'rgba(0,0,0,0.3)', borderRadius:20, padding:20,
          border:'1px solid rgba(255,255,255,0.1)' }}>
          <p style={{ fontSize:12, opacity:0.6, marginBottom:8 }}>🔒 HAVE A PRIVATE CODE?</p>
          <div style={{ display:'flex', gap:8 }}>
            <input
              placeholder="Enter code..."
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && joinRoom()}
              style={{
                flex:1, padding:'10px 14px', borderRadius:12,
                border:'1px solid rgba(255,255,255,0.2)',
                background:'rgba(255,255,255,0.08)', color:'#fff',
                fontSize:15, outline:'none', letterSpacing:3, textAlign:'center',
              }}
            />
            <button onClick={() => joinRoom()} style={{
              padding:'10px 20px', borderRadius:12, border:'none', cursor:'pointer',
              background:'#f4a522', color:'#3a1f00', fontWeight:800, fontSize:14,
            }}>
              Join
            </button>
          </div>
        </div>

        {/* Filter */}
        <div style={{ display:'flex', gap:8 }}>
          {['all','open','full'].map(f => (
            <button key={f} onClick={() => setRoomFilter(f)} style={{
              flex:1, padding:'8px', borderRadius:20, border:'none', cursor:'pointer',
              background: roomFilter === f ? '#f4a522' : 'rgba(255,255,255,0.1)',
              color: roomFilter === f ? '#3a1f00' : '#fff',
              fontWeight:700, fontSize:13, textTransform:'capitalize', transition:'all 0.2s',
            }}>
              {f === 'all' ? '🌍 All' : f === 'open' ? '✅ Open' : '🔴 Full'}
            </button>
          ))}
        </div>

        {/* Room list */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, maxHeight:360, overflowY:'auto' }}>
          {filteredRooms.length === 0 ? (
            <div style={{ textAlign:'center', opacity:0.5, padding:40 }}>
              <div style={{ fontSize:40, marginBottom:8 }}>🎴</div>
              <p>No games available yet...</p>
              <p style={{ fontSize:13, marginTop:4 }}>Create one or wait for someone!</p>
            </div>
          ) : filteredRooms.map(room => (
            <motion.div key={room.code}
              initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }}
              style={{
                background:'rgba(0,0,0,0.3)', borderRadius:16, padding:'14px 16px',
                border:'1px solid rgba(255,255,255,0.1)',
                display:'flex', alignItems:'center', gap:12,
              }}>
              <Avatar id={room.host?.avatarId || 'sporty'} size={48} />
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:800, fontSize:15 }}>{room.gameName}</div>
                <div style={{ fontSize:12, opacity:0.6, marginTop:2 }}>
                  by {room.host?.name} · {room.playerCount}/{room.maxPlayers} players
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{
                  width:10, height:10, borderRadius:'50%',
                  background: room.playerCount < room.maxPlayers ? '#4caf50' : '#e63946',
                }} />
                <button onClick={() => joinRoom(room.code)} disabled={room.playerCount >= room.maxPlayers}
                  style={{
                    padding:'8px 16px', borderRadius:20, border:'none', cursor:'pointer',
                    background: room.playerCount < room.maxPlayers ? '#f4a522' : 'rgba(255,255,255,0.1)',
                    color: room.playerCount < room.maxPlayers ? '#3a1f00' : 'rgba(255,255,255,0.4)',
                    fontWeight:800, fontSize:13,
                  }}>
                  {room.playerCount < room.maxPlayers ? 'Join' : 'Full'}
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {error && <p style={{ color:'#ff8080', fontSize:13, textAlign:'center' }}>{error}</p>}

        <button onClick={() => { setError(''); setScreen('landing'); }} style={{
          padding:'10px', borderRadius:50, border:'1px solid rgba(255,255,255,0.2)',
          cursor:'pointer', background:'transparent', color:'rgba(255,255,255,0.6)', fontSize:14,
        }}>
          ← Back
        </button>
      </motion.div>
    </div>
  );

  // ── WAITING ROOM ──────────────────────────────────────────────
  if (screen === 'waiting' && currentRoom) {
    const me = currentRoom.players.find(p => p.id === currentRoom.playerId);
    const allReady = currentRoom.players.filter(p => !p.isBot).every(p => p.isReady);

    return (
      <div style={{
        minHeight:'100vh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', gap:20, padding:24,
        background:'radial-gradient(ellipse at 50% 30%, #1e6b42 0%, #0d3b22 100%)',
      }}>

        {/* Room code */}
        <motion.div initial={{ y:-20, opacity:0 }} animate={{ y:0, opacity:1 }}
          style={{ textAlign:'center' }}>
          <p style={{ fontSize:13, opacity:0.5, letterSpacing:2 }}>ROOM CODE</p>
          <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:52, color:'#f4a522',
            letterSpacing:8, textShadow:'0 4px 20px rgba(244,165,34,0.4)' }}>
            {currentRoom.code}
          </div>
          <button onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}?code=${currentRoom.code}`);
          }} style={{
            marginTop:8, padding:'6px 16px', borderRadius:20,
            border:'1px solid rgba(255,255,255,0.3)',
            background:'rgba(255,255,255,0.1)', color:'#fff',
            cursor:'pointer', fontSize:12,
          }}>
            📋 Copy invite link
          </button>
        </motion.div>

        {/* Players */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.1 }}
          style={{ width:'100%', maxWidth:500 }}>
          <p style={{ fontSize:12, opacity:0.5, letterSpacing:2, marginBottom:12, textAlign:'center' }}>
            PLAYERS ({currentRoom.players.length}/{currentRoom.players.find(() => true) ? (rooms.find(r => r.code === currentRoom.code)?.maxPlayers || 8) : 8})
          </p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:12, justifyContent:'center' }}>
            {currentRoom.players.map(p => (
              <motion.div key={p.id}
                initial={{ scale:0 }} animate={{ scale:1 }}
                style={{ position:'relative', display:'flex', flexDirection:'column',
                  alignItems:'center', gap:6 }}>
                {/* Chat bubble */}
                <AnimatePresence>
                  {chatBubbles.filter(b => b.playerId === p.id).map(b => (
                    <motion.div key={b.id}
                      initial={{ scale:0, y:10 }} animate={{ scale:1, y:0 }} exit={{ scale:0, opacity:0 }}
                      style={{
                        position:'absolute', top:-40, left:'50%', transform:'translateX(-50%)',
                        background:'#fff', color:'#1a1a1a', fontWeight:700, fontSize:12,
                        padding:'4px 10px', borderRadius:20, whiteSpace:'nowrap', zIndex:10,
                        boxShadow:'0 2px 8px rgba(0,0,0,0.3)',
                      }}>
                      {b.message}
                      <div style={{ position:'absolute', bottom:-5, left:'50%', transform:'translateX(-50%)',
                        width:0, height:0, borderLeft:'5px solid transparent',
                        borderRight:'5px solid transparent', borderTop:'5px solid #fff' }} />
                    </motion.div>
                  ))}
                </AnimatePresence>

                <div style={{ position:'relative' }}>
                  <Avatar id={p.avatarId || 'sporty'} size={64} />
                  {p.isReady && (
                    <div style={{ position:'absolute', bottom:0, right:0,
                      background:'#4caf50', borderRadius:'50%', width:20, height:20,
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>
                      ✓
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ fontSize:12, fontWeight:700,
                    color: p.id === currentRoom.playerId ? '#f4a522' : '#fff' }}>
                    {p.name}{p.isBot ? ` 🤖` : ''}
                    {p.id === currentRoom.playerId ? ' (you)' : ''}
                  </span>
                  {p.isBot && currentRoom.isHost && (
                    <button onClick={() => socket.emit('removeBot', { botId: p.id }, () => {})}
                      style={{
                        background:'rgba(230,57,70,0.3)', border:'none', borderRadius:'50%',
                        width:18, height:18, cursor:'pointer', color:'#ff8080',
                        fontSize:10, display:'flex', alignItems:'center', justifyContent:'center',
                        padding:0,
                      }}>
                      ✕
                    </button>
                  )}
                </div>
                {p.isBot && (
                  <span style={{ fontSize:10, opacity:0.6,
                    color: p.difficulty === 'easy' ? '#4caf50' : p.difficulty === 'medium' ? '#f4a522' : '#e63946' }}>
                    {p.difficulty}
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Chat buttons */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.2 }}
          style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', maxWidth:400 }}>
          {CHAT_MESSAGES.map(msg => (
            <button key={msg.text} onClick={() => sendChat(`${msg.emoji} ${msg.text}`)} style={{
              padding:'8px 14px', borderRadius:20, border:'1px solid rgba(255,255,255,0.2)',
              background:'rgba(255,255,255,0.08)', color:'#fff', cursor:'pointer',
              fontSize:13, transition:'all 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.18)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.08)'}>
              {msg.emoji} {msg.text}
            </button>
          ))}
        </motion.div>

        {/* Bot buttons (host only) */}
        {currentRoom.isHost && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.3 }}
            style={{ width:'100%', maxWidth:400 }}>
            <p style={{ fontSize:12, opacity:0.5, letterSpacing:2, marginBottom:10, textAlign:'center' }}>
              ADD BOTS
            </p>
            <div style={{ display:'flex', gap:8 }}>
              {[['easy','🟢','#4caf50'],['medium','🟡','#f4a522'],['hard','🔴','#e63946']].map(([diff, emoji, color]) => (
                <button key={diff} onClick={() => addBot(diff)} style={{
                  flex:1, padding:'10px', borderRadius:12,
                  border:`1px solid ${color}44`, cursor:'pointer',
                  background:`${color}15`, color:'#fff',
                  fontWeight:700, fontSize:13, transition:'all 0.2s',
                }}>
                  {emoji} {diff.charAt(0).toUpperCase() + diff.slice(1)}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Ready / Start buttons */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.4 }}
          style={{ display:'flex', flexDirection:'column', gap:10, width:'100%', maxWidth:400 }}>
          {!currentRoom.isHost && (
            <button onClick={toggleReady} style={{
              padding:'14px', borderRadius:50, border:'none', cursor:'pointer',
              background: me?.isReady ? 'rgba(76,175,80,0.3)' : 'linear-gradient(135deg,#f9c55a,#f4a522)',
              color: me?.isReady ? '#4caf50' : '#3a1f00',
              border: me?.isReady ? '2px solid #4caf50' : 'none',
              fontFamily:"'Fredoka One',cursive", fontSize:18, fontWeight:700,
              transition:'all 0.3s',
            }}>
              {me?.isReady ? '✅ Ready!' : '👆 Tap when ready'}
            </button>
          )}
          {currentRoom.isHost && (
            <button onClick={startGame}
              disabled={currentRoom.players.length < 2}
              style={{
                padding:'14px', borderRadius:50, border:'none',
                cursor: currentRoom.players.length >= 2 ? 'pointer' : 'default',
                background: currentRoom.players.length >= 2
                  ? 'linear-gradient(135deg,#f9c55a,#f4a522)'
                  : 'rgba(255,255,255,0.1)',
                color: currentRoom.players.length >= 2 ? '#3a1f00' : 'rgba(255,255,255,0.3)',
                fontFamily:"'Fredoka One',cursive", fontSize:18, fontWeight:700,
                transition:'all 0.3s',
              }}>
              {currentRoom.players.length < 2 ? 'Waiting for players...' : '🚀 Start Game!'}
            </button>
          )}
        </motion.div>

        {error && <p style={{ color:'#ff8080', fontSize:13 }}>{error}</p>}

        <button onClick={() => {
          setCurrentRoom(null);
          setScreen('landing');
        }} style={{
          padding:'10px', borderRadius:50, border:'1px solid rgba(255,255,255,0.2)',
          cursor:'pointer', background:'transparent', color:'rgba(255,255,255,0.6)', fontSize:14,
        }}>
          ← Leave Room
        </button>
      </div>
    );
  }

  return null;
}