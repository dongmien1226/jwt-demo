// Common: handles this module with server validation and explicit trust boundaries.
import {Link} from 'react-router-dom';
import {ArrowUpRight} from 'lucide-react';
import type {Product,OrderStatus} from '../../../../packages/contracts/index.js';
export const money=(value:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(value);
export const date=(value:string)=>new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(value));
export const statusLabels:Record<OrderStatus,string>={pending:'Pending',confirmed:'Confirmed',shipping:'Shipping',completed:'Completed',cancelled:'Cancelled'};
export function Status({status}:{status:OrderStatus}){return <span className={`badge ${status}`}>{statusLabels[status]}</span>;}
export function ErrorBox({message}:{message:string}){return message?<div className="error" role="alert">{message}</div>:null;}
export function Loading(){return <div className="loading" role="status"><span className="spinner"/>Loading…</div>;}
export function ProductCard({product:p}:{product:Product}){return <Link className="product-card" to={`/products/${p.slug}`}><div className="product-image"><img src={p.image} alt={p.name} loading="lazy" onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src='/images/essential-t-shirt.svg';}}/>{p.featured&&<span className="product-tag">DASANI PICKS</span>}<span className="product-arrow"><ArrowUpRight size={20}/></span></div><div className="product-meta"><span>{p.categoryName}</span><h3>{p.name}</h3><strong>{money(p.price)}</strong></div></Link>;}
export function Empty({title,text,link='/shop',label='Explore products'}:{title:string;text:string;link?:string;label?:string}){return <div className="empty"><h2>{title}</h2><p>{text}</p><Link className="button" to={link}>{label}</Link></div>;}
