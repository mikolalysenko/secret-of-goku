-- Stability: started from a savestate made by another build (its UI WRAM
-- block is stale or random) or from an imported browser scene, the
-- cartridge keeps running while Goku walks around: the core dispatches a
-- frame per video frame, the CPU never executes from low RAM (outside the
-- NMI trampoline at $0100), and the UI block ends up set up (marker and a
-- sane queue). Prelude: IMPORT (bundle directory) or nil (state given).
function test()
  if IMPORT then
    H.wait(5)
    H.importSnesJs(IMPORT)
  end
  -- whatever build made the state, give the UI block and its SRAM staging
  -- the random contents a foreign savestate (or power-on RAM) would have
  local seed = 0x2545
  local function rnd()
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return (seed >> 16) & 0xff
  end
  for a = 0x7E7E40, 0x7E7EFF do H.w8(a, rnd()) end
  for a = 0x337C00, 0x337FFF do H.w8(a, rnd()) end
  H.wait(2)
  local t0, f0 = H.r16(0x7ED72C), H.r16(0x7ED700)
  local bad, frames = {}, 0
  local function step(buttons, n)
    for _ = 1, n do
      if buttons then H.hold(buttons, 1) else H.wait(1) end
      frames = frames + 1
      local st = emu.getState()
      local k, pc = st['cpu.k'] or 0, st['cpu.pc'] or 0
      if k == 0 and (pc < 0x100 or (pc >= 0x104 and pc < 0x2000)) and #bad < 8 then
        bad[#bad + 1] = string.format('%02X:%04X@%d', k, pc, frames)
      end
    end
  end
  for _, s in ipairs({{'right', 50}, {'down', 50}, {'left', 50}, {'up', 50}, {false, 40}}) do
    step(s[1], s[2])
  end
  local ticks, fields = H.r16(0x7ED72C) - t0, H.r16(0x7ED700) - f0
  H.result('steps', frames)
  H.result('ticks', ticks)
  H.result('field_frames', fields)
  H.result('ram_pcs', table.concat(bad, ' '))
  H.result('magic', H.r16(UI + 0x82))
  H.result('queue', H.r16(UI + 0x0C))
  H.shot('end')
end
