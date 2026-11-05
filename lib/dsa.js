"use strict";

/**
 * Firma digital DSA del Equipo 2.
 *
 * El cálculo de la firma lo hace el módulo nativo `crypto` de Node.js
 * (OpenSSL). Este archivo prepara las claves, lee p, q, g, x, y y
 * comprueba la relación pública y = g^x mod p.
 *
 * Documentación para la clase: docs/MODULO_DSA.md
 */

const crypto = require("crypto");

const OID_DSA = "2a8648ce380401";

function leerTlv(buf, i) {
  if (i >= buf.length) throw new Error("Estructura DER incompleta.");
  const etiqueta = buf[i++];
  let longitud = buf[i++];
  if (longitud & 0x80) {
    const octetos = longitud & 0x7f;
    if (octetos === 0 || octetos > 4) throw new Error("Longitud DER no válida.");
    longitud = 0;
    for (let k = 0; k < octetos; k++) longitud = longitud * 256 + buf[i++];
  }
  const fin = i + longitud;
  if (fin > buf.length) throw new Error("Estructura DER truncada.");
  return { etiqueta, contenido: buf.subarray(i, fin), siguiente: fin };
}

function parsear(buf, i = 0) {
  const tlv = leerTlv(buf, i);
  if (tlv.etiqueta === 0x30) {
    const lista = [];
    let cursor = 0;
    while (cursor < tlv.contenido.length) {
      const hijo = parsear(tlv.contenido, cursor);
      lista.push(hijo.valor);
      cursor = hijo.siguiente;
    }
    return { valor: lista, siguiente: tlv.siguiente };
  }
  if (tlv.etiqueta === 0x02) {
    return { valor: enteroPositivo(tlv.contenido), siguiente: tlv.siguiente };
  }
  if (tlv.etiqueta === 0x06) {
    return { valor: tlv.contenido.toString("hex"), siguiente: tlv.siguiente };
  }
  return { valor: tlv.contenido, siguiente: tlv.siguiente };
}

function enteroPositivo(buf) {
  let bytes = buf;
  if (bytes.length > 1 && bytes[0] === 0x00) bytes = bytes.subarray(1);
  if (bytes.length === 0 || (bytes.length === 1 && bytes[0] === 0x00)) {
    return { n: 0n, hex: "00", bits: 0 };
  }
  const hex = bytes.toString("hex");
  const n = BigInt(`0x${hex}`);
  return { n, hex, bits: n.toString(2).length };
}

function modPow(base, exponente, modulo) {
  if (modulo === 1n) return 0n;
  let resultado = 1n;
  let b = ((base % modulo) + modulo) % modulo;
  let e = exponente;
  while (e > 0n) {
    if (e & 1n) resultado = (resultado * b) % modulo;
    e >>= 1n;
    b = (b * b) % modulo;
  }
  return resultado;
}

function leerParametros(privadaPem) {
  const privada = crypto.createPrivateKey(privadaPem);
  const der = privada.export({ type: "pkcs8", format: "der" });
  const raiz = parsear(der).valor;
  if (!Array.isArray(raiz) || raiz.length < 3) {
    throw new Error("La clave privada no tiene formato PKCS#8.");
  }

  const algoritmo = raiz[1];
  const octeto = raiz[2];
  if (!Array.isArray(algoritmo) || algoritmo[0] !== OID_DSA) {
    throw new Error("La clave no es DSA (OID 1.2.840.10040.4.1).");
  }

  const [p, q, g] = algoritmo[1];
  if (!Buffer.isBuffer(octeto)) throw new Error("Falta el entero privado x.");
  const x = parsear(octeto).valor;

  const publica = crypto.createPublicKey(privada);
  const spki = publica.export({ type: "spki", format: "der" });
  const arbolPublico = parsear(spki).valor;
  const bit = arbolPublico[1];
  if (!Buffer.isBuffer(bit) || bit[0] !== 0) {
    throw new Error("La clave pública no trae el entero y.");
  }
  const y = parsear(bit.subarray(1)).valor;
  const yCalculada = modPow(g.n, x.n, p.n);
  if (yCalculada !== y.n) {
    throw new Error("La clave pública no cumple y = g^x mod p.");
  }

  return {
    p,
    q,
    g,
    x,
    y,
    bitsModulo: privada.asymmetricKeyDetails.modulusLength,
    bitsSubgrupo: privada.asymmetricKeyDetails.divisorLength,
    huella: crypto.createHash("sha256").update(spki).digest("hex"),
  };
}

function presentar(parametros, publicaPem) {
  const { x } = parametros;
  return {
    algoritmo: "DSA",
    estandar: "FIPS 186-4",
    oid: "1.2.840.10040.4.1",
    hash: "SHA-256",
    bitsModulo: parametros.bitsModulo,
    bitsSubgrupo: parametros.bitsSubgrupo,
    pHex: parametros.p.hex,
    qHex: parametros.q.hex,
    gHex: parametros.g.hex,
    yHex: parametros.y.hex,
    pBits: parametros.p.bits,
    qBits: parametros.q.bits,
    gBits: parametros.g.bits,
    yBits: parametros.y.bits,
    xBits: x.bits,
    xMuestra: `${x.hex.slice(0, 8)}…${x.hex.slice(-8)}`,
    huella: parametros.huella,
    publicaPem,
    relacionComprobada: true,
  };
}

function leerFirma(buf) {
  const secuencia = parsear(buf).valor;
  if (!Array.isArray(secuencia) || secuencia.length !== 2) {
    throw new Error("La firma no es una pareja (r, s).");
  }
  return { r: secuencia[0], s: secuencia[1] };
}

/**
 * Genera un par DSA de 2048 bits. La PEM privada vuelve al servidor
 * para guardarla; no debe enviarse al navegador.
 */
function generarParDeClaves() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("dsa", {
    modulusLength: 2048,
    divisorLength: 256,
  });
  const privadaPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const publicaPem = publicKey.export({ type: "spki", format: "pem" });
  const parametros = presentar(leerParametros(privadaPem), publicaPem);
  return { privadaPem, publicaPem, parametros };
}

/**
 * Firma `mensaje` con SHA-256 y la clave privada DSA.
 * OpenSSL elige el nonce k. La app no lo recibe.
 */
function firmarMensaje(privadaPem, mensaje) {
  const datos = Buffer.from(mensaje, "utf8");
  const { q } = leerParametros(privadaPem);
  const clave = crypto.createPrivateKey(privadaPem);
  const hashHex = crypto.createHash("sha256").update(datos).digest("hex");

  const firmador = crypto.createSign("SHA256");
  firmador.update(datos);
  firmador.end();
  const firma = firmador.sign(clave);
  const { r, s } = leerFirma(firma);

  return {
    hashHex,
    firmaHex: firma.toString("hex"),
    rHex: r.hex,
    sHex: s.hex,
    rBits: r.bits,
    sBits: s.bits,
    rangoValido: r.n > 0n && s.n > 0n && r.n < q.n && s.n < q.n,
    bytesMensaje: datos.length,
  };
}

/**
 * Devuelve true solo si la firma corresponde a ese mensaje y a esa clave pública.
 * Un mensaje distinto produce false. No revela la clave privada.
 */
function verificarFirma(publicaPem, mensaje, firmaHex) {
  if (typeof firmaHex !== "string" || firmaHex.length === 0 || firmaHex.length % 2 !== 0) {
    return false;
  }
  if (!/^[0-9a-f]+$/i.test(firmaHex)) return false;

  try {
    const verificador = crypto.createVerify("SHA256");
    verificador.update(Buffer.from(mensaje, "utf8"));
    verificador.end();
    return verificador.verify(
      crypto.createPublicKey(publicaPem),
      Buffer.from(firmaHex, "hex")
    );
  } catch {
    return false;
  }
}

module.exports = {
  generarParDeClaves,
  firmarMensaje,
  verificarFirma,
  leerParametros,
  presentar,
};
