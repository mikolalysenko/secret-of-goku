-- The radar's rotation multiply (ui_mul2r11, the 8x8 hardware multiplier
-- with WRMPYA latched): U * C / 2^11 and U * S / 2^11 rounded, for CASES
-- {U, C, S} from run.mjs, run through the test mailbox (command 14).
function test()
  enter(BUNDLE)
  local out = {}
  for i, c in ipairs(CASES) do
    setui(0x90, c[2]); setui(0x92, c[3])
    command(14, c[1], 0)
    H.wait(1)
    out[#out + 1] = string.format('%d,%d', ui(0x7E), ui(0x80))
  end
  H.result('products', table.concat(out, ';'))
  finish()
end
