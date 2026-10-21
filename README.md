# Graproh@b | GeoPortal

> Plataforma de Informações Geográficas e Análise Espacial do **GRAPROHAB** (Grupo de Análise e Aprovação de Projetos Habitacionais do Estado de São Paulo).

---

## 🗺️ Visão Geral

O **Graproh@b GeoPortal** é uma aplicação web moderna e interativa desenvolvida para centralizar, visualizar e analisar dados territoriais, processos de parcelamento do solo, loteamentos e desmembramentos no Estado de São Paulo.


---

## ✨ Principais Funcionalidades

* **Visualização Cartográfica Avançada:**
  * Múltiplos mapas base (OpenStreetMap, Satélite ESRI, Relevo, CartoDB Positron/Dark, entre outros).
  * Renderização de geometrias tipo Ponto, Linha e Polígono.
  * Suporte a coordenadas geográficas (WGS84) e reprojeção de sistemas de coordenadas projetadas (UTM / SIRGAS 2000).
* **Filtros e Consultas:**
  * Filtros dinâmicos por município, requerente, status, datas e valores numéricos.
  * Painel de filtragem avançada com múltiplos operadores lógicos (`=`, `>`, `<`, `contains`, `between`).
* **Tabela de Atributos e Inspeção:**
  * Tabela de dados tabular com paginação, busca rápida e ordenação.
  * Painel de detalhes da feição com resumo do empreendimento.
* **Ferramentas Espaciais (GIS):**
  * Medição precisa de distâncias lineares e áreas em m²/hectares (via Turf.js).
  * Estilização visual temática (cores de preenchimento, espessura e opacidade de contorno, raio de vértices).
  * Exportação de dados para GeoJSON, KML e CSV.
* **Persistência Local (Offline-first):**
  * Armazenamento e sincronização com IndexedDB via `localforage`, permitindo salvar o estado das camadas no próprio navegador.

---

## 🛠️ Tecnologias Utilizadas

* **Frontend:**
  * [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
  * [Vite](https://vitejs.dev/)
  * [Tailwind CSS](https://tailwindcss.com/)
  * [Leaflet](https://leafletjs.com/)
  * [Turf.js](https://turfjs.org/) (Análise geoespacial e medições de área/perímetro)
  * [Proj4js](https://github.com/proj4js/proj4js) (Reprojeção de coordenadas UTM)
  * [Lucide React](https://lucide.dev/) (Ícones)
* **Backend:**
  * [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)
* **CI/CD:**
  * GitHub Actions para build e deploy automatizado no GitHub Pages.

