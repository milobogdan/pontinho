import { useState } from 'react';
import { motion } from 'framer-motion';

// ── Card dimensions ───────────────────────────────────────────────────────────
const W = 90;
const H = 130;

// ── Player hand arc (quadratic Y-drop) ───────────────────────────────────────
const CARD_COUNT = 9;
const CENTER     = (CARD_COUNT - 1) / 2;   // 4
const X_STEP     = 78;                      // px horizontal spread per card
const ARC_DROP   = 55;                      // px max Y-drop at outermost cards
const FAN_DEG    = 3.6;                     // rotateZ degrees per step from center

function handTransform(i) {
  const offset = i - CENTER;
  const norm   = offset / CENTER;           // –1 … +1
  return {
    x:      offset * X_STEP,
    y:      Math.pow(norm, 2) * ARC_DROP,   // 0 at center, ARC_DROP at edges
    rotate: offset * FAN_DEG,
  };
}

// ── Opponent hand (inside the 3D table, top section) ─────────────────────────
const OPP_COUNT  = 7;
const OPP_CENTER = (OPP_COUNT - 1) / 2;
const OPP_W = 44;
const OPP_H = 64;

function oppTransform(i) {
  const offset = i - OPP_CENTER;
  const norm   = offset / OPP_CENTER;
  return {
    x:      offset * 34,
    y:      Math.pow(norm, 2) * 16,
    rotate: offset * 2.8,
  };
}

export default function Sandbox3DTable() {
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#020706',
      overflow: 'hidden',
      fontFamily: 'system-ui, sans-serif',
    }}>

      {/* ── Room ambient glow (top) ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(14,56,28,0.7) 0%, transparent 55%)',
      }} />

      {/* ── Perspective container — table only ── */}
      <div style={{
        position: 'absolute', inset: 0,
        perspective: '1200px',
        perspectiveOrigin: '50% 25%',
      }}>
        {/*
          Table sizing goal: have its perspective-projected bottom edge
          land near 80–85% of the viewport height so the felt fills the screen.
          With perspective=1200, perspectiveOrigin at 25%, rotateX=52°,
          height=90vh, and transformOrigin at the top 6% of the element,
          the projected bottom reaches ~85vh on a standard 900px-tall desktop.
        */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transformOrigin: '50% 6%',
          transform: 'translateX(-50%) rotateX(52deg)',
          width: '80vw',
          height: '90vh',                  // taller than before — bottom reaches screen
          borderRadius: 100,
          background: 'radial-gradient(ellipse 80% 50% at 50% 22%, #22844e 0%, #135c30 38%, #0a3a1c 65%, #050f08 100%)',
          boxShadow: [
            '0 0 0 14px #5c3410',          // wood rim inner
            '0 0 0 26px #3d2208',          // wood rim outer
            '0 60px 140px rgba(0,0,0,0.95)',
            'inset 0 0 130px rgba(0,0,0,0.55)',
            'inset 0 0 40px rgba(0,0,0,0.3)',
          ].join(', '),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
        }}>

          {/* ── Opponent hand ── */}
          <div style={{ position: 'absolute', top: '14%', left: '50%', width: 0, height: 0 }}>
            {Array.from({ length: OPP_COUNT }).map((_, i) => {
              const t = oppTransform(i);
              return (
                <div key={i} style={{
                  position: 'absolute',
                  bottom: 0,
                  left: -(OPP_W / 2),
                  width: OPP_W, height: OPP_H,
                  borderRadius: 6,
                  background: 'linear-gradient(145deg, #1e4fa8, #142f6e)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.65)',
                  transform: `translateX(${t.x}px) translateY(${t.y}px) rotate(${t.rotate}deg)`,
                  zIndex: OPP_COUNT - Math.abs(Math.round(i - OPP_CENTER)),
                }}>
                  <div style={{
                    margin: '6px auto 0',
                    width: '70%', height: '78%',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 3,
                    background: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.04),rgba(255,255,255,0.04) 2px,transparent 2px,transparent 7px)',
                  }} />
                </div>
              );
            })}
          </div>

          {/* ── Felt center line ── */}
          <div style={{
            position: 'absolute', top: '46%',
            width: '62%', height: 1,
            background: 'rgba(255,255,255,0.055)',
          }} />

          {/* ── Center piles ── */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <div style={{
              width: 72, height: 104, borderRadius: 9,
              background: 'linear-gradient(145deg, #1e4fa8, #142f6e)',
              border: '1px solid rgba(255,255,255,0.18)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: '72%', height: '78%',
                border: '1.5px solid rgba(255,255,255,0.14)',
                borderRadius: 4,
                background: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.04),rgba(255,255,255,0.04) 2px,transparent 2px,transparent 7px)',
              }} />
            </div>

            <div style={{ width: 1, height: 80, background: 'rgba(255,255,255,0.06)' }} />

            <div style={{
              width: 72, height: 104, borderRadius: 9,
              background: 'linear-gradient(145deg, #fdfcf6, #ede7d6)',
              border: '1px solid rgba(0,0,0,0.1)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.65)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, color: '#c0392b', lineHeight: 1,
            }}>♥</div>
          </div>

        </div>{/* /table */}
      </div>{/* /perspective */}

      {/*
        ── Near table rim ─────────────────────────────────────────────────────
        A 2D wood-colored band fixed at the very bottom of the viewport.
        Gives the illusion the player is seated at the table edge, and fills
        the remaining gap below the perspective-projected table surface.
      */}
      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        height: 72,
        background: 'linear-gradient(180deg, #5a3010 0%, #3a1e08 55%, #1e0e02 100%)',
        boxShadow: '0 -6px 40px rgba(0,0,0,0.85), inset 0 2px 0 rgba(255,220,160,0.1)',
        zIndex: 10,
      }} />

      {/*
        ── Player hand ────────────────────────────────────────────────────────
        Anchor point sits at bottom: 10% so the cards ride up over the
        table's bottom rim and felt, creating the seated-at-the-table look.
        z-index 20 puts cards in front of the near rim (z=10) and the
        perspective table elements (no explicit z-index = auto).
      */}
      <div style={{
        position: 'fixed',
        bottom: '10%',
        left: '50%',
        zIndex: 20,
      }}>
        {Array.from({ length: CARD_COUNT }).map((_, i) => {
          const { x, y, rotate } = handTransform(i);
          const isHov = hovered === i;

          return (
            <motion.div
              key={i}
              onHoverStart={() => setHovered(i)}
              onHoverEnd={() => setHovered(null)}
              animate={{ x, y, rotate }}
              whileHover={{
                y: y - 80,
                scale: 1.12,
                transition: { type: 'spring', stiffness: 380, damping: 22 },
              }}
              transition={{ type: 'spring', stiffness: 240, damping: 28 }}
              style={{
                position: 'absolute',
                bottom: 0,
                left: -(W / 2),
                width: W, height: H,
                borderRadius: 10,
                background: 'linear-gradient(160deg, #fdfcf8 0%, #f4edd8 100%)',
                border: `2px solid ${isHov ? 'rgba(244,165,34,0.95)' : 'rgba(180,170,150,0.7)'}`,
                // Layered shadow: deep ambient + tight contact shadow simulates
                // hovering just above the felt surface
                boxShadow: isHov
                  ? [
                      '0 28px 60px rgba(0,0,0,0.9)',
                      '0 10px 24px rgba(0,0,0,0.65)',
                      '0 0 0 3px rgba(244,165,34,0.55)',
                    ].join(', ')
                  : [
                      '0 16px 36px rgba(0,0,0,0.75)',   // deep ambient
                      '0 4px 10px rgba(0,0,0,0.6)',     // mid-range
                      '0 2px 4px rgba(0,0,0,0.5)',      // contact
                    ].join(', '),
                cursor: 'pointer',
                zIndex: isHov ? 200 : (CARD_COUNT - Math.abs(Math.round(i - CENTER))),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            >
              <div style={{
                width: '76%', height: '82%',
                borderRadius: 5,
                border: `1.5px solid ${isHov ? 'rgba(244,165,34,0.35)' : 'rgba(0,0,0,0.07)'}`,
                background: 'repeating-linear-gradient(45deg, #f9f7ee, #f9f7ee 2px, #eeead8 2px, #eeead8 8px)',
                transition: 'border-color 0.15s',
              }} />
            </motion.div>
          );
        })}
      </div>

      {/* ── Label ── */}
      <div style={{
        position: 'fixed', top: 16, left: '50%',
        transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.22)',
        fontSize: 11, fontWeight: 700, letterSpacing: 2,
        pointerEvents: 'none', zIndex: 30,
      }}>
        SANDBOX · 3D TABLE POC
      </div>
    </div>
  );
}
