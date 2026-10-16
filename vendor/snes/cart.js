
function Cart(data, header, isHirom) {
  this.header = header;
  this.data = data;

  this.isHirom = isHirom;

  this.sram = new Uint8Array(header.ramSize);
  this.hasSram = header.chips > 0;

  this.banks = header.romSize / 0x8000;
  this.sramSize = header.ramSize;
  log(
    "Loaded " + (this.isHirom ? "HiROM" : "LoROM") + " rom: \"" + header.name + "\"; " +
    "Banks: " + this.banks +
    "; Sram size: $" + getWordRep(this.hasSram ? this.sramSize : 0)
  );

  this.reset = function(hard) {
    if(hard) {
      clearArray(this.sram);
    }
  }
  this.reset();

  this.read = function(bank, adr) {
    if(!this.isHirom) {
      if(adr < 0x8000) {
        if(bank >= 0x70 && bank < 0x7e && this.hasSram) {
          // sram
          return this.sram[
            (((bank - 0x70) << 15) | (adr & 0x7fff)) & (this.sramSize - 1)
          ];
        }
      }
      return this.data[((bank & (this.banks - 1)) << 15) | (adr & 0x7fff)];
    } else {
      if(adr >= 0x6000 && adr < 0x8000 && this.hasSram) {
        if((bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
          // sram
          return this.sram[
            (((bank & 0x3f) << 13) | (adr & 0x1fff)) & (this.sramSize - 1)
          ]
        }
      }
      return this.data[(((bank & 0x3f) & (this.banks - 1)) << 16) | adr];
    }
  }

  // Read hooks replace this.read with wrappers that intercept a few ROM
  // ranges. Each registers mark(m), which flags the addresses it may change
  // via m.hirom(lo, hi) (offsets in banks $C0-$FF) or m.bank(b, lo, hi)
  // (bank b and its $40/$80/$C0 mirrors). gatedRead() bypasses the wrapper
  // chain elsewhere; an unregistered wrapper disables the gate. The tables
  // live in the closure and are never serialized.
  const coreRead = this.read;
  const watchBits = new Uint8Array(1 << 21);
  const readHooks = new Map();
  let readHead = null;
  let readMiss = null;
  const watch = (bank, lo, hi) => {
    for(let adr = lo; adr < hi; adr++) {
      let key = (bank << 16) | adr;
      watchBits[key >> 3] |= 1 << (key & 7);
    }
  };
  const marker = {
    hirom: (lo, hi) => {
      for(let off = lo; off < hi; off++) {
        watch(0xc0 | ((off >> 16) & 0x3f), off & 0xffff, (off & 0xffff) + 1);
      }
    },
    bank: (bank, lo, hi) => {
      for(let mirror = 0; mirror < 4; mirror++) {
        watch((bank & 0x3f) | (mirror << 6), lo, hi);
      }
    }
  };
  this.registerReadHook = function(fn, previous, mark) {
    readHooks.set(fn, {previous: previous, mark: mark});
    readHead = null;
    readMiss = null;
  }
  const rebuildReadGate = (head) => {
    let fn = head;
    watchBits.fill(0);
    while(fn !== coreRead) {
      let hook = readHooks.get(fn);
      if(!hook) {
        return false;
      }
      hook.mark(marker);
      fn = hook.previous;
    }
    readHead = head;
    return true;
  };
  let gateEnabled = true;
  this.setReadGate = function(enabled) {
    gateEnabled = !!enabled;
  }
  this.gatedRead = function(bank, adr) {
    let fn = this.read;
    if(fn === coreRead || !gateEnabled) {
      return fn.call(this, bank, adr);
    }
    if(fn !== readHead && (fn === readMiss || !rebuildReadGate(fn))) {
      readMiss = fn;
      return fn.call(this, bank, adr);
    }
    let key = (bank << 16) | adr;
    if((watchBits[key >> 3] & (1 << (key & 7))) !== 0) {
      return fn.call(this, bank, adr);
    }
    return coreRead.call(this, bank, adr);
  }

  this.write = function(bank, adr, value) {
    if(!this.isHirom) {
      if(adr < 0x8000 && bank >= 0x70 && bank < 0x7e && this.hasSram) {
        this.sram[
          (((bank - 0x70) << 15) | (adr & 0x7fff)) & (this.sramSize - 1)
        ] = value;
      }
    } else {
      if(adr >= 0x6000 && adr < 0x8000 && this.hasSram) {
        if((bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
          // sram
          this.sram[
            (((bank & 0x3f) << 13) | (adr & 0x1fff)) & (this.sramSize - 1)
          ] = value;
        }
      }
    }
  }
}
