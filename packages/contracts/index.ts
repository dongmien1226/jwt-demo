// index: handles this module with server validation and explicit trust boundaries.
import { z } from 'zod';
export const imageSchema = z.string().refine(v => /^\/images\/[a-zA-Z0-9_.-]+\.(svg|png|jpg|webp)$/.test(v) || /^https:\/\//.test(v), 'Image must be an /images/ path or an HTTPS URL');
export const variantSchema = z.object({ id: z.string().uuid().optional(), size: z.string().min(1).max(20), color: z.string().min(1).max(30), stock: z.number().int().min(0).max(100000) }).strict();
export const productSchema = z.object({ name: z.string().min(3).max(150), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160), categoryId: z.string().uuid(), description: z.string().min(10).max(5000), price: z.number().int().min(1000).max(100000000), image: imageSchema, featured: z.boolean().default(false), variants: z.array(variantSchema).min(1).max(60) }).strict();
export const checkoutSchema = z.object({ recipientName: z.string().trim().min(2).max(100), phone: z.string().regex(/^(?:\+84|0)[0-9]{9,10}$/), address: z.string().trim().min(10).max(500), paymentMethod: z.enum(['COD', 'QR_DEMO']), items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(99) }).strict()).min(1).max(50) }).strict();
export const orderStatuses = ['pending', 'confirmed', 'shipping', 'completed', 'cancelled'] as const;
export type OrderStatus = typeof orderStatuses[number];
export interface User { id: string; email: string; name: string; role: 'customer' | 'admin'; createdAt?: string }
export interface Category { id: string; name: string; slug: string }
export interface Variant { id: string; productId: string; size: string; color: string; stock: number; active: boolean }
export interface Product { id: string; name: string; slug: string; categoryId: string; categoryName: string; description: string; price: number; image: string; featured: boolean; active: boolean; sold: number; variants?: Variant[] }
export interface OrderItem { id: string; variantId: string; name: string; size: string; color: string; price: number; quantity: number }
export interface Order { id: string; number: string; userId: string; recipientName: string; phone: string; address: string; paymentMethod: 'COD' | 'QR_DEMO'; paymentStatus: 'unpaid' | 'paid'; status: OrderStatus; total: number; createdAt: string; items?: OrderItem[]; qrDataUrl?: string }
export interface CartItem { variantId: string; productId: string; slug: string; name: string; image: string; size: string; color: string; price: number; quantity: number; stock: number }
