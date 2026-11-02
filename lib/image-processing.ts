import { ImageToolError, imageLimits, type ImageAction, type ImageOptions, type RasterImage } from './image-tool';
import { encodeJpeg, encodePng } from './raster-codec';
import { renderImageText } from './stamp-renderer';
const rgb=(hex:string)=>hex.slice(1).match(/../g)!.map(value=>parseInt(value,16));
const clamp=(n:number)=>Math.max(0,Math.min(255,Math.round(n)));
function area(image:RasterImage,options:ImageOptions) { const r=options.rect;if(!r)throw new ImageToolError('请先在原图上框选处理区域');const x=Math.floor(r.x*image.width),y=Math.floor(r.y*image.height),width=Math.min(image.width-x,Math.max(1,Math.round(r.width*image.width))),height=Math.min(image.height-y,Math.max(1,Math.round(r.height*image.height)));if(width*height>image.width*image.height*.4)throw new ImageToolError('圈选区域过大，请分成较小区域处理');return{x,y,width,height}; }
function repairArea(image:RasterImage,options:ImageOptions) {
  const {x,y,width,height}=area(image,options),source=image.data,out=new Uint8Array(source);
  // Interpolate opposing boundary samples; useful for small marks on simple backgrounds.
  for(let dy=0;dy<height;dy++)for(let dx=0;dx<width;dx++) { const p=((y+dy)*image.width+x+dx)*4;const edges=[{x:x-1,y:y+dy,d:dx+1},{x:x+width,y:y+dy,d:width-dx},{x:x+dx,y:y-1,d:dy+1},{x:x+dx,y:y+height,d:height-dy}].filter(e=>e.x>=0&&e.x<image.width&&e.y>=0&&e.y<image.height);if(!edges.length)throw new ImageToolError('请保留圈选区域周围的背景');const weight=edges.reduce((n,e)=>n+1/(e.d*e.d),0);for(let c=0;c<4;c++)out[p+c]=clamp(edges.reduce((n,e)=>n+source[(e.y*image.width+e.x)*4+c]/(e.d*e.d),0)/weight); }
  return {...image,data:out};
}
function filter(image:RasterImage,action:ImageAction,strength:number) {
  const out=new Uint8Array(image.data),{width,height,data}=image;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const p=(y*width+x)*4;for(let c=0;c<3;c++){let sum=0,count=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const v=data[((y+dy)*width+x+dx)*4+c];if(action==='sharpen'||Math.abs(v-data[p+c])<48){sum+=v;count++;}}const mean=sum/Math.max(1,count);out[p+c]=clamp(action==='sharpen'?data[p+c]+(data[p+c]-mean)*strength:mean);}}
  return {...image,data:out};
}
function cutout(image:RasterImage,o:ImageOptions) {
  const {width,height,data}=image,out=new Uint8Array(data),colors=rgb(o.background),seen=new Uint8Array(width*height),queue=new Int32Array(width*height);let start=0,end=0;
  const add=(i:number)=>{if(seen[i])return;seen[i]=1;const p=i*4;if(Math.max(...colors.map((v,c)=>Math.abs(v-data[p+c])))<=o.tolerance){queue[end++]=i;out[p+3]=0;}};
  for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
  while(start<end){const p=queue[start++],x=p%width,y=Math.floor(p/width);if(x>0)add(p-1);if(x<width-1)add(p+1);if(y>0)add(p-width);if(y<height-1)add(p+width);}
  if(!end)throw new ImageToolError('没有找到匹配的边缘背景，请调整背景色或容差');
  return {...image,data:out};
}
function stitch(images:RasterImage[],o:ImageOptions) {
  const columns=o.direction==='horizontal'?images.length:o.direction==='vertical'?1:Math.min(images.length,o.columns),rows=Math.ceil(images.length/columns),widths=Array(columns).fill(0) as number[],heights=Array(rows).fill(0) as number[];
  images.forEach((im,i)=>{widths[i%columns]=Math.max(widths[i%columns],im.width);heights[Math.floor(i/columns)]=Math.max(heights[Math.floor(i/columns)],im.height);});
  const width=widths.reduce((a,b)=>a+b,0)+o.gap*(columns-1),height=heights.reduce((a,b)=>a+b,0)+o.gap*(rows-1);
  if(width*height>imageLimits.outputPixels||width>12000||height>12000)throw new ImageToolError('拼接尺寸过大，请减少图片数量或尺寸');
  const data=new Uint8Array(width*height*4),colors=rgb(o.background);for(let p=0;p<data.length;p+=4){data[p]=colors[0];data[p+1]=colors[1];data[p+2]=colors[2];data[p+3]=255;}
  images.forEach((im,i)=>{const col=i%columns,row=Math.floor(i/columns),x=widths.slice(0,col).reduce((a,b)=>a+b,0)+o.gap*col+Math.floor((widths[col]-im.width)/2),y=heights.slice(0,row).reduce((a,b)=>a+b,0)+o.gap*row+Math.floor((heights[row]-im.height)/2);for(let dy=0;dy<im.height;dy++)for(let dx=0;dx<im.width;dx++){const a=(dy*im.width+dx)*4,b=((y+dy)*width+x+dx)*4,alpha=im.data[a+3]/255;for(let c=0;c<3;c++)data[b+c]=clamp(im.data[a+c]*alpha+data[b+c]*(1-alpha));}});
  return {width,height,data};
}
export async function processImages(images:RasterImage[],action:ImageAction,options:ImageOptions) {
  if(!images.length||images.length>imageLimits.files||images.some(im=>!Number.isInteger(im.width)||!Number.isInteger(im.height)||im.width<1||im.height<1||im.width>4000||im.height>4000||im.width*im.height>imageLimits.imagePixels||im.data.length!==im.width*im.height*4)||images.reduce((n,im)=>n+im.width*im.height,0)>imageLimits.inputPixels)throw new ImageToolError('图片数量、尺寸或像素数据不正确');
  if(action!=='stitch'&&images.length!==1)throw new ImageToolError('当前功能每次处理一张图片');
  if(action==='stitch'&&images.length<2)throw new ImageToolError('请至少上传两张图片进行拼接');
  let result={...images[0],data:new Uint8Array(images[0].data)};
  if(action==='stitch')result=stitch(images,options);
  else if(['watermark','erase'].includes(action)||(action==='repair'&&options.rect))result=repairArea(result,options);
  else if(['sharpen','repair'].includes(action))result=filter(result,action,options.strength);
  else if(action==='cutout')result=cutout(result,options);
  else if(action==='text') { const r=area(result,options);if(!options.text.trim())throw new ImageToolError('请填写替换文字');const layer=await renderImageText(r.width,r.height,options.text,options.fontSize,options.textColor,options.background);for(let y=0;y<r.height;y++)result.data.set(layer.subarray(y*r.width*4,(y+1)*r.width*4),((r.y+y)*result.width+r.x)*4); }
  const format=action==='cutout'?'png':options.format,bytes=format==='jpeg'?encodeJpeg(result,options.quality,options.background):encodePng(result);
  if(bytes.length>imageLimits.outputBytes)throw new ImageToolError('结果文件过大，请改用JPG格式或减少图片');
  return {bytes,width:result.width,height:result.height,format};
}
