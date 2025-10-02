// painel.js (module) - atualizado para salvar imagem_path e nutri_source, usa OpenFoodFacts (sem chave)
// Supabase config já preenchida com os valores fornecidos pelo usuário
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/* ========== CONFIGURAÇÃO ========== */
const SUPABASE_URL = "https://ufbysktvyqzmnppxnvlj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmYnlza3R2eXF6bW5wcHhudmxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NTQxNTYsImV4cCI6MjA3MzUzMDE1Nn0.WK0C27oM8x4O_jOKWvOOu6Sh6M6HQpX00LPUmOQqUco";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ========== PROTEÇÃO (login simplificado) ========== */
if (localStorage.getItem("adminLogado") !== "true") {
  window.location.href = "index.html";
}

/* ========== ELEMENTOS DOM ========== */
const form = document.getElementById("formAlimento");
const nomeInput = document.getElementById("nomeAlimento");
const descInput = document.getElementById("descAlimento");
const imgInput = document.getElementById("imgAlimento");
const selCategoria = document.getElementById("categoriaAlimento");
const novaCategoriaInput = document.getElementById("novaCategoria");
const porcaoInput = document.getElementById("porcaoAlimento");
const porcaoUnidadeInput = document.getElementById("porcaoUnidade");
const msg = document.getElementById("msgAlimento");
const listaAdmin = document.getElementById("listaAdmin");
const btnLogout = document.getElementById("btnLogout");

/* ========== HELPERS ========== */
function mostrarMensagem(texto, tipo = "erro") {
  msg.textContent = texto;
  msg.className = `mt-2 text-center font-bold ${tipo === "sucesso" ? "text-green-500" : "text-red-500"}`;
}
function escapeHtml(str) {
  if (!str && str !== 0) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ========== STORAGE helpers (upload retorna path) ========== */
async function uploadImagem(arquivo) {
  if (!arquivo) return { publicUrl: null, path: null };
  const nomeArquivo = `${Date.now()}_${arquivo.name.replace(/\s+/g, '_')}`;
  // upload para bucket 'alimentos'
  const { error: upErr } = await supabase.storage.from('alimentos').upload(nomeArquivo, arquivo);
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('alimentos').getPublicUrl(nomeArquivo);
  return { publicUrl: data?.publicUrl ?? null, path: nomeArquivo };
}

async function removerArquivoPorPath(path) {
  if (!path) return;
  try {
    const { error } = await supabase.storage.from('alimentos').remove([path]);
    if (error) console.warn('Erro ao remover arquivo', error);
  } catch (e) {
    console.warn('Falha ao remover arquivo', e);
  }
}

/* ========== FUNÇÃO DE NUTRIENTES: OpenFoodFacts (SEM CHAVE) ========== */
async function calcularNutrientesOpenFoodFacts(nome, porcao, unidade) {
  try {
    const query = encodeURIComponent(nome);
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&search_simple=1&json=1&page_size=6`;
    const resp = await fetch(url);
    if (!resp.ok) return {};
    const json = await resp.json();
    if (!json.products || json.products.length === 0) return {};

    const produto = json.products.find(p => p.nutriments) || json.products[0];
    if (!produto) return {};
    const nut = produto.nutriments || {};

    const calories100 = nut["energy-kcal_100g"] ?? nut["energy_100g"] ?? null;
    const carbs100 = nut["carbohydrates_100g"] ?? null;
    const prot100 = nut["proteins_100g"] ?? null;
    const fat100 = nut["fat_100g"] ?? null;

    const calories_serving = nut["energy-kcal_serving"] ?? nut["energy_serving"] ?? null;
    const carbs_serving = nut["carbohydrates_serving"] ?? null;
    const prot_serving = nut["proteins_serving"] ?? null;
    const fat_serving = nut["fat_serving"] ?? null;

    let baseCalories = calories_serving ?? calories100;
    let baseCarbs = carbs_serving ?? carbs100;
    let baseProt = prot_serving ?? prot100;
    let baseFat = fat_serving ?? fat100;

    let scaled = false;
    let porcaoGramas = null;
    if (unidade) {
      const m = unidade.match(/(\d+\.?\d*)\s*g/i);
      if (m) porcaoGramas = Number(m[1]);
      else if (/^g$/i.test(unidade) && porcao) porcaoGramas = Number(porcao);
    }

    if (porcaoGramas && typeof baseCalories === 'number') {
      const factor = porcaoGramas / 100;
      baseCalories = (baseCalories !== null ? Number(baseCalories) * factor : null);
      baseCarbs = (baseCarbs !== null ? Number(baseCarbs) * factor : null);
      baseProt = (baseProt !== null ? Number(baseProt) * factor : null);
      baseFat = (baseFat !== null ? Number(baseFat) * factor : null);
      scaled = true;
    }

    const round = v => (v === undefined || v === null || Number.isNaN(Number(v))) ? null : Math.round(Number(v) * 10) / 10;

    return {
      calorias: round(baseCalories),
      carboidratos: round(baseCarbs),
      proteinas: round(baseProt),
      gorduras: round(baseFat),
      _meta: {
        source: 'openfoodfacts',
        product_name: produto.product_name || produto.generic_name || null,
        scaled_by_grams: scaled ? porcaoGramas : null
      }
    };
  } catch (err) {
    console.warn("OpenFoodFacts erro:", err);
    return {};
  }
}

/* ========== CATEGORIAS ========== */
async function carregarCategoriasParaSelect() {
  try {
    const { data } = await supabase.from('alimentos').select('categoria').not('categoria','is',null);
    const set = new Set();
    (data || []).forEach(r => { if (r.categoria) set.add(r.categoria); });
    const categorias = Array.from(set).sort();
    selCategoria.innerHTML = `<option value="">— Selecionar categoria —</option>`;
    categorias.forEach(cat => {
      const opt = document.createElement('option'); opt.value = cat; opt.textContent = cat;
      selCategoria.appendChild(opt);
    });
    const novaOpt = document.createElement('option'); novaOpt.value = '__nova__'; novaOpt.textContent = '➕ Adicionar nova categoria...';
    selCategoria.appendChild(novaOpt);
  } catch (err) {
    console.warn('Erro carregar categorias', err);
  }
}
selCategoria?.addEventListener?.('change', () => {
  if (!novaCategoriaInput) return;
  if (selCategoria.value === '__nova__') { novaCategoriaInput.classList.remove('hidden'); novaCategoriaInput.focus(); }
  else { novaCategoriaInput.classList.add('hidden'); novaCategoriaInput.value = ''; }
});

/* ========== ADICIONAR ALIMENTO ========== */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensagem('', '');
  const nome = (nomeInput.value || '').trim();
  if (!nome) return mostrarMensagem('❌ Nome é obrigatório!');
  const descricao = (descInput.value || '').trim() || null;
  const categoria = selCategoria.value === '__nova__' ? (novaCategoriaInput.value.trim() || null) : (selCategoria.value || null);
  const porcao = porcaoInput.value ? Number(porcaoInput.value) : null;
  const porcao_unidade = (porcaoUnidadeInput.value || '').trim() || null;
  const arquivo = imgInput.files[0];

  try {
    mostrarMensagem('⏳ Salvando...');

    // upload imagem (se houver) -> agora pega path também
    let publicUrl = null;
    let uploadedPath = null;
    if (arquivo) {
      const upl = await uploadImagem(arquivo);
      publicUrl = upl.publicUrl;
      uploadedPath = upl.path;
    }

    // tenta calcular nutrientes via OpenFoodFacts
    const nutrientes = await calcularNutrientesOpenFoodFacts(nome, porcao, porcao_unidade);

    const payload = {
      nome,
      descricao,
      categoria,
      porcao,
      porcao_unidade,
      imagem: publicUrl,
      imagem_path: uploadedPath,
      calorias: nutrientes.calorias ?? null,
      carboidratos: nutrientes.carboidratos ?? null,
      proteinas: nutrientes.proteinas ?? null,
      gorduras: nutrientes.gorduras ?? null,
      nutri_source: (nutrientes && nutrientes._meta && nutrientes._meta.source) ? nutrientes._meta.source : (nutrientes && (nutrientes.calorias||nutrientes.carboidratos||nutrientes.proteinas||nutrientes.gorduras) ? 'openfoodfacts' : 'manual')
    };

    const { error } = await supabase.from('alimentos').insert([payload]);
    if (error) throw error;

    mostrarMensagem('✅ Alimento adicionado!', 'sucesso');
    form.reset();
    novaCategoriaInput.classList.add('hidden');
    document.getElementById('previewMini')?.classList.add('hidden');

    await carregarCategoriasParaSelect();
    await carregarAlimentos();
  } catch (err) {
    console.error(err);
    mostrarMensagem('❌ Erro ao salvar alimento.');
  }
});

/* ========== LISTAR ========== */
async function carregarAlimentos() {
  listaAdmin.innerHTML = `<li class="p-6 bg-white rounded-lg shadow text-center text-gray-400">Carregando...</li>`;
  try {
    const { data, error } = await supabase.from('alimentos').select('*').order('id', { ascending: false });
    if (error) throw error;
    listaAdmin.innerHTML = '';
    data.forEach(item => {
      const li = document.createElement('li');
      li.className = 'p-4 bg-white rounded-lg shadow flex justify-between items-center';
      li.innerHTML = `
        <div class="flex items-center gap-4 flex-1">
          ${item.imagem ? `<img src="${item.imagem}" class="w-16 h-16 rounded object-cover" />` : `<div class="w-16 h-16 rounded bg-gradient-to-br from-purple-300 to-pink-300 flex items-center justify-center">🍽️</div>`}
          <div>
            <p class="font-bold text-purple-700">${escapeHtml(item.nome)}</p>
            <p class="text-gray-500 text-sm">${escapeHtml(item.descricao || '')}</p>
            <p class="text-xs text-gray-400">Categoria: ${escapeHtml(item.categoria || 'Geral')}</p>
            <p class="text-xs text-gray-400">Porção: ${item.porcao ?? '-'} ${escapeHtml(item.porcao_unidade || '')}</p>
            <p class="text-xs text-gray-400">🔥 ${item.calorias ?? '-'} kcal</p>
            <p class="text-xs text-gray-400">Fonte: ${escapeHtml(item.nutri_source || 'manual')}</p>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-xs btn-info" data-edit="${item.id}">✏️</button>
          <button class="btn btn-xs btn-error" data-del="${item.id}">🗑</button>
        </div>
      `;
      listaAdmin.appendChild(li);
    });

    // excluir: usa imagem_path diretamente
    document.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.del;
        const conf = confirm('Confirmar exclusão deste alimento?');
        if (!conf) return;
        try {
          // buscar imagem_path do item
          const { data: itemData } = await supabase.from('alimentos').select('imagem_path').eq('id', id).single();
          await supabase.from('alimentos').delete().eq('id', id);
          const path = itemData?.imagem_path ?? null;
          if (path) await removerArquivoPorPath(path);
          await carregarCategoriasParaSelect();
          await carregarAlimentos();
          alert('Removido');
        } catch (err) {
          console.error(err);
          alert('Erro ao excluir');
        }
      };
    });

    // editar
    document.querySelectorAll('[data-edit]').forEach(btn => {
      btn.onclick = () => abrirEdicaoModal(btn.dataset.edit);
    });

  } catch (err) {
    console.error(err);
    listaAdmin.innerHTML = `<li class='p-6 bg-white rounded-lg shadow text-center text-red-500'>Erro ao carregar alimentos!</li>`;
  }
}

/* ========== EDITAR em modal (SweetAlert2) ========== */
async function abrirEdicaoModal(id) {
  try {
    const { data: item, error } = await supabase.from('alimentos').select('*').eq('id', id).single();
    if (error) throw error;

    const { data: catsRaw } = await supabase.from('alimentos').select('categoria').not('categoria','is',null);
    const set = new Set((catsRaw||[]).map(r=>r.categoria).filter(Boolean));
    const categorias = Array.from(set).sort();
    const options = categorias.map(c => `<option value="${escapeHtml(c)}" ${c===item.categoria?'selected':''}>${escapeHtml(c)}</option>`).join('');

    const html = `
      <div class="space-y-2 text-left">
        <label class="text-xs text-gray-500">Nome</label>
        <input id="sw_nome" class="sw-input" value="${escapeHtml(item.nome)}" />
        <label class="text-xs text-gray-500">Descrição</label>
        <textarea id="sw_desc" class="sw-input">${escapeHtml(item.descricao || '')}</textarea>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-xs text-gray-500">Categoria</label>
            <select id="sw_cat">${options}<option value="__nova__">➕ Nova categoria...</option></select>
          </div>
          <div>
            <label class="text-xs text-gray-500">Nova categoria</label>
            <input id="sw_cat_nova" class="sw-input" style="display:none" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-xs text-gray-500">Porção</label>
            <input id="sw_porcao" type="number" step="0.01" value="${item.porcao ?? ''}" class="sw-input" />
          </div>
          <div>
            <label class="text-xs text-gray-500">Unidade</label>
            <input id="sw_porcao_un" value="${escapeHtml(item.porcao_unidade || '')}" class="sw-input" />
          </div>
        </div>

        <div>
          <label class="text-xs text-gray-500">Substituir imagem (opcional)</label>
          <input id="sw_img" type="file" accept="image/*" />
          ${item.imagem ? `<div class="mt-2"><img src="${item.imagem}" style="width:120px;height:80px;object-fit:cover;border-radius:.5rem" /></div>` : ''}
        </div>

        <div class="mt-2 text-sm text-gray-500">Se os nutrientes estiverem incorretos, edite manualmente após salvar.</div>
      </div>
    `;

    if (window.Swal) {
      const { value } = await Swal.fire({
        title: 'Editar alimento',
        html,
        showCancelButton: true,
        confirmButtonText: 'Salvar',
        focusConfirm: false,
        preConfirm: async () => {
          const nome = document.getElementById('sw_nome').value.trim();
          if (!nome) throw new Error('Nome é obrigatório');
          const descricao = document.getElementById('sw_desc').value.trim() || null;
          let categoria = document.getElementById('sw_cat').value;
          const nova = document.getElementById('sw_cat_nova').value.trim();
          if (categoria === '__nova__') categoria = nova || null;
          const porcao = document.getElementById('sw_porcao').value ? Number(document.getElementById('sw_porcao').value) : null;
          const porcao_unidade = document.getElementById('sw_porcao_un').value.trim() || null;
          const fileInput = document.getElementById('sw_img');
          const arquivo = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

          let newUrl = item.imagem ?? null;
          let newPath = item.imagem_path ?? null;

          if (arquivo) {
            // upload do novo e remoção do antigo via imagem_path (se existir)
            const upl = await uploadImagem(arquivo);
            newUrl = upl.publicUrl;
            newPath = upl.path;
            if (item.imagem_path) await removerArquivoPorPath(item.imagem_path);
          }

          // recalcula nutrientes se o nome tiver mudado
          let nutrientes = {};
          if (nome && nome !== item.nome) {
            nutrientes = await calcularNutrientesOpenFoodFacts(nome, porcao, porcao_unidade);
          }

          const payload = {
            nome,
            descricao,
            categoria,
            porcao,
            porcao_unidade,
            imagem: newUrl,
            imagem_path: newPath,
            calorias: nutrientes.calorias ?? item.calorias ?? null,
            carboidratos: nutrientes.carboidratos ?? item.carboidratos ?? null,
            proteinas: nutrientes.proteinas ?? item.proteinas ?? null,
            gorduras: nutrientes.gorduras ?? item.gorduras ?? null,
            nutri_source: (nutrientes && nutrientes._meta && nutrientes._meta.source) ? nutrientes._meta.source : (item.nutri_source || 'manual')
          };

          const { error } = await supabase.from('alimentos').update(payload).eq('id', id);
          if (error) throw error;
          return true;
        }
      });

      if (value) {
        await carregarCategoriasParaSelect();
        await carregarAlimentos();
        Swal.fire({ icon: 'success', title: 'Atualizado' });
      }
    } else {
      alert('Inclua SweetAlert2 para usar o modal de edição (recomendado).');
    }
  } catch (err) {
    console.error(err);
    alert('Erro ao editar');
  }
}

/* ========== LOGOUT ========== */
btnLogout.addEventListener('click', () => {
  localStorage.removeItem('adminLogado');
  window.location.href = 'index.html';
});

/* ========== INIT ========== */
(async function init() {
  await carregarCategoriasParaSelect();
  await carregarAlimentos();
})();
