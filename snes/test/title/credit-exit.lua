-- Start pressed while the extended credit (and its HDMA shift) is on screen:
-- the file select must be untouched by the title's BG2 scroll split.
function test()
  H.wait(820)
  H.result('credit_row_new', H.r8(0x7F2B40) == 0x70)
  H.hold('start', 2)
  H.wait(240)
  H.shot('file-select')
end
