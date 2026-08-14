/**
 * The quiet collage behind the empty states. Cosmos pushes content to the
 * edges and leaves the middle still; here the same shape is made of empty
 * cards rather than imagery, so it sets the tone without pretending to be
 * content the user doesn't have yet.
 *
 * Positions are hand-placed, not random — randomness reads as noise at this
 * density, and it would reshuffle on every render.
 */

interface Tile {
  top: string;
  left?: string;
  right?: string;
  w: number;
  h: number;
  opacity: number;
  /** Inner tiles crowd the headline on narrow screens, so they drop out. */
  inner?: boolean;
}

const TILES: Tile[] = [
  { top: '3%', left: '1%', w: 150, h: 190, opacity: 0.5 },
  { top: '31%', left: '5%', w: 120, h: 120, opacity: 0.34 },
  { top: '59%', left: '2%', w: 140, h: 175, opacity: 0.46 },
  { top: '86%', left: '9%', w: 110, h: 90, opacity: 0.28 },
  { top: '6%', right: '4%', w: 130, h: 160, opacity: 0.42 },
  { top: '35%', right: '1%', w: 155, h: 115, opacity: 0.3 },
  { top: '63%', right: '6%', w: 115, h: 150, opacity: 0.48 },
  { top: '89%', right: '2%', w: 145, h: 105, opacity: 0.26 },
  { top: '2%', left: '26%', w: 105, h: 130, opacity: 0.24, inner: true },
  { top: '91%', left: '30%', w: 125, h: 95, opacity: 0.22, inner: true },
  { top: '1%', right: '27%', w: 118, h: 100, opacity: 0.26, inner: true },
  { top: '92%', right: '24%', w: 100, h: 120, opacity: 0.2, inner: true },
];

export default function Scatter() {
  return (
    <div className="scatter" aria-hidden="true">
      {TILES.map((tile, index) => (
        <div
          key={index}
          className="scatter-tile"
          data-inner={tile.inner ?? false}
          style={{
            top: tile.top,
            left: tile.left,
            right: tile.right,
            width: tile.w,
            height: tile.h,
            opacity: tile.opacity,
          }}
        />
      ))}
    </div>
  );
}
