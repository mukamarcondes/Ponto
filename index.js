(function () {
  const STORAGE_KEY = "folha-ponto.registros.v1";
  const HORA_ENTRADA = "08:15";
  const HORA_SAIDA = "18:00";
  const DIAS_UTEIS = [1, 2, 3, 4, 5];

  const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
  const formatoDia = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
  const formatoDataLonga = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  const estado = {
    registros: lerRegistros(),
    mesSelecionado: chaveMes(new Date()),
    editandoData: ""
  };

  function lerRegistros() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (error) {
      return {};
    }
  }

  function salvarRegistros() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(estado.registros));
  }

  function doisDigitos(valor) {
    return String(valor).padStart(2, "0");
  }

  function chaveData(data) {
    return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
  }

  function chaveMes(data) {
    return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}`;
  }

  function dataPorChave(chave) {
    const [ano, mes, dia] = chave.split("-").map(Number);
    return new Date(ano, mes - 1, dia || 1);
  }

  function minutosDoHorario(horario) {
    if (!horario) return null;
    const [horas, minutos] = horario.split(":").map(Number);
    if (!Number.isFinite(horas) || !Number.isFinite(minutos)) return null;
    return horas * 60 + minutos;
  }

  function textoMinutos(minutos) {
    const sinal = minutos < 0 ? "-" : "";
    const total = Math.abs(minutos);
    return `${sinal}${Math.floor(total / 60)}h${doisDigitos(total % 60)}`;
  }

  function jornadaEsperada() {
    return minutosDoHorario(HORA_SAIDA) - minutosDoHorario(HORA_ENTRADA);
  }

  function minutosTrabalhados(registro) {
    const entrada = minutosDoHorario(registro?.entrada);
    const saida = minutosDoHorario(registro?.saida);
    if (entrada === null || saida === null || saida < entrada) return null;
    return saida - entrada;
  }

  function saldoRegistro(registro) {
    const trabalhado = minutosTrabalhados(registro);
    if (trabalhado === null) return null;
    return trabalhado - jornadaEsperada();
  }

  function ehDiaUtil(data) {
    return DIAS_UTEIS.includes(data.getDay());
  }

  function diasDoMesSelecionado() {
    const [ano, mes] = estado.mesSelecionado.split("-").map(Number);
    const total = new Date(ano, mes, 0).getDate();
    return Array.from({ length: total }, (_, indice) => new Date(ano, mes - 1, indice + 1));
  }

  function registrosDoMes() {
    return diasDoMesSelecionado()
      .filter(ehDiaUtil)
      .map((data) => {
        const chave = chaveData(data);
        return { data, chave, registro: estado.registros[chave] || null };
      });
  }

  function horarioAtual() {
    const agora = new Date();
    return `${doisDigitos(agora.getHours())}:${doisDigitos(agora.getMinutes())}`;
  }

  function registrarHoje(campo) {
    const hoje = chaveData(new Date());
    const atual = estado.registros[hoje] || { data: hoje, entrada: "", saida: "", observacao: "" };
    estado.registros[hoje] = { ...atual, [campo]: horarioAtual() };
    salvarRegistros();
    renderizar();
  }

  function salvarRegistro(data, entrada, saida, observacao) {
    if (!data) return;
    if (!entrada && !saida && !observacao) {
      delete estado.registros[data];
    } else {
      estado.registros[data] = { data, entrada, saida, observacao };
    }
    salvarRegistros();
    renderizar();
  }

  function excluirRegistro(chave) {
    if (!confirm("Excluir este registro de ponto?")) return;
    delete estado.registros[chave];
    salvarRegistros();
    renderizar();
  }

  function abrirModal(chave = "") {
    const dataPadrao = chave || chaveData(new Date());
    const registro = estado.registros[dataPadrao] || { data: dataPadrao, entrada: "", saida: "", observacao: "" };
    estado.editandoData = chave;
    document.getElementById("modalTitulo").textContent = chave ? "Editar ponto" : "Adicionar dia";
    document.getElementById("dataRegistro").value = registro.data;
    document.getElementById("entradaRegistro").value = registro.entrada || "";
    document.getElementById("saidaRegistro").value = registro.saida || "";
    document.getElementById("obsRegistro").value = registro.observacao || "";
    document.getElementById("modalRegistro").hidden = false;
  }

  function fecharModal() {
    document.getElementById("modalRegistro").hidden = true;
    estado.editandoData = "";
  }

  function resultadoLinha(item) {
    if (!item.registro) return { texto: "Sem registro", classe: "resultado-ruim" };
    const saldo = saldoRegistro(item.registro);
    if (saldo === null) return { texto: "Incompleto", classe: "resultado-alerta" };
    if (saldo > 0) return { texto: `+${textoMinutos(saldo)}`, classe: "resultado-bom" };
    if (saldo < 0) return { texto: textoMinutos(saldo), classe: "resultado-ruim" };
    return { texto: "No horário", classe: "resultado-bom" };
  }

  function resumoMes() {
    const linhas = registrosDoMes();
    const completos = linhas.filter((item) => minutosTrabalhados(item.registro) !== null);
    const saldoTotal = completos.reduce((total, item) => total + saldoRegistro(item.registro), 0);
    const entradasAtrasadas = completos.filter((item) => minutosDoHorario(item.registro.entrada) > minutosDoHorario(HORA_ENTRADA)).length;
    const saidasAntecipadas = completos.filter((item) => minutosDoHorario(item.registro.saida) < minutosDoHorario(HORA_SAIDA)).length;
    return {
      linhas,
      completos,
      semFechar: linhas.length - completos.length,
      saldoTotal,
      entradasAtrasadas,
      saidasAntecipadas
    };
  }

  function saldoAcumulado() {
    return Object.values(estado.registros)
      .map(saldoRegistro)
      .filter((saldo) => saldo !== null)
      .reduce((total, saldo) => total + saldo, 0);
  }

  function renderizarRelogio() {
    const agora = new Date();
    document.getElementById("relogio").textContent = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    document.getElementById("dataAtual").textContent = formatoDataLonga.format(agora);
  }

  function renderizarHoje() {
    const hoje = chaveData(new Date());
    const registro = estado.registros[hoje] || { entrada: "", saida: "", observacao: "" };
    const status = document.getElementById("statusHoje");
    document.getElementById("entradaHoje").value = registro.entrada || "";
    document.getElementById("saidaHoje").value = registro.saida || "";
    document.getElementById("obsHoje").value = registro.observacao || "";

    const saldo = saldoRegistro(registro);
    status.className = "status-pill";
    if (!ehDiaUtil(new Date())) {
      status.textContent = "Fora da escala";
      status.classList.add("alerta");
    } else if (!registro.entrada && !registro.saida) {
      status.textContent = "Aguardando registro";
      status.classList.add("alerta");
    } else if (saldo === null) {
      status.textContent = "Registro incompleto";
      status.classList.add("alerta");
    } else if (saldo < 0) {
      status.textContent = `Devendo ${textoMinutos(saldo).replace("-", "")}`;
      status.classList.add("ruim");
    } else if (saldo > 0) {
      status.textContent = `Extra ${textoMinutos(saldo)}`;
    } else {
      status.textContent = "Dia fechado";
    }
  }

  function renderizarResumo() {
    const resumo = resumoMes();
    document.getElementById("saldoMes").textContent = textoMinutos(resumo.saldoTotal);
    document.getElementById("saldoAcumulado").textContent = textoMinutos(saldoAcumulado());
    document.getElementById("resumoGrid").innerHTML = `
      <article class="resumo-card bom"><span>Dias fechados</span><strong>${resumo.completos.length}</strong></article>
      <article class="resumo-card ${resumo.semFechar ? "ruim" : "bom"}"><span>Dias sem fechar</span><strong>${resumo.semFechar}</strong></article>
      <article class="resumo-card alerta"><span>Entradas após 08:15</span><strong>${resumo.entradasAtrasadas}</strong></article>
      <article class="resumo-card alerta"><span>Saídas antes de 18:00</span><strong>${resumo.saidasAntecipadas}</strong></article>
    `;
  }

  function renderizarTabela() {
    const corpo = document.getElementById("tabelaRegistros");
    const linhas = registrosDoMes();
    if (!linhas.length) {
      corpo.innerHTML = `<tr><td colspan="8"><div class="vazio">Nenhum dia útil neste mês.</div></td></tr>`;
      return;
    }

    corpo.innerHTML = linhas.map((item) => {
      const registro = item.registro || {};
      const total = minutosTrabalhados(registro);
      const resultado = resultadoLinha(item);
      return `
        <tr>
          <td>${formatoData.format(item.data)}</td>
          <td>${formatoDia.format(item.data)}</td>
          <td>${registro.entrada || "--:--"}</td>
          <td>${registro.saida || "--:--"}</td>
          <td>${total === null ? "--" : textoMinutos(total)}</td>
          <td class="${resultado.classe}">${resultado.texto}</td>
          <td>${registro.observacao || ""}</td>
          <td>
            <div class="acoes-linha">
              <button class="btn btn-neutro acao-tabela" type="button" data-editar="${item.chave}">Editar</button>
              <button class="btn btn-perigo acao-tabela" type="button" data-excluir="${item.chave}">Excluir</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  function renderizar() {
    renderizarRelogio();
    renderizarHoje();
    renderizarResumo();
    renderizarTabela();
  }

  function exportarCsv() {
    const cabecalho = ["Data", "Dia", "Entrada", "Saida", "Total", "Saldo", "Observacao"];
    const linhas = registrosDoMes().map((item) => {
      const registro = item.registro || {};
      const total = minutosTrabalhados(registro);
      const resultado = resultadoLinha(item);
      return [
        formatoData.format(item.data),
        formatoDia.format(item.data),
        registro.entrada || "",
        registro.saida || "",
        total === null ? "" : textoMinutos(total),
        resultado.texto,
        registro.observacao || ""
      ];
    });
    const csv = [cabecalho, ...linhas]
      .map((linha) => linha.map((celula) => `"${String(celula).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `folha-de-ponto-${estado.mesSelecionado}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function iniciarEventos() {
    document.getElementById("mesSelecionado").value = estado.mesSelecionado;
    document.getElementById("mesSelecionado").addEventListener("change", (event) => {
      estado.mesSelecionado = event.target.value || chaveMes(new Date());
      renderizar();
    });
    document.getElementById("marcarEntrada").addEventListener("click", () => registrarHoje("entrada"));
    document.getElementById("marcarSaida").addEventListener("click", () => registrarHoje("saida"));
    document.getElementById("formHoje").addEventListener("submit", (event) => {
      event.preventDefault();
      salvarRegistro(
        chaveData(new Date()),
        document.getElementById("entradaHoje").value,
        document.getElementById("saidaHoje").value,
        document.getElementById("obsHoje").value.trim()
      );
    });
    document.getElementById("adicionarDia").addEventListener("click", () => abrirModal());
    document.getElementById("exportarCsv").addEventListener("click", exportarCsv);
    document.getElementById("limparMes").addEventListener("click", () => {
      if (!confirm("Limpar todos os registros deste mês?")) return;
      registrosDoMes().forEach((item) => delete estado.registros[item.chave]);
      salvarRegistros();
      renderizar();
    });
    document.getElementById("tabelaRegistros").addEventListener("click", (event) => {
      const editar = event.target.closest("[data-editar]");
      const excluir = event.target.closest("[data-excluir]");
      if (editar) abrirModal(editar.dataset.editar);
      if (excluir) excluirRegistro(excluir.dataset.excluir);
    });
    document.getElementById("formRegistro").addEventListener("submit", (event) => {
      event.preventDefault();
      const dataAnterior = estado.editandoData;
      const dataNova = document.getElementById("dataRegistro").value;
      if (dataAnterior && dataAnterior !== dataNova) delete estado.registros[dataAnterior];
      salvarRegistro(
        dataNova,
        document.getElementById("entradaRegistro").value,
        document.getElementById("saidaRegistro").value,
        document.getElementById("obsRegistro").value.trim()
      );
      fecharModal();
    });
    document.getElementById("fecharModal").addEventListener("click", fecharModal);
    document.getElementById("cancelarModal").addEventListener("click", fecharModal);
    document.getElementById("modalRegistro").addEventListener("click", (event) => {
      if (event.target.id === "modalRegistro") fecharModal();
    });
  }

  iniciarEventos();
  renderizar();
  setInterval(renderizarRelogio, 1000);
})();