import PropTypes from 'prop-types';

/**
 * The Hyperweaver woven H, inline from hyperweaver-ui's
 * public/images/hyperweaver-glyph.svg, drawn at 1em so it sits in a button or
 * a row like an icon.
 */
const HyperweaverGlyph = ({ className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 256 256"
    width="1em"
    height="1em"
    className={className}
    aria-hidden
  >
    <defs>
      <linearGradient id="hwGlyphRib" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff8a33" />
        <stop offset="1" stopColor="#ff6600" />
      </linearGradient>
      <linearGradient id="hwGlyphRibH" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ff8a33" />
        <stop offset="1" stopColor="#ff6600" />
      </linearGradient>
    </defs>
    <g stroke="#111111" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
      <rect x="30" y="28" width="48" height="200" rx="10" fill="url(#hwGlyphRib)" />
      <rect x="30" y="104" width="196" height="48" rx="10" fill="url(#hwGlyphRibH)" />
      <rect
        x="164"
        y="106"
        width="16"
        height="44"
        rx="6"
        fill="#111111"
        opacity="0.24"
        stroke="none"
      />
      <rect x="178" y="28" width="48" height="200" rx="10" fill="url(#hwGlyphRib)" />
      <rect
        x="32"
        y="152"
        width="44"
        height="16"
        rx="6"
        fill="#111111"
        opacity="0.20"
        stroke="none"
      />
    </g>
  </svg>
);

HyperweaverGlyph.propTypes = {
  className: PropTypes.string,
};

export default HyperweaverGlyph;
