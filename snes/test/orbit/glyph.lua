-- Optional native death-sheet cache trace, installed by orbit's glyph case.
GLYPH_LOG = {}
local glyphActive = nil
local function glyphExec(address, fn)
  emu.addMemoryCallback(fn, emu.callbackType.exec, address, address)
end
glyphExec(GLYPH_ENTRY, function()
  local s = emu.getState()
  if s['cpu.x'] ~= 0 or s['cpu.y'] ~= 0xF100 or H.r8(0x7EDC00) == 0 then return end
  glyphActive = {frame=H.frame, variant=H.r8(s['cpu.d'] + 3), copied=false}
  if GLYPH_FORCE_COPY == 1 then H.w16(0x7EDC7E, 0) end
end)
local function glyphCopy()
  if glyphActive then glyphActive.copied = true end
end
glyphExec(GLYPH_DMA, glyphCopy)
glyphExec(GLYPH_MVN, glyphCopy)
glyphExec(GLYPH_FINISH, function()
  if not glyphActive then return end
  local bad = 0
  for i = 0, 1599 do if H.r8(0x7E2800 + i) ~= H.r8(GLYPH_SOURCE + i) then bad = bad + 1 end end
  glyphActive.bad = bad
  glyphActive.key = H.r16(0x7EDC7E)
  GLYPH_LOG[#GLYPH_LOG + 1] = glyphActive
  glyphActive = nil
end)
