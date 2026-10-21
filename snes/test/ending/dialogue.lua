-- Open native event $134 over each ending family. Check the actual BG3
-- transfers against the game's WRAM bytes, including the first temporary
-- line tile and every tilemap word. A shifted high plane/attribute fails
-- even if a later frame happens to repair the finished window.
local current, pending, started
local cases = {}
local function before(kind)
  if not current then return end
  local s = emu.getState()
  local ch = 'dmaController.channel[7].'
  local size, src = s[ch .. 'transferSize'], s[ch .. 'srcAddress']
  pending = {kind = kind, dest = s['ppu.vramAddress'] * 2, bytes = {}}
  for i = 0, size - 1 do pending.bytes[i + 1] = H.wram(src + i) end
  current[kind] = current[kind] + 1
  if not s['ppu.vramAddrIncrementOnSecondReg'] or s['ppu.vramIncrementValue'] ~= 1 or s['ppu.vramAddressRemapping'] ~= 0 then
    current.bad_mode = current.bad_mode + 1
  end
  if not s['ppu.forcedBlank'] and s['ppu.scanline'] < 225 then current.unsafe = current.unsafe + 1 end
end
local function after()
  if not pending then return end
  for i, b in ipairs(pending.bytes) do
    if H.vram(pending.dest + i - 1) ~= b then
      current.bad_bytes = current.bad_bytes + 1
      current.first_bad = current.first_bad or string.format('%s $%04X', pending.kind, pending.dest + i - 1)
    end
  end
  pending = nil
end
-- Check after the DMA routine returns. Mesen's callback on the instruction
-- immediately after STA $420B fires before the pending DMA is serviced.
for _, v in ipairs({{0xC01D4E, 'tiles', 0xC01CD5}, {0xC01C71, 'maps', 0xC01C07}}) do
  emu.addMemoryCallback(function() before(v[2]) end, emu.callbackType.exec, v[1], v[1])
  emu.addMemoryCallback(after, emu.callbackType.exec, v[3], v[3])
end
-- Cost of the new call through the native entry, excluding the uploader.
emu.addMemoryCallback(function()
  if current then started = emu.getState().masterClock end
end, emu.callbackType.exec, DIALOGUE_IN, DIALOGUE_IN)
emu.addMemoryCallback(function()
  if current and started then
    local cost = (emu.getState().masterClock - started) / 1364
    current.hook_lines_max = math.max(current.hook_lines_max, cost)
    started = nil
  end
end, emu.callbackType.exec, 0xC00006, 0xC00006)

function test()
  E.watchVblank(0)
  for _, v in ipairs({
    {'native'}, {'doomed', 'doomed', 100},
    {'flash', 'explode', 50}, {'ring', 'explode', 80}, {'escape', 'escape', 10},
    {'vista', 'dragon', 100}, {'flight', 'scatter', 100}, {'kai', 'kai', 60},
    {'fatal-native', 'fatal', 100}, {'fatal-globe', 'fatal', 500},
    {'fatal-flash', 'fatal', 626}, {'fatal-ring', 'fatal', 655},
    {'departure', 'depart', 200},
  }) do
    E.arm(false)
    current = nil
    E.import('emulator-probe__potos-state')
    H.wait(20)
    local name, phase, age = v[1], v[2], v[3]
    local loaded = true
    if phase then
      E.cue(phase, 0x8021)
      loaded = E.waitLoaded(phase, 120)
      if phase == 'scatter' or phase == 'depart' then loaded = E.waitAge(age, 400) and loaded end
      if phase == 'fatal' and age >= 360 then
        H.w16(E.age, 360)
        H.wait(2)
        loaded = E.waitLoaded(phase, 120) and loaded
      end
      for _ = 1, 20 do H.w16(E.age, age); H.wait(1) end
    end
    current = {name = name, loaded = loaded, tiles = 0, maps = 0,
      bad_mode = 0, bad_bytes = 0, unsafe = 0, hook_lines_max = 0}
    cases[#cases + 1] = current
    E.arm(true)
    H.w16(EVENT_MAILBOX, 0x8000 | 0x134)
    for i = 1, 500 do
      if age then H.w16(E.age, age) end
      H.wait(1)
      if i == 10 then H.shot(name .. '-opening') end
      if H.r8(0x7E00D0) == 0x83 then current.ready = true; break end
    end
    H.shot(name .. '-open')
    current.hdma = H.r8(0x7E002C)
    current.overruns = E.overruns
    E.overruns = 0
  end
  E.arm(false)
  current = nil
  H.result('dialogue_cases', cases)
end
