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

### Fuentes y atribucion

- Los datos geograficos, municipales y de puntos de interes incluidos en `public/data/` se han preparado para esta aplicacion a partir de fuentes publicas y revision manual.
- Los resumenes, enlaces e imagenes de articulos se consultan desde Wikipedia cuando existe un articulo relacionado. Wikipedia y sus contenidos pertenecen a sus respectivos autores y se publican bajo sus propias licencias.
- Las noticias recientes se obtienen mediante Google News RSS. La aplicacion muestra titulares, fuente, fecha y enlace al medio original, sin copiar el contenido completo de los articulos.
- Los enlaces a ayuntamientos y sitios externos pertenecen a sus respectivos titulares.

Si reutilizas este proyecto, revisa tambien las condiciones de uso de las fuentes de datos y servicios externos que decidas mantener.

## Configuracion sensible

No subas archivos locales como `.env`, `.dev.vars`, `.wrangler/`, bases de datos SQLite locales, logs ni credenciales personales. Estos archivos deben permanecer fuera del repositorio.

## Aviso legal y privacidad

La version web incluye paginas informativas en:

- `/fuentes`
- `/privacidad`
- `/aviso-legal`

Estas paginas ofrecen un aviso basico sobre fuentes, privacidad, almacenamiento local, servicios externos y finalidad educativa. Antes de usar la aplicacion en un contexto real con alumnado o profesorado, adapta esos textos a tu caso concreto y a la normativa aplicable.

## Informacion para GitHub

Descripcion sugerida:

```text
Mapa interactivo educativo para aprender municipios y puntos geologicos de Canarias
```

Topics sugeridos:

```text
canarias, geography, education, map, cloudflare-workers, javascript
```

## Autoria

Proyecto creado originalmente por **Efren C. D.**

Si reutilizas, modificas o redistribuyes este proyecto, conserva la atribucion original segun los terminos de la licencia MIT.

## Licencia

Este proyecto esta publicado bajo licencia MIT. Consulta el archivo `LICENSE`.
