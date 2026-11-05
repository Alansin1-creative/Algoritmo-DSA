"use strict";

/**
 * Reglas de la cuenta del Equipo 2.
 * La misma lista vive en public/app.js para la ayuda visual del formulario.
 * El servidor es quien decide si el registro se acepta.
 */

const CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function normalizarNombre(nombre) {
  if (typeof nombre !== "string") return "";
  return nombre.trim().replace(/\s+/g, " ");
}

function normalizarCorreo(correo) {
  if (typeof correo !== "string") return "";
  return correo.trim().toLowerCase();
}

function normalizarCelular(celular) {
  if (typeof celular === "number" && Number.isFinite(celular)) {
    return String(Math.trunc(celular));
  }
  if (typeof celular !== "string") return "";
  return celular.replace(/[\s-]/g, "").trim();
}

function validarClave(clave) {
  if (typeof clave !== "string" || clave.length === 0) {
    return ["La clave de acceso no puede estar vacía."];
  }

  const errores = [];
  if (clave.length < 10) errores.push("La clave debe tener al menos 10 caracteres.");
  if (clave.length > 128) errores.push("La clave es demasiado larga.");
  if (!/\p{L}/u.test(clave)) errores.push("La clave debe contener letras.");
  if (!/\d/.test(clave)) errores.push("La clave debe contener al menos un número.");
  if (!/[^A-Za-z0-9]/.test(clave)) {
    errores.push("La clave debe contener al menos un carácter especial.");
  }
  return errores;
}

function validarRegistro(entrada) {
  const datosEntrada = entrada && typeof entrada === "object" ? entrada : {};
  const nombre = normalizarNombre(datosEntrada.nombre);
  const correo = normalizarCorreo(datosEntrada.correo);
  const celular = normalizarCelular(datosEntrada.celular);
  const clave = typeof datosEntrada.clave === "string" ? datosEntrada.clave : "";
  const errores = [];

  if (!nombre) errores.push("El nombre no puede estar vacío.");
  else if (nombre.length > 80) errores.push("El nombre es demasiado largo.");
  else if (/[\u0000-\u001F]/.test(nombre)) {
    errores.push("El nombre tiene caracteres no permitidos.");
  }

  if (!correo) errores.push("El correo electrónico no puede estar vacío.");
  else if (!CORREO.test(correo)) errores.push("El correo electrónico no es válido.");

  const celularOriginal = datosEntrada.celular;
  const celularVacio =
    celularOriginal === undefined ||
    celularOriginal === null ||
    (typeof celularOriginal === "string" && celularOriginal.trim() === "");
  if (celularVacio) errores.push("El número de celular no puede estar vacío.");
  else if (!/^\d{10}$/.test(celular)) {
    errores.push("El celular debe tener exactamente 10 dígitos.");
  }

  errores.push(...validarClave(clave));
  return { errores, datos: { nombre, correo, celular, clave } };
}

function validarAcceso(entrada) {
  const datosEntrada = entrada && typeof entrada === "object" ? entrada : {};
  const correo = normalizarCorreo(datosEntrada.correo);
  const clave = typeof datosEntrada.clave === "string" ? datosEntrada.clave : "";
  const errores = [];

  if (!correo) errores.push("El correo electrónico no puede estar vacío.");
  else if (!CORREO.test(correo)) errores.push("El correo electrónico no es válido.");
  if (!clave) errores.push("La clave de acceso no puede estar vacía.");

  return { errores, datos: { correo, clave } };
}

function validarMensaje(mensaje) {
  if (typeof mensaje !== "string" || mensaje.trim() === "") {
    return "Escribe un mensaje para firmar.";
  }
  if (mensaje.length > 4000) return "El mensaje supera los 4000 caracteres.";
  if (Buffer.byteLength(mensaje, "utf8") > 12000) {
    return "El mensaje es demasiado largo.";
  }
  return "";
}

module.exports = {
  validarRegistro,
  validarAcceso,
  validarClave,
  validarMensaje,
  normalizarCorreo,
};
