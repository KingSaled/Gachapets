import fs from 'node:fs';
import { indexCatalog, type CatalogIndex } from './catalog.ts';

export function loadCatalog(file: string): CatalogIndex {
  return indexCatalog(fs.readFileSync(file, 'utf8'));
}
