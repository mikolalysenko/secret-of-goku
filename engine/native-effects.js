// Native Secret of Mana US spell OBJ decoder. No game bytes embedded.
// Input is the 2 MiB, unheadered ROM Uint8Array; offsets are PC file offsets.
// Descriptors are in native-effects.json. See docs/native-effects.md for verification.

function range(bytes, offset, size) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected ROM Uint8Array');
  if (!Number.isInteger(offset) || offset < 0 || offset + size > bytes.length) {
    throw new RangeError('Effect data outside ROM');
  }
}

export function decodeEffectTile(bytes, offset) {
  const indices = new Uint8Array(64);
  if (offset === null) return indices;
  range(bytes, offset, 24);
  for (let y = 0; y < 8; y++) {
    const a = bytes[offset + y * 3];
    const b = bytes[offset + y * 3 + 1];
    const c = bytes[offset + y * 3 + 2];
    const planes = [(~a) & 255, a ^ b, (~c) & (a ^ b), (a & b) ^ c];
    for (let x = 0; x < 8; x++) {
      for (let p = 0; p < 4; p++) {
        indices[y * 8 + x] |= ((planes[p] >> (7 - x)) & 1) << p;
      }
    }
  }
  return indices;
}

function rgb5(word) {
  const r = word & 31, g = (word >> 5) & 31, b = (word >> 10) & 31;
  return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2), 255];
}

export function decodeEffectFrame(bytes, frame) {
  const { romOffset, firstIndex, count, rotation = 0 } = frame.palette;
  if (!Number.isInteger(count) || count < 1 || count > 15 ||
      !Number.isInteger(firstIndex) || firstIndex < 1 || firstIndex + count > 16 ||
      !Number.isInteger(rotation) || rotation < 0 || rotation >= count) {
    throw new RangeError('Invalid effect palette descriptor');
  }
  range(bytes, romOffset, count * 2);
  const colors = Array.from({ length: 16 }, () => [0, 0, 0, 0]);
  for (let i = 0; i < count; i++) {
    const at = romOffset + ((i + rotation) % count) * 2;
    colors[firstIndex + i] = rgb5(bytes[at] | bytes[at + 1] << 8);
  }
  const rgba = new Uint8ClampedArray(16 * 16 * 4);
  for (const tile of frame.tiles) {
    if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y) ||
        tile.x < 0 || tile.y < 0 || tile.x > 8 || tile.y > 8) {
      throw new RangeError('Effect tile outside 16×16 cell');
    }
    const indices = decodeEffectTile(bytes, tile.romOffset);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const index = indices[y * 8 + x];
      if (index === 0) continue;
      if (index < firstIndex || index >= firstIndex + count) {
        throw new RangeError(`Unresolved shared palette index ${index}`);
      }
      rgba.set(colors[index], ((tile.y + y) * 16 + tile.x + x) * 4);
    }
  }
  return { width: 16, height: 16, rgba };
}

export function decodeEffectAtlas(bytes, manifest) {
  const { width, height } = manifest.atlas;
  if (manifest.schemaVersion !== 1 || manifest.format !== 'som-effect-3bpp-row') {
    throw new Error('Unsupported native effect descriptor version');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 16 || height < 16 || width > 4096 || height > 4096) {
    throw new RangeError('Invalid effect atlas dimensions');
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (const frame of manifest.frames) {
    const { x, y, w, h } = frame.atlas;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 ||
        w !== 16 || h !== 16 || x + w > width || y + h > height) {
      throw new RangeError('Effect frame outside atlas');
    }
    const pixels = decodeEffectFrame(bytes, frame).rgba;
    for (let row = 0; row < 16; row++) {
      rgba.set(pixels.subarray(row * 64, row * 64 + 64), ((y + row) * width + x) * 4);
    }
  }
  return { width, height, rgba };
}

export function createNativeEffects(bytes,manifest){
  if(manifest.schemaVersion!==1||manifest.format!=='som-effect-3bpp-row')throw Error('Unsupported native effects manifest');
  const groups={};
  const gold=manifest.frames.find(frame=>frame.group==='gold-spark').palette;
  function add(frame,group,palette=frame.palette){
    const {rgba}=decodeEffectFrame(bytes,{...frame,palette}),pixels=new Uint16Array(256);
    for(let i=0;i<256;i++)if(rgba[i*4+3])pixels[i]=1+((rgba[i*4]>>3)|((rgba[i*4+1]>>3)<<5)|((rgba[i*4+2]>>3)<<10));
    (groups[group]??=[]).push(pixels);
  }
  for(const frame of manifest.frames){
    add(frame,frame.group);
    if(['charge-orb','beam-body','beam-head'].includes(frame.group))add(frame,'gold-'+frame.group,gold);
  }
  return groups;
}
