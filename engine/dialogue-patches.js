/* Player-only dialogue edits for the original unheadered Secret of Mana US ROM.
 * Call after ROM identification and before snes.loadRom():
 *   const playable = window.gokuDialoguePatch(window.potosPatch(original));
 * Returns a new Uint8Array; never changes the supplied ROM. No event relocation.
 * The native font, name substitutions, NPC text, commands and pauses stay intact.
 */
(function () {
  'use strict';

  const patches = [
    {id:'sword-pull',event:0x103,eventStart:0x92613,eventEnd:0x927fe,offset:0x92691,
      original:':Urrrrrrrgh!',replacement:':Easy... Oh!',following:[0x28,0x10]},
    {id:'elliott-apology',event:0x10c,eventStart:0x92caf,eventEnd:0x93227,offset:0x9306a,
      original:':Hey! Stop it!',replacement:":I'm sorry!",following:[0x7f,0x9f,0xa6,0xa6]},
    {id:'mantis-aftermath',event:0x112,eventStart:0x932fa,eventEnd:0x93642,offset:0x9339f,
      original:':Huh? What?',replacement:':Too hard?',following:[0x28,0x00,0x7f]},
    {id:'sword-concern',event:0x112,eventStart:0x932fa,eventEnd:0x93642,offset:0x93450,
      original:":Here! It's yours!",replacement:':Did I break it?',following:[0x28,0x00,0x52]}
  ];

  // US native dialogue glyphs. Control codes (including newline $7F) are never
  // accepted here; the original event stream already owns their positions.
  function glyph(character) {
    const code=character.charCodeAt(0);
    if(character===' ')return 0x80;
    if(code>=0x61&&code<=0x7a)return code+0x20;
    if(code>=0x41&&code<=0x5a)return code+0x5a;
    if(code>=0x30&&code<=0x39)return code+0x85;
    const punctuation={'.':0xbf,',':0xc0,'/':0xc1,"'":0xc2,':':0xc5,'-':0xc6,'!':0xc8,'?':0xca};
    if(Object.hasOwn(punctuation,character))return punctuation[character];
    throw Error(`Unsupported native dialogue glyph: ${JSON.stringify(character)}`);
  }
  const encode=text=>Uint8Array.from(text,glyph);
  const matches=(rom,offset,bytes)=>bytes.every((value,index)=>rom[offset+index]===value);
  const word=(rom,offset)=>rom[offset]|rom[offset+1]<<8;

  for(const patch of patches){
    if(patch.replacement.length>patch.original.length)throw Error(`Dialogue exceeds original span: ${patch.id}`);
    patch.before=encode(patch.original);
    // $80 is the original font's ordinary blank glyph, not a control/NUL byte.
    patch.after=encode(patch.replacement.padEnd(patch.original.length,' '));
  }

  function gokuDialoguePatch(source) {
    if(!(source instanceof Uint8Array)||source.length!==0x200000){
      throw Error('Dialogue patches require an unheadered 2 MiB Secret of Mana US Uint8Array.');
    }
    for(const patch of patches){
      const table=0x90000+patch.event*2;
      if(0x90000+word(source,table)!==patch.eventStart||0x90000+word(source,table+2)!==patch.eventEnd){
        throw Error(`Unsupported ROM dialogue event table: ${patch.id}`);
      }
      if(!matches(source,patch.offset-2,[0x57,0x00])||
         !matches(source,patch.offset+patch.before.length,patch.following)||
         (!matches(source,patch.offset,patch.before)&&!matches(source,patch.offset,patch.after))){
        throw Error(`Original player dialogue differs: ${patch.id}`);
      }
    }
    // Uint8Array(source), rather than source.slice(), also copies Node Buffers.
    const result=new Uint8Array(source);
    for(const patch of patches)result.set(patch.after,patch.offset);
    return result;
  }

  // Review/debug metadata contains just the four selected lines, not event data.
  gokuDialoguePatch.patches=Object.freeze(patches.map(({before,after,following,...patch})=>Object.freeze(patch)));
  window.gokuDialoguePatch=gokuDialoguePatch;
})();
