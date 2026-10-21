import * as XLSX from 'xlsx';
import { GisLayer } from '../types/gis';
import { geometryToWkt } from './csvExporter';
import { filterFeatures } from './geoJsonParser';

/**
 * Calculates a representative coordinate [longitude, latitude] for any geometry
 */
function getRepresentativeCoordinates(geom: GeoJSON.Geometry | null): [number, number] | null {
  if (!geom) return null;

  try {
    if (geom.type === 'Point') {
      return [geom.coordinates[0], geom.coordinates[1]];
    }
    if (geom.type === 'MultiPoint' && geom.coordinates.length > 0) {
      return [geom.coordinates[0][0], geom.coordinates[0][1]];
    }
    if (geom.type === 'LineString' && geom.coordinates.length > 0) {
      const mid = Math.floor(geom.coordinates.length / 2);
      return [geom.coordinates[mid][0], geom.coordinates[mid][1]];
    }
    if (geom.type === 'MultiLineString' && geom.coordinates.length > 0 && geom.coordinates[0].length > 0) {
      const line = geom.coordinates[0];
      const mid = Math.floor(line.length / 2);
      return [line[mid][0], line[mid][1]];
    }
    if (geom.type === 'Polygon' && geom.coordinates.length > 0 && geom.coordinates[0].length > 0) {
      const ring = geom.coordinates[0];
      let sumLng = 0;
      let sumLat = 0;
      const count = ring.length;
      for (let i = 0; i < count; i++) {
        sumLng += ring[i][0];
        sumLat += ring[i][1];
      }
      return [sumLng / count, sumLat / count];
    }
    if (geom.type === 'MultiPolygon' && geom.coordinates.length > 0) {
      const firstPoly = geom.coordinates[0];
      if (firstPoly.length > 0 && firstPoly[0].length > 0) {
        const ring = firstPoly[0];
        let sumLng = 0;
        let sumLat = 0;
        const count = ring.length;
        for (let i = 0; i < count; i++) {
          sumLng += ring[i][0];
          sumLat += ring[i][1];
        }
        return [sumLng / count, sumLat / count];
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Sanitizes sheet names according to Excel specifications (max 31 chars, no forbidden chars)
 */
function sanitizeSheetName(name: string, fallback: string = 'Camada'): string {
  let clean = name.replace(/[\\/?*\[\]:]/g, '_').trim();
  if (clean.length > 30) {
    clean = clean.substring(0, 30);
  }
  return clean || fallback;
}

/**
 * Calculates auto column widths based on cell content
 */
function calculateColumnWidths(data: Record<string, any>[], headers: string[]): { wch: number }[] {
  return headers.map(header => {
    let maxLen = header.length;
    for (let i = 0; i < Math.min(data.length, 500); i++) {
      const val = data[i][header];
      if (val !== undefined && val !== null) {
        const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
        if (strVal.length > maxLen) {
          maxLen = strVal.length;
        }
      }
    }
    // Cap minimum and maximum column widths for clean readability
    return { wch: Math.min(Math.max(maxLen + 3, 12), 65) };
  });
}

export interface XlsxExportOptions {
  includeWkt?: boolean;
  includeLatLon?: boolean;
  exportFilteredOnly?: boolean;
  features?: GeoJSON.Feature[];
  fileName?: string;
}

/**
 * Prepares formatted attribute rows and metadata sheet for a single layer
 */
export function buildLayerSheets(
  wb: XLSX.WorkBook,
  layer: GisLayer,
  options: XlsxExportOptions = {}
): void {
  const {
    includeWkt = true,
    includeLatLon = true,
    features = layer.data?.features || []
  } = options;

  // 1. Build Attribute Columns
  // Determine ordered property keys (respecting popupFieldOrder or propertiesSchema)
  const schemaKeys = layer.propertiesSchema?.map(p => p.key) || [];
  const propertyKeySet = new Set<string>(schemaKeys);
  features.forEach(f => {
    if (f.properties) {
      Object.keys(f.properties).forEach(k => propertyKeySet.add(k));
    }
  });

  const propertyKeys: string[] = [];
  if (layer.popupFieldOrder && layer.popupFieldOrder.length > 0) {
    layer.popupFieldOrder.forEach(k => {
      if (propertyKeySet.has(k)) {
        propertyKeys.push(k);
        propertyKeySet.delete(k);
      }
    });
  }
  schemaKeys.forEach(k => {
    if (propertyKeySet.has(k)) {
      propertyKeys.push(k);
      propertyKeySet.delete(k);
    }
  });
  propertyKeySet.forEach(k => propertyKeys.push(k));

  const headers: string[] = [];
  if (includeLatLon) {
    headers.push('Latitude_SIRGAS2000', 'Longitude_SIRGAS2000');
  }
  headers.push('Tipo_Geometria');
  if (includeWkt) {
    headers.push('Geometria_WKT');
  }
  headers.push(...propertyKeys);

  // 2. Prepare Rows with native data typing
  const rows: Record<string, any>[] = features.map(f => {
    const row: Record<string, any> = {};
    const geom = f.geometry;

    if (includeLatLon) {
      const coords = getRepresentativeCoordinates(geom);
      if (coords) {
        row['Latitude_SIRGAS2000'] = Number(coords[1].toFixed(7));
        row['Longitude_SIRGAS2000'] = Number(coords[0].toFixed(7));
      } else {
        row['Latitude_SIRGAS2000'] = '';
        row['Longitude_SIRGAS2000'] = '';
      }
    }

    row['Tipo_Geometria'] = geom ? geom.type : 'Nao_Definida';

    if (includeWkt && geom) {
      row['Geometria_WKT'] = geometryToWkt(geom);
    }

    const props = f.properties || {};
    propertyKeys.forEach(k => {
      const val = props[k];
      if (val === undefined || val === null) {
        row[k] = '';
      } else if (typeof val === 'number') {
        row[k] = val;
      } else if (typeof val === 'boolean') {
        row[k] = val ? 'Sim' : 'Não';
      } else if (typeof val === 'object') {
        row[k] = JSON.stringify(val);
      } else {
        // Test if pure numeric string
        const numVal = Number(val);
        if (!isNaN(numVal) && String(val).trim() !== '' && !String(val).startsWith('0') && String(val).length < 15) {
          row[k] = numVal;
        } else {
          row[k] = val;
        }
      }
    });

    return row;
  });

  // 3. Create Attributes Worksheet
  const sheetName = sanitizeSheetName(layer.name || 'Atributos', 'Dados');
  const wsData = XLSX.utils.json_to_sheet(rows, { header: headers });
  wsData['!cols'] = calculateColumnWidths(rows, headers);

  if (rows.length > 0 && headers.length > 0) {
    wsData['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length, c: headers.length - 1 }
      })
    };
  }

  XLSX.utils.book_append_sheet(wb, wsData, sheetName);

  // 4. Create Metadata Worksheet
  const bboxStr = layer.bbox 
    ? `Oeste (Min Lng): ${layer.bbox[0]}, Sul (Min Lat): ${layer.bbox[1]}, Leste (Max Lng): ${layer.bbox[2]}, Norte (Max Lat): ${layer.bbox[3]}`
    : 'Nao calculada';

  const filtersCount = layer.filters ? layer.filters.length : 0;
  const filtersSummary = filtersCount > 0 
    ? layer.filters.map(fl => `${fl.property} ${fl.operator} ${fl.value}`).join(' | ')
    : 'Nenhum filtro aplicado (todas as feicoes carregadas)';

  const metadataRows: any[][] = [
    ['METADADO', 'VALOR / ESPECIFICAÇÃO', 'OBSERVAÇÃO TÉCNICA'],
    ['Título do Projeto', 'Geoportal GRAPROHAB - Plataforma de Licenciamento', 'Governo do Estado de São Paulo'],
    ['Nome da Camada', layer.name, 'Camada de análise vetorial'],
    ['Identificador Único', layer.id, 'ID de referência no sistema'],
    ['Tipo de Geometria Primária', layer.geometryType || 'Desconhecida', 'Padrão OGC / GeoJSON'],
    ['Sistema de Referência Espacial (CRS / SRC)', 'SIRGAS 2000 / WGS 84 (EPSG:4674 / EPSG:4326)', 'Padrão cartográfico oficial brasileiro'],
    ['Total de Feições no Geoportal', layer.featureCount || layer.data?.features?.length || 0, 'Quantidade total de registros na base'],
    ['Feições Exportadas nesta Planilha', features.length, options.exportFilteredOnly ? 'Filtro ativado pelo usuário' : 'Exportação completa'],
    ['Filtros Aplicados', filtersSummary, `${filtersCount} regra(s) ativa(s)`],
    ['Extensão Territorial (Bounding Box)', bboxStr, 'Coordenadas geográficas limites'],
    ['Tipo de Serviço', layer.isServiceLayer ? 'Serviço Externo Conectado' : 'Camada Base Nativa', layer.serviceType || 'GeoJSON Vetorial'],
    ['Data e Hora da Extração', new Date().toLocaleString('pt-BR'), 'Timestamp da exportação no fuso horário do usuário'],
    ['', '', ''],
    ['DICIONÁRIO DE ATRIBUTOS', 'TIPO DETECTADO', 'EXEMPLO / CONTEÚDO']
  ];

  // Add schema attributes to dictionary
  (layer.propertiesSchema || []).forEach(prop => {
    const sampleVal = features[0]?.properties?.[prop.key];
    const sampleStr = sampleVal !== undefined && sampleVal !== null ? String(sampleVal).slice(0, 50) : '-';
    metadataRows.push([
      prop.key,
      prop.type === 'number' ? 'Numérico (Double/Integer)' : prop.type === 'boolean' ? 'Lógico (Booleano)' : 'Texto (String)',
      sampleStr
    ]);
  });

  const wsMeta = XLSX.utils.aoa_to_sheet(metadataRows);
  wsMeta['!cols'] = [{ wch: 35 }, { wch: 55 }, { wch: 45 }];

  const metaSheetName = sanitizeSheetName(`Meta_${layer.name}`, 'Metadados');
  XLSX.utils.book_append_sheet(wb, wsMeta, metaSheetName);
}

/**
 * Exports a single GisLayer to XLSX Blob
 */
export async function exportLayerToXlsx(
  layer: GisLayer,
  options: XlsxExportOptions = {}
): Promise<Blob> {
  const wb = XLSX.utils.book_new();
  buildLayerSheets(wb, layer, options);

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

/**
 * Exports all layers to a unified multi-sheet XLSX workbook
 */
export async function exportAllLayersToXlsx(
  layers: GisLayer[],
  options: XlsxExportOptions = {}
): Promise<Blob> {
  const wb = XLSX.utils.book_new();
  const {
    includeWkt = true,
    includeLatLon = true,
    exportFilteredOnly = true
  } = options;

  // 1. Overall Summary Sheet
  const summaryRows: any[][] = [
    ['RESUMO GERAL DAS CAMADAS - GEOPORTAL GRAPROHAB', '', '', '', ''],
    ['Data de Geração:', new Date().toLocaleString('pt-BR'), '', '', ''],
    ['Total de Camadas:', layers.length, '', '', ''],
    ['', '', '', '', ''],
    ['Nome da Camada', 'Tipo Geometria', 'Total Feições', 'Feições Exportadas', 'Status no Mapa']
  ];

  layers.forEach(layer => {
    const totalCount = layer.featureCount || layer.data?.features?.length || 0;
    const exportedCount = exportFilteredOnly && layer.filters && layer.filters.length > 0
      ? filterFeatures(layer.data?.features || [], layer.filters).length
      : totalCount;
    summaryRows.push([
      layer.name,
      layer.geometryType,
      totalCount,
      exportedCount,
      layer.visible ? 'Visível' : 'Oculta'
    ]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo_Geral');

  // 2. Individual Layer Sheets
  const usedSheetNames = new Set<string>(['Resumo_Geral']);

  layers.forEach((layer, idx) => {
    let baseName = sanitizeSheetName(layer.name || `Camada_${idx + 1}`, `Camada_${idx + 1}`);
    let safeName = baseName;
    let counter = 1;
    while (usedSheetNames.has(safeName)) {
      safeName = `${baseName.slice(0, 27)}_${counter++}`;
    }
    usedSheetNames.add(safeName);

    let layerFeatures = layer.data?.features || [];
    if (exportFilteredOnly && layer.filters && layer.filters.length > 0) {
      layerFeatures = filterFeatures(layerFeatures, layer.filters);
    }

    const schemaKeys = layer.propertiesSchema?.map(p => p.key) || [];
    const propKeySet = new Set<string>(schemaKeys);
    layerFeatures.forEach(f => {
      if (f.properties) Object.keys(f.properties).forEach(k => propKeySet.add(k));
    });

    const propertyKeys = Array.from(propKeySet);
    const headers: string[] = [];
    if (includeLatLon) {
      headers.push('Latitude_SIRGAS2000', 'Longitude_SIRGAS2000');
    }
    headers.push('Tipo_Geometria');
    if (includeWkt) {
      headers.push('Geometria_WKT');
    }
    headers.push(...propertyKeys);

    const rows = layerFeatures.map(f => {
      const row: Record<string, any> = {};
      const geom = f.geometry;

      if (includeLatLon) {
        const coords = getRepresentativeCoordinates(geom);
        row['Latitude_SIRGAS2000'] = coords ? Number(coords[1].toFixed(7)) : '';
        row['Longitude_SIRGAS2000'] = coords ? Number(coords[0].toFixed(7)) : '';
      }

      row['Tipo_Geometria'] = geom ? geom.type : 'Nao_Definida';

      if (includeWkt && geom) {
        row['Geometria_WKT'] = geometryToWkt(geom);
      }

      const props = f.properties || {};
      propertyKeys.forEach(k => {
        const val = props[k];
        if (val === undefined || val === null) {
          row[k] = '';
        } else if (typeof val === 'number') {
          row[k] = val;
        } else if (typeof val === 'boolean') {
          row[k] = val ? 'Sim' : 'Não';
        } else if (typeof val === 'object') {
          row[k] = JSON.stringify(val);
        } else {
          const numVal = Number(val);
          if (!isNaN(numVal) && String(val).trim() !== '' && !String(val).startsWith('0') && String(val).length < 15) {
            row[k] = numVal;
          } else {
            row[k] = val;
          }
        }
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    ws['!cols'] = calculateColumnWidths(rows, headers);
    if (rows.length > 0 && headers.length > 0) {
      ws['!autofilter'] = {
        ref: XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: rows.length, c: headers.length - 1 }
        })
      };
    }
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  });

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

/**
 * Triggers a browser download of an XLSX Blob
 */
export function downloadXlsxBlob(blob: Blob, filename: string): void {
  const safeFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
