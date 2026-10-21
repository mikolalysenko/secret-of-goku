-- Check the actual cartridge IPL path, without an imported APU image.
function test()
  H.wait(240)
  check('boot_extension',extensionDamage()==nil,extensionDamage())
  check('boot_samples',effectSampleDamage()==nil,effectSampleDamage())
  check('boot_resident',aram(0x2F70)==(H.r8(0xC324A9)),aram(0x2F70))
  finish()
end
