/* FIXE OS OLHOS EM JESUS — scripts compartilhados (sem dependências) */
(() => {
  'use strict';
  const RAIZ = document.body.dataset.raiz || './';
  const PAGINA = document.body.dataset.pagina;
  const FUSO = 'America/Sao_Paulo';
  const NOME = 'FIXE OS OLHOS EM JESUS';
  const $ = (s, el = document) => el.querySelector(s);

  function el(tag, attrs, ...filhos) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === false || v == null) return;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    filhos.flat().forEach(f => e.append(f instanceof Node ? f : document.createTextNode(f)));
    return e;
  }

  async function carregarJSON(caminho) {
    const chave = 'fixe:' + caminho;
    try {
      const r = await fetch(RAIZ + caminho, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      const dados = await r.json();
      try { localStorage.setItem(chave, JSON.stringify(dados)); } catch (_) {}
      return dados;
    } catch (erro) {
      try { const salvo = localStorage.getItem(chave); if (salvo) return JSON.parse(salvo); } catch (_) {}
      throw erro;
    }
  }

  const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date());
  const dataExtenso = iso => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'full' })
    .format(new Date(iso + 'T12:00:00-03:00'));
  const dataCurta = iso => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(iso + 'T12:00:00-03:00'));

  function urlDaPagina(caminho, params) {
    const u = new URL(RAIZ + caminho, location.href);
    u.search = ''; u.hash = '';
    Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.href;
  }

  /* Compartilhamento: WhatsApp, função nativa (quando disponível) e copiar */
  function blocoCompartilhar(rotulo, texto, url) {
    const completo = texto + '\n\n' + NOME + '\n' + url;
    const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
    const bloco = el('div', { class: 'compartilhar' }, el('span', {}, rotulo + ':'),
      el('a', { class: 'btn', href: 'https://wa.me/?text=' + encodeURIComponent(completo), target: '_blank', rel: 'noopener' }, 'WhatsApp'));
    if (navigator.share) {
      bloco.append(el('button', { class: 'btn', type: 'button', onclick: async () => {
        try { await navigator.share({ title: NOME, text: texto, url }); } catch (_) {}
      } }, 'Compartilhar'));
    }
    bloco.append(el('button', { class: 'btn', type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(completo); status.textContent = 'Texto copiado.'; }
      catch (_) { status.textContent = 'Não foi possível copiar. Selecione o texto manualmente.'; }
    } }, 'Copiar'));
    return el('div', {}, bloco, status);
  }

  const blocoVersiculo = v => el('figure', { class: 'versiculo' },
    el('blockquote', {}, '“' + v.texto + '”'), el('cite', {}, v.referencia + ' (Almeida Revista e Corrigida)'));

  function renderDevocional(alvo, d, dataISO, urlCompartilhar) {
    alvo.replaceChildren(
      el('h1', { class: 'devo-titulo' }, d.titulo),
      el('p', { class: 'passagem' }, el('strong', {}, 'Passagem para ler: '), d.passagem),
      el('h3', {}, 'Versículo em destaque'),
      blocoVersiculo(d.versiculo),
      blocoCompartilhar('Compartilhar versículo', '“' + d.versiculo.texto + '” — ' + d.versiculo.referencia, urlCompartilhar),
      el('h3', {}, 'Reflexão'),
      ...d.reflexao.map(p => el('p', {}, p)),
      el('h3', {}, 'Aplicação prática'),
      el('p', {}, d.aplicacao),
      el('p', { class: 'encorajamento' }, d.encorajamento),
      blocoCompartilhar('Compartilhar devocional',
        d.titulo + ' (' + dataCurta(dataISO) + ')\n\n“' + d.versiculo.texto + '” — ' + d.versiculo.referencia + '\n\nLeia: ' + d.passagem, urlCompartilhar)
    );
  }

  const erro = (alvo, msg) => alvo.replaceChildren(el('p', {}, msg));

  /* ---------- Página inicial ---------- */
  async function paginaInicial() {
    const alvo = $('#conteudo'), dataEl = $('#data-atual'), avisoEl = $('#aviso-data');
    dataEl.textContent = dataExtenso(hojeBR());
    try {
      let pub;
      try { pub = await carregarJSON('data/hoje.json'); }
      catch (_) { const h = await carregarJSON('data/historico.json'); pub = h[0]; }
      const d = pub.devocional;
      if (pub.data !== hojeBR()) avisoEl.textContent = 'Último devocional publicado em ' + dataCurta(pub.data) + '. O de hoje será publicado às 05h (horário de Brasília).';
      renderDevocional(alvo, d, pub.data, urlDaPagina('anteriores/', { d: pub.data }));
    } catch (_) {
      erro(alvo, 'Não foi possível carregar o devocional agora. Tente novamente em alguns instantes.');
    }
  }

  /* ---------- Orações ---------- */
  async function paginaOracao() {
    const alvo = $('#conteudo'), seletor = $('#categoria');
    let lista;
    try { lista = await carregarJSON('data/oracoes.json'); }
    catch (_) { return erro(alvo, 'Não foi possível carregar as orações agora. Tente novamente em alguns instantes.'); }

    [...new Set(lista.map(o => o.categoria))].forEach(c => seletor.append(el('option', { value: c }, c)));
    let atual = null;

    function mostrar(o) {
      atual = o;
      history.replaceState(null, '', '?id=' + o.id);
      alvo.replaceChildren(
        el('p', { class: 'categoria' }, o.categoria),
        el('h1', { class: 'devo-titulo' }, o.titulo),
        ...o.texto.split('\n').map(p => el('p', { class: 'oracao-texto' }, p)),
        el('h3', {}, 'Passagem para ler'),
        el('p', {}, o.passagem),
        el('h3', {}, 'Versículo para meditação'),
        blocoVersiculo(o.versiculo),
        blocoCompartilhar('Compartilhar oração', o.titulo + '\n\n' + o.texto, urlDaPagina('oracao/', { id: o.id }))
      );
    }
    function sortear() {
      const cat = seletor.value;
      const base = lista.filter(o => (!cat || o.categoria === cat) && (!atual || o.id !== atual.id));
      const pool = base.length ? base : lista.filter(o => !cat || o.categoria === cat);
      mostrar(pool[Math.floor(Math.random() * pool.length)]);
    }
    $('#outra').addEventListener('click', sortear);
    seletor.addEventListener('change', sortear);
    const pedido = new URLSearchParams(location.search).get('id');
    const inicial = lista.find(o => o.id === pedido);
    inicial ? mostrar(inicial) : sortear();
  }

  /* ---------- Devocionais anteriores ---------- */
  async function paginaAnteriores() {
    const alvo = $('#conteudo'), lista = $('#lista'), campo = $('#data'), msg = $('#msg');
    let hist;
    try { hist = await carregarJSON('data/historico.json'); }
    catch (_) { return erro(alvo, 'Não foi possível carregar o histórico agora. Tente novamente em alguns instantes.'); }
    if (!hist.length) return erro(alvo, 'Ainda não há devocionais anteriores.');
    campo.min = hist[hist.length - 1].data; campo.max = hist[0].data;

    function mostrar(data) {
      const item = hist.find(h => h.data === data);
      if (!item) { msg.textContent = 'Não há devocional publicado nesta data.'; return; }
      msg.textContent = '';
      campo.value = data;
      history.replaceState(null, '', '?d=' + data);
      lista.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', String(b.dataset.data === data)));
      alvo.replaceChildren(el('p', { class: 'data' }, dataExtenso(data)), el('div', { id: 'devo' }));
      renderDevocional($('#devo'), item.devocional, data, urlDaPagina('anteriores/', { d: data }));
    }
    hist.forEach(h => lista.append(el('li', {}, el('button', { type: 'button', 'data-data': h.data, onclick: () => { mostrar(h.data); alvo.scrollIntoView({ behavior: 'smooth' }); } },
      dataCurta(h.data), el('small', {}, h.devocional.titulo)))));
    campo.addEventListener('change', () => campo.value && mostrar(campo.value));
    const pedido = new URLSearchParams(location.search).get('d');
    mostrar(hist.some(h => h.data === pedido) ? pedido : hist[0].data);
  }

  ({ inicio: paginaInicial, oracao: paginaOracao, anteriores: paginaAnteriores }[PAGINA] || (() => {}))();
})();
