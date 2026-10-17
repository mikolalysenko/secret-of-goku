-- Goku's arrival (title module) plays the browser's pod cues: `flight` when
-- the descent begins (!title_sfx = 1) and `impact` at the impact (2). From
-- the browser state just before the sword pull (IMPORT, as snes/test/title
-- scene.lua), with today's extension injected into the imported driver.
-- Each cue must start streaming within 3 frames of its phase.
local function phase() return H.r8(0x7EDD86) end
local function cueOn(id)
  -- a stream channel playing shot `id` on a voice with sound
  for ch = 0, 1 do
    local base = AU + 0x20 + ch * 0x20
    local v = aram(0xEC + ch)
    if H.r8(base) == 1 and H.r8(base + 1) == id and v ~= 0xFF and dsp(v * 16 + 8) > 0 then return true end
  end
  return false
end

function test()
  H.wait(30)
  check('imported', H.importSnesJs(IMPORT), 'import failed')
  for a = 0xDD80, 0xDDFF do H.w8(0x7E0000 + a, 0) end   -- fresh title module state
  H.w8(0x316300, 0)
  H.w8(0x316001, 0)
  check('extension_injected', injectExtension(), 'injection failed')
  local at, heard, flags = {}, {}, {}
  for f = 1, 700 do
    if H.wram(0xD0) == 0x83 and (f % 40) < 3 then H.input = { b = true } else H.input = nil end
    H.wait(1)
    local ph = phase()
    if at[ph] == nil then at[ph] = f end
    local s = H.r8(0x7EDD87)
    if s ~= 0 then flags[#flags + 1] = f .. ':' .. s end
    if heard.flight == nil and cueOn(AUDIO_SFX_FLIGHT) then heard.flight = f end
    if heard.impact == nil and cueOn(AUDIO_SFX_IMPACT) then heard.impact = f end
    if ph >= 4 and heard.impact then break end
  end
  H.input = nil
  H.result('phase_frames', string.format('descent %s impact %s', tostring(at[2]), tostring(at[3])))
  H.result('cue_frames', string.format('flight %s impact %s', tostring(heard.flight), tostring(heard.impact)))
  H.result('title_sfx_seen', table.concat(flags, ' '))
  check('descent_reached', at[2] ~= nil, 'no descent')
  check('impact_reached', at[3] ~= nil, 'no impact')
  check('flight_with_descent', at[2] and heard.flight and heard.flight - at[2] >= 0 and heard.flight - at[2] <= 3,
    string.format('descent %s flight %s', tostring(at[2]), tostring(heard.flight)))
  check('impact_with_impact', at[3] and heard.impact and heard.impact - at[3] >= 0 and heard.impact - at[3] <= 3,
    string.format('impact %s cue %s', tostring(at[3]), tostring(heard.impact)))
  check('title_sfx_cleared', #flags == 0, table.concat(flags, ' '))
  finish()
end
