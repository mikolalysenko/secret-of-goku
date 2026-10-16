import {compileStoryEvent} from './story-compiler.js';
import {box,call} from './story-events.js';
import {friezaEvents as F} from './frieza-events.js';
import {crisisDialogue} from './frieza-crisis.js';
import {treeTiming} from './frieza-staging.js';

// Keep the native ash field, spirit scene and rewards. The confrontation
// has one camera and one departure, before returning to the Tree's spirit.
export function buildFriezaTree(event,mask){
 const compile=ops=>compileStoryEvent({...event,ops},mask,{textOverrides:{...crisisDialogue,
  0xa7a0a:'GOKU:His ki is here.\nWe caught up!',
  0xa7a41:'GOKU:There!',
  0xa7d30:'GOKU:The Tree...\nCan you still hear me?',
  0xa7d5c:'LUKA:Her roots are alive.\nI can still feel her Mana.',
  0xa7d8d:'\nListen, Goku.',
  0xa7da7:'LUKA:Goku! I felt her fall.\nWhat has that monster done?!',
  0xa7de1:'MANA TREE:Goku...\nMy body is gone. My roots\nstill shelter the souls.',
 }});
 const prefix=event.ops.filter(o=>o.at<0xa7a03);
 const tail=[];
 for(const op of event.ops.filter(o=>o.at>=0xa7cc7)){
  // Retail 04 and 05 both toggle party visibility. Our vista still has the
  // camera party hidden; the original intervening reveal was removed. Skip
  // its extra hide here so the retained 05 shows them after ash-field setup.
  if(op.at===0xa7cc7)continue;
  if(op.at===0xa7cef)tail.push({op:-1,bytes:[0x28,2,...call(F.treeWake)]});
  if(op.at===0xa855f)tail.push({op:-1,bytes:call(F.treeDone)});
  tail.push(op);
 }
 // No retail thrown-camera or post-blast party movement on the vista. All
 // actor/camera restoration happens at its real door into the ash field.
 return [...compile(prefix),0x29,1,0x32,4,0,0x32,5,0,0x32,6,0,8,...call(F.treeArrival),0x28,24,
  ...box('FRIEZA:Come out, old Tree.\nI know you guard the\neighth Dragon Ball.'),
  ...box('MANA TREE:I guard lives.\nThere is no Dragon Ball\nhidden in my roots.'),
  ...box('FRIEZA:Then perhaps I\nshould dig a little deeper.'),...call(F.treeCharge),0x28,16,
  ...box('GOKU:Leave her alone!\nDryad gave the Ball to ME!'),
  ...box('FRIEZA:You had it all\nalong? Filthy monkey!\nThen the Tree is useless.'),
  ...box('GOKU:FRIEZA!'),...call(F.treeShot),0x28,treeTiming.throw/5,
  ...call(F.treeImpact),...call(0x72d),0x28,32,
  ...box('GOKU:You destroyed her!\nShe was protecting everyone!'),
  ...box('FRIEZA:Bring the eighth\nBall to the Mana Fortress.\nOr I finish the job.'),
  ...call(F.treeLeave),0x28,24,
  ...box('GOKU:He is gone...\nWe have to help the Tree.'),
  ...call(F.treeReturn),0x28,12,0x30,0x46,8,...compile(tail)];
}
