"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { directorioDatos } = require("./directorio");
const { leerParametros, presentar } = require("./dsa");

function archivoUsuarios() {
  return path.join(directorioDatos(), "usuarios.json");
}

function leerUsuarios() {
  const archivo = archivoUsuarios();
  if (!fs.existsSync(archivo)) return {};
  return JSON.parse(fs.readFileSync(archivo, "utf8"));
}

function guardarUsuarios(usuarios) {
  const archivo = archivoUsuarios();
  const temporal = `${archivo}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(usuarios, null, 2));
  fs.renameSync(temporal, archivo);
}

function idClave(correo) {
  return crypto.createHash("sha256").update(correo).digest("hex").slice(0, 32);
}

function archivoClave(correo) {
  return path.join(directorioDatos(), "claves", `${idClave(correo)}.json`);
}

function registrarUsuario({ nombre, correo, celular, clave }) {
  const usuarios = leerUsuarios();
  if (usuarios[correo]) {
    const error = new Error("El correo ya está registrado.");
    error.codigo = "existe";
    throw error;
  }

  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(clave, sal, 32);
  usuarios[correo] = {
    nombre,
    correo,
    celular,
    sal: sal.toString("hex"),
    clave: hash.toString("hex"),
    creado: new Date().toISOString(),
  };
  guardarUsuarios(usuarios);
  return { nombre, correo, celular };
}

function autenticar(correo, clave) {
  const usuario = leerUsuarios()[correo];
  const sal = usuario ? Buffer.from(usuario.sal, "hex") : Buffer.alloc(16, 7);
  const esperado = usuario ? Buffer.from(usuario.clave, "hex") : Buffer.alloc(32, 9);
  let calculado;
  try {
    calculado = crypto.scryptSync(clave, sal, 32);
  } catch {
    return null;
  }

  let coincide = false;
  try {
    coincide = crypto.timingSafeEqual(calculado, esperado);
  } catch {
    coincide = false;
  }
  if (!usuario || !coincide) return null;
  return { nombre: usuario.nombre, correo: usuario.correo, celular: usuario.celular };
}

function guardarPar(correo, par) {
  const registro = {
    publicaPem: par.publicaPem,
    privadaPem: par.privadaPem,
    creada: new Date().toISOString(),
    ultimaFirma: null,
  };
  const archivo = archivoClave(correo);
  const temporal = `${archivo}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(registro, null, 2));
  fs.renameSync(temporal, archivo);
}

function leerRegistroClave(correo) {
  const archivo = archivoClave(correo);
  if (!fs.existsSync(archivo)) return null;
  return JSON.parse(fs.readFileSync(archivo, "utf8"));
}

function guardarFirma(correo, firma) {
  const registro = leerRegistroClave(correo);
  if (!registro) {
    const error = new Error("No hay claves DSA para esta cuenta.");
    error.codigo = "sin-claves";
    throw error;
  }
  registro.ultimaFirma = firma;
  const archivo = archivoClave(correo);
  const temporal = `${archivo}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(registro, null, 2));
  fs.renameSync(temporal, archivo);
}

function vistaClaves(correo) {
  const registro = leerRegistroClave(correo);
  if (!registro) return null;
  return {
    parametros: presentar(leerParametros(registro.privadaPem), registro.publicaPem),
    creada: registro.creada,
    ultimaFirma: registro.ultimaFirma,
  };
}

module.exports = {
  registrarUsuario,
  autenticar,
  guardarPar,
  leerRegistroClave,
  guardarFirma,
  vistaClaves,
};
