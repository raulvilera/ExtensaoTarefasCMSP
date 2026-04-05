// popup.js — CMSP Smart Collector V3.0
let sheetUrl = '';

// =============================================
// SELETOR DE COLUNAS
// =============================================

// Retorna quais colunas opcionais estão ativas
function getColunasAtivas() {
  const ativas = [];
  document.querySelectorAll('.tag.on').forEach(tag => {
    ativas.push(tag.dataset.col);
  });
  return ativas;
}

// Verifica se há pelo menos uma coluna opcional selecionada
function validarColunas() {
  const ativas = getColunasAtivas();
  const aviso = document.getElementById('noCols');
  if (ativas.length === 0) {
    aviso.style.display = 'block';
    return false;
  }
  aviso.style.display = 'none';
  return true;
}

// Toggle individual de tag
document.getElementById('columnList').addEventListener('click', e => {
  const tag = e.target.closest('.tag');
  if (!tag || tag.classList.contains('fixed')) return;
  tag.classList.toggle('on');
  tag.classList.toggle('off');
  validarColunas();
  salvarSelecaoColunas();
});

// Selecionar todas
document.getElementById('btnSelecionarTodas').addEventListener('click', () => {
  document.querySelectorAll('.tag:not(.fixed)').forEach(t => {
    t.classList.add('on');
    t.classList.remove('off');
  });
  document.getElementById('noCols').style.display = 'none';
  salvarSelecaoColunas();
});

// Desmarcar todas
document.getElementById('btnDesmarcarTodas').addEventListener('click', () => {
  document.querySelectorAll('.tag:not(.fixed)').forEach(t => {
    t.classList.remove('on');
    t.classList.add('off');
  });
  document.getElementById('noCols').style.display = 'block';
  salvarSelecaoColunas();
});

// Persiste seleção no storage
async function salvarSelecaoColunas() {
  const ativas = getColunasAtivas();
  await chrome.storage.local.set({ colunasAtivas: ativas });
}

// Restaura seleção salva
async function restaurarSelecaoColunas() {
  const saved = await chrome.storage.local.get('colunasAtivas');
  if (!saved.colunasAtivas) return; // usa padrão (tudo on)
  const salvas = new Set(saved.colunasAtivas);
  document.querySelectorAll('.tag:not(.fixed)').forEach(tag => {
    if (salvas.has(tag.dataset.col)) {
      tag.classList.add('on');
      tag.classList.remove('off');
    } else {
      tag.classList.remove('on');
      tag.classList.add('off');
    }
  });
}

// =============================================
// LOG
// =============================================
function log(mensagem, tipo = 'info') {
  const box = document.getElementById('logBox');
  const agora = new Date().toLocaleTimeString('pt-BR');
  const icon = tipo === 'ok' ? '✓' : tipo === 'erro' ? '✗' : tipo === 'warn' ? '⚠' : 'ℹ';
  const classe = tipo === 'ok' ? 'log-ok' : tipo === 'erro' ? 'log-err' : tipo === 'warn' ? 'log-warn' : 'log-msg';
  const linha = document.createElement('div');
  linha.className = 'log-line';
  linha.innerHTML = `<span class="log-time">${agora}</span><span class="${classe}">${icon} ${mensagem}</span>`;
  box.appendChild(linha);
  box.scrollTop = box.scrollHeight;
}

// =============================================
// STATUS BAR
// =============================================
function setStatus(texto, tipo = 'ok') {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  dot.className = 'status-dot';
  dot.classList.add(tipo === 'ok' ? 'dot-ok' : tipo === 'warn' ? 'dot-warn' : 'dot-erro');
  txt.textContent = texto;
}

// =============================================
// PROGRESS
// =============================================
function setProgress(pct, label) {
  document.getElementById('progressWrap').style.display = 'block';
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressPct').textContent = pct + '%';
  if (label) document.getElementById('progressLabel').textContent = label;
}
function hideProgress() {
  document.getElementById('progressWrap').style.display = 'none';
}

// =============================================
// RESULTADO
// =============================================
function mostrarResultado(total, novos, atualizados, url, erro = null) {
  const card = document.getElementById('resultCard');
  card.style.display = 'block';

  if (erro) {
    card.style.background = 'rgba(239,68,68,0.1)';
    card.style.borderColor = 'rgba(239,68,68,0.25)';
    document.querySelector('.result-title').textContent = '⚠️ Falha na Operação';
    document.querySelector('.result-title').style.color = '#f87171';
    document.getElementById('resultTotal').textContent = '!';
    document.getElementById('resultNovos').textContent = '—';
    document.getElementById('resultAtualizados').textContent = '—';
    document.getElementById('btnAbrirSheets').style.display = 'none';
  } else {
    card.style.background = 'rgba(16,185,129,0.1)';
    card.style.borderColor = 'rgba(16,185,129,0.25)';
    document.querySelector('.result-title').textContent = '✨ Sincronização Concluída!';
    document.querySelector('.result-title').style.color = '#10b981';
    document.getElementById('resultTotal').textContent = total;
    document.getElementById('resultNovos').textContent = novos;
    document.getElementById('resultAtualizados').textContent = atualizados;
    document.getElementById('btnAbrirSheets').style.display = 'flex';
    sheetUrl = url;
  }
}

// =============================================
// BOTÃO PRINCIPAL
// =============================================
document.getElementById('btnColetar').addEventListener('click', async () => {
  // Valida colunas antes de qualquer coisa
  if (!validarColunas()) {
    log('Selecione ao menos uma coluna para exportar.', 'warn');
    return;
  }

  const btn = document.getElementById('btnColetar');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> PROCESSANDO...';
  document.getElementById('resultCard').style.display = 'none';

  setStatus('Iniciando protocolos...', 'warn');
  log('Iniciando extração de dados inteligente...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.url.includes('cmsp.ip.tv')) {
      throw new Error('Página do CMSP não detectada na aba ativa.');
    }

    const isLote = tab.url.includes('/tms/task') && !tab.url.includes('detail');
    const nomeColeta = document.getElementById('nomeColeta').value.trim()
      || `Coleta ${new Date().toLocaleString('pt-BR')}`;

    // Colunas fixas (sempre incluídas) + colunas opcionais selecionadas
    const colunasFixas = ['Id', 'Aluno', 'Turma'];
    const colunasOpcionais = getColunasAtivas();
    const todasColunas = [...colunasFixas, ...colunasOpcionais];

    log(`Colunas selecionadas: ${todasColunas.join(', ')}`);
    setProgress(20, 'Escaneando tabela...');

    let spreadsheetId = document.getElementById('sheetId').value.trim();
    if (document.getElementById('optNovaPlanilha').checked) spreadsheetId = '';
    if (!spreadsheetId) {
      const saved = await chrome.storage.local.get('spreadsheetId');
      if (saved.spreadsheetId && !document.getElementById('optNovaPlanilha').checked) {
        spreadsheetId = saved.spreadsheetId;
        log('Utilizando planilha existente...', 'info');
      } else {
        log('Criando nova planilha no Google Drive...', 'info');
      }
    }

    let resultado;
    try {
      resultado = await chrome.tabs.sendMessage(tab.id, {
        acao: isLote ? 'iniciarColetaLote' : 'coletar',
        colunasSelecionadas: todasColunas
      });
    } catch (e) {
      log('Reinjetando scripts de coleta...', 'warn');
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await new Promise(r => setTimeout(r, 900));
      resultado = await chrome.tabs.sendMessage(tab.id, {
        acao: isLote ? 'iniciarColetaLote' : 'coletar',
        colunasSelecionadas: todasColunas
      });
    }

    if (!resultado || !resultado.sucesso) {
      throw new Error(resultado?.erro || 'O coletor não retornou dados válidos.');
    }

    if (isLote) {
      log(resultado.mensagem, 'warn');
      log('NÃO FECHE O NAVEGADOR! Acompanhe pelas novas abas que estão sendo abertas.', 'warn');
      // Passar a planilha para o motor de fundo
      chrome.runtime.sendMessage({
         acao: 'configurarExportacaoLote',
         spreadsheetId: spreadsheetId,
         nomeColeta: nomeColeta,
         colunasOpcionais: colunasOpcionais,
         opcoes: {
           formatar: document.getElementById('optFormatar').checked,
           historico: document.getElementById('optHistorico').checked
         }
      });
      // Restaurar o botão original pq o background assumiu a tarefa
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      return; 
    }

    log(`${resultado.total} registros únicos identificados.`, 'ok');
    // Salva dados coletados para uso posterior no lançamento dos 30%
    await chrome.storage.local.set({ ultimosDados: resultado.dados });
    setProgress(50, 'Preparando Google Sheets...');

    setProgress(75, 'Sincronizando registros...');
    log('Enviando dados para o Google Sheets...');

    const exportResult = await chrome.runtime.sendMessage({
      acao: 'exportarSheets',
      dados: resultado.dados,
      spreadsheetId: spreadsheetId,
      nomeColeta: nomeColeta,
      colunasAtividade: colunasOpcionais
    });

    if (!exportResult || !exportResult.sucesso) {
      throw new Error(exportResult?.erro || 'Erro na comunicação com a API do Google.');
    }

    log(`Sync finalizado: ${exportResult.totalAtualizados} atualizados / ${exportResult.totalNovos} novos.`, 'ok');
    if (document.getElementById('optFormatar').checked) log('Layout da planilha otimizado.', 'ok');
    if (document.getElementById('optHistorico').checked) log('Histórico registrado.', 'ok');

    setProgress(100, 'Tudo pronto!');
    setStatus('Sincronização concluída ✓', 'ok');
    await chrome.storage.local.set({ ultimaColeta: nomeColeta });

    setTimeout(() => {
      hideProgress();
      mostrarResultado(resultado.total, exportResult.totalNovos, exportResult.totalAtualizados, exportResult.url);
      document.getElementById('footerInfo').textContent = `Sync: ${new Date().toLocaleTimeString('pt-BR')}`;
      log(`🎉 "${nomeColeta}" concluída com sucesso!`, 'ok');
    }, 700);

  } catch (err) {
    log(err.message, 'erro');
    setStatus('Erro operacional', 'erro');
    hideProgress();
    mostrarResultado(0, 0, 0, '', err.message);
  } finally {
    // Only reset button if it wasn't a batch operation that returned early
    if (btn.disabled) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
});

// =============================================
// LANÇAR 30% — SALA DO FUTURO
// =============================================

// Slider de percentual
document.getElementById('sliderPercentual').addEventListener('input', e => {
  document.getElementById('labelPercentual').textContent = e.target.value + '%';
});

document.getElementById('btnLancar30').addEventListener('click', async () => {
  const btn = document.getElementById('btnLancar30');
  const resultDiv = document.getElementById('resultLancar');
  const originalHtml = btn.innerHTML;

  // Precisa ter dados coletados na memória
  const saved = await chrome.storage.local.get('ultimosDados');
  if (!saved.ultimosDados || saved.ultimosDados.length === 0) {
    log('⚠ Faça uma coleta do CMSP antes de lançar.', 'warn');
    resultDiv.style.display = 'block';
    resultDiv.style.color = '#f59e0b';
    resultDiv.innerHTML = '⚠ Nenhum dado coletado ainda. Colete as notas do CMSP primeiro.';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> CALCULANDO E LANÇANDO...';
  resultDiv.style.display = 'none';
  setStatus('Lançando notas na Sala do Futuro...', 'warn');
  log('Calculando médias e lançando 30% na Sala do Futuro...');

  const percentual = parseInt(document.getElementById('sliderPercentual').value) / 100;

  try {
    const resultado = await chrome.runtime.sendMessage({
      acao: 'calcularELancar',
      dados: saved.ultimosDados,
      percentual
    });

    if (!resultado || !resultado.sucesso) {
      throw new Error(resultado?.erro || 'Erro ao lançar notas.');
    }

    const linhasLog = (resultado.log || []).join('\n');
    resultDiv.style.display = 'block';
    resultDiv.style.color = '#6ee7b7';
    resultDiv.innerHTML =
      `✅ <strong>${resultado.lancados}</strong> alunos lançados | ` +
      `⚠ <strong>${resultado.naoEncontrados}</strong> não encontrados\n\n` +
      linhasLog;

    setStatus(`${resultado.lancados} notas lançadas ✓`, 'ok');
    log(`✓ ${resultado.lancados} notas lançadas na Sala do Futuro (${Math.round(percentual * 100)}%).`, 'ok');
    if (resultado.naoEncontrados > 0) {
      log(`⚠ ${resultado.naoEncontrados} alunos não encontrados na tabela.`, 'warn');
    }

  } catch (err) {
    resultDiv.style.display = 'block';
    resultDiv.style.color = '#f87171';
    resultDiv.innerHTML = '✗ ' + err.message;
    log(err.message, 'erro');
    setStatus('Erro ao lançar', 'erro');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
});

// =============================================
// HELPERS
// =============================================
document.getElementById('btnTestar').addEventListener('click', async () => {
  const id = document.getElementById('sheetId').value.trim();
  if (!id) { log('Insira um ID de planilha válido.', 'warn'); return; }
  await chrome.storage.local.set({ spreadsheetId: id });
  log(`ID ...${id.slice(-8)} salvo como padrão.`, 'ok');
});

document.getElementById('btnAbrirSheets').addEventListener('click', () => {
  if (sheetUrl) chrome.tabs.create({ url: sheetUrl });
  else chrome.storage.local.get('spreadsheetUrl', d => { if (d.spreadsheetUrl) chrome.tabs.create({ url: d.spreadsheetUrl }); });
});

document.getElementById('btnLimpar').addEventListener('click', () => {
  document.getElementById('logBox').innerHTML =
    '<div class="log-line"><span class="log-time">--:--:--</span><span class="log-msg">Console reiniciado.</span></div>';
});

// =============================================
// INICIALIZAÇÃO
// =============================================
(async () => {
  await restaurarSelecaoColunas();

  const saved = await chrome.storage.local.get(['spreadsheetId', 'ultimaColeta']);
  if (saved.spreadsheetId) {
    document.getElementById('sheetId').value = saved.spreadsheetId;
    log(`Planilha salva: ...${saved.spreadsheetId.slice(-8)}`, 'ok');
  }

  const hoje = new Date().toLocaleDateString('pt-BR');
  document.getElementById('nomeColeta').placeholder = `Ex: Atividade de ${hoje}`;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && tab.url.includes('cmsp.ip.tv')) {
    setStatus('Ambiente CMSP detectado', 'ok');
    if (tab.url.includes('/tms/task') && !tab.url.includes('detail')) {
      const btn = document.getElementById('btnColetar');
      btn.innerHTML = '<span>💎</span> COLETA EM LOTE';
      btn.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
      log('Modo PILOTO AUTOMÁTICO ativado (Listagem).', 'warn');
    } else {
      log('Pronto para iniciar extração individual.', 'ok');
    }
  } else {
    setStatus('Aguardando página CMSP', 'warn');
    log('Abra cmsp.ip.tv/tms/task para começar.', 'warn');
  }

  // --- INICIALIZAÇÃO GITHUB ---
  await inicializarGitHub();
})();

// =============================================
// GITHUB CONNECTIVITY LOGIC
// =============================================

async function inicializarGitHub() {
  const saved = await chrome.storage.local.get(['githubToken']);
  if (saved.githubToken) {
    document.getElementById('githubToken').value = saved.githubToken;
    document.getElementById('githubBadge').textContent = 'Conectado ✓';
    document.getElementById('githubBadge').className = 'tag on';
  }

  // Auto-check version
  checkRemoteVersion();
}

async function checkRemoteVersion() {
  const badge = document.getElementById('githubBadge');
  const remoteEl = document.getElementById('remoteVersion');
  
  badge.textContent = 'Verificando...';
  badge.className = 'tag on';
  badge.style.background = 'rgba(245,158,11,0.1)';

  chrome.runtime.sendMessage({ acao: 'verificarVersao' }, (res) => {
    if (chrome.runtime.lastError) {
      console.warn('Verificação de versão suspensa:', chrome.runtime.lastError.message);
      badge.textContent = 'Indisponível';
      badge.className = 'tag off';
      return;
    }
    if (!res) {
      badge.textContent = 'Erro API';
      badge.className = 'tag off';
      return;
    }

    remoteEl.textContent = 'V' + res.remote;
    if (res.updateAvailable) {
      badge.textContent = 'Atualização Disponível! 🚀';
      badge.className = 'tag on';
      badge.style.background = 'rgba(239,68,68,0.2)';
      badge.style.color = '#f87171';
      log(`Nova versão disponível no GitHub: V${res.remote}`, 'warn');
    } else {
      badge.textContent = 'Versão Atualizada ✓';
      badge.className = 'tag on';
      badge.style.background = 'rgba(16,185,129,0.1)';
      badge.style.color = '#6ee7b7';
    }
  });
}

document.getElementById('btnCheckUpdate').addEventListener('click', checkRemoteVersion);

document.getElementById('btnOpenRepo').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://github.com/raulvilera/ExtensaoTarefasCMSP' });
});

document.getElementById('toggleBackup').addEventListener('click', () => {
  const controls = document.getElementById('backupControls');
  const isHidden = controls.style.display === 'none';
  controls.style.display = isHidden ? 'block' : 'none';
  document.getElementById('toggleBackup').textContent = isHidden ? 'Recolher Configurações ↑' : 'Configurar Backup Remoto ↓';
});

document.getElementById('btnSaveToken').addEventListener('click', async () => {
  const token = document.getElementById('githubToken').value.trim();
  if (!token) {
    log('Token vazio removido.', 'info');
    await chrome.storage.local.remove('githubToken');
    document.getElementById('githubBadge').textContent = 'Desconectado';
    document.getElementById('githubBadge').className = 'tag off';
    return;
  }
  await chrome.storage.local.set({ githubToken: token });
  log('Token do GitHub salvo com sucesso.', 'ok');
  document.getElementById('githubBadge').textContent = 'Conectado ✓';
  document.getElementById('githubBadge').className = 'tag on';
});

document.getElementById('btnBackupNow').addEventListener('click', async () => {
  const saved = await chrome.storage.local.get(['ultimosDados', 'githubToken']);
  if (!saved.githubToken) {
    log('Configure o Token do GitHub antes de fazer backup.', 'erro');
    return;
  }
  if (!saved.ultimosDados || saved.ultimosDados.length === 0) {
    log('Faça uma coleta antes de realizar o backup.', 'warn');
    return;
  }

  const btn = document.getElementById('btnBackupNow');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'ENVIANDO... ⏳';

  chrome.runtime.sendMessage({ 
    acao: 'backupGitHub', 
    dados: saved.ultimosDados, 
    token: saved.githubToken 
  }, (res) => {
    if (chrome.runtime.lastError) {
      btn.disabled = false;
      btn.textContent = originalText;
      log('Erro no backup: ' + chrome.runtime.lastError.message, 'erro');
      return;
    }
    btn.disabled = false;
    btn.textContent = originalText;
    if (res && res.sucesso) {
      log('Backup enviado com sucesso para o GitHub!', 'ok');
      const url = res.data.content.html_url;
      log(`Arquivo: ${res.data.content.name}`, 'info');
    } else {
      log('Erro no backup GitHub: ' + (res?.erro || 'Desconhecido'), 'erro');
    }
  });
});
