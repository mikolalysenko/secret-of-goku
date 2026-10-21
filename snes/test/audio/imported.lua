-- An imported browser state carries the browser's sound driver, without the
-- stream extension. The module finds out at its first transfer (the end
-- group comes back as the plain counter, not counter|$80), switches streams
-- off and stays cheap; native effects keep working. IMPORT = bundle dir.
local function srcnOurs()
  for v = 0, 7 do
    local s = dsp(v * 16 + 4)
    if (s == 12 or s == 13) and dsp(v * 16 + 8) > 0 then return v end
  end
  return nil
end
function test()
  H.wait(30)
  check('imported', H.importSnesJs(IMPORT), 'import failed')
  -- the module's state as the browser left it: zero (first service syncs)
  for a = 0, 0x7F do H.w8(AU + a, 0) end
  H.wait(40)                 -- song hold-off, then the sync STOP
  check('streams_off_without_extension', (H.r8(AU + 0x09) & 0x40) == 0x40, string.format('flags %02X', H.r8(AU + 0x09)))
  cmd(1, AUDIO_SFX_HIT)
  local ours = nil
  for f = 1, 30 do H.wait(1); ours = ours or srcnOurs() end
  check('no_stream_voice', ours == nil, tostring(ours))
  -- the game's own sound still answers (native effect through core_sound_queue)
  cmd(8, 0x50)
  H.wait(20)
  local k = emu.getState()['cpu.k']
  check('native_effect_answers', H.r8(0x7E1E00) == 0 and k ~= 0xC3, string.format('command byte %02X, CPU in bank %02X', H.r8(0x7E1E00), k))
  -- The temporary loader must also bootstrap itself on an unextended
  -- imported driver, including a small native cue and a complete new score.
  for _,id in ipairs({7,0x3B}) do
    cmd(3,id);H.wait(180)
    local tag=string.format('imported_song_%02X',id)
    check(tag..'_playing',H.r8(0x7E1E05)==id and aram(0xAD)~=0,aram(0xAD))
    local ptr=0xC33D39+3*id
    local src=H.r16(ptr)|(H.r8(ptr+2)<<16)
    local bad=nil
    for j=0,H.r16(src)-1 do if aram(0x1A00+j)~=H.r8(src+2+j) then bad=j;break end end
    check(tag..'_sequence',bad==nil,bad)
    for slot=0,15 do
      local ins=H.r16(0xC33F22+32*id+2*slot)
      if ins~=0 then
        ptr=0xC33DF9+3*(ins-1);src=H.r16(ptr)|(H.r8(ptr+2)<<16)
        local dst=aram(0x1980+4*slot)|(aram(0x1981+4*slot)<<8)
        for j=0,H.r16(src)-1 do if aram(dst+j)~=H.r8(src+2+j) then bad=string.format('sample %d +%d',ins,j);break end end
      end
    end
    check(tag..'_samples',bad==nil,bad)
  end
  finish()
end
