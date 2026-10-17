-- Arrival scene from an imported browser-mod state just before the sword
-- pull (IMPORT = bundle dir). Records phases, shots at key ages, final state.
local SHOTS = SHOTS or {}
local function r16(a) return H.wram(a) | (H.wram(a + 1) << 8) end
local function ptr() return H.wram(0xD1) | (H.wram(0xD2) << 8) | (H.wram(0xD3) << 16) end
function test()
  H.wait(30)
  if not H.importSnesJs(IMPORT) then H.result('error', 'import failed') return end
  -- fresh module state: WRAM block and the persistent arrival bits
  for a = 0xDD80, 0xDDFF do H.w8(0x7E0000 + a, 0) end
  H.w8(0x316300, 0)
  H.w8(0x316001, 0)
  local phases, last = {}, -1
  local shot = {}
  for _, s in ipairs(SHOTS) do shot[s[1] .. ':' .. s[2]] = s[3] end
  local pages = {}
  for f = 1, FRAMES or 2400 do
    local d0 = H.wram(0xD0)
    if d0 == 0x83 and (f % 40) < 3 then H.input = {b = true} else H.input = nil end
    H.wait(1)
    local ph, ticks = H.wram(0xDD86), r16(0xDD88)
    if ph ~= last then
      phases[#phases + 1] = {phase = ph, frame = f, ptr = string.format('%06X', ptr()), d0 = H.wram(0xD0)}
      last = ph
    end
    local name = shot[ph .. ':' .. ticks]
    if name and not pages[name] then pages[name] = true; H.shot(name) end
    if ph == 6 and H.wram(0xD0) == 0 and H.wram(0xCF00) == 1 then break end
  end
  H.input = nil
  H.result('phases', phases)
  local n = {}
  for i = 0, 11 do n[#n + 1] = H.wram(0xCC00 + i) end
  H.result('hero_slot', n)
  H.result('goku_active', H.r8(0x316001))
  H.result('arrival_bits', H.r8(0x316300))
  H.result('flags', {H.wram(0xCF00), H.wram(0xCF10), H.wram(0xCF0A), H.wram(0xCFC1)})
  H.result('d0', H.wram(0xD0))
  H.result('map', r16(0xDC))
  H.result('claims', H.wram(0xDD9D))
  H.shot('end')
end
