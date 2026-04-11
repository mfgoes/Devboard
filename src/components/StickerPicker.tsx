import { useBoardStore } from '../store/boardStore';
import { STICKER_KEYS, STICKER_ASSET_MAP } from '../assets/stickerAssets';

export default function StickerPicker() {
  const { activeSticker, setActiveSticker } = useBoardStore();

  return (
    <div className="pointer-events-auto px-2 py-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-lg">
      <div className="grid grid-cols-4 gap-1">
        {STICKER_KEYS.map((key) => (
          <button
            key={key}
            title={key.split('/').pop()?.replace(/sticker__\d+_|\.png/g, '').replace(/_/g, ' ') ?? ''}
            onClick={() => setActiveSticker(key)}
            className={[
              'w-10 h-10 flex items-center justify-center rounded-lg overflow-hidden transition-all',
              activeSticker === key
                ? 'ring-2 ring-[var(--c-line)] ring-offset-1 ring-offset-[var(--c-panel)] bg-[var(--c-hover)]'
                : 'hover:bg-[var(--c-hover)]',
            ].join(' ')}
          >
            <img src={STICKER_ASSET_MAP[key]} alt="" className="w-8 h-8 object-contain" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );
}
