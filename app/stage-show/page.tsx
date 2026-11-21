'use client';

import { useState } from 'react';
import { Play, Trophy, Warehouse, Route } from 'lucide-react';
import './stage-show.css';

/**
 * /stage-show — Taro product shot.
 * Plan: wide hero, one window + one corner chip. Five beats, play-once:
 * idle → cursor clicks Simulate → three routes draw → Zone wins → hold.
 * Replay remounts at the story boundary (explicit replay, no loop seam).
 * Poster = payoff frame (also what reduced-motion shows).
 */
export default function StageShowPage() {
  const [run, setRun] = useState(0);
  return (
    <div className="taro-stage-page">
      <div className="taro-stage-copy">
        <div className="taro-stage-eyebrow">
          <Warehouse size={14} strokeWidth={2} />
          <span>Taro · picking simulation</span>
        </div>
        <h1 className="taro-stage-title">Test the strategy before you walk it.</h1>
        <p className="taro-stage-sub">
          Taro simulates Single, Batch and Zone picking on your layout — then shows the winner.
        </p>
        <button type="button" className="taro-stage-replay" onClick={() => setRun((n) => n + 1)}>
          <Play size={13} strokeWidth={2.2} />
          Replay
        </button>
      </div>

      {/* The shot. Window fills the stage and runs off the bottom; chip straddles the corner. */}
      <div className="taro-stage" key={run} data-run={run}>
        <div className="taro-window" role="img" aria-label="Taro simulation: Zone strategy wins with 1,240 metres of travel">
          {/* Browser chrome */}
          <div className="taro-chrome">
            <span className="taro-lights" aria-hidden>
              <i /><i /><i />
            </span>
            <span className="taro-url">taro.run/warehouse-01</span>
          </div>

          <div className="taro-body">
            {/* Sidebar — filler bars beside real nav */}
            <aside className="taro-side">
              <span className="taro-wordmark">Taro</span>
              {['Layout', 'Orders', 'Simulate'].map((label, i) => (
                <span key={label} className="taro-nav" data-on={i === 2 || undefined}>
                  <i className="taro-nav-dot" />
                  {label}
                </span>
              ))}
              <span className="taro-bar" style={{ width: 56 }} />
              <span className="taro-bar" style={{ width: 44 }} />
            </aside>

            {/* Main: warehouse map */}
            <div className="taro-main">
              <div className="taro-head">
                <div className="taro-head-who">
                  <span className="taro-head-title">Default Warehouse</span>
                  <span className="taro-head-meta">48 orders · 5 workers</span>
                </div>
                <span className="taro-sim-btn" data-target="simulate">
                  Simulate
                </span>
              </div>

              <div className="taro-map" data-target="map">
                {/* Racks */}
                <div className="taro-racks" aria-hidden>
                  {Array.from({ length: 40 }).map((_, i) => (
                    <i key={i} className="taro-rack" />
                  ))}
                </div>
                {/* Routes draw in staggered order: single (faint) → batch → zone */}
                <svg className="taro-routes" viewBox="0 0 400 240" preserveAspectRatio="none" aria-hidden>
                  <path className="taro-route r-single" d="M28,208 L28,120 L120,120 L120,60 L230,60 L230,140 L340,140 L340,40" pathLength={1} />
                  <path className="taro-route r-batch" d="M28,208 L90,208 L90,150 L190,150 L190,90 L300,90 L300,50" pathLength={1} />
                  <path className="taro-route r-zone" d="M28,208 L28,170 L150,170 L150,110 L260,110 L260,60" pathLength={1} />
                  <circle className="taro-start" cx={28} cy={208} r={5} />
                  <circle className="taro-end" cx={260} cy={60} r={5} />
                </svg>
                <span className="taro-route-label l-zone">
                  <Route size={11} strokeWidth={2.4} /> Zone
                </span>
              </div>
            </div>

            {/* Results — the payoff lives here, real words on all three rows */}
            <div className="taro-results">
              <span className="taro-results-kicker">Results</span>
              <span className="taro-big">1,240 m</span>
              <span className="taro-big-sub">Zone · 68 min · 92%</span>
              <div className="taro-rows">
                <div className="taro-row is-best" data-row="zone">
                  <span className="taro-row-name">Zone</span>
                  <span className="taro-row-val">1,240 m</span>
                  <span className="taro-best"><Trophy size={10} strokeWidth={2.4} /> Best</span>
                </div>
                <div className="taro-row" data-row="batch">
                  <span className="taro-row-name">Batch</span>
                  <span className="taro-row-val">1,580 m</span>
                </div>
                <div className="taro-row is-faint" data-row="single">
                  <span className="taro-row-name">Single</span>
                  <span className="taro-row-val">2,180 m</span>
                </div>
              </div>
              <span className="taro-bar" style={{ width: '72%' }} />
              <span className="taro-bar" style={{ width: '52%' }} />
            </div>
          </div>

          {/* Corner chip: one live fact, centered on the window corner, half outside */}
          <span className="taro-chip">−43% travel</span>
        </div>

        {/* Authored cursor — moves to Simulate, presses, rests by the result */}
        <span className="taro-cursor" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 22 22">
            <path d="M5 3 L5 16 L10 12.5 L12.5 18 L14.8 17 L12.3 11.5 L17 11.5 Z" fill="#111" stroke="#fff" strokeWidth="1.4" />
          </svg>
        </span>
      </div>

      <p className="taro-stage-note">One window, one fact. Simulated on your layout — 48 orders, 5 workers.</p>
    </div>
  );
}
