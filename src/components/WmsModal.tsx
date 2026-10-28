import React, { useState } from 'react';
import { GisLayer, LayerServiceType, LayerStyle } from '../types/gis';
import { 
  Globe, Radio, Server, Layers, Plus, X, 
  ExternalLink, Check, AlertCircle, HelpCircle, 
  Sliders, ShieldCheck, Sparkles, Database, Loader2,
  Search, ChevronDown, ChevronUp, ShieldAlert, Wand2,
  SlidersHorizontal, ArrowRight
} from 'lucide-react';
import { calculateBoundingBox, detectGeometryType, extractPropertySchemas } from '../utils/geoJsonParser';
import { fetchPublicJson, getAssetUrl } from '../utils/assetUrl';

interface WmsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddLayer: (newLayer: GisLayer) => void;
}

interface ServicePreset {
  id: string;
  name: string;
  serviceType: LayerServiceType;
  category: 'sp' | 'brasil' | 'basemap' | 'meio_ambiente';
  categoryLabel: string;
  description: string;
  url: string;
  layers?: string;
  format?: string;
  attribution: string;
  badge: string;
  bbox?: [number, number, number, number];
}

const PRESET_SERVICES: ServicePreset[] = [
  // Camadas Vetoriais Oficiais de SP (GeoJSON ultra-rápido e enriquecido com metadados)
  {
    id: 'sp-limites-municipais',
    name: 'Malha Municipal do Estado de SP (645 Municípios - IBGE/IGC)',
    serviceType: 'geojson',
    category: 'sp',
    categoryLabel: 'Estado de São Paulo',
    description: 'Malha oficial completa com todos os 645 municípios paulistas enriquecida com metadados cadastrais do IBGE (Nome do Município, Código IBGE, Microrregião, Mesorregião, Região Imediata e Intermediária). Polígonos nítidos, leves e interativos.',
    url: 'data/sp_municipios_ibge.geojson',
    attribution: 'IBGE / IGC SP',
    badge: 'Vetor 645 Mun. + Metadados'
  },
  {
    id: 'sp-limite-estadual',
    name: 'Limite Oficial do Estado de São Paulo (IBGE / IGC SP)',
    serviceType: 'geojson',
    category: 'sp',
    categoryLabel: 'Estado de São Paulo',
    description: 'Perímetro e polígono territorial completo do Estado de São Paulo enriquecido com metadados oficiais (Capital, Código IBGE, Total de Municípios, Região Sudeste).',
    url: 'data/sp_limite_estadual.geojson',
    attribution: 'IBGE / IGC SP',
    badge: 'Vetor SP + Metadados'
  },
  {
    id: 'sp-mananciais-apm-perimetros',
    name: 'Perímetros das Áreas de Proteção aos Mananciais - APM / APRM (SIMA / DAEE)',
    serviceType: 'geojson',
    category: 'meio_ambiente',
    categoryLabel: 'Recursos Hídricos / Mananciais',
    description: 'Apenas os perímetros oficiais externos (sem preenchimento, 100% vazado) das Áreas de Proteção e Recuperação aos Mananciais (APRM Billings, Guarapiranga, Juquery e Cabeceiras do Tietê). Traçado perimetral nítido para sobreposição territorial.',
    url: 'data/mananciais_apm_sp.geojson',
    attribution: 'DataGeo SP / SIMA / DAEE / CETESB',
    badge: 'Perímetro Vazado (APM)',
    bbox: [-46.9425, -24.0082, -45.6325, -23.2189]
  },
  {
    id: 'datageo-bacias',
    name: 'DataGeo SP - UGRHI & Bacias Hidrográficas (DAEE / SIGRH)',
    serviceType: 'geojson',
    category: 'meio_ambiente',
    categoryLabel: 'Recursos Hídricos',
    description: 'Todas as 22 UGRHIs (Unidades de Gerenciamento de Recursos Hídricos do Estado de SP - DAEE / SIGRH) enriquecidas com metadados cadastrais e regulatórios completos (Comitê CBH, Bacia Hidrográfica, Sede, Rios Principais, Situação Hídrica e Diretrizes GRAPROHAB).',
    url: 'data/sp_ugrhi_bacias.geojson',
    attribution: 'DataGeo SP / DAEE / SIGRH',
    badge: 'Vetor 22 UGRHIs + Metadados',
    bbox: [-53.15, -25.35, -44.11, -19.73]
  }
];

export const WmsModal: React.FC<WmsModalProps> = ({
  isOpen,
  onClose,
  onAddLayer
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');
  
  const [serviceType, setServiceType] = useState<LayerServiceType>('wms');
  const [layerName, setLayerName] = useState('');
  const [serviceUrl, setServiceUrl] = useState('');
  const [wmsLayers, setWmsLayers] = useState('');
  const [wmsFormat, setWmsFormat] = useState('image/png');
  const [wmsVersion, setWmsVersion] = useState('1.1.1');
  const [attribution, setAttribution] = useState('');
  const [opacity, setOpacity] = useState(0.8);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);
  const [successPresetId, setSuccessPresetId] = useState<string | null>(null);

  // Simplified custom tab state
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Advanced WMS inspection & diagnostic state
  const [isInspecting, setIsInspecting] = useState(false);
  const [discoveredLayers, setDiscoveredLayers] = useState<Array<{ name: string; title: string; abstract?: string }>>([]);
  const [inspectMessage, setInspectMessage] = useState<{ type: 'success' | 'warning' | 'info'; text: string } | null>(null);
  const [showTechnicalGuide, setShowTechnicalGuide] = useState(false);

  // Check for HTTP mixed content on HTTPS origin
  const isMixedContent = typeof window !== 'undefined' && 
    window.location.protocol === 'https:' && 
    serviceUrl.trim().toLowerCase().startsWith('http://');

  const handleUrlChange = (val: string) => {
    setServiceUrl(val);
    setErrorMsg(null);
    setInspectMessage(null);

    const valTrim = val.trim();
    if (!valTrim) return;

    // 1. Auto-detect XYZ Tile Server
    if (valTrim.includes('{z}') && valTrim.includes('{x}')) {
      setServiceType('xyz');
      if (!layerName || layerName.trim() === '' || layerName === 'Nova Camada Web' || layerName.startsWith('Serviço')) {
        if (valTrim.toLowerCase().includes('openstreetmap') || valTrim.toLowerCase().includes('tile.openstreetmap')) {
          setLayerName('OpenStreetMap Standard');
        } else if (valTrim.toLowerCase().includes('cartodb') || valTrim.toLowerCase().includes('basemaps.cartocdn')) {
          setLayerName('CartoDB Basemap');
        } else {
          setLayerName('Mosaico de Satélite / XYZ');
        }
      }
      return;
    }

    // 2. Auto-detect GeoJSON / REST Vector API
    if (
      valTrim.toLowerCase().endsWith('.geojson') || 
      valTrim.toLowerCase().endsWith('.json') || 
      valTrim.toLowerCase().includes('outputformat=application/json') ||
      valTrim.toLowerCase().includes('outputformat=json')
    ) {
      setServiceType('geojson');
      if (!layerName || layerName.trim() === '' || layerName === 'Nova Camada Web' || layerName.startsWith('Serviço')) {
        const parts = valTrim.split('?')[0].split('/');
        const lastPart = parts[parts.length - 1].replace(/\.geojson|\.json/gi, '');
        if (lastPart) {
          const friendly = lastPart.replace(/_/g, ' ').replace(/(?:^|\s)\S/g, a => a.toUpperCase());
          setLayerName(friendly);
        } else {
          setLayerName('Camada Vetorial GeoJSON');
        }
      }
      return;
    }

    // 3. Auto-detect DataGeo serviceTranslator pattern:
    // e.g.: https://datageo.ambiente.sp.gov.br/serviceTranslator/rest/getXml/Geoserver_Publico/DISTRITO_MUNICIPAL_SP_SMDU/1435155780542/wms
    const translatorMatch = valTrim.match(/\/serviceTranslator\/rest\/getXml\/[^/]+\/([^/?]+)/i);
    if (translatorMatch && translatorMatch[1]) {
      setServiceType('wms');
      const extractedLayer = translatorMatch[1].trim();
      setWmsLayers(extractedLayer);
      if (!layerName || layerName.trim() === '' || layerName === 'Nova Camada Web' || layerName.startsWith('Serviço')) {
        const friendlyName = extractedLayer
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
        setLayerName(friendlyName);
      }
      return;
    }

    // 4. Default to OGC WMS if it has wms/geoserver keywords or query string
    if (
      valTrim.toLowerCase().includes('wms') || 
      valTrim.toLowerCase().includes('geoserver') || 
      valTrim.toLowerCase().includes('mapserver') || 
      valTrim.includes('?')
    ) {
      setServiceType('wms');
      if (valTrim.includes('?')) {
        try {
          const queryStr = valTrim.substring(valTrim.indexOf('?') + 1);
          const params = new URLSearchParams(queryStr);
          const layersParam = params.get('LAYERS') || params.get('layers') || params.get('Layers');
          const versionParam = params.get('VERSION') || params.get('version');
          const formatParam = params.get('FORMAT') || params.get('format');

          if (layersParam) {
            setWmsLayers(layersParam);
            if (!layerName || layerName.trim() === '' || layerName === 'Nova Camada Web' || layerName.startsWith('Serviço')) {
              const friendlyName = layersParam
                .replace(/^[a-zA-Z0-9_-]+:/, '')
                .replace(/_/g, ' ')
                .toLowerCase()
                .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
              setLayerName(friendlyName);
            }
          }
          if (versionParam && (versionParam === '1.1.1' || versionParam === '1.3.0')) {
            setWmsVersion(versionParam);
          }
          if (formatParam) {
            setWmsFormat(formatParam);
          }
        } catch (e) {
          // Fallback silently if query string is non-standard
        }
      }
    }
  };

  const handleConvertUrlToHttps = () => {
    if (serviceUrl.trim().toLowerCase().startsWith('http://')) {
      setServiceUrl('https://' + serviceUrl.trim().substring(7));
    }
  };

  const handleSanitizeUrl = () => {
    if (serviceUrl.includes('?')) {
      const baseUrl = serviceUrl.split('?')[0].trim();
      setServiceUrl(baseUrl);
    }
  };

  const handleInspectCapabilities = async () => {
    const rawUrl = serviceUrl.trim();
    if (!rawUrl) {
      setErrorMsg('Informe a URL base do servidor WMS primeiro.');
      return;
    }

    const baseUrl = rawUrl.includes('?') ? rawUrl.split('?')[0].trim() : rawUrl;
    setIsInspecting(true);
    setInspectMessage(null);
    setDiscoveredLayers([]);

    try {
      const capsUrl = `${baseUrl}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=${wmsVersion || '1.1.1'}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      const res = await fetch(capsUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/xml, text/xml, */*' }
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Servidor respondeu HTTP ${res.status}: ${res.statusText}`);
      }

      const text = await res.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');

      const parserError = xmlDoc.getElementsByTagName('parsererror');
      if (parserError.length > 0) {
        throw new Error('A resposta do servidor não é um XML GetCapabilities válido.');
      }

      const layerNodes = xmlDoc.getElementsByTagName('Layer');
      const found: Array<{ name: string; title: string; abstract?: string }> = [];

      for (let i = 0; i < layerNodes.length; i++) {
        const node = layerNodes[i];
        const nameNode = node.getElementsByTagName('Name')[0];
        const titleNode = node.getElementsByTagName('Title')[0];
        if (nameNode && nameNode.textContent && nameNode.textContent.trim()) {
          const lName = nameNode.textContent.trim();
          if (!found.some(f => f.name === lName)) {
            found.push({
              name: lName,
              title: titleNode?.textContent?.trim() || lName,
              abstract: node.getElementsByTagName('Abstract')[0]?.textContent?.trim()
            });
          }
        }
      }

      if (found.length === 0) {
        setInspectMessage({
          type: 'warning',
          text: 'O servidor respondeu ao GetCapabilities, mas nenhuma camada com tag <Name> publicável foi encontrada no XML.'
        });
      } else {
        setDiscoveredLayers(found);
        setInspectMessage({
          type: 'success',
          text: `Sucesso! ${found.length} camada(s) identificada(s) no servidor. Escolha uma na lista abaixo para auto-preenchimento.`
        });
      }
    } catch (err: any) {
      console.warn('Erro ao inspecionar GetCapabilities:', err);
      const isCors = err.name === 'TypeError' || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
      if (isCors) {
        setInspectMessage({
          type: 'info',
          text: 'Aviso de CORS: O servidor bloqueia requisições diretas de GetCapabilities via AJAX no navegador. Isso é muito comum em órgãos públicos legados. No entanto, as imagens (tiles) ainda podem renderizar no Leaflet se você preencher o nome da camada (LAYERS) manualmente.'
        });
      } else {
        setInspectMessage({
          type: 'warning',
          text: `Falha na inspeção do servidor: ${err.message || 'Verifique se o serviço está ativo e online.'}`
        });
      }
    } finally {
      setIsInspecting(false);
    }
  };

  if (!isOpen) return null;

  const handleAddPreset = async (preset: ServicePreset) => {
    setLoadingPresetId(preset.id);
    setErrorMsg(null);

    try {
      if (preset.serviceType === 'geojson') {
        const geojson = await fetchPublicJson(preset.url);
        const features = geojson.features || [];
        if (features.length === 0) {
          throw new Error('Nenhuma feição geográfica encontrada no arquivo.');
        }

        const isEstadual = preset.id.includes('estadual');
        const isMananciais = preset.id.includes('mananciais') || preset.id.includes('apm');
        const isBacias = preset.id.includes('bacias') || preset.id.includes('ugrhi');
        const bbox = preset.bbox || calculateBoundingBox(features);
        const geomType = detectGeometryType(features);

        const style: LayerStyle = {
          fillColor: isMananciais ? 'transparent' : (isBacias ? '#38bdf8' : (isEstadual ? '#38bdf8' : '#0ea5e9')),
          strokeColor: isMananciais ? '#0284c7' : (isBacias ? '#0369a1' : (isEstadual ? '#0284c7' : '#334155')),
          strokeWidth: isMananciais ? 2.5 : (isBacias ? 2.0 : (isEstadual ? 3 : 1.2)),
          fillOpacity: isMananciais ? 0 : (isBacias ? 0.12 : (isEstadual ? 0.16 : 0.08)), // Preenchimento 100% vazado para perímetro APM
          strokeOpacity: isMananciais ? 1.0 : (isBacias ? 0.95 : (isEstadual ? 0.95 : 0.75)),
          pointRadius: 6,
          pointShape: 'circle'
        };

        const isMunicipais = preset.id.includes('municipais');
        const popupTitleField = 'nome';
        const popupFieldOrder = isMunicipais
          ? ['nome', 'codigo_ibge', 'microrregiao', 'mesorregiao', 'regiao_imediata', 'regiao_intermediaria', 'uf', 'estado', 'regiao', 'fonte']
          : isEstadual
          ? ['nome', 'sigla', 'codigo_ibge', 'capital', 'regiao', 'pais', 'municipios_total', 'fonte']
          : isMananciais
          ? ['nome', 'sigla', 'legislacao', 'tipo', 'gestao']
          : isBacias
          ? ['nome', 'ugrhi', 'sigla_comite', 'comite_bacia', 'bacia_hidrografica', 'sede_administrativa', 'num_municipios', 'rios_principais', 'situacao_hidrica', 'diretrizes_graprohab', 'legislacao', 'orgao_gestor', 'fonte']
          : undefined;

        const newLayer: GisLayer = {
          id: `layer_service_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: preset.name,
          description: preset.description,
          geometryType: geomType,
          serviceType: 'geojson',
          isServiceLayer: true,
          data: {
            type: 'FeatureCollection',
            features: features
          },
          visible: true,
          opacity: 1.0,
          style: style,
          filters: [],
          featureCount: features.length,
          filteredCount: features.length,
          propertiesSchema: extractPropertySchemas(features),
          popupTitleField: popupTitleField,
          popupFieldOrder: popupFieldOrder,
          bbox: bbox,
          createdAt: Date.now()
        };

        onAddLayer(newLayer);
        setSuccessPresetId(preset.id);
        setTimeout(() => {
          setSuccessPresetId(null);
          setLoadingPresetId(null);
          onClose();
        }, 700);
        return;
      }

      // Handle WMS / XYZ Presets
      const newId = `layer_service_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const defaultStyle: LayerStyle = {
        fillColor: '#38bdf8',
        strokeColor: '#0284c7',
        strokeWidth: 2,
        fillOpacity: 0.5,
        strokeOpacity: 0.8,
        pointRadius: 6,
        pointShape: 'circle'
      };

      const newLayer: GisLayer = {
        id: newId,
        name: preset.name,
        description: preset.description,
        geometryType: 'Raster',
        serviceType: preset.serviceType,
        isServiceLayer: true,
        data: {
          type: 'FeatureCollection',
          features: []
        },
        visible: true,
        opacity: preset.serviceType === 'xyz' ? 0.75 : 0.85,
        style: defaultStyle,
        filters: [],
        featureCount: 0,
        filteredCount: 0,
        propertiesSchema: [],
        bbox: preset.bbox || [-53.1, -25.3, -44.1, -19.7], // São Paulo BBOX
        createdAt: Date.now(),
        wmsConfig: preset.serviceType === 'wms' ? {
          url: preset.url,
          layers: preset.layers || '',
          format: preset.format || 'image/png',
          transparent: true,
          version: '1.1.1',
          attribution: preset.attribution
        } : undefined,
        xyzConfig: preset.serviceType === 'xyz' ? {
          url: preset.url,
          attribution: preset.attribution,
          maxZoom: 19
        } : undefined
      };

      onAddLayer(newLayer);
      setSuccessPresetId(preset.id);
      setTimeout(() => {
        setSuccessPresetId(null);
        setLoadingPresetId(null);
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Erro ao adicionar preset:', err);
      setErrorMsg(err.message || 'Falha ao conectar com o serviço.');
      setLoadingPresetId(null);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const rawUrl = serviceUrl.trim();
    const cleanUrl = (serviceType === 'wms' && rawUrl.includes('?'))
      ? rawUrl.split('?')[0].trim()
      : rawUrl;
    const cleanName = layerName.trim() || 'Nova Camada Web';

    if (!cleanUrl) {
      setErrorMsg('Por favor informe a URL do serviço.');
      return;
    }

    if (serviceType === 'wms' && !wmsLayers.trim()) {
      setShowAdvancedOptions(true);
      setErrorMsg('Para serviços OGC WMS, especifique o nome técnico da camada (LAYERS) nas Opções Avançadas ou clique em "Buscar Camadas no Servidor".');
      return;
    }

    setIsLoading(true);

    try {
      const newId = `layer_service_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const defaultStyle: LayerStyle = {
        fillColor: '#38bdf8',
        strokeColor: '#0284c7',
        strokeWidth: 2,
        fillOpacity: 0.5,
        strokeOpacity: 0.8,
        pointRadius: 6,
        pointShape: 'circle'
      };

      if (serviceType === 'geojson') {
        // Fetch GeoJSON directly from URL
        const res = await fetch(cleanUrl);
        if (!res.ok) {
          throw new Error(`Falha na requisição HTTP: ${res.status} ${res.statusText}`);
        }
        const geojson = await res.json();
        if (!geojson || (!geojson.features && geojson.type !== 'FeatureCollection')) {
          throw new Error('A resposta da URL não é um GeoJSON FeatureCollection válido.');
        }

        const features = geojson.features || [];
        const newLayer: GisLayer = {
          id: newId,
          name: cleanName,
          description: `Importado via URL GeoJSON/WFS: ${cleanUrl}`,
          geometryType: 'Mixed',
          serviceType: 'geojson',
          isServiceLayer: true,
          data: geojson,
          visible: true,
          opacity: opacity,
          style: defaultStyle,
          filters: [],
          featureCount: features.length,
          filteredCount: features.length,
          propertiesSchema: [],
          bbox: [-53.1, -25.3, -44.1, -19.7],
          createdAt: Date.now()
        };

        onAddLayer(newLayer);
      } else {
        // WMS or XYZ
        const newLayer: GisLayer = {
          id: newId,
          name: cleanName,
          description: `Serviço ${serviceType.toUpperCase()} conectado via: ${cleanUrl}`,
          geometryType: 'Raster',
          serviceType: serviceType,
          isServiceLayer: true,
          data: {
            type: 'FeatureCollection',
            features: []
          },
          visible: true,
          opacity: opacity,
          style: defaultStyle,
          filters: [],
          featureCount: 0,
          filteredCount: 0,
          propertiesSchema: [],
          bbox: (wmsLayers.includes('DISTRITO_MUNICIPAL') || wmsLayers.includes('SMDU'))
            ? [-46.826, -24.008, -46.365, -23.368] // Extensão exata do Município e Distritos de SP
            : [-53.1, -25.3, -44.1, -19.7],
          createdAt: Date.now(),
          wmsConfig: serviceType === 'wms' ? {
            url: cleanUrl.includes('serviceTranslator/rest/getXml')
              ? 'https://datageo.ambiente.sp.gov.br/geoserver/datageo/wms'
              : cleanUrl,
            layers: wmsLayers.trim(),
            format: wmsFormat,
            transparent: true,
            version: wmsVersion,
            attribution: attribution.trim() || 'Serviço WMS Externo'
          } : undefined,
          xyzConfig: serviceType === 'xyz' ? {
            url: cleanUrl,
            attribution: attribution.trim() || 'Serviço XYZ Tile Server',
            maxZoom: 19
          } : undefined
        };

        onAddLayer(newLayer);
      }

      setIsLoading(false);
      onClose();
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Erro ao conectar com o serviço. Verifique a URL e CORS do servidor.');
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shadow-xs">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight flex items-center gap-2">
                Conectar Web Map Service (WMS &amp; Serviços Web)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Incorpore camadas OGC WMS (GeoServer, DataGeo SP, IBGE), servidores XYZ ou WFS.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-100/60 px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`pb-2.5 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'presets'
                ? 'border-red-600 text-red-700 bg-white/80 rounded-t-lg font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-red-600" />
            <span>Catálogo Pré-configurado (1 Clique)</span>
            <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.2 rounded-full">
              {PRESET_SERVICES.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`pb-2.5 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'custom'
                ? 'border-red-600 text-red-700 bg-white/80 rounded-t-lg font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Server className={`w-3.5 h-3.5 ${activeTab === 'custom' ? 'text-red-600' : 'text-slate-600'}`} />
            <span>Adicionar Serviço Personalizado</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'presets' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Selecione uma base vetorial temática oficial para carregar diretamente no mapa:</span>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Database className="w-3 h-3 text-emerald-600" />
                  {PRESET_SERVICES.length} Camadas Vetoriais
                </span>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-red-900 mb-0.5">Erro ao carregar camada pré-configurada:</p>
                    <p>{errorMsg}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5">
                {PRESET_SERVICES.map((preset) => {
                  const isSuccess = successPresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className="p-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-red-300 hover:shadow-xs transition-all flex items-start justify-between gap-3 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="mb-1 flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs text-slate-900">
                            {preset.name}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <Database className="w-2.5 h-2.5 text-emerald-600" />
                            Vetor Interativo
                          </span>
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {preset.attribution}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          {preset.description}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-mono">
                          <span className="truncate max-w-[320px]">{preset.url}</span>
                          {preset.layers && (
                            <span className="text-slate-500 font-sans truncate max-w-[280px]" title={preset.layers}>
                              Camada: <b>{preset.layers}</b>
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddPreset(preset)}
                        disabled={isSuccess || loadingPresetId === preset.id}
                        className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                          isSuccess
                            ? 'bg-emerald-600 text-white'
                            : loadingPresetId === preset.id
                            ? 'bg-red-100 text-red-700 cursor-wait'
                            : 'bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200 hover:border-red-600'
                        }`}
                        title="Adicionar esta camada ao mapa agora"
                      >
                        {isSuccess ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Adicionada!</span>
                          </>
                        ) : loadingPresetId === preset.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Conectando...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Adicionar</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <form onSubmit={handleCustomSubmit} className="space-y-4">
              {/* URL Input (Campo Principal com Auto-detecção) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    URL do Serviço de Mapa (WMS, XYZ ou GeoJSON) *
                  </label>
                  {serviceUrl.includes('?') && serviceType === 'wms' && (
                    <button
                      type="button"
                      onClick={handleSanitizeUrl}
                      className="text-[10px] text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors"
                      title="Remove parâmetros de consulta (?request=...) e deixa apenas a URL base limpa"
                    >
                      <Wand2 className="w-3 h-3 text-amber-600" />
                      <span>Limpar Parâmetros (?...)</span>
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="url"
                    placeholder="Cole aqui a URL (ex: https://datageo.ambiente.sp.gov.br/geoserver/datageo/wms ou https://tile.openstreetmap.org/{z}/{x}/{y}.png)"
                    value={serviceUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-all shadow-inner"
                    required
                  />
                  {serviceUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setServiceUrl('');
                        setLayerName('');
                        setWmsLayers('');
                        setInspectMessage(null);
                        setDiscoveredLayers([]);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      title="Limpar campo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status e Badge de Auto-Detecção em Tempo Real */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  {serviceUrl.trim() ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {serviceType === 'wms' ? (
                          <>
                            <Radio className="w-3.5 h-3.5 text-emerald-600" />
                            <span>OGC WMS detectado</span>
                            {wmsLayers && <span className="font-mono text-emerald-950 font-bold ml-1">({wmsLayers})</span>}
                          </>
                        ) : serviceType === 'xyz' ? (
                          <>
                            <Layers className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Mosaico XYZ Tiles detectado</span>
                          </>
                        ) : (
                          <>
                            <Database className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Vetor GeoJSON / REST detectado</span>
                          </>
                        )}
                      </span>

                      {/* Alerta de Mixed Content quando aplicável */}
                      {isMixedContent && (
                        <button
                          type="button"
                          onClick={handleConvertUrlToHttps}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 cursor-pointer transition-colors"
                          title="Clique para converter de http:// para https://"
                        >
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                          <span>Converter para HTTPS (recomendado)</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>Cole qualquer URL WMS, XYZ ou GeoJSON. O tipo e parâmetros são reconhecidos automaticamente.</span>
                    </span>
                  )}

                  {/* Botão de GetCapabilities quando o serviço for WMS */}
                  {serviceType === 'wms' && serviceUrl.trim() && (
                    <button
                      type="button"
                      onClick={handleInspectCapabilities}
                      disabled={isInspecting}
                      className="px-2.5 py-1 bg-white hover:bg-red-50 text-red-700 border border-red-200 hover:border-red-300 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                      title="Consulta o GetCapabilities no servidor para listar camadas disponíveis"
                    >
                      {isInspecting ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-red-600" />
                          <span>Buscando camadas...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-3 h-3 text-red-600" />
                          <span>Buscar Camadas no Servidor</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Mensagem de Inspeção */}
                {inspectMessage && (
                  <div className={`mt-2 p-2.5 rounded-xl text-[11px] border leading-relaxed ${
                    inspectMessage.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : inspectMessage.type === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}>
                    {inspectMessage.text}
                  </div>
                )}

                {/* Dropdown de Camadas Descobertas */}
                {discoveredLayers.length > 0 && (
                  <div className="mt-2.5 bg-white p-3 rounded-xl border border-red-200 space-y-1.5 shadow-xs animate-in fade-in">
                    <label className="block text-[11px] font-bold text-slate-800">
                      Selecione uma das camadas encontradas no servidor ({discoveredLayers.length}):
                    </label>
                    <select
                      onChange={(e) => {
                        const selected = discoveredLayers.find(l => l.name === e.target.value);
                        if (selected) {
                          setWmsLayers(selected.name);
                          if (!layerName || layerName === 'Nova Camada Web' || layerName.startsWith('Serviço')) {
                            setLayerName(selected.title || selected.name);
                          }
                        }
                      }}
                      value={wmsLayers}
                      className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 font-mono focus:outline-none focus:border-red-600 cursor-pointer"
                    >
                      <option value="" disabled>-- Clique para selecionar uma camada disponível --</option>
                      {discoveredLayers.map((l, idx) => (
                        <option key={idx} value={l.name}>
                          {l.title ? `${l.title} (${l.name})` : l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Nome da Camada (Segundo Campo Essencial) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Nome da Camada no Mapa *
                </label>
                <input
                  type="text"
                  placeholder="Ex: DataGeo - Limites Municipais ou Mosaico Satélite"
                  value={layerName}
                  onChange={(e) => setLayerName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors shadow-inner"
                  required
                />
              </div>

              {/* Gaveta Retrátil de Opções Avançadas (Fechada por padrão) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 transition-all">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100/70 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                    <span>Opções Avançadas (Versão, Formato, Opacidade, Atribuição)</span>
                  </div>
                  {showAdvancedOptions ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {showAdvancedOptions && (
                  <div className="p-4 pt-2.5 space-y-3.5 border-t border-slate-200/80 bg-white">
                    {/* Seletor Manual de Tipo caso queira forçar */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Tipo de Serviço
                        </label>
                        <select
                          value={serviceType}
                          onChange={(e) => setServiceType(e.target.value as LayerServiceType)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-red-600 cursor-pointer"
                        >
                          <option value="wms">OGC WMS (GeoServer / MapServer)</option>
                          <option value="xyz">XYZ Tile Server ({'{z}/{x}/{y}'})</option>
                          <option value="geojson">GeoJSON / API REST</option>
                        </select>
                      </div>

                      {serviceType === 'wms' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Nome Técnico da Camada (LAYERS) *
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: workspace:camada"
                            value={wmsLayers}
                            onChange={(e) => setWmsLayers(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-red-600"
                          />
                        </div>
                      )}

                      {serviceType === 'wms' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Versão OGC WMS
                          </label>
                          <select
                            value={wmsVersion}
                            onChange={(e) => setWmsVersion(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-red-600 cursor-pointer"
                          >
                            <option value="1.1.1">WMS 1.1.1 (Padrão Universal Leaflet)</option>
                            <option value="1.3.0">WMS 1.3.0</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {serviceType === 'wms' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Formato de Imagem (FORMAT)
                          </label>
                          <select
                            value={wmsFormat}
                            onChange={(e) => setWmsFormat(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-red-600 cursor-pointer"
                          >
                            <option value="image/png">image/png (Com transparência recomendada)</option>
                            <option value="image/jpeg">image/jpeg (Sem transparência)</option>
                            <option value="image/png8">image/png8 (Leve / Paletizado)</option>
                          </select>
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Texto de Atribuição / Créditos
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: DataGeo / SIMA SP / IBGE"
                          value={attribution}
                          onChange={(e) => setAttribution(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-red-600"
                        />
                      </div>
                    </div>

                    {/* Slider de Opacidade Inicial */}
                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-[11px] font-semibold text-slate-700 w-28">
                        Opacidade inicial:
                      </span>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={opacity}
                        onChange={(e) => setOpacity(parseFloat(e.target.value))}
                        className="flex-1 accent-red-600 cursor-pointer"
                      />
                      <span className="text-xs font-mono font-bold text-slate-700 w-12 text-right">
                        {Math.round(opacity * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Alerta de Erro */}
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-red-600/20 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Conectando...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Conectar ao Mapa</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer info */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span>Serviços WMS e XYZ renderizam como camadas dinâmicas sobrepostas à base cartográfica.</span>
          </div>
          <span className="font-semibold text-slate-600">Padrão OGC / Leaflet</span>
        </div>
      </div>
    </div>
  );
};
