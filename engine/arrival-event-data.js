/* Native event bytecode for Goku's arrival at the Mana Sword.
 * The installer overlays cartridge reads; it never writes cart.data. The SNES
 * keeps its original dialogue renderer, event interpreter, flags and effects.
 * The controller owns the event-pointer redirect, arrival visuals and names.
 */

const ENTRY = 0xc74400;
const HOOK = 0xc9269f;
const RESUME = 0xc92790;
const GRUNT = 0xc92691;

function glyph(character) {
  const code = character.charCodeAt(0);
  if (character === '\n') return 0x7f;
  if (character === ' ') return 0x80;
  if (code >= 0x61 && code <= 0x7a) return code + 0x20;
  if (code >= 0x41 && code <= 0x5a) return code + 0x5a;
  if (code >= 0x30 && code <= 0x39) return code + 0x85;
  const punctuation = { '.': 0xbf, ',': 0xc0, '/': 0xc1, "'": 0xc2, ':': 0xc5, '-': 0xc6, '!': 0xc8, '?': 0xca };
  if (Object.hasOwn(punctuation, character)) return punctuation[character];
  throw new Error(`Unsupported arrival dialogue character: ${JSON.stringify(character)}`);
}

const encode = text => Uint8Array.from(text, glyph);
const pages = Object.freeze([
  "GOKU:This isn't Planet\nNamek... Uh, sorry about\nthe parking.",
  'GHOST:That was the chosen\nhero. And the Mana Sword.',
  'GHOST:The boy is dead.\nThe sword is dust.',
  'GOKU:I brought Dragon\nBalls! ...Oh. They went\nEVERYWHERE.',
  'GHOST:You are the chosen\nhero now. Go to Potos.\nTry walking.'
]);
for (const page of pages) {
  const lines = page.split('\n');
  if (lines.length > 3 || lines.some(line => line.length > 28)) {
    throw new Error('Arrival dialogue exceeds the native three-line window');
  }
}

const bytes = [];
const labels = {};
const emit = (...values) => bytes.push(...values);
const mark = name => { labels[name] = ENTRY + bytes.length; };
// A repeated native actor lock separates phases without changing the state.
// WAIT stores the next opcode in D1:D3. This separator prevents the waiting
// pointer from being mistaken for the next phase before its timer expires.
const separator = () => emit(0x39, 0x00, 0x90, 0x01);

mark('descent');
emit(0x52, 0x51);                         // clear/close the existing grunt box
emit(0x40, 0x02, 0x12, 0x00, 0x88);      // native quake sound (event785)
emit(0x28, 0x0c);                         // 60 native frames after box closes
mark('descentWait');
separator();

mark('impact');
emit(0x29, 0x10, 0x09);                   // original sword flag + object refresh
emit(0x29, 0x00);                         // original post-pull UI progression
emit(0x2d, 0x02);                         // original earthquake graphic effect
emit(0x2d, 0x06, 0xff, 0x43);             // original sword-scene white flash
emit(0x40, 0x02, 0xb0, 0x0f, 0x88);      // native hole-opening sound (event798)
emit(0x28, 0x18);                         // 120 native impact frames
mark('impactWait');
separator();

mark('ghost');
emit(0x2d, 0x04, 0x2d, 0x07);            // stop quake; restore scene palette
emit(0x29, 0x0a, 0x09);                   // original flag spawns species D7 ghost
emit(0x28, 0x04);                         // 20 frames for native ghost appearance
mark('ghostWait');
separator();

mark('dialogue');
emit(0x50);
for (let index = 0; index < pages.length; index++) {
  if (index) emit(0x52);
  mark(`page${index + 1}`);
  emit(...encode(pages[index]), 0x28, 0x00);
  mark(`page${index + 1}Wait`);
}
emit(0x51, 0x2a, 0x0a, 0x09);            // close dialogue; original ghost removal
emit(0x28, 0xff);                         // host resumes while this wait is active
mark('finish');
emit(0x00);                               // defensive event terminator

const script = Uint8Array.from(bytes);
const originalGrunt = encode(':Urrrrrrrgh!');
const END = ENTRY + script.length;
Object.freeze(labels);

/** Install once on the currently loaded SnesJS cartridge.
 *
 * Begin: at hook with map128, CF10=0, and D0=0x82, set D1:D3 to entry and D0=1.
 * The host may let the original grunt pause finish before redirecting.
 * Rename BOY to GOKU when classify(pointer) first becomes "impact".
 * Finish: when pointer===labels.finish, set D1:D3 to resume and D0=1.
 * Call the host's phase/update logic every emulated frame. Do not replace the
 * original event tail: it still performs native music, HUD and story setup.
 *
 * Existing mid-scene checkpoints need this same adapter installed on restore.
 * No RAM script buffer, cartridge mutation, ROM expansion or hash change occurs.
 */
export function installArrivalEventData(cart, originalROM = cart?.data) {
  if (!cart || typeof cart.read !== 'function' || !cart.data ||
      cart.data.length !== 0x200000 || !originalROM || originalROM.length !== 0x200000) {
    throw new Error('Arrival events require the loaded unheadered Secret of Mana US cartridge');
  }
  const word = at => originalROM[at] | originalROM[at + 1] << 8;
  if (word(0x90206) !== 0x2613 || word(0x90208) !== 0x27fe ||
      ![0x29, 0x10, 0x09, 0x29, 0x00].every((value, i) => originalROM[0x9269f + i] === value) ||
      ![0x39, 0x00, 0x90, 0x00].every((value, i) => originalROM[0x92790 + i] === value)) {
    throw new Error('Unsupported original Mana Sword event layout');
  }
  if (END > 0xc75000 || !script.every((_, i) => cart.data[0x74400 + i] === 0xff)) {
    throw new Error('Arrival event overlay collides with occupied cartridge space');
  }

  const previousRead = cart.read;
  function arrivalRead(bank, address) {
    const cpuAddress = ((bank & 255) << 16) | (address & 0xffff);
    if (cpuAddress >= ENTRY && cpuAddress < END) return script[cpuAddress - ENTRY];
    // The existing same-length text patch remains in cart.data for old hashes.
    // Read the boy's original grunt until the new arrival event takes over.
    if (cpuAddress >= GRUNT && cpuAddress < GRUNT + originalGrunt.length) {
      return originalGrunt[cpuAddress - GRUNT];
    }
    return previousRead.call(this, bank, address);
  }
  cart.read = arrivalRead;

  return Object.freeze({
    version: 1, entry: ENTRY, hook: HOOK, resume: RESUME, labels,
    ranges: Object.freeze({
      script: Object.freeze([ENTRY, END]),
      originalGrunt: Object.freeze([GRUNT, GRUNT + originalGrunt.length])
    }),
    script: new Uint8Array(script), pages,
    waits: Object.freeze({ descent: 60, impact: 120, ghost: 20, finish: 1275 }),
    names: Object.freeze({ boy: Object.freeze([0x9c, 0xa9, 0xb3, 0, 0, 0]), goku: Object.freeze([0xa1, 0xa9, 0xa5, 0xaf, 0, 0]) }),
    classify(pointer) {
      if (!Number.isInteger(pointer) || pointer < ENTRY || pointer >= END) return null;
      if (pointer >= labels.finish) return 'finish';
      if (pointer >= labels.dialogue) return 'dialogue';
      if (pointer >= labels.ghost) return 'ghost';
      if (pointer >= labels.impact) return 'impact';
      return 'descent';
    },
    dispose() {
      if (cart.read !== arrivalRead) return false;
      cart.read = previousRead;
      return true;
    }
  });
}
