import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// ─── Responsive parameter sets ────────────────────────────────────────────────
const PARAMS = {
  desktop: {
    rotateX:      52,
    perspective:  1200,
    perspOriginY: '25%',
    cardW: 90, cardH: 130,
    xStep: 78, arcDrop: 55, fanDeg: 3.6,
    meldW: 28, meldH: 40,
    handBottom:   '10%',
    rimHeight:    72,
    // Opponent polar ellipse (screen-space, tuned to table visual footprint)
    oppCY:  0.32,   // table visual center Y, fraction of window height
    oppRx:  0.36,   // horizontal radius, fraction of window width
    oppRy:  0.13,   // vertical radius (compressed by perspective tilt)
  },
  mobile: {
    rotateX:      8,
    perspective:  4000,
    perspOriginY: '50%',
    cardW: 52, cardH: 76,
    xStep: 36, arcDrop: 18, fanDeg: 2.5,
    meldW: 20, meldH: 28,
    handBottom:   '2%',
    rimHeight:    0,
    // Nearly flat table → opponents spread in a taller ellipse
    oppCY:  0.30,
    oppRx:  0.32,
    oppRy:  0.25,
  },
};

// ─── Mock data ────────────────────────────────────────────────────────────────
// Angles follow clock convention: 0° = 12 o'clock, clockwise.
// Player zone ≈ 150°–210°. 7 opponents fill the remaining 300° arc.
const OPPONENTS = [
  { id: 1, name: 'Lucas',   cards: 4, angle: 210 },   // 7 o'clock
  { id: 2, name: 'Mariana', cards: 7, angle: 255 },   // 8:30
  { id: 3, name: 'Felipe',  cards: 2, angle: 300 },   // 10 o'clock
  { id: 4, name: 'Ana',     cards: 9, angle: 345 },   // 11:30
  { id: 5, name: 'Pedro',   cards: 5, angle:  30 },   // 1 o'clock
  { id: 6, name: 'Julia',   cards: 3, angle:  75 },   // 2:30
  { id: 7, name: 'Rafael',  cards: 8, angle: 120 },   // 4 o'clock
];

// 15 melds: 7 Sets (amber) + 8 Runs (blue)
const MELDS = [
  { id:  1, type: 'set', cards: ['A♠','A♥','A♦'] },
  { id:  2, type: 'set', cards: ['K♠','K♥','K♦'] },
  { id:  3, type: 'set', cards: ['Q♠','Q♥','Q♦','Q♣'] },
  { id:  4, type: 'set', cards: ['J♠','J♥','J♦'] },
  { id:  5, type: 'set', cards: ['7♠','7♥','7♦'] },
  { id:  6, type: 'set', cards: ['4♠','4♥','4♦','4♣'] },
  { id:  7, type: 'set', cards: ['2♠','2♥','2♦'] },
  { id:  8, type: 'run', cards: ['A♠','2♠','3♠','4♠'] },
  { id:  9, type: 'run', cards: ['5♥','6♥','7♥'] },
  { id: 10, type: 'run', cards: ['8♦','9♦','10♦','J♦'] },
  { id: 11, type: 'run', cards: ['3♣','4♣','5♣'] },
  { id: 12, type: 'run', cards: ['J♥','Q♥','K♥'] },
  { id: 13, type: 'run', cards: ['6♠','7♠','8♠','9♠','10♠'] },
  { id: 14, type: 'run', cards: ['2♦','3♦','4♦'] },
  { id: 15, type: 'run', cards: ['9♣','10♣','J♣','Q♣'] },
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────
const CARD_COUNT = 9;
const CENTER     = (CARD_COUNT - 1) / 2;   // 4

function handTransform(i, p) {
  const offset = i - CENTER;
  const norm   = offset / CENTER;           // –1 to +1
  return {
    x:      offset * p.xStep,
    y:      Math.pow(norm, 2) * p.arcDrop,
    rotate: offset * p.fanDeg,
  };
}

// Clock-angle (0° = top, clockwise) → screen {x, y} in px
function oppScreenPos(angleDeg, p) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: window.innerWidth  * 0.5            + window.innerWidth  * p.oppRx * Math.sin(rad),
    y: window.innerHeight * p.oppCY        - window.innerHeight * p.oppRy * Math.cos(rad),
  };
}

function isRed(card) { return card.includes('♥') || card.includes('♦'); }

// Strip suit from card label to get rank only
function rank(card) { return card.replace(/[♠♥♦♣]/g, ''); }
function suit(card) { return card.slice(-1); }

// ─── Tiny card (used inside meld groups) ─────────────────────────────────────
function TinyCard({ card, w, h }) {
  const red = isRed(card);
  return (
    <div style={{
      width: w, height: h,
      borderRadius: 3,
      background: 'linear-gradient(145deg, #fdfcf6, #f0e8d0)',
      border: '1px solid rgba(180,160,120,0.55)',
      boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'flex-start', justifyContent: 'flex-start',
      padding: '1px 2px',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <span style={{
        fontSize: Math.max(6, Math.floor(w * 0.34)),
        fontWeight: 900,
        color: red ? '#c0392b' : '#1a1a2e',
        lineHeight: 1,
        letterSpacing: -0.5,
      }}>
        {rank(card)}
      </span>
      <span style={{
        fontSize: Math.max(5, Math.floor(w * 0.28)),
        color: red ? '#c0392b' : '#1a1a2e',
        lineHeight: 1,
      }}>
        {suit(card)}
      </span>
    </div>
  );
}

// ─── Meld group (a set or run, rendered as a flex row of tiny cards) ──────────
function MeldGroup({ meld, p }) {
  const isSet    = meld.type === 'set';
  const accent   = isSet ? '#f4a522' : '#4a90e2';
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      gap: 2,
      padding: 3,
      borderRadius: 5,
      background: `rgba(0,0,0,0.18)`,
      border: `1px solid ${accent}40`,
      boxShadow: `0 0 0 1px ${accent}18, 0 2px 8px rgba(0,0,0,0.5)`,
      flexShrink: 0,
    }}>
      {meld.cards.map((card, i) => (
        <TinyCard key={i} card={card} w={p.meldW} h={p.meldH} />
      ))}
    </div>
  );
}

// ─── Opponent chip (positioned in screen space, outside perspective) ──────────
const AVATAR_COLORS = ['#e63946','#4a90e2','#f4a522','#4caf50','#9b59b6','#e67e22','#1abc9c'];

function OpponentChip({ opp, x, y }) {
  const color = AVATAR_COLORS[(opp.id - 1) % AVATAR_COLORS.length];
  return (
    <div style={{
      position: 'fixed',
      left: x - 38,   // chip ~76px wide, center it
      top:  y - 22,   // chip ~44px tall, center it
      zIndex: 15,
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      background: 'rgba(8,22,12,0.88)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 22,
      padding: '5px 8px 5px 5px',
      pointerEvents: 'none',
      boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
      minWidth: 76,
    }}>
      {/* Avatar circle */}
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: `${color}30`,
        border: `2px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 900, color,
        flexShrink: 0,
      }}>
        {opp.name[0]}
      </div>

      {/* Info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' }}>
          {opp.name}
        </span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', lineHeight: 1 }}>
          {opp.cards} {opp.cards === 1 ? 'card' : 'cards'}
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SandboxStressTest() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [hovered,  setHovered]  = useState(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const p = isMobile ? PARAMS.mobile : PARAMS.desktop;
  const { cardW: W, cardH: H } = p;

  return (
    <>
      {/* Inject scrollbar-hiding rule for the meld zone */}
      <style>{`
        .meld-zone::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={{ position: 'fixed', inset: 0, background: '#020706', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>

        {/* ── Ambient glow ── */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(14,56,28,0.7) 0%, transparent 55%)',
        }} />

        {/* ── Perspective container (table only) ── */}
        <div style={{
          position: 'absolute', inset: 0,
          perspective: `${p.perspective}px`,
          perspectiveOrigin: `50% ${p.perspOriginY}`,
        }}>
          <div style={{
            position: 'absolute',
            top: 0, left: '50%',
            transformOrigin: '50% 6%',
            transform: `translateX(-50%) rotateX(${p.rotateX}deg)`,
            width: '80vw', height: '90vh',
            borderRadius: 100,
            background: 'radial-gradient(ellipse 80% 50% at 50% 22%, #22844e 0%, #135c30 38%, #0a3a1c 65%, #050f08 100%)',
            boxShadow: [
              '0 0 0 14px #5c3410',
              '0 0 0 26px #3d2208',
              '0 60px 140px rgba(0,0,0,0.95)',
              'inset 0 0 130px rgba(0,0,0,0.55)',
            ].join(', '),
            // overflow:hidden would clip the meld zone scrollbar track; not needed
          }}>

            {/*
              ── Draw / Discard piles ────────────────────────────────────────
              position:absolute keeps them out of the meld flow.
              z-index:10 ensures they always sit above any meld overflow.
            */}
            <div style={{
              position: 'absolute',
              top: '15%', left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: 20, alignItems: 'center',
              zIndex: 10,
            }}>
              {/* Draw pile */}
              <div style={{
                width: 56, height: 80, borderRadius: 8,
                background: 'linear-gradient(145deg, #1e4fa8, #142f6e)',
                border: '1px solid rgba(255,255,255,0.2)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
                <div style={{
                  width: '70%', height: '65%',
                  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
                  background: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.04),rgba(255,255,255,0.04) 2px,transparent 2px,transparent 7px)',
                }} />
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: 0.8 }}>DRAW</span>
              </div>

              <div style={{ width: 1, height: 56, background: 'rgba(255,255,255,0.06)' }} />

              {/* Discard pile */}
              <div style={{
                width: 56, height: 80, borderRadius: 8,
                background: 'linear-gradient(145deg, #fdfcf6, #ede7d6)',
                border: '1px solid rgba(0,0,0,0.1)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.65)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 28, color: '#c0392b', lineHeight: 1 }}>♥</span>
                <span style={{ fontSize: 8, color: 'rgba(0,0,0,0.35)', fontWeight: 700, letterSpacing: 0.8 }}>DISCARD</span>
              </div>
            </div>

            {/*
              ── Meld zone ──────────────────────────────────────────────────
              Starts below the piles. flex-wrap lets groups reflow naturally.
              overflow-y:auto triggers internal scroll only when 10+ melds
              overflow the container — piles and hand zones are unaffected.
              scrollbar-width:none (Firefox) + .meld-zone CSS (WebKit) hide
              the scrollbar track without disabling the scroll gesture.
            */}
            <div
              className="meld-zone"
              style={{
                position: 'absolute',
                top: '29%', left: '5%', right: '5%', bottom: '5%',
                overflowY: 'auto',
                overflowX: 'hidden',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 3%, black 90%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 3%, black 90%, transparent 100%)',
              }}
            >
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 7,
                padding: '8px 2px 20px',
                alignContent: 'flex-start',
              }}>
                {MELDS.map(meld => (
                  <MeldGroup key={meld.id} meld={meld} p={p} />
                ))}
              </div>
            </div>

          </div>{/* /table surface */}
        </div>{/* /perspective container */}

        {/*
          ── Opponent chips ──────────────────────────────────────────────────
          Rendered in screen space (outside perspective) so they are never
          distorted by the table's rotateX. Positions are computed from
          polar coords around the table's estimated screen-space footprint.
        */}
        {OPPONENTS.map(opp => {
          const pos = oppScreenPos(opp.angle, p);
          return <OpponentChip key={opp.id} opp={opp} x={pos.x} y={pos.y} />;
        })}

        {/* ── Near rim (desktop only — fills gap at screen bottom) ── */}
        {!isMobile && p.rimHeight > 0 && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            height: p.rimHeight,
            background: 'linear-gradient(180deg, #5a3010 0%, #3a1e08 55%, #1e0e02 100%)',
            boxShadow: '0 -6px 40px rgba(0,0,0,0.85), inset 0 2px 0 rgba(255,220,160,0.1)',
            zIndex: 10,
          }} />
        )}

        {/*
          ── Player hand ─────────────────────────────────────────────────────
          Zero-size anchor fixed at bottom-center. Cards are position:absolute
          from this point, offset by the quadratic arc transform.
          z-index 20 puts cards above the rim (10) and perspective elements.
        */}
        <div style={{ position: 'fixed', bottom: p.handBottom, left: '50%', zIndex: 20 }}>
          {Array.from({ length: CARD_COUNT }).map((_, i) => {
            const { x, y, rotate } = handTransform(i, p);
            const isHov = hovered === i;
            return (
              <motion.div
                key={i}
                onHoverStart={() => setHovered(i)}
                onHoverEnd={() => setHovered(null)}
                animate={{ x, y, rotate }}
                whileHover={{
                  y: y - (isMobile ? 40 : 80),
                  scale: isMobile ? 1.08 : 1.12,
                  transition: { type: 'spring', stiffness: 380, damping: 22 },
                }}
                transition={{ type: 'spring', stiffness: 240, damping: 28 }}
                style={{
                  position: 'absolute',
                  bottom: 0, left: -(W / 2),
                  width: W, height: H,
                  borderRadius: isMobile ? 7 : 10,
                  background: 'linear-gradient(160deg, #fdfcf8 0%, #f4edd8 100%)',
                  border: `2px solid ${isHov ? 'rgba(244,165,34,0.95)' : 'rgba(180,170,150,0.7)'}`,
                  boxShadow: isHov
                    ? '0 28px 60px rgba(0,0,0,0.9), 0 10px 24px rgba(0,0,0,0.65), 0 0 0 3px rgba(244,165,34,0.55)'
                    : '0 16px 36px rgba(0,0,0,0.75), 0 4px 10px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.5)',
                  cursor: 'pointer',
                  zIndex: isHov ? 200 : (CARD_COUNT - Math.abs(Math.round(i - CENTER))),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  userSelect: 'none', WebkitUserSelect: 'none',
                }}
              >
                <div style={{
                  width: '76%', height: '82%',
                  borderRadius: 5,
                  border: `1.5px solid ${isHov ? 'rgba(244,165,34,0.35)' : 'rgba(0,0,0,0.07)'}`,
                  background: 'repeating-linear-gradient(45deg,#f9f7ee,#f9f7ee 2px,#eeead8 2px,#eeead8 8px)',
                  transition: 'border-color 0.15s',
                }} />
              </motion.div>
            );
          })}
        </div>

        {/* ── Mode badge ── */}
        <div style={{
          position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
          borderRadius: 20, padding: '5px 14px',
          color: 'rgba(255,255,255,0.45)',
          fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
          pointerEvents: 'none', zIndex: 30,
          whiteSpace: 'nowrap',
        }}>
          {isMobile ? '📱 MOBILE · 2D' : '🖥 DESKTOP · 3D'} · 8P / 15 MELDS STRESS TEST
        </div>

      </div>
    </>
  );
}
