// routes: handles this module with server validation and explicit trust boundaries.
import type { FastifyInstance } from 'fastify';
import { randomUUID,randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { checkoutSchema,orderStatuses,type Order,type OrderItem,type OrderStatus } from '../../../../packages/contracts/index.js';
import type { Db } from '../database/db.js';
import type { authGuards } from '../auth/routes.js';
import { fail } from '../errors.js';
type Guards=ReturnType<typeof authGuards>;
export async function orderDetail(db:Db,id:string,userId?:string):Promise<Order> {
  const [order]=await db.query<Order>('SELECT * FROM dasani.orders WHERE id=$1'+(userId?' AND user_id=$2':''),userId?[id,userId]:[id]);
  if(!order) fail(404,'ORDER_NOT_FOUND','Order not found');
  order.items=await db.query<OrderItem>('SELECT * FROM dasani.order_items WHERE order_id=$1 ORDER BY name',[id]);
  if(order.paymentMethod==='QR_DEMO') order.qrDataUrl=await QRCode.toDataURL(JSON.stringify({type:'DASANI_DEMO_NOT_PAYMENT',order:order.number,amountVnd:order.total}),{width:220,margin:2});
  return order;
}
const transitions:Record<OrderStatus,OrderStatus[]>={pending:['confirmed','cancelled'],confirmed:['shipping','cancelled'],shipping:['completed'],completed:[],cancelled:[]};
export async function changeOrder(db:Db,id:string,body:{status?:OrderStatus;paymentStatus?:'unpaid'|'paid'},owner?:string):Promise<Order> {
  await db.transaction(async tx=>{
    const [order]=await tx.query<Order>('SELECT * FROM dasani.orders WHERE id=$1'+(owner?' AND user_id=$2':'')+' FOR UPDATE',owner?[id,owner]:[id]);
    if(!order) fail(404,'ORDER_NOT_FOUND','Order not found');
    const next=body.status??order.status;
    if(owner && (next!=='cancelled'||order.status!=='pending')) fail(409,'CANCEL_DENIED','Only pending orders can be cancelled');
    if(next!==order.status&&!transitions[order.status].includes(next)) fail(409,'STATUS_TRANSITION','Invalid order status transition');
    if(order.status==='cancelled'&&body.paymentStatus) fail(409,'ORDER_CANCELLED','Order is cancelled');
    let paid=body.paymentStatus??order.paymentStatus;
    if(order.paymentStatus==='paid'&&paid==='unpaid') fail(409,'PAYMENT_TRANSITION','A confirmed payment cannot be reversed');
    if(order.paymentMethod==='COD'&&paid==='paid'&&next!=='completed') fail(409,'COD_NOT_DELIVERED','COD is paid when delivery is completed');
    if(next==='completed'&&order.paymentMethod==='COD') paid='paid';
    if(order.paymentMethod==='QR_DEMO'&&['shipping','completed'].includes(next)&&paid!=='paid') fail(409,'PAYMENT_REQUIRED','Confirm the simulated payment before shipping');
    if(next==='cancelled'&&order.paymentStatus==='paid') fail(409,'PAID_CANCEL_DENIED','Paid orders require a refund workflow outside this demo');
    if(next==='cancelled'&&order.status!=='cancelled') {
      const items=await tx.query<{variantId:string;quantity:number}>('SELECT variant_id,quantity FROM dasani.order_items WHERE order_id=$1 ORDER BY variant_id',[id]);
      for(const item of items) await tx.query('UPDATE dasani.variants SET stock=stock+$1 WHERE id=$2',[item.quantity,item.variantId]);
    }
    await tx.query('UPDATE dasani.orders SET status=$1,payment_status=$2 WHERE id=$3',[next,paid,id]);
  });
  return orderDetail(db,id,owner);
}
export async function orderRoutes(app:FastifyInstance,db:Db,guards:Guards):Promise<void> {
  app.post('/api/orders',{preHandler:guards.auth},async(req,reply)=>{
    const body=checkoutSchema.parse(req.body); const quantities=new Map<string,number>();
    for(const item of body.items) quantities.set(item.variantId,(quantities.get(item.variantId)??0)+item.quantity);
    if([...quantities.values()].some(q=>q>99)) fail(400,'QUANTITY_LIMIT','Maximum 99 units per variant');
    const id=randomUUID(),number=`DS-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    await db.transaction(async tx=>{
      const rows:Array<{id:string;name:string;size:string;color:string;price:number;quantity:number}>=[]; let total=0;
      for(const [variantId,quantity] of [...quantities].sort(([a],[b])=>a.localeCompare(b))) {
        const [v]=await tx.query<{id:string;name:string;size:string;color:string;price:number;stock:number;active:boolean;productActive:boolean}>('SELECT v.*,p.name,p.price,p.active AS product_active FROM dasani.variants v JOIN dasani.products p ON p.id=v.product_id WHERE v.id=$1 FOR UPDATE OF v,p',[variantId]);
        if(!v||!v.active||!v.productActive) fail(409,'VARIANT_UNAVAILABLE','A product is no longer available');
        if(v.stock<quantity) fail(409,'OUT_OF_STOCK',`${v.name} has insufficient stock`);
        total+=v.price*quantity;rows.push({...v,quantity});
      }
      if(total>2147483647) fail(400,'TOTAL_LIMIT','Order total exceeds the demo limit');
      await tx.query('INSERT INTO dasani.orders(id,number,user_id,recipient_name,phone,address,payment_method,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,number,req.principal!.id,body.recipientName,body.phone,body.address,body.paymentMethod,total]);
      for(const row of rows) {
        await tx.query('UPDATE dasani.variants SET stock=stock-$1 WHERE id=$2',[row.quantity,row.id]);
        await tx.query('INSERT INTO dasani.order_items(id,order_id,variant_id,name,size,color,price,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),id,row.id,row.name,row.size,row.color,row.price,row.quantity]);
      }
    });
    reply.code(201);return {order:await orderDetail(db,id,req.principal!.id)};
  });
  app.get('/api/orders',{preHandler:guards.auth},async req=>({orders:await db.query<Order>('SELECT * FROM dasani.orders WHERE user_id=$1 ORDER BY created_at DESC',[req.principal!.id])}));
  app.get('/api/orders/:id',{preHandler:guards.auth},async req=>{const {id}=z.object({id:z.uuid()}).parse(req.params);return {order:await orderDetail(db,id,req.principal!.id)};});
  app.patch('/api/orders/:id/cancel',{preHandler:guards.auth},async req=>{const {id}=z.object({id:z.uuid()}).parse(req.params);return {order:await changeOrder(db,id,{status:'cancelled'},req.principal!.id)};});
}
export const orderUpdateSchema=z.object({status:z.enum(orderStatuses).optional(),paymentStatus:z.enum(['unpaid','paid']).optional()}).strict().refine(v=>v.status!==undefined||v.paymentStatus!==undefined,'No changes supplied');
