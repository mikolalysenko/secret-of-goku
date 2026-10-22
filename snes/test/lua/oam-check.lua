-- Field OAM checker (SNES_LUA_PRELUDE) for core's partial field OAM upload
-- (core_oam_upload). After every field vblank upload (OAM_CHECK_TAIL, hex,
-- default 80:C13E: the field NMI right after the transfer hooked at
-- C0:C11E), PPU OAM is compared with the field buffer ($7E:0800, high table
-- $7E:0A00) slot by slot. A slot that shows on either side (from y on lines
-- 0-223 or wrapping past 255, x from -width+1 to 255, sizes from the PPU's
-- OBJSEL mode) must match exactly: x with bit 8, y, tile, attributes, size.
-- Hidden slots may differ. Writes OAM_CHECK_OUT (default
-- H_OUT/oam-check.txt): "uploads N mismatched M", then up to 50 mismatching
-- uploads (frame, map, the first six slots).
do -- (scoped: later test code may define globals with these names)
local out=os.getenv('OAM_CHECK_OUT') or (H_OUT..'/oam-check.txt')
local tail=tonumber(os.getenv('OAM_CHECK_TAIL') or '80C13E',16)
local function r8(a) return emu.read(a,emu.memType.snesMemory) end
local function o8(a) return emu.read(a,emu.memType.snesSpriteRam) end
local uploads,bad,details=0,0,{}
-- OBJSEL size modes 0-7: small width, height, large width, height
local sizes={[0]={8,8,16,16},{8,8,32,32},{8,8,64,64},{16,16,32,32},{16,16,64,64},{32,32,64,64},{16,32,32,64},{16,32,32,32}}
local mode=3
local function shows(x9,y,size)
  local sz=sizes[mode] or sizes[3]
  local w=size==1 and sz[3] or sz[1]
  local h=size==1 and sz[4] or sz[2]
  local x=x9>=256 and x9-512 or x9
  return ((y<224) or (y+h>256)) and (x>-w) and (x<256)
end
local function entry(get,base,hi,i)
  local x=get(base+i*4) local y=get(base+i*4+1) local t=get(base+i*4+2) local a=get(base+i*4+3)
  local bits=(get(hi+(i>>2))>>((i&3)*2))&3
  return x|((bits&1)<<8),y,t,a,(bits>>1)&1
end
local function dump()
  local fh=io.open(out,'wb')
  fh:write(string.format('uploads %d mismatched %d\n',uploads,bad))
  for _,d in ipairs(details) do fh:write(d..'\n') end
  fh:close()
end
local function check()
  uploads=uploads+1
  mode=emu.getState()['ppu.oamMode'] or 3
  local wrong={}
  for i=0,127 do
    local bx,by,bt,ba,bs=entry(r8,0x7E0800,0x7E0A00,i)
    local px,py,pt,pa,ps=entry(o8,0,0x200,i)
    if (shows(bx,by,bs) or shows(px,py,ps)) and (bx~=px or by~=py or bt~=pt or ba~=pa or bs~=ps) then
      wrong[#wrong+1]=string.format('%d buf %d,%d %02X%02X s%d ppu %d,%d %02X%02X s%d',i,bx,by,bt,ba,bs,px,py,pt,pa,ps)
    end
  end
  if #wrong>0 then
    bad=bad+1
    if #details<50 then
      details[#details+1]=string.format('frame %s map %d: %s',H and H.frame or '?',r8(0x7E00DC)|(r8(0x7E00DD)<<8),table.concat(wrong,'; ',1,math.min(#wrong,6)))
    end
    dump()
  elseif uploads%60==0 then dump() end
end
local errors=0
emu.addMemoryCallback(function()
  local ok,err=xpcall(check,debug.traceback)
  if not ok and errors<5 then
    errors=errors+1
    local fh=io.open(out..'.err','ab') fh:write(tostring(err)..'\n') fh:close()
  end
end,emu.callbackType.exec,tail,tail)
end
