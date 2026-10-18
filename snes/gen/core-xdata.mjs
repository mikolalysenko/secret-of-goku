// Core: a 32-byte extended-data probe, so the core test can check the
// ExHiROM mapping and the xdata address assignment end to end
// (snes/test/core/xdata.lua reads it at !XDATA_CORE_PROBE).
export const PROBE_TEXT='SECRET OF GOKU XDATA PROBE';
export function generate({xdata}){
  const bytes=new Uint8Array(32);
  bytes.set(new TextEncoder().encode(PROBE_TEXT));
  bytes[30]=0x5A;bytes[31]=0xA5;
  xdata('core_probe',bytes);
}
