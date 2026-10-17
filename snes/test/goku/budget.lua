-- CPU cost of the GOKU module: scanline at which the field frame logic ends
-- (00:B077, after modules_field_frame) and the NMI end, with Goku off and on,
-- over the same walk. Also the scanline after goku_nmi's uploads.
local lines = {}
local nmiEnd = {}
local function vline() return emu.getState()['ppu.scanline'] or -1 end
local function run(tag, on)
  G.import(BUNDLE or 'barrier-audit__potos-probe')
  if on then G.on() else G.off() end
  H.wait(10)
  lines[tag] = {}
  nmiEnd[tag] = {}
  local L, N = lines[tag], nmiEnd[tag]
  local id1 = emu.addMemoryCallback(function() L[#L + 1] = vline() end, emu.callbackType.exec, 0x00B077, 0x00B077)
  local id2 = emu.addMemoryCallback(function() N[#N + 1] = vline() end, emu.callbackType.exec, 0x00C15F, 0x00C15F)
  local pads = {'up', 'right', 'down', 'left'}
  for i = 1, 160 do
    H.input = {[pads[(i // 40) % 4 + 1]] = true}
    H.wait(1)
  end
  H.input = nil
  emu.removeMemoryCallback(id1, emu.callbackType.exec, 0x00B077, 0x00B077)
  emu.removeMemoryCallback(id2, emu.callbackType.exec, 0x00C15F, 0x00C15F)
end
local function stats(t)
  local s = {}
  for _, v in ipairs(t) do s[#s + 1] = v < 200 and v + 262 or v end   -- lines after the NMI wrap
  table.sort(s)
  if #s == 0 then return 0, 0, 0 end
  return s[math.max(1, math.floor(#s * 0.5))], s[math.max(1, math.floor(#s * 0.9))], s[#s]
end
function test()
  run('off', false)
  run('on', true)
  local o50, o90, omax = stats(lines.off)
  local g50, g90, gmax = stats(lines.on)
  local n50, n90, nmax = stats(nmiEnd.off)
  local m50, m90, mmax = stats(nmiEnd.on)
  H.result('logic_end_off', {o50, o90, omax, #lines.off})
  H.result('logic_end_on', {g50, g90, gmax, #lines.on})
  H.result('nmi_end_off', {n50, n90, nmax})
  H.result('nmi_end_on', {m50, m90, mmax})
  G.check(#lines.on >= #lines.off - 3, 'no added lag frames')
  G.check(g90 - o90 <= 20, 'p90 logic end grows by at most 20 lines (' .. (g90 - o90) .. ')')
  G.check(mmax <= 261, 'NMI work ends inside vblank (max line ' .. mmax .. ')')
  G.finish()
end
