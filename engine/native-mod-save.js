// Sidecar state for native GAME FILE saves. The SRAM bytes and checksums are
// untouched. Each sidecar is bound to the exact native record, including the
// backup selected by the retail validator, so another slot cannot inherit it.
export function createNativeModSave(snes,mod,battery){
 const c=snes.cpu,cycle=c.cycle;let loading=null;
 const fields=['quest','frieza','worldKi','barriers','ceiling','challenge','powerIntro','sandship'];
 c.cycle=function(){
  if(this.cyclesLeft===0&&(this.r[1]&63)===7){
   if(this.br[4]===0x55d9)battery.stageMetadata(this.br[1],{version:1,...Object.fromEntries(fields.map(k=>[k,mod[k]?.snapshot()]))});
   if(this.br[4]===0x558f)loading=this.br[1]-3;
   if(this.br[4]===0x55c5&&loading!==null){
    const saved=battery.metadataFor(loading);loading=null;
    for(const key of fields)mod[key]?.restore(saved?.version===1?saved[key]:undefined);
   }
  }
  return cycle.call(this);
 };
 return{dispose(){c.cycle=cycle;}};
}
