import { imageLimits, type ImageAccess, type ImageAction, type ImageOptions, type ImageResult } from './image-tool';
export type UploadedImage={key:string;name:string;width:number;height:number;originalBytes:number;url:string;pixels:Blob};
export async function readUploadedImage(file:File):Promise<UploadedImage> {
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('请上传20MB以内的JPG、PNG或WebP图片');
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  try{if(bitmap.width*bitmap.height>40_000_000)throw Error('原图尺寸过大，请先缩小图片');const scale=Math.min(1,Math.sqrt(imageLimits.imagePixels/(bitmap.width*bitmap.height)),4000/bitmap.width,4000/bitmap.height),width=Math.max(1,Math.floor(bitmap.width*scale)),height=Math.max(1,Math.floor(bitmap.height*scale)),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw Error('浏览器暂不支持图片处理');context.drawImage(bitmap,0,0,width,height);const rgba=context.getImageData(0,0,width,height).data;const preview=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('图片读取失败')),'image/png'));return {key:crypto.randomUUID(),name:file.name,width,height,originalBytes:file.size,url:URL.createObjectURL(preview),pixels:new Blob([rgba],{type:'application/octet-stream'})};}finally{bitmap.close();}
}
export async function submitImages(id:string,images:UploadedImage[],action:ImageAction,options:ImageOptions,access:ImageAccess,signal:AbortSignal) {
  const selected=action==='stitch'?images:images.slice(0,1);if(selected.reduce((sum,image)=>sum+image.width*image.height,0)>imageLimits.inputPixels)throw Error('图片总像素过大，请减少图片数量');
  const body=new FormData();body.set('metadata',JSON.stringify({id,action,options,chargeType:access.chargeType,cost:access.costs[action],images:selected.map(image=>({width:image.width,height:image.height}))}));selected.forEach(image=>body.append('images',image.pixels,'image.rgba'));
  const response=await fetch('/api/tools/image-processor',{method:'POST',body,signal}),data=await response.json().catch(()=>null) as {result?:ImageResult;message?:string}|null;if(!response.ok||!data?.result)throw Error(data?.message||'图片处理失败，请重试');return data.result;
}
