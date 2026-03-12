import s0  from './stickers/sticker__0000_Layer-10_surprised.png';
import s1  from './stickers/sticker__0001_Layer-9_derpy.png';
import s2  from './stickers/sticker__0002_Layer-8_mad.png';
import s3  from './stickers/sticker__0003_Layer-7_fire.png';
import s4  from './stickers/sticker__0004_Layer-6_happy.png';
import s5  from './stickers/sticker__0005_thumbB.png';
import s6g from './stickers/sticker__0006_thumbA green.png';
import s6  from './stickers/sticker__0006_thumbA.png';
import s7  from './stickers/sticker__0007_Layer-3_sad.png';
import s8  from './stickers/sticker__0008_Layer-2_mad_evil.png';
import s9  from './stickers/sticker__0009_Layer-1_destructive.png';

/** Map from legacy public-path key → inlined asset URL */
export const STICKER_ASSET_MAP: Record<string, string> = {
  '/stickers/sticker__0000_Layer-10_surprised.png':  s0,
  '/stickers/sticker__0001_Layer-9_derpy.png':        s1,
  '/stickers/sticker__0002_Layer-8_mad.png':          s2,
  '/stickers/sticker__0003_Layer-7_fire.png':         s3,
  '/stickers/sticker__0004_Layer-6_happy.png':        s4,
  '/stickers/sticker__0005_thumbB.png':               s5,
  '/stickers/sticker__0006_thumbA green.png':         s6g,
  '/stickers/sticker__0006_thumbA.png':               s6,
  '/stickers/sticker__0007_Layer-3_sad.png':          s7,
  '/stickers/sticker__0008_Layer-2_mad_evil.png':     s8,
  '/stickers/sticker__0009_Layer-1_destructive.png':  s9,
};

/** Resolve a sticker src — handles both legacy paths and already-inlined URLs */
export function resolveStickerSrc(src: string): string {
  return STICKER_ASSET_MAP[src] ?? src;
}

/** Ordered list of sticker keys (stable order for the picker) */
export const STICKER_KEYS = Object.keys(STICKER_ASSET_MAP);
