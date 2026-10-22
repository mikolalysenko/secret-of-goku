-- Enemy AI call recorder (SNES_LUA_PRELUDE): real inputs for
-- snes/test/core/ai-trace.test.mjs. At each enemy AI call (80:F8E9, the
-- JSL $81D942 of the native AI pass for one actor) the CPU registers and
-- bank $7E are saved: the first AIREC_FIRST calls (default 24), then every
-- AIREC_EVERY-th (default 5), at most AIREC_MAX (default 64) per test.
-- Files go to AIREC_DIR (default the test's output folder): airec<TAG>-<n>.bin
-- (the 65,536 bytes of $7E) and airec<TAG>.json (registers, video frame).
-- Copy the folders under .local/snes-test/ai-trace (or AI_TRACE_DIR) for
-- the replay. Recordings are private: they hold the game's RAM.
do -- (scoped: later test code may define globals with these names)
local dir=os.getenv('AIREC_DIR') or H_OUT
local first=tonumber(os.getenv('AIREC_FIRST') or '24')
local every=tonumber(os.getenv('AIREC_EVERY') or '5')
local max=tonumber(os.getenv('AIREC_MAX') or '64')
local tag=os.getenv('AIREC_TAG') or ''
local calls,records=0,{}
local function save()
  local fh=io.open(dir..'/airec'..tag..'.json','wb')
  local parts={}
  for _,r in ipairs(records) do
    parts[#parts+1]=string.format('{"file":"%s","frame":%d,"a":%d,"x":%d,"y":%d,"sp":%d,"d":%d,"dbr":%d,"ps":%d}',
      r.file,r.frame,r.a,r.x,r.y,r.sp,r.d,r.dbr,r.ps)
  end
  fh:write('['..table.concat(parts,',')..']')
  fh:close()
end
local function record()
  calls=calls+1
  if #records>=max then return end
  if calls>first and (calls-first)%every~=0 then return end
  local s=emu.getState()
  local name=string.format('airec%s-%d.bin',tag,#records+1)
  local fh=io.open(dir..'/'..name,'wb')
  local chunk={}
  for i=0,0xFFFF do
    chunk[#chunk+1]=string.char(emu.read(0x7E0000+i,emu.memType.snesMemory))
    if #chunk==4096 then fh:write(table.concat(chunk)) chunk={} end
  end
  fh:write(table.concat(chunk))
  fh:close()
  records[#records+1]={file=name,frame=H and H.frame or -1,a=s['cpu.a'],x=s['cpu.x'],y=s['cpu.y'],
    sp=s['cpu.sp'],d=s['cpu.d'],dbr=s['cpu.dbr'],ps=s['cpu.ps']}
  save()
end
-- FastROM runs the field loop in bank $80; a SlowROM build in $00.
emu.addMemoryCallback(record,emu.callbackType.exec,0x80F8E9,0x80F8E9)
emu.addMemoryCallback(record,emu.callbackType.exec,0x00F8E9,0x00F8E9)
end
