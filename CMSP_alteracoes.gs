// =============================================
// SUBSTITUIR APENAS ESTAS DUAS FUNÇÕES
// no arquivo CMSP_SmartOrganizer_v3.gs
// =============================================

// ── SUBSTITUI: _detectarAtividadesFormatoB ────────────────────────────────
//
// Detecta atividades no padrão "NomeAtiv - Campo" (traço simples)
// exportado pela plataforma CMSP.
// Ex: "Tarefa 1 - Nota", "Tarefa 1 - Status", "Tarefa 2 - Nota" ...
//
function _detectarAtividadesFormatoB(cabecalho) {
  var vistas = {}, lista = [];

  cabecalho.forEach(function(col) {
    col = col.trim();
    // Percorre cada campo e verifica se o cabeçalho termina com " - Campo"
    CAMPOS_ATIVIDADE.forEach(function(campo) {
      var sufixo = " - " + campo;
      if (col.slice(-sufixo.length) === sufixo) {
        // O nome da atividade é tudo antes do sufixo
        var nome = col.slice(0, col.length - sufixo.length).trim();
        if (nome && !vistas[nome]) {
          vistas[nome] = true;
          lista.push(nome);
        }
      }
    });
  });

  return lista;
}


// ── SUBSTITUI: _consolidar ────────────────────────────────────────────────
//
// Garante 1 linha por aluno mesclando dados de linhas repetidas.
// Cada linha da exportação CMSP pode representar a mesma atividade
// de um aluno diferente OU atividades diferentes do mesmo aluno.
// A chave primária é sempre o Id (sempre preenchido conforme confirmado).
//
function _consolidar(dados, cabecalho, idxId, idxAluno, idxTurma, atividades, fnIdx) {
  var mapa  = {};
  var ordem = [];

  // Pré-calcula os índices de cada "NomeAtiv · Campo" uma única vez
  // para evitar buscas repetidas dentro do loop
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

    // Id sempre preenchido — ignora só se ambos estiverem vazios
    if (!id && !aluno) continue;

    // Chave primária = Id (sempre presente conforme confirmado)
    var chave = id || aluno;

    if (!mapa[chave]) {
      mapa[chave] = { Id: id, Aluno: aluno, Turma: turma, atividades: {} };
      ordem.push(chave);
    }

    // Mescla cada atividade da linha no registro do aluno
    // Regra: NÃO sobrescreve valor já preenchido (primeiro encontrado vence)
    atividades.forEach(function(nomeAtiv) {
      if (!mapa[chave].atividades[nomeAtiv]) {
        mapa[chave].atividades[nomeAtiv] = {};
      }

      CAMPOS_ATIVIDADE.forEach(function(campo) {
        // Já tem valor? Pula.
        var jaTemValor = mapa[chave].atividades[nomeAtiv][campo] !== undefined &&
                         mapa[chave].atividades[nomeAtiv][campo] !== "";
        if (jaTemValor) return;

        var idx = indices[nomeAtiv][campo];
        if (idx === -1) return;

        var val = linha[idx];
        // Considera preenchido apenas se não for vazio/nulo
        if (val !== "" && val !== null && val !== undefined) {
          mapa[chave].atividades[nomeAtiv][campo] = val;
        }
      });
    });
  }

  return { mapa: mapa, ordem: ordem };
}
