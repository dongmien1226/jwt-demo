-- Translate demonstration records without resetting accounts, prices or inventory.
UPDATE dasani.categories SET name=CASE slug WHEN 'ao' THEN 'Tops & layers' WHEN 'quan' THEN 'Bottoms' WHEN 'phu-kien' THEN 'Accessories' ELSE name END;
UPDATE dasani.products SET name=t.english FROM (VALUES
 ('Áo thun Essential','Essential T-shirt'),('Áo thun Washed','Washed T-shirt'),('Áo polo Everyday','Everyday polo'),('Áo sơ mi Linen','Linen shirt'),
 ('Quần Cargo Utility','Utility cargo pants'),('Quần Jeans Straight','Straight jeans'),('Quần Short Weekend','Weekend shorts'),('Quần Jogger Move','Move joggers'),('Quần Linen Relax','Relaxed linen pants'),('Quần Jeans Washed','Washed jeans'),
 ('Túi Tote Canvas','Canvas tote'),('Mũ Cap Signature','Signature cap'),('Mũ Bucket Field','Field bucket hat'),('Tất Crew Everyday','Everyday crew socks'),('Túi Crossbody City','City crossbody bag'),('Khăn Bandana Studio','Studio bandana')
) AS t(original,english) WHERE products.name=t.original;
UPDATE dasani.products SET description=name||' is made for comfortable days with a little character. An easy unisex fit, clean seams and soft, easy-care fabric. Choose the right size for your measurements. Products and images are provided for demonstration.' WHERE description LIKE '%dành cho những ngày%';
UPDATE dasani.order_items SET name=p.name FROM dasani.variants v JOIN dasani.products p ON p.id=v.product_id WHERE order_items.variant_id=v.id AND order_items.name ~ '[À-ỹ]';
UPDATE dasani.variants SET color=CASE color WHEN 'Kem' THEN 'Cream' WHEN 'Đen' THEN 'Black' ELSE color END WHERE color IN ('Kem','Đen');
UPDATE dasani.order_items SET color=CASE color WHEN 'Kem' THEN 'Cream' WHEN 'Đen' THEN 'Black' ELSE color END WHERE color IN ('Kem','Đen');
UPDATE dasani.users SET name='Alex Nguyen' WHERE id='00000000-0000-4000-8000-000000000002' AND name='Nguyễn An';
UPDATE dasani.users SET name='Robin Tran' WHERE id='00000000-0000-4000-8000-000000000003' AND name='Trần Bình';
UPDATE dasani.orders SET recipient_name='Alex Nguyen' WHERE recipient_name='Nguyễn An' AND number LIKE 'DS-DEMO-%';
UPDATE dasani.orders SET address='12 Sample Street, Ho Chi Minh City' WHERE address='12 Đường Mẫu, Thành phố Hồ Chí Minh' AND number LIKE 'DS-DEMO-%';
