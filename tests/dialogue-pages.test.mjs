import test from 'node:test';
import assert from 'node:assert/strict';
import {dialoguePagesOf} from '../engine/event-codec.js';

test('pages break between speakers and split long speeches evenly',()=>{
  assert.deepEqual(dialoguePagesOf('FRIEZA:Now give me that\nlast Dragon Ball.\nGOKU:You could have\njust asked Dryad nicely.'),
    ['FRIEZA:Now give me that\nlast Dragon Ball.','GOKU:You could have\njust asked Dryad nicely.']);
  assert.deepEqual(dialoguePagesOf('KING KAI:\nDodge his Death Balls!\nLead his chasing discs\nback into HIM!'),
    ['KING KAI:\nDodge his Death Balls!','Lead his chasing discs\nback into HIM!'],'4 lines read 2+2, never 3+1');
  assert.deepEqual(dialoguePagesOf('{1}:Hi!\nGOKU:Hello!\n{2}:Yo!'),['{1}:Hi!\nGOKU:Hello!\n{2}:Yo!'],'short speeches share a page');
  for(const text of['A\nB\nC\nD\nE\nF\nG','GOKU:One two three four five six seven eight nine ten eleven twelve thirteen'])
    for(const page of dialoguePagesOf(text))assert.ok(page.split('\n').length<=3);
});
