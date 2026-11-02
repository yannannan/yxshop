import { deflateSync } from 'node:zlib';
import jpeg from 'jpeg-js';
import type { RasterImage } from './image-tool';
const crcTable = Uint32Array.from({length:256},(_,value)=>{ let n=value;for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0; });
function chunk(type: string, data: Buffer) { const name=Buffer.from(type),body=Buffer.concat([name,data]);let crc=0xffffffff;for(const b of body)crc=crcTable[(crc^b)&255]^(crc>>>8);const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,body,tail]); }
export function encodePng(image: RasterImage) {
  const head=Buffer.alloc(13);head.writeUInt32BE(image.width,0);head.writeUInt32BE(image.height,4);head[8]=8;head[9]=6;
  const stride=image.width*4,raw=Buffer.alloc((stride+1)*image.height);
  // Sub filtering makes photographic RGBA output smaller without losing alpha.
  for(let y=0;y<image.height;y++) { const row=y*(stride+1);raw[row]=1;for(let x=0;x<stride;x++)raw[row+x+1]=(image.data[y*stride+x]-(x>=4?image.data[y*stride+x-4]:0))&255; }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}
export function encodeJpeg(image: RasterImage, quality: number, background: string) {
  const colors=background.slice(1).match(/../g)!.map(value=>parseInt(value,16)),data=Buffer.from(image.data);
  for(let i=0;i<data.length;i+=4) { const alpha=data[i+3]/255;for(let c=0;c<3;c++)data[i+c]=Math.round(data[i+c]*alpha+colors[c]*(1-alpha));data[i+3]=255; }
  return Buffer.from(jpeg.encode({data,width:image.width,height:image.height},quality).data);
}
