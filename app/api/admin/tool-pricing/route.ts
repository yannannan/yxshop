import { env } from '@/db/mysql-runtime';
import { adminDenied, getAdminContext, hasAdminPermission } from '@/lib/admin-auth';
import { validPoints } from '@/lib/points';
import { modulePrices, toolPricingModules } from '@/lib/tool-module-pricing';
import { ImageToolError } from '@/lib/image-tool';
import { requireImageOrigin } from '@/lib/image-request';
const headers={'Cache-Control':'private, no-store'};
type Tool={id:number;name:string;tool_slug:string;tool_charge_type:string;tool_points_cost:number};
export async function GET(request:Request){const admin=await getAdminContext(request);if(!admin||!hasAdminPermission(admin,'tools'))return adminDenied();try{const id=Number(new URL(request.url).searchParams.get('id'));if(!Number.isSafeInteger(id)||id<=0)throw new ImageToolError('工具参数不正确');const tool=await env.DB.prepare("SELECT id,name,tool_slug,tool_charge_type,tool_points_cost FROM products WHERE id=? AND product_type='tool'").bind(id).first<Tool>();if(!tool)throw new ImageToolError('工具不存在',404);return Response.json({tool,modules:toolPricingModules(tool.tool_slug),overrides:await modulePrices(env.DB,id,tool.tool_slug)},{headers});}catch(error){return failure(error);}}
function failure(error:unknown){if(error instanceof ImageToolError)return Response.json({message:error.message},{status:error.status,headers});console.error('工具积分配置失败',error);return Response.json({message:'积分配置暂不可用，请检查工具对应的增量SQL是否已执行'},{status:503,headers});}
export async function POST(request:Request){const admin=await getAdminContext(request);if(!admin||!hasAdminPermission(admin,'tools'))return adminDenied();try{
  requireImageOrigin(request);const raw=await request.text();if(raw.length>10000)throw new ImageToolError('积分配置参数过大');const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw new ImageToolError('积分配置参数格式不正确');const id=Number(body.id);
  if(!Number.isSafeInteger(id)||id<=0||!['free','points','paid','pending'].includes(body.chargeType)||!validPoints(body.pointsCost)||!body.overrides||typeof body.overrides!=='object'||Array.isArray(body.overrides))throw new ImageToolError('请填写有效的收费方式与正整数积分');
  await env.DB.transaction(async db=>{const tool=await db.prepare("SELECT id,name,tool_slug,tool_charge_type,tool_points_cost FROM products WHERE id=? AND product_type='tool' FOR UPDATE").bind(id).first<Tool>();if(!tool)throw new ImageToolError('工具不存在',404);if(body.chargeType==='paid'&&tool.tool_charge_type!=='paid')throw new ImageToolError('请在工具编辑中先配置付费套餐');const modules=toolPricingModules(tool.tool_slug),entries=Object.entries(body.overrides);if(entries.some(([key,cost])=>!Object.hasOwn(modules,key)||(cost!==null&&!validPoints(cost))))throw new ImageToolError('模块积分不正确，留空时使用工具默认积分');
    await db.prepare("UPDATE products SET tool_charge_type=?,tool_points_cost=?,updated_at=? WHERE id=? AND product_type='tool'").bind(body.chargeType,body.pointsCost,new Date().toISOString(),id).expectChanges(1).run();
    for(const[key,cost]of entries){if(cost===null)await db.prepare('DELETE FROM tool_module_points WHERE product_id=? AND module_key=?').bind(id,key).run();else await db.prepare('INSERT INTO tool_module_points (product_id,module_key,points_cost,updated_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE points_cost=VALUES(points_cost),updated_at=VALUES(updated_at)').bind(id,key,cost,new Date().toISOString()).run();}
  });return Response.json({ok:true},{headers});
}catch(error){return failure(error instanceof SyntaxError?new ImageToolError('积分配置参数格式不正确'):error);}}
