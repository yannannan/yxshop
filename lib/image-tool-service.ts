import { env } from '@/db/mysql-runtime';
import { consumePoints, lockPointsUser, pointsBalance } from './points-service';
import { getToolEntitlement, usableToolOrder, type ToolOrderAccess } from './tool-entitlements';
import { modulePrices } from './tool-module-pricing';
import { imageActions, imageToolSlug, ImageToolError, type ImageAction, type ImageAccess, type ImageResult } from './image-tool';
type Tool={id:number;tool_slug:string;tool_charge_type:string;tool_points_cost:number};
type Stored={id:string;user_id:number;product_id:number;request_hash:string;action:ImageAction;image_base64:string;image_width:number;image_height:number;image_format:'png'|'jpeg';image_bytes:number;points_spent:number;created_at:string};
const publicResult=(row:Omit<Stored,'image_base64'>,reused:boolean):ImageResult=>({id:row.id,action:row.action,width:Number(row.image_width),height:Number(row.image_height),format:row.image_format,bytes:Number(row.image_bytes),pointsSpent:Number(row.points_spent),createdAt:row.created_at,reused,downloadUrl:`/api/tools/image-processor/${row.id}`});
export async function getImageTool():Promise<Tool> {
  const tool=await env.DB.prepare("SELECT id,tool_slug,tool_charge_type,tool_points_cost FROM products WHERE tool_slug=? AND product_type='tool' AND status='active'").bind(imageToolSlug).first<Tool>();
  if(!tool)throw new ImageToolError('图片工具不存在或已停用',404);
  if(!['free','paid','points','pending'].includes(tool.tool_charge_type))throw new ImageToolError('工具收费配置异常',409);
  return tool;
}
export async function imageAccess(tool:Tool,user:{id:number}|null):Promise<ImageAccess> {
  const overrides=await modulePrices(env.DB,tool.id,imageToolSlug),order=user&&['points','paid'].includes(tool.tool_charge_type)?await getToolEntitlement(user.id,tool.id):null;
  const balance=user?await pointsBalance(user.id):0;
  const costs=Object.fromEntries(Object.keys(imageActions).map(action=>[action,tool.tool_charge_type==='points'?overrides[action]??Number(tool.tool_points_cost):0])) as Record<ImageAction,number>;
  const recent=user?(await env.DB.prepare('SELECT id,user_id,product_id,request_hash,action,image_width,image_height,image_format,image_bytes,points_spent,created_at FROM image_processing_results WHERE user_id=? AND product_id=? ORDER BY created_at DESC,id DESC LIMIT 5').bind(user.id,tool.id).all<Omit<Stored,'image_base64'>>()).results:[];
  return {signedIn:Boolean(user),chargeType:tool.tool_charge_type,pointsBalance:balance,hasMembership:Boolean(order),costs,canProcess:Boolean(user)&&tool.tool_charge_type!=='pending'&&(tool.tool_charge_type!=='paid'||Boolean(order)),recent:recent.map(row=>publicResult(row,true))};
}
export async function findImageResult(userId:number,id:string,hash?:string) {
  const row=await env.DB.prepare('SELECT * FROM image_processing_results WHERE id=? AND user_id=?').bind(id,userId).first<Stored>();
  if(row&&hash&&row.request_hash!==hash)throw new ImageToolError('图片或参数已变化，请重新发起处理',409);
  return row?{row,result:publicResult(row,true)}:null;
}
export async function saveImageResult(userId:number,toolId:number,id:string,hash:string,action:ImageAction,quote:{chargeType:string;cost:number},image:{bytes:Buffer;width:number;height:number;format:'png'|'jpeg'}):Promise<ImageResult> {
  return env.DB.transaction(async db=>{
    await lockPointsUser(db,userId);
    const previous=await db.prepare('SELECT * FROM image_processing_results WHERE id=? FOR UPDATE').bind(id).first<Stored>();
    if(previous){if(Number(previous.user_id)!==userId||Number(previous.product_id)!==toolId||previous.request_hash!==hash)throw new ImageToolError('处理任务与当前请求不匹配',409);return publicResult(previous,true);}
    const tool=await db.prepare("SELECT id,tool_slug,tool_charge_type,tool_points_cost FROM products WHERE id=? AND tool_slug=? AND product_type='tool' AND status='active' FOR UPDATE").bind(toolId,imageToolSlug).first<Tool>();
    if(!tool||tool.tool_charge_type==='pending')throw new ImageToolError('工具配置已变化，请刷新页面后重试',409);
    const costs=await modulePrices(db,toolId,imageToolSlug),cost=tool.tool_charge_type==='points'?costs[action]??Number(tool.tool_points_cost):0;
    if(tool.tool_charge_type!==quote.chargeType||cost!==quote.cost)throw new ImageToolError('积分价格已变化，请刷新后重新处理',409);
    const {results}=await db.prepare("SELECT id,tool_billing_cycle,tool_paid_at,tool_uses_remaining FROM orders WHERE user_id=? AND product_id=? AND status IN ('paid','pending_delivery','delivered') ORDER BY created_at,id FOR UPDATE").bind(userId,toolId).all<ToolOrderAccess>();
    const order=['points','paid'].includes(tool.tool_charge_type)?results.filter(row=>usableToolOrder(row)).sort((a,b)=>Number(a.tool_billing_cycle==='times')-Number(b.tool_billing_cycle==='times'))[0]:null;
    if(tool.tool_charge_type==='paid'&&!order)throw new ImageToolError('暂无有效套餐，请购买后处理',402);
    const points=tool.tool_charge_type==='points'&&!order?await consumePoints(db,userId,toolId,cost,`image:${id}`):null;
    const now=new Date().toISOString();
    if(order){if(order.tool_billing_cycle==='times')await db.prepare('UPDATE orders SET tool_uses_remaining=tool_uses_remaining-1 WHERE id=? AND user_id=? AND tool_uses_remaining>0').bind(order.id,userId).expectChanges(1).run();await db.prepare('INSERT INTO tool_usage_events (operation_id,order_id,created_at) VALUES (?,?,?)').bind(`image:${id}`,order.id,now).run();}
    const row:Stored={id,user_id:userId,product_id:toolId,request_hash:hash,action,image_base64:image.bytes.toString('base64'),image_width:image.width,image_height:image.height,image_format:image.format,image_bytes:image.bytes.length,points_spent:points?.pointsSpent||0,created_at:now};
    await db.prepare('INSERT INTO image_processing_results (id,user_id,product_id,request_hash,action,image_base64,image_width,image_height,image_format,image_bytes,points_spent,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,userId,toolId,hash,action,row.image_base64,image.width,image.height,image.format,image.bytes.length,row.points_spent,now).run();
    return publicResult(row,false);
  });
}
