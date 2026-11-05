"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "sello-dsa-"));

const { validarRegistro, validarAcceso } = require("./lib/validacion");
const { generarParDeClaves, firmarMensaje, verificarFirma } = require("./lib/dsa");
const { registrarUsuario, autenticar } = require("./lib/cuentas");
const { servidor } = require("./server");

const fallos = [];

function probar(nombre, condicion) {
  if (condicion) {
    console.log(`  ok  ${nombre}`);
    return;
  }
  fallos.push(nombre);
  console.log(`  FALLO  ${nombre}`);
}

function contiene(errores, fragmento) {
  return errores.some((texto) => texto.includes(fragmento));
}

async function main() {
  console.log("Validación de la cuenta");
  const vacio = validarRegistro({});
  probar("rechaza nombre vacío", contiene(vacio.errores, "nombre"));
  probar("rechaza correo vacío", contiene(vacio.errores, "correo"));
  probar("rechaza celular vacío", contiene(vacio.errores, "celular"));
  probar("rechaza clave vacía", contiene(vacio.errores, "clave"));

  const correoMalo = validarRegistro({
    nombre: "Ana",
    correo: "ana-sin-dominio",
    celular: "5512345678",
    clave: "Equipo2-DSA",
  });
  probar("rechaza correo inválido", contiene(correoMalo.errores, "no es válido"));

  const celularCorto = validarRegistro({
    nombre: "Ana",
    correo: "ana@equipo2.dev",
    celular: "551234567",
    clave: "Equipo2-DSA",
  });
  probar("rechaza celular de 9 dígitos", contiene(celularCorto.errores, "10 dígitos"));

  const sinNumero = validarRegistro({
    nombre: "Ana",
    correo: "ana@equipo2.dev",
    celular: "5512345678",
    clave: "clavecorte!",
  });
  probar("rechaza clave sin número", contiene(sinNumero.errores, "número"));

  const sinEspecial = validarRegistro({
    nombre: "Ana",
    correo: "ana@equipo2.dev",
    celular: "5512345678",
    clave: "claveclave1",
  });
  probar("rechaza clave sin carácter especial", contiene(sinEspecial.errores, "especial"));

  const sinLetra = validarRegistro({
    nombre: "Ana",
    correo: "ana@equipo2.dev",
    celular: "5512345678",
    clave: "1234567890!",
  });
  probar("rechaza clave sin letras", contiene(sinLetra.errores, "letras"));

  const corta = validarRegistro({
    nombre: "Ana",
    correo: "ana@equipo2.dev",
    celular: "5512345678",
    clave: "Ab1!",
  });
  probar("rechaza clave de menos de 10", contiene(corta.errores, "10 caracteres"));

  const buena = validarRegistro({
    nombre: "  Mariana   Solís ",
    correo: " Equipo2@Sello-DSA.dev ",
    celular: "55 1234-5678",
    clave: "Equipo2-DSA",
  });
  probar("acepta el ejemplo del equipo", buena.errores.length === 0);
  probar("normaliza el correo", buena.datos.correo === "equipo2@sello-dsa.dev");
  probar("normaliza el celular a 10 dígitos", buena.datos.celular === "5512345678");

  const accesoVacio = validarAcceso({ correo: "", clave: "" });
  probar("el acceso exige correo y clave", accesoVacio.errores.length === 2);

  console.log("Cuentas");
  registrarUsuario({ ...buena.datos, correo: "ana@equipo2.dev" });
  probar("entra con la clave correcta", autenticar("ana@equipo2.dev", buena.datos.clave) !== null);
  probar("rechaza una clave distinta", autenticar("ana@equipo2.dev", "Equipo2-DSA!") === null);

  console.log("DSA");
  const par = generarParDeClaves();
  probar("p mide 2048 bits", par.parametros.pBits === 2048);
  probar("q mide 256 bits", par.parametros.qBits === 256);
  probar("y = g^x mod p", par.parametros.relacionComprobada === true);
  probar("el OID es el de DSA", par.parametros.oid === "1.2.840.10040.4.1");
  probar("la respuesta pública no trae la PEM privada", !JSON.stringify(par.parametros).includes("PRIVATE KEY"));

  const mensaje = "El equipo 2 entrega el acta firmada con DSA. Ciudad de México.";
  const firma = firmarMensaje(par.privadaPem, mensaje);
  probar("r y s caen en el rango", firma.rangoValido === true);
  probar("la firma original es válida", verificarFirma(par.publicaPem, mensaje, firma.firmaHex) === true);
  probar(
    "el mensaje alterado es inválido",
    verificarFirma(par.publicaPem, `${mensaje}·`, firma.firmaHex) === false
  );
  probar(
    "un acento distinto también es inválido",
    verificarFirma(par.publicaPem, "Ciudad de Mexico.", firma.firmaHex) === false
  );

  console.log("Servidor");
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const salud = await fetch(`${base}/api/salud`);
  probar("el servicio responde DSA", (await salud.json()).algoritmo === "DSA");

  const rechazado = await fetch(`${base}/api/registro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre: "", correo: "mal", celular: "123", clave: "abc" }),
  });
  probar("el registro vacío no entra", rechazado.status === 400);

  const creado = await fetch(`${base}/api/registro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: "Mariana Solís",
      correo: "equipo2@sello-dsa.dev",
      celular: "5512345678",
      clave: "Equipo2-DSA",
    }),
  });
  const cookie = (creado.headers.getSetCookie?.() || []).map((valor) => valor.split(";")[0]).join("; ");
  probar("el ejemplo crea la sesión", creado.status === 201 && cookie.includes("sesion="));

  const claves = await fetch(`${base}/api/claves`, { method: "POST", headers: { Cookie: cookie } });
  const cuerpoClaves = await claves.json();
  const serializado = JSON.stringify(cuerpoClaves);
  probar("genera claves por la API", claves.status === 200 && cuerpoClaves.parametros.pBits === 2048);
  probar("la API no entrega la clave privada", !serializado.includes("PRIVATE KEY") && !serializado.includes(par.privadaPem));

  const firmado = await fetch(`${base}/api/firmar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ mensaje }),
  });
  probar("firma por la API", firmado.status === 200);

  const visto = await fetch(`${base}/api/verificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ mensaje }),
  });
  probar("verifica el mismo mensaje", (await visto.json()).valida === true);

  const roto = await fetch(`${base}/api/verificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ mensaje: `${mensaje}·` }),
  });
  probar("rechaza el mensaje alterado por la API", (await roto.json()).valida === false);

  const sinSesion = await fetch(`${base}/api/claves`, { method: "POST" });
  probar("sin sesión no genera claves", sinSesion.status === 401);

  servidor.close();
  if (fallos.length) {
    console.log(`\n${fallos.length} prueba(s) fallaron.`);
    process.exit(1);
  }
  console.log("\nTodas las pruebas pasaron.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
