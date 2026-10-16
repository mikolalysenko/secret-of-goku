// The Frieza entrance, combat and training cues, rendered from the
// cartridge's instrument bank. The entrance comes first: it plays first.
import {arrivalArrangement} from './arrival-arrangement.js';
import {friezaArrangement} from './frieza-arrangement.js';
import {vegetaArrangement} from './vegeta-arrangement.js';
export const arrangements={
 arrival:()=>arrivalArrangement(),
 battle:()=>friezaArrangement(false),
 orbit:()=>friezaArrangement(true),
 vegeta:()=>vegetaArrangement(false),
 'vegeta-full-power':()=>vegetaArrangement(true),
};
