# Sello DSA · Equipo 2

Aplicación web de firma digital con DSA (FIPS 186-4). El módulo que hace la firma es `lib/dsa.js`, apoyado en el módulo nativo `crypto` de Node.js.

## Arrancar

```
node server.js
```

Abre http://127.0.0.1:8080

En Windows también puedes usar `run.bat`.

## Qué subir

- Esta carpeta, que es la aplicación.
- `docs/MODULO_DSA.md`, que es la documentación de las funciones. También se descarga desde la pestaña Documentación.

## Comprobar

```
node comprobar.js
```

Genera un par real, firma, verifica y prueba las reglas de la cuenta.

## Cuenta de ejemplo

- Nombre: Mariana Solís
- Correo: equipo2@sello-dsa.dev
- Celular: 5512345678
- Clave: Equipo2-DSA

La clave de acceso abre la sesión. La clave privada `x` de DSA se queda en el servidor, dentro de `data/`, y no se envía al navegador.
