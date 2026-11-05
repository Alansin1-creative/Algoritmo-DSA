# Equipo 2 — Documentación del módulo DSA

Aplicación web Sello DSA. Esta es la documentación de las funciones que hacen la firma digital.

## 1. Qué módulo se usa

La firma no está programada a mano. La aplicación usa el módulo nativo `crypto` de Node.js, que trabaja con OpenSSL, y lo envuelve en `lib/dsa.js`.

Funciones propias:

- `generarParDeClaves()`
- `firmarMensaje(privadaPem, mensaje)`
- `verificarFirma(publicaPem, mensaje, firmaHex)`

Funciones de Node.js que esas tres llaman:

- `crypto.generateKeyPairSync(tipo, opciones)`
- `crypto.createSign(algoritmo)`
- `crypto.createVerify(algoritmo)`
- `crypto.createHash(algoritmo)`
- `crypto.createPrivateKey(pem)` y `crypto.createPublicKey(pem)`

La validación de la cuenta está aparte, en `lib/validacion.js`, función `validarRegistro(datos)`.

## 2. Por qué DSA

DSA significa Digital Signature Algorithm. Está definido en el estándar FIPS 186-4. Sirve para firmar, no para ocultar el contenido del mensaje.

Quien firma usa la clave privada. Quien comprueba usa la clave pública. Si el mensaje cambia, aunque sea en un carácter, la firma deja de coincidir.

FIPS 186-5 ya no aprueba DSA para generar firmas nuevas y recomienda RSA, ECDSA o EdDSA. Aquí se usa porque es el algoritmo asignado al equipo 2 y porque muestra el esquema clásico de firma basado en el logaritmo discreto.

Diffie-Hellman, DSA, RSA y ECC son esquemas de clave pública. Esta aplicación implementa solo DSA: generar el par, firmar y verificar.

## 3. generarParDeClaves

No recibe argumentos. Crea un par de 2048 bits.

```
crypto.generateKeyPairSync("dsa", {
  modulusLength: 2048,
  divisorLength: 256
})
```

- `modulusLength` es L, el tamaño del primo p. En esta app es 2048 bits.
- `divisorLength` es N, el tamaño del primo q. q divide a p − 1. En esta app es 256 bits.

La clave privada se exporta en PEM PKCS#8. La pública, en PEM SPKI. El identificador que viaja dentro de esas estructuras es el OID `1.2.840.10040.4.1` (id-dsa).

De esas estructuras el módulo lee cinco enteros:

- p: primo módulo
- q: primo del subgrupo
- g: generador
- x: clave privada, un entero entre 1 y q − 1
- y: clave pública

En el servidor se comprueba la relación:

y = g^x mod p

Si no se cumple, la clave se rechaza. El cálculo de esa potencia modular solo sirve para comprobar y mostrar los parámetros. La firma la calcula OpenSSL.

x no se envía al navegador. La respuesta solo lleva 8 dígitos hexadecimales del inicio y 8 del final, para demostrar que x existe y que se queda en el servidor. La PEM privada se guarda en `data/claves/` y tampoco sale en el JSON.

## 4. firmarMensaje

Recibe la PEM privada y el mensaje en texto. El mensaje se codifica en UTF-8, así que un acento sí cambia la firma.

Pasos de la función:

1. `crypto.createHash("sha256")` calcula el resumen que se muestra en pantalla. DSA no firma el texto tal cual: usa un entero sacado de ese resumen.
2. `crypto.createSign("SHA256")` recibe los mismos bytes, se cierra y firma con la clave privada.
3. La firma viene en DER: una SEQUENCE de dos INTEGER, r y s.

Con un número aleatorio k que elige OpenSSL, y que la aplicación ni ve ni guarda:

r = (g^k mod p) mod q

s = k^(−1) × (z + x·r) mod q

z es el entero del resumen SHA-256. Como q mide 256 bits y SHA-256 también, entra el resumen completo.

La función comprueba que r y s estén entre 1 y q − 1.

Reutilizar k con la misma clave privada permitiría calcular x. Por eso cada firma lleva un k nuevo, generado por OpenSSL, y k no aparece en la interfaz.

## 5. verificarFirma

Recibe la PEM pública, el mensaje y la firma en hexadecimal.

```
const verificador = crypto.createVerify("SHA256");
verificador.update(bytesDelMensaje);
verificador.end();
verificador.verify(clavePublica, firma);
```

Devuelve verdadero o falso. Si el mensaje fue alterado, Node responde `false`; no hace falta atrapar una excepción para ese caso.

La comprobación reconstruye un valor v con la clave pública, el resumen y la pareja (r, s). La firma solo es válida si v = r. Al cambiar un carácter cambia el resumen, y v ya no coincide con r.

## 6. Dónde se llaman

- `POST /api/claves` llama a `generarParDeClaves()` y guarda el par.
- `POST /api/firmar` llama a `firmarMensaje()`.
- `POST /api/verificar` llama a `verificarFirma()` con la última firma guardada de esa cuenta.

El navegador pide la operación. El módulo `crypto` la ejecuta en el servidor.

## 7. Validación de la cuenta

Módulo `lib/validacion.js`. Función `validarRegistro(datos)`.

El registro se rechaza si pasa cualquiera de estos casos:

- El nombre está vacío.
- El correo está vacío o no tiene forma de correo.
- El celular está vacío o, ya sin espacios ni guiones, no tiene exactamente 10 dígitos.
- La clave está vacía, tiene menos de 10 caracteres, no tiene letras, no tiene un número o no tiene un carácter especial.

Un carácter especial es cualquiera que no sea letra ni dígito. `Equipo2-DSA` cumple: tiene letras, el número 2 y el guion.

`validarAcceso(datos)` exige correo y clave para entrar. Si no coinciden con la cuenta, la respuesta es «Correo o clave incorrectos.»

La clave de acceso se guarda con `crypto.scryptSync`. No se guarda en claro y no es la clave privada x. Son dos secretos distintos: la clave de acceso abre la sesión; x crea los sellos.

## 8. Cómo comprobar el módulo

En la carpeta del proyecto:

```
node comprobar.js
```

Ese archivo prueba las reglas de la cuenta, genera un par DSA real, firma un mensaje, verifica la firma y comprueba que el mensaje alterado sea rechazado.

## 9. Referencias

- NIST FIPS 186-4, Digital Signature Standard (DSS): https://csrc.nist.gov/pubs/fips/186-4/final
- Node.js, módulo Crypto: https://nodejs.org/api/crypto.html
- OID id-dsa: 1.2.840.10040.4.1
