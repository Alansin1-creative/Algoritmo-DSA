"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { directorioDatos } = require("./lib/directorio");
const { validarRegistro, validarAcceso, validarMensaje } = require("./lib/validacion");
const { generarParDeClaves, firmarMensaje, verificarFirma } = require("./lib/dsa");
const {
  registrarUsuario,
  autenticar,
  guardarPar,
  leerRegistroClave,
  guardarFirma,
  vistaClaves,
} = require("./lib/cuentas");

const PUERTO = Number(process.env.PORT) || 8080;
const PUBLICO = path.join(__dirname, "public");
const DOCUMENTO = path.join(__dirname, "docs", "MODULO_DSA.md");

function secreto() {
  const archivo = path.join(directorioDatos(), "secreto.key");
  if (!fs.existsSync(archivo)) fs.writeFileSync(archivo, crypto.randomBytes(32));
  return fs.readFileSync(archivo);
}

function enviarJson(res, estado, datos, cabeceras = {}) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(estado, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(cuerpo),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...cabeceras,
  });
  res.end(cuerpo);
}

function cookieSesion(token) {
  if (!token) return "sesion=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
  return `sesion=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`;
}

function crearToken(correo) {
  const cuerpo = Buffer.from(
    JSON.stringify({ correo, exp: Date.now() + 8 * 60 * 60 * 1000 })
  ).toString("base64url");
  const firma = crypto.createHmac("sha256", secreto()).update(cuerpo).digest("base64url");
  return `${cuerpo}.${firma}`;
}

function leerCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  for (const parte of header.split(";")) {
    const [nombre, ...resto] = parte.trim().split("=");
    if (!nombre) continue;
    cookies[nombre] = decodeURIComponent(resto.join("="));
  }
  return cookies;
}

function leerSesion(req) {
  const token = leerCookies(req).sesion;
  const punto = token ? token.lastIndexOf(".") : -1;
  if (!token || punto <= 0) return null;
  const cuerpo = token.slice(0, punto);
  const firma = token.slice(punto + 1);
  const esperada = crypto.createHmac("sha256", secreto()).update(cuerpo).digest("base64url");
  const recibida = Buffer.from(firma);
  const calculada = Buffer.from(esperada);
  if (recibida.length !== calculada.length || !crypto.timingSafeEqual(recibida, calculada)) {
    return null;
  }
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
    if (!datos.correo || datos.exp < Date.now()) return null;
    return datos;
  } catch {
    return null;
  }
}

function exigirUsuario(req, res) {
  const sesion = leerSesion(req);
  if (!sesion) {
    enviarJson(res, 401, { errores: ["Inicia sesión para usar el laboratorio DSA."] });
    return null;
  }
  const usuario = buscarPublico(sesion.correo);
  if (!usuario) {
    enviarJson(res, 401, { errores: ["La sesión ya no es válida. Vuelve a entrar."] });
    return null;
  }
  return usuario;
}

function buscarPublico(correo) {
  const archivo = path.join(directorioDatos(), "usuarios.json");
  if (!fs.existsSync(archivo)) return null;
  const usuarios = JSON.parse(fs.readFileSync(archivo, "utf8"));
  const usuario = usuarios[correo];
  if (!usuario) return null;
  return { nombre: usuario.nombre, correo: usuario.correo, celular: usuario.celular };
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    const trozos = [];
    let tamano = 0;
    req.on("data", (trozo) => {
      tamano += trozo.length;
      if (tamano > 1_000_000) {
        reject(new Error("cuerpo"));
        req.destroy();
        return;
      }
      trozos.push(trozo);
    });
    req.on("end", () => {
      if (trozos.length === 0) return resolve({});
      try {
        const datos = JSON.parse(Buffer.concat(trozos).toString("utf8"));
        if (!datos || typeof datos !== "object" || Array.isArray(datos)) return resolve({});
        resolve(datos);
      } catch {
        reject(new Error("json"));
      }
    });
    req.on("error", reject);
  });
}

function respuestaSesion(correo) {
  const usuario = buscarPublico(correo);
  if (!usuario) return null;
  let claves = null;
  try {
    claves = vistaClaves(correo);
  } catch {
    claves = null;
  }
  return {
    activa: true,
    nombre: usuario.nombre,
    correo: usuario.correo,
    celular: usuario.celular,
    claves,
  };
}

async function registrar(req, res) {
  const cuerpo = await leerCuerpo(req);
  const { errores, datos } = validarRegistro(cuerpo);
  if (errores.length) return enviarJson(res, 400, { errores });
  try {
    registrarUsuario(datos);
  } catch (error) {
    if (error.codigo === "existe") {
      return enviarJson(res, 409, { errores: ["Ese correo ya está registrado."] });
    }
    throw error;
  }
  const sesion = respuestaSesion(datos.correo);
  enviarJson(res, 201, sesion, { "Set-Cookie": cookieSesion(crearToken(datos.correo)) });
}

async function acceder(req, res) {
  const cuerpo = await leerCuerpo(req);
  const { errores, datos } = validarAcceso(cuerpo);
  if (errores.length) return enviarJson(res, 400, { errores });
  const usuario = autenticar(datos.correo, datos.clave);
  if (!usuario) {
    return enviarJson(res, 401, { errores: ["Correo o clave incorrectos."] });
  }
  enviarJson(res, 200, respuestaSesion(usuario.correo), {
    "Set-Cookie": cookieSesion(crearToken(usuario.correo)),
  });
}

function salir(res) {
  enviarJson(res, 200, { activa: false }, { "Set-Cookie": cookieSesion("") });
}

function sesion(req, res) {
  const activa = leerSesion(req);
  if (!activa) return enviarJson(res, 200, { activa: false });
  const datos = respuestaSesion(activa.correo);
  if (!datos) return enviarJson(res, 200, { activa: false });
  enviarJson(res, 200, datos);
}

function generar(req, res) {
  const usuario = exigirUsuario(req, res);
  if (!usuario) return;
  const par = generarParDeClaves();
  guardarPar(usuario.correo, par);
  enviarJson(res, 200, { parametros: par.parametros, creada: new Date().toISOString() });
}

async function firmar(req, res) {
  const usuario = exigirUsuario(req, res);
  if (!usuario) return;
  const cuerpo = await leerCuerpo(req);
  const errorMensaje = validarMensaje(cuerpo.mensaje);
  if (errorMensaje) return enviarJson(res, 400, { errores: [errorMensaje] });

  const registro = leerRegistroClave(usuario.correo);
  if (!registro) {
    return enviarJson(res, 400, { errores: ["Primero genera el par de claves DSA."] });
  }

  const firma = firmarMensaje(registro.privadaPem, cuerpo.mensaje);
  const ultimaFirma = {
    mensaje: cuerpo.mensaje,
    cuando: new Date().toISOString(),
    hashHex: firma.hashHex,
    firmaHex: firma.firmaHex,
    rHex: firma.rHex,
    sHex: firma.sHex,
    rBits: firma.rBits,
    sBits: firma.sBits,
    rangoValido: firma.rangoValido,
    bytesMensaje: firma.bytesMensaje,
  };
  guardarFirma(usuario.correo, ultimaFirma);
  enviarJson(res, 200, ultimaFirma);
}

async function verificar(req, res) {
  const usuario = exigirUsuario(req, res);
  if (!usuario) return;
  const cuerpo = await leerCuerpo(req);
  const registro = leerRegistroClave(usuario.correo);
  if (!registro || !registro.ultimaFirma) {
    return enviarJson(res, 400, { errores: ["Primero firma un mensaje."] });
  }
  if (typeof cuerpo.mensaje !== "string" || cuerpo.mensaje.trim() === "") {
    return enviarJson(res, 400, { errores: ["Escribe el mensaje que quieres verificar."] });
  }

  const valida = verificarFirma(
    registro.publicaPem,
    cuerpo.mensaje,
    registro.ultimaFirma.firmaHex
  );
  const hashMensaje = crypto.createHash("sha256").update(cuerpo.mensaje, "utf8").digest("hex");
  enviarJson(res, 200, {
    valida,
    hashMensaje,
    hashOriginal: registro.ultimaFirma.hashHex,
    mensajeOriginal: registro.ultimaFirma.mensaje,
  });
}

function documentacion(res) {
  const markdown = fs.readFileSync(DOCUMENTO, "utf8");
  enviarJson(res, 200, { markdown });
}

function descargarDocumentacion(res) {
  const markdown = fs.readFileSync(DOCUMENTO);
  res.writeHead(200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": "attachment; filename=\"Equipo2-Modulo-DSA.md\"",
    "Content-Length": markdown.length,
    "X-Content-Type-Options": "nosniff",
  });
  res.end(markdown);
}

function servirEstatico(res, url) {
  const mapa = {
    "/": "index.html",
    "/index.html": "index.html",
    "/estilos.css": "estilos.css",
    "/app.js": "app.js",
  };
  const nombre = mapa[url];
  if (!nombre) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("No encontrado");
    return;
  }
  const archivo = (url === "/" || url === "/index.html")
    ? path.join(__dirname, "index.html")
    : path.join(PUBLICO, nombre);
  const tipos = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
  };
  const cuerpo = fs.readFileSync(archivo);
  res.writeHead(200, {
    "Content-Type": tipos[path.extname(nombre)],
    "Content-Length": cuerpo.length,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(cuerpo);
}

const servidor = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  try {
    if (url === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "GET" && (url === "/" || url === "/index.html" || url === "/estilos.css" || url === "/app.js")) {
      return servirEstatico(res, url);
    }
    if (req.method === "GET" && url === "/docs/MODULO_DSA.md") return descargarDocumentacion(res);
    if (req.method === "GET" && url === "/api/salud") {
      return enviarJson(res, 200, { ok: true, algoritmo: "DSA", equipo: 2 });
    }
    if (req.method === "GET" && url === "/api/sesion") return sesion(req, res);
    if (req.method === "GET" && url === "/api/documentacion") return documentacion(res);
    if (req.method === "POST" && url === "/api/registro") return await registrar(req, res);
    if (req.method === "POST" && url === "/api/acceso") return await acceder(req, res);
    if (req.method === "POST" && url === "/api/salir") return salir(res);
    if (req.method === "POST" && url === "/api/claves") return generar(req, res);
    if (req.method === "POST" && url === "/api/firmar") return await firmar(req, res);
    if (req.method === "POST" && url === "/api/verificar") return await verificar(req, res);

    if (url.startsWith("/api/")) {
      return enviarJson(res, 404, { errores: ["Esa ruta no existe."] });
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("No encontrado");
  } catch (error) {
    if (error.message === "json" || error.message === "cuerpo") {
      return enviarJson(res, 400, { errores: ["La solicitud no tiene un JSON válido."] });
    }
    console.error(error);
    if (!res.headersSent) {
      enviarJson(res, 500, { errores: ["No se pudo completar la operación DSA."] });
    }
  }
});

if (require.main === module) {
  servidor.listen(PUERTO, "127.0.0.1", () => {
    console.log(`Sello DSA · Equipo 2`);
    console.log(`Abre http://127.0.0.1:${PUERTO}`);
  });
}

module.exports = { servidor };
