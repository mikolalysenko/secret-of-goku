-- Check the actual cartridge IPL path, without an imported APU image.
local bootStart,extensionStart,extensionEnd,bootEnd
emu.addMemoryCallback(function() bootStart=bootStart or emu.getState().masterClock end,emu.callbackType.exec,0xC3002C,0xC3002C)
emu.addMemoryCallback(function() extensionStart=emu.getState().masterClock end,emu.callbackType.exec,0xC30106,0xC30106)
emu.addMemoryCallback(function() extensionEnd=emu.getState().masterClock end,emu.callbackType.exec,0xC3010C,0xC3010C)
emu.addMemoryCallback(function() bootEnd=bootEnd or emu.getState().masterClock end,emu.callbackType.exec,0xC3018D,0xC3018D)
function test()
  H.wait(240)
  check('boot_extension',extensionDamage()==nil,extensionDamage())
  check('boot_samples',effectSampleDamage()==nil,effectSampleDamage())
  check('boot_resident',aram(0x2F70)==(H.r8(0xC324A9)),aram(0x2F70))
  check('boot_custom',customDamage()==nil,customDamage())
  H.result('boot_clocks',{total=bootEnd-bootStart,extension=extensionEnd-extensionStart})
  finish()
end
