import { ImageToolError, imageLimits } from './image-tool';
export function requireImageOrigin(request:Request) {
  const target=new URL(request.url),origin=request.headers.get('origin');let allowed=!origin||origin===target.origin;
  if(origin&&!allowed)try{const source=new URL(origin);allowed=target.protocol==='http:'&&source.protocol==='https:'&&source.host===target.host&&request.headers.get('x-forwarded-proto')?.split(',')[0].trim()==='https';}catch{allowed=false;}
  if(!allowed||request.headers.get('sec-fetch-site')==='cross-site')throw new ImageToolError('请从本站发起图片处理',403);
}
export async function boundedImageForm(request:Request) {
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data;'))throw new ImageToolError('图片上传格式不正确');
  if(Number(request.headers.get('content-length')||0)>imageLimits.bodyBytes)throw new ImageToolError('上传图片过大，请减少图片尺寸',413);
  const reader=request.body?.getReader();if(!reader)throw new ImageToolError('请上传图片');const parts:Uint8Array[]=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>imageLimits.bodyBytes){await reader.cancel();throw new ImageToolError('上传图片过大，请减少图片尺寸',413);}parts.push(value);}}finally{reader.releaseLock();}
  const data=new Uint8Array(length);let offset=0;for(const p of parts){data.set(p,offset);offset+=p.length;}
  return new Response(data,{headers:{'content-type':request.headers.get('content-type')!}}).formData();
}
