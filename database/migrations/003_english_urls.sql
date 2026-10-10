-- Public URLs use English identifiers; UUID references and order history remain intact.
UPDATE dasani.categories SET slug=CASE slug WHEN 'ao' THEN 'tops' WHEN 'quan' THEN 'bottoms' WHEN 'phu-kien' THEN 'accessories' ELSE slug END;
UPDATE dasani.products SET slug=t.english,image=CASE WHEN image='/images/'||t.original||'.svg' THEN '/images/'||t.english||'.svg' ELSE image END
FROM (VALUES
 ('ao-thun-essential','essential-t-shirt'),('ao-thun-washed','washed-t-shirt'),('ao-polo-everyday','everyday-polo'),('ao-so-mi-linen','linen-shirt'),
 ('quan-cargo-utility','utility-cargo-pants'),('quan-jeans-straight','straight-jeans'),('quan-short-weekend','weekend-shorts'),('quan-jogger-move','move-joggers'),('quan-linen-relax','relaxed-linen-pants'),('quan-jeans-washed','washed-jeans'),
 ('tui-tote-canvas','canvas-tote'),('mu-cap-signature','signature-cap'),('mu-bucket-field','field-bucket-hat'),('tat-crew-everyday','everyday-crew-socks'),('tui-crossbody-city','city-crossbody-bag'),('khan-bandana-studio','studio-bandana')
) AS t(original,english) WHERE products.slug=t.original;
