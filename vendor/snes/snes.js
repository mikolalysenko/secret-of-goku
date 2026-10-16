
function Snes() {

  this.cpu = new Cpu(this);

  this.ppu = new Ppu(this);

  this.apu = new Apu(this);
  // The unhooked APU step (catchUpApu batches it only while unchanged).
  const apuCoreCycle = this.apu.cycle;
  const spcCoreCycle = this.apu.spc?.cycle;

  this.ram = new Uint8Array(0x20000);

  this.cart = undefined;

  this.dmaOffs = [
    0, 0, 0, 0,
    0, 1, 0, 1,
    0, 0, 0, 0,
    0, 0, 1, 1,
    0, 1, 2, 3,
    0, 1, 0, 1,
    0, 0, 0, 0,
    0, 0, 1, 1
  ]

  this.dmaOffLengths = [1, 2, 2, 4, 4, 4, 2, 4];

  this.apuCyclesPerMaster = (32040 * 32) / (1364 * 262 * 60);

  // for dma
  this.dmaBadr = new Uint8Array(8);
  this.dmaAadr = new Uint16Array(8);
  this.dmaAadrBank = new Uint8Array(8);
  this.dmaSize = new Uint16Array(8);
  this.hdmaIndBank = new Uint8Array(8);
  this.hdmaTableAdr = new Uint16Array(8);
  this.hdmaRepCount = new Uint8Array(8);
  this.dmaUnusedByte = new Uint8Array(8);

  this.reset = function(hard) {
    if(hard) {
      clearArray(this.ram);
    }
    clearArray(this.dmaBadr);
    clearArray(this.dmaAadr);
    clearArray(this.dmaAadrBank);
    clearArray(this.dmaSize);
    clearArray(this.hdmaIndBank);
    clearArray(this.hdmaTableAdr);
    clearArray(this.hdmaRepCount);
    clearArray(this.dmaUnusedByte);

    this.cpu.reset();
    this.ppu.reset();
    this.apu.reset();
    if(this.cart) {
      this.cart.reset(hard);
    }

    this.xPos = 0;
    this.yPos = 0;
    this.frames = 0;

    this.cpuCyclesLeft = 5 * 8 + 12; // reset: 5 read cycles + 2 IO cycles
    this.cpuMemOps = 0;
    this.apuCatchCycles = 0;

    // for cpu-ports
    this.ramAdr = 0;

    this.hIrqEnabled = false;
    this.vIrqEnabled = false;
    this.nmiEnabled = false;
    this.hTimer = 0x1ff;
    this.vTimer = 0x1ff;
    this.inNmi = false;
    this.inIrq = false;
    this.inHblank = false;
    this.inVblank = false;

    this.autoJoyRead = false;
    this.autoJoyTimer = 0;
    this.ppuLatch = true;

    this.joypad1Val = 0;
    this.joypad2Val = 0;
    this.joypad1AutoRead = 0;
    this.joypad2AutoRead = 0;
    this.joypadStrobe = false;
    this.joypad1State = 0; // current button state
    this.joypad2State = 0; // current button state

    this.multiplyA = 0xff;
    this.divA = 0xffff;
    this.divResult = 0x101;
    this.mulResult = 0xfe01;

    this.fastMem = false;

    // dma and hdma
    this.dmaTimer = 0;
    this.hdmaTimer = 0;
    this.dmaBusy = false;
    this.dmaActive = [false, false, false, false, false, false, false, false];
    this.hdmaActive = [false, false, false, false, false, false, false, false];

    this.dmaMode = [0, 0, 0, 0, 0, 0, 0, 0];
    this.dmaFixed = [false, false, false, false, false, false, false, false];
    this.dmaDec = [false, false, false, false, false, false, false, false];
    this.hdmaInd = [false, false, false, false, false, false, false, false];
    this.dmaFromB = [false, false, false, false, false, false, false, false];
    this.dmaUnusedBit = [false, false, false, false, false, false, false, false];

    this.hdmaDoTransfer = [
      false, false, false, false, false, false, false, false
    ];
    this.hdmaTerminated = [
      false, false, false, false, false, false, false, false
    ];
    this.dmaOffIndex = 0;

    this.openBus = 0;

  }
  this.reset();

  // cycle functions

  this.cycle = function(noPpu) {

    this.apuCatchCycles += (this.apuCyclesPerMaster * 2);

    if(this.joypadStrobe) {
      this.joypad1Val = this.joypad1State;
      this.joypad2Val = this.joypad2State;
    }

    if(this.hdmaTimer > 0) {
      this.hdmaTimer -= 2;
    } else if(this.dmaBusy) {
      this.handleDma();
    } else if(this.xPos < 536 || this.xPos >= 576) {
      // the cpu is paused for 40 cycles starting around dot 536
      this.cpuCycle();
    }

    if(this.yPos === this.vTimer && this.vIrqEnabled) {
      if(!this.hIrqEnabled) {
        // only v irq enabed
        if(this.xPos === 0) {
          this.inIrq = true;
          this.cpu.irqWanted = true;
        }
      } else {
        // v and h irq enabled
        if(this.xPos === (this.hTimer * 4)) {
          this.inIrq = true;
          this.cpu.irqWanted = true;
        }
      }
    } else if (
      this.xPos === (this.hTimer * 4)
      && this.hIrqEnabled && !this.vIrqEnabled
    ) {
      // only h irq enabled
      this.inIrq = true;
      this.cpu.irqWanted = true;
    }

    if(this.xPos === 1024) {
      // start of hblank
      this.inHblank = true;
      if(!this.inVblank) {
        this.handleHdma();
      }
    } else if(this.xPos === 0) {
      // end of hblank
      this.inHblank = false;
      // check if the ppu will render a 239-high frame or not
      this.ppu.checkOverscan(this.yPos);
    } else if(this.xPos === 512 && !noPpu) {
      // render line at cycle 512 for better support
      this.ppu.renderLine(this.yPos);
    }

    if(this.yPos === (this.ppu.frameOverscan ? 240 : 225) && this.xPos === 0) {
      // start of vblank
      this.inNmi = true;
      this.inVblank = true;
      if(this.autoJoyRead) {
        this.autoJoyTimer = 4224;
        this.doAutoJoyRead();
      }
      if(this.nmiEnabled) {
        this.cpu.nmiWanted = true;
      }
    } else if(this.yPos === 0 && this.xPos === 0) {
      // end of vblank
      this.inNmi = false;
      this.inVblank = false;
      this.initHdma();
    }

    if(this.autoJoyTimer > 0) {
      this.autoJoyTimer -= 2; // loop only runs every second master cycle
    }

    // TODO: in non-intelace mode, line 240 on every odd frame is 1360 cycles
    // and in interlace mode, every even frame is 263 lines
    this.xPos += 2;
    if(this.xPos === 1364) {
      this.xPos = 0;
      this.yPos++;
      if(this.yPos === 262) {
        // when finishing a frame, also catch up the apu
        this.catchUpApu();
        this.yPos = 0;
        this.frames++;
      }
    }
  }

  this.cpuCycle = function() {
    if(this.cpuCyclesLeft === 0) {
      this.cpu.cyclesLeft = 0;
      this.cpuMemOps = 0;
      this.cpu.gatedCycle();
      this.cpuCyclesLeft += (this.cpu.cyclesLeft + 1 - this.cpuMemOps) * 6;
    }
    this.cpuCyclesLeft -= 2;
  }

  this.catchUpApu = function() {
    let catchUpCycles = this.apuCatchCycles & 0xffffffff;
    let apu = this.apu;
    if(apu.cycle !== apuCoreCycle) {
      for(let i = 0; i < catchUpCycles; i++) {
        apu.cycle();
      }
    } else {
      // Between SPC instruction starts, DSP samples (every 32 cycles) and
      // timer ticks, apu.cycle() only counts down; apply such runs at once.
      let spc = apu.spc, left = catchUpCycles;
      while(left > 0) {
        let n = spc.cyclesLeft;
        let dsp = (32 - (apu.cycles & 0x1f)) & 0x1f;
        if(dsp < n) {
          n = dsp;
        }
        if(apu.timer1int < n) {
          n = apu.timer1int;
        }
        if(apu.timer2int < n) {
          n = apu.timer2int;
        }
        if(apu.timer3int < n) {
          n = apu.timer3int;
        }
        if(left < n) {
          n = left;
        }
        if(n <= 0) {
          if(
            spc.cyclesLeft === 0 && dsp !== 0 && apu.timer1int > 0 &&
            apu.timer2int > 0 && apu.timer3int > 0 && spc.cycle === spcCoreCycle
          ) {
            // Only an SPC instruction starts: apu.cycle() without the DSP or
            // timer events (instructions never touch the timer countdowns).
            spc.cycle();
            apu.timer1int--;
            apu.timer2int--;
            apu.timer3int--;
            apu.cycles++;
          } else {
            apu.cycle();
          }
          left--;
          continue;
        }
        spc.cyclesLeft -= n;
        apu.timer1int -= n;
        apu.timer2int -= n;
        apu.timer3int -= n;
        apu.cycles += n;
        left -= n;
      }
    }
    this.apuCatchCycles -= catchUpCycles;
  }

  // Advances master-cycle pairs that need none of cycle()'s dot events:
  // runs where the CPU is mid-instruction (or paused at dots 536-575) are
  // skipped in bulk, and a pair that only starts the next CPU instruction
  // runs inline. Stops before any pair with (H)DMA activity, an IRQ, HDMA,
  // render or line event; returns the number of pairs advanced (0 means
  // cycle() must run next). State afterwards is identical to calling
  // cycle() that many times.
  this.skipIdleCycles = function() {
    let advanced = 0;
    let step = this.apuCyclesPerMaster * 2;
    for(;;) {
      let x = this.xPos;
      if(
        x === 0 || x === 512 || x === 1024 || x === 1362 ||
        x === this.hTimer * 4
      ) {
        return advanced;
      }
      if(this.hdmaTimer > 0 || this.dmaBusy) {
        // (H)DMA wait pairs only count their timer down; the CPU is halted.
        let hdma = this.hdmaTimer > 0;
        if(!hdma && this.handleDma !== coreHandleDma) {
          return advanced;
        }
        let timer = hdma ? this.hdmaTimer : this.dmaTimer;
        let end = x < 512 ? 512 : x < 1024 ? 1024 : 1362;
        let hPos = this.hTimer * 4;
        if(hPos > x && hPos < end) {
          end = hPos;
        }
        let n = (end - x) >> 1;
        if((timer >> 1) < n) {
          n = timer >> 1;
        }
        if(n <= 0) {
          return advanced;
        }
        if(hdma) {
          this.hdmaTimer -= n * 2;
        } else {
          this.dmaTimer -= n * 2;
        }
        let apu = this.apuCatchCycles;
        for(let i = 0; i < n; i++) {
          apu += step;
        }
        this.apuCatchCycles = apu;
        if(this.joypadStrobe) {
          this.joypad1Val = this.joypad1State;
          this.joypad2Val = this.joypad2State;
        }
        for(let i = 0; i < n && this.autoJoyTimer > 0; i++) {
          this.autoJoyTimer -= 2;
        }
        this.xPos = x + n * 2;
        advanced += n;
        continue;
      }
      let cpuRuns = x < 536 || x >= 576;
      if(cpuRuns && this.cpuCyclesLeft === 0) {
        // cycle() for a plain dot that starts an instruction.
        this.apuCatchCycles += step;
        if(this.joypadStrobe) {
          this.joypad1Val = this.joypad1State;
          this.joypad2Val = this.joypad2State;
        }
        this.cpuCycle();
        // The instruction may have moved the H-IRQ dot onto this one.
        if(x === this.hTimer * 4) {
          if(this.yPos === this.vTimer && this.vIrqEnabled) {
            if(this.hIrqEnabled) {
              this.inIrq = true;
              this.cpu.irqWanted = true;
            }
          } else if(this.hIrqEnabled && !this.vIrqEnabled) {
            this.inIrq = true;
            this.cpu.irqWanted = true;
          }
        }
        if(this.autoJoyTimer > 0) {
          this.autoJoyTimer -= 2;
        }
        this.xPos = x + 2;
        advanced++;
        continue;
      }
      let end = x < 512 ? 512 : x < 1024 ? 1024 : 1362;
      if(x < 536 && end > 536) {
        end = 536;
      } else if(x >= 536 && x < 576) {
        end = 576;
      }
      let hPos = this.hTimer * 4;
      if(hPos > x && hPos < end) {
        end = hPos;
      }
      let n = (end - x) >> 1;
      if(cpuRuns) {
        let left = this.cpuCyclesLeft >> 1;
        if(left < n) {
          n = left;
        }
        this.cpuCyclesLeft -= n * 2;
      }
      if(n <= 0) {
        return advanced;
      }
      // Repeated addition keeps the APU catch-up float bit-identical.
      let apu = this.apuCatchCycles;
      for(let i = 0; i < n; i++) {
        apu += step;
      }
      this.apuCatchCycles = apu;
      if(this.joypadStrobe) {
        this.joypad1Val = this.joypad1State;
        this.joypad2Val = this.joypad2State;
      }
      for(let i = 0; i < n && this.autoJoyTimer > 0; i++) {
        this.autoJoyTimer -= 2;
      }
      this.xPos = x + n * 2;
      advanced += n;
    }
  }

  this.runFrame = function(noPpu) {
    do {
      if(this.skipIdleCycles() === 0) {
        this.cycle(noPpu);
      }
    } while(!(this.xPos === 0 && this.yPos === 0));
    //log("apu position: " + this.apu.dsp.sampleOffset);
  }

  this.doAutoJoyRead = function() {
    this.joypad1AutoRead = 0;
    this.joypad2AutoRead = 0;
    this.joypad1Val = this.joypad1State;
    this.joypad2Val = this.joypad2State;
    for(let i = 0; i < 16; i++) {
      let bit = this.joypad1Val & 0x1;
      this.joypad1Val >>= 1;
      this.joypad1Val |= 0x8000;
      this.joypad1AutoRead |= (bit << (15 - i));
      bit = this.joypad2Val & 0x1;
      this.joypad2Val >>= 1;
      this.joypad2Val |= 0x8000;
      this.joypad2AutoRead |= (bit << (15 - i));
    }
  }

  this.handleDma = function() {
    if(this.dmaTimer > 0) {
      this.dmaTimer -= 2;
      return;
    }
    // loop over each dma channel to find the first active one
    let i;
    for(i = 0; i < 8; i++) {
      if(this.dmaActive[i]) {
        break;
      }
    }
    if(i === 8) {
      // no active channel left, dma is done
      this.dmaBusy = false;
      this.dmaOffIndex = 0;
      //log("Finished DMA");
      return;
    }
    let tableOff = this.dmaMode[i] * 4 + this.dmaOffIndex++;
    this.dmaOffIndex &= 0x3;
    if(this.dmaFromB[i]) {
      this.write(
        (this.dmaAadrBank[i] << 16) | this.dmaAadr[i],
        this.readBBus(
          (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff
        ), true
      );
    } else {
      this.writeBBus(
        (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff,
        this.read((this.dmaAadrBank[i] << 16) | this.dmaAadr[i], true)
      );
    }
    this.dmaTimer += 6;
    // because this run through the function itself also costs 2 master cycles,
    // we have to wait 6 more to get to 8 per byte transferred
    if(!this.dmaFixed[i]) {
      if(this.dmaDec[i]) {
        this.dmaAadr[i]--;
      } else {
        this.dmaAadr[i]++;
      }
    }
    this.dmaSize[i]--;
    if(this.dmaSize[i] === 0) {
      this.dmaOffIndex = 0;
      this.dmaActive[i] = false;
      this.dmaTimer += 8; // 8 extra cycles overhead per channel
    }
  }
  // The unhooked DMA step (skipIdleCycles batches its wait pairs only then).
  const coreHandleDma = this.handleDma;

  this.initHdma = function() {
    this.hdmaTimer = 18;
    for(let i = 0; i < 8; i++) {
      this.hdmaTerminated[i] = false;
      if(this.hdmaActive[i]) {
        // terminate DMA if it was busy for this channel
        this.dmaActive[i] = false;
        this.dmaOffIndex = 0;

        this.hdmaTableAdr[i] = this.dmaAadr[i];
        this.hdmaRepCount[i] = this.read(
          (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
        );
        this.hdmaTimer += 8;
        if(this.hdmaInd[i]) {
          this.dmaSize[i] = this.read(
            (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
          );
          this.dmaSize[i] |= this.read(
            (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
          ) << 8;
          this.hdmaTimer += 16;
        }
        // A zero first line count terminates the table immediately.
        this.hdmaTerminated[i] = this.hdmaRepCount[i] === 0;
        this.hdmaDoTransfer[i] = !this.hdmaTerminated[i];
      } else {
        this.hdmaDoTransfer[i] = false;
        // This instruction-timed core can finish an NMI after line 0. Do not
        // run a channel that missed setup: its stale zero counter would wrap
        // to 255 and stream unrelated RAM into PPU registers. The next frame
        // initializes the newly enabled table normally.
        this.hdmaTerminated[i] = true;
      }
    }
  }

  this.handleHdma = function() {
    this.hdmaTimer = 18;
    for(let i = 0; i < 8; i++) {
      if(this.hdmaActive[i] && !this.hdmaTerminated[i]) {
        // terminate dma if it is busy on this channel
        this.dmaActive[i] = false;
        // this.dmaOffIndex = 0;
        this.hdmaTimer += 8;
        if(this.hdmaDoTransfer[i]) {
          for(let j = 0; j < this.dmaOffLengths[this.dmaMode[i]]; j++) {
            let tableOff = this.dmaMode[i] * 4 + j;
            this.hdmaTimer += 8;
            if(this.hdmaInd[i]) {
              if(this.dmaFromB[i]) {
                this.write(
                  (this.hdmaIndBank[i] << 16) | this.dmaSize[i],
                  this.readBBus(
                    (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff
                  ), true
                );
              } else {
                this.writeBBus(
                  (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff,
                  this.read((this.hdmaIndBank[i] << 16) | this.dmaSize[i], true)
                );
              }
              this.dmaSize[i]++
            } else {
              if(this.dmaFromB[i]) {
                this.write(
                  (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i],
                  this.readBBus(
                    (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff
                  ), true
                );
              } else {
                this.writeBBus(
                  (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff,
                  this.read(
                    (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i], true
                  )
                );
              }
              this.hdmaTableAdr[i]++;
            }
          }
        }
        this.hdmaRepCount[i]--;
        this.hdmaDoTransfer[i] = (this.hdmaRepCount[i] & 0x80) > 0;
        if((this.hdmaRepCount[i] & 0x7f) === 0) {
          this.hdmaRepCount[i] = this.read(
            (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
          );
          if(this.hdmaInd[i]) {
            this.dmaSize[i] = this.read(
              (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
            );
            this.dmaSize[i] |= this.read(
              (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
            ) << 8;
            this.hdmaTimer += 16;
          }
          if(this.hdmaRepCount[i] === 0) {
            this.hdmaTerminated[i] = true;
          }
          this.hdmaDoTransfer[i] = true;
        }
      }
    }
  }

  // read and write handlers

  this.readReg = function(adr) {
    switch(adr) {
      case 0x4210: {
        let val = 0x2;
        val |= this.inNmi ? 0x80 : 0;
        val |= this.openBus & 0x70;
        this.inNmi = false;
        return val;
      }
      case 0x4211: {
        let val = this.inIrq ? 0x80 : 0;
        val |= this.openBus & 0x7f;
        this.inIrq = false;
        this.cpu.irqWanted = false;
        return val;
      }
      case 0x4212: {
        let val = (this.autoJoyTimer > 0) ? 0x1 : 0;
        val |= this.inHblank ? 0x40 : 0;
        val |= this.inVblank ? 0x80 : 0;
        val |= this.openBus & 0x3e;
        return val;
      }
      case 0x4213: {
        // IO read register
        return this.ppuLatch ? 0x80 : 0;
      }
      case 0x4214: {
        return this.divResult & 0xff;
      }
      case 0x4215: {
        return (this.divResult & 0xff00) >> 8;
      }
      case 0x4216: {
        return this.mulResult & 0xff;
      }
      case 0x4217: {
        return (this.mulResult & 0xff00) >> 8;
      }
      case 0x4218: {
        return this.joypad1AutoRead & 0xff;
      }
      case 0x4219: {
        return (this.joypad1AutoRead & 0xff00) >> 8;
      }
      case 0x421a: {
        return this.joypad2AutoRead & 0xff;
      }
      case 0x421b: {
        return (this.joypad2AutoRead & 0xff00) >> 8;
      }
      case 0x421c:
      case 0x421d:
      case 0x421e:
      case 0x421f: {
        // joypads 3 and 4 not emulated
        return 0;
      }
    }

    if(adr >= 0x4300 && adr < 0x4380) {
      let channel = (adr & 0xf0) >> 4;
      switch(adr & 0xff0f) {
        case 0x4300: {
          let val = this.dmaMode[channel];
          val |= this.dmaFixed[channel] ? 0x8 : 0;
          val |= this.dmaDec[channel] ? 0x10 : 0;
          val |= this.dmaUnusedBit[channel] ? 0x20 : 0;
          val |= this.hdmaInd[channel] ? 0x40 : 0;
          val |= this.dmaFromB[channel] ? 0x80 : 0;
          return val;
        }
        case 0x4301: {
          return this.dmaBadr[channel];
        }
        case 0x4302: {
          return this.dmaAadr[channel] & 0xff;
        }
        case 0x4303: {
          return (this.dmaAadr[channel] & 0xff00) >> 8;
        }
        case 0x4304: {
          return this.dmaAadrBank[channel];
        }
        case 0x4305: {
          return this.dmaSize[channel] & 0xff;
        }
        case 0x4306: {
          return (this.dmaSize[channel] & 0xff00) >> 8;
        }
        case 0x4307: {
          return this.hdmaIndBank[channel];
        }
        case 0x4308: {
          return this.hdmaTableAdr[channel] & 0xff;
        }
        case 0x4309: {
          return (this.hdmaTableAdr[channel] & 0xff00) >> 8;
        }
        case 0x430a: {
          return this.hdmaRepCount[channel];
        }
        case 0x430b:
        case 0x430f: {
          return this.dmaUnusedByte[channel];
        }
      }
    }

    return this.openBus;
  }

  this.writeReg = function(adr, value) {
    switch(adr) {
      case 0x4200: {
        this.autoJoyRead = (value & 0x1) > 0;
        if(!this.autoJoyRead) {
          this.autoJoyTimer = 0;
        }
        this.hIrqEnabled = (value & 0x10) > 0;
        this.vIrqEnabled = (value & 0x20) > 0;
        this.nmiEnabled = (value & 0x80) > 0;
        if(!this.hIrqEnabled && !this.vIrqEnabled) {
          this.cpu.irqWanted = false;
          this.inIrq = false;
        }
        return;
      }
      case 0x4201: {
        // IO port
        if(this.ppuLatch && (value & 0x80) === 0) {
          this.ppu.latchedHpos = this.xPos >> 2;
          this.ppu.latchedVpos = this.yPos;
          this.ppu.countersLatched = true;
        }
        this.ppuLatch = (value & 0x80) > 0;
        return;
      }
      case 0x4202: {
        this.multiplyA = value;
        return;
      }
      case 0x4203: {
        this.mulResult = this.multiplyA * value;
        return;
      }
      case 0x4204: {
        this.divA = (this.divA & 0xff00) | value;
        return;
      }
      case 0x4205: {
        this.divA = (this.divA & 0xff) | (value << 8);
        return;
      }
      case 0x4206: {
        this.divResult = 0xffff;
        this.mulResult = this.divA;
        if(value !== 0) {
          this.divResult = (this.divA / value) & 0xffff;
          this.mulResult = this.divA % value;
        }
        return;
      }
      case 0x4207: {
        this.hTimer = (this.hTimer & 0x100) | value;
        return;
      }
      case 0x4208: {
        this.hTimer = (this.hTimer & 0xff) | ((value & 0x1) << 8);
        return;
      }
      case 0x4209: {
        this.vTimer = (this.vTimer & 0x100) | value;
        return;
      }
      case 0x420a: {
        this.vTimer = (this.vTimer & 0xff) | ((value & 0x1) << 8);
        return;
      }
      case 0x420b: {
        // enable dma
        this.dmaActive[0] = (value & 0x1) > 0;
        this.dmaActive[1] = (value & 0x2) > 0;
        this.dmaActive[2] = (value & 0x4) > 0;
        this.dmaActive[3] = (value & 0x8) > 0;
        this.dmaActive[4] = (value & 0x10) > 0;
        this.dmaActive[5] = (value & 0x20) > 0;
        this.dmaActive[6] = (value & 0x40) > 0;
        this.dmaActive[7] = (value & 0x80) > 0;
        this.dmaBusy = value > 0;
        this.dmaTimer += this.dmaBusy ? 8 : 0;
        return;
      }
      case 0x420c: {
        this.hdmaActive[0] = (value & 0x1) > 0;
        this.hdmaActive[1] = (value & 0x2) > 0;
        this.hdmaActive[2] = (value & 0x4) > 0;
        this.hdmaActive[3] = (value & 0x8) > 0;
        this.hdmaActive[4] = (value & 0x10) > 0;
        this.hdmaActive[5] = (value & 0x20) > 0;
        this.hdmaActive[6] = (value & 0x40) > 0;
        this.hdmaActive[7] = (value & 0x80) > 0;
        return;
      }
      case 0x420d: {
        this.fastMem = (value & 0x1) > 0;
        return;
      }
    }

    if(adr >= 0x4300 && adr < 0x4380) {
      let channel = (adr & 0xf0) >> 4;
      switch(adr & 0xff0f) {
        case 0x4300: {
          this.dmaMode[channel] = value & 0x7;
          this.dmaFixed[channel] = (value & 0x08) > 0;
          this.dmaDec[channel] = (value & 0x10) > 0;
          this.dmaUnusedBit[channel] = (value & 0x20) > 0;
          this.hdmaInd[channel] = (value & 0x40) > 0;
          this.dmaFromB[channel] = (value & 0x80) > 0;
          return;
        }
        case 0x4301: {
          this.dmaBadr[channel] = value;
          return;
        }
        case 0x4302: {
          this.dmaAadr[channel] = (this.dmaAadr[channel] & 0xff00) | value;
          return;
        }
        case 0x4303: {
          this.dmaAadr[channel] = (this.dmaAadr[channel] & 0xff) | (value << 8);
          return;
        }
        case 0x4304: {
          this.dmaAadrBank[channel] = value;
          return;
        }
        case 0x4305: {
          this.dmaSize[channel] = (this.dmaSize[channel] & 0xff00) | value;
          return;
        }
        case 0x4306: {
          this.dmaSize[channel] = (this.dmaSize[channel] & 0xff) | (value << 8);
          return;
        }
        case 0x4307: {
          this.hdmaIndBank[channel] = value;
          return;
        }
        case 0x4308: {
          this.hdmaTableAdr[channel] = (
            this.hdmaTableAdr[channel] & 0xff00
          ) | value;
          return;
        }
        case 0x4309: {
          this.hdmaTableAdr[channel] = (
            this.hdmaTableAdr[channel] & 0xff
          ) | (value << 8);
          return;
        }
        case 0x430a: {
          this.hdmaRepCount[channel] = value;
          return;
        }
        case 0x430b:
        case 0x430f: {
          this.dmaUnusedByte[channel] = value;
          return;
        }
      }
    }
  }

  this.readBBus = function(adr) {
    if(adr > 0x33 && adr < 0x40) {
      return this.ppu.read(adr);
    }
    if(adr >= 0x40 && adr < 0x80) {
      // catch up the apu, then do the read
      this.catchUpApu();
      return this.apu.spcWritePorts[adr & 0x3];
    }
    if(adr === 0x80) {
      let val = this.ram[this.ramAdr++];
      this.ramAdr &= 0x1ffff;
      return val;
    }
    return this.openBus; // rest not readable
  }

  this.writeBBus = function(adr, value) {
    if(adr < 0x34) {
      this.ppu.write(adr, value);
      return;
    }
    if(adr >= 0x40 && adr < 0x80) {
      // catch up the apu, then do the write
      this.catchUpApu();
      this.apu.spcReadPorts[adr & 0x3] = value;
      return;
    }
    switch(adr) {
      case 0x80: {
        this.ram[this.ramAdr++] = value;
        this.ramAdr &= 0x1ffff;
        return;
      }
      case 0x81: {
        this.ramAdr = (this.ramAdr & 0x1ff00) | value;
        return;
      }
      case 0x82: {
        this.ramAdr = (this.ramAdr & 0x100ff) | (value << 8);
        return;
      }
      case 0x83: {
        this.ramAdr = (this.ramAdr & 0x0ffff) | ((value & 1) << 16);
        return;
      }
    }
    return;
  }

  this.rread = function(adr) {
    adr &= 0xffffff;
    let bank = adr >> 16;
    adr &= 0xffff;
    if(bank === 0x7e || bank === 0x7f) {
      // banks 7e and 7f
      return this.ram[((bank & 0x1) << 16) | adr];
    }
    if(adr < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
      // banks 00-3f, 80-bf, $0000-$7fff
      if(adr < 0x2000) {
        return this.ram[adr & 0x1fff];
      }
      if(adr >= 0x2100 && adr < 0x2200) {
        return this.readBBus(adr & 0xff);
      }
      // old-style controller reads
      if(adr === 0x4016) {
        let val = this.joypad1Val & 0x1;
        this.joypad1Val >>= 1;
        this.joypad1Val |= 0x8000;
        return val;
      }
      if(adr === 0x4017) {
        let val = this.joypad2Val & 0x1;
        this.joypad2Val >>= 1;
        this.joypad2Val |= 0x8000;
        return val;
      }
      if(adr >= 0x4200 && adr < 0x4380) {
        return this.readReg(adr);
      }
    }
    return this.cart.gatedRead(bank, adr);
  }

  this.read = function(adr, dma = false) {
    readSerial++;
    if(!dma) {
      this.cpuMemOps++;
      this.cpuCyclesLeft += this.getAccessTime(adr);
    }

    let val = this.rread(adr);
    this.openBus = val;
    return val;
  }

  // Number of core reads so far, for wrappers that track "the last read".
  let readSerial = 0;
  this.readSerial = function() {
    return readSerial;
  }

  // CPU reads (this.cpuRead) skip the snes.read wrapper chain unless a
  // wrapper registered the 16-bit offset as one it may act on; DMA reads
  // always go through this.read. Each wrapper registers mark(m), calling
  // m.offsets(lo, hi). An unregistered wrapper disables the bypass. The
  // tables live in the closure and are never serialized.
  const coreRead = this.read;
  const busBits = new Uint8Array(0x10000);
  const busHooks = new Map();
  let busHead = null;
  let busMiss = null;
  let busGateEnabled = true;
  this.registerBusReadHook = function(fn, previous, mark) {
    busHooks.set(fn, {previous: previous, mark: mark});
    busHead = null;
    busMiss = null;
  }
  this.setBusReadGate = function(enabled) {
    busGateEnabled = !!enabled;
  }
  const busMarker = {
    offsets: (lo, hi) => {
      busBits.fill(1, lo, hi);
    }
  };
  const rebuildBusGate = (head) => {
    busHead = null;
    let fn = head;
    busBits.fill(0);
    while(fn !== coreRead) {
      let hook = busHooks.get(fn);
      if(!hook) {
        return false;
      }
      hook.mark(busMarker);
      fn = hook.previous;
    }
    busHead = head;
    return true;
  };
  this.cpuRead = function(adr) {
    let fn = this.read;
    if(fn !== coreRead) {
      if(!busGateEnabled) {
        return fn.call(this, adr);
      }
      if(fn !== busHead && (fn === busMiss || !rebuildBusGate(fn))) {
        busMiss = fn;
        return fn.call(this, adr);
      }
      if(busBits[adr & 0xffff] === 1) {
        return fn.call(this, adr);
      }
    }
    // coreRead(adr) inlined for work RAM and ROM: the same access time,
    // mapping, read count and open bus. I/O and SRAM take the full path.
    adr &= 0xffffff;
    let bank = adr >> 16, low = adr & 0xffff, val;
    if(bank === 0x7e || bank === 0x7f) {
      this.cpuCyclesLeft += 8;
      val = this.ram[((bank & 0x1) << 16) | low];
    } else if(bank >= 0xc0) {
      this.cpuCyclesLeft += this.fastMem ? 6 : 8;
      val = this.cart.gatedRead(bank, low);
    } else if(bank >= 0x40 && bank < 0x80) {
      this.cpuCyclesLeft += 8;
      val = this.cart.gatedRead(bank, low);
    } else if(low < 0x2000) {
      this.cpuCyclesLeft += 8;
      val = this.ram[low & 0x1fff];
    } else if(low >= 0x8000) {
      this.cpuCyclesLeft += (this.fastMem && bank >= 0x80) ? 6 : 8;
      val = this.cart.gatedRead(bank, low);
    } else {
      return coreRead.call(this, adr);
    }
    readSerial++;
    this.cpuMemOps++;
    this.openBus = val;
    return val;
  }

  this.write = function(adr, value, dma = false) {
    if(!dma) {
      this.cpuMemOps++;
      this.cpuCyclesLeft += this.getAccessTime(adr);
    }

    this.openBus = value;
    adr &= 0xffffff;
    //log("Written $" + getByteRep(value) + " to $" + getLongRep(adr));
    let bank = adr >> 16;
    adr &= 0xffff;
    if(bank === 0x7e || bank === 0x7f) {
      // banks 7e and 7f
      this.ram[((bank & 0x1) << 16) | adr] = value;
    }
    if(adr < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
      // banks 00-3f, 80-bf, $0000-$7fff
      if(adr < 0x2000) {
        this.ram[adr & 0x1fff] = value;
      }
      if(adr >= 0x2100 && adr < 0x2200) {
        this.writeBBus(adr & 0xff, value);
      }
      if(adr === 0x4016) {
        this.joypadStrobe = (value & 0x1) > 0;
      }
      if(adr >= 0x4200 && adr < 0x4380) {
        this.writeReg(adr, value);
      }

    }
    this.cart.write(bank, adr, value);
  }

  // CPU writes (this.cpuWrite) skip the snes.write wrapper chain unless a
  // wrapper registered the 16-bit offset (m.offsets(lo, hi)); DMA writes
  // always use this.write. An unregistered wrapper disables the bypass.
  const coreWrite = this.write;
  const busWriteBits = new Uint8Array(0x10000);
  const busWriteHooks = new Map();
  let busWriteHead = null;
  let busWriteMiss = null;
  this.registerBusWriteHook = function(fn, previous, mark) {
    busWriteHooks.set(fn, {previous: previous, mark: mark});
    busWriteHead = null;
    busWriteMiss = null;
  }
  const busWriteMarker = {
    offsets: (lo, hi) => {
      busWriteBits.fill(1, lo, hi);
    }
  };
  const rebuildBusWriteGate = (head) => {
    busWriteHead = null;
    let fn = head;
    busWriteBits.fill(0);
    while(fn !== coreWrite) {
      let hook = busWriteHooks.get(fn);
      if(!hook) {
        return false;
      }
      hook.mark(busWriteMarker);
      fn = hook.previous;
    }
    busWriteHead = head;
    return true;
  };
  this.cpuWrite = function(adr, value) {
    let fn = this.write;
    if(fn !== coreWrite) {
      if(!busGateEnabled) {
        return fn.call(this, adr, value);
      }
      if(fn !== busWriteHead && (fn === busWriteMiss || !rebuildBusWriteGate(fn))) {
        busWriteMiss = fn;
        return fn.call(this, adr, value);
      }
      if(busWriteBits[adr & 0xffff] === 1) {
        return fn.call(this, adr, value);
      }
    }
    return coreWrite.call(this, adr, value);
  }

  this.getAccessTime = function(adr) {
    adr &= 0xffffff;
    let bank = adr >> 16;
    adr &= 0xffff;
    if(bank >= 0x40 && bank < 0x80) {
      // banks 0x40-0x7f, all slow
      return 8;
    }
    if(bank >= 0xc0) {
      // banks 0xc0-0xff, depends on speed
      return this.fastMem ? 6 : 8;
    }
    // banks 0x00-0x3f and 0x80-0xbf
    if(adr < 0x2000) {
      return 8; // slow
    }
    if(adr < 0x4000) {
      return 6; // fast
    }
    if(adr < 0x4200) {
      return 12; // extra slow
    }
    if(adr < 0x6000) {
      return 6; // fast
    }
    if(adr < 0x8000) {
      return 8; // slow
    }
    // 0x8000-0xffff, depends on fastrom setting if in banks 0x80+
    return (this.fastMem && bank >= 0x80) ? 6 : 8;

  }

  // getting audio and video out, controllers in

  this.setPixels = function(arr) {
    this.ppu.setPixels(arr);
  }

  this.setSamples = function(left, right, samples) {
    this.apu.setSamples(left, right, samples);
  }

  this.setPad1ButtonPressed = function(num) {
    this.joypad1State |= (1 << num);
  }

  this.setPad1ButtonReleased = function(num) {
    this.joypad1State &= (~(1 << num)) & 0xfff;
  }

  // rom loading and header parsing

  this.loadRom = function(rom, isHirom) {
    if(rom.length % 0x8000 === 0) {
      // no copier header
      header = this.parseHeader(rom, isHirom);
    } else if((rom.length - 512) % 0x8000 === 0) {
      // 512-byte copier header
      rom = new Uint8Array(Array.prototype.slice.call(rom, 512));
      header = this.parseHeader(rom, isHirom);
    } else {
      log("Failed to load rom: Incorrect size - " + rom.length);
      return false;
    }
    // if(header.type !== 0) {
    //   log("Failed to load rom: not LoRom, type = " + getByteRep(
    //     (header.speed << 4) | header.type
    //   ));
    //   return false;
    // }
    if(rom.length < header.romSize) {
      let extraData = rom.length - (header.romSize / 2);
      log("Extending rom to account for extra data");
      // extend the rom to end up at the correct size
      let nRom = new Uint8Array(header.romSize);
      for(let i = 0; i < nRom.length; i++) {
        if(i < (header.romSize / 2)) {
          nRom[i] = rom[i];
        } else {
          nRom[i] = rom[(header.romSize / 2) + (i % extraData)];
        }
      }
      rom = nRom;
    }
    this.cart = new Cart(rom, header, isHirom);
    return true;
  }

  this.parseHeader = function(rom, isHirom) {
    let str = "";
    let header;
    if(!isHirom) {
      for(let i = 0; i < 21; i++) {
        str += String.fromCharCode(rom[0x7fc0 + i]);
      }
      header = {
        name: str,
        type: rom[0x7fd5] & 0xf,
        speed: rom[0x7fd5] >> 4,
        chips: rom[0x7fd6],
        romSize: 0x400 << rom[0x7fd7],
        ramSize: 0x400 << rom[0x7fd8]
      };
    } else {
      for(let i = 0; i < 21; i++) {
        str += String.fromCharCode(rom[0xffc0 + i]);
      }
      header = {
        name: str,
        type: rom[0xffd5] & 0xf,
        speed: rom[0xffd5] >> 4,
        chips: rom[0xffd6],
        romSize: 0x400 << rom[0xffd7],
        ramSize: 0x400 << rom[0xffd8]
      };
    }
    if(header.romSize < rom.length) {
      // probably wrong header?
      // seems to help with snes test program and such
      let bankCount = Math.pow(2, Math.ceil(Math.log2(rom.length / 0x8000)));
      header.romSize = bankCount * 0x8000;
      log("Loaded with romSize of " + getLongRep(header.romSize));
    }
    return header;
  }

}
