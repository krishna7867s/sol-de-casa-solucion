/**
 * Frontend Sol de Casa — Fase 2 (Pantallas 1 y 2)
 * - Pantalla 1: Ahorro a la vista y Postal para compartir (/api/familias/:token/ahorro, /api/familias/:token/compartir)
 * - Pantalla 2: Página de la vecina en 3 pasos (/api/vecino/tarjeta/:codigo_ref, /api/vecino/calculadora, /api/horarios, /api/vecino/agendar)
 */

const state = {
  tokenActual: 'fam_c9f8e7d6b5a4938271605f4e3d2c1b0a9f8e7d6c',
  datosFamilia: null,
  ultimoCodigoRef: 'ref_carmen_curridabat_01',
  ultimaVisitaVecinoId: null
};

// Navegación entre pantallas
const navTabs = document.querySelectorAll('.nav-ribbon-tab');
const secPantalla1 = document.getElementById('pantalla-1-familia');
const secPantalla2 = document.getElementById('pantalla-2-vecino');
const secPantalla3 = document.getElementById('pantalla-3-juego');
const secPantalla4 = document.getElementById('pantalla-4-andres');

// Elementos del DOM — Pantalla 1
const selectFamilia = document.getElementById('select-familia');
const btnReplayClouds = document.getElementById('btn-replay-clouds');
const famNombrePila = document.getElementById('fam-nombre-pila');
const famBarrio = document.getElementById('fam-barrio');
const ahorroMesEtiqueta = document.getElementById('ahorro-mes-etiqueta');
const ahorroMesMonto = document.getElementById('ahorro-mes-monto');
const reciboAntes = document.getElementById('recibo-antes');
const reciboDespues = document.getElementById('recibo-despues');
const ahorroAcumulado = document.getElementById('ahorro-acumulado');
const mesesInstaladosTxt = document.getElementById('meses-instalados-txt');
const kwhAcumulados = document.getElementById('kwh-acumulados');

// Elementos del DOM — Postal de Compartir (Pantalla 1)
const cartaWrapper = document.getElementById('postal-carta-interactiva');
const btnToggleCarta = document.getElementById('btn-toggle-carta');
const postalTituloFamilia = document.getElementById('postal-titulo-familia');
const postalMonto = document.getElementById('postal-monto');
const postalLinkPersonal = document.getElementById('postal-link-personal');
const btnCompartirWhatsapp = document.getElementById('btn-compartir-whatsapp');
const btnCopiarLink = document.getElementById('btn-copiar-link');
const btnAbrirComoVecino = document.getElementById('btn-abrir-como-vecino');
const feedbackCompartir = document.getElementById('feedback-compartir');
const tablaHistorialAhorro = document.getElementById('tabla-historial-ahorro');

// Elementos del DOM — Pantalla 2 (Página de la Vecina en 3 pasos)
const indPaso2 = document.getElementById('ind-paso-2');
const indPaso3 = document.getElementById('ind-paso-3');
const vecRefNombre = document.getElementById('vec-ref-nombre');
const vecRefBarrio = document.getElementById('vec-ref-barrio');
const vecRefMes = document.getElementById('vec-ref-mes');
const vecRefAhorroMes = document.getElementById('vec-ref-ahorro-mes');
const vecRefAhorroAcum = document.getElementById('vec-ref-ahorro-acum');
const vecRefMeses = document.getElementById('vec-ref-meses');
const vecRefFrase = document.getElementById('vec-ref-frase');
const vecAgendaRefNombre = document.getElementById('vec-agenda-ref-nombre');

// Calculadora honesta (Paso 2)
const formCalculadoraVecino = document.getElementById('form-calculadora-vecino');
const inputReciboVecino = document.getElementById('input-recibo-vecino');
const sliderReciboVecino = document.getElementById('slider-recibo-vecino');
const calcAhorroMes = document.getElementById('calc-ahorro-mes');
const calcAhorroAnual = document.getElementById('calc-ahorro-anual');
const calcNuevoRecibo = document.getElementById('calc-nuevo-recibo');
const calcReciboAnterior = document.getElementById('calc-recibo-anterior');
const calcAniosRecuperacion = document.getElementById('calc-anios-recuperacion');
const calcExplicacionHonesta = document.getElementById('calc-explicacion-honesta');

// Agenda directa (Paso 3)
const avisoCapacidadHorarios = document.getElementById('aviso-capacidad-horarios');
const gridHorariosDisponibles = document.getElementById('grid-horarios-disponibles');
const formAgendarVecino = document.getElementById('form-agendar-vecino');
const inputNombreVecino = document.getElementById('input-nombre-vecino');
const inputTelefonoVecino = document.getElementById('input-telefono-vecino');
const confirmacionReservaVecino = document.getElementById('confirmacion-reserva-vecino');

// Elementos del DOM — Pantalla 3 (El Juego y Recompensas <= $167 / $300)
const juegoNombreFamilia = document.getElementById('juego-nombre-familia');
const juegoEtapaActual = document.getElementById('juego-etapa-actual');
const juegoPorcentajeTxt = document.getElementById('juego-porcentaje-txt');
const juegoBarraFill = document.getElementById('juego-barra-fill');
const barraAvanceAria = document.getElementById('barra-avance-aria');
const gridHitosJuego = document.getElementById('grid-hitos-juego');
const listaReservasFamilia = document.getElementById('lista-reservas-familia');
const feedbackAvanceReserva = document.getElementById('feedback-avance-reserva');
const tablaCatalogoRecompensas = document.getElementById('tabla-catalogo-recompensas');
const reglaCostoVisitas = document.getElementById('regla-costo-visitas');
const reglaPresupuestoMax = document.getElementById('regla-presupuesto-max');
const reglaCacTotal = document.getElementById('regla-cac-total');
const reglaRecompensasActual = document.getElementById('regla-recompensas-actual');
const formValidarRecompensa = document.getElementById('form-validar-recompensa');
const testRecDisparador = document.getElementById('test-rec-disparador');
const testRecCosto = document.getElementById('test-rec-costo');
const resultadoValidadorRecompensa = document.getElementById('resultado-validador-recompensa');

// Elementos del DOM — Pantalla 4 (Panel de Andrés · Pieza 5)
const andresEmbCompartidas = document.getElementById('andres-emb-compartidas');
const andresEmbCalculadora = document.getElementById('andres-emb-calculadora');
const andresEmbAgendadas = document.getElementById('andres-emb-agendadas');
const andresEmbHechas = document.getElementById('andres-emb-hechas');
const andresEmbFirmadas = document.getElementById('andres-emb-firmadas');
const andresTasaCalc = document.getElementById('andres-tasa-calc');
const andresTasaAgenda = document.getElementById('andres-tasa-agenda');
const andresAlertaCapacidad = document.getElementById('andres-alerta-capacidad');
const andresVisAnuncios = document.getElementById('andres-vis-anuncios');
const andresVisReferidos = document.getElementById('andres-vis-referidos');
const andresVisTotales = document.getElementById('andres-vis-totales');
const andresCacRefTabla = document.getElementById('andres-cac-ref-tabla');
const btnResetDemo = document.getElementById('btn-reset-demo');

function formatearDolares(monto) {
  const num = Number(monto);
  if (Number.isInteger(num)) return `$${num.toLocaleString('es-CR')}`;
  return `$${num.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function mostrarPantalla(idPantalla) {
  const secciones = {
    'pantalla-1-familia': secPantalla1,
    'pantalla-2-vecino': secPantalla2,
    'pantalla-3-juego': secPantalla3,
    'pantalla-4-andres': secPantalla4
  };
  Object.entries(secciones).forEach(([key, sec]) => {
    if (!sec) return;
    sec.hidden = key !== idPantalla;
  });
  navTabs.forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.target === idPantalla);
  });

  if (idPantalla === 'pantalla-2-vecino') {
    cargarVistaVecino(state.ultimoCodigoRef);
  }
  if (idPantalla === 'pantalla-3-juego') {
    cargarPantallaJuego(state.tokenActual);
  }
  if (idPantalla === 'pantalla-4-andres') {
    cargarPanelAndres();
  }
}

/**
 * Carga el ahorro mensual y acumulado de la familia desde el Backend
 */
async function cargarAhorroFamilia(token) {
  try {
    const resp = await fetch(`/api/familias/${encodeURIComponent(token)}/ahorro`);
    if (!resp.ok) throw new Error('No se pudo cargar la información de la familia.');

    const data = await resp.json();
    state.tokenActual = token;
    state.datosFamilia = data;
    state.ultimoCodigoRef = data.link_compartir.codigo_ref;

    renderizarPantalla1(data);
    if (!secPantalla2.hidden) {
      cargarVistaVecino(state.ultimoCodigoRef);
    }
    if (secPantalla3 && !secPantalla3.hidden) {
      cargarPantallaJuego(state.tokenActual);
    }
  } catch (err) {
    console.error('Error al consultar API de ahorro:', err);
  }
}

function renderizarPantalla1(data) {
  const { familia, resumen_ahorro, link_compartir, historial_mensual } = data;

  famNombrePila.textContent = familia.nombre_pila;
  famBarrio.textContent = familia.barrio;

  ahorroMesEtiqueta.textContent = resumen_ahorro.mes_actual;
  ahorroMesMonto.textContent = `${formatearDolares(resumen_ahorro.ahorro_ultimo_mes)} este mes`;
  reciboAntes.textContent = formatearDolares(resumen_ahorro.recibo_antes_ultimo_mes);
  reciboDespues.textContent = formatearDolares(resumen_ahorro.recibo_despues_ultimo_mes);

  ahorroAcumulado.textContent = formatearDolares(resumen_ahorro.ahorro_acumulado_total);
  mesesInstaladosTxt.textContent = `en ${resumen_ahorro.meses_instalados} meses desde su instalación (simulado)`;
  kwhAcumulados.textContent = `${resumen_ahorro.kwh_solares_acumulados.toLocaleString('es-CR')} kWh`;

  const barrioCorto = familia.barrio.split(',')[0].replace('(simulado)', '').trim();
  postalTituloFamilia.textContent = `En la casa de ${familia.nombre_pila} en ${barrioCorto} (simulado)`;
  postalMonto.textContent = formatearDolares(resumen_ahorro.ahorro_ultimo_mes);
  postalLinkPersonal.textContent = `${window.location.origin}${link_compartir.url_relativa}`;

  const textoGatillo = document.getElementById('texto-gatillo-inversor');
  if (textoGatillo && data.gatillo_conductual_inversor) {
    textoGatillo.textContent = data.gatillo_conductual_inversor.alerta_inteligente;
  }

  // Actualizar Constelación del Barrio y Placa QR Solar del Portón (con QR REAL escaneable)
  const tituloConstelacion = document.getElementById('titulo-constelacion-barrio');
  const mapaNodoFamilia = document.getElementById('mapa-nodo-familia');
  if (tituloConstelacion) {
    tituloConstelacion.textContent = `Constelación Solar de ${barrioCorto} (simulado)`;
  }
  if (mapaNodoFamilia) {
    mapaNodoFamilia.textContent = `${familia.nombre_pila} ($${resumen_ahorro.ahorro_ultimo_mes}/mes)`;
  }
  cargarQRRealDesdeBackend(link_compartir.codigo_ref);

  tablaHistorialAhorro.innerHTML = '';
  for (const fila of historial_mensual) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fila.etiqueta_mes}</td>
      <td>${fila.kwh_producidos} kWh</td>
      <td>${formatearDolares(fila.recibo_antes)}</td>
      <td>${formatearDolares(fila.recibo_despues)}</td>
      <td><strong>${formatearDolares(fila.ahorro)}</strong></td>
    `;
    tablaHistorialAhorro.appendChild(tr);
  }
}

/**
 * Registra en el servidor que la familia compartió su tarjeta (POST /api/familias/:token/compartir)
 */
async function registrarComparticion(canal) {
  try {
    const resp = await fetch(`/api/familias/${encodeURIComponent(state.tokenActual)}/compartir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canal })
    });
    if (!resp.ok) throw new Error('Error al registrar compartición');

    const resultado = await resp.json();
    const codigoRef = resultado.comparticion.codigo_ref;
    state.ultimoCodigoRef = codigoRef;

    const urlCompleta = `${window.location.origin}/vecino/${codigoRef}`;
    postalLinkPersonal.textContent = urlCompleta;
    cartaWrapper.classList.add('is-open');
    cargarQRRealDesdeBackend(codigoRef);

    if (canal === 'WhatsApp') {
      const msg = state.datosFamilia
        ? `${state.datosFamilia.link_compartir.mensaje_whatsapp_sugerido} ${urlCompleta}`
        : `¡Hola vecina! Vea cuánto ahorramos en luz con Sol de Casa (simulado): ${urlCompleta}`;

      feedbackCompartir.hidden = false;
      feedbackCompartir.innerHTML = `
        ✦ <strong>¡Postal registrada en el sistema!</strong> Se generó su enlace personal <code>${codigoRef}</code> (simulado).<br/>
        Mensaje listo para WhatsApp: <em>«${msg}»</em>
      `;
    } else {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(urlCompleta).catch(() => {});
      }
      feedbackCompartir.hidden = false;
      feedbackCompartir.innerHTML = `
        ✧ <strong>¡Enlace personal copiado y registrado!</strong> (<code>${urlCompleta}</code> · simulado). Ya puede pegarlo en el grupo del barrio o mandárselo a su vecina.
      `;
    }
  } catch (err) {
    console.error(err);
  }
}

// ============================================================================
// PANTALLA 2: LÓGICA DE LA VECINA (POSTAL, CALCULADORA HONESTA Y AGENDA DIRECTA)
// ============================================================================
async function cargarVistaVecino(codigoRef) {
  try {
    // 1. Obtener la postal pública de la familia (GET /api/vecino/tarjeta/:codigo_ref)
    const respTarjeta = await fetch(`/api/vecino/tarjeta/${encodeURIComponent(codigoRef)}`);
    if (respTarjeta.ok) {
      const dataTarjeta = await respTarjeta.json();
      const p = dataTarjeta.postal_familia;
      vecRefNombre.textContent = p.nombre_pila;
      vecRefBarrio.textContent = p.barrio;
      vecRefMes.textContent = p.etiqueta_mes;
      vecRefAhorroMes.textContent = `${formatearDolares(p.ahorro_ultimo_mes)} ahorrados este mes`;
      vecRefAhorroAcum.textContent = formatearDolares(p.ahorro_acumulado);
      vecRefMeses.textContent = p.meses_ahorrando;
      vecRefFrase.textContent = p.frase_postal;
      vecAgendaRefNombre.textContent = p.nombre_pila;
    }

    // 2. Cargar horarios disponibles respetando la capacidad restante (GET /api/horarios)
    await cargarHorariosDisponibles();
  } catch (err) {
    console.error('Error al cargar la página de la vecina:', err);
  }
}

async function ejecutarCalculadoraVecino(reciboMensual) {
  const checkBateria = document.getElementById('check-bateria-vecino');
  const incluyeBateria = checkBateria ? checkBateria.checked : false;
  try {
    const resp = await fetch('/api/vecino/calculadora', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo_ref: state.ultimoCodigoRef,
        recibo_mensual: Number(reciboMensual),
        incluye_bateria: incluyeBateria
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      alert(data.error || 'Revise el monto ingresado.');
      return;
    }

    state.ultimaVisitaVecinoId = data.visita_vecino_id;
    indPaso2.classList.add('is-done');

    const r = data.resultado_calculadora;
    calcAhorroMes.textContent = `${formatearDolares(r.ahorro_mensual_estimado)} / mes`;
    calcAhorroAnual.textContent = `${formatearDolares(r.ahorro_anual_estimado)} al año`;
    calcNuevoRecibo.textContent = `${formatearDolares(r.recibo_nuevo_estimado)} / mes`;
    calcReciboAnterior.textContent = formatearDolares(r.recibo_ingresado);
    calcAniosRecuperacion.textContent = `${r.anios_recuperacion.toLocaleString('es-CR')} años`;
    calcExplicacionHonesta.textContent = r.explicacion_honesta;

    // Actualizar "El Espejo de los 15 Años" (180 meses)
    actualizarEspejo15Anios(r.recibo_ingresado, r.recibo_nuevo_estimado, r.costo_instalacion_referencia);
  } catch (err) {
    console.error('Error al calcular ahorro del vecino:', err);
  }
}

async function cargarHorariosDisponibles() {
  try {
    const resp = await fetch('/api/horarios');
    if (!resp.ok) return;
    const data = await resp.json();

    avisoCapacidadHorarios.textContent = `✦ ${data.capacidad.alerta}`;
    gridHorariosDisponibles.innerHTML = '';

    if (!data.horarios || data.horarios.length === 0) {
      gridHorariosDisponibles.innerHTML = `
        <p>Por este mes se completaron los espacios directos de los técnicos.</p>
      `;
      return;
    }

    data.horarios.forEach((h, idx) => {
      const label = document.createElement('label');
      label.className = 'slot-radio-card';
      label.innerHTML = `
        <input type="radio" name="horario_id" value="${h.id}" ${idx === 0 ? 'checked' : ''} required />
        <span><strong>${h.etiqueta_horario}</strong></span>
      `;
      gridHorariosDisponibles.appendChild(label);
    });
  } catch (err) {
    console.error('Error al cargar horarios:', err);
  }
}

async function agendarVisitaVecino(e) {
  e.preventDefault();
  const radioChecked = gridHorariosDisponibles.querySelector('input[name="horario_id"]:checked');
  if (!radioChecked) {
    alert('Por favor elija un horario disponible.');
    return;
  }

  const payload = {
    codigo_ref: state.ultimoCodigoRef,
    visita_vecino_id: state.ultimaVisitaVecinoId,
    nombre: inputNombreVecino.value.trim(),
    telefono: inputTelefonoVecino.value.trim(),
    horario_id: Number(radioChecked.value)
  };

  try {
    const resp = await fetch('/api/vecino/agendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();

    if (!resp.ok) {
      confirmacionReservaVecino.hidden = false;
      confirmacionReservaVecino.innerHTML = `<strong>Atención:</strong> ${data.error}`;
      return;
    }

    indPaso3.classList.add('is-done');
    confirmacionReservaVecino.hidden = false;

    const recTexto = (data.recompensas_activadas || [])
      .map(r => `${r.recompensa} ($${r.costo_sol_de_casa})`)
      .join(', ');

    confirmacionReservaVecino.innerHTML = `
      <h3 class="postcard-Script-heading" style="margin-bottom:4px;">¡Su visita quedó agendada!</h3>
      <p style="margin:4px 0;">
        <strong>Vecina/o:</strong> ${data.reserva.nombre_vecino} · <strong>Tel:</strong> ${data.reserva.telefono_vecino}<br/>
        <strong>Horario reservado:</strong> ${data.reserva.horario_elegido}<br/>
        <strong>Referido por:</strong> ${data.reserva.referido_por.nombre_pila} (${data.reserva.referido_por.barrio})
      </p>
      <p style="margin:8px 0 0; font-size:0.93rem;">
        ✦ <strong>Sin esperar 31 horas:</strong> El técnico ya tiene su cita en agenda y <strong>${data.reserva.referido_por.nombre_pila}</strong> acaba de recibir su recompensa por agenda: <em>${recTexto}</em>.
      </p>
    `;

    inputNombreVecino.value = '';
    inputTelefonoVecino.value = '';
    await cargarHorariosDisponibles();
  } catch (err) {
    console.error('Error al agendar visita:', err);
  }
}

/**
 * Permite repetir la animación de las nubes reales viajando desde las 4 esquinas al centro
 */
function repetirAnimacionNubes() {
  const ids = ['cloud-tl', 'cloud-tr', 'cloud-bl', 'cloud-br'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
  }
  if (typeof window.reiniciarNubesCanvas === 'function') {
    window.reiniciarNubesCanvas();
  }
}

/**
 * Motor en HTML5 Canvas de Nubes Reales Volumétricas de Amanecer:
 * 4 bancos de nubes multicapa nacen en las 4 esquinas de la pantalla,
 * viajan hacia el centro con física suave al entrar, y luego se abren
 * ligeramente dejando descubierto el halo solar.
 */
function iniciarMotorNubesRealesCanvas() {
  const canvas = document.getElementById('dawn-clouds-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  // Crear cúmulos volumétricos compuestos por múltiples esferas difusas con luz de amanecer
  function crearBancosDeEsquinas() {
    const esquinas = [
      // Esquina superior izquierda -> viaja hacia el centro-izquierda
      { startX: -0.18, startY: -0.15, targetX: 0.24, targetY: 0.24, tint: [253, 241, 238] },
      // Esquina superior derecha -> viaja hacia el centro-derecha
      { startX: 1.18, startY: -0.15, targetX: 0.76, targetY: 0.25, tint: [247, 232, 239] },
      // Esquina inferior izquierda -> viaja hacia el centro-abajo-izquierda
      { startX: -0.18, startY: 1.15, targetX: 0.26, targetY: 0.74, tint: [249, 229, 235] },
      // Esquina inferior derecha -> viaja hacia el centro-abajo-derecha
      { startX: 1.18, startY: 1.15, targetX: 0.74, targetY: 0.73, tint: [252, 238, 230] }
    ];

    return esquinas.map((cfg, idx) => {
      const puffs = [
        { ox: 0, oy: 0, r: 135, alpha: 0.42 },
        { ox: -75, oy: 18, r: 105, alpha: 0.36 },
        { ox: 80, oy: 15, r: 110, alpha: 0.36 },
        { ox: -35, oy: -28, r: 95, alpha: 0.40 },
        { ox: 42, oy: -24, r: 90, alpha: 0.38 },
        { ox: -125, oy: 32, r: 80, alpha: 0.28 },
        { ox: 128, oy: 28, r: 82, alpha: 0.28 }
      ];
      return {
        ...cfg,
        progress: 0,
        speed: 0.0048 + idx * 0.0004,
        phase: idx * 1.4,
        puffs
      };
    });
  }

  let bancos = crearBancosDeEsquinas();
  window.reiniciarNubesCanvas = () => {
    bancos = crearBancosDeEsquinas();
  };

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animar(timestamp) {
    ctx.clearRect(0, 0, width, height);
    const tSec = (timestamp || 0) * 0.001;

    for (const b of bancos) {
      if (b.progress < 1) {
        b.progress = Math.min(1, b.progress + b.speed);
      }
      const e = easeOutCubic(b.progress);

      // Posición interpolada desde la esquina hasta el centro + respiración suave continua
      const driftX = Math.sin(tSec * 0.35 + b.phase) * 18;
      const driftY = Math.cos(tSec * 0.28 + b.phase) * 9;
      const cx = (b.startX + (b.targetX - b.startX) * e) * width + driftX;
      const cy = (b.startY + (b.targetY - b.startY) * e) * height + driftY;

      for (const p of b.puffs) {
        const px = cx + p.ox;
        const py = cy + p.oy;
        const grad = ctx.createRadialGradient(px, py - p.r * 0.2, p.r * 0.1, px, py, p.r);
        const [r, g, bl] = b.tint;
        grad.addColorStop(0, `rgba(255, 250, 242, ${p.alpha * e})`);
        grad.addColorStop(0.55, `rgba(${r}, ${g}, ${bl}, ${p.alpha * 0.72 * e})`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    requestAnimationFrame(animar);
  }

  requestAnimationFrame(animar);
}

/**
 * Obtiene del Backend un código QR REAL (estándar ISO/IEC 18004) que cualquier
 * cámara de teléfono puede escanear para abrir la postal del vecino (/vecino/:codigo_ref)
 */
async function cargarQRRealDesdeBackend(codigoRef) {
  const qrContainer = document.getElementById('qr-svg-container');
  const qrUrlLabel = document.getElementById('qr-url-label');
  const qrExternalLink = document.getElementById('qr-external-link');
  if (!qrContainer) return;

  try {
    const resp = await fetch(`/api/qr/${encodeURIComponent(codigoRef)}`);
    if (!resp.ok) throw new Error('Error al generar QR real');
    const data = await resp.json();

    qrContainer.innerHTML = data.svg;
    if (qrUrlLabel) {
      qrUrlLabel.textContent = `Escaneable: ${data.url_escaneable}`;
    }
    if (qrExternalLink) {
      qrExternalLink.href = 'https://myqrcode.com/create?gclid=CjwKCAiAkrbXBhB2EiwA2y1E3uMhjjXK5s-fjIsZwA0yySSDcaO9PCu7dOcZ7Ej31lhGKsrUAimkphoCYd8QAvD_BwE&utm_source=google&utm_medium=cpc&utm_campaign=23294628420&utm_content=188474331799&utm_term=generator%20qr&matchtype=b&device=c&gad_source=1&gad_campaignid=23294628420&gbraid=0AAAABCH7ttXif9BpJderaOFIbwW1L410C';
    }
  } catch (err) {
    console.error('Error cargando QR real:', err);
  }
}

/**
 * Actualiza el comparador "El Espejo de los 15 Años" en la Pantalla 2
 */
function actualizarEspejo15Anios(reciboActual, reciboNuevo, costoInstalacion) {
  const espejoBase = document.getElementById('espejo-recibo-base');
  const espejoSinPaneles = document.getElementById('espejo-gasto-sin-paneles');
  const espejoGanancia = document.getElementById('espejo-ganancia-neta');
  const espejoBarraSolar = document.getElementById('espejo-barra-solar');
  if (!espejoBase || !espejoSinPaneles || !espejoGanancia || !espejoBarraSolar) return;

  const gasto15AniosSinPaneles = Math.round(reciboActual * 12 * 15);
  const gasto15AniosConPaneles = Math.round(costoInstalacion + reciboNuevo * 12 * 15);
  const ahorroNetoLibre = gasto15AniosSinPaneles - gasto15AniosConPaneles;
  const pctBarra = Math.min(95, Math.max(25, Math.round((gasto15AniosConPaneles / gasto15AniosSinPaneles) * 100)));

  espejoBase.textContent = `${formatearDolares(reciboActual)}/mes`;
  espejoSinPaneles.textContent = `${formatearDolares(gasto15AniosSinPaneles)} se van en recibos de luz`;
  espejoGanancia.textContent = ahorroNetoLibre > 0
    ? `¡Se quedan ${formatearDolares(ahorroNetoLibre)} libres en su casa! (ya descontados los $6.500)`
    : `Costo total en 15 años: ${formatearDolares(gasto15AniosConPaneles)}`;
  espejoBarraSolar.style.width = `${pctBarra}%`;
}

// Eventos de navegación
navTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    mostrarPantalla(tab.dataset.target);
  });
});

if (btnAbrirComoVecino) {
  btnAbrirComoVecino.addEventListener('click', () => {
    mostrarPantalla('pantalla-2-vecino');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// Eventos Pantalla 1
selectFamilia.addEventListener('change', (e) => {
  feedbackCompartir.hidden = true;
  confirmacionReservaVecino.hidden = true;
  cargarAhorroFamilia(e.target.value);
});

btnReplayClouds.addEventListener('click', () => {
  repetirAnimacionNubes();
});

btnToggleCarta.addEventListener('click', () => {
  cartaWrapper.classList.toggle('is-open');
});

btnCompartirWhatsapp.addEventListener('click', () => {
  registrarComparticion('WhatsApp');
});

btnCopiarLink.addEventListener('click', () => {
  registrarComparticion('Publicacion');
});

// Eventos Pantalla 2 (Calculadora y Agenda)
sliderReciboVecino.addEventListener('input', (e) => {
  inputReciboVecino.value = e.target.value;
});

inputReciboVecino.addEventListener('input', (e) => {
  const val = Number(e.target.value);
  if (val >= 40 && val <= 350) {
    sliderReciboVecino.value = val;
  }
});

formCalculadoraVecino.addEventListener('submit', (e) => {
  e.preventDefault();
  ejecutarCalculadoraVecino(inputReciboVecino.value);
});

const checkBateriaVecino = document.getElementById('check-bateria-vecino');
if (checkBateriaVecino) {
  checkBateriaVecino.addEventListener('change', () => {
    ejecutarCalculadoraVecino(inputReciboVecino.value);
  });
}

formAgendarVecino.addEventListener('submit', agendarVisitaVecino);

// ============================================================================
// PANTALLA 3: EL JUEGO Y RECOMPENSAS DE LA FAMILIA (PIEZA 4 · TOPE ≈ $167 / $300)
// ============================================================================
async function cargarPantallaJuego(token) {
  try {
    const [respProg, respCat] = await Promise.all([
      fetch(`/api/familias/${encodeURIComponent(token)}/recompensas`),
      fetch('/api/recompensas/catalogo')
    ]);

    if (respProg.ok) {
      const dataProg = await respProg.json();
      renderizarProgresoFamilia(dataProg);
    }
    if (respCat.ok) {
      const dataCat = await respCat.json();
      renderizarCatalogoRecompensas(dataCat);
    }
  } catch (err) {
    console.error('Error al cargar pantalla de recompensas:', err);
  }
}

function renderizarProgresoFamilia(data) {
  const { familia, barra_avance, reservas_vecinos } = data;

  juegoNombreFamilia.textContent = `${familia.nombre_completo} · ${familia.barrio}`;
  juegoEtapaActual.textContent = barra_avance.etapa_actual;
  juegoPorcentajeTxt.textContent = `${barra_avance.porcentaje} %`;
  juegoBarraFill.style.width = `${barra_avance.porcentaje}%`;
  barraAvanceAria.setAttribute('aria-valuenow', String(barra_avance.porcentaje));

  // Hitos de la barra de avance (sin niveles inventados)
  gridHitosJuego.innerHTML = '';
  for (const h of barra_avance.hitos) {
    const div = document.createElement('div');
    div.className = `milestone-card ${h.completado ? 'is-completed' : ''}`;
    div.innerHTML = `
      <span class="milestone-step-badge">Paso ${h.paso} · ${h.completado ? 'Completado ✦' : 'Pendiente'}</span>
      <strong class="milestone-title">${h.titulo}</strong>
      <span class="milestone-reward-desc">${h.recompensa}</span>
    `;
    gridHitosJuego.appendChild(div);
  }

  // Lista de reservas de vecinos con botones en vivo para avanzar a 'hecha' o 'firmada'
  listaReservasFamilia.innerHTML = '';
  if (!reservas_vecinos || reservas_vecinos.length === 0) {
    listaReservasFamilia.innerHTML = `
      <p style="text-align:center;">Aún no hay visitas agendadas por vecinos de esta casa. Puede agendar una en la Pestaña 2.</p>
    `;
    return;
  }

  for (const r of reservas_vecinos) {
    const item = document.createElement('div');
    item.className = 'referral-item-card';

    let botonesAccion = '';
    if (r.estado === 'agendada') {
      botonesAccion = `
        <button type="button" class="pearl-mini-btn btn-avanzar-estado" data-id="${r.id}" data-estado="hecha">
          Marcar Visita Hecha
        </button>
        <button type="button" class="pearl-mini-btn btn-avanzar-estado" data-id="${r.id}" data-estado="firmada">
          ✦ Simular Firma y Desbloquear Limpieza ($60)
        </button>
      `;
    } else if (r.estado === 'hecha') {
      botonesAccion = `
        <button type="button" class="pearl-mini-btn btn-avanzar-estado" data-id="${r.id}" data-estado="firmada">
          ✦ Simular Firma y Desbloquear Limpieza ($60)
        </button>
      `;
    } else {
      botonesAccion = `<span style="font-size:0.88rem; font-weight:700; color:#344b2e;">✓ Limpieza Solar ($60) desbloqueada</span>`;
    }

    item.innerHTML = `
      <div>
        <strong>${r.nombre_vecino}</strong>
        <span class="referral-status-pill estado-${r.estado}">${r.estado}</span><br/>
        <span style="font-size:0.9rem; color:var(--ink-Warm-muted);">Horario: ${r.horario_elegido}</span>
      </div>
      <div class="referral-actions">
        ${botonesAccion}
      </div>
    `;
    listaReservasFamilia.appendChild(item);
  }

  // Conectar botones de demostración en vivo (POST /api/demo/reservas/:id/avanzar)
  listaReservasFamilia.querySelectorAll('.btn-avanzar-estado').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const estado = btn.dataset.estado;
      await avanzarReservaDemo(id, estado);
    });
  });
}

async function avanzarReservaDemo(idReserva, nuevoEstado) {
  try {
    const resp = await fetch(`/api/demo/reservas/${encodeURIComponent(idReserva)}/avanzar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevoEstado })
    });
    const data = await resp.json();
    if (!resp.ok) {
      alert(data.error || 'No se pudo actualizar la reserva.');
      return;
    }

    feedbackAvanceReserva.hidden = false;
    feedbackAvanceReserva.innerHTML = `✦ <strong>${data.mensaje}</strong>`;
    await cargarPantallaJuego(state.tokenActual);
  } catch (err) {
    console.error('Error al avanzar reserva:', err);
  }
}

function renderizarCatalogoRecompensas(dataCat) {
  reglaCostoVisitas.textContent = formatearDolares(dataCat.costo_visitas_por_venta_referida);
  reglaPresupuestoMax.textContent = formatearDolares(dataCat.presupuesto_real_maximo_recompensas);
  reglaCacTotal.textContent = formatearDolares(dataCat.cac_referido_total_calculado);
  reglaRecompensasActual.textContent = formatearDolares(dataCat.costo_recompensas_actual_por_venta);

  tablaCatalogoRecompensas.innerHTML = '';
  for (const r of dataCat.recompensas) {
    const tr = document.createElement('tr');
    const etiquetaDisparador = r.disparador === 'agendar'
      ? 'Al agendar visita'
      : 'Al firmar contrato';
    const etiquetaReceptor = r.quien_recibe === 'familia'
      ? 'Familia que refiere'
      : 'Vecina/o que instala';

    tr.innerHTML = `
      <td><strong>${r.nombre}</strong></td>
      <td>${etiquetaReceptor}</td>
      <td>${etiquetaDisparador}</td>
      <td>${formatearDolares(r.costo_sol_de_casa)}</td>
      <td>×${Number(r.multiplicador_embudo).toFixed(2).replace('.', ',')}</td>
      <td><strong>${formatearDolares(r.costo_por_venta_calculado)}</strong></td>
    `;
    tablaCatalogoRecompensas.appendChild(tr);
  }

  // Fila resumen en la tabla
  const trTotal = document.createElement('tr');
  trTotal.style.background = '#f4e5d2';
  trTotal.innerHTML = `
    <td colspan="5"><strong>Subtotal Recompensas por Venta Cerrada (tope real disponible: $166,67 ≈ $167)</strong></td>
    <td><strong>${formatearDolares(dataCat.costo_recompensas_actual_por_venta)}</strong></td>
  `;
  tablaCatalogoRecompensas.appendChild(trTotal);

  const trCac = document.createElement('tr');
  trCac.style.background = '#e7efe4';
  trCac.innerHTML = `
    <td colspan="5"><strong>COSTO TOTAL POR VENTA REFERIDA (2,22 visitas = $133,33 + Recompensas ≤ $300 Regla de Andrés)</strong></td>
    <td><strong>${formatearDolares(dataCat.cac_referido_total_calculado)}</strong></td>
  `;
  tablaCatalogoRecompensas.appendChild(trCac);
}

if (formValidarRecompensa) {
  formValidarRecompensa.addEventListener('submit', async (e) => {
    e.preventDefault();
    const disparador = testRecDisparador.value;
    const costo = Number(testRecCosto.value);

    try {
      const resp = await fetch('/api/recompensas/validar-o-agregar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: 'Prueba de tope en servidor',
          disparador,
          costo_sol_de_casa: costo,
          persistir: false
        })
      });
      const data = await resp.json();
      resultadoValidadorRecompensa.hidden = false;

      if (!resp.ok) {
        resultadoValidadorRecompensa.className = 'validator-response-box is-rejected';
        const d = data.detalle_calculo;
        resultadoValidadorRecompensa.innerHTML = `
          <strong>❌ ${data.error}</strong><br/>
          <span>Cuenta del servidor: $${d.costo_unitario_ingresado} al <em>${d.disparador}</em> × ${d.multiplicador_aplicado} = <strong>$${d.costo_por_venta_de_esta_recompensa}</strong> adicionales por venta cerrada. Sumado a las recompensas actuales ($${d.recompensas_actuales_por_venta}) y a las visitas ($${d.costo_visitas_por_venta}), el CAC subiría a <strong>$${d.nuevo_cac_total_referido}</strong> (supera los $300).</span>
        `;
      } else {
        resultadoValidadorRecompensa.className = 'validator-response-box is-approved';
        const s = data.simulacion;
        resultadoValidadorRecompensa.innerHTML = `
          <strong>✓ ${data.mensaje}</strong><br/>
          <span>Cuenta del servidor: Esta recompensa suma <strong>$${s.costo_por_venta_nueva_recompensa}</strong> por venta cerrada, dejando el CAC referido total en <strong>$${s.nuevo_cac_total_referido}</strong> (dentro de los $${s.tope_andres}).</span>
        `;
      }
    } catch (err) {
      console.error('Error al validar recompensa:', err);
    }
  });
}

// ============================================================================
// PANTALLA 4: PANEL DE ANDRÉS (PIEZA 5 · LA MEDICIÓN CON DATOS SIMULADOS)
// ============================================================================
async function cargarPanelAndres() {
  try {
    const resp = await fetch('/api/andres/panel');
    if (!resp.ok) return;
    const data = await resp.json();

    const emb = data.embudo_referidos_en_vivo;
    andresEmbCompartidas.textContent = emb.tarjetas_compartidas;
    andresEmbCalculadora.textContent = emb.vecinos_usaron_calculadora;
    andresEmbAgendadas.textContent = emb.vecinos_agendaron_visita;
    andresEmbHechas.textContent = emb.visitas_tecnicas_hechas;
    andresEmbFirmadas.textContent = emb.instalaciones_firmadas;

    andresTasaCalc.textContent = `${emb.tasas_conversion_simuladas.compartida_a_calculadora_pct.toLocaleString('es-CR')} % de postales`;
    andresTasaAgenda.textContent = `${emb.tasas_conversion_simuladas.calculadora_a_agenda_pct.toLocaleString('es-CR')} % sin esperar 31h`;

    const cap = data.capacidad_visitas;
    andresAlertaCapacidad.textContent = `✦ ${cap.alerta_capacidad}`;
    andresAlertaCapacidad.classList.toggle('is-over-capacity', Boolean(cap.supera_capacidad_100));

    andresVisAnuncios.textContent = cap.visitas_anuncios_estimadas_mes.toLocaleString('es-CR');
    andresVisReferidos.textContent = cap.visitas_referidos_pedidas_mes.toLocaleString('es-CR');
    andresVisTotales.textContent = `${cap.visitas_totales_pedidas_mes.toLocaleString('es-CR')} / ${cap.capacidad_maxima_mensual}`;

    const econ = data.economia_y_regla_300;
    andresCacRefTabla.textContent = formatearDolares(econ.cac_referido_esperado_modelo);
  } catch (err) {
    console.error('Error al cargar el Panel de Andrés:', err);
  }
}

if (btnResetDemo) {
  btnResetDemo.addEventListener('click', async () => {
    try {
      const resp = await fetch('/api/demo/reset', { method: 'POST' });
      if (resp.ok) {
        await cargarAhorroFamilia(state.tokenActual);
        await cargarPanelAndres();
      }
    } catch (err) {
      console.error('Error al reiniciar demo:', err);
    }
  });
}

// Simulador interactivo de Arbitraje de Capacidad y 3er Técnico (Panel de Andrés)
const sliderFamiliasActivas = document.getElementById('slider-familias-activas');
const simNumFamilias = document.getElementById('sim-num-familias');
const simVisitasGeneradas = document.getElementById('sim-visitas-generadas');
const simGananciaArbitraje = document.getElementById('sim-ganancia-arbitraje');
const simVeredictoTecnico = document.getElementById('sim-veredicto-tecnico');
const simNotaTecnico = document.getElementById('sim-nota-tecnico');

function actualizarSimuladorArbitraje(familiasCompartiendo) {
  if (!simNumFamilias) return;
  const fams = Number(familiasCompartiendo);
  const pctCartera = Math.round((fams / 420) * 100);
  // Rendimiento probado del letrero: 0.30 leads por casa en 2 meses; 0.72675 visitas por lead
  const leadsBimestre = Number((fams * 0.30).toFixed(1));
  const visitasBimestre = Number((leadsBimestre * 0.72675).toFixed(1));
  // Cada visita de referido ($671.25) que sustituye 1 visita de Meta ($232.50) deja +$438.75 de valor neto
  const visitasQueDesplazanMeta = Math.min(visitasBimestre, 57.75);
  const gananciaExtra = Math.round(visitasQueDesplazanMeta * (671.25 - 232.50));
  const pctTecnico50 = Math.round((visitasBimestre / 50) * 100);

  simNumFamilias.textContent = `${fams} familias (${pctCartera} % de las 420)`;
  simVisitasGeneradas.textContent = `${leadsBimestre.toLocaleString('es-CR')} leads → ${visitasBimestre.toLocaleString('es-CR')} visitas`;
  simGananciaArbitraje.textContent = `+$${gananciaExtra.toLocaleString('es-CR')}`;

  if (visitasBimestre >= 50) {
    simVeredictoTecnico.textContent = `¡SÍ! Llena las 50 visitas (${pctTecnico50} %)`;
    simNotaTecnico.textContent = `Con ≥ 230 familias (55 %) ya se pagan solos los $1.800 del técnico nuevo`;
  } else {
    simVeredictoTecnico.textContent = `Todavía no (${pctTecnico50} % de 50)`;
    simNotaTecnico.textContent = `Conviene desplazar visitas de Meta antes de sumar $1.800 de gasto fijo`;
  }
}

if (sliderFamiliasActivas) {
  sliderFamiliasActivas.addEventListener('input', (e) => {
    actualizarSimuladorArbitraje(e.target.value);
  });
}

// Inicializar al abrir la página
document.addEventListener('DOMContentLoaded', () => {
  iniciarMotorNubesRealesCanvas();
  actualizarSimuladorArbitraje(80);

  // Si la URL es /vecino/:codigo_ref, abrir directamente la Pantalla 2 como vecina
  const matchVecino = window.location.pathname.match(/^\/vecino\/([a-zA-Z0-9_-]+)$/);
  if (matchVecino && matchVecino[1]) {
    state.ultimoCodigoRef = matchVecino[1];
    mostrarPantalla('pantalla-2-vecino');
  } else {
    cargarAhorroFamilia(state.tokenActual);
  }
});
