import { AvatarPicker, AVATAR_LIST } from './Avatar';
import { useState, useEffect } from 'react';
import socket from '../socket';

export default function Lobby({ onGameStart }) {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [currentRoom, setCurrentRoom] = useState(null);
  // currentRoom: { code, playerId, players[], isHost }
  const [error, setError] = useState('');
  const [debugMode, setDebugMode] = useState(false);
  const [avatarId, setAvatarId] = useState('sporty');

  function createRoom() {
    if (!playerName.trim()) return setError('Enter your name first');
    socket.emit('createRoom', { playerName, avatarId }, (res) => {
      if (res.error) return setError(res.error);
      setCurrentRoom({ code: res.code, playerId: res.playerId, players: [{ id: res.playerId, name: playerName }], isHost: true });
      setError('');
    });
  }

  function joinRoom() {
    if (!playerName.trim()) return setError('Enter your name first');
    if (!roomCode.trim()) return setError('Enter a room code');
    socket.emit('joinRoom', { code: roomCode.toUpperCase(), playerName, avatarId }, (res) => {
      if (res.error) return setError(res.error);
      setCurrentRoom({ 
        code: roomCode.toUpperCase(), 
        playerId: res.playerId, 
        players: res.players || [],  // ← use players from server response
        isHost: false 
      });
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

  useEffect(() => {
    socket.on('playerList', (players) => {
      setCurrentRoom(prev => prev ? { ...prev, players } : prev);
    });

    socket.on('gameStarted', () => {
      setTimeout(() => {
        setCurrentRoom(prev => {
          if (prev) {
            onGameStart({ code: prev.code, playerId: prev.playerId, playerName });
          }
          return prev;
        });
      }, 0);
    });

    return () => {
      socket.off('playerList');
      socket.off('gameStarted');
    };
  }, []);

  if (!currentRoom) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24 }}>
      <h1 style={{ fontSize: 36, marginBottom: 8 }}>🃏 Card Game</h1>
      <div style={{ background: 'rgba(0,0,0,0.3)', padding: 32, borderRadius: 16, width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AvatarPicker selected={avatarId} onSelect={setAvatarId} />
        <input placeholder="Your name" value={playerName} onChange={e => setPlayerName(e.target.value)} />
        <button className="btn-primary" onClick={createRoom}>Create Room</button>
        <hr style={{ borderColor: 'rgba(255,255,255,0.2)' }} />
        <input placeholder="Room code" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} />
        <button className="btn-secondary" onClick={joinRoom}>Join Room</button>
        {error && <p style={{ color: '#ff8080' }}>{error}</p>}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24 }}>
      <h1 style={{ fontSize: 28 }}>🃏 Room: <strong>{currentRoom.code}</strong></h1>
      <p style={{ opacity: 0.7 }}>Share this code with your family!</p>

      <div style={{ background: 'rgba(0,0,0,0.3)', padding: 32, borderRadius: 16, width: 380, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2>Players ({currentRoom.players.length}/8)</h2>
        {currentRoom.players.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{p.isBot ? '🤖' : '👤'}</span>
            <span>{p.name}</span>
            {p.id === currentRoom.playerId && <span style={{ opacity: 0.6, fontSize: 13 }}>(you)</span>}
          </div>
        ))}

        {currentRoom.isHost && (
          <>
            <hr style={{ borderColor: 'rgba(255,255,255,0.2)' }} />
            <p style={{ fontSize: 14, opacity: 0.8 }}>Add AI players:</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" style={{ flex: 1, padding: '8px 4px', fontSize: 13 }} onClick={() => addBot('easy')}>🟢 Easy Bot</button>
              <button className="btn-secondary" style={{ flex: 1, padding: '8px 4px', fontSize: 13 }} onClick={() => addBot('medium')}>🟡 Medium Bot</button>
              <button className="btn-secondary" style={{ flex: 1, padding: '8px 4px', fontSize: 13 }} onClick={() => addBot('hard')}>🔴 Hard Bot</button>
            </div>

            <button className="btn-success" onClick={startGame} disabled={currentRoom.players.length < 2}>
              Start Game
            </button>
          </>
        )}

        {!currentRoom.isHost && (
          <p style={{ textAlign: 'center', opacity: 0.7 }}>Waiting for host to start the game...</p>
        )}

        {error && <p style={{ color: '#ff8080' }}>{error}</p>}
      </div>
    </div>
  );
}