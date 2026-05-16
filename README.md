# GeoLearn Canarias

GeoLearn Canarias es una aplicacion web educativa para aprender los municipios y puntos de interes geologicos de las Islas Canarias mediante un mapa interactivo.

## Caracteristicas

- Modo aprendizaje con informacion de municipios y puntos geologicos.
- Modo juego con rondas de preguntas sobre municipios, puntos geologicos o ambos.
- Selector por islas y por tipo de contenido.
- Mapa interactivo con zoom, desplazamiento y adaptacion a movil, tablet y escritorio.
- Informacion municipal con poblacion, enlace al ayuntamiento, extractos de Wikipedia y noticias recientes.
- Informacion de puntos geologicos con extractos de Wikipedia cuando estan disponibles.
- Despliegue preparado para Cloudflare Workers y Cloudflare D1.

## Tecnologias

- JavaScript, HTML y CSS sin framework frontend.
- Cloudflare Workers.
- Cloudflare D1.
- Wrangler.

## Instalacion

```bash
npm install
```

## Desarrollo local

```bash
npm run dev
```

La aplicacion estara disponible normalmente en:

```text
http://localhost:8787
```

Para probar desde otro dispositivo en la misma red local, arranca Wrangler escuchando en todas las interfaces:

```bash
npm run dev -- --ip 0.0.0.0
```

## Base de datos

El proyecto usa Cloudflare D1.

Para inicializar la base de datos local:

```bash
npm run db:local
```

Para produccion, crea tu propia base de datos D1 y actualiza el `database_id` en `wrangler-canarias.toml`.

## Despliegue

```bash
npm run deploy
```

## Datos

Los datos geograficos y municipales incluidos en `public/data/` se usan para representar los municipios y puntos de interes geologicos de Canarias.

## Configuracion sensible

No subas archivos locales como `.env`, `.dev.vars`, `.wrangler/`, bases de datos SQLite locales, logs ni credenciales personales. Estos archivos deben permanecer fuera del repositorio.

## Autoria

Proyecto creado originalmente por **Efren C. D.**

Si reutilizas, modificas o redistribuyes este proyecto, conserva la atribucion original segun los terminos de la licencia MIT.

## Licencia

Este proyecto esta publicado bajo licencia MIT. Consulta el archivo `LICENSE`.
