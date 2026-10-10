import {categoryAliases,productAliases} from '../../../../packages/contracts/legacy-urls.js';
// routes: handles this module with server validation and explicit trust boundaries.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../database/db.js';
import type { Product,Variant } from '../../../../packages/contracts/index.js';
import { fail } from '../errors.js';
export const productSelect=`SELECT p.*,c.name AS category_name,COALESCE((SELECT SUM(oi.quantity) FROM dasani.order_items oi JOIN dasani.orders o ON o.id=oi.order_id JOIN dasani.variants v ON v.id=oi.variant_id WHERE v.product_id=p.id AND o.status='completed'),0)::integer AS sold FROM dasani.products p JOIN dasani.categories c ON c.id=p.category_id`;
export async function catalogRoutes(app:FastifyInstance,db:Db):Promise<void> {
  app.get('/api/categories',async()=>({categories:await db.query('SELECT * FROM dasani.categories ORDER BY slug')}));
  app.get('/api/products',async req=>{
    const q=z.object({search:z.string().max(100).default(''),category:z.string().max(40).optional(),minPrice:z.coerce.number().int().min(0).optional(),maxPrice:z.coerce.number().int().min(0).optional(),sort:z.enum(['newest','price_asc','price_desc','bestsellers']).default('newest'),page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(12),featured:z.enum(['true','false']).optional()}).parse(req.query);
    if(q.minPrice!==undefined&&q.maxPrice!==undefined&&q.minPrice>q.maxPrice) fail(400,'PRICE_RANGE','Invalid price range');
    const params:unknown[]=[];const clauses=['p.active=true'];
    const bind=(value:unknown)=>{params.push(value);return `$${params.length}`;};
    if(q.search) clauses.push(`p.name ILIKE ${bind(`%${q.search}%`)}`);
    if(q.category) clauses.push(`c.slug=${bind(categoryAliases[q.category]??q.category)}`);
    if(q.minPrice!==undefined) clauses.push(`p.price>=${bind(q.minPrice)}`);
    if(q.maxPrice!==undefined) clauses.push(`p.price<=${bind(q.maxPrice)}`);
    if(q.featured) clauses.push(`p.featured=${bind(q.featured==='true')}`);
    const where=` WHERE ${clauses.join(' AND ')}`;
    const [count]=await db.query<{total:number}>('SELECT COUNT(*)::integer AS total FROM dasani.products p JOIN dasani.categories c ON c.id=p.category_id'+where,params);
    const sort={newest:'p.created_at DESC,p.slug',price_asc:'p.price ASC,p.slug',price_desc:'p.price DESC,p.slug',bestsellers:'sold DESC,p.slug'}[q.sort];
    const products=await db.query<Product>(productSelect+where+` ORDER BY ${sort} LIMIT ${bind(q.pageSize)} OFFSET ${bind((q.page-1)*q.pageSize)}`,params);
    return {products,total:count.total,page:q.page,pageSize:q.pageSize};
  });
  app.get('/api/products/:slug',async req=>{
    const {slug}=z.object({slug:z.string().min(1).max(160)}).parse(req.params);
    const [product]=await db.query<Product>(productSelect+' WHERE p.slug=$1 AND p.active=true',[productAliases[slug]??slug]);
    if(!product) fail(404,'PRODUCT_NOT_FOUND','Product not found');
    product.variants=await db.query<Variant>('SELECT * FROM dasani.variants WHERE product_id=$1 AND active=true ORDER BY size,color',[product.id]); return {product};
  });
}
