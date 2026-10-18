// 65816 opcode table and single-instruction decoder shared by the tracer and
// disassembler. Modes follow the WDC datasheet; lengths depend on M/X.
const T = {};
const def = (list, mode) => { for (const [op, name] of list) T[op] = { name, mode }; };
// [opcode, mnemonic] grouped by addressing mode.
def([[0x00,'BRK'],[0x02,'COP']], 'sig');
def([[0x01,'ORA'],[0x21,'AND'],[0x41,'EOR'],[0x61,'ADC'],[0x81,'STA'],[0xA1,'LDA'],[0xC1,'CMP'],[0xE1,'SBC']], 'dpxi');
def([[0x03,'ORA'],[0x23,'AND'],[0x43,'EOR'],[0x63,'ADC'],[0x83,'STA'],[0xA3,'LDA'],[0xC3,'CMP'],[0xE3,'SBC']], 'sr');
def([[0x04,'TSB'],[0x05,'ORA'],[0x06,'ASL'],[0x14,'TRB'],[0x24,'BIT'],[0x25,'AND'],[0x26,'ROL'],[0x45,'EOR'],[0x46,'LSR'],[0x64,'STZ'],[0x65,'ADC'],[0x66,'ROR'],[0x84,'STY'],[0x85,'STA'],[0x86,'STX'],[0xA4,'LDY'],[0xA5,'LDA'],[0xA6,'LDX'],[0xC4,'CPY'],[0xC5,'CMP'],[0xC6,'DEC'],[0xE4,'CPX'],[0xE5,'SBC'],[0xE6,'INC']], 'dp');
def([[0x07,'ORA'],[0x27,'AND'],[0x47,'EOR'],[0x67,'ADC'],[0x87,'STA'],[0xA7,'LDA'],[0xC7,'CMP'],[0xE7,'SBC']], 'dpil');
def([[0x08,'PHP'],[0x0A,'ASL'],[0x0B,'PHD'],[0x18,'CLC'],[0x1A,'INC'],[0x1B,'TCS'],[0x28,'PLP'],[0x2A,'ROL'],[0x2B,'PLD'],[0x38,'SEC'],[0x3A,'DEC'],[0x3B,'TSC'],[0x40,'RTI'],[0x48,'PHA'],[0x4A,'LSR'],[0x4B,'PHK'],[0x58,'CLI'],[0x5A,'PHY'],[0x5B,'TCD'],[0x60,'RTS'],[0x68,'PLA'],[0x6A,'ROR'],[0x6B,'RTL'],[0x78,'SEI'],[0x7A,'PLY'],[0x7B,'TDC'],[0x88,'DEY'],[0x8A,'TXA'],[0x8B,'PHB'],[0x98,'TYA'],[0x9A,'TXS'],[0x9B,'TXY'],[0xA8,'TAY'],[0xAA,'TAX'],[0xAB,'PLB'],[0xB8,'CLV'],[0xBA,'TSX'],[0xBB,'TYX'],[0xC8,'INY'],[0xCA,'DEX'],[0xCB,'WAI'],[0xD8,'CLD'],[0xDA,'PHX'],[0xDB,'STP'],[0xE8,'INX'],[0xEA,'NOP'],[0xEB,'XBA'],[0xF8,'SED'],[0xFA,'PLX'],[0xFB,'XCE']], 'imp');
def([[0x09,'ORA'],[0x29,'AND'],[0x49,'EOR'],[0x69,'ADC'],[0x89,'BIT'],[0xA9,'LDA'],[0xC9,'CMP'],[0xE9,'SBC']], 'immm');
def([[0xA0,'LDY'],[0xA2,'LDX'],[0xC0,'CPY'],[0xE0,'CPX']], 'immx');
def([[0xC2,'REP'],[0xE2,'SEP']], 'imm8');
def([[0x0C,'TSB'],[0x0D,'ORA'],[0x0E,'ASL'],[0x1C,'TRB'],[0x2C,'BIT'],[0x2D,'AND'],[0x2E,'ROL'],[0x4D,'EOR'],[0x4E,'LSR'],[0x6D,'ADC'],[0x6E,'ROR'],[0x8C,'STY'],[0x8D,'STA'],[0x8E,'STX'],[0x9C,'STZ'],[0xAC,'LDY'],[0xAD,'LDA'],[0xAE,'LDX'],[0xCC,'CPY'],[0xCD,'CMP'],[0xCE,'DEC'],[0xEC,'CPX'],[0xED,'SBC'],[0xEE,'INC']], 'abs');
def([[0x20,'JSR'],[0x4C,'JMP']], 'absj');
def([[0x0F,'ORA'],[0x2F,'AND'],[0x4F,'EOR'],[0x6F,'ADC'],[0x8F,'STA'],[0xAF,'LDA'],[0xCF,'CMP'],[0xEF,'SBC']], 'long');
def([[0x22,'JSL'],[0x5C,'JML']], 'longj');
def([[0x10,'BPL'],[0x30,'BMI'],[0x50,'BVC'],[0x70,'BVS'],[0x80,'BRA'],[0x90,'BCC'],[0xB0,'BCS'],[0xD0,'BNE'],[0xF0,'BEQ']], 'rel');
def([[0x82,'BRL']], 'rell');
def([[0x11,'ORA'],[0x31,'AND'],[0x51,'EOR'],[0x71,'ADC'],[0x91,'STA'],[0xB1,'LDA'],[0xD1,'CMP'],[0xF1,'SBC']], 'dpiy');
def([[0x12,'ORA'],[0x32,'AND'],[0x52,'EOR'],[0x72,'ADC'],[0x92,'STA'],[0xB2,'LDA'],[0xD2,'CMP'],[0xF2,'SBC']], 'dpi');
def([[0x13,'ORA'],[0x33,'AND'],[0x53,'EOR'],[0x73,'ADC'],[0x93,'STA'],[0xB3,'LDA'],[0xD3,'CMP'],[0xF3,'SBC']], 'sriy');
def([[0x15,'ORA'],[0x16,'ASL'],[0x34,'BIT'],[0x35,'AND'],[0x36,'ROL'],[0x55,'EOR'],[0x56,'LSR'],[0x74,'STZ'],[0x75,'ADC'],[0x76,'ROR'],[0x94,'STY'],[0x95,'STA'],[0xB4,'LDY'],[0xB5,'LDA'],[0xD5,'CMP'],[0xD6,'DEC'],[0xF5,'SBC'],[0xF6,'INC']], 'dpx');
def([[0x96,'STX'],[0xB6,'LDX']], 'dpy');
def([[0x17,'ORA'],[0x37,'AND'],[0x57,'EOR'],[0x77,'ADC'],[0x97,'STA'],[0xB7,'LDA'],[0xD7,'CMP'],[0xF7,'SBC']], 'dpily');
def([[0x19,'ORA'],[0x39,'AND'],[0x59,'EOR'],[0x79,'ADC'],[0x99,'STA'],[0xB9,'LDA'],[0xBE,'LDX'],[0xD9,'CMP'],[0xF9,'SBC']], 'absy');
def([[0x1D,'ORA'],[0x1E,'ASL'],[0x3C,'BIT'],[0x3D,'AND'],[0x3E,'ROL'],[0x5D,'EOR'],[0x5E,'LSR'],[0x7D,'ADC'],[0x7E,'ROR'],[0x9D,'STA'],[0x9E,'STZ'],[0xBC,'LDY'],[0xBD,'LDA'],[0xDD,'CMP'],[0xDE,'DEC'],[0xFD,'SBC'],[0xFE,'INC']], 'absx');
def([[0x1F,'ORA'],[0x3F,'AND'],[0x5F,'EOR'],[0x7F,'ADC'],[0x9F,'STA'],[0xBF,'LDA'],[0xDF,'CMP'],[0xFF,'SBC']], 'longx');
def([[0x6C,'JMP']], 'absi');
def([[0x7C,'JMP'],[0xFC,'JSR']], 'absxi');
def([[0xDC,'JML']], 'absil');
def([[0x44,'MVP'],[0x54,'MVN']], 'move');
def([[0x62,'PER']], 'rell');
def([[0xD4,'PEI']], 'dpi');
def([[0xF4,'PEA']], 'abs');
def([[0x42,'WDM']], 'imm8');
export const OPS = T;
const LEN = { sig: 2, dpxi: 2, sr: 2, dp: 2, dpil: 2, imp: 1, imm8: 2, abs: 3, absj: 3, long: 4, longj: 4, rel: 2, rell: 3, dpiy: 2, dpi: 2, sriy: 2, dpx: 2, dpy: 2, dpily: 2, absy: 3, absx: 3, longx: 4, absi: 3, absxi: 3, absil: 3, move: 3 };
export function length(op, m, x) {
  const e = T[op]; if (!e) return 1;
  if (e.mode === 'immm') return m ? 2 : 3;
  if (e.mode === 'immx') return x ? 2 : 3;
  return LEN[e.mode];
}
const h2 = v => v.toString(16).toUpperCase().padStart(2, '0');
const h4 = v => v.toString(16).toUpperCase().padStart(4, '0');
const h6 = v => v.toString(16).toUpperCase().padStart(6, '0');
// Decode at 24-bit address pc using read(addr) for bytes. m/x are booleans (true = 8-bit).
export function decode(read, pc, m, x) {
  const op = read(pc), e = T[op] || { name: '???', mode: 'imp' };
  const n = length(op, m, x), b = [];
  for (let i = 1; i < n; i++) b.push(read(((pc & 0xff0000) | ((pc + i) & 0xffff))));
  const w = b.length >= 2 ? b[0] | (b[1] << 8) : 0, l = b.length >= 3 ? w | (b[2] << 16) : 0;
  let text, target = null;
  switch (e.mode) {
    case 'imp': text = ''; break;
    case 'sig': case 'imm8': text = `#$${h2(b[0])}`; break;
    case 'immm': case 'immx': text = n === 2 ? `#$${h2(b[0])}` : `#$${h4(w)}`; break;
    case 'dp': text = `$${h2(b[0])}`; break;
    case 'dpx': text = `$${h2(b[0])},X`; break;
    case 'dpy': text = `$${h2(b[0])},Y`; break;
    case 'dpxi': text = `($${h2(b[0])},X)`; break;
    case 'dpi': text = `($${h2(b[0])})`; break;
    case 'dpiy': text = `($${h2(b[0])}),Y`; break;
    case 'dpil': text = `[$${h2(b[0])}]`; break;
    case 'dpily': text = `[$${h2(b[0])}],Y`; break;
    case 'sr': text = `$${h2(b[0])},S`; break;
    case 'sriy': text = `($${h2(b[0])},S),Y`; break;
    case 'abs': text = `$${h4(w)}`; break;
    case 'absj': text = `$${h4(w)}`; target = (pc & 0xff0000) | w; break;
    case 'absx': text = `$${h4(w)},X`; break;
    case 'absy': text = `$${h4(w)},Y`; break;
    case 'absi': text = `($${h4(w)})`; break;
    case 'absxi': text = `($${h4(w)},X)`; break;
    case 'absil': text = `[$${h4(w)}]`; break;
    case 'long': text = `$${h6(l)}`; break;
    case 'longj': text = `$${h6(l)}`; target = l; break;
    case 'longx': text = `$${h6(l)},X`; break;
    case 'rel': { const t = (pc & 0xff0000) | ((pc + 2 + ((b[0] << 24) >> 24)) & 0xffff); text = `$${h4(t & 0xffff)}`; target = t; break; }
    case 'rell': { const t = (pc & 0xff0000) | ((pc + 3 + ((w << 16) >> 16)) & 0xffff); text = `$${h4(t & 0xffff)}`; target = t; break; }
    case 'move': text = `$${h2(b[1])},$${h2(b[0])}`; break;
    default: text = '';
  }
  return { op, name: e.name, mode: e.mode, len: n, bytes: [op, ...b], text, target };
}
// HiROM address helpers. With size > 4 MiB (the 64 Mbit ExHiROM cartridge)
// banks 00-3F and 40-7D read the second 4 MiB (extended data lives in the
// lower halves of 40-7D); otherwise they mirror C0-FF.
export function hiromToPc(addr, size = 0x400000) {
  const bank = (addr >> 16) & 0xff, a = addr & 0xffff, ext = size > 0x400000 ? 0x400000 : 0;
  if (bank >= 0xc0) return ((bank - 0xc0) << 16) | a;
  if (bank >= 0x40 && bank < 0x7e) return ext + (((bank - 0x40) << 16) | a);
  if (bank >= 0x80 && bank < 0xc0 && a >= 0x8000) return ((bank & 0x3f) << 16) | a;
  if (bank < 0x40 && a >= 0x8000) return ext + ((bank << 16) | a);
  return -1;
}
export const hex = { h2, h4, h6 };
