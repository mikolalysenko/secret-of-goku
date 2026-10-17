-- The full Super Saiyan wave destroys the Mana Fortress (world-ki.js), from
-- a native session (waterfall checkpoint, L+R takeoff; imported browser
-- states leave the SPC unable to take a music upload, so the crisis cue
-- would hang the driver there). The Fortress is moved 400 px ahead. The
-- hit removes it (C2:B112 stops drawing it), an explosion plays, then the
-- 186-frame planet cutaway (stand-in: the world fades out), then the
-- Fortress's own docking ABI lands on its deck (map 255, landing record
-- 10, X offset corrected) with the crisis cue $1B sent during the fade, and
-- story event $8B (post-destruction scene) starts on the deck.
local sounds = {}
local function idle()
  return W.inField() and H.r8(0x7E00D0) == 0 and H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1
end
local function interactive()
  return W.inWorld() and H.r8(0x7E00EC) & 0x80 ~= 0 and H.r8(0x7E00FE) == 0 and H.r8(0x7E00F2) & 0x83 == 0
end
local function fortress_oam()
  local n = 0
  for i = 64, 83 do local e = W.oam(i); if W.visible(e) and e.pal == 7 then n = n + 1 end end
  return n
end
function test()
  H.wait(4)
  W.fresh()
  W.on(1)
  W.check('field_start', H.waitFor(idle, 300), W.nmi())
  H.hold('l r', 4)
  W.check('world', H.waitFor(interactive, 900), W.nmi())
  H.wait(20)
  emu.addMemoryCallback(function()
    sounds[#sounds + 1] = string.format('%02X %02X', H.r8(0x7E1E00), H.r8(0x7E1E01))
  end, emu.callbackType.exec, 0xC30004, 0xC30004)
  -- the Fortress 400 px straight ahead (heading 0: north)
  H.w16(0x7E0128, H.r16(0x7E00FA) & 0x0FFF)
  H.w16(0x7E012A, (H.r16(0x7E00FC) - 400) & 0x0FFF)
  H.wait(4)
  W.check('fortress_drawn', fortress_oam() > 0, W.oam_dump(64, 83))
  H.hold('l y', 50)
  W.check('charged_full', H.r16(W.a.charge) == 45, H.r16(W.a.charge))
  H.wait(1)
  W.check('mega', (H.r16(W.a.shot_flags) & 1) == 1 and H.r16(W.a.shot_max) == 72, string.format('%04X', H.r16(W.a.shot_flags)))
  W.check('aimed_fortress', H.r16(W.a.shot_tgt) == 1, H.r16(W.a.shot_tgt))
  H.wait(8)
  H.shot('mega_beam')
  H.wait(6)
  W.check('destroyed', (H.r8(W.PW) & 1) == 1, H.r8(W.PW))
  W.check('explosion', H.r16(W.a.expl_age) ~= 0xFFFF and (H.r16(W.a.expl_flags) & 2) == 2, H.r16(W.a.expl_age))
  W.check('fortress_message', H.r16(W.a.msg) == 4, H.r16(W.a.msg))
  H.wait(4)
  W.check('fortress_gone', fortress_oam() == 0, W.oam_dump(64, 83))
  H.shot('explosion')
  W.check('cutaway', H.waitFor(function() return H.r16(W.a.cut_age) ~= 0xFFFF end, 40), H.r16(W.a.cut_age))
  H.wait(60)
  H.shot('cutaway')
  W.check('landed', H.waitFor(function() return W.inField() end, 400), W.nmi())
  W.check('deck_map', H.r16(0x7E00DC) == 255, H.r16(0x7E00DC))
  W.check('fortress_offset', (H.r16(W.a.flags) & 2) == 2 and H.r16(0x7EE002) < 600, H.r16(W.a.flags) .. ' x=' .. H.r16(0x7EE002))
  local crisis = false
  for _, s in ipairs(sounds) do if s == '01 1B' then crisis = true end end
  W.check('crisis_cue', crisis, table.concat(sounds, ','))
  local scene = H.waitFor(function() return H.r16(0x7EDA00) == 0x008B end, 900)
  W.check('finale_scene', scene and (H.r8(W.PW) & 2) == 0, string.format('last %04X pw %02X', H.r16(0x7EDA00), H.r8(W.PW)))
  W.check('no_flyby', H.r8(0x7E0052) == 0, H.r8(0x7E0052))
  H.wait(120)
  H.shot('deck')
  H.result('sounds', table.concat(sounds, ','))
  W.check('stays_destroyed', W.romw and (H.r8(W.PW) & 1) == 1, H.r8(W.PW))
  W.finish()
end
