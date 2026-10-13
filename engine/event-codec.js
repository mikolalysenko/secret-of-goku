// Secret of Mana US native event/text format. No cartridge content is stored here.
const punctuation={'.':0xbf,',':0xc0,'/':0xc1,"'":0xc2,'[':0xc3,']':0xc4,':':0xc5,'-':0xc6,'%':0xc7,'!':0xc8,'&':0xc9,'?':0xca,'(':0xcb,')':0xcc,'*':0xcd,'^':0xce};
const inverse=Object.fromEntries(Object.entries(punctuation).map(([k,v])=>[v,k]));
export function encodeText(text){
  const out=[];
  for(let i=0;i<text.length;i++){
    const c=text[i],n=c.charCodeAt(0);
    if(c==='<'&&/^[a-f0-9]{2}>$/.test(text.slice(i+1,i+4))){out.push(parseInt(text.slice(i+1,i+3),16));i+=3;}
    else if(c==='{'&&/^[012]}$/.test(text.slice(i+1,i+3))){out.push(0x57,Number(text[i+1]));i+=2;}
    else if(c==='\n')out.push(0x7f);
    else if(c===' ')out.push(0x80);
    else if(n>=97&&n<=122)out.push(n+32);
    else if(n>=65&&n<=90)out.push(n+90);
    else if(n>=48&&n<=57)out.push(n+133);
    else if(c in punctuation)out.push(punctuation[c]);
    else throw Error(`Unsupported event glyph ${JSON.stringify(c)}`);
  }
  return out;
}
export function decodeText(bytes){
  let result='';
  for(let i=0;i<bytes.length;i++){
    const b=bytes[i];
    if(b===0x57)result+=`{${bytes[++i]}}`;
    else result+=b===0x7f?'\n':b===0x80?' ':b>=0x81&&b<=0x9a?String.fromCharCode(b-32):b>=0x9b&&b<=0xb4?String.fromCharCode(b-90):b>=0xb5&&b<=0xbe?String.fromCharCode(b-133):inverse[b]??`<${b.toString(16)}>`;
  }
  return result;
}
export function eventRange(rom,id){
  const bank=id<0x400?0x90000:0xa0000,index=id&0x3ff,word=at=>rom[at]|rom[at+1]<<8;
  return{start:bank+word(bank+index*2),end:id===0x3ff?0x9f2d7:bank+word(bank+(index+1)*2)};
}
export function commandLength(bytes,i){
  const op=bytes[i];
  // Credits use literal ASCII between 7D/7E. Those letters must never be
  // interpreted as event opcodes or character-name escapes by the compiler.
  if(op===0x7d){let end=i+1;while(end<bytes.length&&bytes[end]!==0x7e)end++;return Math.min(bytes.length,end+1)-i;}
  if(op>=0x80||op===0x7f)return 1;
  if(op===0x2d)return bytes[i+1]===5||bytes[i+1]===6||(bytes[i+1]>=0x80&&bytes[i+1]<=0x8f)?4:2;
  if(op>=0x10&&op<=0x2f)return 2;
  if([0x30,0x31,0x32,0x33,0x34,0x36,0x37].includes(op))return 3;
  if([0x38,0x39,0x3a,0x3b,0x3c].includes(op))return 4;
  if([0x40,0x41,0x42,0x43].includes(op))return 5;
  if(op>=0x48&&op<=0x4e)return 6;
  if([0x57,0x59,0x5a].includes(op))return 2;
  return 1;
}
export function parseEvent(rom,id){
  const{start,end}=eventRange(rom,id),bytes=rom.slice(start,end),ops=[];
  for(let i=0;i<bytes.length;){
    const begin=i,op=bytes[i];
    if(op>=0x7f||op===0x57){
      do{i+=bytes[i]===0x57?2:1;}while(i<bytes.length&&(bytes[i]>=0x7f||bytes[i]===0x57));
      ops.push({at:start+begin,op:'text',text:decodeText(bytes.slice(begin,i)),bytes:Array.from(bytes.slice(begin,i))});
    }else{const length=commandLength(bytes,i);i+=length;ops.push({at:start+begin,op,bytes:Array.from(bytes.slice(begin,i))});}
  }
  return{id,start,end,ops};
}
export function wrapText(text,width=28){
  return text.split('\n').map(line=>{
    const result=[];let current='';
    for(const word of line.split(' ')){
      const next=current?current+' '+word:word;
      if(next.replace(/\{[012]\}/g,'XXXXXX').length>width&&current){result.push(current);current=word;}else current=next;
    }
    result.push(current);return result.join('\n');
  }).join('\n');
}
export function dialoguePages(text){
  const lines=wrapText(text).split('\n'),bytes=[];
  for(let i=0;i<lines.length;i+=3){if(i)bytes.push(0x28,0,0x52);bytes.push(...encodeText(lines.slice(i,i+3).join('\n')));}
  return bytes;
}
