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
E.P = {transition=1, summon=2, dragon=3, wish=4, scatter=5, reunion=6, village=7,
       depart=8, kai=9, complete=10, doomed=11, explode=12, escape=13, fatal=14}
function E.sram16(off) return H.sram(E.SW + off) | (H.sram(E.SW + off + 1) << 8) end
function E.cue(name, flags)
  if flags then H.w16(E.flags, flags) end
  H.w8(E.request, E.P[name])
end
-- Wait for the phase to start and its art to finish loading.
function E.waitLoaded(name, frames)
  local p = E.P[name]
  H.wait(1)
  return H.waitFor(function()
    return H.r8(E.phase) == p and (H.r8(E.status) & 0x80) == 0
  end, frames or 120)
end
function E.import(bundle)
  H.wait(20)
  H.importSnesJs('/Users/mikolalysenko/Projects/secret-of-goku/.local/snes-import/' .. bundle)
  H.wait(3)
end
