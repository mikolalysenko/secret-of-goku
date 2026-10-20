// Standard IPS records: 24-bit offsets, 16-bit lengths, optional RLE.
// Expansion is expressed by a record at the final byte (no size extension),
// for compatibility with older patchers. IPS does not validate the input ROM.
const LIMIT=0x1000000, EOF=0x454F46, MAX_RECORD=0xFFFF;
const byte=(bytes,i)=>bytes[i]??0;

export function createIps(source,target){
  if(!(source instanceof Uint8Array)||!(target instanceof Uint8Array))throw Error('IPS expects byte arrays');
  if(!target.length||target.length<source.length||target.length>LIMIT)throw Error('IPS release target must be nonempty, at least the source size, and at most 16 MiB');
  const parts=[Buffer.from('PATCH')];
  const changed=i=>byte(source,i)!==target[i]||(target.length>source.length&&i===target.length-1);
  for(let pos=0;pos<target.length;){
    while(pos<target.length&&!changed(pos))pos++;
    if(pos===target.length)break;
    // A record at 0x454F46 would be mistaken for the EOF marker. Include
    // the preceding byte instead; overlapping an earlier record is legal.
    const start=pos===EOF?pos-1:pos;
    let end=pos+1;
    for(let i=end;i<target.length&&i-start<MAX_RECORD;i++){
      if(changed(i))end=i+1;
      else if(i-end>=5)break; // a short equal gap costs less than a new header
    }
    const data=target.subarray(start,end),rle=data.length>3&&data.every(v=>v===data[0]);
    const record=Buffer.alloc(rle?8:5+data.length);
    record.writeUIntBE(start,0,3);
    if(rle){record.writeUInt16BE(data.length,5);record[7]=data[0];}
    else{record.writeUInt16BE(data.length,3);record.set(data,5);}
    parts.push(record);pos=end;
  }
  parts.push(Buffer.from('EOF'));
  return Buffer.concat(parts);
}

export function applyIps(source,patch){
  patch=Buffer.from(patch);
  if(source.length>LIMIT||patch.subarray(0,5).toString()!=='PATCH')throw Error('Invalid IPS input');
  const records=[];let pos=5,size=source.length;
  function need(n){if(pos+n>patch.length)throw Error('Truncated IPS record');}
  for(;;){
    need(3);const offset=patch.readUIntBE(pos,3);pos+=3;
    if(offset===EOF)break;
    need(2);let length=patch.readUInt16BE(pos);pos+=2;
    let value=null,data=null;
    if(length===0){need(3);length=patch.readUInt16BE(pos);value=patch[pos+2];pos+=3;if(!length)throw Error('Empty IPS RLE record');}
    else{need(length);data=patch.subarray(pos,pos+length);pos+=length;}
    if(offset+length>LIMIT)throw Error('IPS record exceeds 16 MiB');
    size=Math.max(size,offset+length);records.push({offset,length,value,data});
  }
  const trailing=patch.length-pos;
  if(trailing!==0&&trailing!==3)throw Error('Invalid IPS footer');
  const out=Buffer.alloc(size);out.set(source);
  for(const r of records){if(r.data)out.set(r.data,r.offset);else out.fill(r.value,r.offset,r.offset+r.length);}
  if(trailing===3){const n=patch.readUIntBE(pos,3);if(n<=size)return out.subarray(0,n);const expanded=Buffer.alloc(n);expanded.set(out);return expanded;}
  return out;
}
