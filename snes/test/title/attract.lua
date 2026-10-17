-- Later title frames without input: the next credits (native) and the
-- attract sequence with the GOKU logo over the scrolling prologue.
function test()
  for _, f in ipairs({1040, 1060, 1100, 1700, 2200}) do
    H.wait(f - H.frame)
    H.shot(string.format('title-%04d', f))
  end
end
