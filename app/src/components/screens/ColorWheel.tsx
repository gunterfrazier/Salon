/** A color-bar reference: the color wheel, what neutralizes what, and the pigment exposed when lifting. */

const WHEEL = [
  ["Yellow", "#f5d300"], ["Yellow-orange", "#f8b500"], ["Orange", "#f58a1f"], ["Red-orange", "#ec5a2a"],
  ["Red", "#d7263d"], ["Red-violet", "#b0306e"], ["Violet", "#7b3fa0"], ["Blue-violet", "#5546a8"],
  ["Blue", "#2c6fbb"], ["Blue-green", "#1e9a96"], ["Green", "#3aa34a"], ["Yellow-green", "#9cc63b"],
] as const;

const NEUTRALIZE = [
  ["Yellow", "Violet"],
  ["Orange", "Blue"],
  ["Red", "Green"],
  ["Yellow-orange", "Blue-violet"],
  ["Red-orange", "Blue-green"],
] as const;

const LEVELS = [
  [1, "Black", "Blue-black"], [2, "Darkest brown", "Dark red-violet"], [3, "Dark brown", "Red"], [4, "Medium brown", "Red-orange"],
  [5, "Light brown", "Red-orange"], [6, "Dark blonde", "Orange"], [7, "Medium blonde", "Orange-yellow"], [8, "Light blonde", "Yellow-orange"],
  [9, "Very light blonde", "Yellow"], [10, "Lightest blonde", "Pale yellow"],
] as const;

export default function ColorWheel() {
  const r = 120;
  const seg = (i: number) => {
    const a0 = ((i - 0.5) / 12) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 0.5) / 12) * 2 * Math.PI - Math.PI / 2;
    const p = (a: number, rr: number) => `${140 + rr * Math.cos(a)} ${140 + rr * Math.sin(a)}`;
    return `M ${p(a0, 50)} L ${p(a0, r)} A ${r} ${r} 0 0 1 ${p(a1, r)} L ${p(a1, 50)} A 50 50 0 0 0 ${p(a0, 50)} Z`;
  };
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[auto_1fr_1fr]">
      <figure className="mx-auto">
        <svg viewBox="0 0 280 280" className="size-64 sm:size-80" role="img" aria-label="Color wheel: opposite colors neutralize each other">
          {WHEEL.map(([name, color], i) => <path key={name} d={seg(i)} fill={color} stroke="#0f0f11" strokeWidth="2"><title>{name}</title></path>)}
          <text x="140" y="136" textAnchor="middle" fill="currentColor" fontSize="13">Opposites</text>
          <text x="140" y="153" textAnchor="middle" fill="currentColor" fontSize="13">cancel out</text>
        </svg>
      </figure>
      <div>
        <h2 className="font-display text-3xl">Neutralize</h2>
        <p className="text-muted">To cancel unwanted tone, use its opposite.</p>
        <ul className="mt-3 space-y-2 text-xl">
          {NEUTRALIZE.map(([bad, fix]) => {
            const c = (n: string) => WHEEL.find((w) => w[0] === n)![1];
            return (
              <li key={bad} className="flex items-center gap-2">
                <span className="inline-block size-4 rounded-full" style={{ background: c(bad) }} /> {bad}
                <span className="text-muted">→ use</span>
                <span className="inline-block size-4 rounded-full" style={{ background: c(fix) }} /> {fix}
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h2 className="font-display text-3xl">Levels</h2>
        <p className="text-muted">Warmth exposed when lifting each level.</p>
        <ul className="mt-3 divide-y divide-line text-lg">
          {LEVELS.map(([n, name, pigment]) => (
            <li key={n} className="grid grid-cols-[2rem_1fr_auto] gap-2 py-1">
              <span className="font-mono">{n}</span>
              <span>{name}</span>
              <span className="text-muted">{pigment}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">General guide. Follow your color line&rsquo;s own chart.</p>
      </div>
    </div>
  );
}
