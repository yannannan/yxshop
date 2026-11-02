import { env } from '@/db/mysql-runtime';
import { imageActions, imageToolSlug } from './image-tool';
import type { PointsDatabase } from './points-service';
export const toolPricingModules = (slug:string):Record<string,string> => slug===imageToolSlug ? imageActions : {};
export async function modulePrices(db:PointsDatabase,productId:number,slug:string):Promise<Record<string,number>> {
  if(!Object.keys(toolPricingModules(slug)).length)return {};
  const {results}=await db.prepare('SELECT module_key,points_cost FROM tool_module_points WHERE product_id=?').bind(productId).all<{module_key:string;points_cost:number}>();
  return Object.fromEntries(results.filter(row=>Object.hasOwn(toolPricingModules(slug),row.module_key)).map(row=>[row.module_key,Number(row.points_cost)]));
}
export const readModulePrices=(productId:number,slug:string)=>modulePrices(env.DB,productId,slug);
