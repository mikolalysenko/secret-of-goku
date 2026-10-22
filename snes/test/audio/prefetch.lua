-- Shipping-bank preload is bounded by scanline admission and yields to input.
local wanted,started=false,false
emu.addMemoryCallback(function()
 if wanted then H.w8(0x7E1E02,wanted);H.w8(0x7E1E03,255) end
end,emu.callbackType.exec,0xC30198,0xC30198)
emu.addMemoryCallback(function() started=true end,emu.callbackType.exec,0x0DDD,0x0DDD,emu.cpuType.spc,emu.memType.spcMemory)
local function song(id,preset)
 wanted=preset;started=false;cmd(3,id)
 assert(H.waitFor(function() return started end,600),'song did not start')
 wanted=false
end
function test()
 if not EXTENDED8 then finish();return end
 H.wait(40);H.w8(0x316001,1);H.wait(60)
 check('initially_compact',H.r8(0x7EDD55)~=3)
 -- Keep B held before requesting the next song: its new optional bank must
 -- remain compact while a real combat input is held.
 H.input={b=true};song(7,4)
 local left=H.r16(0x7EDD50);H.wait(90)
 check('busy_defers_bank',left>0 and H.r16(0x7EDD50)==left,left..'/'..H.r16(0x7EDD50))
 H.input=nil;H.wait(30)
 local measuring=true;local misses=0;local rows={};local start=nil;local disable=false
 emu.addMemoryCallback(function()
  if measuring and H.r8(0x7E00EC)&1==0 then misses=misses+1 end
 end,emu.callbackType.exec,0x00C0A8,0x00C0A8)
 emu.addMemoryCallback(function()
  if disable then H.w8(0x7EDD09,H.r8(0x7EDD09)|0x40) end
  if measuring then local s=emu.getState();start={clock=s.masterClock,line=s['ppu.scanline'],left=H.r16(0x7EDD50),state=H.r8(0x7EDD55)} end
 end,emu.callbackType.exec,AUDIO_FRAME,AUDIO_FRAME)
 emu.addMemoryCallback(function()
  if start and (start.left~=H.r16(0x7EDD50) or start.state~=H.r8(0x7EDD55)) then
   local s=emu.getState();rows[#rows+1]={line=start.line,finish=s['ppu.scanline'],lines=((s.masterClock-start.clock)%0x100000000)/1364,bytes=start.left-H.r16(0x7EDD50),state=H.r8(0x7EDD55)}
  end
  start=nil
 end,emu.callbackType.exec,AUDIO_DONE,AUDIO_DONE)
 local begin=H.frame
 local ready=H.waitFor(function() return H.r8(0x7EDD55)==3 end,1200)
 measuring=false
 check('idle_bank_completes',ready,H.r8(0x7EDD55)..'/'..H.r16(0x7EDD50))
 check('prefetch_zero_misses',misses==0,misses)
 local bounded=#rows>0;local maxLines=0
 for _,r in ipairs(rows) do bounded=bounded and r.line<=136 and r.finish<176 and (r.bytes==36 or r.bytes==72 or r.state==3);maxLines=math.max(maxLines,r.lines) end
 check('prefetch_admission_and_bounds',bounded,#rows)
 check('prefetch_bank_integrity',extendedDamage()==nil,extendedDamage())
 check('prefetch_driver_integrity',customDamage()==nil,customDamage())
 H.result('prefetch_frames',H.frame-begin);H.result('prefetch_misses',misses);H.result('prefetch_max_lines',maxLines);H.result('prefetch_transfers',rows)
 local base=H.r16(0x7EDD46)
 song(0x1C,4);H.wait(20)
 check('compatible_song_keeps_bank',H.r16(0x7EDD46)==base and H.r8(0x7EDD55)==3)
 check('kept_bank_integrity',extendedDamage()==nil,extendedDamage())
 song(0x3C,0);H.wait(20)
 check('tight_song_falls_back',H.r16(0x7EDD46)==0 and H.r8(0x7EDD55)==0 and extendedDamage()==nil)
 check('eviction_driver_integrity',customDamage()==nil,customDamage())
 -- A populated field reaches audio much later than the waterfall. A small
 -- bounded transfer must still make progress without adding CPU misses.
 assert(H.importSnesJs(BANK_FIELD_IMPORT));H.w8(0x316001,1);H.wait(45)
 song(7,0);H.wait(20)
 assert(H.saveStable('field-prefetch-start'));H.wait(1)
 H.load(H_OUT..'/field-prefetch-start.mss');H.wait(2)
 misses=0;disable=true;measuring=true;H.wait(1800);measuring=false;disable=false
 local baseline=misses
 H.load(H_OUT..'/field-prefetch-start.mss');H.wait(2)
 misses=0;rows={};measuring=true;begin=H.frame
 H.wait(1800);ready=H.r8(0x7EDD55)==3
 measuring=false
 check('field_idle_bank_completes',ready,H.r8(0x7EDD55)..'/'..H.r16(0x7EDD50))
 check('field_prefetch_no_added_misses',misses<=baseline,baseline..' -> '..misses)
 H.result('field_baseline_misses',baseline)
 bounded=#rows>0;maxLines=0
 for _,r in ipairs(rows) do bounded=bounded and r.line<=136 and r.finish<176;maxLines=math.max(maxLines,r.lines) end
 check('field_prefetch_bounds',bounded,#rows)
 check('field_prefetch_integrity',extendedDamage()==nil,extendedDamage())
 H.result('field_prefetch_frames',H.frame-begin);H.result('field_prefetch_misses',misses);H.result('field_prefetch_max_lines',maxLines);H.result('field_prefetch_transfers',rows)
 finish()
end
