# GeoLearn Canarias

GeoLearn Canarias es una aplicación web educativa para aprender los municipios y puntos de interés geológicos de las Islas Canarias mediante un mapa interactivo.

## Características

- Modo aprendizaje con información de municipios y puntos geológicos.
- Modo juego con rondas de preguntas sobre municipios, puntos geológicos o ambos.
- Selector por islas y por tipo de contenido.
- Mapa interactivo con zoom, desplazamiento y adaptación a móvil, tablet y escritorio.
- Información municipal con población, enlace al ayuntamiento, extractos de Wikipedia y noticias recientes.
- Información de puntos geológicos con extractos de Wikipedia cuando están disponibles.
- Despliegue preparado para Cloudflare Workers y Cloudflare D1.

## Tecnologías

- JavaScript, HTML y CSS sin framework frontend.
- Cloudflare Workers.
- Cloudflare D1.
- Wrangler.

## Instalación

```bash
npm install
```

## Desarrollo local

```bash
npm run dev
```

La aplicación estará disponible normalmente en:

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

Para producción, crea tu propia base de datos D1 y actualiza el `database_id` en `wrangler-canarias.toml`.

## Despliegue

```bash
npm run deploy
```

## Datos

Los datos geográficos y municipales incluidos en `public/data/` se usan para representar los municipios y puntos de interés geológicos de Canarias.

### Fuentes y atribución

- Los datos geográficos, municipales y de puntos de interés incluidos en `public/data/` se han preparado para esta aplicación a partir de fuentes públicas y revisión manual.
- Los resúmenes, enlaces e imágenes de artículos se consultan desde Wikipedia cuando existe un artículo relacionado. Wikipedia y sus contenidos pertenecen a sus respectivos autores y se publican bajo sus propias licencias.
- Las noticias recientes se obtienen mediante Google News RSS. La aplicación muestra titulares, fuente, fecha y enlace al medio original, sin copiar el contenido completo de los artículos.
- Los enlaces a ayuntamientos y sitios externos pertenecen a sus respectivos titulares.

Si reutilizas este proyecto, revisa también las condiciones de uso de las fuentes de datos y servicios externos que decidas mantener.

## Configuración sensible

No subas archivos locales como `.env`, `.dev.vars`, `.wrangler/`, bases de datos SQLite locales, logs ni credenciales personales. Estos archivos deben permanecer fuera del repositorio.

## Aviso legal y privacidad

La versión web incluye páginas informativas en:

- `/fuentes`
- `/privacidad`
- `/aviso-legal`

Estas páginas ofrecen un aviso básico sobre fuentes, privacidad, almacenamiento local, servicios externos y finalidad educativa. Antes de usar la aplicación en un contexto real con alumnado o profesorado, adapta esos textos a tu caso concreto y a la normativa aplicable.

## Información para GitHub

Descripción sugerida:

```text
Mapa interactivo educativo para aprender municipios y puntos geológicos de Canarias
```

Topics sugeridos:

```text
canarias, geography, education, map, cloudflare-workers, javascript
```

## Autoría

Proyecto creado originalmente por **Efrén C. D.**

Si reutilizas, modificas o redistribuyes este proyecto, conserva la atribución original según los términos de la licencia MIT.

## Licencia

Este proyecto está publicado bajo licencia MIT. Consulta el archivo `LICENSE`.
