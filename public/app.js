"use strict";

const vistas = ["inicio", "registro", "acceso", "laboratorio", "documentacion", "guia"];
let sesion = { activa: false };
let documentacionLista = false;

const $ = (selector) => document.querySelector(selector);

function evaluarClave(clave) {
  return {
    longitud: clave.length >= 10,
    letras: /\p{L}/u.test(clave),
    numero: /\d/.test(clave),
    especial: /[^A-Za-z0-9]/.test(clave),
  };
}

function pintarRequisitos(clave) {
  const estado = evaluarClave(clave);
  for (const item of document.querySelectorAll("#requisitos-clave li")) {
    item.classList.toggle("cumple", Boolean(estado[item.dataset.req]));
  }
}

function mostrarErrores(id, errores) {
  const caja = $(id);
  caja.replaceChildren();
  if (!errores || errores.length === 0) {
    caja.hidden = true;
    return;
  }
  for (const texto of errores) {
    const li = document.createElement("li");
    li.textContent = texto;
    caja.append(li);
  }
  caja.hidden = false;
}

async function api(ruta, { method = "GET", cuerpo } = {}) {
  const respuesta = await fetch(ruta, {
    method,
    headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error("solicitud");
    error.errores = datos.errores || ["No se pudo completar la operación."];
    throw error;
  }
  return datos;
}

function anotar(texto) {
  const li = document.createElement("li");
  const hora = new Date().toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  li.textContent = `${hora}  ${texto}`;
  $("#bitacora").append(li);
}

function pintarSesion() {
  const caja = $("#caja-sesion");
  caja.replaceChildren();
  if (!sesion.activa) {
    caja.textContent = "Sin sesión";
    return;
  }
  const nombre = document.createElement("strong");
  nombre.textContent = sesion.nombre;
  const detalle = document.createElement("span");
  detalle.textContent = `${sesion.correo} · ${formatearCelular(sesion.celular)}`;
  const salir = document.createElement("button");
  salir.type = "button";
  salir.className = "secundario";
  salir.textContent = "Cerrar sesión";
  salir.addEventListener("click", cerrarSesion);
  caja.append(nombre, detalle, salir);
}

function formatearCelular(numero) {
  return String(numero).replace(/(\d{2})(\d{4})(\d{4})/, "$1 $2 $3");
}

function mostrar(vista) {
  if (vista === "laboratorio" && !sesion.activa) {
    mostrar("acceso");
    mostrarErrores("#errores-acceso", ["Entra con tu cuenta para usar el laboratorio DSA."]);
    return;
  }
  for (const nombre of vistas) {
    $(`#vista-${nombre}`).hidden = nombre !== vista;
  }
  for (const boton of document.querySelectorAll(".menu button")) {
    if (boton.dataset.vista === vista) boton.setAttribute("aria-current", "page");
    else boton.removeAttribute("aria-current");
  }
  if (vista === "laboratorio") prepararLaboratorio();
  if (vista === "documentacion") cargarDocumentacion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function limpiarLaboratorio() {
  $("#panel-claves").hidden = true;
  $("#mensaje").value = "";
  $("#btn-firmar").disabled = true;
  $("#btn-verificar").disabled = true;
  $("#btn-alterar").disabled = true;
  $("#estado-generar").textContent = "";
  $("#hash-actual").textContent = "—";
  $("#hash-original").textContent = "—";
  $("#r-hex").textContent = "—";
  $("#s-hex").textContent = "—";
  $("#rango").textContent = "";
  $("#bitacora").replaceChildren();
  pintarSello("espera", "Sin\nverificar");
  mostrarErrores("#errores-lab", []);
}

function prepararLaboratorio() {
  const usuario = `${sesion.nombre} · ${sesion.correo} · ${formatearCelular(sesion.celular)}`;
  $("#lab-usuario").textContent = usuario;
  if (sesion.claves) pintarClaves(sesion.claves.parametros);
  if (sesion.claves && sesion.claves.ultimaFirma && !$("#mensaje").value) {
    $("#mensaje").value = sesion.claves.ultimaFirma.mensaje;
    pintarFirma(sesion.claves.ultimaFirma);
  }
}

function pintarClaves(parametros) {
  $("#panel-claves").hidden = false;
  $("#p-bits").textContent = String(parametros.pBits);
  $("#q-bits").textContent = String(parametros.qBits);
  $("#oid").textContent = parametros.oid;
  $("#huella").textContent = parametros.huella;
  $("#y-hex").textContent = parametros.yHex;
  $("#x-muestra").textContent = parametros.xMuestra;
  $("#x-bits").textContent = `${parametros.xBits} bits. Relación y = g^x mod p comprobada en el servidor.`;
  $("#p-hex").textContent = parametros.pHex;
  $("#q-hex").textContent = parametros.qHex;
  $("#g-hex").textContent = parametros.gHex;
  $("#pem-publica").textContent = parametros.publicaPem;
  $("#btn-firmar").disabled = false;
}

function pintarFirma(firma) {
  $("#hash-original").textContent = firma.hashHex;
  $("#r-hex").textContent = firma.rHex;
  $("#s-hex").textContent = firma.sHex;
  $("#rango").textContent = firma.rangoValido
    ? "r y s están entre 1 y q − 1."
    : "";
  $("#btn-verificar").disabled = false;
  $("#btn-alterar").disabled = false;
}

function pintarSello(tipo, texto) {
  const sello = $("#sello");
  sello.className = `sello ${tipo}`;
  sello.replaceChildren();
  for (const linea of texto.split("\n")) {
    sello.append(linea, document.createElement("br"));
  }
  if (sello.lastChild) sello.lastChild.remove();
}

async function cerrarSesion() {
  await api("/api/salir", { method: "POST" });
  sesion = { activa: false };
  limpiarLaboratorio();
  pintarSesion();
  mostrar("inicio");
}

async function cargarDocumentacion() {
  if (documentacionLista) return;
  const datos = await api("/api/documentacion");
  $("#cuerpo-documentacion").innerHTML = markdownAHtml(datos.markdown);
  documentacionLista = true;
}

function escapar(texto) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(texto) {
  return escapar(texto)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function markdownAHtml(markdown) {
  const lineas = markdown.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let enCodigo = false;
  let codigo = [];
  let lista = null;

  const cerrarLista = () => {
    if (!lista) return;
    html += lista === "ol" ? "</ol>" : "</ul>";
    lista = null;
  };

  for (const linea of lineas) {
    if (linea.startsWith("```")) {
      if (enCodigo) {
        html += `<pre><code>${escapar(codigo.join("\n"))}</code></pre>`;
        codigo = [];
        enCodigo = false;
      } else {
        cerrarLista();
        enCodigo = true;
      }
      continue;
    }
    if (enCodigo) {
      codigo.push(linea);
      continue;
    }
    if (linea.trim() === "") {
      cerrarLista();
      continue;
    }
    if (linea.startsWith("### ")) {
      cerrarLista();
      html += `<h3>${inline(linea.slice(4))}</h3>`;
      continue;
    }
    if (linea.startsWith("## ")) {
      cerrarLista();
      html += `<h2>${inline(linea.slice(3))}</h2>`;
      continue;
    }
    if (linea.startsWith("# ")) {
      cerrarLista();
      html += `<h2>${inline(linea.slice(2))}</h2>`;
      continue;
    }
    const vineta = linea.match(/^- (.*)$/);
    if (vineta) {
      if (lista !== "ul") {
        cerrarLista();
        html += "<ul>";
        lista = "ul";
      }
      html += `<li>${inline(vineta[1])}</li>`;
      continue;
    }
    const numerada = linea.match(/^\d+\. (.*)$/);
    if (numerada) {
      if (lista !== "ol") {
        cerrarLista();
        html += "<ol>";
        lista = "ol";
      }
      html += `<li>${inline(numerada[1])}</li>`;
      continue;
    }
    cerrarLista();
    html += `<p>${inline(linea)}</p>`;
  }
  if (enCodigo) html += `<pre><code>${escapar(codigo.join("\n"))}</code></pre>`;
  cerrarLista();
  return html;
}

function tomarRegistro() {
  return {
    nombre: $("#nombre").value,
    correo: $("#correo").value,
    celular: $("#celular").value,
    clave: $("#clave").value,
  };
}

$("#clave").addEventListener("input", (evento) => pintarRequisitos(evento.target.value));

$("#celular").addEventListener("input", (evento) => {
  evento.target.value = evento.target.value.replace(/\D/g, "").slice(0, 10);
});

$("#btn-ejemplo").addEventListener("click", () => {
  $("#nombre").value = "Mariana Solís";
  $("#correo").value = "equipo2@sello-dsa.dev";
  $("#celular").value = "5512345678";
  $("#clave").value = "Equipo2-DSA";
  pintarRequisitos($("#clave").value);
  mostrarErrores("#errores-registro", []);
});

$("#btn-vaciar").addEventListener("click", () => {
  $("#form-registro").reset();
  pintarRequisitos("");
  mostrarErrores("#errores-registro", []);
});

$("#form-registro").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const boton = evento.target.querySelector("button[type=submit]");
  boton.disabled = true;
  try {
    sesion = await api("/api/registro", { method: "POST", cuerpo: tomarRegistro() });
    limpiarLaboratorio();
    pintarSesion();
    anotar("Cuenta creada. La clave de acceso quedó guardada con scrypt, no en texto plano.");
    mostrar("laboratorio");
  } catch (error) {
    mostrarErrores("#errores-registro", error.errores);
  } finally {
    boton.disabled = false;
  }
});

$("#form-acceso").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const boton = evento.target.querySelector("button[type=submit]");
  boton.disabled = true;
  try {
    sesion = await api("/api/acceso", {
      method: "POST",
      cuerpo: {
        correo: $("#correo-acceso").value,
        clave: $("#clave-acceso").value,
      },
    });
    limpiarLaboratorio();
    pintarSesion();
    anotar("Sesión iniciada.");
    mostrar("laboratorio");
  } catch (error) {
    mostrarErrores("#errores-acceso", error.errores);
  } finally {
    boton.disabled = false;
  }
});

$("#btn-generar").addEventListener("click", async () => {
  const boton = $("#btn-generar");
  boton.disabled = true;
  $("#estado-generar").textContent = "Generando los primos p y q (2048 bits)…";
  mostrarErrores("#errores-lab", []);
  try {
    const datos = await api("/api/claves", { method: "POST" });
    sesion.claves = { parametros: datos.parametros, creada: datos.creada, ultimaFirma: null };
    pintarClaves(datos.parametros);
    pintarSello("espera", "Sin\nverificar");
    $("#hash-actual").textContent = "—";
    $("#hash-original").textContent = "—";
    $("#r-hex").textContent = "—";
    $("#s-hex").textContent = "—";
    $("#rango").textContent = "";
    $("#btn-verificar").disabled = true;
    $("#btn-alterar").disabled = true;
    $("#estado-generar").textContent = "Par generado. y = g^x mod p ya fue comprobada.";
    anotar(`Claves DSA de ${datos.parametros.pBits} bits. La privada x permanece en el servidor.`);
  } catch (error) {
    $("#estado-generar").textContent = "";
    mostrarErrores("#errores-lab", error.errores);
  } finally {
    boton.disabled = false;
  }
});

$("#btn-ejemplo-mensaje").addEventListener("click", () => {
  $("#mensaje").value = "El equipo 2 entrega el acta firmada con DSA. Ciudad de México.";
});

$("#btn-firmar").addEventListener("click", async () => {
  mostrarErrores("#errores-lab", []);
  const boton = $("#btn-firmar");
  boton.disabled = true;
  try {
    const firma = await api("/api/firmar", {
      method: "POST",
      cuerpo: { mensaje: $("#mensaje").value },
    });
    sesion.claves.ultimaFirma = firma;
    pintarFirma(firma);
    $("#hash-actual").textContent = firma.hashHex;
    pintarSello("espera", "Firmado\nsin verificar");
    anotar(`Mensaje firmado. r y s listos (${firma.bytesMensaje} bytes UTF-8).`);
  } catch (error) {
    mostrarErrores("#errores-lab", error.errores);
  } finally {
    boton.disabled = false;
  }
});

async function verificar(alterado) {
  mostrarErrores("#errores-lab", []);
  const resultado = await api("/api/verificar", {
    method: "POST",
    cuerpo: { mensaje: $("#mensaje").value },
  });
  $("#hash-actual").textContent = resultado.hashMensaje;
  $("#hash-original").textContent = resultado.hashOriginal;
  if (resultado.valida) {
    pintarSello("valido", "Válido");
    anotar("Verificación correcta: v = r.");
  } else {
    pintarSello("invalido", "Inválido");
    anotar(alterado
      ? "El mensaje fue alterado y DSA rechazó el sello."
      : "La firma no corresponde a este mensaje.");
  }
}

$("#btn-verificar").addEventListener("click", async () => {
  try {
    await verificar(false);
  } catch (error) {
    mostrarErrores("#errores-lab", error.errores);
  }
});

$("#btn-alterar").addEventListener("click", async () => {
  $("#mensaje").value = `${$("#mensaje").value}·`;
  try {
    await verificar(true);
  } catch (error) {
    mostrarErrores("#errores-lab", error.errores);
  }
});

for (const boton of document.querySelectorAll("[data-vista]")) {
  boton.addEventListener("click", () => mostrar(boton.dataset.vista));
}

async function arranque() {
  try {
    sesion = await api("/api/sesion");
  } catch {
    sesion = { activa: false };
  }
  pintarSesion();
  mostrar("inicio");
  pintarRequisitos("");
}

arranque();
