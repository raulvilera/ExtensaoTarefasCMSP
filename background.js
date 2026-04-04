// background.js — Service Worker V3.0
// Lógica de Diário de Classe: cada coleta adiciona colunas, alunos não se duplicam

const GITHUB_OWNER = 'raulvilera';
const GITHUB_REPO  = 'ExtensaoTarefasCMSP';
const GITHUB_RAW   = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main`;

// =============================================
// AUTENTICAÇÃO GOOGLE OAuth2
// =============================================
async function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(token);
    });
  });
}

// =============================================
// GERENCIAMENTO DE ABAS
// =============================================

// Retorna o ID numérico da aba pelo nome
async function getAbaInfo(token, spreadsheetId, nomeAba) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title,sheetId))`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) return null;
  const data = await response.json();
  const nomeNormalizado = String(nomeAba || '').trim().toUpperCase();
  const sheet = data.sheets.find(s => String(s.properties.title || '').trim().toUpperCase() === nomeNormalizado);
  return sheet ? sheet.properties : null;
}

// Garante que uma aba existe, cria se necessário
async function garantirAba(token, spreadsheetId, nomeAba) {
  const info = await getAbaInfo(token, spreadsheetId, nomeAba);
  if (info) return info.sheetId;

  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: String(nomeAba || "").trim() } } }]
    })
  });

  if (!response.ok) throw new Error(`Erro ao criar aba "${nomeAba}": ` + response.status);
  const data = await response.json();
  return data.replies[0].addSheet.properties.sheetId;
}

// =============================================
// UTILITÁRIOS
// =============================================

// Converte índice numérico para letra de coluna (0→A, 25→Z, 26→AA...)
function indexParaLetra(index) {
  let letra = '';
  let i = index;
  while (i >= 0) {
    letra = String.fromCharCode((i % 26) + 65) + letra;
    i = Math.floor(i / 26) - 1;
  }
  return letra;
}

// Lê todos os dados de uma aba
async function getPlanilhaCompleta(token, spreadsheetId, aba) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(aba)}!A:ZZ`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!response.ok) return [];
  const data = await response.json();
  return data.values || [];
}

// Conta linhas preenchidas na coluna A em uma aba específica
async function getUltimaLinha(token, spreadsheetId, aba = 'Atividades') {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(aba)}!A:A`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!response.ok) return 0;
  const data = await response.json();
  return data.values ? data.values.length : 0;
}

// Lógica de Diário de Classe: cada coleta adiciona colunas
async function escreverNoDiario(token, spreadsheetId, dados, nomeColeta, colunasAtividade, nomeAba = 'Atividades') {
  if (!dados || dados.length === 0) return { totalNovos: 0, totalAtualizados: 0 };

  // Campos fixos de identidade (colunas permanentes à esquerda)
  const CAMPO_ID     = 'Id';
  const CAMPO_ALUNO  = 'Aluno';
  const CAMPO_TURMA  = 'Turma';
  // Campos de atividade que se repetem a cada coleta (novas colunas)
  // Usa as colunas selecionadas pelo usuário no popup, excluindo as fixas de identidade
  const FIXAS = new Set([CAMPO_ID, CAMPO_ALUNO, CAMPO_TURMA]);
  const CAMPOS_ATIVIDADE = (colunasAtividade && colunasAtividade.length > 0)
    ? colunasAtividade.filter(c => !FIXAS.has(c))
    : ['Entregue em', 'Duração', 'Status', 'Nota'];

  // --- 1. Lê o estado atual da planilha ---
  const valoresAtuais = await getPlanilhaCompleta(token, spreadsheetId, nomeAba);
  const planilhaVazia = valoresAtuais.length === 0;

  if (planilhaVazia) {
    // === PRIMEIRA COLETA: cria estrutura completa ===
    const header = [CAMPO_ID, CAMPO_ALUNO, CAMPO_TURMA,
      ...CAMPOS_ATIVIDADE.map(c => `${nomeColeta} · ${c}`)];

    const linhas = dados.map(d => [
      d[CAMPO_ID] || '',
      d[CAMPO_ALUNO] || '',
      d[CAMPO_TURMA] || '',
      ...CAMPOS_ATIVIDADE.map(c => d[c] || '')
    ]);

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(nomeAba)}!A1?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [header, ...linhas] })
      }
    );

    return { totalNovos: linhas.length, totalAtualizados: 0, colunaNova: 'D' };
  }

  // === COLETAS SUBSEQUENTES: adiciona colunas novas, atualiza/insere alunos ===
  const header = valoresAtuais[0] || [];

  // Índices das colunas fixas (busca por nome exato)
  let colId    = header.findIndex(h => h === CAMPO_ID);
  let colAluno = header.findIndex(h => h === CAMPO_ALUNO);
  let colTurma = header.findIndex(h => h === CAMPO_TURMA);
  // Fallback para planilhas sem cabeçalho padrão
  if (colId    === -1) colId    = 0;
  if (colAluno === -1) colAluno = 1;
  if (colTurma === -1) colTurma = 2;

  // Nova coluna de atividade começa logo após a última coluna existente
  const novaColBaseIndex = header.length;
  const letraNovaColBase = indexParaLetra(novaColBaseIndex);

  // --- 2. Escreve os novos cabeçalhos de atividade na linha 1 ---
  const novosHeaders = CAMPOS_ATIVIDADE.map(c => `${nomeColeta} · ${c}`);
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(nomeAba)}!${letraNovaColBase}1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [novosHeaders] })
    }
  );

  // --- 3. Mapeia Alunos existentes na planilha para evitar duplicados ---
  const mapaAlunosExistentes = new Map();
  const normalizarNome = (n) => String(n || '').trim().normalize('NFC').toUpperCase();

  for (let i = 1; i < valoresAtuais.length; i++) {
    const nomeOriginal = valoresAtuais[i][colAluno];
    if (nomeOriginal) {
      mapaAlunosExistentes.set(normalizarNome(nomeOriginal), i + 1);
    }
  }

  // --- 4. Pré-consolida os DADOS recebidos (caso o mesmo aluno venha 2x no mesmo lote) ---
  const dadosConsolidados = new Map();
  dados.forEach(d => {
    const nome = normalizarNome(d[CAMPO_ALUNO]);
    if (!nome) return;

    if (!dadosConsolidados.has(nome)) {
      dadosConsolidados.set(nome, { ...d });
    } else {
      // Mescla dados de atividade se o aluno já estiver no lote (preserva valores preenchidos)
      const existente = dadosConsolidados.get(nome);
      CAMPOS_ATIVIDADE.forEach(c => {
        if (d[c] && !existente[c]) existente[c] = d[c];
      });
      if (d[CAMPO_ID] && !existente[CAMPO_ID]) existente[CAMPO_ID] = d[CAMPO_ID];
      if (d[CAMPO_TURMA] && !existente[CAMPO_TURMA]) existente[CAMPO_TURMA] = d[CAMPO_TURMA];
    }
  });

  const updates = [];     // batchUpdate para alunos que já estão na planilha
  const novasLinhas = [];   // append para alunos novos

  dadosConsolidados.forEach((d, nomeNorm) => {
    const id = d[CAMPO_ID] || '';
    const valoresAtividade = CAMPOS_ATIVIDADE.map(c => d[c] || '');

    if (mapaAlunosExistentes.has(nomeNorm)) {
      // Aluno já existe → atualiza a linha correspondente nas NOVAS colunas
      const linhaNum = mapaAlunosExistentes.get(nomeNorm);
      updates.push({
        range: `${nomeAba}!${letraNovaColBase}${linhaNum}:${indexParaLetra(novaColBaseIndex + CAMPOS_ATIVIDADE.length - 1)}${linhaNum}`,
        values: [valoresAtividade]
      });
    } else {
      // Aluno novo → cria linha completa (fixas + anteriores vazias + atividades novas)
      const novaLinha = new Array(novaColBaseIndex + CAMPOS_ATIVIDADE.length).fill('');
      novaLinha[colId]    = id;
      novaLinha[colAluno] = d[CAMPO_ALUNO] || '';
      novaLinha[colTurma] = d[CAMPO_TURMA] || '';
      
      CAMPOS_ATIVIDADE.forEach((c, i) => {
        novaLinha[novaColBaseIndex + i] = d[c] || '';
      });
      novasLinhas.push(novaLinha);
      
      // Marca como já processado neste lote para evitar duplicidade acidental
      mapaAlunosExistentes.set(nomeNorm, -99);
    }
  });

  // --- 4. Envia atualizações em lote ---
  if (updates.length > 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: updates, valueInputOption: 'USER_ENTERED' })
      }
    );
  }

  // --- 5. Adiciona alunos novos no final ---
  if (novasLinhas.length > 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(nomeAba)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: novasLinhas })
      }
    );
  }

  return {
    totalAtualizados: updates.filter(u => !u.range.includes(indexParaLetra(colTurma))).length,
    totalNovos: novasLinhas.length,
    colunaNova: letraNovaColBase
  };
}

// =============================================
// FORMATAR PLANILHA
// =============================================
async function formatarPlanilha(token, spreadsheetId, nomeAba = 'Atividades') {
  const info = await getAbaInfo(token, spreadsheetId, nomeAba);
  if (!info) return;
  const sheetId = info.sheetId;

  const totalLinhas = await getUltimaLinha(token, spreadsheetId, nomeAba);
  const endRow = Math.max(totalLinhas + 1, 2);

  // Pega número atual de colunas pelo header
  const valoresAtuais = await getPlanilhaCompleta(token, spreadsheetId, nomeAba);
  const numColunas = valoresAtuais.length > 0 ? valoresAtuais[0].length : 10;

  const requests = [
    // Cabeçalho escuro estilo dark
    {
      repeatCell: {
        range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numColunas },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.06, green: 0.09, blue: 0.16 },
            textFormat: { foregroundColor: { red: 0.97, green: 0.98, blue: 1.0 }, bold: true, fontSize: 11 },
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    },
    // Colunas fixas (Id, Aluno, Turma) em azul índigo suave
    {
      repeatCell: {
        range: { sheetId: sheetId, startRowIndex: 1, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: 3 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.94, green: 0.95, blue: 1.0 }
          }
        },
        fields: 'userEnteredFormat.backgroundColor'
      }
    },
    // Zebra nas colunas de atividade
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: sheetId, startRowIndex: 1, endRowIndex: endRow, startColumnIndex: 3, endColumnIndex: numColunas }],
          booleanRule: {
            condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=MOD(ROW(),2)=0' }] },
            format: { backgroundColor: { red: 0.97, green: 0.97, blue: 1.0 } }
          }
        },
        index: 0
      }
    },
    // Auto-resize todas as colunas
    {
      autoResizeDimensions: {
        dimensions: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: numColunas }
      }
    },
    // Congelar linha de cabeçalho e 3 colunas fixas
    {
      updateSheetProperties: {
        properties: {
          sheetId: sheetId,
          gridProperties: { frozenRowCount: 1, frozenColumnCount: 3 }
        },
        fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount'
      }
    },
    // Status ENTREGUE em verde
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: sheetId, startRowIndex: 1, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: numColunas }],
          booleanRule: {
            condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: 'ENTREGUE' }] },
            format: {
              backgroundColor: { red: 0.85, green: 0.97, blue: 0.88 },
              textFormat: { foregroundColor: { red: 0.1, green: 0.5, blue: 0.2 }, bold: true }
            }
          }
        },
        index: 1
      }
    },
    // Status NÃO ENTREGUE em vermelho
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: sheetId, startRowIndex: 1, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: numColunas }],
          booleanRule: {
            condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: 'NÃO ENTREGUE' }] },
            format: {
              backgroundColor: { red: 1.0, green: 0.88, blue: 0.88 },
              textFormat: { foregroundColor: { red: 0.7, green: 0.1, blue: 0.1 }, bold: true }
            }
          }
        },
        index: 2
      }
    },
    // Status PUBLICADO em verde
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: sheetId, startRowIndex: 1, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: numColunas }],
          booleanRule: {
            condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: 'PUBLICADO' }] },
            format: {
              backgroundColor: { red: 0.85, green: 0.97, blue: 0.88 },
              textFormat: { foregroundColor: { red: 0.1, green: 0.5, blue: 0.2 } }
            }
          }
        },
        index: 3
      }
    },
    // Status EXPIRADO em vermelho
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: sheetId, startRowIndex: 1, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: numColunas }],
          booleanRule: {
            condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: 'EXPIRADO' }] },
            format: {
              backgroundColor: { red: 1.0, green: 0.88, blue: 0.88 },
              textFormat: { foregroundColor: { red: 0.7, green: 0.1, blue: 0.1 } }
            }
          }
        },
        index: 4
      }
    }
  ];

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    }
  );

  if (!response.ok) console.warn('Aviso na formatação:', await response.text());
}

// =============================================
// REGISTRAR HISTÓRICO
// =============================================
async function registrarHistorico(token, spreadsheetId, total, nomeColeta, totalNovos, totalAtualizados) {
  const getResp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Histórico!A:G`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  let proximaLinha = 2;
  if (getResp.ok) {
    const data = await getResp.json();
    proximaLinha = (data.values?.length || 1) + 1;
  }

  if (proximaLinha === 2) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Histórico!A1:G1?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          values: [['Data/Hora', 'Nome da Coleta', 'Total Registros', 'Novos Alunos', 'Atualizações', 'Status', 'Planilha ID']]
        })
      }
    );
  }

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Histórico!A${proximaLinha}:G${proximaLinha}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        values: [[
          new Date().toLocaleString('pt-BR'),
          nomeColeta,
          total,
          totalNovos,
          totalAtualizados,
          'Concluído ✓',
          spreadsheetId
        ]]
      })
    }
  );
}

// =============================================
// CONECTIVIDADE GITHUB
// =============================================

async function verificarAtualizacao() {
  try {
    const response = await fetch(`${GITHUB_RAW}/manifest.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível acessar o GitHub');
    const remoteManifest = await response.json();
    const localVersion = chrome.runtime.getManifest().version;
    
    return {
      local: localVersion,
      remote: remoteManifest.version,
      updateAvailable: parseFloat(remoteManifest.version) > parseFloat(localVersion)
    };
  } catch (err) {
    console.error('Erro ao verificar atualização:', err);
    return null;
  }
}

async function fazerBackupGitHub(dados, token) {
  if (!token) throw new Error('Token do GitHub não configurado');
  
  const fileName = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const path = `historico/${fileName}`;
  const content = btoa(JSON.stringify(dados, null, 2));

  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: `backup: snapshot automático ${new Date().toLocaleString()}`,
      content: content
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Erro GitHub: ${errorData.message}`);
  }
  return await response.json();
}

// =============================================
// CRIAR PLANILHA NOVA
// =============================================
async function criarPlanilha(token, titulo) {
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: titulo },
      sheets: [
        { properties: { title: 'Atividades' } },
        { properties: { title: 'Histórico' } }
      ]
    })
  });
  if (!response.ok) throw new Error('Erro ao criar planilha: ' + response.status);
  return await response.json();
}

// =============================================
// LISTENER PRINCIPAL
// =============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // ── Exportar para Google Sheets ───────────────────────────────────────
  if (request.acao === 'exportarSheets') {
    const { dados, spreadsheetId, nomeColeta, colunasAtividade } = request;

    (async () => {
      try {
        const token = await getAuthToken();
        let sheetId = spreadsheetId;
        let sheetUrl = '';

        if (!sheetId) {
          const titulo = `CMSP Diário de Classe — ${new Date().toLocaleDateString('pt-BR')}`;
          const nova = await criarPlanilha(token, titulo);
          sheetId = nova.spreadsheetId;
          sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}`;
          await chrome.storage.local.set({ spreadsheetId: sheetId, spreadsheetUrl: sheetUrl });
        } else {
          sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}`;
        }

        // ── 1. Sincroniza na aba mestre "Atividades" ──
        const { totalNovos, totalAtualizados } = await escreverNoDiario(
          token, sheetId, dados, nomeColeta, colunasAtividade, 'Atividades'
        );
        await formatarPlanilha(token, sheetId, 'Atividades');

        // ── 2. Segmentação por Turma: agrupa e processa cada uma ──
        const turmas = {};
        dados.forEach(d => {
          const t = String(d.Turma || 'Sem Turma').trim();
          if (!turmas[t]) turmas[t] = [];
          turmas[t].push(d);
        });

        for (const [nomeTurma, dadosTurma] of Object.entries(turmas)) {
          await garantirAba(token, sheetId, nomeTurma);
          await escreverNoDiario(token, sheetId, dadosTurma, nomeColeta, colunasAtividade, nomeTurma);
          await formatarPlanilha(token, sheetId, nomeTurma);
        }

        await registrarHistorico(token, sheetId, dados.length, nomeColeta, totalNovos, totalAtualizados);

        sendResponse({
          sucesso: true, spreadsheetId: sheetId, url: sheetUrl,
          total: dados.length, totalNovos, totalAtualizados,
          linhasAtualizadas: totalAtualizados
        });

      } catch (err) {
        const msg = (err instanceof Error) ? err.message : (err && err.message) ? err.message : JSON.stringify(err);
        console.error('[Background] Erro exportarSheets:', msg, err);
        sendResponse({ sucesso: false, erro: msg });
      }
    })();
    return true;
  }

  // ── Calcular 30% e lançar na Sala do Futuro ───────────────────────────
  // dados: [{Aluno: 'NOME', Nota: '7.5'}, ...]  (todos os registros coletados)
  // percentual: fração dos 30% (padrão 0.30)
  if (request.acao === 'calcularELancar') {
    const { dados, percentual = 0.30 } = request;

    (async () => {
      try {
        // Agrupa notas por aluno (pode ter várias atividades)
        const mapaNotas = {};
        dados.forEach(d => {
          const nome = String(d.Aluno || '').trim().toUpperCase().replace(/\s+/g, ' ');
          if (!nome) return;
          const nota = parseFloat(d.Nota);
          if (isNaN(nota)) return;
          if (!mapaNotas[nome]) mapaNotas[nome] = [];
          mapaNotas[nome].push(nota);
        });

        // Média das atividades × percentual → arredonda 1 casa
        const notasFinais = {};
        Object.entries(mapaNotas).forEach(([nome, notas]) => {
          const media = notas.reduce((a, b) => a + b, 0) / notas.length;
          notasFinais[nome] = Math.round(media * percentual * 10) / 10;
        });

        // Verifica se a aba ativa é a Sala do Futuro
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('saladofuturoprofessor.educacao.sp.gov.br')) {
          sendResponse({ sucesso: false, erro: 'Abra a página de lançamento de notas da Sala do Futuro na aba ativa antes de lançar.' });
          return;
        }

        // Injeta content.js se necessário
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
          await new Promise(r => setTimeout(r, 600));
        } catch (_) { /* já injetado */ }

        const resultado = await chrome.tabs.sendMessage(tab.id, { acao: 'lancarNotas', notas: notasFinais });

        sendResponse({
          sucesso: resultado.sucesso,
          lancados: resultado.lancados,
          naoEncontrados: resultado.naoEncontrados,
          log: resultado.log,
          notasCalculadas: notasFinais,
          erro: resultado.erro
        });

      } catch (err) {
        const msg = (err instanceof Error) ? err.message : JSON.stringify(err);
        console.error('[Background] Erro calcularELancar:', msg, err);
        sendResponse({ sucesso: false, erro: msg });
      }
    })();
    return true;
  }

  // ── Verificar Versão no GitHub ───────────────────────────────────────
  if (request.acao === 'verificarVersao') {
    verificarAtualizacao().then(res => sendResponse(res));
    return true;
  }

  // ── Fazer Backup no GitHub ───────────────────────────────────────────
  if (request.acao === 'backupGitHub') {
    const { dados, token } = request;
    fazerBackupGitHub(dados, token)
      .then(res => sendResponse({ sucesso: true, data: res }))
      .catch(err => sendResponse({ sucesso: false, erro: err.message }));
    return true;
  }
});
