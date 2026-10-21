-- The wish flight (scatter): the vista fades out (0-30), the flight stage
-- loads under black, then the night world under the rising Balls, the
-- turn, the scatter's flash and trails. A first run measures the timeline
-- untouched (load frames, lag, vblank, status, done); a second, from the
-- same state imported again, holds the clock for each still.
local function watchFlight()
  local last, started, sum, count, worst = nil, nil, 0, 0, 0
  local lag, late, buffers, spritesMax, sliversMax = {}, 0, 0, 0, 0
  emu.addEventCallback(function()
    if not E.watchArmed then last = nil; return end
    local now = H.r16(0x7ED700)
    if last == now then lag[#lag + 1] = H.r16(E.age) end
    last = now
    if H.r16(E.age) >= 60 and H.r16(E.age) < 240 then
      local sprites, slivers = {}, {}
      for i = 0, 127 do
        local hi = (H.oam(512 + (i >> 2)) >> ((i & 3)*2)) & 3
        local size = (hi & 2) ~= 0 and 16 or 8
        local x, y = H.oam(i*4) + ((hi & 1) << 8), H.oam(i*4+1)
        if x >= 256 then x = x - 512 end
        if x > -size and x < 256 then
          local tiles = math.min(size/8, math.ceil((256-x)/8))
          for dy = 0, size-1 do
            local line = (y + dy) & 255
            if line < 224 then
              sprites[line] = (sprites[line] or 0) + 1
              slivers[line] = (slivers[line] or 0) + tiles
              spritesMax = math.max(spritesMax, sprites[line])
              sliversMax = math.max(sliversMax, slivers[line])
            end
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
    sum = sum + cost; count = count + 1; worst = math.max(worst, cost); started = nil
  end, emu.callbackType.exec, FIELD_OUT, FIELD_OUT)
  if SCALE_OUT then
    emu.addMemoryCallback(function()
      if not E.watchArmed then return end
      local age = H.r16(E.age)
      local u = math.max(0, math.min(1, (age - 60) / 180)); u = u*u*(3-2*u)
      local want = 72 - math.floor(72 - 24*u + .5)
      if E.sram16(0x150) ~= want then late = late + 1 end
      buffers = buffers | (1 << E.sram16(0x154))
    end, emu.callbackType.exec, SCALE_OUT, SCALE_OUT)
  end
  return function()
    H.result('lag_ages', table.concat(lag, ','))
    H.result('rise_sprites_max', spritesMax)
    H.result('rise_slivers_max', sliversMax)
    H.result('frame_lines_mean', count > 0 and sum / count or 0)
    H.result('frame_lines_max', worst)
    H.result('scale_late', late)
    H.result('scale_buffers', buffers)
  end
end
function test()
  local bundle = BUNDLE or 'ending-fix__end-20'
  E.import(bundle)
  E.watchVblank(0)
  local report = watchFlight()
  H.wait(20)
  E.watchAudio()
  E.cue('scatter', 0x8000)
  H.result('vista_loaded', E.waitLoaded('scatter', 120))
  E.waitAge(31, 120)
  local t0 = H.frame
  H.wait(2)
  H.waitFor(function() return (H.r8(E.status) & 0x80) == 0 end, 200)
  H.result('flight_load_frames', H.frame - t0)
  H.wait(2)
  E.arm(true)
  local f0, c0 = H.frame, H.r16(0x7ED700)
  E.waitAge(100, 400)
  H.result('status_100', H.r8(E.status))
  E.waitAge(310, 400)
  H.result('sfx_310', H.r8(E.sfx))
  E.waitAge(479, 400)
  H.wait(2)
  H.result('lag_frames', (H.frame - f0) - (H.r16(0x7ED700) - c0))
  H.result('done', (H.r16(E.done) >> 5) & 1)
  H.result('status_end', H.r8(E.status))
  H.result('overruns', E.overruns)
  H.result('overrun_at', table.concat(E.overrunAt, ' '))
  E.arm(false)
  report()
  -- letting go of the picture gives the native music its volume back
  H.w8(E.request, 0xFF)
  H.wait(4)
  E.audioArmed = false
  E.audioResult()

  E.import(bundle)
  H.wait(20)
  E.cue('scatter', 0x8000)
  E.waitLoaded('scatter', 120)
  for _, a in ipairs({ 40, 60, 100, 120, 150, 180, 200, 230, 280, 301, 320, 360, 400, 450 }) do
    E.still('flight-' .. a, a)
  end
end
