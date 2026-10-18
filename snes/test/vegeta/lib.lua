-- Shared helpers for the vegeta tests (prepended to each test by run.mjs).
V = V or {}
V.IMPORT = V_IMPORT_DIR or '/Users/mikolalysenko/Projects/secret-of-goku/.local/snes-import'

-- WRAM / SRAM addresses (module.asm)
V.SRAM = function(a) return a - 0x316000 + 0x2000 end   -- bank $31 offset in Mesen's save RAM
V.PERSIST_GOKU_ACTIVE = 0x316001

function V.gokuActive(on)
  emu.write(V.SRAM(V.PERSIST_GOKU_ACTIVE), on and 1 or 0, emu.memType.snesSaveRam)
end

-- Native door request through the core service (idle field frame).
function V.door(id) H.w16(0x7E6E8E, 0x8000 | 0x0800 | id) end

function V.map() return H.r16(0x7E00DC) end
function V.hero() return H.r16(0x7EE002), H.r16(0x7EE004) end
function V.camera() return H.r16(0x7E00A8), H.r16(0x7E00AA) end

-- Enter the Time Chamber from a field state through door 304, as the
-- trial's own event does, with the trial stage (CF3F) at 4.
function V.enterChamber(bundle)
  H.importSnesJs(V.IMPORT .. '/' .. (bundle or 'graphics-audit__party'))
  H.wait(20)
  V.gokuActive(true)
  H.w8(0x7ECF3F, 4)
  V.door(0x304)
  return H.waitFor(function() return V.map() == 72 and H.r8(0x7E00D0) ~= 0 end, 600)
end

function V.dumpView(name)
  H.wait(30)                   -- let a moving camera settle (WRAM leads the picture by a frame)
  H.shot(name)
  local cx, cy = V.camera()
  local hx, hy = V.hero()
  H.result(name, {camera = {cx, cy}, hero = {hx, hy}, frame = H.frame})
end

-- Advance native dialogue (A taps) until the event interpreter is idle.
function V.finishEvent(frames)
  local t = 0
  while H.r8(0x7E00D0) ~= 0 and t < (frames or 1200) do
    H.tap('a', 2, 6)
    t = t + 8
  end
  return H.r8(0x7E00D0) == 0
end
