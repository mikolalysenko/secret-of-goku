// Collection, Frieza's actual defeat and the upgraded Beast are independent
// requirements. Old saves with Kai-delivered Balls cannot invent completion.
export function endingResult(mod){
  const quest=mod.quest?.status,frieza=mod.frieza?.status,beast=mod.challenge?.status;
  const reason=mod.worldKi?.status.fortressDestroyed?'fortress':
    quest?.seedMask!==127||quest?.mask!==127?'balls':
    frieza?.stage!=='defeated'||frieza.stolen?'frieza':
    !beast?.fed||!beast.started||!beast.won?'beast':null;
  return{outcome:reason?'bad':'good',reason};
}
export const endingEvents={depart:0xde,kai:0xe4,scatter:0x14f,reunion:0x176,clearing:0x6b};
