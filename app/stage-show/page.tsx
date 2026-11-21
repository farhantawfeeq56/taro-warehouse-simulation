import Link from 'next/link';
import { StageNav } from './nav';

const SHOTS = [
  { n: '1', title: 'Bento', blurb: 'Canvas, live results, stats and the AI nudge in one grid — the whole story at a glance.' },
  { n: '2', title: 'Simulate click', blurb: 'A cursor presses the real Simulate button and the routes draw across the real canvas.' },
  { n: '3', title: 'Compare', blurb: 'The real Compare view: every warehouse auto-simulated, ranked by travel distance.' },
  { n: '4', title: 'Layouts', blurb: 'Three real generated layouts side by side, each with its winning route.' },
  { n: '5', title: 'AI suggestion', blurb: 'The real experiment recommendation card against the warehouse it reasons about.' },
  { n: '6', title: 'Everything, one page', blurb: 'Config, canvas, results, ranking and AI output stacked on a single page — the whole loop at once.' },
  { n: '7', title: 'The flow, as a film', blurb: 'Configure → generate → simulate → rank → experiment in a 34-second looping run with a cursor that presses the real controls.' },
  { n: '8', title: 'The ordered film', blurb: 'The /animation screens untouched and in order: /1 → /6 → /2 → /3 → /4 → /5 → /7. Cuts land inside the button-press frame.' },
];

export default function StageShowIndex() {
  return (
    <div className="shot-page">
      <div className="shot-inner">
        <StageNav />
        <div className="shot-copy">
          <div className="shot-kicker">Taro · product shots</div>
          <h1 className="shot-title">Eight ways to show the product.</h1>
          <p className="shot-sub">
            Every version renders the original Taro components against real generated sessions —
            the same pipeline the app runs. Press 1–8 to switch.
          </p>
        </div>
        <div className="shot-index-grid">
          {SHOTS.map((s) => (
            <Link key={s.n} href={`/stage-show/${s.n}`} className="shot-index-card">
              <span className="shot-index-num">{s.n}</span>
              <h2>{s.title}</h2>
              <p>{s.blurb}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
