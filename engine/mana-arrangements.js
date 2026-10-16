// The four combat/training cues rendered from the cartridge's instrument bank.
import {friezaArrangement} from './frieza-arrangement.js';
import {vegetaArrangement} from './vegeta-arrangement.js';
export const arrangements={
 battle:()=>friezaArrangement(false),
 orbit:()=>friezaArrangement(true),
 vegeta:()=>vegetaArrangement(false),
 'vegeta-full-power':()=>vegetaArrangement(true),
};
