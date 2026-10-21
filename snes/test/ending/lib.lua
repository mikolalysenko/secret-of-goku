-- Shared helpers for the ending module's Mesen tests.
E = {}
E.request = 0x7EDC80
E.phase   = 0x7EDC81
E.age     = 0x7EDC82
E.flags   = 0x7EDC84
E.done    = 0x7EDC86
E.status  = 0x7EDC88
E.sfx     = 0x7EDC89
E.SW = 0x4000             -- !SRAM_WORK_SCENE ($32:6000) as an SRAM offset
-- Mesen's screenshots show the picture of 5 frames earlier (measured at
-- the explosion's first white frame): a still for scene age a is taken at
-- a + 5 and recorded as a.
E.SHOT_LAG = 5
E.P = {transition=1, summon=2, dragon=3, wish=4, scatter=5, reunion=6, village=7,
       depart=8, kai=9, complete=10, doomed=11, explode=12, escape=13, fatal=14}
function E.sram16(off) return H.sram(E.SW + off) | (H.sram(E.SW + off + 1) << 8) end
function E.cue(name, flags)
  if flags then H.w16(E.flags, flags) end
  H.w8(E.request, E.P[name])
end
-- Wait for the phase to start and its art to finish loading: the phase
-- clock only advances once the scene is live.
function E.waitLoaded(name, frames)
  local p = E.P[name]
  H.wait(1)
  return H.waitFor(function()
    return H.r8(E.phase) == p and (H.r8(E.status) & 0x80) == 0 and H.r16(E.age) >= 1
  end, frames or 120)
end
-- The finale's states all have Goku: the persistent live block's active
-- flag lives in battery SRAM, which other suites' runs can leave cleared
-- (Mesen keeps one battery file per ROM name), and story's object-list
-- hooks only run with it set.
function E.import(bundle)
  E.watchDma()
  H.wait(20)
  H.importSnesJs('/Users/mikolalysenko/Projects/secret-of-goku/.local/snes-import/' .. bundle)
  H.w8(0x316001, 1)
  H.wait(3)
end

-- Vblank overrun monitor: the field NMI re-enables the display at 00:C164;
-- if that happens in the next frame, the top lines are black and, worse,
-- its HDMAEN write came after that frame's HDMA start, so the frame shows
-- no HDMA (core_hdmaen_write). Counts frames that overran past line
-- `slack` while armed (0: any end in the next frame, including line 0).
E.overruns = 0
E.overrunMax = 0
E.overrunAt = {}
E.watchArmed = false
function E.watchVblank(slack)
  slack = slack or 1
  local function checkEnd()
    if not E.watchArmed then return end
    local line = emu.getState()['ppu.scanline']
    H.result('vblank_end_max', math.max(E.vblankEndMax or 0, line))
    E.vblankEndMax = math.max(E.vblankEndMax or 0, line)
    if line < 225 and line >= slack then
      E.overruns = E.overruns + 1
      if line > E.overrunMax then E.overrunMax = line end
      if #E.overrunAt < 16 then
        E.overrunAt[#E.overrunAt + 1] = string.format('p%d a%d l%d', H.r8(E.phase), H.r16(E.age), line)
      end
    end
  end
  emu.addMemoryCallback(checkEnd,emu.callbackType.exec,0x00C164,0x00C164)
  emu.addMemoryCallback(checkEnd,emu.callbackType.exec,0x80C164,0x80C164)
end
-- Arm only while the scene is visible (not loading).
function E.arm(on) E.watchArmed = on end

-- The module's DMA triggers (run.mjs passes DMA_TRIGGERS, the addresses
-- of their STA $420B): channel 7's size must never be 0 there (a vblank
-- NMI that reprogrammed the channel in the middle of the set-up would make
-- it copy 64 KiB over WRAM), and none may start on a visible line while an
-- HDMA channel is enabled (revision-1 S-CPUs can hang when HDMA runs
-- during a general DMA). Armed once per run, from the first import.
E.dmaTriggers, E.dmaBad, E.dmaHdma = 0, 0, 0
local dmaArmed = false
function E.watchDma()
  if dmaArmed or not DMA_TRIGGERS then return end
  dmaArmed = true
  for _, a in ipairs(DMA_TRIGGERS) do
    emu.addMemoryCallback(function()
      E.dmaTriggers = E.dmaTriggers + 1
      local st = emu.getState()
      local target = H.r8(0x4371)
      if st['ppu.scanline'] < 225 and not st['ppu.forcedBlank'] and (target == 0x18 or target == 0x19 or target == 0x22 or target == 0x04) then
        E.dmaPpu = (E.dmaPpu or 0) + 1
        H.result('dma_ppu', E.dmaPpu)
      end
      if st['ppu.scanline'] < 225 and st['dmaController.hdmaChannels'] ~= 0 then
        E.dmaHdma = E.dmaHdma + 1
        H.result('dma_hdma', E.dmaHdma)
        H.result('dma_hdma_at', string.format('%06X line %d HDMAEN %02X', a, st['ppu.scanline'], st['dmaController.hdmaChannels']))
      end
      if st['dmaController.channel[7].transferSize'] == 0 then
        E.dmaBad = E.dmaBad + 1
        H.result('dma_bad', E.dmaBad)
        H.result('dma_bad_at', string.format('%06X line %d', a, emu.getState()['ppu.scanline']))
      end
      H.result('dma_triggers', E.dmaTriggers)
    end, emu.callbackType.exec, a, a)
  end
end

-- Calls into the audio module (run.mjs passes AUDIO_SFX / AUDIO_FADE, the
-- entry addresses): 'sfx<id>@<age>' and 'fade<byte>@<age>' while armed.
E.audio = {}
E.audioArmed = false
function E.watchAudio()
  local function hook(addr, kind, fmt)
    if not addr then return end
    emu.addMemoryCallback(function()
      if E.audioArmed and #E.audio < 64 then
        E.audio[#E.audio + 1] = string.format(fmt, emu.getState()['cpu.a'] & 0xFF, H.r16(E.age))
      end
    end, emu.callbackType.exec, addr, addr)
  end
  hook(AUDIO_SFX, 'sfx', 'sfx%d@%d')
  hook(AUDIO_FADE, 'fade', 'fade%02X@%d')
  E.audioArmed = true
end
function E.audioResult() H.result('audio', table.concat(E.audio, ' ')) end

-- A still of scene age (now - SHOT_LAG), recorded under its name.
function E.shot(name)
  local age = H.r16(E.age) - E.SHOT_LAG
  H.shot(name)
  H.result(name, age)
end
function E.waitAge(n, limit)
  return H.waitFor(function() return H.r16(E.age) >= n end, limit or 400)
end
-- A still of exactly scene age n: the clock is held at n for `hold` frames
-- (Mesen's screenshot trails the emulation by a varying 2-5 frames), the
-- picture taken, the clock released.
function E.still(name, n, hold)
  E.waitAge(n, 600)
  for _ = 1, (hold or 14) do
    H.w16(E.age, n)
    H.wait(1)
  end
  H.w16(E.age, n)
  H.shot(name)
  H.result(name, n)
end

-- Actual OAM limits and cache deadlines throughout space/fatal timelines.
-- OBJSEL=$60: small sprites are 16x16, large sprites 32x32.
function E.watchShards()
  local spritesMax, sliversMax, late = 0, 0, 0
  local started, sum, n, worst = nil, 0, 0, 0
  local upload, uploadSum, uploadN, uploadMax = nil, 0, 0, 0
  emu.addEventCallback(function()
    if not E.watchArmed then return end
    late = math.max(late, E.sram16(0x154))
    local count, tiles = {}, {}
    for i = 0, 127 do
      local hi = (H.oam(512 + (i >> 2)) >> ((i & 3)*2)) & 3
      local size = (hi & 2) ~= 0 and 32 or 16
      local x, y = H.oam(i*4) + ((hi & 1) << 8), H.oam(i*4+1)
      if x >= 256 then x = x - 512 end
      if x > -size and x < 256 then
        local slivers = math.min(size/8, math.ceil((256-x)/8))
        for dy = 0, size-1 do
          local line = (y + dy) & 255
          if line < 224 then
            count[line] = (count[line] or 0) + 1
            tiles[line] = (tiles[line] or 0) + slivers
            spritesMax = math.max(spritesMax, count[line])
            sliversMax = math.max(sliversMax, tiles[line])
          end
        end
      end
    end
  end, emu.eventType.endFrame)
  emu.addMemoryCallback(function()
    if E.watchArmed then started = emu.getState().masterClock end
  end, emu.callbackType.exec, FIELD_IN, FIELD_IN)
  emu.addMemoryCallback(function()
    if not started then return end
    local cost = (emu.getState().masterClock - started) / 1364
    sum = sum + cost; n = n + 1; worst = math.max(worst, cost); started = nil
  end, emu.callbackType.exec, FIELD_OUT, FIELD_OUT)
  if SHARDS_IN and SHARDS_OUT then
    emu.addMemoryCallback(function()
      if E.watchArmed then upload = emu.getState().masterClock end
    end, emu.callbackType.exec, SHARDS_IN, SHARDS_IN)
    emu.addMemoryCallback(function()
      if not upload then return end
      local cost = (emu.getState().masterClock - upload) / 1364
      uploadSum = uploadSum + cost; uploadN = uploadN + 1
      uploadMax = math.max(uploadMax, cost); upload = nil
    end, emu.callbackType.exec, SHARDS_OUT, SHARDS_OUT)
  end
  return function()
    H.result('shard_late', late)
    H.result('shard_sprites_max', spritesMax)
    H.result('shard_slivers_max', sliversMax)
    H.result('frame_lines_mean', n > 0 and sum/n or 0)
    H.result('frame_lines_max', worst)
    H.result('shard_upload_lines_mean', uploadN > 0 and uploadSum/uploadN or 0)
    H.result('shard_upload_lines_max', uploadMax)
  end
end
