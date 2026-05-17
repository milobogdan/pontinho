import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import T, { RULES_CONTENT } from '../translations';
import Card from './Card';

const CARD_EXAMPLES = {
  4: [
    { rank: 'A', suit: 'spades' },
    { rank: 'A', suit: 'hearts' },
    { rank: 'A', suit: 'diamonds' },
  ],
  5: [
    { rank: '5', suit: 'hearts' },
    { isJoker: true },
    { rank: '7', suit: 'hearts' },
  ],
};

export default function GameMenu({ gameState, roomInfo, isMuted, onToggleMute, onLeave, onSaveAndLeave, lang = 'en' }) {
  const t = T[lang];
  const rules = RULES_CONTENT[lang];
  const [isOpen, setIsOpen] = useState(false);
  const [panel, setPanel] = useState(null); // 'rules' | 'scores' | 'leave'

  const explosionTier = p => p.eliminated ? 2 : p.hasExploded ? 1 : 0;
  const sortedPlayers = gameState?.players
    ? [...gameState.players].sort((a, b) => {
        const tierDiff = explosionTier(a) - explosionTier(b);
        return tierDiff !== 0 ? tierDiff : a.totalScore - b.totalScore;
      })
    : [];

  const isBotOnlyGame = gameState?.players?.every(p => p.id === roomInfo?.playerId || p.isBot);

  function close() {
    setPanel(null);
    setIsOpen(false);
  }

  return (
    <>
      {/* Hamburger button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
          padding: '6px 10px',
          cursor: 'pointer',
          color: '#fff',
          fontSize: 18,
          lineHeight: 1,
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
      >
        ☰
      </button>

      {/* Overlay — portal escapes the header's backdropFilter stacking context */}
      {createPortal(
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Dark backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.5)',
              }}
            />

            {/* Side panel */}
            <motion.div
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              style={{
                position: 'fixed', top: 0, left: 0, bottom: 0,
                width: 280, height: '100vh', zIndex: 1001,
                background: 'linear-gradient(180deg, #0f4a2a 0%, #0a2a15 100%)',
                borderRight: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', flexDirection: 'column',
                boxShadow: '4px 0 30px rgba(0,0,0,0.5)',
              }}
            >
              {/* Header */}
              <div style={{
                padding: '20px 20px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{
                  fontFamily: "'Fredoka One',cursive",
                  fontSize: 22, color: '#f4a522',
                }}>
                  {t.menu}
                </span>
                <button onClick={close} style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
                  fontSize: 20, cursor: 'pointer', padding: 4,
                }}>✕</button>
              </div>

              {/* Menu items */}
              {panel === null && (
                <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Mute toggle */}
                  <button onClick={onToggleMute} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', borderRadius: 12, border: 'none',
                    background: 'rgba(255,255,255,0.12)', color: '#fff',
                    cursor: 'pointer', fontSize: 15, fontWeight: 600,
                    textAlign: 'left', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  >
                    <span style={{ fontSize: 22 }}>{isMuted ? '🔇' : '🔊'}</span>
                    {isMuted ? t.unmuteMusic : t.muteMusic}
                    <span style={{
                      marginLeft: 'auto', fontSize: 11,
                      background: isMuted ? 'rgba(230,57,70,0.3)' : 'rgba(76,175,80,0.3)',
                      color: isMuted ? '#ff8080' : '#80ff80',
                      padding: '2px 8px', borderRadius: 20,
                    }}>
                      {isMuted ? t.off : t.on}
                    </span>
                  </button>

                  {/* Rules */}
                  <button onClick={() => setPanel('rules')} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', borderRadius: 12, border: 'none',
                    background: 'rgba(255,255,255,0.12)', color: '#fff',
                    cursor: 'pointer', fontSize: 15, fontWeight: 600,
                    textAlign: 'left', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  >
                    <span style={{ fontSize: 22 }}>📖</span>
                    {t.rulesMenu.replace('📖 ', '')}
                    <span style={{ marginLeft: 'auto', opacity: 0.4 }}>›</span>
                  </button>

                  {/* Scores */}
                  <button onClick={() => setPanel('scores')} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', borderRadius: 12, border: 'none',
                    background: 'rgba(255,255,255,0.12)', color: '#fff',
                    cursor: 'pointer', fontSize: 15, fontWeight: 600,
                    textAlign: 'left', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  >
                    <span style={{ fontSize: 22 }}>🏆</span>
                    {t.scoresMenu}
                    <span style={{ marginLeft: 'auto', opacity: 0.4 }}>›</span>
                  </button>

                  {/* Divider */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '8px 0' }} />

                  {/* Leave */}
                  <button onClick={() => setPanel('leave')} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', borderRadius: 12, border: 'none',
                    background: 'rgba(230,57,70,0.1)', color: '#ff8080',
                    cursor: 'pointer', fontSize: 15, fontWeight: 600,
                    textAlign: 'left', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(230,57,70,0.2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(230,57,70,0.1)'}
                  >
                    <span style={{ fontSize: 22 }}>🚪</span>
                    {t.leaveGame}
                  </button>
                </div>
              )}

              {/* Rules panel */}
              {panel === 'rules' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <button onClick={() => setPanel(null)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '10px 16px', background: 'none', border: 'none',
                    color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13,
                    textAlign: 'left',
                  }}>
                    ‹ Back
                  </button>
                  <h3 style={{ padding: '0 16px 12px', fontFamily: "'Fredoka One',cursive",
                    fontSize: 20, color: '#f4a522' }}>
                    {t.rulesMenu}
                  </h3>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px',
                    display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {rules.map((rule, i) => (
                      <div key={i} style={{
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: 10, padding: '10px 12px',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}>
                        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4,
                          color: '#f4a522' }}>
                          {rule.title}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.5 }}>
                          {rule.content}
                        </div>
                        {CARD_EXAMPLES[i] && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                            {CARD_EXAMPLES[i].map((card, j) => <Card key={j} card={card} tiny />)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Scores panel */}
              {panel === 'scores' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <button onClick={() => setPanel(null)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '10px 16px', background: 'none', border: 'none',
                    color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13,
                    textAlign: 'left',
                  }}>
                    ‹ Back
                  </button>
                  <h3 style={{ padding: '0 16px 12px', fontFamily: "'Fredoka One',cursive",
                    fontSize: 20, color: '#f4a522' }}>
                    {t.scoreboardMenu}
                  </h3>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px',
                    display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedPlayers.map((p, rank) => (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 12,
                        background: rank === 0 ? 'rgba(244,165,34,0.15)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${rank === 0 ? 'rgba(244,165,34,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      }}>
                        <span style={{ fontSize: 18 }}>
                          {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: 13 }}>
                            {p.name}
                            {p.id === roomInfo.playerId ? ` ${t.you}` : ''}
                            {p.isBot ? ' 🤖' : ''}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                            {p.eliminated ? t.eliminated :
                             p.hasExploded ? t.explodedOnce :
                             t.cardsInHand(p.hand?.length ?? 0)}
                          </div>
                        </div>
                        <div style={{
                          fontFamily: "'Fredoka One',cursive", fontSize: 20,
                          color: rank === 0 ? '#f4a522' : '#fff',
                        }}>
                          {p.totalScore}
                        </div>
                      </div>
                    ))}
                    <div style={{ textAlign: 'center', fontSize: 12, opacity: 0.4, marginTop: 8 }}>
                      {t.round} {gameState?.round} • {t.firstTo200}
                    </div>
                  </div>
                </div>
              )}

              {/* Leave confirmation */}
              {panel === 'leave' && (
                <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }}
                >
                  <div style={{ fontSize: 48 }}>🚪</div>
                  <h3 style={{ fontFamily: "'Fredoka One',cursive", fontSize: 22 }}>
                    {t.leaveGameQ}
                  </h3>
                  {!isBotOnlyGame && (
                    <p style={{ opacity: 0.6, fontSize: 14, lineHeight: 1.5 }}>
                      {t.replacedByBot}
                    </p>
                  )}
                  {isBotOnlyGame && onSaveAndLeave && (
                    <button onClick={onSaveAndLeave} style={{
                      width: '100%', padding: '14px', borderRadius: 50, border: 'none',
                      background: 'linear-gradient(135deg, #4caf50, #2e7d32)',
                      color: '#fff', fontFamily: "'Fredoka One',cursive",
                      fontSize: 18, cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(76,175,80,0.4)',
                    }}>
                      Save & Leave
                    </button>
                  )}
                  <button onClick={onLeave} style={{
                    width: '100%', padding: '14px', borderRadius: 50, border: 'none',
                    background: isBotOnlyGame && onSaveAndLeave
                      ? 'rgba(230,57,70,0.15)'
                      : 'linear-gradient(135deg, #e63946, #c0392b)',
                    border: isBotOnlyGame && onSaveAndLeave ? '1px solid rgba(230,57,70,0.4)' : 'none',
                    color: isBotOnlyGame && onSaveAndLeave ? '#ff8080' : '#fff',
                    fontFamily: "'Fredoka One',cursive",
                    fontSize: 18, cursor: 'pointer',
                    boxShadow: isBotOnlyGame && onSaveAndLeave ? 'none' : '0 4px 16px rgba(230,57,70,0.4)',
                  }}>
                    {isBotOnlyGame && onSaveAndLeave ? 'Leave without saving' : t.yesLeave}
                  </button>
                  <button onClick={() => setPanel(null)} style={{
                    width: '100%', padding: '12px', borderRadius: 50,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'transparent', color: 'rgba(255,255,255,0.6)',
                    fontSize: 15, cursor: 'pointer',
                  }}>
                    {t.cancel}
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      , document.body)}
    </>
  );
}
