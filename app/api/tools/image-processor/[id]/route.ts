import { pointsUser, PointsError } from '@/lib/points-service';
import { findImageResult } from '@/lib/image-tool-service';
import { ImageToolError, imageTaskId } from '@/lib/image-tool';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'};
  try{const user=await pointsUser(request);if(!user)throw new ImageToolError('请登录后下载自己的图片',401);const{id}=await params;if(!imageTaskId(id))throw new ImageToolError('处理记录不存在',404);const found=await findImageResult(user.id,id);if(!found)throw new ImageToolError('处理记录不存在或不属于当前账号',404);const row=found.row,bytes=Buffer.from(row.image_base64,'base64'),preview=new URL(request.url).searchParams.get('preview')==='1';return new Response(bytes,{headers:{...headers,'Content-Type':row.image_format==='jpeg'?'image/jpeg':'image/png','Content-Length':String(bytes.length),'Content-Disposition':`${preview?'inline':'attachment'}; filename="yxstar-${row.action}-${row.id}.${row.image_format==='jpeg'?'jpg':'png'}"`}});}catch(error){const known=error instanceof ImageToolError||error instanceof PointsError;if(!known)console.error('图片结果读取失败',error);return Response.json({message:known?error.message:'图片读取暂不可用，请稍后重试'},{status:known?error.status:503,headers});}
}
