import { createHash } from 'node:crypto';
import { pointsUser, PointsError } from '@/lib/points-service';
import { ImageToolError, imageLimits, imageTaskId, isImageAction, parseImageOptions, type RasterImage, type ImageAction } from '@/lib/image-tool';
import { boundedImageForm, requireImageOrigin } from '@/lib/image-request';
import { findImageResult, getImageTool, imageAccess, saveImageResult } from '@/lib/image-tool-service';
import { processImages } from '@/lib/image-processing';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
let processing=0;
function failure(error:unknown){if(error instanceof ImageToolError||error instanceof PointsError)return Response.json({message:error.message},{status:error.status,headers});console.error('图片处理失败',{name:(error as Error)?.name,code:(error as {code?:string})?.code});return Response.json({message:['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes((error as {code?:string}).code||'')?'请先执行12号图片处理增量SQL，再使用此工具':'图片处理暂不可用，请重试本次任务；成功任务不会重复扣分'},{status:503,headers});}
export async function GET(request:Request){try{const user=await pointsUser(request),id=new URL(request.url).searchParams.get('result');if(id!==null){if(!user)throw new ImageToolError('请登录后下载自己的图片',401);if(!imageTaskId(id))throw new ImageToolError('处理记录不存在',404);const found=await findImageResult(user.id,id);if(!found)throw new ImageToolError('处理记录不存在或不属于当前账号',404);return Response.json({result:found.result},{headers});}return Response.json(await imageAccess(await getImageTool(),user),{headers});}catch(error){return failure(error);}}
export async function POST(request:Request){
  let acquired=false;
  try{
    requireImageOrigin(request);const user=await pointsUser(request);if(!user)throw new ImageToolError('请登录后处理图片',401);
    if(processing>=2)throw new ImageToolError('图片处理繁忙，请稍后重试',429);processing++;acquired=true;
    const form=await boundedImageForm(request),metaValue=form.get('metadata');if(typeof metaValue!=='string'||metaValue.length>12000)throw new ImageToolError('图片参数格式不正确');
    const meta=JSON.parse(metaValue);if(!meta||!imageTaskId(meta.id)||!isImageAction(meta.action)||!Array.isArray(meta.images)||!meta.images.length||meta.images.length>imageLimits.files||!['free','paid','points','pending'].includes(meta.chargeType)||!Number.isSafeInteger(meta.cost)||meta.cost<0)throw new ImageToolError('图片任务参数不正确');
    const options=parseImageOptions(meta.options),files=form.getAll('images');if(files.length!==meta.images.length)throw new ImageToolError('上传图片数量不正确');
    const images:RasterImage[]=[],hash=createHash('sha256').update(JSON.stringify({action:meta.action,options,images:meta.images}));let total=0;
    for(let i=0;i<files.length;i++){const file=files[i],info=meta.images[i];if(typeof file==='string'||!info||!Number.isInteger(info.width)||!Number.isInteger(info.height)||info.width<1||info.height<1||info.width>4000||info.height>4000||info.width*info.height>imageLimits.imagePixels)throw new ImageToolError('图片尺寸不正确');total+=info.width*info.height;if(total>imageLimits.inputPixels||file.size!==info.width*info.height*4)throw new ImageToolError('图片像素数据过大或不完整');const data=new Uint8Array(await file.arrayBuffer());hash.update(data);images.push({width:info.width,height:info.height,data});}
    const fingerprint=hash.digest('hex'),tool=await getImageTool(),previous=await findImageResult(user.id,meta.id,fingerprint);if(previous)return Response.json({result:previous.result},{headers});
    const access=await imageAccess(tool,user);if(!access.canProcess)throw new ImageToolError('暂无有效使用权益，请先配置或购买',402);
    if(access.chargeType!==meta.chargeType||access.costs[meta.action as ImageAction]!==meta.cost)throw new ImageToolError('积分价格已变化，请刷新后重新处理',409);
    if(access.chargeType==='points'&&!access.hasMembership&&access.pointsBalance<meta.cost)throw new ImageToolError('积分不足，请充值后再试',402);
    const image=await processImages(images,meta.action,options),result=await saveImageResult(user.id,tool.id,meta.id,fingerprint,meta.action,{chargeType:meta.chargeType,cost:meta.cost},image);
    return Response.json({result},{headers});
  }catch(error){return failure(error instanceof SyntaxError?new ImageToolError('图片参数格式不正确'):error);}finally{if(acquired)processing--;}
}
