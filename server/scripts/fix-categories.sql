-- Fix categories in production database
-- Maps legacy slug categories to correct names per brief.md
UPDATE tools SET category = 'Herramientas eléctricas' WHERE category IN ('electricas', 'elétricas', 'herramientas electricas');
UPDATE tools SET category = 'Jardín' WHERE category IN ('jardineria', 'jardin', 'jardín');
UPDATE tools SET category = 'Herramientas manuales' WHERE category IN ('manuales', 'herramientas manuales');
UPDATE tools SET category = 'Otros' WHERE category IN ('otros', 'other', 'misc');

-- Verify the fix
SELECT category, COUNT(*) as count FROM tools GROUP BY category ORDER BY category;
