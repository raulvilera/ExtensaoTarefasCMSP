// content.js — CMSP Smart Collector V3.0
// Coleta apenas as colunas selecionadas pelo usuário no popup

function waitForTable(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const rows = document.querySelectorAll('table tbody tr');
      if (rows.length > 0) resolve(rows);
      else if (Date.now() - start > timeout) reject(new Error('Tabela não encontrada após ' + timeout + 'ms'));
      else setTimeout(check, 500);
    };
    check();
  });
}

function getHeaders() {
  const ths = document.querySelectorAll('table thead th');
  if (ths.length > 0) return Array.from(ths).map(th => th.innerText.trim() || 'Coluna');
  const firstRow = document.querySelectorAll('table tbody tr:first-child td');
  return Array.from(firstRow).map((_, i) => `Coluna ${i + 1}`);
}

// Normaliza o nome do cabeçalho detectado na tabela para o nome canônico que o popup usa
function normalizarHeader(h) {
  const lower = h.toLowerCase().trim();
  
  // Identificadores únicos (ID) - CMSP usa várias formas
  if (lower === 'id' || lower === 'nº' || lower === 'no.' || lower === '#' || lower === 'ra' || lower === 'código' || lower === 'matricula' || lower === 'matrícula') {
    return 'Id';
  }
  
  if (lower.includes('aluno') || lower.includes('estudante') || lower.includes('nome')) return 'Aluno';
  if (lower.includes('turma') || lower.includes('série') || lower.includes('classe'))   return 'Turma';
  if (lower.includes('entregue') || lower.includes('concluído'))            return 'Entregue em';
  if (lower.includes('duração') || lower.includes('tempo'))                 return 'Duração';
  if (lower.includes('status') || lower.includes('situação'))               return 'Status';
  if (lower.includes('nota') || lower.includes('pontos') || lower.includes('score'))    return 'Nota';
  if (lower.includes('título') || lower.includes('title'))                  return 'Título';
  if (lower.includes('localizador'))                                         return 'Localizador';
  if (lower.includes('publicação') || lower.includes('publicado em'))       return 'Publicação';
  if (lower.includes('modelo'))                                              return 'Modelo';
  if (lower.includes('expira') || lower.includes('vencimento'))             return 'Expiração';
  if (lower.includes('publicado por') || lower.includes('publisher'))       return 'Publicado por';
  if (lower.includes('autor') || lower.includes('author'))                  return 'Autor';
  if (lower.includes('rótulo') || lower.includes('label') || lower.includes('tag'))     return 'Rótulo';
  return h; // mantém o nome original se não reconhecer
}

// Lê as linhas filtrando apenas as colunas desejadas
function readTableRows(colunasSelecionadas) {
  const headers = getHeaders();
  const mapeado = headers.map(normalizarHeader);
  const filtro = new Set(colunasSelecionadas);

  console.log('[CMSP] Headers detectados:', headers);
  console.log('[CMSP] Headers normalizados:', mapeado);
  console.log('[CMSP] Filtro de colunas:', [...filtro]);

  const rows = [];
  document.querySelectorAll('table tbody tr').forEach((tr, rowIndex) => {
    const cells = tr.querySelectorAll('td');
    if (cells.length === 0) return;

    const row = {};
    mapeado.forEach((nomeCanônico, i) => {
      if (filtro.has(nomeCanônico) && cells[i]) {
        row[nomeCanônico] = cells[i].innerText.trim().replace(/\n+/g, ' ');
      }
    });

    // SISTEMA DE FALLBACK PARA ID:
    // Se não encontrou coluna explícita de "Id", tenta usar cabeçalhos de identidade
    if (!row['Id']) {
      // Tenta achar na célula original que deveria ser ID (geralmente a 1ª)
      const possibleId = cells[0]?.innerText.trim();
      if (possibleId && !isNaN(parseInt(possibleId))) {
        row['Id'] = possibleId;
      } else if (row['Aluno']) {
        // Fallback final: cria um ID composto (Evita ignorar a linha)
        row['Id'] = 'F_' + row['Aluno'].substring(0,10) + '_' + (row['Turma'] || rowIndex);
      }
    }

    // Só inclui se tiver alguma identidade (ID ou Aluno)
    if (row['Id'] || row['Aluno']) rows.push(row);
  });

  return rows;
}

async function goToNextPage() {
  // Tenta aria-label padrão MUI/React
  const paginationNexts = document.querySelectorAll(
    '[aria-label="Go to next page"], [title="Próxima página"], [title="Next page"]'
  );
  if (paginationNexts.length > 0 && !paginationNexts[0].disabled) {
    paginationNexts[0].click();
    await new Promise(r => setTimeout(r, 1500));
    return true;
  }

  // Fallback: botão com texto › ou >
  const buttons = document.querySelectorAll('button');
  let nextBtn = null;
  buttons.forEach(btn => {
    const text = btn.innerText.trim();
    const aria = btn.getAttribute('aria-label') || '';
    if (text === '›' || text === '>' || aria.includes('próxima') || aria.includes('next')) {
      nextBtn = btn;
    }
  });

  if (nextBtn && !nextBtn.disabled) {
    nextBtn.click();
    await new Promise(r => setTimeout(r, 1500));
    return true;
  }
  return false;
}

async function coletarTodosOsDados(colunasSelecionadas) {
  const mapaUnico = new Map();
  let pagina = 1;

  try {
    await waitForTable();

    while (true) {
      console.log(`[CMSP] Lendo página ${pagina}...`);
      const rows = readTableRows(colunasSelecionadas);
      rows.forEach(r => {
        const chave = String(r['Aluno'] || r['Id'] || '').trim().toUpperCase();
        if (chave) mapaUnico.set(chave, r);
      });

      const temProxima = await goToNextPage();
      if (!temProxima) break;
      pagina++;
      if (pagina > 100) break;
    }

    const dadosFinais = Array.from(mapaUnico.values());
    console.log(`[CMSP] Total único coletado: ${dadosFinais.length} registros`);
    return { sucesso: true, dados: dadosFinais, total: dadosFinais.length };

  } catch (err) {
    console.error('[CMSP] Erro:', err);
    return { sucesso: false, erro: err.message, dados: [] };
  }
}

// =============================================
// SALA DO FUTURO — Lançador de Notas (30%)
// Página: saladofuroprofessor.educacao.sp.gov.br/diario-classe__avaliacao__lancamentoDetalhes
// =============================================

// Normaliza nome para comparação: remove espaços extras, caixa alta
function normalizarNome(nome) {
  return String(nome || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

// Aguarda um elemento aparecer no DOM
function waitForElement(selector, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el) resolve(el);
      else if (Date.now() - start > timeout) reject(new Error('Elemento não encontrado: ' + selector));
      else setTimeout(check, 300);
    };
    check();
  });
}

// Define o valor de um input numérico com setas ↑↓ (spinner)
// Dispara eventos nativos para que o React/Angular da Sala do Futuro reconheça a mudança
function setSpinnerValue(input, valor) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeInputValueSetter.call(input, String(valor));
  input.dispatchEvent(new Event('input',  { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur',   { bubbles: true }));
}

// Lança as notas na tabela da Sala do Futuro
// notas = { 'NOME COMPLETO DO ALUNO': 7.5, ... }
async function lancarNotasSalaFuturo(notas) {
  const log = [];
  let lancados = 0, naoEncontrados = 0;

  try {
    // Aguarda tabela carregar
    await waitForElement('table tbody tr');
  } catch (e) {
    return { sucesso: false, erro: 'Tabela de alunos não encontrada. Abra a página de lançamento de notas da Sala do Futuro.', log };
  }

  const linhas = document.querySelectorAll('table tbody tr');

  for (const tr of linhas) {
    // Coluna Nome (3ª coluna: Nº, Situação, Nome, Nota)
    const tdNome = tr.querySelector('td:nth-child(3)');
    const tdNota = tr.querySelector('td:nth-child(4)');
    if (!tdNome || !tdNota) continue;

    const nomeAluno = normalizarNome(tdNome.innerText);
    if (!nomeAluno) continue;

    // Procura a nota correspondente (por nome normalizado)
    const notaValor = notas[nomeAluno];
    if (notaValor === undefined) {
      log.push(`⚠ Sem nota CMSP: ${nomeAluno}`);
      naoEncontrados++;
      continue;
    }

    // Clica no campo S/N para ativar o spinner
    const inputSpinner = tdNota.querySelector('input[type="number"], input[type="text"], input');
    if (inputSpinner) {
      inputSpinner.click();
      await new Promise(r => setTimeout(r, 150));
      setSpinnerValue(inputSpinner, notaValor);
      await new Promise(r => setTimeout(r, 100));
      log.push(`✓ ${nomeAluno}: ${notaValor}`);
      lancados++;
    } else {
      // Se ainda não é um input (campo S/N clicável), clica para transformar
      const celula = tdNota.querySelector('[class*="nota"], [class*="score"], span, div');
      if (celula) {
        celula.click();
        await new Promise(r => setTimeout(r, 400));
        const inputDepoisClick = tdNota.querySelector('input');
        if (inputDepoisClick) {
          setSpinnerValue(inputDepoisClick, notaValor);
          await new Promise(r => setTimeout(r, 100));
          log.push(`✓ ${nomeAluno}: ${notaValor}`);
          lancados++;
        } else {
          log.push(`✗ Campo não editável: ${nomeAluno}`);
          naoEncontrados++;
        }
      } else {
        log.push(`✗ Sem campo de nota: ${nomeAluno}`);
        naoEncontrados++;
      }
    }
  }

  // Tenta salvar automaticamente após preencher todos
  await new Promise(r => setTimeout(r, 500));
  const btnSalvar = Array.from(document.querySelectorAll('button')).find(b =>
    b.innerText.toLowerCase().includes('salvar') ||
    b.innerText.toLowerCase().includes('confirmar') ||
    b.innerText.toLowerCase().includes('gravar')
  );
  if (btnSalvar && !btnSalvar.disabled) {
    btnSalvar.click();
    log.push('💾 Botão Salvar acionado automaticamente.');
  }

  return { sucesso: true, lancados, naoEncontrados, log };
}

// =============================================
// LISTENER UNIFICADO
// =============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.acao === 'coletar') {
    const colunas = request.colunasSelecionadas || [
      'Id','Aluno','Turma','Entregue em','Duração','Status','Nota',
      'Título','Localizador','Publicação','Modelo','Expiração',
      'Publicado por','Autor','Rótulo'
    ];
    coletarTodosOsDados(colunas)
      .then(resultado => sendResponse(resultado))
      .catch(err => sendResponse({ sucesso: false, erro: err.message, dados: [] }));
    return true;
  }

  if (request.acao === 'lancarNotas') {
    lancarNotasSalaFuturo(request.notas)
      .then(resultado => sendResponse(resultado))
      .catch(err => sendResponse({ sucesso: false, erro: err.message, lancados: 0, naoEncontrados: 0, log: [] }));
    return true;
  }

  // Mensagem não reconhecida — responde imediatamente para não deixar a porta pendurada
  sendResponse({ sucesso: false, erro: 'Ação desconhecida: ' + request.acao });
  return false;
});
