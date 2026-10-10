// routes: handles this module with server validation and explicit trust boundaries.
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { productSchema,orderStatuses,type Product,type Variant } from '../../../../packages/contracts/index.js';
import type { Db } from '../database/db.js';
import type { authGuards } from '../auth/routes.js';
import { productSelect } from '../catalog/routes.js';
import { orderDetail,changeOrder,orderUpdateSchema } from '../orders/routes.js';
import { fail } from '../errors.js';
export async function adminRoutes(app:FastifyInstance,db:Db,guards:ReturnType<typeof authGuards>):Promise<void> {
  const opts={preHandler:guards.admin};
  app.get('/api/admin/products',opts,async()=>{
    const products=await db.query<Product>(productSelect+' ORDER BY p.created_at DESC,p.slug');
    const variants=await db.query<Variant>('SELECT * FROM dasani.variants WHERE active=true ORDER BY size,color');
    return {products:products.map(p=>({...p,variants:variants.filter(v=>v.productId===p.id)}))};
  });
  async function save(id:string,body:z.infer<typeof productSchema>,update:boolean) {
    await db.transaction(async tx=>{
      if(!(await tx.query('SELECT id FROM dasani.categories WHERE id=$1',[body.categoryId])).length) fail(400,'CATEGORY_INVALID','Category not found');
      if(update) {
        if(!(await tx.query('SELECT id FROM dasani.products WHERE id=$1 FOR UPDATE',[id])).length) fail(404,'PRODUCT_NOT_FOUND','Product not found');
        await tx.query('UPDATE dasani.products SET name=$1,slug=$2,category_id=$3,description=$4,price=$5,image=$6,featured=$7 WHERE id=$8',[body.name,body.slug,body.categoryId,body.description,body.price,body.image,body.featured,id]);
        await tx.query('UPDATE dasani.variants SET active=false WHERE product_id=$1',[id]);
      } else await tx.query('INSERT INTO dasani.products(id,name,slug,category_id,description,price,image,featured) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,body.name,body.slug,body.categoryId,body.description,body.price,body.image,body.featured]);
      const combinations=new Set<string>();
      for(const v of body.variants) {
        const combination=`${v.size}|${v.color}`;if(combinations.has(combination)) fail(400,'VARIANT_DUPLICATE','Duplicate variant');combinations.add(combination);
        if(v.id) {
          if(!(await tx.query('SELECT id FROM dasani.variants WHERE id=$1 AND product_id=$2',[v.id,id])).length) fail(400,'VARIANT_INVALID','Variant does not belong to this product');
          await tx.query('UPDATE dasani.variants SET size=$1,color=$2,stock=$3,active=true WHERE id=$4',[v.size,v.color,v.stock,v.id]);
        } else await tx.query('INSERT INTO dasani.variants(id,product_id,size,color,stock) VALUES($1,$2,$3,$4,$5) ON CONFLICT(product_id,size,color) DO UPDATE SET stock=EXCLUDED.stock,active=true',[randomUUID(),id,v.size,v.color,v.stock]);
      }
    });
    return {id};
  }
  app.post('/api/admin/products',opts,async(req,reply)=>{reply.code(201);return save(randomUUID(),productSchema.parse(req.body),false);});
  app.put('/api/admin/products/:id',opts,async req=>save(z.object({id:z.uuid()}).parse(req.params).id,productSchema.parse(req.body),true));
  app.delete('/api/admin/products/:id',opts,async req=>{const {id}=z.object({id:z.uuid()}).parse(req.params);const rows=await db.query('UPDATE dasani.products SET active=false WHERE id=$1 RETURNING id',[id]);if(!rows.length) fail(404,'PRODUCT_NOT_FOUND','Product not found');return {ok:true};});
  app.patch('/api/admin/products/:id/restore',opts,async req=>{const {id}=z.object({id:z.uuid()}).parse(req.params);const rows=await db.query('UPDATE dasani.products SET active=true WHERE id=$1 RETURNING id',[id]);if(!rows.length)fail(404,'PRODUCT_NOT_FOUND','Product not found');return {ok:true};});
  app.get('/api/admin/orders',opts,async req=>{
    const q=z.object({status:z.enum(orderStatuses).optional()}).parse(req.query);
    return {orders:await db.query('SELECT o.*,u.email FROM dasani.orders o JOIN dasani.users u ON u.id=o.user_id'+(q.status?' WHERE o.status=$1':'')+' ORDER BY o.created_at DESC',q.status?[q.status]:[])};
  });
  app.get('/api/admin/orders/:id',opts,async req=>({order:await orderDetail(db,z.object({id:z.uuid()}).parse(req.params).id)}));
  app.patch('/api/admin/orders/:id',opts,async req=>({order:await changeOrder(db,z.object({id:z.uuid()}).parse(req.params).id,orderUpdateSchema.parse(req.body))}));
  app.get('/api/admin/users',opts,async()=>({users:await db.query('SELECT id,email,name,role,created_at FROM dasani.users ORDER BY created_at DESC')}));
}
