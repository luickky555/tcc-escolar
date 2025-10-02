// publico.js (módulo)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Substitua se quiser, mas estes são os valores que você já tinha
const SUPABASE_URL = "https://ufbysktvyqzmnppxnvlj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmYnlza3R2eXF6bW5wcHhudmxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NTQxNTYsImV4cCI6MjA3MzUzMDE1Nn0.WK0C27oM8x4O_jOKWvOOu6Sh6M6HQpX00LPUmOQqUco";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM refs
const grid = document.getElementById("gridContainer");
const loadingBox = document.getElementById("loadingBox");
const swiperWrapper = document.getElementById("swiperWrapper");
const inputBusca = document.getElementById("inputBusca");
const selectOrdenar = document.getElementById("selectOrdenar");
const btnMostrarTodos = document.getElementById("btnMostrarTodos");
const btnFavoritos = document.getElementById("btnFavoritos");

let alimentosCache = [];
let swiper = null;
let favoritos = new Set(JSON.parse(localStorage.getItem("fav_alimentos") || "[]"));

// util escape
function escapeHtml(s = "") {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// Se imagem for apenas path (ex: 'abc.jpg'), converte para publicUrl
async function ensurePublicImageUrl(item) {
  if (!item || !item.imagem) return item;
  try {
    if (typeof item.imagem === 'string' && item.imagem.startsWith('http')) return item;
    const { data } = supabase.storage.from('alimentos').getPublicUrl(item.imagem);
    if (data?.publicUrl) item.imagem = data.publicUrl;
    return item;
  } catch (err) {
    console.warn('Erro ao normalizar imagem', err);
    return item;
  }
}

// cria card
function criarCard(item) {
  const div = document.createElement("div");
  div.className = "card bg-white rounded-xl overflow-hidden card-hover";
  div.setAttribute("data-aos", "fade-up");
  div.setAttribute("data-id", item.id);

  const imagemHtml = item.imagem
    ? `<img src="${escapeHtml(item.imagem)}" loading="lazy" alt="${escapeHtml(item.nome)}" class="h-48 w-full object-cover" />`
    : `<div class="placeholder-img">🍽️</div>`;

  const kcal = item.calorias ?? "-";
  const carb = item.carboidratos ?? "-";
  const prot = item.proteinas ?? "-";
  const gord = item.gorduras ?? "-";

  const favoritoClass = favoritos.has(item.id) ? "btn-primary" : "btn-ghost";

  div.innerHTML = `
    ${imagemHtml}
    <div class="p-4">
      <div class="flex justify-between items-start gap-3">
        <div>
          <h3 class="text-lg font-bold text-purple-700">${escapeHtml(item.nome)}</h3>
          <p class="text-sm text-gray-600 mt-1">${escapeHtml(item.descricao ?? "")}</p>
        </div>
        <div class="text-right text-xs text-gray-400">
          <div class="mb-1">${escapeHtml(item.categoria ?? "Geral")}</div>
          <div class="text-gray-500">ID ${item.id}</div>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-2">
        <div class="badge badge-outline">🔥 ${kcal} kcal</div>
        <div class="badge badge-outline">🥖 ${carb} g</div>
        <div class="badge badge-outline">🍗 ${prot} g</div>
        <div class="badge badge-outline">🥑 ${gord} g</div>
      </div>

      <div class="mt-4 flex gap-2">
        <button class="btn btn-sm btn-outline" data-action="ver" data-id="${item.id}">Ver nutrientes</button>
        <button class="btn btn-sm ${favoritoClass}" data-action="fav" data-id="${item.id}">♥</button>
        <button class="btn btn-sm btn-ghost" data-action="share" data-id="${item.id}">🔗</button>
      </div>
    </div>
  `;

  div.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const action = btn.getAttribute("data-action");
      const id = Number(btn.getAttribute("data-id"));
      if (action === "ver") onVerNutrientes(id);
      if (action === "fav") toggleFavorito(id, btn);
      if (action === "share") onShare(id);
    });
  });

  return div;
}

// modal chart
let ultimaChart = null;
function onVerNutrientes(id) {
  const item = alimentosCache.find(a => a.id === id);
  if (!item) return;
  const carbs = Number(item.carboidratos ?? 0);
  const prots = Number(item.proteinas ?? 0);
  const fats = Number(item.gorduras ?? 0);

  const html = `
    <div style="min-width:320px">
      <h3 class="swal-title">${escapeHtml(item.nome)}</h3>
      <p style="color:#6b7280">${escapeHtml(item.descricao ?? "")}</p>
      <div style="display:flex;gap:12px;align-items:center;margin-top:12px;">
        <canvas id="chartNutrientes" width="320" height="200"></canvas>
        <div style="font-size:14px">
          <div>🔥 <strong>${item.calorias ?? "-"}</strong> kcal</div>
          <div>🥖 Carbo: <strong>${carbs ?? "-"}</strong> g</div>
          <div>🍗 Prot: <strong>${prots ?? "-"}</strong> g</div>
          <div>🥑 Gord: <strong>${fats ?? "-"}</strong> g</div>
        </div>
      </div>
    </div>
  `;

  Swal.fire({
    html,
    showCloseButton: true,
    showConfirmButton: false,
    didOpen: () => {
      const ctx = document.getElementById('chartNutrientes').getContext('2d');
      if (ultimaChart) { ultimaChart.destroy(); ultimaChart = null; }
      const dataValues = (carbs || prots || fats) ? [carbs, prots, fats] : [1,1,1];
      ultimaChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Carboidratos','Proteínas','Gorduras'],
          datasets: [{ data: dataValues }]
        },
        options: { plugins: { legend: { position: 'bottom' } } }
      });
    }
  });
}

function toggleFavorito(id, btnEl) {
  if (favoritos.has(id)) {
    favoritos.delete(id);
    btnEl.classList.remove("btn-primary");
    btnEl.classList.add("btn-ghost");
  } else {
    favoritos.add(id);
    btnEl.classList.remove("btn-ghost");
    btnEl.classList.add("btn-primary");
  }
  localStorage.setItem("fav_alimentos", JSON.stringify(Array.from(favoritos)));
}

function onShare(id) {
  const url = `${location.origin}${location.pathname}?food=${id}`;
  navigator.clipboard?.writeText(url).then(() => {
    Swal.fire({ toast:true, position:'top-end', icon:'success', title:'Link copiado!' });
  }).catch(() => { Swal.fire({ icon:'info', title:'Copiar manualmente', text: url }); });
}

function renderGrid(items, opts = {}) {
  const { categoria = "Todos", busca = "", ordenar = "novo" } = opts;
  grid.innerHTML = "";

  let arr = items.slice();

  if (categoria && categoria !== "Todos") arr = arr.filter(i => (i.categoria ?? "Geral") === categoria);
  if (busca && busca.trim().length > 0) {
    const q = busca.trim().toLowerCase();
    arr = arr.filter(i => (i.nome ?? "").toLowerCase().includes(q) || (i.descricao ?? "").toLowerCase().includes(q));
  }

  if (ordenar === "cal-asc") arr.sort((a,b) => (Number(a.calorias)||0) - (Number(b.calorias)||0));
  else if (ordenar === "cal-desc") arr.sort((a,b) => (Number(b.calorias)||0) - (Number(a.calorias)||0));
  else if (ordenar === "nome") arr.sort((a,b) => (a.nome||"").localeCompare(b.nome||""));
  else arr.sort((a,b) => (b.created_at ? new Date(b.created_at) - new Date(a.created_at) : b.id - a.id));

  if (arr.length === 0) {
    grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-12">Nenhum item encontrado.</div>`;
    return;
  }

  arr.forEach(item => {
    const card = criarCard(item);
    grid.appendChild(card);
  });
  if (window.AOS) AOS.refresh();
}

function buildSwiper(categorias) {
  swiperWrapper.innerHTML = '';
  const allSlide = document.createElement('div');
  allSlide.className = 'swiper-slide btn btn-ghost btn-primary';
  allSlide.textContent = 'Todos';
  allSlide.dataset.cat = 'Todos';
  swiperWrapper.appendChild(allSlide);

  categorias.forEach(cat => {
    const slide = document.createElement('div');
    slide.className = 'swiper-slide btn btn-ghost';
    slide.textContent = cat;
    slide.dataset.cat = cat;
    swiperWrapper.appendChild(slide);
  });

  if (swiper) swiper.destroy(true, true);
  swiper = new Swiper('.mySwiper', { slidesPerView: 'auto', spaceBetween: 8, freeMode: true });

  document.querySelectorAll('.swiper-slide').forEach(node => {
    node.addEventListener('click', () => {
      document.querySelectorAll('.swiper-slide').forEach(s => s.classList.remove('btn-primary'));
      node.classList.add('btn-primary');
      const cat = node.dataset.cat ?? 'Todos';
      renderGrid(alimentosCache, { categoria: cat, busca: inputBusca.value, ordenar: selectOrdenar.value });
    });
  });
}

async function carregarAlimentos() {
  try {
    if (loadingBox) loadingBox.style.display = 'flex';
    console.log('Tentando buscar alimentos do Supabase...', SUPABASE_URL);

    const { data, error } = await supabase
      .from('alimentos')
      .select('*')
      .order('id', { ascending: false });

    console.log('Resposta Supabase:', { data, error });

    if (error) {
      grid.innerHTML = `<div class="col-span-full text-center text-red-500 py-12">Erro ao carregar cardápio: ${escapeHtml(error.message || JSON.stringify(error))}</div>`;
      return;
    }

    alimentosCache = data || [];

    // normaliza imagens (se forem paths)
    for (let i = 0; i < alimentosCache.length; i++) {
      alimentosCache[i] = await ensurePublicImageUrl(alimentosCache[i]);
    }

    const categorias = Array.from(new Set(alimentosCache.map(i => i.categoria ?? 'Geral')));
    buildSwiper(categorias);
    renderGrid(alimentosCache, { categoria: 'Todos', busca: '', ordenar: 'novo' });

  } catch (err) {
    console.error('Erro carregarAlimentos:', err);
    grid.innerHTML = `<div class="col-span-full text-center text-red-500 py-12">Erro inesperado ao carregar cardápio. Veja console.</div>`;
  } finally {
    if (loadingBox) loadingBox.style.display = 'none';
  }
}

// listeners
inputBusca?.addEventListener('input', () => {
  const ativo = document.querySelector('.swiper-slide.btn-primary')?.dataset.cat ?? 'Todos';
  renderGrid(alimentosCache, { categoria: ativo, busca: inputBusca.value, ordenar: selectOrdenar.value });
});

selectOrdenar?.addEventListener('change', () => {
  const ativo = document.querySelector('.swiper-slide.btn-primary')?.dataset.cat ?? 'Todos';
  renderGrid(alimentosCache, { categoria: ativo, busca: inputBusca.value, ordenar: selectOrdenar.value });
});

btnMostrarTodos?.addEventListener('click', () => {
  document.querySelectorAll('.swiper-slide').forEach(s => s.classList.remove('btn-primary'));
  document.querySelector('.swiper-slide[data-cat="Todos"]')?.classList.add('btn-primary');
  inputBusca.value = '';
  selectOrdenar.value = 'novo';
  renderGrid(alimentosCache, { categoria: 'Todos', busca: '', ordenar: 'novo' });
});

btnFavoritos?.addEventListener('click', () => {
  const favs = alimentosCache.filter(a => favoritos.has(a.id));
  if (favs.length === 0) {
    Swal.fire({ icon: 'info', title: 'Sem favoritos', text: 'Você ainda não marcou favoritos.' });
    return;
  }
  renderGrid(favs, { categoria: 'Todos', busca: '', ordenar: 'novo' });
});

carregarAlimentos();
