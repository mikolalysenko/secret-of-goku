-- VRAM queue: uploads land in vblank, the per-frame budget and queue limits
-- hold, and region claims keep modules apart.
local PATTERN = { 0xAA, 0x00, 0x55, 0xFF }
local function vramMatches(word, bytes)
  for i = 0, bytes - 1 do
    local want = (i % 32) < 16 and PATTERN[(i % 4) + 1] or 0
    if H.vram(word * 2 + i) ~= want then return false, i end
  end
  return true
end
function test()
  H.wait(4)
  -- One upload: 128 bytes into OBJ tiles $1FC-$1FF (VRAM $7FC0).
  local r = command(3, { [0x20] = 0x7FC0, [0x22] = 0x80 })
  check('queued', r == 0, r)
  H.wait(2)
  local ok, at = vramMatches(0x7FC0, 0x80)
  check('upload_landed', ok, at)
  check('queue_empty', H.r16(CORE + 0x0A) == 0, H.r16(CORE + 0x0A))
  H.result('flush_start_line', H.r16(CORE + 0x3E))
  H.result('lines_left_after_module_nmi', ct(0x3E))
  -- Fill the queue in one frame: 9 x 256 bytes from $7800; the 9th is
  -- refused (8 entries). Entries that do not fit the vblank window wait.
  local full = command(7, { [0x20] = 0x7800, [0x22] = 0x100, [0x44] = 9 })
  check("ninth_refused", full == 1 and ct(0x48) == 8, tostring(full) .. " accepted " .. ct(0x48))
  H.wait(3)
  local all = true
  for i = 0, 7 do if not vramMatches(0x7800 + i * 0x80, 0x100) then all = false end end
  check("eight_uploads_landed", all, "mismatch")
  check("queue_drained", H.r16(CORE + 0x0A) == 0 and H.r16(CORE + 0x0E) == 0,
    H.r16(CORE + 0x0A) .. " " .. H.r16(CORE + 0x0E))
  -- Budget: 4 x $400 > $C00 bytes in one frame; 3 accepted, then they
  -- drain over the next vblanks (each transfer must fit the window).
  local over = command(7, { [0x20] = 0x6800, [0x22] = 0x400, [0x44] = 4 })
  check("budget_refuses", over == 1 and ct(0x48) == 3, tostring(over) .. " accepted " .. ct(0x48))
  local frames = 0
  for i = 1, 10 do
    H.wait(1)
    frames = i
    if H.r16(CORE + 0x0A) == 0 then break end
  end
  check("big_queue_drains", H.r16(CORE + 0x0A) == 0, H.r16(CORE + 0x0A))
  H.result("big_queue_frames", frames)
  -- Claims.
  local c1 = command(6, { [0x1E] = 2 })
  check('claim_region', c1 == 0 and ct(0x20) == 0x7220, tostring(c1) .. ' ' .. string.format('%04X', ct(0x20)))
  H.w16(CORE_EXT + 0xE0 + 2 * 3, 0x0011)   -- another owner holds region 3
  local c2 = command(6, { [0x1E] = 3 })
  check('claim_taken_region_refused', c2 == 1, c2)
  local c3 = command(6, { [0x1E] = 9 })
  check('claim_bad_region_refused', c3 == 1, c3)
  H.shot('vram')
  finish()
end
