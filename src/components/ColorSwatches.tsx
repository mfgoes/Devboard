interface ColorSwatch {
  hex: string;
  label: string;
}

interface Props {
  colors: ColorSwatch[];
  activeColor: string;
  onSelect: (hex: string) => void;
  columns?: number;
}

export default function ColorSwatches({ colors, activeColor, onSelect, columns = 4 }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 10,
        padding: 12,
      }}
    >
      {colors.map((c) => (
        <button
          key={c.hex}
          title={c.label}
          onClick={() => onSelect(c.hex)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: `2px solid ${activeColor === c.hex ? '#6366f1' : 'transparent'}`,
            background: c.hex === 'transparent' ? 'transparent' : c.hex,
            outline: c.hex === 'transparent' ? '1.5px dashed #555' : 'none',
            outlineOffset: c.hex === 'transparent' ? '-3px' : '0',
            cursor: 'pointer',
            transition: 'transform 0.1s',
            position: 'relative',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.15)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {c.hex === 'transparent' && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              style={{ position: 'absolute', inset: 0, margin: 'auto' }}
            >
              <line x1="1" y1="13" x2="13" y2="1" stroke="#888" strokeWidth="1.5" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}
