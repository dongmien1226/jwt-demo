// seed: handles this module with server validation and explicit trust boundaries.
import { randomUUID } from 'node:crypto';
import type { Db } from './db.js';
import type { Config } from '../config.js';
import { ADMIN_ID, CUSTOMER_ID } from '../config.js';
import { hashPassword } from '../auth/password.js';
export const demoProducts = [
 ['Essential T-shirt','essential-t-shirt',249000,'tops','tee'],['Washed T-shirt','washed-t-shirt',299000,'tops','tee'],['Everyday polo','everyday-polo',359000,'tops','polo'],['Linen shirt','linen-shirt',429000,'tops','shirt'],['Hoodie Downtown','hoodie-downtown',549000,'tops','hoodie'],['Sweater Studio','sweater-studio',459000,'tops','sweater'],
 ['Utility cargo pants','utility-cargo-pants',599000,'bottoms','cargo'],['Straight jeans','straight-jeans',649000,'bottoms','jeans'],['Weekend shorts','weekend-shorts',329000,'bottoms','shorts'],['Move joggers','move-joggers',449000,'bottoms','jogger'],['Relaxed linen pants','relaxed-linen-pants',479000,'bottoms','trousers'],['Washed jeans','washed-jeans',699000,'bottoms','jeans'],
 ['Canvas tote','canvas-tote',189000,'accessories','tote'],['Signature cap','signature-cap',199000,'accessories','cap'],['Field bucket hat','field-bucket-hat',219000,'accessories','bucket'],['Everyday crew socks','everyday-crew-socks',79000,'accessories','socks'],['City crossbody bag','city-crossbody-bag',349000,'accessories','bag'],['Studio bandana','studio-bandana',129000,'accessories','bandana']
] as const;
export async function seed(db:Db,config:Config):Promise<void> {
  const accounts=config.hosted ? (config.adminEmail&&config.adminPassword?[{id:randomUUID(),email:config.adminEmail.toLowerCase(),name:'Dasani Administrator',role:'admin',password:config.adminPassword}]:[]) : [
    {id:ADMIN_ID,email:'admin@dasani.test',name:'Dasani Admin',role:'admin',password:'DasaniAdmin!2026'},
    {id:CUSTOMER_ID,email:'an@dasani.test',name:'Alex Nguyen',role:'customer',password:'DasaniBuyer!2026'},
    {id:'00000000-0000-4000-8000-000000000003',email:'binh@dasani.test',name:'Robin Tran',role:'customer',password:'DasaniBuyer!2026'}
  ];
  if(config.hosted && config.adminPassword && config.adminPassword.length<12) throw new Error('Hosted administrator passwords require at least 12 characters');
  for(const a of accounts) if(!(await db.query('SELECT id FROM dasani.users WHERE email=$1',[a.email])).length) await db.query('INSERT INTO dasani.users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)',[a.id,a.email,a.name,a.role,await hashPassword(a.password)]);
  for(const [slug,name] of [['tops','Tops & layers'],['bottoms','Bottoms'],['accessories','Accessories']]) await db.query('INSERT INTO dasani.categories(id,slug,name) VALUES($1,$2,$3) ON CONFLICT(slug) DO NOTHING',[randomUUID(),slug,name]);
  for(const [index,p] of demoProducts.entries()) {
    if((await db.query('SELECT id FROM dasani.products WHERE slug=$1',[p[1]])).length) continue;
    const [category]=await db.query<{id:string}>('SELECT id FROM dasani.categories WHERE slug=$1',[p[3]]);
    const id=randomUUID();
    await db.transaction(async tx=>{
      await tx.query('INSERT INTO dasani.products(id,category_id,name,slug,description,price,image,featured) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,category.id,p[0],p[1],`${p[0]} is made for comfortable days with a little character. An easy unisex fit, clean seams and soft, easy-care fabric. Choose the right size for your measurements. Products and images are provided for demonstration.`,p[2],`/images/${p[1]}.svg`,index%3===0]);
      for(const size of p[3]==='accessories'?['F']:['S','M','L']) for(const color of ['Cream','Black']) await tx.query('INSERT INTO dasani.variants(id,product_id,size,color,stock) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,size,color,12+index]);
    });
  }
  if(!config.hosted && !(await db.query('SELECT id FROM dasani.orders LIMIT 1')).length) {
    const products=await db.query<{id:string;name:string;price:number;size:string;color:string}>('SELECT v.id,p.name,p.price,v.size,v.color FROM dasani.variants v JOIN dasani.products p ON p.id=v.product_id ORDER BY p.slug,v.size LIMIT 3');
    await db.transaction(async tx=>{ for(const [i,p] of products.entries()) {
      const id=randomUUID(),quantity=i+1;
      await tx.query('INSERT INTO dasani.orders(id,number,user_id,recipient_name,phone,address,payment_method,payment_status,status,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,`DS-DEMO-${i+1}`,CUSTOMER_ID,'Alex Nguyen','0901234567','12 Sample Street, Ho Chi Minh City','COD',i===0?'paid':'unpaid',i===0?'completed':'pending',p.price*quantity]);
      await tx.query('INSERT INTO dasani.order_items(id,order_id,variant_id,name,size,color,price,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),id,p.id,p.name,p.size,p.color,p.price,quantity]);
      await tx.query('UPDATE dasani.variants SET stock=stock-$1 WHERE id=$2',[quantity,p.id]);
    }});
  }
}
