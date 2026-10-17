-- DBZ streams on the cartridge: a one-shot, the Kamehameha chant and shout,
-- a looping bed, native effects beside them, and the native music around them.
local function watch(frames, fn)
  local log = {}
  for f = 1, frames do H.wait(1); log[#log + 1] = fn(f) end
  return log
end
local function streamVoice(ch) return aram(0xEC + ch) end

function test()
  -- before any frame runs: the first service would talk to the extension
  check('extension_injected', injectExtension(), 'injection failed')
  H.wait(4)
  check('extension_code', aram(0x1598) == 0xE4 and aram(0x1599) == 0xE3, string.format('%02X %02X', aram(0x1598), aram(0x1599)))
  check('channels_idle', streamVoice(0) == 0xFF and streamVoice(1) == 0xFF, streamVoice(0) .. ' ' .. streamVoice(1))
  -- the waterfall's music is playing on the native driver
  local musicEnv = 0
  watch(30, function() for v = 0, 7 do musicEnv = math.max(musicEnv, dsp(v * 16 + 8)) end end)
  check('music_playing', musicEnv > 0, musicEnv)
  H.result('music_tracks', aram(0xAD))
  local nativeFx = aram(0xAE)               -- ambient native effects (the waterfall)
  H.result('native_effect_voices', nativeFx)
  local expect = 7
  while expect >= 0 and (nativeFx & (1 << expect)) ~= 0 do expect = expect - 1 end

  -- One-shot: the first hit.
  cmd(1, AUDIO_SFX_HIT)
  local voice, srcn, peakEnv, peakOut, dirStart = 0xFF, 0, 0, 0, 0
  local log = watch(45, function(f)
    local v = streamVoice(1)
    if v ~= 0xFF then
      voice = v
      local s = voiceState(v)
      srcn = s.srcn
      peakEnv = math.max(peakEnv, s.envx)
      peakOut = math.max(peakOut, math.abs(s.outx))
      dirStart = aram(0x1934) | (aram(0x1935) << 8)
    end
    return string.format('%d:v%02X ae%02X st%02X', f, v, aram(0xAE), port3())
  end)
  H.result('hit_log', table.concat(log, ' '))
  check('hit_voice', voice == expect, voice .. ' expected ' .. expect)
  check('hit_source', srcn == 13, srcn)
  check('hit_dir_in_slots', dirStart >= 0xFA00 and dirStart < 0xFBF8, string.format('%04X', dirStart))
  check('hit_envelope', peakEnv > 100, peakEnv)
  check('hit_audible', peakOut > 8, peakOut)
  check('hit_released', streamVoice(1) == 0xFF and (aram(0xAE) & (1 << expect)) == 0, string.format('%02X %02X', streamVoice(1), aram(0xAE)))

  -- Kamehameha: the chant on channel 0, a hit beside it, then the shout.
  cmd(2, 1)
  H.wait(20)
  local chantVoice = streamVoice(0)
  check('chant_voice', chantVoice ~= 0xFF, chantVoice)
  cmd(8, 0x50)              -- the game's own hit effect while the chant streams
  local nativeKeyed = false
  local before = voicesEnv()
  watch(20, function()
    for v = 0, 7 do
      if v ~= chantVoice and dsp(v * 16 + 8) > 0 and (aram(0xFF80 + v) == 0x50) then nativeKeyed = true end
    end
  end)
  check('native_effect_beside_stream', nativeKeyed, 'no voice took effect 50')
  local chantEnv = 0
  watch(60, function() if streamVoice(0) ~= 0xFF then chantEnv = math.max(chantEnv, voiceState(streamVoice(0)).envx) end end)
  check('chant_sustains', chantEnv > 100 and streamVoice(0) == chantVoice, chantEnv)
  cmd(2, 2)
  H.wait(10)
  check('release_on_channel0', streamVoice(0) ~= 0xFF and aram(0x1930) ~= 0, streamVoice(0))
  check('release_ends', H.waitFor(function() return streamVoice(0) == 0xFF end, 240), streamVoice(0))

  -- Looping bed: the charge loop holds while refreshed, stops two frames later.
  cmd(5, AUDIO_LOOP_CHARGE)
  H.wait(10)
  local loopVoice = streamVoice(1)
  check('loop_voice', loopVoice ~= 0xFF, loopVoice)
  local minEnv, frames = 255, 0
  watch(240, function()
    if streamVoice(1) ~= 0xFF then frames = frames + 1; minEnv = math.min(minEnv, voiceState(streamVoice(1)).envx) end
  end)
  check('loop_holds_4s', frames == 240 and minEnv > 100, frames .. ' ' .. minEnv)
  cmd(6, 0)
  check('loop_stops', H.waitFor(function() return streamVoice(1) == 0xFF end, 30), streamVoice(1))
  check('voices_returned', aram(0xEC) == 0xFF and aram(0xED) == 0xFF and (aram(0xAE) & ~nativeFx & 0xFF) == 0, string.format('%02X', aram(0xAE)))
  local after = 0
  watch(30, function() for v = 0, 7 do after = math.max(after, dsp(v * 16 + 8)) end end)
  check('music_after', after > 0, after)
  -- the destroy module's impact counter (!out_sfx, $7E:D9BE) moving plays IMPACT
  if DESTROY then
    H.w8(0x7ED9BE, (H.r8(0x7ED9BE) + 1) & 0xFF)
    local played = H.waitFor(function()
      for ch = 0, 1 do
        local v = streamVoice(ch)
        if H.r8(AU + 0x20 + ch * 0x20) == 1 and H.r8(AU + 0x21 + ch * 0x20) == AUDIO_SFX_IMPACT and v ~= 0xFF and dsp(v * 16 + 8) > 0 then return true end
      end
      return false
    end, 6)
    check('destroy_impact', played, 'no IMPACT stream')
  end
  H.result('status_final', port3())
  finish()
end
