// =============================================
// CMSP Smart Organizer — Apps Script v3
// ✓ Cada atividade em seu bloco de colunas
// ✓ Nenhum aluno ou dado repetido
// ✓ Linhas com cores alternadas
// =============================================

var CAMPOS_FIXOS     = ["Id", "Aluno", "Turma"];
var CAMPOS_ATIVIDADE = ["Entregue em", "Duração", "Status", "Nota"];

// Paleta de cores para blocos de atividade (cabeçalho | dado par | dado ímpar)
var PALETA = [
  { cab: "#166534", par: "#dcfce7", impar: "#f0fdf4" },
  { cab: "#854d0e", par: "#fef9c3", impar: "#fefce8" },
  { cab: "#075985", par: "#e0f2fe", impar: "#f0f9ff" },
  { cab: "#6b21a8", par: "#f3e8ff", impar: "#fdf4ff" },
  { cab: "#9a3412", par: "#ffedd5", impar: "#fff7ed" }
];

// =============================================
// Web App
// =============================================
function doGet() {
  organizarDiario();
  var html = HtmlService.createHtmlOutput(`
    <html><body style="font-family:'Segoe UI',sans-serif;text-align:center;padding:60px;background:#f8fafc;color:#1a1a2e">
      <div style="max-width:480px;margin:auto;background:white;border-radius:16px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <div style="font-size:48px;margin-bottom:16px">✅</div>
        <h2 style="color:#1d6f42;margin-bottom:8px">Diário organizado com sucesso!</h2>
        <p style="color:#555">Cada atividade em sua coluna.<br>Sem repetições. Linhas alternadas.</p>
        <p style="color:#aaa;font-size:12px;margin-top:24px">Pode fechar esta aba.</p>
      </div>
    </body></html>
  `);
  return html.setTitle("CMSP Smart Organizer");
}

// =============================================
// Menu
// =============================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📚 CMSP")
    .addItem("Organizar Diário",     "organizarDiario")
    .addItem("Limpar e Reorganizar", "limparEReorganizar")
    .addSeparator()
    .addItem("Ver Resumo por Aluno", "criarResumo")
    .addToUi();
}

// =============================================
// FUNÇÃO PRINCIPAL
// =============================================
function organizarDiario() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getActiveSheet();
  var nomeAba = aba.getName();

  // Lista de abas que NÃO devem ser organizadas por esta função
  var abasIgnoradas = ["Dashboard", "Histórico", "Resumo"];
  if (abasIgnoradas.indexOf(nomeAba) !== -1) {
    SpreadsheetApp.getUi().alert("A aba '" + nomeAba + "' não pode ser organizada automaticamente.");
    return;
  }

  var dados = aba.getDataRange().getValues();
  if (dados.length < 2) return;

  var cabecalho = dados[0].map(String);

  // Detecta formato "Nome · Campo" (já organizado)
  var atividades = _detectarAtividades(cabecalho);

  if (atividades.length === 0) {
    // Formato antigo: colunas soltas ou "Nome - Campo" da exportação CMSP
    _processarFormatoAntigo(aba, dados, cabecalho);
    return;
  }

  var idxId    = cabecalho.indexOf("Id");
  var idxAluno = cabecalho.indexOf("Aluno");
  var idxTurma = cabecalho.indexOf("Turma");

  if (idxId === -1 || idxAluno === -1) {
    SpreadsheetApp.getUi().alert("Colunas 'Id' e 'Aluno' são obrigatórias.");
    return;
  }

  var resultado = _consolidar(dados, cabecalho, idxId, idxAluno, idxTurma, atividades,
    function(nomeAtiv, campo) {
      return cabecalho.indexOf(nomeAtiv + " · " + campo);
    });

  _reescrever(aba, resultado.mapa, resultado.ordem, atividades);
}

// =============================================
// Detecta atividades no formato "Nome · Campo"
// =============================================
function _detectarAtividades(cabecalho) {
  var vistas = {}, lista = [];
  cabecalho.forEach(function(col) {
    var p = col.split(" · ");
    if (p.length === 2 && CAMPOS_ATIVIDADE.indexOf(p[1].trim()) !== -1) {
      var nome = p[0].trim();
      if (!vistas[nome]) { vistas[nome] = true; lista.push(nome); }
    }
  });
  return lista;
}

// =============================================
// CONSOLIDAÇÃO — 1 aluno = 1 linha, sem repetição
// =============================================
function _consolidar(dados, cabecalho, idxId, idxAluno, idxTurma, atividades, fnIdx) {
  var mapa  = {};
  var ordem = [];

  // Pré-calcula índices para evitar buscas repetidas no loop
  var indices = {};
  atividades.forEach(function(nomeAtiv) {
    indices[nomeAtiv] = {};
    CAMPOS_ATIVIDADE.forEach(function(campo) {
      indices[nomeAtiv][campo] = fnIdx(nomeAtiv, campo);
    });
  });

  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    var id    = idxId    !== -1 ? String(linha[idxId]    || "").trim() : "";
    var aluno = idxAluno !== -1 ? String(linha[idxAluno] || "").trim() : "";
    var turma = idxTurma !== -1 ? String(linha[idxTurma] || "").trim() : "";

    if (!id && !aluno) continue; // ignora linhas completamente vazias

    var chave = id || aluno; // Id como chave primária; fallback = nome

    if (!mapa[chave]) {
      mapa[chave] = { Id: id, Aluno: aluno, Turma: turma, atividades: {} };
      ordem.push(chave);
    } else {
      // Complementa campos fixos que vieram vazios em linhas anteriores
      if (!mapa[chave].Id    && id)    mapa[chave].Id    = id;
      if (!mapa[chave].Aluno && aluno) mapa[chave].Aluno = aluno;
      if (!mapa[chave].Turma && turma) mapa[chave].Turma = turma;
    }

    // Mescla dados de atividade — NÃO sobrescreve valor já preenchido
    atividades.forEach(function(nomeAtiv) {
      if (!mapa[chave].atividades[nomeAtiv]) {
        mapa[chave].atividades[nomeAtiv] = {};
      }
      CAMPOS_ATIVIDADE.forEach(function(campo) {
        var jaPreenchido = mapa[chave].atividades[nomeAtiv][campo] !== undefined &&
                           mapa[chave].atividades[nomeAtiv][campo] !== "";
        if (jaPreenchido) return;

        var idx = indices[nomeAtiv][campo];
        if (idx === -1) return;

        var val = linha[idx];
        if (val !== "" && val !== null && val !== undefined) {
          mapa[chave].atividades[nomeAtiv][campo] = val;
        }
      });
    });
  }

  return { mapa: mapa, ordem: ordem };
}

// =============================================
// REESCREVE A PLANILHA
// =============================================
function _reescrever(aba, mapaAlunos, ordemAlunos, atividades) {
  var cabecalho = ["Id", "Aluno", "Turma"];
  atividades.forEach(function(nomeAtiv) {
    CAMPOS_ATIVIDADE.forEach(function(campo) {
      cabecalho.push(nomeAtiv + " · " + campo);
    });
  });

  // Cada aluno = exatamente 1 linha
  var linhas = [cabecalho];
  ordemAlunos.forEach(function(chave) {
    var a    = mapaAlunos[chave];
    var linha = [a.Id, a.Aluno, a.Turma];
    atividades.forEach(function(nomeAtiv) {
      CAMPOS_ATIVIDADE.forEach(function(campo) {
        linha.push(
          (a.atividades[nomeAtiv] && a.atividades[nomeAtiv][campo] !== undefined)
            ? a.atividades[nomeAtiv][campo] : ""
        );
      });
    });
    linhas.push(linha);
  });

  aba.clearContents();
  aba.clearFormats();
  aba.getRange(1, 1, linhas.length, cabecalho.length).setValues(linhas);
  _aplicarFormatacao(aba, linhas.length, cabecalho.length, atividades);
  SpreadsheetApp.flush();
}

// =============================================
// FORMATAÇÃO — cabeçalho, blocos coloridos, linhas alternadas
// =============================================
function _aplicarFormatacao(aba, numLinhas, numColunas, atividades) {
  var numDados = numLinhas - 1; // linhas de dados (sem cabeçalho)

  // ── Cabeçalho geral (linha 1) ──────────────────────────────────────────
  aba.getRange(1, 1, 1, numColunas)
    .setBackground("#1e293b")
    .setFontColor("#f8fafc")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setFontSize(10);

  // ── Colunas fixas (Id, Aluno, Turma) — cabeçalho e dados ──────────────
  if (numDados > 0) {
    // Cabeçalho fixo já coberto acima; colore dados linha a linha
    for (var r = 0; r < numDados; r++) {
      var linhaIdx = r + 2; // linha 2 em diante (1-indexed)
      var corFundo = (r % 2 === 0) ? "#eef2ff" : "#dde4ff";
      aba.getRange(linhaIdx, 1, 1, 3)
        .setBackground(corFundo)
        .setFontColor("#3730a3")
        .setFontWeight("normal");
    }
  }

  // ── Blocos de atividade — cabeçalho colorido + linhas alternadas ───────
  var colAtual = 4; // começa após as 3 colunas fixas
  atividades.forEach(function(_, idx) {
    var paleta = PALETA[idx % PALETA.length];
    var nCols  = CAMPOS_ATIVIDADE.length;

    // Cabeçalho do bloco (linha 1)
    aba.getRange(1, colAtual, 1, nCols)
      .setBackground(paleta.cab)
      .setFontColor("#ffffff")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");

    // Dados com linhas alternadas
    if (numDados > 0) {
      for (var r = 0; r < numDados; r++) {
        var linhaIdx = r + 2;
        var corFundo = (r % 2 === 0) ? paleta.par : paleta.impar;
        aba.getRange(linhaIdx, colAtual, 1, nCols)
          .setBackground(corFundo)
          .setFontColor("#1e293b");
      }
    }

    colAtual += nCols;
  });

  // ── Bordas ────────────────────────────────────────────────────────────
  aba.getRange(1, 1, numLinhas, numColunas)
    .setBorder(true, true, true, true, true, true,
      "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);

  // Borda mais grossa separando cada bloco de atividade
  var sepCol = 4;
  atividades.forEach(function() {
    aba.getRange(1, sepCol, numLinhas, 1)
      .setBorder(null, true, null, null, null, null,
        "#94a3b8", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    sepCol += CAMPOS_ATIVIDADE.length;
  });

  // ── Congelar cabeçalho e 3 colunas fixas ──────────────────────────────
  aba.setFrozenRows(1);
  aba.setFrozenColumns(3);

  // ── Altura de linha e auto-resize ─────────────────────────────────────
  aba.setRowHeight(1, 28);
  if (numDados > 0) aba.setRowHeightsForced(2, numDados, 22);
  for (var c = 1; c <= numColunas; c++) aba.autoResizeColumn(c);
}

// =============================================
// FORMATO ANTIGO — colunas soltas ou "Nome - Campo"
// =============================================
function _processarFormatoAntigo(aba, dados, cabecalho) {
  var idxId     = _findCol(cabecalho, ["Id", "ID"]);
  var idxAluno  = _findCol(cabecalho, ["Aluno", "Nome", "Estudante"]);
  var idxTurma  = _findCol(cabecalho, ["Turma", "Classe", "Série"]);
  var idxColeta = _findCol(cabecalho, ["Coletado em", "Atividade", "Página"]);

  // Tenta detectar atividades no padrão "Nome - Campo" (exportação CMSP crua)
  var atividades = [], vistas = {};
  cabecalho.forEach(function(col) {
    CAMPOS_ATIVIDADE.forEach(function(campo) {
      var sufixo = " - " + campo;
      if (col.trim().slice(-sufixo.length) === sufixo) {
        var nome = col.trim().slice(0, col.trim().length - sufixo.length).trim();
        if (nome && !vistas[nome]) { vistas[nome] = true; atividades.push(nome); }
      }
    });
  });

  if (atividades.length > 0) {
    // Formato "Nome - Campo": converte para o padrão "Nome · Campo"
    var resultado = _consolidar(dados, cabecalho, idxId, idxAluno, idxTurma, atividades,
      function(nomeAtiv, campo) {
        var separadores = [" - ", " – ", " — "];
        for (var s = 0; s < separadores.length; s++) {
          var idx = cabecalho.indexOf(nomeAtiv + separadores[s] + campo);
          if (idx !== -1) return idx;
        }
        return -1;
      });
    _reescrever(aba, resultado.mapa, resultado.ordem, atividades);
    return;
  }

  // Fallback: colunas totalmente soltas (Nota, Status sem prefixo)
  var mapa = {}, ordem = [], coletasSet = {}, coletas = [];
  for (var i = 1; i < dados.length; i++) {
    var linha  = dados[i];
    var id     = idxId    !== -1 ? String(linha[idxId]    || "").trim() : "";
    var aluno  = idxAluno !== -1 ? String(linha[idxAluno] || "").trim() : "";
    var coleta = idxColeta !== -1 ? String(linha[idxColeta] || "Coleta 1").trim() : "Coleta 1";
    if (!id && !aluno) continue;

    var chave = id || aluno;
    if (!mapa[chave]) {
      mapa[chave] = {
        Id: id, Aluno: aluno,
        Turma: idxTurma !== -1 ? String(linha[idxTurma] || "").trim() : "",
        atividades: {}
      };
      ordem.push(chave);
    }
    if (!coletasSet[coleta]) { coletasSet[coleta] = true; coletas.push(coleta); }
    if (!mapa[chave].atividades[coleta]) mapa[chave].atividades[coleta] = {};

    CAMPOS_ATIVIDADE.forEach(function(campo) {
      var idx = cabecalho.indexOf(campo);
      if (idx === -1) return;
      var val = linha[idx];
      if (String(val).trim() !== "" && mapa[chave].atividades[coleta][campo] === undefined) {
        mapa[chave].atividades[coleta][campo] = val;
      }
    });
  }
  _reescrever(aba, mapa, ordem, coletas);
}

// =============================================
// LIMPAR E REORGANIZAR
// =============================================
function limparEReorganizar() {
  var ui   = SpreadsheetApp.getUi();
  var resp = ui.alert(
    "Limpar e Reorganizar",
    "Isso vai reorganizar todos os dados da aba 'Atividades'.\nDeseja continuar?",
    ui.ButtonSet.YES_NO
  );
  if (resp === ui.Button.YES) organizarDiario();
}

// =============================================
// RESUMO POR ALUNO — aba separada, sem repetição, com zebra
// =============================================
function criarResumo() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getActiveSheet();
  var nomeAba = aba.getName();

  var abasIgnoradas = ["Dashboard", "Histórico", "Resumo"];
  if (abasIgnoradas.indexOf(nomeAba) !== -1) {
    SpreadsheetApp.getUi().alert("Não é possível criar um resumo a partir desta aba.");
    return;
  }

  var dados     = aba.getDataRange().getValues();
  var cabecalho = dados[0].map(String);

  var idxId    = cabecalho.indexOf("Id");
  var idxAluno = cabecalho.indexOf("Aluno");
  var idxTurma = cabecalho.indexOf("Turma");

  // Detecta atividades pelas colunas de Nota
  var atividades = [], atSet = {};
  cabecalho.forEach(function(col) {
    var p = col.split(" · ");
    if (p.length === 2 && p[1].trim() === "Nota") {
      var nome = p[0].trim();
      if (!atSet[nome]) { atSet[nome] = true; atividades.push(nome); }
    }
  });

  // Consolida 1 aluno por linha
  var mapa = {}, ordem = [];
  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    var id    = idxId    !== -1 ? String(linha[idxId]    || "").trim() : "";
    var aluno = idxAluno !== -1 ? String(linha[idxAluno] || "").trim() : "";
    if (!id && !aluno) continue;

    var chave = id || aluno;
    if (!mapa[chave]) {
      mapa[chave] = {
        Id: id, Aluno: aluno,
        Turma: idxTurma !== -1 ? String(linha[idxTurma] || "").trim() : "",
        notas: {}
      };
      ordem.push(chave);
    }

    atividades.forEach(function(nomeAtiv) {
      if (mapa[chave].notas[nomeAtiv] !== undefined) return;
      var idxNota   = cabecalho.indexOf(nomeAtiv + " · Nota");
      var idxStatus = cabecalho.indexOf(nomeAtiv + " · Status");
      var nota   = idxNota   !== -1 ? linha[idxNota]            : "";
      var status = idxStatus !== -1 ? String(linha[idxStatus] || "") : "";
      if (String(nota).trim() !== "" || status !== "") {
        mapa[chave].notas[nomeAtiv] = { nota: nota, status: status };
      }
    });
  }

  // Monta linhas do resumo
  var cabResume = ["Id", "Aluno", "Turma"]
    .concat(atividades.map(function(a) { return a + " · Nota"; }))
    .concat(["Total", "Entregues", "Média"]);

  var linhasResumo = [cabResume];
  ordem.forEach(function(chave) {
    var r = mapa[chave];
    var notas = [], entregues = 0, notasCols = [];

    atividades.forEach(function(nomeAtiv) {
      var d      = r.notas[nomeAtiv] || {};
      var nota   = d.nota   !== undefined ? d.nota   : "";
      var status = d.status !== undefined ? d.status : "";
      var num    = parseFloat(nota);
      notasCols.push(nota !== "" ? nota : "");
      if (!isNaN(num)) notas.push(num);
      if (status.toUpperCase().indexOf("ENTREGUE") !== -1 || String(nota).trim() !== "") entregues++;
    });

    var total = notas.reduce(function(a, b) { return a + b; }, 0);
    var media = notas.length > 0 ? (total / notas.length).toFixed(1) : "";

    linhasResumo.push(
      [r.Id, r.Aluno, r.Turma]
        .concat(notasCols)
        .concat([total > 0 ? total : "", entregues, media])
    );
  });

  // Escreve aba Resumo
  var abaR = ss.getSheetByName("Resumo") || ss.insertSheet("Resumo");
  abaR.clearContents();
  abaR.clearFormats();
  abaR.getRange(1, 1, linhasResumo.length, cabResume.length).setValues(linhasResumo);

  // Cabeçalho
  abaR.getRange(1, 1, 1, cabResume.length)
    .setBackground("#1e293b").setFontColor("#f8fafc")
    .setFontWeight("bold").setHorizontalAlignment("center");

  // Linhas alternadas no resumo
  var numDadosR = linhasResumo.length - 1;
  for (var r = 0; r < numDadosR; r++) {
    var linhaIdx = r + 2;
    // Colunas fixas
    abaR.getRange(linhaIdx, 1, 1, 3)
      .setBackground(r % 2 === 0 ? "#eef2ff" : "#dde4ff")
      .setFontColor("#3730a3");
    // Colunas de nota
    if (cabResume.length > 3) {
      abaR.getRange(linhaIdx, 4, 1, cabResume.length - 3)
        .setBackground(r % 2 === 0 ? "#f8fafc" : "#f1f5f9")
        .setFontColor("#1e293b");
    }
  }

  // Destaca Total, Entregues, Média (últimas 3 colunas)
  if (numDadosR > 0) {
    abaR.getRange(2, cabResume.length - 2, numDadosR, 3)
      .setFontWeight("bold");
  }

  abaR.getRange(1, 1, linhasResumo.length, cabResume.length)
    .setBorder(true, true, true, true, true, true,
      "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);

  abaR.setFrozenRows(1);
  abaR.setFrozenColumns(3);
  abaR.setRowHeight(1, 28);
  if (numDadosR > 0) abaR.setRowHeightsForced(2, numDadosR, 22);
  for (var c = 1; c <= cabResume.length; c++) abaR.autoResizeColumn(c);

  ss.setActiveSheet(abaR);
  SpreadsheetApp.getUi().alert("✅ Resumo criado na aba 'Resumo'!");
}

// =============================================
// UTILITÁRIO — busca coluna por lista de nomes alternativos
// =============================================
function _findCol(cabecalho, alternativas) {
  for (var i = 0; i < alternativas.length; i++) {
    var idx = cabecalho.indexOf(alternativas[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}
